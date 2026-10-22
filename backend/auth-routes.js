const express = require('express');
const { isIP } = require('node:net');
const { verifyPassword } = require('./auth-store');
const { rateLimit } = require('./rate-limit');
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
function createAuthRoutes(store, origin) {
  const router = express.Router();
  const db = store.db;
  const cookie = '__Host-yt-admin';
  const tokenOf = req => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookie+'='))?.slice(cookie.length+1);
  const setCookie = (res, token, age = 28800) => res.setHeader('Set-Cookie', `${cookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`);
  const page = (res, title, body) => res.type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · YT Admin</title><link rel="stylesheet" href="/admin/style.css"><main><h1>${escape(title)}</h1>${body}</main></html>`);
  const input = (name, label, type='text') => `<label>${label}<input name="${name}" type="${type}" required maxlength="${type==='password'?128:254}" autocomplete="${type==='password'?'current-password':'off'}"></label>`;
  const form = (action, csrf, body, label) => `<form method="post" action="${action}"><input type="hidden" name="csrf" value="${escape(csrf)}">${body}<button>${label}</button></form>`;
  const csrf = req => req.user?.csrf;
  router.use((req,res,next) => {
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
    next();
  });
  router.get('/admin/style.css', (req,res) => res.type('css').send('body{margin:0;background:#0f0f0f;color:#fff;font:16px system-ui}main{max-width:1000px;margin:auto;padding:24px}label{display:block;margin:16px 0}input,select,button{font:inherit;padding:12px;border-radius:6px;border:1px solid #777;background:#222;color:white;max-width:100%;box-sizing:border-box}input{display:block;width:100%;margin-top:8px}button{cursor:pointer;min-height:48px}form{margin:20px 0}section{border-top:1px solid #555;margin-top:32px;padding-top:16px}a{color:#a7d7ff}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:12px;border-bottom:1px solid #555;overflow-wrap:anywhere}.table{overflow:auto}p{line-height:1.6}'));
  router.use(['/admin','/auth'],express.urlencoded({extended:false,limit:'8kb'}));
  router.use(['/admin','/auth'],express.json({limit:'8kb'}));
  router.use(['/admin','/auth'],rateLimit({limit:60}));
  // Browser mutations must come from this site; mobile uses bearer tokens.
  // Sec-Fetch-Site is set by the browser and scripts cannot forge it, so it is the primary
  // signal. Origin alone fails here: a navigation POST reports `Origin: null` whenever the
  // page carries a restrictive Referrer-Policy, which blocked every admin form submission.
  // Clients without Sec-Fetch-Site (non-browser) still have to present the exact Origin.
  const sameOrigin = req => {
    const site = req.get('Sec-Fetch-Site');
    return site ? site === 'same-origin' : req.get('Origin') === origin;
  };
  router.use('/admin',(req,res,next) => {
    if(req.method==='POST' && !sameOrigin(req)) return res.status(403).send('Origem não autorizada.');
    const ips = db.prepare('SELECT ip FROM authorized_ips').all();
    if(ips.length && !ips.some(row=>row.ip===req.ip)) return res.status(403).send('IP não autorizado para o painel.');
    next();
  });
  router.get('/admin/login',(req,res)=>page(res,'Entrar no admin',form('/admin/login','',input('email','E-mail','email')+input('password','Senha','password'),'Entrar')));
  let hashing = false;
  const login = wrap(async(req,res) => {
    const admin = req.path.startsWith('/admin');
    if(hashing) return res.status(429).send('Aguarde e tente novamente.');
    hashing=true;
    try {
      const email = typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'';
      const user=db.prepare('SELECT * FROM auth_users WHERE email=?').get(email);
      const fallback = db.prepare('SELECT password_hash FROM auth_users LIMIT 1').get()?.password_hash;
      const valid = fallback && await verifyPassword(req.body.password,user?.password_hash || fallback);
      if(!valid || !user || user.disabled || (admin && user.role!=='admin')) {
        store.audit(null,'login_denied',req.ip);
        return res.status(401).send(admin?'Credenciais inválidas.':{error:'Credenciais inválidas.'});
      }
      const session=store.session(user.id,admin?'admin':'app');
      store.audit(user.id,'login',req.ip,admin?'admin':'app');
      if(admin) {setCookie(res,session.token); return res.redirect(303,user.must_change?'/admin/password':'/admin');}
      res.json({token:session.token,expires:session.expires,mustChange:!!user.must_change,email:user.email});
    } finally {hashing=false;}
  });
  router.post(['/admin/login','/auth/login'],rateLimit({limit:5,windowMs:900000}),login);
  router.use('/admin',(req,res,next)=>{
    req.user=store.authenticate(tokenOf(req),'admin');
    if(!req.user || req.user.role!=='admin') return res.redirect(303,'/admin/login');
    if(req.method==='POST' && req.body.csrf!==csrf(req)) return res.status(403).send('Formulário expirado.');
    if(req.user.must_change && !['/password','/logout'].includes(req.path)) return res.redirect(303,'/admin/password');
    next();
  });
  router.get('/admin/password',(req,res)=>page(res,'Alterar senha',`<p>Troque a senha temporária antes de continuar. Use de 12 a 128 caracteres.</p>${form('/admin/password',csrf(req),input('current','Senha atual','password')+input('password','Nova senha','password'),'Salvar nova senha')}`));
  router.post('/admin/password',wrap(async(req,res)=>{await store.changePassword(req.user.id,req.body.current,req.body.password);store.audit(req.user.id,'password_changed',req.ip);setCookie(res,'',0);res.redirect(303,'/admin/login');}));
  router.post('/admin/logout',(req,res)=>{store.revoke(tokenOf(req));setCookie(res,'',0);res.redirect(303,'/admin/login');});
  router.get('/admin',(req,res)=>{
    const users=db.prepare('SELECT id,email,role,disabled FROM auth_users ORDER BY id').all();
    const logs=db.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT 100').all();
    const ips=db.prepare('SELECT ip FROM authorized_ips').all();
    page(res,'Administração',`<p>${escape(req.user.email)} · IP atual: ${escape(req.ip)}</p><a href="/admin/password">Alterar senha</a>${form('/admin/logout',csrf(req),'','Sair')}<section><h2>Usuários</h2>${form('/admin/users',csrf(req),input('email','E-mail','email')+input('password','Senha temporária (mínimo 12 caracteres)','password')+'<label>Perfil<select name="role"><option value="member">Aplicativo</option><option value="admin">Administrador</option></select></label>','Criar usuário')}${users.map(u=>`<p>${escape(u.email)} · ${escape(u.role)} · ${u.disabled?'Bloqueado':'Ativo'}</p>${u.id===req.user.id?'':form('/admin/users/toggle',csrf(req),`<input type="hidden" name="id" value="${u.id}">`,u.disabled?'Reativar':'Bloquear e encerrar sessões')}`).join('')}</section><section><h2>IPs autorizados no admin</h2><p>Lista vazia permite login de qualquer IP. A primeira inclusão deve ser seu IP atual. Esta lista protege o painel; o app sempre exige credencial.</p>${form('/admin/ips',csrf(req),input('ip','Endereço IPv4 ou IPv6'),'Autorizar IP')}${ips.map(i=>form('/admin/ips/remove',csrf(req),`<input type="hidden" name="ip" value="${escape(i.ip)}"><p>${escape(i.ip)}</p>`,'Remover IP')).join('')}</section><section><h2>Auditoria · últimos 100 eventos</h2><div class="table"><table><tr><th>Data UTC</th><th>Usuário</th><th>Ação</th><th>IP</th><th>Alvo</th></tr>${logs.map(l=>`<tr>${[l.created_at,l.actor,l.action,l.ip,l.target].map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</table></div></section>`);
  });
  router.post('/admin/users',wrap(async(req,res)=>{const id=await store.createUser(req.body.email,req.body.password,req.body.role);store.audit(req.user.id,'user_created',req.ip,id);res.redirect(303,'/admin');}));
  router.post('/admin/users/toggle',(req,res)=>{
    const id=Number(req.body.id);if(!Number.isSafeInteger(id)||id===req.user.id) return res.status(400).send('Usuário inválido.');
    db.prepare('UPDATE auth_users SET disabled=1-disabled WHERE id=?').run(id);
    db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(id);store.audit(req.user.id,'user_toggled',req.ip,id);res.redirect(303,'/admin');
  });
  router.post('/admin/ips',(req,res)=>{
    const ip=req.body.ip;if(typeof ip!=='string'||!isIP(ip)) return res.status(400).send('IP inválido.');
    if(!db.prepare('SELECT 1 FROM authorized_ips LIMIT 1').get() && ip!==req.ip) return res.status(400).send('Autorize primeiro seu IP atual.');
    db.prepare('INSERT OR IGNORE INTO authorized_ips VALUES(?)').run(ip);store.audit(req.user.id,'ip_allowed',req.ip,ip);res.redirect(303,'/admin');
  });
  router.post('/admin/ips/remove',(req,res)=>{
    if(req.body.ip===req.ip && db.prepare('SELECT COUNT(*) AS n FROM authorized_ips').get().n>1) return res.status(400).send('Não remova seu IP enquanto houver outras restrições.');
    db.prepare('DELETE FROM authorized_ips WHERE ip=?').run(String(req.body.ip));store.audit(req.user.id,'ip_removed',req.ip,req.body.ip);res.redirect(303,'/admin');
  });
  const bearer = req => req.get('Authorization')?.match(/^Bearer ([\w-]{43})$/)?.[1];
  router.use('/auth',(req,res,next)=>{req.user=store.authenticate(bearer(req),'app');if(!req.user)return res.status(401).json({error:'Faça login.'});next();});
  router.get('/auth/me',(req,res)=>res.json({email:req.user.email,mustChange:!!req.user.must_change}));
  router.post('/auth/logout',(req,res)=>{store.revoke(bearer(req));res.json({ok:true});});
  router.post('/auth/password',rateLimit({limit:5,windowMs:900000}),wrap(async(req,res)=>{await store.changePassword(req.user.id,req.body.current,req.body.password);store.audit(req.user.id,'password_changed',req.ip);res.json({ok:true});}));
  function requireApi(req,res,next) {
    req.user=store.authenticate(bearer(req),'app');
    if(!req.user) return res.status(401).json({error:'Faça login.'});
    if(req.user.must_change) return res.status(403).json({error:'Altere sua senha temporária.',code:'PASSWORD_CHANGE_REQUIRED'});
    res.once('finish',()=>{if(req.method!=='GET'||res.statusCode>=400) store.audit(req.user.id,`api_${req.method}_${res.statusCode}`,req.ip,req.path);});
    next();
  }
  // Erros de preenchimento voltam legíveis para quem enviou o formulário; o resto segue
  // para o tratamento genérico, que não revela detalhes internos.
  router.use((error,req,res,next) => {
    if(res.headersSent || !error.expose) return next(error);
    const status = error.status || 400;
    if(!req.path.startsWith('/admin')) return res.status(status).json({error:error.message});
    const back = req.path==='/admin/password' ? '/admin/password' : '/admin';
    res.status(status);
    page(res,'Não foi possível salvar',`<p>${escape(error.message)}</p><p><a href="${back}">Voltar e tentar novamente</a></p>`);
  });
  return {router,requireApi};
}
module.exports={createAuthRoutes};
