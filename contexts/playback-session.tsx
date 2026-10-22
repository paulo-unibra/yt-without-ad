import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface PlaybackSession {
  id: string | null;
  minimized: boolean;
  open(id: string): void;
  play(id: string): void;
  minimize(): void;
  close(): void;
}
const Context = createContext<PlaybackSession | null>(null);

export function PlaybackSessionProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const play = useCallback((nextId: string) => {
    if (/^[\w-]{11}$/.test(nextId)) setId(nextId);
  }, []);
  const open = useCallback((nextId: string) => {
    if (!/^[\w-]{11}$/.test(nextId)) return;
    setId(nextId);
    setMinimized(false);
  }, []);
  const minimize = useCallback(() => setMinimized(true), []);
  const close = useCallback(() => { setId(null); setMinimized(false); }, []);
  const value = useMemo(() => ({ id, minimized, open, play, minimize, close }), [id, minimized, open, play, minimize, close]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePlaybackSession() {
  const context = useContext(Context);
  if (!context) throw new Error('PlaybackSessionProvider ausente.');
  return context;
}
