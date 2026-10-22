import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadErrorMessage } from '../utils/download-errors.ts';
import { appDownloadSource } from '../utils/download-source.ts';

const wrapper = "Call to function 'FileSystemDownloadTask.start' has been rejected.";

test('uses the underlying native HTTP failure instead of the generic task rejection', () => {
  for (const error of [new Error(`${wrapper}\n→ Caused by: Unable to download a file: HTTP 403`),
    { message: wrapper, cause: { message: 'HTTP 403', code: 'ERR_UNABLE_TO_DOWNLOAD' } }]) {
    assert.match(downloadErrorMessage(error), /HTTP 403/);
    assert.doesNotMatch(downloadErrorMessage(error), /FileSystemDownloadTask/);
  }
});

test('distinguishes disk, permissions, network, timeout and backend failures', () => {
  for (const [detail, expected] of [
    ['write failed: ENOSPC (No space left on device)', /Espaço insuficiente/],
    ['Missing WRITE permission for accessing the file', /gravar na pasta/],
    ['Unable to resolve host media.test', /conectar/],
    ['Read timed out', /sem resposta/],
    ['response has status: 502', /backend não conseguiu/],
    ['HTTP 429', /limitou/],
  ]) assert.match(downloadErrorMessage({ message: wrapper, cause: { message: detail } }), expected);
});

test('youtube bot check explains the block instead of leaking the yt-dlp hint', () => {
  const raw = 'ERROR: [youtube] hJA9vnxwoHU: Sign in to confirm you’re not a bot. This helps protect our '
    + 'community. Use --cookies-from-browser or --cookies for the authentication. See https://github.com/'
    + 'yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp for how to manually pass cookies';
  for (const error of [{ message: raw }, { message: 'falhou', code: 'EXTRACTION_BLOCKED' }]) {
    const message = downloadErrorMessage(error);
    assert.match(message, /bloqueou o servidor/);
    assert.match(message, /Repetir agora não resolve/);
    assert.doesNotMatch(message, /cookies|yt-dlp|bot/i);
  }
});

test('generic native rejections and non-Error rejections get an actionable message', () => {
  assert.match(downloadErrorMessage(new Error(wrapper)), /backend aberto/);
  assert.match(downloadErrorMessage(null), /iniciar o download/);
  assert.match(downloadErrorMessage({ message: 'HTTP 410' }), /novo link/);
  assert.equal(downloadErrorMessage({ message: wrapper, cause: { message: 'Destination already exists' } }), 'Destination already exists');
});

test('handles cyclic causes without exposing signed URLs in displayed errors', () => {
  const error = { message: 'Transfer failed at https://media.test/file?token=secret' };
  error.cause = error;
  assert.equal(downloadErrorMessage(error), 'Transfer failed at [endereço remoto]');
});

test('downloads from the backend instead of the IP-bound CDN URL or its headers', () => {
  const source = appDownloadSource('http://192.168.1.15:3001/', 'aaaaaaaaaaa', {
    success: true, contentType: 'progressive', mediaType: 'audio', container: 'webm', downloadPath: '/api/download/aaaaaaaaaaa?audioFormat=best', fileSize: 1234,
    url: 'https://rr1.googlevideo.com/video?ip=server-ip', headers: { 'User-Agent': 'extractor' },
  });
  assert.deepEqual(source, { url: 'http://192.168.1.15:3001/api/download/aaaaaaaaaaa?audioFormat=best', contentType: 'progressive', mediaType: 'audio', container: 'webm', audioBitrate: undefined, fileSize: 1234 });
});

test('outdated backends give restart instructions and cannot redirect the app elsewhere', () => {
  for (const downloadPath of [undefined, 'https://other.test/file', '/api/download/bbbbbbbbbbb']) {
    assert.throws(() => appDownloadSource('http://localhost:3001', 'aaaaaaaaaaa', {
      success: true, contentType: 'progressive', mediaType: 'audio', container: 'webm', downloadPath,
    }), /Reinicie o backend/);
  }
  assert.throws(() => appDownloadSource('http://localhost:3001', 'invalid', { success: true, contentType: 'progressive' }), /não está disponível/);
});
