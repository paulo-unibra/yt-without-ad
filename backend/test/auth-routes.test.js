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
// Navegadores enviam `Origin: null` em POST de navegação quando a página tem Referrer-Policy
// restritiva, então o painel precisa aceitar Sec-Fetch-Site e recusar envios de outros sites.
test('formulário do admin aceita envio do próprio site e recusa origem externa', async () => {
 const database=new LibraryDatabase(':memory:');const store=new AuthStore(database.db);
 await store.createUser('admin@example.test','temporary password 123','admin');
 const server=createApp({database,authStore:store}).listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 const submit=headers=>fetch(base+'/admin/login',{method:'POST',redirect:'manual',
  headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},
  body:new URLSearchParams({email:'admin@example.test',password:'temporary password 123'})});
 try {
  const form=await fetch(base+'/admin/login');
  assert.equal(form.headers.get('referrer-policy'),'same-origin');
  // Envio real do navegador: Origin vira `null`, mas Sec-Fetch-Site comprova o mesmo site.
  const browser=await submit({Origin:'null','Sec-Fetch-Site':'same-origin','Sec-Fetch-Mode':'navigate'});
  assert.equal(browser.status,303);assert.equal(browser.headers.get('location'),'/admin/password');
  // Outro site não passa, mesmo forjando o cabeçalho Origin esperado.
  const cross=await submit({Origin:'https://youtubeapi.bibliafoco.com.br','Sec-Fetch-Site':'cross-site'});
  assert.equal(cross.status,403);
  // Cliente sem Sec-Fetch-Site continua obrigado a apresentar a origem exata.
  assert.equal((await submit({})).status,403);
  assert.equal((await submit({Origin:'https://outro.example'})).status,403);
 } finally {server.closeAllConnections();await new Promise(r=>server.close(r));database.close();}
});
// A auditoria precisa mostrar o que aconteceu, não só que algo falhou.
test('auditoria registra toda chamada da API com detalhe e o motivo real', async () => {
 const database=new LibraryDatabase(':memory:');const store=new AuthStore(database.db);
 const member=await store.createUser('member@example.test','temporary password 123');
 database.db.prepare('UPDATE auth_users SET must_change=0 WHERE id=?').run(member);
 const bruto='ERROR: [youtube] aqz-KE-bpKQ: Sign in to confirm you’re not a bot. Use --cookies-from-browser';
 const blocked=Object.assign(new Error('O YouTube exigiu verificação de conta para este servidor.'),
  {code:'EXTRACTION_BLOCKED',detail:bruto});
 const server=createApp({database,authStore:store,getVideoInfo:async()=>{throw blocked;}}).listen(0,'127.0.0.1');
 await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 const headers={Authorization:`Bearer ${store.session(member,'app').token}`};
 const rows=()=>database.db.prepare('SELECT action,target FROM audit_events ORDER BY id').all();
 try {
  assert.equal((await fetch(base+'/api/library/saved_videos',{headers})).status,200);
  const sucesso=rows().at(-1);
  // O GET bem-sucedido agora deixa rastro e fica atribuído ao usuário.
  assert.equal(sucesso.action,'api_GET_200');
  assert.match(sucesso.target,/^\/api\/library\/saved_videos · 200 · \d+ms$/);
  assert.equal((await fetch(base+'/api/stream/aqz-KE-bpKQ',{headers})).status,503);
  const bloqueio=rows().at(-1);
  assert.equal(bloqueio.action,'api_GET_503');
  assert.match(bloqueio.target,/EXTRACTION_BLOCKED/);
  assert.match(bloqueio.target,/Sign in to confirm/); // a mensagem real, não a amigável
  assert.equal((await fetch(base+'/api/library/inexistente',{headers})).status,404);
  assert.match(rows().at(-1).target,/Coleção não encontrada/);
  // Toda chamada ficou atribuída ao usuário autenticado.
  assert.equal(database.db.prepare('SELECT COUNT(*) n FROM audit_events WHERE actor=?').get(member).n,rows().length);
 } finally {server.closeAllConnections();await new Promise(r=>server.close(r));database.close();}
});
// Sem isto, qualquer recusa de validação virava um JSON genérico de erro 500 na tela.
test('recusas de preenchimento explicam o motivo em vez de falha genérica', async () => {
 const database=new LibraryDatabase(':memory:');const store=new AuthStore(database.db);
 const id=await store.createUser('admin@example.test','temporary password 123','admin');
 const member=await store.createUser('member@example.test','temporary password 123');
 database.db.prepare('UPDATE auth_users SET must_change=0 WHERE id=?').run(id);
 const server=createApp({database,authStore:store}).listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 const session=store.session(id,'admin');
 const send=(path,body)=>fetch(base+path,{method:'POST',redirect:'manual',
  headers:{'Content-Type':'application/x-www-form-urlencoded','Sec-Fetch-Site':'same-origin',
   Cookie:`__Host-yt-admin=${session.token}`},
  body:new URLSearchParams({csrf:session.csrf,...body})});
 const expect=async(response,pattern)=>{assert.equal(response.status,400);assert.match(await response.text(),pattern);};
 try {
  await expect(await send('/admin/password',{current:'temporary password 123',password:'curta'}),/Use uma senha de 12 a 128 caracteres/);
  await expect(await send('/admin/password',{current:'senha que nao confere',password:'brand new password 789'}),/Senha atual incorreta/);
  await expect(await send('/admin/password',{current:'temporary password 123',password:'temporary password 123'}),/Escolha uma senha diferente/);
  await expect(await send('/admin/users',{email:'member@example.test',password:'another password 456',role:'member'}),/já está cadastrado/);
  await expect(await send('/admin/users',{email:'sem-arroba',password:'another password 456',role:'member'}),/Usuário inválido/);
  // O aplicativo recebe o mesmo motivo em JSON.
  const app=store.session(member,'app');
  const json=await fetch(base+'/auth/password',{method:'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${app.token}`},
   body:JSON.stringify({current:'temporary password 123',password:'curta'})});
  assert.equal(json.status,400);
  assert.deepEqual(await json.json(),{error:'Use uma senha de 12 a 128 caracteres.'});
  // A senha continua intacta após todas as recusas.
  assert.equal(database.db.prepare('SELECT must_change FROM auth_users WHERE id=?').get(member).must_change,1);
 } finally {server.closeAllConnections();await new Promise(r=>server.close(r));database.close();}
});
