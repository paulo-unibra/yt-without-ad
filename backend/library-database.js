const { DatabaseSync, backup } = require('node:sqlite');
const { createHash } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const { dirname } = require('node:path');

const KEYS = new Set(['playlists', 'favorites', 'downloaded_videos', 'watch_history', 'search_history']);
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
      CREATE TABLE IF NOT EXISTS library_documents (
        owner_hash TEXT NOT NULL, document_key TEXT NOT NULL,
        value TEXT NOT NULL CHECK(json_valid(value)), revision INTEGER NOT NULL CHECK(revision > 0),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(owner_hash, document_key)
      ); PRAGMA user_version=1;`);
    this.select = this.db.prepare('SELECT value, revision FROM library_documents WHERE owner_hash=? AND document_key=?');
    this.insert = this.db.prepare('INSERT OR IGNORE INTO library_documents(owner_hash, document_key, value, revision) VALUES(?, ?, ?, 1)');
    this.update = this.db.prepare('UPDATE library_documents SET value=?, revision=revision+1, updated_at=CURRENT_TIMESTAMP WHERE owner_hash=? AND document_key=? AND revision=?');
  }
  owner(token) { return createHash('sha256').update(token).digest('hex'); }
  get(token, key) {
    const row = this.select.get(this.owner(token), key);
    return row ? { value: JSON.parse(row.value), revision: row.revision } : { value: null, revision: 0 };
  }
  put(token, key, value, revision) {
    const owner = this.owner(token), raw = JSON.stringify(value);
    const result = revision === 0 ? this.insert.run(owner, key, raw) : this.update.run(raw, owner, key, revision);
    return result.changes === 1 ? { value, revision: revision + 1 } : null;
  }
  async backup(filename) { await backup(this.db, filename); }
  close() { this.db.close(); }
}

module.exports = { LibraryDatabase, KEYS, validDocument };
