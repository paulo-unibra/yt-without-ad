const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { constants: { YOUTUBE_DL_PATH } } = require('youtube-dl-exec');

const run = promisify(execFile);
const { downloadErrorDetails, logDownload } = require('../utils/download-diagnostics');

const FORMAT = 'best[ext=mp4][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]';
let extracting = false;
function downloadFormat(audioFormat = 'best') {
  const container = audioFormat === 'm4a' ? '[ext=m4a]' : '[ext~="^(m4a|webm)$"]';
  return `bestaudio[protocol=https]${container}/bestaudio[protocol=http]${container}`;
}

async function extractVideoInfo(videoId, { forDownload = false, audioFormat = 'best', downloadId } = {}) {
  if (extracting) throw Object.assign(new Error('O servidor está preparando outro vídeo. Tente novamente em alguns segundos.'), { code: 'EXTRACTION_BUSY' });
  extracting = true;
  const startedAt = Date.now();
  if (forDownload) logDownload('backend', videoId, downloadId, 'extracao_iniciada', { audioFormat, format: downloadFormat(audioFormat), timeoutMs: 30000 });
  try {
    const { stdout } = await run(YOUTUBE_DL_PATH, [
      '--dump-single-json', '--skip-download', '--no-playlist', '--ignore-config',
      '--no-warnings', '--format', forDownload ? downloadFormat(audioFormat) : FORMAT,
      '--js-runtimes', `node:${process.execPath}`,
      '--socket-timeout', '10', '--retries', '1', '--extractor-retries', '1',
      '--', `https://www.youtube.com/watch?v=${videoId}`,
    ], {
      timeout: 30000,
      killSignal: 'SIGKILL',
      maxBuffer: 10 * 1024 * 1024,
    });
    const info = JSON.parse(stdout);
    if (forDownload) logDownload('backend', videoId, downloadId, 'extracao_concluida', { formatId: info.format_id, container: info.ext, audioCodec: info.acodec, audioBitrate: info.abr, fileSize: info.filesize, elapsedMs: Date.now() - startedAt });
    return info;
  } catch (error) {
    const timedOut = (error.killed && error.signal === 'SIGKILL') || error.code === 'ETIMEDOUT';
    const unavailable = forDownload && /Requested format.*not available|No video formats found/i.test(error.stderr ?? '');
    const message = timedOut
      ? 'A extração do vídeo excedeu 30 segundos.'
      : unavailable
        ? 'Não há uma faixa de áudio compatível disponível para baixar.'
      : error.code === 'ENOENT'
        ? 'yt-dlp não encontrado. Execute npm ci na pasta backend.'
        : error.stderr?.match(/ERROR:[^\n]+/g)?.at(-1) || 'O YouTube não forneceu um stream reproduzível.';
    const failure = new Error(message.slice(0, 500));
    failure.code = timedOut ? 'EXTRACTION_TIMEOUT' : unavailable ? 'DOWNLOAD_UNAVAILABLE' : 'EXTRACTION_FAILED';
    if (forDownload) logDownload('backend', videoId, downloadId, 'extracao_falhou', { ...downloadErrorDetails(failure), processCode: error.code, signal: error.signal, elapsedMs: Date.now() - startedAt }, 'error');
    throw failure;
  } finally { extracting = false; }
}

function toVideoStream(info) {
  if (!info.url || !info.vcodec || info.vcodec === 'none' || !info.acodec || info.acodec === 'none') {
    const error = new Error('Nenhum formato com vídeo e áudio juntos está disponível.');
    error.code = 'NO_PLAYABLE_FORMAT';
    throw error;
  }

  const headers = {};
  for (const name of ['User-Agent', 'Referer', 'Origin']) {
    if (typeof info.http_headers?.[name] === 'string') headers[name] = info.http_headers[name];
  }

  return {
    success: true,
    url: info.url,
    contentType: info.protocol?.startsWith('m3u8') ? 'hls' : 'progressive',
    headers,
    quality: info.height ? `${info.height}p` : info.format_note || 'auto',
    container: info.ext,
    videoCodec: info.vcodec,
    audioCodec: info.acodec,
    title: info.title,
    duration: String(info.duration ?? 0),
  };
}

function toDownloadSource(info) {
  if (!info.url || info.is_live || info.live_status === 'is_live' || info.vcodec !== 'none'
    || !info.acodec || info.acodec === 'none' || !['m4a', 'webm'].includes(info.ext)
    || !['https', 'http'].includes(info.protocol)) {
    const error = new Error('Não há uma faixa de áudio compatível disponível para baixar. Lives não são salvas offline.');
    error.code = 'DOWNLOAD_UNAVAILABLE';
    throw error;
  }
  const headers = {};
  for (const name of ['User-Agent', 'Referer', 'Origin']) {
    if (typeof info.http_headers?.[name] === 'string') headers[name] = info.http_headers[name];
  }
  return {
    success: true, url: info.url, contentType: 'progressive', mediaType: 'audio',
    container: info.ext, mimeType: info.ext === 'm4a' ? 'audio/mp4' : 'audio/webm',
    audioCodec: info.acodec, audioBitrate: info.abr, quality: 'best', headers,
    title: info.title, duration: String(info.duration ?? 0),
    fileSize: Number.isSafeInteger(info.filesize) && info.filesize > 0 ? info.filesize : undefined,
  };
}

module.exports = { extractVideoInfo, toVideoStream, toDownloadSource, downloadFormat };
