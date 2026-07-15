import React from 'react';
import { Link } from 'react-router-dom';
import { getTagProfilePath } from '../utils/tagNormalizer';

interface TagListProps {
  tags: string[];
  mediaId?: string;
  limit?: number;
  /** Optional override; by default each tag links to its tag profile */
  linkPath?: string;
}

const TagList: React.FC<TagListProps> = ({ tags, limit = 3, linkPath }) => {
  if (!tags.length) return null;
  const visible = tags.slice(0, limit);
  const overflow = tags.length - limit;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag, tagIndex) => (
        <Link
          key={`${tag}-${tagIndex}`}
          to={linkPath ?? getTagProfilePath(tag)}
          onClick={(e) => e.stopPropagation()}
          className="px-2 py-0.5 bg-purple-700/60 hover:bg-purple-500 text-white text-[10px] rounded-full transition-colors no-underline"
        >
          #{tag}
        </Link>
      ))}
      {overflow > 0 && (
        <span className="px-2 py-0.5 text-purple-300 text-[10px]">+{overflow}</span>
      )}
    </div>
  );
};

export default TagList;
