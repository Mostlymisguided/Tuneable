import { Alert } from 'react-native';
import axios from 'axios';

// Mirrors tuneable-backend/utils/passwordPolicy.js. Length is the only hard
// rule; the server warns (422 PASSWORD_WARNINGS) about common, personal and
// breached passwords, and accepts them once resubmitted with acceptPasswordWarnings.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_HINT =
  'At least 8 characters. Longer beats complicated: try four random words, like “lantern otter velvet cactus”. A password manager is even better. Avoid song lyrics and titles.';

export const PASSWORD_PLACEHOLDER = `At least ${PASSWORD_MIN_LENGTH} characters`;

/** iOS strong-password generator hints. */
export const IOS_PASSWORD_RULES = `minlength: ${PASSWORD_MIN_LENGTH}; maxlength: ${PASSWORD_MAX_LENGTH};`;

function passwordWarningsFrom(error: unknown): string[] | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data as { code?: string; warnings?: string[] } | undefined;
  return data?.code === 'PASSWORD_WARNINGS' && data.warnings?.length ? data.warnings : null;
}

function confirmUseAnyway(warnings: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Use this password?',
      `${warnings.join('\n\n')}\n\nA few random words would be safer.`,
      [
        { text: 'Choose another', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Use anyway', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/**
 * Runs `submit(false)`; if the server only has warnings, asks the user and
 * retries with `submit(true)`. Resolves null when the user chooses another.
 */
export async function submitWithPasswordWarnings<T>(
  submit: (acceptPasswordWarnings: boolean) => Promise<T>
): Promise<T | null> {
  try {
    return await submit(false);
  } catch (error) {
    const warnings = passwordWarningsFrom(error);
    if (!warnings) throw error;
    return (await confirmUseAnyway(warnings)) ? submit(true) : null;
  }
}

export function passwordLengthError(password: string): string | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}
