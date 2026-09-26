import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyDocumentMeta, getActiveMeta, setRouteMeta, subscribePageMeta } from '../seo/pageMeta';
import { metaForPath } from '../seo/routeMeta';

const SeoManager = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    setRouteMeta(metaForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    const apply = () => {
      const meta = getActiveMeta();
      if (meta) applyDocumentMeta(meta);
    };
    apply();
    return subscribePageMeta(apply);
  }, []);

  return null;
};

export default SeoManager;
