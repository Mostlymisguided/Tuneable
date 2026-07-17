import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Award, Ban, CheckCircle, X } from 'lucide-react';
import { claimAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { isCreator } from '../utils/permissionHelpers';

export type ClaimIntent = 'claim_keep' | 'takedown';

type Step = 'intent' | 'login' | 'creator' | 'proof';

interface ClaimMediaModalProps {
  mediaId: string;
  mediaTitle: string;
  contentLabel?: 'Tune' | 'Episode';
  onClose: () => void;
  onSubmitted?: () => void;
}

const ClaimMediaModal: React.FC<ClaimMediaModalProps> = ({
  mediaId,
  mediaTitle,
  contentLabel = 'Tune',
  onClose,
  onSubmitted,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('intent');
  const [intent, setIntent] = useState<ClaimIntent | null>(null);
  const [proofText, setProofText] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const continueAfterIntent = (selected: ClaimIntent) => {
    setIntent(selected);
    if (!user) {
      setStep('login');
      return;
    }
    if (selected === 'claim_keep' && !isCreator(user)) {
      setStep('creator');
      return;
    }
    setStep('proof');
  };

  const handleSubmit = async () => {
    if (!intent) return;
    if (!proofText.trim()) {
      toast.error('Please provide proof of ownership');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('mediaId', mediaId);
      formData.append('proofText', proofText.trim());
      formData.append('intent', intent);
      proofFiles.forEach((file) => {
        formData.append('proofFiles', file);
      });

      await claimAPI.submitClaim(formData);

      toast.success(
        intent === 'takedown'
          ? 'Takedown request submitted for review. Supporters will be refunded if approved.'
          : 'Claim submitted for review! We\'ll notify you when it\'s processed.'
      );
      onSubmitted?.();
      onClose();
    } catch (err: any) {
      console.error('Error submitting claim:', err);
      toast.error(err.response?.data?.error || 'Failed to submit claim');
    } finally {
      setSubmitting(false);
    }
  };

  const titleByStep: Record<Step, string> = {
    intent: `This is my ${contentLabel.toLowerCase()}`,
    login: 'Sign in to continue',
    creator: 'Enable creator mode',
    proof: intent === 'takedown' ? `Take down "${mediaTitle}"` : `Claim "${mediaTitle}"`,
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
      <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">{titleByStep[step]}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            disabled={submitting}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {step === 'intent' && (
          <>
            <p className="text-gray-300 mb-6">
              This {contentLabel.toLowerCase()} is awaiting rights clearance. What would you like to do?
            </p>

            <div className="space-y-3 mb-6">
              <button
                type="button"
                onClick={() => continueAfterIntent('claim_keep')}
                className="w-full text-left p-4 rounded-lg border border-emerald-500/40 bg-emerald-900/20 hover:bg-emerald-900/40 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Award className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-white font-semibold">Claim & keep it live</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Verify you&apos;re the rights holder, attach ownership, and receive tips held in escrow.
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => continueAfterIntent('takedown')}
                className="w-full text-left p-4 rounded-lg border border-red-500/40 bg-red-900/20 hover:bg-red-900/40 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Ban className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-white font-semibold">Take it down</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Remove this {contentLabel.toLowerCase()} from Tuneable and refund active tips to supporters.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <button onClick={onClose} className="btn-secondary w-full">
              Cancel
            </button>
          </>
        )}

        {step === 'login' && (
          <>
            <p className="text-gray-300 mb-6">
              {intent === 'takedown'
                ? 'Sign in so we can verify your takedown request and refund supporters if approved.'
                : 'Sign in (and enable creator mode if needed) to claim this media and receive tips.'}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => navigate('/login')}
                className="btn-primary flex-1"
              >
                Sign in
              </button>
              <button onClick={() => setStep('intent')} className="btn-secondary">
                Back
              </button>
            </div>
          </>
        )}

        {step === 'creator' && (
          <>
            <p className="text-gray-300 mb-6">
              To claim ownership and earn from tips, enable creator mode on your account.
            </p>
            <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4 mb-6">
              <h3 className="text-white font-semibold mb-2">Creator benefits</h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-purple-400" />
                  Claim ownership of your tracks
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-purple-400" />
                  Earn from fan tips held in escrow
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-purple-400" />
                  Access creator analytics and verification
                </li>
              </ul>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  onClose();
                  navigate('/creator/register');
                }}
                className="btn-primary flex-1"
              >
                Enable creator mode
              </button>
              <button onClick={() => setStep('intent')} className="btn-secondary">
                Back
              </button>
            </div>
          </>
        )}

        {step === 'proof' && (
          <>
            <p className="text-gray-300 mb-4">
              {intent === 'takedown'
                ? `To verify you're the rights holder and remove this ${contentLabel.toLowerCase()}, provide proof of ownership:`
                : `To verify you're a creator of this ${contentLabel.toLowerCase()}, provide proof of ownership:`}
            </p>

            {intent === 'takedown' && (
              <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3 mb-4">
                <p className="text-red-200 text-sm">
                  If approved, this {contentLabel.toLowerCase()} will be removed and active tips will be refunded to supporters.
                  You will not receive tip revenue from a takedown.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-white font-medium mb-2">Proof of ownership</label>
              <textarea
                value={proofText}
                onChange={(e) => setProofText(e.target.value)}
                placeholder="Describe your role and provide links to social media, streaming profiles, distribution platforms, or other verification..."
                className="input min-h-32"
                maxLength={2000}
                disabled={submitting}
              />
              <div className="text-xs text-gray-400 mt-1">{proofText.length}/2000 characters</div>
            </div>

            <div className="mb-4">
              <label className="block text-white font-medium mb-2">
                Supporting documents (optional)
              </label>
              <input
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => setProofFiles(Array.from(e.target.files || []))}
                disabled={submitting}
                className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
              />
              <p className="text-xs text-gray-400 mt-2">
                Upload screenshots, contracts, distribution receipts, or other proof
              </p>
              {proofFiles.length > 0 && (
                <div className="mt-2 text-sm text-gray-300">{proofFiles.length} file(s) selected</div>
              )}
            </div>

            <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-lg p-3 mb-4">
              <p className="text-yellow-200 text-sm">
                <strong>Note:</strong> Requests are reviewed by our team. False claims may result in account suspension.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleSubmit}
                disabled={!proofText.trim() || submitting}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? 'Submitting...'
                  : intent === 'takedown'
                    ? 'Submit takedown request'
                    : 'Submit claim'}
              </button>
              <button
                onClick={() => setStep('intent')}
                className="btn-secondary"
                disabled={submitting}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ClaimMediaModal;

export function isRightsPendingClaimable(media: {
  rightsStatus?: string;
  rightsCleared?: boolean;
} | null | undefined): boolean {
  if (!media) return false;
  return media.rightsStatus === 'pending' && !media.rightsCleared;
}
