// Mirrors tuneable-backend/utils/passwordPolicy.js. Length is the only hard
// rule; the server warns (422 PASSWORD_WARNINGS) about common, personal and
// breached passwords, and accepts them once resubmitted with acceptPasswordWarnings.
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_HINT =
  'At least 6 characters. Longer beats complicated: try four random words, like “lantern otter velvet cactus”. A password manager is even better. Avoid song lyrics and titles.';

export const PASSWORD_PLACEHOLDER = `At least ${PASSWORD_MIN_LENGTH} characters`;

export function passwordLengthError(password: string): string | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  return null;
}

function passwordWarningsFrom(error: unknown): string[] | null {
  const data = (error as { response?: { data?: { code?: string; warnings?: string[] } } })
    ?.response?.data;
  return data?.code === 'PASSWORD_WARNINGS' && data.warnings?.length ? data.warnings : null;
}

/**
 * Runs `submit(false)`; if the server only has warnings, asks the user and
 * retries with `submit(true)`. Resolves null when the user chooses to go back.
 */
export async function submitWithPasswordWarnings<T>(
  submit: (acceptPasswordWarnings: boolean) => Promise<T>
): Promise<T | null> {
  try {
    return await submit(false);
  } catch (error) {
    const warnings = passwordWarningsFrom(error);
    if (!warnings) throw error;
    const proceed = window.confirm(
      `${warnings.join('\n\n')}\n\nA few random words would be safer. Use this password anyway?`
    );
    return proceed ? submit(true) : null;
  }
}

/** Pulls a readable message out of an axios error from the auth endpoints. */
export function passwordApiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: string; errors?: Array<{ msg?: string }> } } })
    ?.response?.data;
  return data?.error || data?.errors?.[0]?.msg || fallback;
}
