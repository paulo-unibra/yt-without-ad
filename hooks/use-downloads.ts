import { useEffect, useSyncExternalStore } from 'react';
import { downloadService } from '../services/downloads';

export function useDownloads() {
  const snapshot = useSyncExternalStore(downloadService.subscribe, downloadService.getSnapshot, downloadService.getSnapshot);
  useEffect(() => { void downloadService.hydrate().catch(() => undefined); }, []);
  return snapshot;
}
