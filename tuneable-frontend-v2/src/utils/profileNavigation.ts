type UserPathFields = {
  username?: string | null;
  uuid?: string | null;
  _id?: string | null;
  id?: string | null;
};

function identifierOf(user: UserPathFields | string | null | undefined): string {
  if (!user) return '';
  if (typeof user === 'string') return user;
  return user.username || user.uuid || user._id || user.id || '';
}

function withQuery(path: string, query?: string | Record<string, string> | URLSearchParams | null): string {
  if (!query) return path;
  if (typeof query === 'string') {
    if (!query) return path;
    return query.startsWith('?') ? `${path}${query}` : `${path}?${query}`;
  }
  const qs = query instanceof URLSearchParams
    ? query.toString()
    : new URLSearchParams(query).toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Public profile URL. Prefers username; falls back to uuid / ObjectId
 * (backend resolves all three and the page canonical-redirects).
 */
export function getUserProfileUrl(
  user?: UserPathFields | string | null,
  query?: string | Record<string, string> | URLSearchParams | null
): string {
  const ident = identifierOf(user);
  if (!ident) return '/profile';
  return withQuery(`/user/${encodeURIComponent(ident)}`, query);
}

export function isCanonicalUserParam(param: string | undefined, username: string | undefined): boolean {
  if (!param || !username) return false;
  try {
    return decodeURIComponent(param).toLowerCase() === username.toLowerCase();
  } catch {
    return param.toLowerCase() === username.toLowerCase();
  }
}
