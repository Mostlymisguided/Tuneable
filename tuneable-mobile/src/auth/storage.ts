import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'tuneable_token';
const USER_KEY = 'tuneable_user';
const REFRESH_KEY = 'tuneable_refresh';

/**
 * SecureStore rejects a single value over 2048 bytes. A profile with locations
 * crosses that, and a failed write used to look like a signed-out launch.
 */
const CHUNK_BYTES = 1800;

function utf8Size(value: string, index: number): number {
  const code = value.charCodeAt(index);
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code >= 0xd800 && code <= 0xdbff) return 4;
  return 3;
}

function chunkForSecureStore(value: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  let bytes = 0;
  for (let i = 0; i < value.length; ) {
    const size = utf8Size(value, i);
    const step = size === 4 ? 2 : 1;
    if (bytes + size > CHUNK_BYTES && i > start) {
      chunks.push(value.slice(start, i));
      start = i;
      bytes = 0;
    }
    bytes += size;
    i += step;
  }
  if (start < value.length) chunks.push(value.slice(start));
  return chunks.length > 0 ? chunks : [''];
}

async function deleteNative(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Missing keys reject on some platforms.
  }
}

async function readChunks(key: string): Promise<string | null> {
  const countRaw = await SecureStore.getItemAsync(`${key}.n`);
  const count = Number(countRaw);
  if (!countRaw || !Number.isInteger(count) || count < 1) return null;
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const part = await SecureStore.getItemAsync(`${key}.${i}`);
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join('');
}

async function deleteChunks(key: string): Promise<void> {
  const countRaw = await SecureStore.getItemAsync(`${key}.n`).catch(() => null);
  const count = Number(countRaw);
  const jobs = [deleteNative(`${key}.n`)];
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  for (let i = 0; i < n; i += 1) jobs.push(deleteNative(`${key}.${i}`));
  await Promise.all(jobs);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  const chunks = chunkForSecureStore(value);
  if (chunks.length === 1) {
    await SecureStore.setItemAsync(key, chunks[0]);
    await deleteChunks(key);
    return;
  }
  const previous = Number(await SecureStore.getItemAsync(`${key}.n`).catch(() => null));
  for (let i = 0; i < chunks.length; i += 1) {
    await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
  }
  await SecureStore.setItemAsync(`${key}.n`, String(chunks.length));
  await deleteNative(key);
  if (Number.isInteger(previous) && previous > chunks.length) {
    await Promise.all(
      Array.from({ length: previous - chunks.length }, (_, index) =>
        deleteNative(`${key}.${chunks.length + index}`)
      )
    );
  }
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  const chunked = await readChunks(key);
  if (chunked != null) return chunked;
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await Promise.all([deleteNative(key), deleteChunks(key)]);
}

export async function saveSession(
  token: string,
  userJson: string,
  refreshToken?: string | null
): Promise<void> {
  await setItem(TOKEN_KEY, token);
  await setItem(USER_KEY, userJson);
  if (refreshToken) await setItem(REFRESH_KEY, refreshToken);
}

export async function saveTokenPair(token: string, refreshToken: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
  await setItem(REFRESH_KEY, refreshToken);
}

export async function loadToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function loadUserJson(): Promise<string | null> {
  return getItem(USER_KEY);
}

export async function loadRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_KEY);
}

export async function clearSession(): Promise<void> {
  await deleteItem(TOKEN_KEY);
  await deleteItem(USER_KEY);
  await deleteItem(REFRESH_KEY);
}
