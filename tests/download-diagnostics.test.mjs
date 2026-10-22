import assert from 'node:assert/strict';
import test from 'node:test';
import diagnostics from '../utils/download-diagnostics.js';
import { DownloadLibrary } from '../utils/download-library.ts';
const { downloadErrorDetails, logDownload } = diagnostics;

const video = { id: 'aaaaaaaaaaa', title: 'Private title', description: '', thumbnail: '', channelTitle: '', channelId: '', publishedAt: '' };
function fixture() {
  let file = null;
  const ports = {
    read: async () => [], write: async () => {}, initialize: async () => {}, stat: async () => file,
    resolveSource: async () => ({ url: 'http://backend.test/download', contentType: 'progressive', mediaType: 'audio', container: 'm4a', fileSize: 200 }),
    transfer: async (_id, _source, _signal, progress) => { for (let bytes = 1; bytes <= 200; bytes++) progress(bytes, 200); },
    commit: async () => { file = { uri: 'file:///private/file.m4a', size: 200 }; return file; }, cleanup: async () => {},
  };
  return { library: new DownloadLibrary(ports), ports };
}
function capture(t) {
  const lines = [];
  for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, line => lines.push(line));
  return lines;
}

test('diagnostics keep native/HTTP causes while redacting URLs, credentials and cyclic data', t => {
  const lines = capture(t);
  const error = Object.assign(new Error('HTTP 502 at https://media.test/file?sig=secret'), {
    code: 'ERR_NATIVE', response: { status: 502, data: { code: 'UPSTREAM', error: 'https://media.test/?token=secret' }, config: { headers: { Authorization: 'secret' } } },
    cause: { message: 'HTTP 403', code: 'FORBIDDEN' },
    nativeError: { message: 'Cookie: first=secret; second=another-secret' },
  });
  error.cause.cause = error;
  const details = downloadErrorDetails(error);
  logDownload('app', video.id, 'trace-123', 'falhou', { ...details, headers: { Cookie: 'hidden-secret' }, requestAborted: true, token: 'secret' }, 'error');
  const output = lines.join('\n');
  assert.match(output, /trace-123/);
  assert.match(output, /"httpStatus":502/);
  assert.match(output, /HTTP 403/);
  assert.match(output, /"requestAborted":true/);
  assert.doesNotMatch(output, /secret|media\.test|another-secret/);
});

test('download stages share one trace and progress is throttled rather than logged per chunk', async t => {
  const lines = capture(t);
  const { library, ports } = fixture();
  let trace;
  const originalResolve = ports.resolveSource;
  ports.resolveSource = async (id, signal, downloadId) => { trace = downloadId; return originalResolve(id, signal); };
  const originalTransfer = ports.transfer;
  ports.transfer = async (id, source, signal, progress) => {
    assert.equal(source.headers['X-Download-Id'], trace);
    await originalTransfer(id, source, signal, progress);
  };
  assert.ok(await library.start(video));
  assert.match(trace, /^[\w-]+$/);
  assert.ok(lines.every(line => line.includes(`[${trace}]`)));
  for (const stage of ['iniciado', 'preparando_fonte', 'transferencia_iniciada', 'salvando_arquivo', 'persistindo_biblioteca', 'concluido']) assert.ok(lines.some(line => line.includes(` ${stage} `)));
  assert.equal(lines.filter(line => line.includes(' progresso ')).length, 2);
  assert.doesNotMatch(lines.join('\n'), /Private title|private\/file|backend\.test/);
});

test('transfer errors include the failing stage, native cause and cleanup failures', async t => {
  const lines = capture(t);
  const { library, ports } = fixture();
  ports.transfer = async () => { throw Object.assign(new Error('Task rejected'), { cause: new Error('HTTP 403') }); };
  ports.cleanup = async () => { throw new Error('EACCES'); };
  assert.equal(await library.start(video), null);
  assert.ok(lines.some(line => line.includes(' falhou ') && line.includes('"stage":"transferencia"') && line.includes('HTTP 403')));
  assert.ok(lines.some(line => line.includes(' limpeza_falhou ') && line.includes('EACCES')));
});
