import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { savedVideoService } from '../services/saved-videos';
import { subscribeToLibrary } from '../services/database';
import type { Video } from '../types/video';

export function useSavedVideos() {
  const [items, setItems] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try { setItems(await savedVideoService.list()); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    const reload = async () => {
      try { const videos = await savedVideoService.list(); if (active) { setItems(videos); setError(false); } }
      catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    };
    void reload();
    const unsubscribe = subscribeToLibrary(() => { void reload(); });
    return () => { active = false; unsubscribe(); };
  }, []));
  return { items, loading, error, refresh };
}
