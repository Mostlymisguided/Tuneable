import React, { useId } from 'react';
import { Plus, Trash2, Bot } from 'lucide-react';
import {
  AI_TOOL_CATALOG,
  AI_TOOL_CATEGORY_LABELS,
  deriveAiDisclosure,
  cleanAiTools,
  type AiUsage,
  type AiToolCategory,
  type AiToolEntry,
} from '../data/aiTools';

interface AiToolsEditorProps {
  value: AiUsage;
  onChange: (value: AiUsage) => void;
  disabled?: boolean;
}

const inputClass =
  'flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded-lg p-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500';
const selectClass =
  'bg-gray-800 border border-gray-600 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-purple-500';

const AiToolsEditor: React.FC<AiToolsEditorProps> = ({ value, onChange, disabled = false }) => {
  const uid = useId();
  const toolListId = `${uid}-ai-tools`;
  const tools = value.tools || [];

  const emit = (patch: Partial<AiUsage>) => {
    const next = { ...value, ...patch };
    next.disclosure = deriveAiDisclosure(next.used, next.tools, next.notes);
    onChange(next);
  };

  const updateTool = (index: number, patch: Partial<AiToolEntry>) => {
    const next = tools.map((t, i) => (i === index ? { ...t, ...patch } : t));
    emit({ tools: next });
  };

  const onToolNameChange = (index: number, name: string) => {
    const match = AI_TOOL_CATALOG.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
    if (match) {
      updateTool(index, { name, provider: match.provider, category: match.category });
    } else {
      updateTool(index, { name });
    }
  };

  const addTool = () => emit({ tools: [...tools, { category: 'other', name: '', provider: '' }] });
  const removeTool = (index: number) => emit({ tools: tools.filter((_, i) => i !== index) });

  const onUsedChange = (used: boolean) => {
    emit({
      used,
      tools: used ? tools : [],
      notes: used ? value.notes : '',
    });
  };

  const validToolCount = cleanAiTools(tools).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <input
          type="checkbox"
          id={`${uid}-ai-used`}
          checked={value.used}
          disabled={disabled}
          onChange={(e) => onUsedChange(e.target.checked)}
          className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
        />
        <label htmlFor={`${uid}-ai-used`} className="text-white font-medium">
          I used AI in the creation of this track
        </label>
      </div>

      {value.used && (
        <div className="space-y-4 pl-8 border-l-2 border-purple-500/30">
          <datalist id={toolListId}>
            {AI_TOOL_CATALOG.map((t) => (
              <option key={t.name} value={t.name}>
                {t.provider}
              </option>
            ))}
          </datalist>

          <div>
            <div className="flex items-center space-x-2 mb-2">
              <Bot className="h-4 w-4 text-purple-400" />
              <label className="text-white font-medium text-sm">AI Tools Used</label>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              List the AI tools involved. Start typing for suggestions.
            </p>

            {tools.map((tool, index) => (
              <div key={index} className="flex flex-wrap gap-2 mb-2">
                <select
                  value={tool.category}
                  disabled={disabled}
                  onChange={(e) => updateTool(index, { category: e.target.value as AiToolCategory })}
                  className={selectClass}
                >
                  {(Object.keys(AI_TOOL_CATEGORY_LABELS) as AiToolCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {AI_TOOL_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  list={toolListId}
                  placeholder="Tool name (e.g., Suno)"
                  value={tool.name}
                  disabled={disabled}
                  onChange={(e) => onToolNameChange(index, e.target.value)}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Provider (e.g., Suno AI)"
                  value={tool.provider}
                  disabled={disabled}
                  onChange={(e) => updateTool(index, { provider: e.target.value })}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => removeTool(index)}
                  disabled={disabled}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addTool}
              disabled={disabled}
              className="flex items-center space-x-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors text-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Add AI Tool</span>
            </button>

            {validToolCount === 0 && (
              <p className="text-xs text-amber-400/80 mt-2">
                Add at least one tool so listeners know how AI was used.
              </p>
            )}
          </div>

          <div>
            <label className="block text-white font-medium text-sm mb-2">Notes (optional)</label>
            <textarea
              value={value.notes || ''}
              disabled={disabled}
              onChange={(e) => emit({ notes: e.target.value })}
              rows={2}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder='e.g., "Used only as a reference track, not in the final mix"'
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AiToolsEditor;
