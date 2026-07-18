export const DEFAULT_POST_AUTH_PATH = '/party/global?period=all-time';
export const ONBOARDING_PATH = '/onboarding';

export interface OnboardingUser {
  createdAt?: string;
  onboarding?: {
    completedAt?: string;
    defaultTipPromptSeenAt?: string;
    favoriteTagsSelectedAt?: string;
    importPromptSeenAt?: string;
  };
}

/** Only allow same-origin relative paths to prevent open redirects. */
export function sanitizeReturnUrl(url: string | null, fallback = DEFAULT_POST_AUTH_PATH): string {
  if (!url) return fallback;
  if (!url.startsWith('/') || url.startsWith('//')) return fallback;
  return url;
}

export function getReturnUrlFromSearch(search: string, fallback = DEFAULT_POST_AUTH_PATH): string {
  return sanitizeReturnUrl(new URLSearchParams(search).get('returnUrl'), fallback);
}

export function buildLoginUrl(returnPath?: string): string {
  if (!returnPath) return '/login';
  return `/login?returnUrl=${encodeURIComponent(returnPath)}`;
}

export function buildRegisterUrl(options?: { returnPath?: string; inviteCode?: string }): string {
  const params = new URLSearchParams();
  if (options?.returnPath) params.set('returnUrl', options.returnPath);
  if (options?.inviteCode) params.set('invite', options.inviteCode);
  const qs = params.toString();
  return qs ? `/register?${qs}` : '/register';
}

export function getCurrentReturnPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * New signups need the full wizard until `completedAt` is set.
 * Grandfathers completed wizards and accounts older than 7 days.
 * Do NOT treat `defaultTipPromptSeenAt` alone as done — that is set mid-wizard after the tip step.
 */
export function needsOnboarding(user: OnboardingUser | null | undefined): boolean {
  if (!user) return false;
  if (user.onboarding?.completedAt) return false;

  if (user.createdAt) {
    const createdAtMs = Date.parse(user.createdAt);
    if (!Number.isNaN(createdAtMs)) {
      const ageMs = Date.now() - createdAtMs;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (ageMs > sevenDaysMs) return false;
    }
  }

  return true;
}

export function getPostAuthPath(
  user: OnboardingUser | null | undefined,
  returnUrl?: string | null
): string {
  if (needsOnboarding(user)) {
    if (returnUrl && returnUrl.startsWith('/onboarding')) {
      return sanitizeReturnUrl(returnUrl, ONBOARDING_PATH);
    }
    return ONBOARDING_PATH;
  }
  return sanitizeReturnUrl(returnUrl ?? null, DEFAULT_POST_AUTH_PATH);
}

export function buildOnboardingCompletePath(favoriteTags: string[]): string {
  const params = new URLSearchParams({ period: 'all-time' });
  if (favoriteTags.length > 0) {
    params.set(
      'tags',
      favoriteTags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .join(',')
    );
  }
  return `/party/global?${params.toString()}`;
}
