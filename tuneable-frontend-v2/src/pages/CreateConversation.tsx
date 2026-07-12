import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'react-toastify';
import { conversationAPI, userAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

type ParticipantDraft = {
  kind: 'person' | 'podcast';
  role: 'participant' | 'moderator' | 'host';
  displayName: string;
  userId?: string;
  username?: string;
};

const CreateConversation: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState('');
  const [goalAmount, setGoalAmount] = useState(25);
  const [requireAcceptance, setRequireAcceptance] = useState(true);
  const [participants, setParticipants] = useState<ParticipantDraft[]>([
    { kind: 'person', role: 'participant', displayName: '' },
    { kind: 'person', role: 'participant', displayName: '' },
  ]);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [assignIndex, setAssignIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white pt-20 px-4">
        <div className="max-w-xl mx-auto text-center">
          <p className="mb-4">Sign in to propose a conversation.</p>
          <Link to="/login" className="text-purple-300 underline">Log in</Link>
        </div>
      </div>
    );
  }

  const updateParticipant = (index: number, patch: Partial<ParticipantDraft>) => {
    setParticipants((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const addParticipant = () => {
    setParticipants((prev) => [...prev, { kind: 'person', role: 'participant', displayName: '' }]);
  };

  const removeParticipant = (index: number) => {
    if (participants.length <= 2) {
      toast.info('Need at least two participants');
      return;
    }
    setParticipants((prev) => prev.filter((_, i) => i !== index));
  };

  const searchUsers = async (q: string) => {
    setUserSearch(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const data = await userAPI.searchUsers({ search: q.trim(), limit: 8 });
      setSearchResults(data.users || data || []);
    } catch {
      setSearchResults([]);
    }
  };

  const assignUser = (index: number, u: any) => {
    updateParticipant(index, {
      userId: u._id || u.uuid || u.id,
      username: u.username,
      displayName: u.username,
      kind: 'person',
    });
    setAssignIndex(null);
    setUserSearch('');
    setSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      toast.error('Title needs at least 3 characters');
      return;
    }
    if (participants.some((p) => !p.displayName.trim() && !p.userId)) {
      toast.error('Every participant needs a name or linked user');
      return;
    }
    if (goalAmount < 1) {
      toast.error('Goal must be at least £1');
      return;
    }

    setSubmitting(true);
    try {
      const { conversation } = await conversationAPI.create({
        title: title.trim(),
        description: description.trim(),
        topic: topic.trim() || undefined,
        goalAmount,
        requireAcceptance,
        participants: participants.map((p) => ({
          kind: p.kind,
          role: p.role,
          displayName: p.displayName.trim(),
          userId: p.userId,
        })),
      });
      toast.success('Conversation proposed');
      navigate(`/conversations/${conversation.uuid || conversation._id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create conversation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white pt-16 sm:pt-20 pb-24">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <Link to="/conversations" className="inline-flex items-center gap-2 text-gray-300 hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="text-3xl font-bold mb-2">Propose a conversation</h1>
        <p className="text-gray-300 mb-8">
          Name who should talk, set a funding goal, and let the community pledge.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 focus:outline-none focus:border-purple-500"
              placeholder="e.g. Two hosts debate AI music"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Topic (optional)</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 focus:outline-none focus:border-purple-500"
              placeholder="Main topic seed"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 focus:outline-none focus:border-purple-500"
              placeholder="Why should this happen?"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Funding goal (£)</label>
            <input
              type="number"
              min={1}
              step={0.01}
              value={goalAmount}
              onChange={(e) => setGoalAmount(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-300">Participants (min 2)</label>
              <button type="button" onClick={addParticipant} className="text-sm text-purple-300 inline-flex items-center gap-1">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            {participants.map((p, index) => (
              <div key={index} className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <select
                    value={p.kind}
                    onChange={(e) => updateParticipant(index, { kind: e.target.value as 'person' | 'podcast' })}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm"
                  >
                    <option value="person">Person</option>
                    <option value="podcast">Podcast</option>
                  </select>
                  <select
                    value={p.role}
                    onChange={(e) => updateParticipant(index, { role: e.target.value as ParticipantDraft['role'] })}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm"
                  >
                    <option value="participant">Participant</option>
                    <option value="host">Host</option>
                    <option value="moderator">Moderator</option>
                  </select>
                  <button type="button" onClick={() => removeParticipant(index)} className="px-2 text-gray-400 hover:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input
                  value={p.displayName}
                  onChange={(e) => updateParticipant(index, { displayName: e.target.value, userId: undefined, username: undefined })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
                  placeholder={p.kind === 'podcast' ? 'Podcast name' : 'Name or @username'}
                />
                {p.username && (
                  <p className="text-xs text-emerald-300">Linked: @{p.username}</p>
                )}
                <button
                  type="button"
                  onClick={() => setAssignIndex(assignIndex === index ? null : index)}
                  className="text-xs text-purple-300 inline-flex items-center gap-1"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Link Tuneable user
                </button>
                {assignIndex === index && (
                  <div className="space-y-2">
                    <input
                      value={userSearch}
                      onChange={(e) => searchUsers(e.target.value)}
                      placeholder="Search users..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                    />
                    {searchResults.length > 0 && (
                      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                        {searchResults.map((u) => (
                          <button
                            key={u._id || u.uuid}
                            type="button"
                            onClick={() => assignUser(index, u)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm"
                          >
                            @{u.username}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={requireAcceptance}
              onChange={(e) => setRequireAcceptance(e.target.checked)}
            />
            Require linked participants to accept before funding unlocks
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 rounded-lg font-medium"
          >
            {submitting ? 'Creating...' : 'Publish conversation'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateConversation;
