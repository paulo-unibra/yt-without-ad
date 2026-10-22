import { authHeaders } from './auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackendUrl } from '../constants/backend';
import { DatabaseStorage } from '../utils/database-storage';

const listeners = new Set<() => void>();
export function subscribeToLibrary(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

class DatabaseRequestError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
async function request(key: string, value?: unknown, revision?: number) {
  const backend = getBackendUrl();
  if (!backend) throw new DatabaseRequestError('Configure o endereço do banco no backend.', 0);
  let response: Response;
  try {
    response = await fetch(`${backend}/api/library/${encodeURIComponent(key)}`, {
      method: revision === undefined ? 'GET' : 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: revision === undefined ? undefined : JSON.stringify({ value, revision }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { throw new DatabaseRequestError('Sem conexão com o banco. Conecte-se à internet e tente salvar novamente.', 0); }
  if (!response.ok) throw new DatabaseRequestError(response.status === 409
    ? 'Sua biblioteca mudou. Reabra a lista e tente salvar novamente.'
    : 'O banco não confirmou o salvamento. Tente novamente.', response.status);
  const document = await response.json();
  if (!Number.isSafeInteger(document.revision) || document.revision < 0
    || !(document.value === null || Array.isArray(document.value))) throw new Error('Resposta inválida do banco.');
  return document;
}

export const databaseStorage = new DatabaseStorage({
  readLocal: key => AsyncStorage.getItem(key),
  writeLocal: (key, raw) => AsyncStorage.setItem(key, raw),
  get: key => request(key),
  put: async (key, value, revision) => {
    const result = await request(key, value, revision);
    if (['playlists', 'favorites', 'saved_videos', 'downloaded_videos'].includes(key)) listeners.forEach(listener => listener());
    return result;
  },
  isUnavailable: error => error instanceof DatabaseRequestError && (error.status === 0 || error.status >= 500),
});

export async function migrateSavedLibrary(): Promise<void> {
  for (const key of ['playlists', 'favorites', 'watch_history', 'search_history', 'saved_videos']) {
    try { await databaseStorage.getItem(`@${key}`); }
    catch { console.warn(`[Biblioteca] Não foi possível migrar ${key}; os dados locais foram preservados.`); }
  }
}
