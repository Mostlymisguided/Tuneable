import React from 'react';
import { Link } from 'react-router-dom';
import { getTagProfilePath, normalizeTagForStorage, tagsMatch, type TagProfileScope } from '../utils/tagNormalizer';

interface TagListProps {
  tags: string[];
  mediaId?: string;
  limit?: number;
  /** Optional override; by default each tag links to its tag profile */
  linkPath?: string;
  scope?: TagProfileScope;
  hideTag?: string;
}

const TagList: React.FC<TagListProps> = ({
  tags,
  limit = 3,
  linkPath,
  scope = 'music',
  hideTag,
}) => {
  const visibleTags = tags.filter((tag) => !hideTag || !tagsMatch(tag, hideTag));
  if (!visibleTags.length) return null;
  const visible = visibleTags.slice(0, limit);
  const overflow = visibleTags.length - limit;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag, tagIndex) => {
        const display = normalizeTagForStorage(tag) || tag;
        return (
          <Link
            key={`${display}-${tagIndex}`}
            to={linkPath ?? getTagProfilePath(display, scope)}
            onClick={(e) => e.stopPropagation()}
            className="px-2 py-0.5 bg-purple-700/60 hover:bg-purple-500 text-white text-[10px] rounded-full transition-colors no-underline"
          >
            #{display}
          </Link>
        );
      })}
      {overflow > 0 && (
        <span className="px-2 py-0.5 text-purple-300 text-[10px]">+{overflow}</span>
      )}
    </div>
  );
};

export default TagList;
