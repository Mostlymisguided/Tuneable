import React from 'react';
import { Bot } from 'lucide-react';
import { hasAiUsage, type AiUsage } from '../data/aiTools';

type AiAssistedBadgeSize = 'sm' | 'md';

interface AiAssistedBadgeProps {
  aiUsage?: AiUsage | null;
  size?: AiAssistedBadgeSize;
  className?: string;
}

const SIZE_CLASSES: Record<AiAssistedBadgeSize, { chip: string; icon: string }> = {
  sm: {
    chip: 'gap-0.5 px-1.5 py-0.5 text-[10px] leading-none',
    icon: 'h-2.5 w-2.5',
  },
  md: {
    chip: 'gap-1 px-2.5 py-0.5 text-xs',
    icon: 'h-3.5 w-3.5',
  },
};

/** Compact disclosure badge — only renders when AI use is disclosed. */
const AiAssistedBadge: React.FC<AiAssistedBadgeProps> = ({
  aiUsage,
  size = 'md',
  className = '',
}) => {
  if (!hasAiUsage(aiUsage)) return null;

  const sizeClasses = SIZE_CLASSES[size];

  return (
    <span
      title="AI was used in the creation of this track"
      className={`inline-flex items-center flex-shrink-0 rounded-full bg-purple-900/40 border border-purple-500/40 text-purple-300 font-medium ${sizeClasses.chip} ${className}`}
    >
      <Bot className={sizeClasses.icon} aria-hidden />
      AI-assisted
    </span>
  );
};

export default AiAssistedBadge;
