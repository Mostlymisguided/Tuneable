// Mirrors tuneable-backend/utils/passwordPolicy.js. The server also rejects
// common and breached passwords; the client only checks length.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_HINT =
  'At least 8 characters. Longer beats complicated: try four random words, like “lantern otter velvet cactus”. A password manager is even better. Avoid song lyrics and titles.';

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

/** Pulls a readable message out of an axios error from the auth endpoints. */
export function passwordApiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: string; errors?: Array<{ msg?: string }> } } })
    ?.response?.data;
  return data?.error || data?.errors?.[0]?.msg || fallback;
}
