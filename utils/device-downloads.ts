import { parseDownloads } from './download-library.ts';
import type { DownloadedVideo } from '../types/video';

interface Ports { read(key: string): Promise<string | null>; write(key: string, raw: string): Promise<void> }
const KEY = '@device_downloads_v2';
export function deviceDownloadStorage(ports: Ports) {
  return {
    async read(): Promise<DownloadedVideo[]> {
      const current = await ports.read(KEY);
      if (current !== null) return parseDownloads(current);
      const cached = await ports.read('@database:downloaded_videos');
      const cache = cached === null ? null : JSON.parse(cached);
      if (cache !== null && (!cache || (cache.raw !== null && typeof cache.raw !== 'string'))) {
        throw new Error('Não foi possível ler o índice antigo de downloads.');
      }
      const previous = cache?.raw ?? null;
      return parseDownloads(previous ?? await ports.read('@downloaded_videos'));
    },
    async write(items: DownloadedVideo[]) { await ports.write(KEY, JSON.stringify(items)); },
  };
}
