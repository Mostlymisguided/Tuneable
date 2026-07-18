import axios from 'axios';

/** Prefer backend `error` / `message` for auth forms. */
export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { error?: string; message?: string; errors?: Array<{ msg?: string }> }
      | undefined;
    if (data?.error) return data.error;
    if (data?.message) return data.message;
    if (Array.isArray(data?.errors) && data.errors[0]?.msg) {
      return data.errors[0].msg;
    }
    if (!err.response) {
      return err.message || 'Cannot reach the API.';
    }
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
