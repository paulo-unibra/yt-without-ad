# YT Without Ads

Aplicativo React Native com Expo SDK 58 e Expo Router. Permite pesquisar vídeos,
receber sugestões pelos acessos no app, ver vídeos em alta e salvar favoritos,
histórico e registros de downloads no banco do backend, com cache no dispositivo.

## Executar

Use Node.js 22 LTS (`>=22.13.0`), 24 LTS (`>=24.3.0`) ou 26+. O arquivo
`.nvmrc` seleciona Node.js 22, compatível com o SDK e com o Expo Doctor atual.

```bash
nvm use
npm ci
npm start -- --clear
```

Gere um novo build de desenvolvimento para usar o SDK 58. Builds nativos feitos
com SDKs anteriores precisam ser recompilados. O Expo Go das lojas ainda está em
transição para o SDK 58; use apenas uma versão compatível com esse SDK.
Builds próprios anteriores à adição da barra de progresso também precisam ser
recompilados para incluir `@react-native-community/slider` 5.2.1. No Expo Go
compatível com o SDK 58, a biblioteca já está incluída; após `npm ci`, recarregue
o app. Consulte a [documentação do slider no SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/slider/).

```bash
npm run android
npm run ios
npm run web
```

Os comandos acima iniciam o servidor Expo e abrem a plataforma escolhida.
Para compilar o aplicativo nativo localmente, use `npx expo run:android` ou
`npx expo run:ios` (macOS com Xcode 27 ou superior).

Configure `EXPO_PUBLIC_YOUTUBE_API_KEY` em `.env.local` com a chave da YouTube Data API.
A operação do servidor e do deploy está descrita em [deploy/README.md](deploy/README.md).
Para usar o backend de streams, execute em outro terminal:

```bash
./start-backend.sh
```

O backend usa a porta 3001. Em desenvolvimento com Expo em modo LAN, o app usa
automaticamente o mesmo host do Metro. O celular deve acessar essa máquina pela
mesma rede. O backend requer Python 3.10+ e instala seu próprio `yt-dlp` pelo npm.

Para outro servidor, Expo com túnel ou um build instalado, configure `.env.local`:

```dotenv
EXPO_PUBLIC_BACKEND_URL=https://youtubeapi.bibliafoco.com.br
```

A produção usa `https://youtubeapi.bibliafoco.com.br`, também definido em
`.env.production`. Para testar o backend local, use o endereço mostrado ao iniciar.
Recarregue completamente o
app após alterar a variável. No emulador Android, o endereço do computador é
`http://10.0.2.2:3001`. Consulte [backend/README.md](backend/README.md) para os
endpoints e diagnóstico.

## Sugestões na tela inicial

Depois de abrir vídeos no app, a seção **Para você** aparece antes de **Em alta**.
Sem histórico, a página mostra **Em alta** e uma orientação para começar. As
sugestões consideram os últimos 50 vídeos distintos abertos: combinam o acesso
mais recente com canais que têm mais vídeos acessados, dando peso à recência.
Abrir novamente um vídeo atualiza sua posição no histórico; o app não conta
repetições nem mede tempo assistido.

São usados até três canais como ponto de partida, intercalando interesses em
até 12 sugestões. Vídeos do histórico e duplicados são excluídos, inclusive de
**Em alta** e de suas próximas páginas. Ao voltar à página inicial, o feed é
atualizado se o histórico mudou. Arraste a lista para baixo para atualizar
manualmente; resultados de relacionados podem ser reutilizados por até cinco
minutos. Falhas em uma fonte preservam as demais; use **Tentar novamente** ou
**Carregar mais vídeos** quando esses controles aparecerem.

O histórico fica no banco do backend, com cache no aparelho, sem leitura do
histórico da conta Google/YouTube. A biblioteca é única, sem login ou vínculo com a instalação, e reaparece
ao conectar após reinstalar o app. A busca de sugestões requer internet e uma
chave válida da YouTube Data API: consultas por artista/assunto, gênero, categoria e canal são enviadas
à API do Google. Essa seleção é feita pelo app e não corresponde ao algoritmo
oficial do YouTube. O recurso consulta a YouTube Data API e o histórico salvo no backend.

