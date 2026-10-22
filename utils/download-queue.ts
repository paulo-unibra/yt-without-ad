import type { Video } from '../types/video';

interface Ports {
  getPlayable(id: string): Promise<unknown>;
  start(video: Video): Promise<unknown>;
  cancel(id: string): void;
}
export interface DownloadQueueSnapshot {
  running: boolean;
  title: string;
  total: number;
  completed: number;
  skipped: number;
  failed: Video[];
  current: Video | null;
  cancelled: boolean;
}
export class DownloadQueue {
  private ports: Ports;
  private listeners = new Set<() => void>();
  private task: Promise<void> | null = null;
  private snapshot: DownloadQueueSnapshot = { running: false, title: '', total: 0, completed: 0, skipped: 0, failed: [], current: null, cancelled: false };
  constructor(ports: Ports) { this.ports = ports; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(change: Partial<DownloadQueueSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach(listener => listener());
  }
  start(videos: Video[], title: string): Promise<void> {
    if (this.task) return this.task;
    const unique = [...new Map(videos.map(video => [video.id, video])).values()];
    this.publish({ running: true, title, total: unique.length, completed: 0, skipped: 0, failed: [], current: null, cancelled: false });
    this.task = this.run(unique).finally(() => { this.task = null; });
    return this.task;
  }
  private async run(videos: Video[]) {
    try {
      for (const video of videos) {
        if (this.snapshot.cancelled) break;
        this.publish({ current: video });
        try {
          const available = await this.ports.getPlayable(video.id);
          if (this.snapshot.cancelled) break;
          if (available) { this.publish({ skipped: this.snapshot.skipped + 1 }); continue; }
          const saved = await this.ports.start(video);
          if (this.snapshot.cancelled) break;
          if (saved) this.publish({ completed: this.snapshot.completed + 1 });
          else this.publish({ failed: [...this.snapshot.failed, video] });
        } catch {
          if (!this.snapshot.cancelled) this.publish({ failed: [...this.snapshot.failed, video] });
        }
      }
    } finally { this.publish({ running: false, current: null }); }
  }
  cancel() {
    if (!this.snapshot.running) return;
    const current = this.snapshot.current;
    this.publish({ cancelled: true });
    if (current) this.ports.cancel(current.id);
  }
}
