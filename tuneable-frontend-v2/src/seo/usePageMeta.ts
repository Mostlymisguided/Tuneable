import { useEffect } from 'react';
import { pushPageMeta, type PageMeta } from './pageMeta';

export function usePageMeta(meta: PageMeta | null) {
  const serialized = meta ? JSON.stringify(meta) : '';

  useEffect(() => {
    if (!serialized) return;
    return pushPageMeta(JSON.parse(serialized) as PageMeta);
  }, [serialized]);
}
