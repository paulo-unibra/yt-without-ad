import type { Video } from '../types/video';

interface Ports { read(): Promise<string | null>; write(raw: string): Promise<void> }
export class SavedVideoLibrary {
  private ports: Ports;
  private operations: Promise<unknown> = Promise.resolve();
  constructor(ports: Ports) { this.ports = ports; }
  async list(): Promise<Video[]> {
    const raw = await this.ports.read();
    const value: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(value) || !value.every(video => video && /^[\w-]{11}$/.test(video.id)
      && ['title', 'description', 'thumbnail', 'channelTitle', 'channelId', 'publishedAt'].every(key => typeof video[key] === 'string'))) {
      throw new Error('Não foi possível ler os vídeos salvos.');
    }
    return value;
  }
  save(video: Video): Promise<void> {
    const operation = this.operations.then(async () => {
      const videos = await this.list();
      const fields = ['id', 'title', 'description', 'thumbnail', 'channelTitle', 'channelId', 'publishedAt',
        'categoryId', 'tags', 'topicCategories', 'duration', 'viewCount', 'likeCount'] as const;
      const clean = Object.fromEntries(fields.filter(key => video[key] !== undefined).map(key => [key, video[key]]));
      const existing = videos.find(item => item.id === video.id);
      if (existing && JSON.stringify(existing) === JSON.stringify(clean)) return;
      await this.ports.write(JSON.stringify([...videos.filter(item => item.id !== video.id), clean]));
    });
    this.operations = operation.catch(() => undefined);
    return operation;
  }
}
