const express = require('express');
const cors = require('cors');
const { networkInterfaces } = require('node:os');
const { extractVideoInfo, toVideoStream } = require('./extractor');
const { createDownloadId, downloadErrorDetails, logDownload } = require('../utils/download-diagnostics');
const { createDownloadRelay } = require('./download-relay');
const { resolve } = require('node:path');
const { LibraryDatabase } = require('./library-database');
const { createLibraryRouter } = require('./library-routes');
const { rateLimit } = require('./rate-limit');

function createApp({ getVideoInfo = extractVideoInfo, getDownloadInfo = (id, options) => extractVideoInfo(id, { ...options, forDownload: true }), fetchMedia, idleTimeoutMs, database } = {}) {
  const app = express();
  const downloads = createDownloadRelay({ getDownloadInfo, fetchMedia, idleTimeoutMs });
  app.use(cors());
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 'loopback');
  app.use('/api', rateLimit());
  app.use(express.json({ limit: '2mb' }));
  if (database) app.use('/api/library', createLibraryRouter(database));

  app.use(['/api/download-source/:videoId', '/api/download/:videoId'], (req, res, next) => {
    const incomingId = req.get('X-Download-Id');
    req.downloadId = incomingId && /^[\w-]{1,64}$/.test(incomingId) ? incomingId : createDownloadId();
    res.setHeader('X-Download-Id', req.downloadId);
    const startedAt = Date.now();
    logDownload('backend', req.params.videoId, req.downloadId, 'requisicao_recebida', { method: req.method, route: req.baseUrl.split('/')[2] });
    const videoId = req.params.videoId;
    res.once('finish', () => logDownload('backend', videoId, req.downloadId, 'resposta_http', { status: res.statusCode, elapsedMs: Date.now() - startedAt }));
    next();
  });

  app.get('/', (req, res) => {
    if (database) database.db.prepare('SELECT 1').get();
    res.json({ status: 'ok', message: 'YT Stream Backend is running', version: '1.0.0', extractor: 'yt-dlp', database: database ? 'ok' : 'disabled', release: process.env.RELEASE_SHA || 'local' });
  });

  app.param('videoId', (req, res, next, videoId) => {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ success: false, code: 'INVALID_VIDEO_ID', error: 'ID do vídeo inválido.' });
    }
    next();
  });

  function sendError(res, videoId, error, downloadId) {
    if (downloadId) logDownload('backend', videoId, downloadId, 'requisicao_falhou', downloadErrorDetails(error), 'error');
    else console.error(`❌ Stream ${videoId}: ${error.message}`);
    if (res.headersSent) { res.destroy(); return; }
    res.status(error.code === 'EXTRACTION_BUSY' ? 503 : ['EXTRACTION_TIMEOUT', 'DOWNLOAD_TIMEOUT'].includes(error.code) ? 504 : error.code === 'DOWNLOAD_UNAVAILABLE' ? 422 : 502).json({
      success: false,
      code: error.code || 'EXTRACTION_FAILED',
      error: error.message,
      videoId,
    });
  }

  app.get('/api/stream/:videoId', async (req, res) => {
    const { videoId } = req.params;
    try {
      console.log(`📹 Fetching stream for video: ${videoId}`);
      const stream = toVideoStream(await getVideoInfo(videoId));
      console.log(`✅ Stream found (${stream.quality}, ${stream.contentType})`);
      res.json(stream);
    } catch (error) {
      sendError(res, videoId, error);
    }
  });

  app.get('/api/download-source/:videoId', async (req, res) => {
    const { videoId } = req.params;
    try {
      res.json(await downloads.prepare(videoId, req.query.audioFormat === 'm4a' ? 'm4a' : 'best', req.downloadId));
    } catch (error) {
      sendError(res, videoId, error, req.downloadId);
    }
  });

  app.get('/api/download/:videoId', async (req, res) => {
    try {
      await downloads.download(req, res);
    } catch (error) {
      if (!req.aborted && !res.destroyed) sendError(res, req.params.videoId, error, req.downloadId);
    }
  });

  app.get('/api/info/:videoId', async (req, res) => {
    const { videoId } = req.params;
    try {
      const info = await getVideoInfo(videoId);
      res.json({
        success: true,
        videoDetails: {
          title: info.title,
          description: info.description,
          lengthSeconds: String(info.duration ?? 0),
          viewCount: String(info.view_count ?? 0),
          author: info.uploader,
          thumbnail: info.thumbnail,
        },
        formats: (info.formats || []).map((format) => ({
          quality: format.height ? `${format.height}p` : format.format_note,
          container: format.ext,
          hasVideo: Boolean(format.vcodec && format.vcodec !== 'none'),
          hasAudio: Boolean(format.acodec && format.acodec !== 'none'),
        })),
      });
    } catch (error) {
      sendError(res, videoId, error);
    }
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error('[API]', error.code || error.name || 'Error');
    res.status(error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500)
      .json({ error: 'Não foi possível processar a solicitação.' });
  });
  return app;
}

function startServer() {
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser uma porta válida entre 1 e 65535.');
  }

  const database = new LibraryDatabase(process.env.DATABASE_PATH || resolve(__dirname, 'data/library.sqlite'));
  const server = createApp({ database }).listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`🚀 YT Stream Backend running on http://localhost:${port}`);
    const addresses = Object.values(networkInterfaces()).flat()
      .filter((address) => address && address.family === 'IPv4' && !address.internal)
      .map((address) => address.address);
    for (const address of new Set(addresses)) {
      console.log(`🌐 Network: http://${address}:${port}`);
    }
  });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? `A porta ${port} já está em uso. Verifique o backend existente ou configure PORT.`
      : error.message);
    process.exitCode = 1;
    database.close();
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    server.close(() => { database.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
  return server;
}

if (require.main === module) startServer();
module.exports = { createApp, startServer };
