const { DatabaseSync, backup } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const { dirname } = require('node:path');

const { mergeDocument, mergeVideos, catalogVideos } = require('./shared-library');
const KEYS = new Set(['playlists', 'favorites', 'downloaded_videos', 'watch_history', 'search_history', 'saved_videos']);
const videoFields = ['id', 'title', 'description', 'thumbnail', 'channelTitle', 'channelId', 'publishedAt'];
function validVideo(video) {
  return video && videoFields.every(key => typeof video[key] === 'string')
    && /^[\w-]{11}$/.test(video.id) && video.title.length <= 2000;
}
function validDocument(key, value) {
  if (!KEYS.has(key) || !Array.isArray(value) || value.length > 5000) return false;
  if (key === 'search_history') return value.length <= 20 && value.every(item => typeof item === 'string' && item.length <= 500);
  if (key === 'playlists') return value.length <= 500 && new Set(value.map(item => item?.id)).size === value.length
    && value.every(item => item && typeof item.id === 'string' && /^[\w-]{1,100}$/.test(item.id)
      && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 60
      && typeof item.createdAt === 'string' && Array.isArray(item.videos) && item.videos.length <= 5000
      && item.videos.every(validVideo) && new Set(item.videos.map(video => video.id)).size === item.videos.length);
  if (!value.every(validVideo) || new Set(value.map(item => item.id)).size !== value.length) return false;
  if (key === 'downloaded_videos') return value.every(item => typeof item.localUri === 'string'
    && typeof item.downloadedAt === 'string' && Number.isSafeInteger(item.fileSize) && item.fileSize > 0);
  return key !== 'watch_history' || value.length <= 50;
}

class LibraryDatabase {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA max_page_count=65536;
      CREATE TABLE IF NOT EXISTS shared_library_documents (
        document_key TEXT PRIMARY KEY,
        value TEXT NOT NULL CHECK(json_valid(value)), revision INTEGER NOT NULL CHECK(revision > 0),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ); CREATE TABLE IF NOT EXISTS library_migrations (name TEXT PRIMARY KEY);`);
    this.select = this.db.prepare('SELECT value, revision FROM shared_library_documents WHERE document_key=?');
    this.insert = this.db.prepare('INSERT OR IGNORE INTO shared_library_documents(document_key, value, revision) VALUES(?, ?, 1)');
    this.update = this.db.prepare('UPDATE shared_library_documents SET value=?, revision=revision+1, updated_at=CURRENT_TIMESTAMP WHERE document_key=? AND revision=?');
    try { this.migrateLegacy(); } catch (error) { this.db.close(); throw error; }
  }
  migrateLegacy() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.db.prepare("SELECT 1 FROM library_migrations WHERE name='shared-library-v1'").get()) {
        const legacyExists = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='library_documents'").get();
        const documents = new Map();
        if (legacyExists) for (const row of this.db.prepare('SELECT document_key, value FROM library_documents ORDER BY updated_at, rowid').all()) {
          const value = JSON.parse(row.value);
          if (!validDocument(row.document_key, value)) throw new Error('Biblioteca antiga inválida; migração cancelada sem apagar dados.');
          documents.set(row.document_key, mergeDocument(row.document_key, documents.get(row.document_key), value));
        }
        let catalog = this.get('saved_videos').value || [];
        for (const [key, value] of documents) {
          this.insert.run(key, JSON.stringify(value));
          catalog = mergeVideos(catalog, catalogVideos(key, value));
        }
        if (catalog.length) this.insert.run('saved_videos', JSON.stringify(catalog));
        this.db.prepare("INSERT INTO library_migrations(name) VALUES('shared-library-v1')").run();
      }
      this.db.exec('PRAGMA user_version=2; COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get(key) {
    const row = this.select.get(key);
    return row ? { value: JSON.parse(row.value), revision: row.revision } : { value: null, revision: 0 };
  }
  put(key, value, revision) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const raw = JSON.stringify(value);
      const result = revision === 0 ? this.insert.run(key, raw) : this.update.run(raw, key, revision);
      if (result.changes !== 1) { this.db.exec('ROLLBACK'); return null; }
      if (key !== 'saved_videos') {
        const videos = catalogVideos(key, value);
        if (videos.length) {
          const catalog = this.get('saved_videos');
          const updated = mergeVideos(catalog.value || [], videos);
          if (updated.length > 5000) throw new Error('Limite de vídeos salvos atingido.');
          if (catalog.revision === 0) this.insert.run('saved_videos', JSON.stringify(updated));
          else this.update.run(JSON.stringify(updated), 'saved_videos', catalog.revision);
        }
      }
      this.db.exec('COMMIT');
      return { value, revision: revision + 1 };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async backup(filename) { await backup(this.db, filename); }
  close() { this.db.close(); }
}

module.exports = { LibraryDatabase, KEYS, validDocument };
