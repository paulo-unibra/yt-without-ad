import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getBackendUrl } from '../constants/backend';
import { DatabaseStorage } from '../utils/database-storage';

let identity: Promise<string> | null = null;
function libraryToken(): Promise<string> {
  if (!identity) identity = (async () => {
    const key = 'yt-library-token';
    const token = Platform.OS === 'web' ? await AsyncStorage.getItem(key) : await SecureStore.getItemAsync(key);
    if (token && /^[a-f0-9]{64}$/.test(token)) return token;
    const bytes = await Crypto.getRandomBytesAsync(32);
    const created = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    if (Platform.OS === 'web') await AsyncStorage.setItem(key, created);
    else await SecureStore.setItemAsync(key, created, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    return created;
  })().catch(error => { identity = null; throw error; });
  return identity;
}

class DatabaseRequestError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
async function request(key: string, value?: unknown, revision?: number) {
  const backend = getBackendUrl();
  if (!backend) throw new DatabaseRequestError('Configure o endereço do banco no backend.', 0);
  const token = await libraryToken();
  let response: Response;
  try {
    response = await fetch(`${backend}/api/library/${encodeURIComponent(key)}`, {
      method: revision === undefined ? 'GET' : 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
  put: (key, value, revision) => request(key, value, revision),
  isUnavailable: error => error instanceof DatabaseRequestError && (error.status === 0 || error.status >= 500),
});

export async function migrateSavedLibrary(): Promise<void> {
  for (const key of ['playlists', 'favorites', 'watch_history', 'search_history', 'downloaded_videos']) {
    try { await databaseStorage.getItem(`@${key}`); }
    catch { console.warn(`[Biblioteca] Não foi possível migrar ${key}; os dados locais foram preservados.`); }
  }
}
