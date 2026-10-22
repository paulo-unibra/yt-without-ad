const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { downloadErrorDetails, logDownload } = require('../utils/download-diagnostics');
const { toDownloadSource } = require('./extractor');

function validateMediaUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
    || (url.hostname !== 'googlevideo.com' && !url.hostname.endsWith('.googlevideo.com'))
    || url.port) {
    throw Object.assign(new Error('O extrator não retornou um endereço de mídia válido do YouTube.'), { code: 'DOWNLOAD_INVALID_SOURCE' });
  }
  return url.href;
}

// A mídia é solicitada pela mesma máquina que extrai a URL assinada. O celular
// recebe os bytes em fluxo, sem arquivo temporário ou buffering integral aqui.
function createDownloadRelay({ getDownloadInfo, fetchMedia = fetch, idleTimeoutMs = 30000 }) {
  const prepared = new Map();

  async function prepare(videoId, audioFormat = 'best', downloadId) {
    const startedAt = Date.now();
    logDownload('backend', videoId, downloadId, 'preparacao_iniciada', { audioFormat });
    const source = toDownloadSource(await getDownloadInfo(videoId, { audioFormat, downloadId }));
    validateMediaUrl(source.url);
    if (prepared.size >= 20) prepared.delete(prepared.keys().next().value);
    prepared.set(`${videoId}:${audioFormat}`, { source, expiresAt: Date.now() + 60000 });
    logDownload('backend', videoId, downloadId, 'fonte_preparada', { container: source.container, audioBitrate: source.audioBitrate, fileSize: source.fileSize, elapsedMs: Date.now() - startedAt });
    return { ...source, downloadPath: `/api/download/${videoId}?audioFormat=${audioFormat}` };
  }

  async function download(req, res) {
    const { videoId } = req.params;
    const audioFormat = req.query.audioFormat === 'm4a' ? 'm4a' : 'best';
    const cacheKey = `${videoId}:${audioFormat}`;
    const downloadId = req.downloadId;
    const startedAt = Date.now();
    let bytesSent = 0;
    let lastProgressAt = 0;
    let stage = 'preparacao';
    const controller = new AbortController();
    let timeout;
    let timedOut = false;
    const abort = () => {
      if (!res.writableEnded && !controller.signal.aborted) {
        logDownload('backend', videoId, downloadId, 'conexao_interrompida', { stage, bytesSent, requestAborted: req.aborted, elapsedMs: Date.now() - startedAt }, 'warn');
        controller.abort();
      }
    };
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => { timedOut = true; controller.abort(); }, idleTimeoutMs);
      timeout.unref?.();
    };
    req.once('aborted', abort);
    res.once('close', abort);
    try {
      const entry = prepared.get(cacheKey);
      logDownload('backend', videoId, downloadId, 'transferencia_solicitada', { audioFormat, cachedSource: !!entry && entry.expiresAt > Date.now() });
      const source = entry && entry.expiresAt > Date.now() ? entry.source : await prepare(videoId, audioFormat, downloadId);
      if (req.aborted || res.destroyed || controller.signal.aborted) return;
      let url = validateMediaUrl(source.url);
      let upstream;
      stage = 'conexao_youtube';
      resetTimeout();
      // Redirecionamentos também ficam limitados aos hosts de mídia do YouTube.
      for (let redirects = 0; redirects <= 3; redirects++) {
        logDownload('backend', videoId, downloadId, 'solicitando_midia', { host: new URL(url).hostname, redirect: redirects });
        upstream = await fetchMedia(url, {
          headers: { ...source.headers, 'Accept-Encoding': 'identity' },
          signal: controller.signal,
          redirect: 'manual',
        });
        logDownload('backend', videoId, downloadId, 'resposta_youtube', { status: upstream.status, mimeType: upstream.headers.get('content-type'), contentLength: upstream.headers.get('content-length') });
        if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
        const location = upstream.headers.get('location');
        await upstream.body?.cancel();
        if (!location || redirects === 3) throw new Error('Não foi possível seguir o endereço de mídia do YouTube.');
        url = validateMediaUrl(new URL(location, url).href);
      }
      if (upstream.status !== 200 || !upstream.body) {
        await upstream.body?.cancel();
        throw Object.assign(new Error(`O YouTube recusou a transferência (HTTP ${upstream.status}). Tente baixar novamente.`), { code: 'DOWNLOAD_UPSTREAM_FAILED' });
      }
      res.setHeader('Content-Type', source.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${videoId}.${source.container}"`);
      res.setHeader('Cache-Control', 'no-store');
      const length = upstream.headers.get('content-length');
      if (length && /^[1-9]\d*$/.test(length)) res.setHeader('Content-Length', length);
      stage = 'transferencia';
      resetTimeout();
      const progress = new Transform({
        transform(chunk, encoding, callback) {
          bytesSent += chunk.length;
          if (Date.now() - lastProgressAt >= 5000) {
            lastProgressAt = Date.now();
            logDownload('backend', videoId, downloadId, 'progresso', { bytesSent, elapsedMs: Date.now() - startedAt });
          }
          resetTimeout();
          callback(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(upstream.body), progress, res, { signal: controller.signal });
      logDownload('backend', videoId, downloadId, 'transferencia_concluida', { bytesSent, elapsedMs: Date.now() - startedAt });
    } catch (error) {
      logDownload('backend', videoId, downloadId, timedOut ? 'tempo_limite_excedido' : 'transferencia_interrompida', { stage, bytesSent, elapsedMs: Date.now() - startedAt, ...downloadErrorDetails(error) }, timedOut || !controller.signal.aborted ? 'error' : 'warn');
      prepared.delete(cacheKey);
      if (req.aborted || res.destroyed) return;
      if (timedOut) {
        throw Object.assign(new Error('O download ficou sem resposta por 30 segundos. Tente novamente.'), { code: 'DOWNLOAD_TIMEOUT' });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
    }
  }

  return { prepare, download };
}

module.exports = { createDownloadRelay, validateMediaUrl };
