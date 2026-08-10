import type { User } from '@/src/types/user';

export const DEFAULT_TIP_POUNDS = 1.11;
export const ONBOARDING_PATH = '/onboarding';
export const DEFAULT_POST_AUTH_PATH = '/(tabs)';

type OnboardingUser = Pick<User, 'createdAt' | 'onboarding'>;

/**
 * New signups need the full wizard until `completedAt` is set.
 * Grandfathers completed wizards and accounts older than 7 days.
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

export function getPostAuthHref(
  user: OnboardingUser | null | undefined
): typeof ONBOARDING_PATH | typeof DEFAULT_POST_AUTH_PATH {
  return needsOnboarding(user) ? ONBOARDING_PATH : DEFAULT_POST_AUTH_PATH;
}

export function hasHomeLocation(
  location: User['homeLocation'] | null | undefined
): boolean {
  return !!(location?.city || location?.country || location?.placeId);
}
