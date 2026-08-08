import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { authAPI } from '@/src/api/auth';
import { isExpoGo } from '@/src/lib/iap';
import type { LoginResponse } from '@/src/types/user';

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Native Sign in with Apple → backend JWT session.
 * Pass inviteCode when creating a new account (register screen).
 * Requires a development / TestFlight / App Store build (not Expo Go).
 */
export async function signInWithApple(options?: {
  inviteCode?: string;
}): Promise<LoginResponse> {
  if (isExpoGo()) {
    throw new Error(
      'Sign in with Apple needs a development or TestFlight build (not Expo Go). Press s in Metro to switch to a development build, or run: npx expo run:ios'
    );
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple Sign In did not return an identity token.');
  }

  return authAPI.appleSignIn({
    identityToken: credential.identityToken,
    invite: options?.inviteCode,
    email: credential.email ?? undefined,
    fullName: credential.fullName
      ? {
          givenName: credential.fullName.givenName ?? undefined,
          familyName: credential.fullName.familyName ?? undefined,
        }
      : undefined,
  });
}
