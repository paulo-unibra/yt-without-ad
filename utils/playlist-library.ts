import type { Playlist, Video } from '../types/video';

interface PlaylistPorts {
  read(): Promise<string | null>;
  write(raw: string): Promise<void>;
}

export function normalizePlaylistName(name: string): string {
  const normalized = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('Digite o nome da playlist.');
  if (normalized.length > 60) throw new Error('Use até 60 caracteres no nome.');
  return normalized;
}

export class PlaylistLibrary {
  private operations: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private ports: PlaylistPorts;
  constructor(ports: PlaylistPorts) { this.ports = ports; }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  async list(): Promise<Playlist[]> {
    const raw = await this.ports.read();
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((item) => item && typeof item.id === 'string'
      && typeof item.name === 'string' && typeof item.createdAt === 'string' && Array.isArray(item.videos)
      && item.videos.every((video: Record<string, unknown>) => video && /^[\w-]{11}$/.test(String(video.id))
        && ['title', 'description', 'thumbnail', 'channelTitle', 'channelId', 'publishedAt'].every((key) => typeof video[key] === 'string')))) {
      throw new Error('Não foi possível ler suas playlists.');
    }
    return parsed;
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation);
    this.operations = result.catch(() => undefined);
    return result;
  }

  private async persist(playlists: Playlist[]) {
    await this.ports.write(JSON.stringify(playlists));
    this.listeners.forEach((listener) => listener());
  }

  create(name: string): Promise<Playlist> {
    return this.exclusive(async () => {
      const normalized = normalizePlaylistName(name);
      const playlists = await this.list();
      const existing = playlists.find((item) => item.name.toLocaleLowerCase('pt-BR') === normalized.toLocaleLowerCase('pt-BR'));
      if (existing) return existing;
      const playlist = {
        id: `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        name: normalized, createdAt: new Date().toISOString(), videos: [],
      };
      await this.persist([...playlists, playlist]);
      return playlist;
    });
  }

  addVideo(playlistId: string, video: Video): Promise<void> {
    return this.exclusive(async () => {
      if (!/^[\w-]{11}$/.test(video.id)) throw new Error('Vídeo inválido.');
      const playlists = await this.list();
      const playlist = playlists.find((item) => item.id === playlistId);
      if (!playlist) throw new Error('Playlist não encontrada. Escolha outra playlist.');
      // Atualiza os metadados sem duplicar um vídeo que já está nesta playlist.
      const existing = playlist.videos.findIndex((item) => item.id === video.id);
      if (existing < 0) playlist.videos.push(video);
      else playlist.videos[existing] = video;
      await this.persist(playlists);
    });
  }

  removeVideo(playlistId: string, videoId: string): Promise<void> {
    return this.exclusive(async () => {
      const playlists = await this.list();
      const playlist = playlists.find((item) => item.id === playlistId);
      if (!playlist) throw new Error('Playlist não encontrada.');
      playlist.videos = playlist.videos.filter((item) => item.id !== videoId);
      await this.persist(playlists);
    });
  }
}
