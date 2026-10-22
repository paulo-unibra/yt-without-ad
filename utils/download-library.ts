import type { Video, DownloadedVideo, DownloadSource } from '../types/video';
import { downloadErrorMessage } from './download-errors.ts';
import { createDownloadId, downloadErrorDetails, logDownload } from './download-diagnostics.js';

export interface DownloadJob {
  video: Video;
  phase: 'preparing' | 'downloading' | 'saving' | 'error';
  bytesWritten: number;
  totalBytes: number;
  error?: string;
}

export interface DownloadSnapshot {
  ready: boolean;
  error: string | null;
  items: DownloadedVideo[];
  jobs: Record<string, DownloadJob>;
}

interface LocalFile { uri: string; size: number }
export interface DownloadPorts {
  remember?(video: Video): Promise<void>;
  read(): Promise<DownloadedVideo[]>;
  write(items: DownloadedVideo[]): Promise<void>;
  initialize(knownIds: string[]): Promise<void>;
  stat(id: string): Promise<LocalFile | null>;
  resolveSource(id: string, signal: AbortSignal, downloadId?: string): Promise<DownloadSource>;
  transfer(id: string, source: DownloadSource, signal: AbortSignal, progress: (written: number, total: number) => void): Promise<void>;
  commit(id: string, source: DownloadSource): Promise<LocalFile>;
  cleanup(id: string, includeComplete: boolean): Promise<void>;
}

