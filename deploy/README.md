# Operação da API

O repositório `paulo-unibra/yt-without-ad` publica a API da pasta `backend`.
O aplicativo Expo é compilado e distribuído separadamente.

## Serviço e ambiente

O serviço `yt-without-ad.service` executa com o usuário `yt-api`, Node.js 24,
Python 3 e `yt-dlp`. Escuta apenas `127.0.0.1:3011`; Apache encaminha o endereço
`https://youtubeapi.bibliafoco.com.br`. A configuração fica em `/etc/yt-without-ad/backend.env`:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3011
TRUST_PROXY=1
DATABASE_PATH=/var/lib/yt-without-ad/library.sqlite
```

O banco e os backups ficam fora das pastas de versões. Não altere os bancos,
certificados ou serviços das outras aplicações presentes neste servidor.
`dividasapi.bibliafoco.com.br` atende a API de dívidas e permanece separado do YT.

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

## Biblioteca compartilhada, sem login

O app usa uma biblioteca única em `shared_library_documents`, sem usuário,
conta, token ou vínculo com a instalação. A API permite ler e atualizar essa
biblioteca sem autenticação, conforme o uso com um único usuário. Outra
instalação abre os mesmos títulos, playlists, favoritos e históricos ao conectar.

Os documentos são `playlists`, `favorites`, `saved_videos`, `watch_history`,
`search_history` e o índice antigo `downloaded_videos`, mantido para compatibilidade.
O catálogo `saved_videos` reúne os vídeos de playlists, favoritos e downloads.
Salvar em uma playlist ou nos favoritos também atualiza esse catálogo na mesma
transação. Remover o download local não apaga o título salvo no servidor.

Na primeira inicialização desta versão, uma migração transacional reúne as
bibliotecas antigas por instalação, preserva os vídeos sem duplicação por ID e
mantém a tabela antiga como arquivo. A migração executa uma vez; reiniciar o
serviço não restaura itens removidos depois dela. Revisões continuam impedindo
que gravações antigas substituam dados mais recentes.

O app mostra **Vídeos salvos** na tela inicial. Após reinstalar, basta ter
internet para recuperar a lista. Os arquivos de áudio permanecem somente no
aparelho e precisam ser baixados novamente. O índice de arquivos disponíveis
fica exclusivamente no AsyncStorage local `@device_downloads_v2`; não é enviado
como uma lista global de arquivos presentes. Isso impede que um aparelho vazio
apague os registros do servidor durante a restauração.

**Baixar todos os áudios** inicia uma fila sequencial, pula os arquivos já
presentes e mostra progresso, falhas e cancelamento. A fila continua durante a
navegação no app, exige mantê-lo aberto e não reinicia sozinha após encerrar o
processo. Tentar novamente pula os arquivos concluídos. O bloqueio do YouTube
no IP do servidor ainda pode impedir as transferências.

## Logs, saúde e backup

```bash
systemctl status yt-without-ad.service
journalctl -u yt-without-ad.service -f
curl --fail http://127.0.0.1:3011/
systemctl list-timers yt-without-ad-backup.timer
systemctl start yt-without-ad-backup.service
```

O timer executa backup diário às 00:20 de Recife (03:20 UTC), verifica a integridade e retém sete
cópias em `/var/lib/yt-without-ad/backups`. Essas cópias estão no mesmo servidor.
Para restaurar: pare o serviço, preserve uma cópia do banco atual e seus arquivos
`-wal`/`-shm`, substitua o banco por um backup verificado com dono `yt-api` e
permissão `600`, remova apenas os sidecars antigos já preservados e inicie o serviço.

O HTTPS termina no Apache em `youtubeapi.bibliafoco.com.br`, com certificado
Let's Encrypt e renovação automática via `certbot.timer`. Os VirtualHosts estão
versionados em `deploy/youtubeapi-http.conf` e `deploy/youtubeapi-ssl.conf`.
O HTTP redireciona para HTTPS, exceto o caminho ACME em `/var/www/yt-acme`.
O certificado é solicitado com `certbot certonly --webroot -w /var/www/yt-acme
-d youtubeapi.bibliafoco.com.br --non-interactive`. O hook exclusivo
`/etc/letsencrypt/renewal-hooks/deploy/yt-apache-reload` valida e recarrega o
Apache quando esse certificado é renovado. Os VirtualHosts são instalados
administrativamente; o deploy da API não os modifica.

No app, `.env.production` define `EXPO_PUBLIC_BACKEND_URL` com a URL HTTPS de produção.
Em desenvolvimento, `.env.local` pode selecionar a mesma URL ou o backend local. Configure
`EXPO_PUBLIC_YOUTUBE_API_KEY` com a chave da YouTube Data API. A chave do YouTube
é pública no bundle Expo: restrinja seu uso no Google Cloud. Recompile builds
nativos para incluir `expo-crypto` e `expo-secure-store`.

## Extração do YouTube no servidor

O teste real de extração no IP `146.190.138.248` recebeu uma exigência de login e
verificação antibot do YouTube. O deploy, o HTTPS e o banco não removem essa
restrição. Os logs da API registram a causa; downloads ainda dependem de uma
solução para esse bloqueio. O player incorporado permanece como alternativa
para reprodução.