A interface foi exercitada na prévia web com APIs e histórico sintéticos;
a validação em dispositivo Android/iOS permanece pendente.

## Controles de reprodução

No player de stream direto e nos vídeos baixados, a barra abaixo da imagem
mostra o tempo atual e a duração. Ela permanece visível quando os controles
sobre a imagem desaparecem. Toque ou arraste para escolher um trecho: durante
o gesto, o contador mostra o destino e a reprodução pausa temporariamente.
O salto é aplicado ao soltar; o vídeo retoma se já estava tocando e permanece
pausado se estava pausado. Na versão web, a barra também aceita teclado.

Vídeos longos mostram horas no formato `h:mm:ss`. Enquanto a duração não está
disponível, o total aparece como `--:--` e a barra fica desativada. Transmissões
identificadas como **Ao vivo** não permitem buscar um trecho por essa barra.
Os botões de voltar/avançar 10 segundos continuam disponíveis nos vídeos com
busca habilitada, e o avanço automático ao terminar é preservado. Quando o app usa o player
incorporado do YouTube, a busca de tempo usa os controles oficiais dele.

Os gestos e estados foram exercitados na prévia web, incluindo reprodução de
arquivo local com sistema de arquivos simulado. O gesto no slider nativo e a
reprodução em Android/iOS ainda precisam ser validados em dispositivo.

## Vídeos relacionados e reprodução automática

Na tela do vídeo, role até **Vídeos relacionados** e toque em uma sugestão para
reproduzi-la. A troca manual ou automática acontece na mesma tela, sem empilhar
rotas. A descrição do vídeo não é exibida.
A barra acima do vídeo permite pesquisar pelo teclado ou pela lupa. Ao enviar
a consulta, a tela de resultados abre com o texto preenchido e a reprodução
continua no mini player.

Use o botão de expansão ao lado do tempo do vídeo para abrir em tela cheia.
Nesse modo, os controles são os do player nativo; use o botão de saída ou Voltar
no Android para retornar. O mesmo player e a posição de reprodução são mantidos.
Para continuar navegando enquanto assiste, arraste para baixo sobre o vídeo ou
use **Minimizar** no cabeçalho. O mini player permanece no rodapé ao abrir pesquisa,
favoritos e downloads; o conteúdo reserva espaço para ele. Toque no título/seta
para reabrir o vídeo no mesmo ponto. No stream direto e nos arquivos locais,
o botão da miniatura pausa/retoma; **X** encerra e libera o player. Voltar da tela
do vídeo também minimiza. Somente uma sessão toca por vez: abrir outro vídeo
substitui o anterior. A reprodução automática continua no mini player sem mudar
a tela em que você está navegando. O player incorporado do YouTube também permanece
montado; reabra-o para acessar seus controles completos.

O botão não aparece nos downloads somente de áudio. No player alternativo do
YouTube, use a opção de tela cheia dos próprios controles.

**Reprodução automática** começa ativada: ao terminar o vídeo, o primeiro da
lista é aberto se a sessão estiver ativa, inclusive minimizada. Desative a opção para escolher o
próximo manualmente. A preferência é mantida durante essa sequência na tela;
ao encerrar a sessão pelo X e abrir outra, volta ao padrão ativado. O vídeo atual, duplicados e
vídeos já abertos na sequência são excluídos das próximas sugestões.

