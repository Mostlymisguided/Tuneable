import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'tuneable_token';
const USER_KEY = 'tuneable_user';

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveSession(token: string, userJson: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
  await setItem(USER_KEY, userJson);
}

export async function loadToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function loadUserJson(): Promise<string | null> {
  return getItem(USER_KEY);
}

export async function clearSession(): Promise<void> {
  await deleteItem(TOKEN_KEY);
  await deleteItem(USER_KEY);
}
