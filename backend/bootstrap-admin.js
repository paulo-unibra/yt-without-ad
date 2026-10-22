// Execute uma vez, fornecendo JSON {email,password} pela entrada padrão.
// Não inclui credenciais no código, argumentos do processo ou logs.
const { readFileSync } = require('node:fs');
const { randomBytes, scryptSync } = require('node:crypto');
const { LibraryDatabase } = require('./library-database');
const { AuthStore } = require('./auth-store');
const database = new LibraryDatabase(process.env.DATABASE_PATH);
try {
 new AuthStore(database.db);
 if(database.db.prepare('SELECT 1 FROM auth_users LIMIT 1').get()) throw new Error('Inicialização já realizada.');
 const {email,password}=JSON.parse(readFileSync(0,'utf8'));
 if(typeof email!=='string'||!email.includes('@')||typeof password!=='string'||password.length<8||password.length>128) throw new Error('Credenciais inválidas.');
 const salt=randomBytes(16).toString('hex');
 const hash=scryptSync(password,salt,64,{N:32768,r:8,p:3,maxmem:67108864}).toString('hex');
 database.db.prepare("INSERT INTO auth_users(email,password_hash,role,must_change) VALUES(?,?,'admin',1)").run(email.trim().toLowerCase(),`${salt}:${hash}`);
 console.log('Administrador inicial criado com troca obrigatória.');
} finally { database.close(); }
