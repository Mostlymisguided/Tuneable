import React from 'react';
import { Bot } from 'lucide-react';
import {
  AI_TOOL_CATEGORY_LABELS,
  cleanAiTools,
  hasAiUsage,
  type AiUsage,
  type AiToolCategory,
} from '../data/aiTools';

interface AiToolsDisplayProps {
  aiUsage?: AiUsage | null;
  className?: string;
}

const chipClass =
  'inline-flex items-center gap-1.5 rounded-full bg-gray-800 border border-gray-700 px-3 py-1 text-sm text-gray-200';
const metaClass = 'text-xs text-gray-400';

const AiToolsDisplay: React.FC<AiToolsDisplayProps> = ({ aiUsage, className = '' }) => {
  if (!hasAiUsage(aiUsage)) return null;

  const tools = cleanAiTools(aiUsage?.tools || []);
  const notes = aiUsage?.notes?.trim();

  const byCategory = tools.reduce<Record<string, typeof tools>>((acc, tool) => {
    const key = tool.category || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(tool);
    return acc;
  }, {});

  return (
    <div className={`space-y-4 ${className}`}>
      {Object.entries(byCategory).map(([category, categoryTools]) => (
        <div key={category}>
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-300">
              {AI_TOOL_CATEGORY_LABELS[category as AiToolCategory] || category}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {categoryTools.map((tool, i) => (
              <span key={i} className={chipClass}>
                <span className="font-medium">{tool.name}</span>
                {tool.provider && (
                  <span className={metaClass}>· {tool.provider}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}

      {notes && (
        <div className="text-sm text-gray-300 bg-black/20 rounded-lg p-3 border border-gray-700/50">
          <span className="text-gray-400 text-xs uppercase tracking-wide block mb-1">Notes</span>
          {notes}
        </div>
      )}

      {tools.length === 0 && !notes && (
        <p className="text-sm text-gray-400">AI was used in the creation of this track.</p>
      )}
    </div>
  );
};

export default AiToolsDisplay;
