const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { LibraryDatabase } = require('../library-database');
const { AuthStore } = require('../auth-store');
const { createApp } = require('../server');
test('rotas protegidas, troca obrigatória, CSRF, papéis e revogação', async () => {
 const database=new LibraryDatabase(':memory:');const store=new AuthStore(database.db);
 await store.createUser('admin@example.test','temporary password 123','admin');
 await store.createUser('member@example.test','temporary password 123');
 const server=createApp({database,authStore:store}).listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),redirect:'manual'});
 try {
  assert.equal((await fetch(base+'/api/library/saved_videos')).status,401);
  assert.equal((await fetch(base+'/api/stream/abcdefghijk')).status,401);
  assert.equal((await post('/admin/login',{email:'admin@example.test',password:'temporary password 123'})).status,403);
  const origin={Origin:'https://youtubeapi.bibliafoco.com.br'};
  const admin=await post('/admin/login',{email:'admin@example.test',password:'temporary password 123'},origin);
  assert.equal(admin.status,303);assert.equal(admin.headers.get('location'),'/admin/password');
  const cookie=admin.headers.get('set-cookie').split(';')[0];
  assert.match(admin.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await fetch(base+'/admin',{headers:{Cookie:cookie},redirect:'manual'})).headers.get('location'),'/admin/password');
  assert.equal((await post('/admin/users',{email:'bad@example.test'}, {...origin,Cookie:cookie})).status,403);
  const login=await post('/auth/login',{email:'member@example.test',password:'temporary password 123'});
  const data=await login.json();assert.equal(data.mustChange,true);
  const headers={Authorization:`Bearer ${data.token}`};
  assert.equal((await fetch(base+'/api/library/saved_videos',{headers})).status,403);
  assert.equal((await post('/auth/password',{current:'temporary password 123',password:'replacement password 456'},headers)).status,200);
  assert.equal((await fetch(base+'/auth/me',{headers})).status,401);
  const next=await (await post('/auth/login',{email:'member@example.test',password:'replacement password 456'})).json();
  const authorized={Authorization:`Bearer ${next.token}`};
  assert.equal((await fetch(base+'/api/library/saved_videos',{headers:authorized})).status,200);
  assert.equal((await post('/admin/login',{email:'member@example.test',password:'replacement password 456'},origin)).status,401);
  await post('/auth/logout',{},authorized);
  assert.equal((await fetch(base+'/api/library/saved_videos',{headers:authorized})).status,401);
 } finally {server.closeAllConnections();await new Promise(r=>server.close(r));database.close();}
});
