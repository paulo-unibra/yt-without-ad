import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getBackendUrl } from '../constants/backend';
let token: string | null = null;
const key = 'yt_session_v1';
const listeners = new Set<() => void>();
export const subscribeAuth = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const isAuthenticated = () => !!token;
export const authHeaders = (): Record<string,string> => token ? { Authorization: `Bearer ${token}` } : {};
export async function clearAuth() {
  token = null;
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(key);
  listeners.forEach(fn => fn());
}
export async function authRequest(path: string, body?: unknown) {
  const backend = getBackendUrl();
  if (!backend) throw new Error('Servidor não configurado.');
  const response = await fetch(`${backend}/auth/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(response.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : 'Não foi possível autenticar. Confira os dados e a conexão.');
  return response.json();
}
export async function restoreAuth() {
  if (Platform.OS !== 'web') token = await SecureStore.getItemAsync(key);
  if (token) { try { const user = await authRequest('me'); if(user.mustChange) await clearAuth(); } catch { await clearAuth(); } }
  listeners.forEach(fn => fn());
}
export async function login(email: string, password: string) {
  const result = await authRequest('login', {email,password});
  token = result.token;
  if (!result.mustChange) {
    if (Platform.OS !== 'web') await SecureStore.setItemAsync(key,token!);
    listeners.forEach(fn => fn());
  }
  return result;
}
export async function logout() { try { await authRequest('logout',{}); } finally { await clearAuth(); } }
