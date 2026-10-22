import { useCallback, useEffect, useState } from 'react';
import type { Playlist } from '../types/video';
import { playlistService } from '../services/playlists';

export function usePlaylists() {
  const [items, setItems] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const playlists = await playlistService.list();
      setItems(playlists);
      setError(null);
    } catch {
      setError('Não foi possível carregar suas playlists. Tente novamente.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    const reload = async () => {
      try {
        const playlists = await playlistService.list();
        if (active) { setItems(playlists); setError(null); }
      } catch {
        if (active) setError('Não foi possível carregar suas playlists. Tente novamente.');
      } finally { if (active) setLoading(false); }
    };
    const unsubscribe = playlistService.subscribe(() => { void reload(); });
    void reload();
    return () => { active = false; unsubscribe(); };
  }, []);
  return { items, loading, error, refresh };
}
