import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Calendar, ExternalLink, MessagesSquare, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { conversationAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { penceToPounds, poundsToPence } from '../utils/currency';

const ConversationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, updateBalance } = useAuth();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pledgeAmount, setPledgeAmount] = useState(1);
  const [pledgeMessage, setPledgeMessage] = useState('');
  const [topicText, setTopicText] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [livestreamUrl, setLivestreamUrl] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { conversation: c } = await conversationAPI.get(id);
      setConversation(c);
      if (c.livestreamUrl) setLivestreamUrl(c.livestreamUrl);
      if (c.scheduledAt) setScheduleAt(new Date(c.scheduledAt).toISOString().slice(0, 16));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Conversation not found');
      navigate('/conversations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const progress = useMemo(() => {
    if (!conversation?.goalAmount) return 0;
    return Math.min(100, Math.round((conversation.totalPledged / conversation.goalAmount) * 100));
  }, [conversation]);

  const myId = user?._id || user?.id || user?.uuid;
  const isProposer = !!(
    conversation &&
    user &&
    (
      conversation.proposedBy?._id === myId ||
      conversation.proposedBy?.uuid === myId ||
      conversation.proposedBy === myId ||
      conversation.proposedBy_uuid === myId
    )
  );
  const myParticipant = conversation?.participants?.find((p: any) => {
    const pid = p.userId?._id || p.userId?.uuid || p.userId || p.user_uuid;
    return pid && (pid === myId || pid === user?._id || pid === user?.uuid);
  });
  const myActivePledges = (conversation?.pledges || []).filter(
    (p: any) =>
      p.status === 'active' &&
      (p.userId === user?._id || p.user_uuid === user?.uuid || p.userId?._id === user?._id)
  );
  const myPledgeTotal = myActivePledges.reduce((s: number, p: any) => s + (p.amount || 0), 0);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const handlePledge = () =>
    run(async () => {
      if (!user) {
        navigate('/login');
        return;
      }
      if (poundsToPence(pledgeAmount) > (user.balance || 0)) {
        toast.error('Insufficient balance — top up your wallet');
        return;
      }
      const result = await conversationAPI.pledge(id!, pledgeAmount, pledgeMessage || undefined);
      setConversation(result.conversation);
      if (typeof result.userBalance === 'number') updateBalance(result.userBalance);
      toast.success('Pledge placed');
      setPledgeMessage('');
    });

  const handleWithdraw = () =>
    run(async () => {
      const result = await conversationAPI.withdrawPledge(id!);
      setConversation(result.conversation);
      if (typeof result.userBalance === 'number') updateBalance(result.userBalance);
      toast.success(`Refunded ${penceToPounds(result.refunded)}`);
    });

  const handleRespond = (response: 'accepted' | 'declined') =>
    run(async () => {
      const { conversation: c } = await conversationAPI.respond(id!, response);
      setConversation(c);
      toast.success(response === 'accepted' ? 'Accepted' : 'Declined');
    });

  const handleSchedule = () =>
    run(async () => {
      const { conversation: c } = await conversationAPI.schedule(id!, {
        scheduledAt: scheduleAt || undefined,
        livestreamUrl: livestreamUrl || undefined,
      });
      setConversation(c);
      toast.success('Scheduled');
    });

  const handleComplete = () =>
    run(async () => {
      const { conversation: c } = await conversationAPI.complete(id!, {
        recordingUrl: recordingUrl || undefined,
      });
      setConversation(c);
      toast.success('Marked complete — pledges released to creators');
    });

  const handleCancel = () =>
    run(async () => {
      if (!window.confirm('Cancel this conversation and refund active pledges?')) return;
      const { conversation: c } = await conversationAPI.cancel(id!);
      setConversation(c);
      toast.success('Cancelled — pledges refunded');
    });

  const handleSuggestTopic = () =>
    run(async () => {
      const { conversation: c } = await conversationAPI.suggestTopic(id!, topicText);
      setConversation(c);
      setTopicText('');
      toast.success('Topic suggested');
    });

  const handleVoteTopic = (topicId: string) =>
    run(async () => {
      const { conversation: c } = await conversationAPI.voteTopic(id!, topicId);
      setConversation(c);
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white pt-20 text-center">
        Loading...
      </div>
    );
  }

  if (!conversation) return null;

  const names = (conversation.participants || []).map((p: any) => p.displayName).join(' × ');

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white pt-16 sm:pt-20 pb-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <Link to="/conversations" className="inline-flex items-center gap-2 text-gray-300 hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Conversations
        </Link>

        <div className="flex items-center gap-2 text-purple-300 mb-2">
          <MessagesSquare className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wide">Tuneable Conversation</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 capitalize text-gray-200">{conversation.status}</span>
        </div>
        <h1 className="text-3xl font-bold mb-2">{conversation.title}</h1>
        <p className="text-purple-200 mb-3">{names}</p>
        {conversation.description && <p className="text-gray-300 mb-6">{conversation.description}</p>}

        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span>{penceToPounds(conversation.totalPledged)} pledged</span>
            <span>Goal {penceToPounds(conversation.goalAmount)}</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-2">{progress}% funded · proposed by @{conversation.proposedByUsername || conversation.proposedBy?.username}</p>
        </div>

        {/* Participants */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Participants</h2>
          <div className="space-y-2">
            {(conversation.participants || []).map((p: any) => (
              <div key={p._id || p.displayName} className="flex items-center justify-between bg-gray-900/40 border border-gray-800 rounded-lg px-3 py-2">
                <div>
                  <div className="font-medium">{p.displayName}</div>
                  <div className="text-xs text-gray-400 capitalize">{p.kind} · {p.role}</div>
                </div>
                {p.userId && (
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                    p.response === 'accepted' ? 'bg-emerald-500/20 text-emerald-300' :
                    p.response === 'declined' ? 'bg-red-500/20 text-red-300' :
                    'bg-amber-500/20 text-amber-300'
                  }`}>
                    {p.response}
                  </span>
                )}
              </div>
            ))}
          </div>
          {myParticipant && myParticipant.response === 'pending' && ['open', 'funded'].includes(conversation.status) && (
            <div className="flex gap-2 mt-3">
              <button disabled={busy} onClick={() => handleRespond('accepted')} className="flex-1 inline-flex justify-center items-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg">
                <Check className="h-4 w-4" /> Accept
              </button>
              <button disabled={busy} onClick={() => handleRespond('declined')} className="flex-1 inline-flex justify-center items-center gap-2 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
                <X className="h-4 w-4" /> Decline
              </button>
            </div>
          )}
        </section>

        {/* Pledge */}
        {['open', 'funded', 'scheduled'].includes(conversation.status) && (
          <section className="mb-8 bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-3">Pledge</h2>
            {!user ? (
              <Link to="/login" className="text-purple-300 underline">Log in to pledge</Link>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row gap-2 mb-2">
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={pledgeAmount}
                    onChange={(e) => setPledgeAmount(Number(e.target.value))}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
                    placeholder="Amount £"
                  />
                  <button disabled={busy} onClick={handlePledge} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium">
                    Pledge £{Number(pledgeAmount || 0).toFixed(2)}
                  </button>
                </div>
                <input
                  value={pledgeMessage}
                  onChange={(e) => setPledgeMessage(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-2"
                  placeholder="Optional message"
                />
                <p className="text-xs text-gray-500">Wallet: {penceToPounds(user.balance)}</p>
                {myPledgeTotal > 0 && conversation.status === 'open' && (
                  <button disabled={busy} onClick={handleWithdraw} className="mt-3 text-sm text-amber-300 hover:text-amber-200">
                    Withdraw my pledges ({penceToPounds(myPledgeTotal)})
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {/* Topics */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Topic suggestions</h2>
          <div className="space-y-2 mb-3">
            {[...(conversation.topicSuggestions || [])]
              .sort((a: any, b: any) => (b.voteCount || 0) - (a.voteCount || 0))
              .map((t: any) => (
                <div key={t._id} className="flex items-center justify-between bg-gray-900/40 border border-gray-800 rounded-lg px-3 py-2">
                  <div>
                    <div>{t.text}</div>
                    <div className="text-xs text-gray-500">by @{t.suggestedByUsername || 'anon'}</div>
                  </div>
                  <button
                    disabled={busy || !user}
                    onClick={() => handleVoteTopic(t._id)}
                    className="text-sm px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded"
                  >
                    ▲ {t.voteCount || 0}
                  </button>
                </div>
              ))}
            {(conversation.topicSuggestions || []).length === 0 && (
              <p className="text-sm text-gray-500">No topic suggestions yet.</p>
            )}
          </div>
          {user && ['open', 'funded', 'scheduled'].includes(conversation.status) && (
            <div className="flex gap-2">
              <input
                value={topicText}
                onChange={(e) => setTopicText(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
                placeholder="Suggest a topic..."
              />
              <button disabled={busy || topicText.trim().length < 3} onClick={handleSuggestTopic} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
                Add
              </button>
            </div>
          )}
        </section>

        {/* Schedule / complete for proposer */}
        {(isProposer || (user?.role || []).includes('admin')) && ['funded', 'scheduled'].includes(conversation.status) && (
          <section className="mb-8 bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> Schedule & deliver</h2>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
            />
            <input
              value={livestreamUrl}
              onChange={(e) => setLivestreamUrl(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              placeholder="Livestream URL (Zoom, YouTube, Riverside...)"
            />
            <button disabled={busy} onClick={handleSchedule} className="w-full py-2 bg-sky-600 hover:bg-sky-500 rounded-lg">
              Save schedule
            </button>
            <input
              value={recordingUrl}
              onChange={(e) => setRecordingUrl(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              placeholder="Recording URL (optional)"
            />
            <button disabled={busy} onClick={handleComplete} className="w-full py-2 bg-violet-600 hover:bg-violet-500 rounded-lg">
              Mark complete & release pledges
            </button>
          </section>
        )}

        {conversation.livestreamUrl && (
          <a
            href={conversation.livestreamUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-purple-300 mb-6"
          >
            <ExternalLink className="h-4 w-4" /> Open livestream / recording link
          </a>
        )}

        {/* Pledges list */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Pledges</h2>
          <div className="space-y-2">
            {(conversation.pledges || []).filter((p: any) => p.status === 'active' || p.status === 'released').map((p: any) => (
              <div key={p._id || p.uuid} className="flex justify-between text-sm bg-gray-900/40 border border-gray-800 rounded-lg px-3 py-2">
                <span>@{p.username}</span>
                <span className="text-gray-300">{penceToPounds(p.amount)} · {p.status}</span>
              </div>
            ))}
            {(conversation.pledges || []).filter((p: any) => p.status === 'active' || p.status === 'released').length === 0 && (
              <p className="text-sm text-gray-500">No pledges yet.</p>
            )}
          </div>
        </section>

        {(isProposer || (user?.role || []).includes('admin')) && !['completed', 'cancelled'].includes(conversation.status) && (
          <button disabled={busy} onClick={handleCancel} className="text-sm text-red-300 hover:text-red-200">
            Cancel conversation & refund pledges
          </button>
        )}
      </div>
    </div>
  );
};

export default ConversationDetail;
