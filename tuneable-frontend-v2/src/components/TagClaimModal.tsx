import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Tag, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { mediaAPI } from '../lib/api';
import { normalizeTagForStorage, tagsMatch } from '../utils/tagNormalizer';
import { penceToPounds } from '../utils/currency';

type RankedTag = {
  tag: string;
  aggregate?: number;
  tipperCount?: number;
};

interface TagClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaId: string;
  mediaTitle?: string;
  suggestedTags?: RankedTag[] | string[];
  /** When true, open in "agree after tip" mode with softer copy. */
  postTipPrompt?: boolean;
  onClaimed?: (result: {
    tags?: string[];
    rankedTags?: RankedTag[];
  }) => void;
}

function toRanked(suggested?: RankedTag[] | string[]): RankedTag[] {
  if (!suggested?.length) return [];
  if (typeof suggested[0] === 'string') {
    return (suggested as string[]).map((tag) => ({ tag }));
  }
  return suggested as RankedTag[];
}

const TagClaimModal: React.FC<TagClaimModalProps> = ({
  isOpen,
  onClose,
  mediaId,
  mediaTitle,
  suggestedTags,
  postTipPrompt = false,
  onClaimed,
}) => {
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const ranked = useMemo(() => toRanked(suggestedTags).slice(0, 8), [suggestedTags]);

  useEffect(() => {
    if (!isOpen) return;
    setTagInput('');
    setTags(postTipPrompt ? ranked.slice(0, 5).map((r) => r.tag) : []);
    setSubmitting(false);
  }, [isOpen, mediaId, postTipPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const addTag = () => {
    const display = normalizeTagForStorage(tagInput);
    if (!display) return;
    if (tags.some((t) => tagsMatch(t, display)) || tags.length >= 5) return;
    setTags([...tags, display]);
    setTagInput('');
  };

  const toggleSuggested = (tag: string) => {
    const display = normalizeTagForStorage(tag);
    if (!display) return;
    if (tags.some((t) => tagsMatch(t, display))) {
      setTags(tags.filter((t) => !tagsMatch(t, display)));
      return;
    }
    if (tags.length >= 5) return;
    setTags([...tags, display]);
  };

  const submit = async (agreeTop = false) => {
    if (!agreeTop && tags.length === 0) {
      toast.error('Select or add at least one tag');
      return;
    }
    setSubmitting(true);
    try {
      const result = await mediaAPI.claimMediaTags(mediaId, {
        ...(agreeTop ? { agreeTop: true, agreeLimit: 5 } : { tags }),
      });
      toast.success(
        agreeTop ? 'Top tags backed with your tip' : 'Tags claimed with your tip'
      );
      onClaimed?.({
        tags: result.tags,
        rankedTags: result.rankedTags,
      });
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to claim tags');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4"
      style={{ zIndex: 10000 }}
    >
      <div className="bg-gray-900 rounded-xl max-w-md w-full p-6 border border-white/10">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-white">
              {postTipPrompt ? 'Back your tip with tags?' : 'Tag this tune'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            disabled={submitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {mediaTitle ? (
          <p className="text-white font-medium mb-2">{mediaTitle}</p>
        ) : null}
        <p className="text-sm text-gray-400 mb-4">
          Your tip only stakes £ behind tags you choose — nothing is auto-applied.
        </p>

        {ranked.length > 0 ? (
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
              Existing tags
            </p>
            <div className="flex flex-wrap gap-2">
              {ranked.map((item) => {
                const selected = tags.some((t) => tagsMatch(t, item.tag));
                return (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => toggleSuggested(item.tag)}
                    disabled={submitting}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    #{item.tag}
                    {typeof item.aggregate === 'number' && item.aggregate > 0
                      ? ` · ${penceToPounds(item.aggregate)}`
                      : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag"
              maxLength={20}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={addTag}
              disabled={!tagInput.trim() || tags.length >= 5 || submitting}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Max 5 · {tags.length}/5</p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void submit(false)}
            disabled={submitting || tags.length === 0}
            className="w-full py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Claim {tags.length} tag{tags.length === 1 ? '' : 's'}
          </button>
          {ranked.length > 0 ? (
            <button
              type="button"
              onClick={() => void submit(true)}
              disabled={submitting}
              className="w-full py-2 text-purple-300 hover:text-purple-200 text-sm font-medium"
            >
              Agree with top tags
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-full py-2 text-gray-400 hover:text-white text-sm"
          >
            {postTipPrompt ? 'Skip for now' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TagClaimModal;
