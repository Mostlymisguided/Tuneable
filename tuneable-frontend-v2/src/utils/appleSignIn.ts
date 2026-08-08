type AppleName = {
  firstName?: string;
  lastName?: string;
};

type AppleSignInSuccess = {
  authorization: {
    id_token: string;
    code?: string;
    state?: string;
  };
  user?: {
    email?: string;
    name?: AppleName;
  };
};

type AppleIDAuth = {
  init: (config: {
    clientId: string;
    scope: string;
    redirectURI: string;
    state?: string;
    usePopup?: boolean;
  }) => void;
  signIn: (config?: {
    requestedScopes?: string[];
  }) => Promise<AppleSignInSuccess>;
};

declare global {
  interface Window {
    AppleID?: { auth: AppleIDAuth };
  }
}

const APPLE_SDK_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

let sdkPromise: Promise<void> | null = null;

function loadAppleSdk(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Apple Sign In is only available in the browser.'));
  }
  if (window.AppleID?.auth) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${APPLE_SDK_SRC}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Apple Sign In SDK.'))
      );
      if (window.AppleID?.auth) resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = APPLE_SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Failed to load Apple Sign In SDK.'));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

/** Services ID from Apple Developer (Identifiers → Services IDs). */
export function getAppleWebClientId(): string | null {
  const id = import.meta.env.VITE_APPLE_CLIENT_ID?.trim();
  return id || null;
}

/**
 * Must exactly match a Return URL configured on the Services ID.
 * Defaults to the current origin's /auth/callback (or FRONTEND origin in prod builds).
 */
export function getAppleRedirectUri(): string {
  const fromEnv = import.meta.env.VITE_APPLE_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  return 'https://tuneable.stream/auth/callback';
}

export function isAppleWebSignInConfigured(): boolean {
  return Boolean(getAppleWebClientId());
}

export type AppleWebCredential = {
  identityToken: string;
  email?: string;
  fullName?: { givenName?: string; familyName?: string };
};

/**
 * Sign in with Apple via the JS SDK (popup).
 * Requires VITE_APPLE_CLIENT_ID (Services ID) and domain/return URL setup in Apple Developer.
 */
export async function signInWithAppleWeb(): Promise<AppleWebCredential> {
  const clientId = getAppleWebClientId();
  if (!clientId) {
    throw new Error(
      'Apple Sign In is not configured. Set VITE_APPLE_CLIENT_ID to your Apple Services ID.'
    );
  }

  await loadAppleSdk();
  if (!window.AppleID?.auth) {
    throw new Error('Apple Sign In SDK failed to initialize.');
  }

  window.AppleID.auth.init({
    clientId,
    scope: 'name email',
    redirectURI: getAppleRedirectUri(),
    usePopup: true,
  });

  let response: AppleSignInSuccess;
  try {
    response = await window.AppleID.auth.signIn();
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'error' in err
        ? String((err as { error?: string }).error)
        : '';
    if (code === 'popup_closed_by_user' || code === 'user_cancelled_authorize') {
      const cancel = new Error('Apple Sign In was cancelled.');
      (cancel as Error & { cancelled?: boolean }).cancelled = true;
      throw cancel;
    }
    throw err instanceof Error ? err : new Error('Apple Sign In failed.');
  }

  const identityToken = response.authorization?.id_token;
  if (!identityToken) {
    throw new Error('Apple Sign In did not return an identity token.');
  }

  const givenName = response.user?.name?.firstName;
  const familyName = response.user?.name?.lastName;

  return {
    identityToken,
    email: response.user?.email,
    fullName:
      givenName || familyName
        ? { givenName, familyName }
        : undefined,
  };
}
