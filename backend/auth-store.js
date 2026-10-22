const { randomBytes, scrypt: derive, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(derive);
const digest = token => createHash('sha256').update(token).digest('hex');
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('Use uma senha de 12 a 128 caracteres.');
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, options);
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, hash] = encoded.split(':');
  const key = await scrypt(password, salt, 64, options);
  const expected = Buffer.from(hash, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
class AuthStore {
  constructor(db) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS auth_users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','member')), must_change INTEGER NOT NULL DEFAULT 1,
      disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL,
      csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      actor INTEGER, action TEXT NOT NULL, ip TEXT NOT NULL, target TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS authorized_ips (ip TEXT PRIMARY KEY);`);
  }
  audit(actor, action, ip, target = '') {
    this.db.prepare('DELETE FROM audit_events WHERE id <= (SELECT MAX(id)-100000 FROM audit_events)').run();
    this.db.prepare('INSERT INTO audit_events(actor, action, ip, target) VALUES(?,?,?,?)').run(actor ?? null, action, ip, String(target).slice(0, 200));
  }
  async createUser(email, password, role = 'member') {
    email = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !['admin','member'].includes(role)) throw new Error('Usuário inválido.');
    const hash = await hashPassword(password);
    return Number(this.db.prepare('INSERT INTO auth_users(email,password_hash,role) VALUES(?,?,?)').run(email, hash, role).lastInsertRowid);
  }
  session(userId, kind) {
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    const expires = Date.now() + (kind === 'admin' ? 8 * 3600000 : 7 * 86400000);
    this.db.prepare('DELETE FROM auth_sessions WHERE expires < ?').run(Date.now());
    this.db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,?)').run(digest(token), userId, kind, csrf, expires);
    return { token, csrf, expires };
  }
  authenticate(token, kind) {
    if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return null;
    return this.db.prepare(`SELECT u.id,u.email,u.role,u.must_change,s.csrf,s.expires
      FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.kind=? AND s.expires>? AND u.disabled=0`).get(digest(token), kind, Date.now()) || null;
  }
  revoke(token) { this.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(digest(token)); }
  async changePassword(userId, current, password) {
    const user = this.db.prepare('SELECT * FROM auth_users WHERE id=? AND disabled=0').get(userId);
    if (!user || !await verifyPassword(current, user.password_hash)) throw new Error('Senha atual incorreta.');
    if (await verifyPassword(password, user.password_hash)) throw new Error('Escolha uma senha diferente.');
    const hash = await hashPassword(password);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE auth_users SET password_hash=?,must_change=0 WHERE id=?').run(hash, userId);
      this.db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(userId);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
module.exports = { AuthStore, hashPassword, verifyPassword };