export function parseDownloads(raw: string | null): DownloadedVideo[] {
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Não foi possível ler a biblioteca offline.');
  const seen = new Set<string>();
  return parsed.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const required = ['id', 'title', 'description', 'thumbnail', 'channelTitle', 'channelId', 'publishedAt', 'localUri', 'downloadedAt'];
    if (!required.every((key) => typeof item[key] === 'string')) return false;
    if (!/^[\w-]{11}$/.test(item.id) || !Number.isFinite(item.fileSize) || item.fileSize <= 0 || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function isMp4Header(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
}

export function isAudioHeader(bytes: Uint8Array, container: 'm4a' | 'webm'): boolean {
  if (container === 'm4a') return isMp4Header(bytes);
  return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function downloadLabel(job: DownloadJob): string {
  if (job.phase === 'preparing') return 'Preparando...';
  if (job.phase === 'saving') return 'Salvando...';
  if (job.phase === 'error') return 'Tentar novamente';
  return job.totalBytes > 0
    ? `Baixando ${Math.min(100, Math.floor(job.bytesWritten / job.totalBytes * 100))}%`
    : `Baixando ${formatBytes(job.bytesWritten)}`;
}

export class DownloadLibrary {
  private ports: DownloadPorts;
  private snapshot: DownloadSnapshot = { ready: false, error: null, items: [], jobs: {} };
  private listeners = new Set<() => void>();
  private initialization: Promise<void> | null = null;
  private operations: Promise<void> = Promise.resolve();
  private active = new Map<string, { controller: AbortController; downloadId: string; promise: Promise<DownloadedVideo | null> }>();

  constructor(ports: DownloadPorts) { this.ports = ports; }

  getSnapshot = (): DownloadSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(change: Partial<DownloadSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((listener) => listener());
  }

  private updateJob(id: string, job: DownloadJob | null) {
    const jobs = { ...this.snapshot.jobs };
    if (job) jobs[id] = job;
    else delete jobs[id];
    this.publish({ jobs });
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }

  async hydrate(): Promise<void> {
    if (this.snapshot.ready) return;
    if (!this.initialization) {
      this.initialization = (async () => {
        try {
          const stored = await this.ports.read();
          await this.ports.initialize(stored.map((item) => item.id));
          const items = await this.existingItems(stored);
          await this.ports.write(items);
          this.publish({ ready: true, error: null, items });
        } catch (error) {
          this.publish({ error: error instanceof Error ? error.message : 'Não foi possível abrir os downloads.' });
          throw error;
        }
      })();
    }
    try { await this.initialization; }
    finally { this.initialization = null; }
  }

  private async existingItems(items: DownloadedVideo[]): Promise<DownloadedVideo[]> {
    const checked = await Promise.all(items.map(async (item) => {
      const file = await this.ports.stat(item.id);
      return file && file.size === item.fileSize ? { ...item, localUri: file.uri } : null;
    }));
    return checked.filter((item): item is DownloadedVideo => item !== null);
  }

  async refresh(): Promise<void> {
    await this.hydrate();
    await this.exclusive(async () => {
      const items = await this.existingItems(this.snapshot.items);
      await this.ports.write(items);
      this.publish({ items, error: null });
    });
  }

  async getPlayable(id: string): Promise<DownloadedVideo | null> {
    await this.hydrate();
    return this.exclusive(async () => {
      const item = this.snapshot.items.find((item) => item.id === id);
      if (!item) return null;
      const file = await this.ports.stat(id);
      if (file && file.size === item.fileSize) return { ...item, localUri: file.uri };
      const items = this.snapshot.items.filter((item) => item.id !== id);
      await this.ports.write(items);
      this.publish({ items });
      return null;
    });
  }

  start(video: Video): Promise<DownloadedVideo | null> {
    const existing = this.active.get(video.id);
    if (existing) {
      logDownload('app', video.id, existing.downloadId, 'tentativa_ja_em_andamento');
      return existing.promise;
    }
    const controller = new AbortController();
    this.updateJob(video.id, { video, phase: 'preparing', bytesWritten: 0, totalBytes: 0 });
    const downloadId = createDownloadId();
    const promise = this.run(video, controller.signal, downloadId);
    this.active.set(video.id, { controller, downloadId, promise });
    return promise;
  }

  private async run(video: Video, signal: AbortSignal, downloadId: string): Promise<DownloadedVideo | null> {
    let committed = false;
    let stage = 'biblioteca';
    const startedAt = Date.now();
    logDownload('app', video.id, downloadId, 'iniciado');
    try {
      if (!/^[\w-]{11}$/.test(video.id)) throw new Error('ID do vídeo inválido.');
      const existing = await this.getPlayable(video.id);
      if (existing) {
        logDownload('app', video.id, downloadId, 'ja_disponivel_offline', { bytes: existing.fileSize });
        return existing;
      }
      if (signal.aborted) return null;
      await this.ports.remember?.(video);
      if (signal.aborted) return null;
      stage = 'preparacao';
      logDownload('app', video.id, downloadId, 'preparando_fonte');
      const resolved = await this.ports.resolveSource(video.id, signal, downloadId);
      const source = { ...resolved, headers: { ...resolved.headers, 'X-Download-Id': downloadId } };
      if (signal.aborted) return null;
      if (source.contentType !== 'progressive' || source.mediaType !== 'audio' || !['m4a', 'webm'].includes(source.container)) throw new Error('Este stream não pode ser salvo offline.');
      stage = 'transferencia';
      logDownload('app', video.id, downloadId, 'transferencia_iniciada', { container: source.container, audioBitrate: source.audioBitrate, totalBytes: source.fileSize });
      let lastProgressAt = 0;
      let lastProgressBytes = -1;
      this.updateJob(video.id, { video, phase: 'downloading', bytesWritten: 0, totalBytes: source.fileSize ?? 0 });
      await this.ports.transfer(video.id, source, signal, (bytesWritten, totalBytes) => {
        if (!signal.aborted && bytesWritten !== lastProgressBytes && (Date.now() - lastProgressAt >= 5000 || (totalBytes > 0 && bytesWritten >= totalBytes))) {
          lastProgressAt = Date.now();
          lastProgressBytes = bytesWritten;
          logDownload('app', video.id, downloadId, 'progresso', { bytesWritten, totalBytes, percent: totalBytes > 0 ? Math.floor(bytesWritten / totalBytes * 100) : null });
        }
        if (!signal.aborted) this.updateJob(video.id, { video, phase: 'downloading', bytesWritten, totalBytes });
      });
      if (signal.aborted) throw new Error('Cancelado');
      stage = 'salvamento_arquivo';
      logDownload('app', video.id, downloadId, 'salvando_arquivo');
      this.updateJob(video.id, { video, phase: 'saving', bytesWritten: 0, totalBytes: 0 });
      const file = await this.ports.commit(video.id, source);
      committed = true;
      if (file.size <= 0 || (source.fileSize && file.size !== source.fileSize)) {
        throw new Error('O arquivo ficou incompleto. Tente baixar novamente.');
      }
      const saved: DownloadedVideo = { ...video, mediaType: 'audio', container: source.container, audioBitrate: source.audioBitrate, localUri: file.uri, fileSize: file.size, downloadedAt: new Date().toISOString() };
      stage = 'salvamento_biblioteca';
      logDownload('app', video.id, downloadId, 'persistindo_biblioteca', { bytes: file.size });
      await this.exclusive(async () => {
        if (signal.aborted) throw new Error('Cancelado');
        const items = [saved, ...this.snapshot.items.filter((item) => item.id !== video.id)];
        await this.ports.write(items);
        this.publish({ items });
      });
      logDownload('app', video.id, downloadId, 'concluido', { bytes: file.size, elapsedMs: Date.now() - startedAt });
      return saved;
    } catch (error) {
      if (!signal.aborted) logDownload('app', video.id, downloadId, 'falhou', { stage, elapsedMs: Date.now() - startedAt, ...downloadErrorDetails(error) }, 'error');
      await this.ports.cleanup(video.id, committed).catch((cleanupError) => {
        logDownload('app', video.id, downloadId, 'limpeza_falhou', downloadErrorDetails(cleanupError), 'warn');
      });
      if (!signal.aborted) {
        const message = downloadErrorMessage(error);
        this.updateJob(video.id, { video, phase: 'error', bytesWritten: 0, totalBytes: 0, error: message });
      }
      return null;
    } finally {
      if (signal.aborted) logDownload('app', video.id, downloadId, 'cancelado', { stage, elapsedMs: Date.now() - startedAt });
      this.active.delete(video.id);
      if (signal.aborted || this.snapshot.jobs[video.id]?.phase !== 'error') this.updateJob(video.id, null);
    }
  }

  cancel(id: string): void {
    const active = this.active.get(id);
    if (active) { logDownload('app', id, active.downloadId, 'cancelamento_solicitado'); active.controller.abort(); }
  }
  dismissError(id: string): void {
    if (!this.active.has(id)) this.updateJob(id, null);
  }

  async remove(id: string): Promise<void> {
    await this.hydrate();
    if (this.active.has(id)) throw new Error('Cancele o download antes de excluir.');
    await this.exclusive(async () => {
      await this.ports.cleanup(id, true);
      const items = this.snapshot.items.filter((item) => item.id !== id);
      await this.ports.write(items);
      this.publish({ items });
    });
  }
}
