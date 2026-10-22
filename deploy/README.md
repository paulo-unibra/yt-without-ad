# Operação da API

O repositório `paulo-unibra/yt-without-ad` publica a API da pasta `backend`.
O aplicativo Expo é compilado e distribuído separadamente.

## Serviço e ambiente

O serviço `yt-without-ad.service` executa com o usuário `yt-api`, Node.js 24,
Python 3 e `yt-dlp`. Escuta apenas `127.0.0.1:3011`; Apache encaminha o endereço
público escolhido. A configuração fica em `/etc/yt-without-ad/backend.env`:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3011
TRUST_PROXY=1
DATABASE_PATH=/var/lib/yt-without-ad/library.sqlite
```

O banco e os backups ficam fora das pastas de versões. Não altere os bancos,
certificados ou serviços das outras aplicações presentes neste servidor.
`dividasapi.bibliafoco.com.br` já atende uma API de dívidas; usar esse domínio
para o YT exige uma decisão explícita sobre nova rota ou substituição.

## Deploy automático

Cada push em `main` executa tipos, lint, testes e exportação web no GitHub
Actions. Se passar, o job `deploy` usa os secrets `DEPLOY_SSH_KEY` e
`DEPLOY_KNOWN_HOSTS` para acessar o usuário `yt-deploy` no servidor.
A chave SSH aceita somente o comando forçado `/usr/local/bin/yt-without-ad-deploy`
e um SHA de commit; não permite encaminhamento de portas nem shell interativo.
Esse usuário pode reiniciar somente `yt-without-ad.service` via sudo.

O script baixa o commit validado do repositório público, instala as dependências,
troca o link `/opt/yt-without-ad/current` e verifica a saúde da API. Se falhar,
restaura a versão anterior. Até três versões recentes são mantidas, além da
versão anterior usada na última publicação. Não há migrações destrutivas no deploy.
Alterações nos arquivos de systemd e no script de deploy exigem reinstalação
administrativa; um push atualiza apenas o código da aplicação.

Para provisionar um servidor, revise e execute `sudo bash deploy/install.sh`,
instale a chave pública exclusiva em `/var/lib/yt-deploy/.ssh/authorized_keys`
com `restrict,command="/usr/local/bin/yt-without-ad-deploy"` e configure os secrets.
O servidor exige Node.js 24, npm, Python 3, curl, tar, sudo e systemd instalados.

## Banco e identificação

A API guarda os documentos `playlists`, `favorites`, `downloaded_videos`,
`watch_history` e `search_history` em SQLite com WAL e revisões para impedir que
uma cópia antiga apague dados novos. Cada instalação cria um token aleatório de
256 bits. O banco guarda somente seu hash; o token fica no SecureStore nativo
ou no armazenamento da origem web. Requests usam `Authorization: Bearer TOKEN`.
Não coloque esse token em `.env`, URLs ou logs.

Ainda não existe login de conta ou sincronização entre aparelhos. Outra
instalação recebe uma biblioteca independente; a perda do token impede acessar
a biblioteca antiga. Os arquivos de áudio permanecem no aparelho; o banco
guarda seus dados e a referência local, sem transferir arquivos de mídia para o disco do servidor.

O app migra os registros antigos do AsyncStorage ao conectar e preserva a cópia
antiga. Leituras offline usam o cache. Novas alterações precisam da confirmação
do banco; falhas não são apresentadas como um salvamento concluído.

## Logs, saúde e backup

```bash
systemctl status yt-without-ad.service
journalctl -u yt-without-ad.service -f
curl --fail http://127.0.0.1:3011/
systemctl list-timers yt-without-ad-backup.timer
systemctl start yt-without-ad-backup.service
```

O timer executa backup diário às 03:20 UTC, verifica a integridade e retém sete
cópias em `/var/lib/yt-without-ad/backups`. Essas cópias estão no mesmo servidor.
Para restaurar: pare o serviço, preserve uma cópia do banco atual e seus arquivos
`-wal`/`-shm`, substitua o banco por um backup verificado com dono `yt-api` e
permissão `600`, remova apenas os sidecars antigos já preservados e inicie o serviço.

O HTTPS deve ser terminado no Apache com certificado Let's Encrypt válido e
renovação via `certbot.timer`. A configuração pública depende do domínio/rota
escolhido; verifique a API existente antes de alterar um VirtualHost.

No app, defina `EXPO_PUBLIC_BACKEND_URL` com a URL HTTPS final e
`EXPO_PUBLIC_YOUTUBE_API_KEY` com a chave da YouTube Data API. A chave do YouTube
é pública no bundle Expo: restrinja seu uso no Google Cloud. Recompile builds
nativos para incluir `expo-crypto` e `expo-secure-store`.
