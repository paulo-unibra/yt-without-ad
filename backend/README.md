# YT Stream Backend

Backend para obter streams com áudio e vídeo e persistir a biblioteca do app. Usa `yt-dlp`, instalado na
pasta `node_modules` por `youtube-dl-exec`; não usa o `yt-dlp` global da máquina.

## Iniciar

Requisitos: Node.js 22.13+ e Python 3.10+. A instalação baixa o binário do
`yt-dlp` do GitHub, portanto requer conexão com a internet.

Na raiz do projeto:

```bash
nvm use
./start-backend.sh
```

O script funciona a partir de qualquer diretório e instala as dependências caso
estejam ausentes ou desatualizadas. Para instalar manualmente:

```bash
npm ci --prefix backend
npm start --prefix backend
```

O servidor escuta em `0.0.0.0:3001` e mostra os endereços de rede disponíveis.
Para usar outra porta, execute `PORT=3002 ./start-backend.sh` e configure a mesma
porta em `EXPO_PUBLIC_BACKEND_URL` no app.

## Conectar o app

No Expo em modo LAN, o app usa o host do Metro na porta 3001. Para configurar
manualmente, crie `.env.local` na raiz do projeto:

```dotenv
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.15:3001
```

Substitua pelo IP mostrado no terminal. Recarregue completamente o app após a
alteração. No emulador Android, use `http://10.0.2.2:3001`. O túnel do Expo
encaminha o Metro, mas não o backend; nesse caso configure um endereço de backend
acessível pelo dispositivo. Em builds instalados, a variável é necessária.

No navegador do celular, abra `http://SEU_IP:3001/`. Deve retornar
`{"status":"ok",...}`. Se não abrir, confira se o servidor está rodando, se o
celular está na mesma rede e se a porta 3001 está acessível.

## Endpoints

- `GET /`: verifica se o backend está acessível, sem consultar o YouTube.
- `GET /api/stream/:videoId`: retorna URL, tipo de stream e headers de reprodução.
- `GET /api/download-source/:videoId`: prepara a melhor faixa de áudio compatível, inclui o tamanho quando conhecido e `downloadPath` para a transferência.
- `GET /api/download/:videoId`: transfere o áudio do YouTube para o app em fluxo.
- `GET /api/info/:videoId`: retorna metadados e formatos.

IDs inválidos retornam HTTP 400. Falhas de extração retornam HTTP 502 com o
motivo, e extrações que excedam 30 segundos retornam HTTP 504. O app aguarda até
35 segundos antes de tentar as alternativas. URLs de streams expiram: obtenha
uma nova ao abrir o vídeo.

Para reprodução online, o backend seleciona formatos com áudio e vídeo juntos. Quando o formato é
HLS, o tipo é informado explicitamente ao `expo-video`. Se não houver um formato
compatível, o app tenta as alternativas existentes, incluindo o player
incorporado do YouTube. O player incorporado pode exibir anúncios.

Para downloads, o backend seleciona `bestaudio` por HTTP(S), somente áudio em
M4A ou WebM, sem conversão ou redução de bitrate. O app envia `audioFormat=best`
no Android ou `audioFormat=m4a` no iOS (melhor faixa compatível com o aparelho).
A preparação retorna `mediaType: "audio"`, `container`, `mimeType`, `audioBitrate`
quando conhecido, e `downloadPath` com o mesmo parâmetro. O cache separa as duas
seleções. A resposta de transferência usa MIME de áudio e a extensão correta.
Lives, HLS e ausência de uma faixa compatível retornam HTTP 422
com o código `DOWNLOAD_UNAVAILABLE`. A extração e a transferência precisam de
internet; a URL retornada expira e deve ser preparada novamente em uma nova
tentativa. O app baixa por `downloadPath` do próprio backend e salva o arquivo
no aparelho. A preparação fica disponível por até 60 segundos, limitada a 20
entradas; a rota de transferência refaz a preparação se necessário. URLs e
redirecionamentos são limitados aos hosts de mídia `googlevideo.com`. A mídia
passa em fluxo, sem salvar uma cópia no backend ou carregar o vídeo inteiro na
memória; cancelar no app interrompe a requisição de origem. O backend deve ficar
acessível durante todo o download. Falhas HTTP da origem retornam 502; ausência
de resposta por 30 segundos retorna 504 antes de começar a enviar o arquivo, ou
interrompe a conexão se a transferência já começou.

Essa rota evita que o celular use diretamente um link assinado para o IP da
máquina que executou o extrator, inclusive quando cada aparelho tem seu próprio
IPv6. Veja a [orientação do yt-dlp sobre reprodução em outra máquina](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#i-extracted-a-video-url-but-it-does-not-play-on-another-machine--in-my-web-browser).
Reinicie o backend e recarregue o app após atualizar: versões antigas do backend
não fornecem `downloadPath` e o app orientará a reinicialização.

Este fluxo dispensa `ffmpeg` e, após o download concluído, a reprodução local
dispensa backend e internet.

## Manutenção e testes

Para atualizar o binário quando o YouTube mudar:

```bash
npm rebuild youtube-dl-exec --prefix backend
```

Testes das rotas usam um extrator simulado, sem acessar o YouTube:

```bash
npm test --prefix backend
```

O extrator anterior `@distube/ytdl-core` foi substituído após falhar ao encontrar
formatos reproduzíveis. Os arquivos antigos `*-player-script.js` são dumps
produzidos por ele; não são usados pelo servidor e foram incluídos no `.gitignore`.

Referências: [youtube-dl-exec](https://github.com/microlinkhq/youtube-dl-exec),
[yt-dlp](https://github.com/yt-dlp/yt-dlp) e
[Node.js como runtime JavaScript](https://github.com/yt-dlp/yt-dlp/wiki/EJS).

## Biblioteca e produção

Ao iniciar com `npm start`, o backend abre o SQLite em `DATABASE_PATH`
(padrão `backend/data/library.sqlite`). As rotas `GET/PUT /api/library/:key`
aceitam `playlists`, `favorites`, `saved_videos`, `downloaded_videos`,
`watch_history` e `search_history`. A biblioteca é única e não exige login nem
token por instalação. O corpo do PUT é `{ value: [], revision: 0 }`;
a resposta traz os dados e a nova revisão. Revisão antiga retorna HTTP 409.

A migração reúne os documentos antigos de cada instalação em uma tabela
compartilhada e mantém os originais arquivados. Salvar playlists, favoritos ou
metadados de downloads também preserva os títulos no catálogo `saved_videos`.
A reinstalação do app recupera a lista pela API. Os arquivos e seu índice de
disponibilidade permanecem locais; um aparelho sem arquivos não esvazia o catálogo.

Consulte [deploy/README.md](../deploy/README.md) para ambiente, serviço isolado,
GitHub Actions, backup e configuração do proxy HTTPS.
