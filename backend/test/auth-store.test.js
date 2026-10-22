const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { AuthStore, verifyPassword } = require('../auth-store');
test('senha protegida, isolamento de sessão e revogação após troca obrigatória', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = new AuthStore(db);
    const id = await store.createUser('admin@example.test', 'temporary password 123', 'admin');
    const user = db.prepare('SELECT * FROM auth_users').get();
    assert.notEqual(user.password_hash, 'temporary password 123');
    assert.equal(await verifyPassword('incorrect', user.password_hash), false);
    const session = store.session(id, 'admin');
    assert.equal(store.authenticate(session.token, 'admin').must_change, 1);
    assert.equal(store.authenticate(session.token, 'app'), null);
    await assert.rejects(store.changePassword(id, 'wrong', 'replacement password 456'));
    await store.changePassword(id, 'temporary password 123', 'replacement password 456');
    assert.equal(store.authenticate(session.token, 'admin'), null);
    const next = store.session(id, 'app');
    assert.equal(store.authenticate(next.token, 'app').must_change, 0);
    db.prepare('UPDATE auth_users SET disabled=1 WHERE id=?').run(id);
    assert.equal(store.authenticate(next.token, 'app'), null);
  } finally { db.close(); }
});