As sugestões combinam artista/assunto, canal e vídeos populares da mesma categoria
no Brasil. Em música, o artista é estimado pelo formato “Artista - Música” ou pelo
nome do canal; gêneros e assuntos vêm das tags e tópicos disponíveis na API. Essa
identificação é uma heurística e pode não reconhecer todos os artistas ou gêneros.
Os resultados são intercalados, sem duplicados, dando prioridade a até dois vídeos
por canal antes de completar a lista. A mesma variedade se aplica à seção **Para você**.
Históricos antigos têm os metadados atualizados ao buscar sugestões, sem apagar dados.
São feitas até três buscas e uma consulta por categoria a cada vídeo-base, mais uma
consulta em lote de detalhes; o cache de cinco minutos reduz consultas repetidas.
Falhas de uma fonte preservam as sugestões das outras. O parâmetro antigo
`relatedToVideoId` deixou de ser suportado, conforme o
[histórico oficial da API](https://developers.google.com/youtube/v3/revision_history#june-12,-2023).
Se a busca falhar, **Tentar novamente** recarrega apenas as sugestões. Sem novas
sugestões, a reprodução automática para no vídeo encerrado.

O avanço usa o evento de término tanto do player de stream direto quanto do
player incorporado do YouTube. Confirme a reprodução e o avanço em dispositivo
nativo; os testes de prévia web não validam o comportamento no Android ou iOS.

## Salvar em playlists

Na tela do vídeo, toque em **Salvar** para escolher uma playlist existente ou
informar o nome de uma nova e tocar em **Criar e salvar**. Nomes vazios não são
aceitos; nomes equivalentes com diferenças de maiúsculas e espaços reutilizam a
mesma playlist. Salvar novamente não duplica o vídeo. Cancelar não altera as listas.

Abra **Playlists** pelo ícone de lista na página inicial para ver seus vídeos,
reproduzir ou remover um vídeo de uma playlist. Remover de uma playlist não apaga
o download nem remove o vídeo de outras listas. Os favoritos existentes continuam
separados e disponíveis pelo coração.

**Baixar áudio** também permite escolher ou criar a playlist antes de iniciar a
transferência. O vídeo é salvo na lista e o download é acompanhado separadamente;
se ele falhar ou for cancelado, o vídeo continua salvo na playlist, e o áudio só
fica disponível offline após a conclusão. As playlists ficam no banco do backend, com cache no
aparelho, sem sincronização com a conta do YouTube.

## Baixar para ouvir offline

No app Android ou iOS, abra um vídeo e toque em **Baixar áudio**. É preciso ter
internet e o backend acessível para preparar e baixar o arquivo. O app salva um
arquivo somente de áudio na melhor qualidade compatível disponível, sem
reconversão: M4A ou WebM no Android e M4A no iOS. A escolha usa `bestaudio` do
yt-dlp, sem limite fixo de bitrate. Lives, streams HLS e vídeos sem uma faixa de
áudio compatível mostram uma mensagem de indisponibilidade. Downloads não estão
disponíveis na versão web.

O backend transfere a mídia para o app, mantendo a requisição no mesmo endereço
de rede que extraiu o link do YouTube. Mantenha o backend acessível até concluir
o download. Após atualizar esse fluxo, reinicie `./start-backend.sh` e recarregue
o app. Erros de conexão, espaço, permissão e HTTP são apresentados com orientações
para tentar novamente; a mensagem genérica `FileSystemDownloadTask.start` não
substitui a causa nativa quando ela está disponível.

Acompanhe o progresso na tela do vídeo ou em **Offline**, na página inicial,
que abre **Downloads**. Mantenha o app em primeiro plano até terminar; você pode
navegar entre as telas durante a transferência. Toque no controle de cancelar
para interromper ou em **Tentar novamente** após uma falha. Arquivos incompletos
ou cancelados são limpos e não entram na biblioteca offline.

Em **Downloads**, toque em um vídeo salvo para ouvir. O app prioriza o arquivo
e os metadados locais, sem consultar Google, backend ou miniaturas remotas para
reproduzi-lo. **Mais downloads** permite continuar pela biblioteca, e a
reprodução automática avança entre os arquivos salvos sem repetir a sequência.
Depois de concluído o download, essa reprodução dispensa internet e backend.
A biblioteca mostra o espaço ocupado; use a lixeira e confirme a exclusão para
liberar o tamanho informado.

Os arquivos persistem na pasta privada `Paths.document/offline-videos`, com
metadados no banco do backend e cache no aparelho. Os vídeos MP4 baixados anteriormente continuam disponíveis;
novos downloads salvam apenas áudio. A transferência usa o `DownloadTask` do SDK 58 já
instalado; esse fluxo não exige dependências ou plugins adicionais. Para abrir
o app do zero sem rede ou Metro, use um build nativo instalado: o carregamento do bundle de
desenvolvimento pelo Expo Go/Metro não garante uma inicialização offline.

Ainda é necessário validar em dispositivo nativo a transferência pelo Expo,
a reabertura em modo avião e o áudio em segundo plano. Testes da biblioteca em
Node e da interface web com sistema de arquivos simulado não substituem essa
validação.

## Logs de download

Ao tocar em **Baixar áudio**, procure por `[Download]` no console do app
(Expo/React Native DevTools) e no terminal de `./start-backend.sh`.
Cada tentativa recebe um identificador enviado ao backend por `X-Download-Id`;
o mesmo ID aparece na preparação e na transferência.

Os registros mostram escolha da playlist, conexão com o backend, formato e bitrate
selecionados, espaço disponível, bytes/progresso (no máximo a cada cinco segundos,
mais a conclusão), validação do áudio e salvamento na biblioteca. Falhas incluem
etapa, código, status HTTP, causas nativas e eventuais erros de limpeza. Cancelamentos
são identificados separadamente. URLs completas, tokens e cabeçalhos sensíveis
não são registrados. Nenhum log é enviado a um serviço externo.

Exemplo de falha no app:

```text
[Download][app][VIDEO_ID][TENTATIVA] falhou {"stage":"transferencia","code":"ERR_NATIVE","cause":{"message":"HTTP 502"}}
```

No backend, busque pelo mesmo ID e por `resposta_youtube`, `extracao_falhou`,
`tempo_limite_excedido` ou `transferencia_interrompida` para localizar a causa
original. Após atualizar, reinicie o backend e recarregue o app.

## Migração para SDK 58

- Expo `~58.0.17`, React `19.3.0` e React Native `0.88.0`, com dependências
  alinhadas ao SDK e versões resolvidas no `package-lock.json`.
- Leitura do cabeçalho MP4 aguarda `FileHandle.readBytes()`, que retorna uma
  Promise no SDK 58. Rodapé vazio da lista ajustado aos tipos estritos do React Native.
- Reprodução migrada de `expo-av` para `expo-video`, preservando autoplay,
  play/pause, saltos de 10 segundos e controles personalizados. O hook
  `useVideoPlayer` libera o player ao desmontar o componente.
- Reprodução em segundo plano configurada pelo plugin `expo-video` e pelo
  player. Valide esse comportamento em um build nativo; depende de configuração
  nativa e se aplica ao player de stream direto.
- Imports de navegação migrados para `expo-router/js-tabs` e
  `expo-router/react-navigation`.
- Removidas as opções `newArchEnabled` e `android.edgeToEdgeEnabled`,
  descontinuadas desde o SDK 55.

Referências: [upgrade do Expo](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/),
[SDK 58](https://expo.dev/changelog/sdk-58),
[expo-video](https://docs.expo.dev/versions/v58.0.0/sdk/video/) e
[migração do Router](https://docs.expo.dev/router/migrate/sdk-55-to-56/).

## Verificações

```bash
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo-doctor
npx expo export --platform all
```

Após gerar o build, confira em dispositivo: pesquisa, favoritos, reprodução,
pausa, saltos de 10 segundos, troca de vídeo, retorno da tela e áudio em segundo
plano. A obtenção dos streams depende do backend e das APIs externas; quando
indisponível, o aplicativo tenta usar o player incorporado do YouTube.


## Recuperar salvos e baixar em fila

**Vídeos salvos** aparece no início da tela principal e recupera os títulos do
banco automaticamente, sem login. A biblioteca é compartilhada por todas as
instalações deste app. Playlists e favoritos existentes são migrados no servidor.

Use **Baixar todos os áudios** na tela inicial ou em uma playlist para baixar
um áudio por vez, sempre na melhor qualidade compatível. Arquivos já presentes
são pulados. Acompanhe a contagem, o áudio atual e as falhas; **Cancelar fila**
interrompe o atual e preserva os concluídos. A fila continua ao navegar entre
as telas. Mantenha o app aberto. Se houver falhas, **Baixar os que faltam**
tenta novamente e pula os concluídos; veja as causas em **Downloads**.

Após desinstalar, os títulos continuam no servidor, mas os arquivos locais
precisam ser baixados novamente. O bloqueio antibot do YouTube detectado no IP
do servidor ainda pode impedir downloads, inclusive os da fila.


## Logo na abertura

O app usa o arquivo original `assets/images/logo-yt.png` na abertura nativa e
no carregamento inicial. A imagem fica centralizada sobre o fundo escuro, sem
corte ou distorção. A lista de salvos carrega em paralelo; ao concluir ou
retornar uma falha, a tela de abertura sai e libera o conteúdo ou a tentativa
de reconexão. Atualizar as listas depois disso não reabre a tela de abertura.

O Expo Go não reproduz integralmente a abertura nativa personalizada. Para
verificar o resultado final ao tocar no ícone do app, gere um novo build
Android/iOS; a mudança do config plugin não atualiza APKs já compilados.
A camada de carregamento do próprio app também mostra a logo no Expo Go e na web.

### Temporizador de sono

Na tela do vídeo, abra **Temporizador de sono** e escolha 15, 30, 60 ou 90 minutos, ou informe de 1 a 720 minutos. É possível alterar ou cancelar a contagem. O prazo continua ao navegar, minimizar, pausar ou trocar de vídeo; o mini player mostra o tempo restante. Ao expirar, a sessão é encerrada, parando também a reprodução automática. Fechar o player cancela o temporizador.

A contagem usa um horário absoluto e confere o prazo ao retornar do segundo plano. Como o temporizador é executado em JavaScript, o sistema pode atrasar a parada se suspender o app; a precisão com tela bloqueada precisa ser validada no APK instalado.

### Autenticação e administração

O aplicativo exige login; contas são criadas exclusivamente em `/admin` no domínio da API. A biblioteca permanece compartilhada entre usuários autorizados. Senhas temporárias exigem troca antes de acessar dados. Novas senhas têm 12 a 128 caracteres. O painel usa cookie HTTPS HttpOnly/SameSite, verificação de origem e CSRF; o app usa token aleatório guardado em SecureStore (na web, apenas em memória). Sessões do painel expiram em 8 horas e do app em 7 dias. Trocar a senha ou bloquear a conta revoga as sessões.

O painel permite criar administradores e usuários do aplicativo, bloquear contas, consultar os últimos 100 eventos de auditoria e restringir os IPs de acesso **ao painel**. Lista vazia não restringe IPs; credenciais continuam obrigatórias. Para evitar bloqueio acidental, a primeira autorização deve ser o IP atual. IPs de operadoras podem mudar. Em caso de perda de acesso, a recuperação é feita pelo administrador do servidor via SSH e banco, nunca por endpoint público.

Inicialização única: `DATABASE_PATH=/caminho/library.sqlite node backend/bootstrap-admin.js`, com JSON contendo `email` e `password` pela entrada padrão. Não informe segredos em argumentos, Git ou logs. O comando se recusa a executar se já houver usuários. O banco e os backups passam a conter hashes de credenciais e devem manter acesso restrito. O deploy exige um novo APK para uso das rotas autenticadas; versões anteriores deixam de acessar a API.
