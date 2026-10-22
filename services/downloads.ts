import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, DownloadTask, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { DownloadLibrary, isAudioHeader } from '../utils/download-library';
import { deviceDownloadStorage } from '../utils/device-downloads';
import { savedVideoService } from './saved-videos';
import { logDownload } from '../utils/download-diagnostics';
import { youtubeService } from './youtube';

const deviceStorage = deviceDownloadStorage({
  read: key => AsyncStorage.getItem(key),
  write: (key, raw) => AsyncStorage.setItem(key, raw),
});
export const offlineSupported = Platform.OS === 'android' || Platform.OS === 'ios';

function directory() { return new Directory(Paths.document, 'offline-videos'); }
function file(id: string, extension: 'part' | 'm4a' | 'webm' | 'mp4') {
  if (!/^[\w-]{11}$/.test(id)) throw new Error('ID do vídeo inválido.');
  return new File(directory(), `${id}.${extension}`);
}
function savedFile(id: string) {
  return (['m4a', 'webm', 'mp4'] as const).map((extension) => file(id, extension))
    .find((candidate) => candidate.exists);
}

export const downloadService = new DownloadLibrary({
  remember: video => savedVideoService.save(video),
  read: async () => offlineSupported ? deviceStorage.read() : [],
  write: async (items) => {
    if (offlineSupported) await deviceStorage.write(items);
  },
  initialize: async (knownIds) => {
    if (!offlineSupported) return;
    const dir = directory();
    dir.create({ idempotent: true, intermediates: true });
    for (const item of dir.list()) {
      if (!(item instanceof File)) continue;
      const match = item.name.match(/^([\w-]{11})\.(mp4|m4a|webm|part)$/);
      if (match && (match[2] === 'part' || !knownIds.includes(match[1]))) item.delete();
    }
  },
  stat: async (id) => {
    if (!offlineSupported) return null;
    const saved = savedFile(id);
    return saved && saved.size > 0 ? { uri: saved.uri, size: saved.size } : null;
  },
  resolveSource: (id, signal, downloadId) => youtubeService.getDownloadSource(id, signal, downloadId),
  transfer: async (id, source, signal, onProgress) => {
    const downloadId = source.headers?.['X-Download-Id'];
    if (!offlineSupported) throw new Error('Use o app Android ou iOS para baixar áudio.');
    const availableBytes = Paths.availableDiskSpace;
    logDownload('app', id, downloadId, 'verificando_espaco', { availableBytes, requiredBytes: source.fileSize, platform: Platform.OS });
    if (source.fileSize && source.fileSize + 4 * 1024 * 1024 > availableBytes) {
      throw new Error('Espaço insuficiente no aparelho. Exclua um download para liberar espaço.');
    }
    directory().create({ idempotent: true, intermediates: true });
    const partial = file(id, 'part');
    if (partial.exists) partial.delete();
    const task = new DownloadTask(source.url, partial, {
      headers: source.headers,
      signal,
      sessionType: 'foreground',
      onProgress: ({ bytesWritten, totalBytes }) => onProgress(bytesWritten, totalBytes),
    });
    try {
      const downloaded = await task.downloadAsync();
      if (!downloaded || downloaded.size <= 0) throw new Error('O download não foi concluído.');
      logDownload('app', id, downloadId, 'arquivo_recebido', { bytes: downloaded.size });
      const handle = downloaded.open();
      try {
        const header = await handle.readBytes(16);
        const valid = isAudioHeader(header, source.container);
        logDownload('app', id, downloadId, 'validando_audio', { container: source.container, valid, firstBytes: Array.from(header.slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('') });
        if (!valid) {
          throw new Error('O servidor não retornou um arquivo de áudio válido. Tente novamente.');
        }
      } finally { handle.close(); }
    } finally { task.release(); }
  },
  commit: async (id, source) => {
    const partial = file(id, 'part');
    const saved = file(id, source.container);
    if (saved.exists) saved.delete();
    await partial.move(saved);
    return { uri: saved.uri, size: saved.size };
  },
  cleanup: async (id, includeComplete) => {
    if (!offlineSupported) return;
    const partial = file(id, 'part');
    if (partial.exists) partial.delete();
    if (includeComplete) {
      for (const extension of ['m4a', 'webm', 'mp4'] as const) {
        const saved = file(id, extension);
        if (saved.exists) saved.delete();
      }
    }
  },
});
