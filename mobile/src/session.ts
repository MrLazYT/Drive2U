import * as SecureStore from 'expo-secure-store';
import type { Session } from './types';
const KEY = 'drive2u.session.v1';
export async function saveSession(session:Session) { await SecureStore.setItemAsync(KEY,JSON.stringify(session),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}); }
export async function clearSession() { await SecureStore.deleteItemAsync(KEY); }
export async function loadSession():Promise<Session|null> {
  const stored = await SecureStore.getItemAsync(KEY);
  if (!stored) return null;
  try {
    const session = JSON.parse(stored) as Session;
    if (!session.accessToken || !session.user?.id || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) { await clearSession(); return null; }
    return session;
  } catch { await clearSession(); return null; }
}
