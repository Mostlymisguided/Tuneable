import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from '../utils/toast';
import { creatorAPI, authAPI, userAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  ARTIST_INVITE_AFFILIATE_PERCENT,
  FOUNDING_CREATOR_CAP,
  FOUNDING_UPLOAD_QUOTA_MB,
} from '../constants';
import {
  User,
  Music,
  Award,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Gift,
  Upload,
} from 'lucide-react';

type FoundingProgramStatus = {
  cap: number;
  claimed: number;
  remaining: number;
  open: boolean;
  uploadQuotaMb: number;
  affiliatePercent: number;
};

const fallbackFoundingStatus = (): FoundingProgramStatus => ({
  cap: FOUNDING_CREATOR_CAP,
  claimed: 0,
  remaining: FOUNDING_CREATOR_CAP,
  open: true,
  uploadQuotaMb: FOUNDING_UPLOAD_QUOTA_MB,
  affiliatePercent: ARTIST_INVITE_AFFILIATE_PERCENT,
});

const CreatorRegister: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, register: registerUser, refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [foundingStatus, setFoundingStatus] = useState<FoundingProgramStatus>(fallbackFoundingStatus);

  const isAuthenticated = !!user;

  const [formData, setFormData] = useState({
    artistName: '',
    genres: [] as string[],
    roles: [] as string[],
    website: '',
  });

  const [accountData, setAccountData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
  });

  const [fieldErrors, setFieldErrors] = useState({
    email: '',
    username: '',
  });

  const [parentInviteCode, setParentInviteCode] = useState('');
  const [inviteCodeValid, setInviteCodeValid] = useState<boolean | null>(null);
  const [inviterUsername, setInviterUsername] = useState('');
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [inviteLocked, setInviteLocked] = useState(false);
  const [foundingEligible, setFoundingEligible] = useState(false);
  const [alreadyFounding, setAlreadyFounding] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const [requestStatus, setRequestStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [isRequesting, setIsRequesting] = useState(false);

  const usernameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [genreInput, setGenreInput] = useState('');

  useEffect(() => {
    let cancelled = false;
    userAPI.getFoundingCreatorsStatus()
      .then((status) => {
        if (cancelled || !status) return;
        const cap = Number(status.cap) || FOUNDING_CREATOR_CAP;
        const claimed = Number(status.claimed) || 0;
        const remaining = Number.isFinite(Number(status.remaining))
          ? Number(status.remaining)
          : Math.max(0, cap - claimed);
        setFoundingStatus({
          cap,
          claimed,
          remaining,
          open: status.open != null ? Boolean(status.open) : remaining > 0,
          uploadQuotaMb: Number(status.uploadQuotaMb) || FOUNDING_UPLOAD_QUOTA_MB,
          affiliatePercent: Number(status.affiliatePercent) || ARTIST_INVITE_AFFILIATE_PERCENT,
        });
      })
      .catch(() => {
        if (!cancelled) setFoundingStatus(fallbackFoundingStatus());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const inviteParam = searchParams.get('invite');
    if (!inviteParam || inviteLocked) return;
    const code = inviteParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    setParentInviteCode(code);
  }, [searchParams, inviteLocked]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    userAPI.getMyFoundingCreator()
      .then((data) => {
        if (cancelled || !data) return;
        setFoundingEligible(Boolean(data.eligible));
        setAlreadyFounding(Boolean(data.isFoundingCreator));
        const status = data.foundingRequestStatus;
        if (status === 'pending' || status === 'approved' || status === 'rejected') {
          setRequestStatus(status);
        }
        if (data.foundingRequestNote) setRequestNote(data.foundingRequestNote);
        if (data.parentInviteCode) {
          setParentInviteCode(String(data.parentInviteCode).toUpperCase());
          setInviteCodeValid(true);
          setInviterUsername(data.inviterUsername || '');
          setInviteLocked(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (inviteLocked) {
      setIsValidatingCode(false);
      return;
    }
    const code = parentInviteCode.trim().toUpperCase();
    if (!code) {
      setInviteCodeValid(null);
      setInviterUsername('');
      setIsValidatingCode(false);
      return;
    }
    if (code.length !== 5) {
      setInviteCodeValid(false);
      setInviterUsername('');
      setIsValidatingCode(false);
      return;
    }

    let cancelled = false;
    setIsValidatingCode(true);
    const timer = window.setTimeout(() => {
      authAPI.validateInvite(code)
        .then((data) => {
          if (cancelled) return;
          setInviteCodeValid(Boolean(data.valid));
          setInviterUsername(data.inviterUsername || '');
        })
        .catch(() => {
          if (cancelled) return;
          setInviteCodeValid(false);
          setInviterUsername('');
        })
        .finally(() => {
          if (!cancelled) setIsValidatingCode(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [parentInviteCode, inviteLocked]);

  const availableGenres = [
    'Electronic', 'Techno', 'House', 'Minimal', 'D&B', 'Jungle', 'Trance',
    'Indie', 'Folk', 'Blues', 'Soul', 'Pop', 'Rock', 'Hip Hop', 'Rap', 'R&B',
    'Country', 'Jazz', 'Disco', 'Classical', 'Reggae', 'Metal',
    'Funk', 'Punk', 'Alternative', 'Dance', 'Latin', 'World', 'Comedy', 'News',
    'Politics', 'Business', 'Tech', 'Science', 'Health', 'Spirituality', 'Philosophy',
    'History', 'Culture', 'Self Development', 'True Crime', 'Documentary', 'Audiobook',
  ];

  const availableRoles: { id: string; label: string }[] = [
    { id: 'artist', label: 'Artist' },
    { id: 'producer', label: 'Producer' },
    { id: 'songwriter', label: 'Songwriter' },
    { id: 'composer', label: 'Composer' },
    { id: 'DJ', label: 'DJ' },
    { id: 'vocalist', label: 'Vocalist' },
    { id: 'instrumentalist', label: 'Instrumentalist' },
    { id: 'podcaster', label: 'Podcaster' },
    { id: 'host', label: 'Host' },
    { id: 'guest', label: 'Guest' },
    { id: 'narrator', label: 'Narrator' },
    { id: 'director', label: 'Director' },
    { id: 'cinematographer', label: 'Cinematographer' },
    { id: 'editor', label: 'Editor' },
    { id: 'author', label: 'Author' },
    { id: 'mixedBy', label: 'Mixer' },
    { id: 'masteredBy', label: 'Mastering engineer' },
    { id: 'reporter', label: 'Reporter' },
    { id: 'publisher', label: 'Publisher' },
  ];

  const isBasicValid = () => (
    formData.artistName.trim().length > 0 && formData.roles.length > 0
  );

  const isAccountValid = () => (
    accountData.email.trim().length > 0 &&
    accountData.password.length >= 6 &&
    accountData.password === accountData.confirmPassword &&
    accountData.username.trim().length > 0
  );

  const isMusicValid = () => formData.genres.length > 0;

  const isMusicStep = isAuthenticated ? step === 2 : step === 3;

  const handleNextStep = async () => {
    if (step === 2 && !isAuthenticated) {
      if (!isAccountValid()) {
        toast.error('Please complete all account creation fields');
        return;
      }
      if (isCreatingAccount) return;

      setIsCreatingAccount(true);
      try {
        await registerUser({
          email: accountData.email,
          password: accountData.password,
          username: accountData.username,
          ...(parentInviteCode.length === 5 && inviteCodeValid !== false
            ? { parentInviteCode }
            : {}),
        });

        toast.success('Account created successfully!');
        // Authenticated flow: step 2 is music details.
        setStep(2);
      } catch (error: any) {
        console.error('Error registering user:', error);
        const errorResponse = error.response?.data || {};
        const errorMessage = errorResponse.error || error.message || 'Failed to create account';
        const errorField = errorResponse.field;

        setFieldErrors({ email: '', username: '' });

        if (errorField === 'email' || errorMessage.toLowerCase().includes('email already')) {
          setFieldErrors(prev => ({
            ...prev,
            email: 'This email is already registered.',
          }));
          setTimeout(() => {
            emailInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            emailInputRef.current?.focus();
          }, 100);
        } else if (errorField === 'username' || errorMessage.toLowerCase().includes('username already')) {
          setFieldErrors(prev => ({
            ...prev,
            username: 'This username is already taken. Please choose another. You can change your display name after signing up.',
          }));
          setTimeout(() => {
            usernameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            usernameInputRef.current?.focus();
          }, 100);
        } else {
          toast.error(errorMessage);
        }
      } finally {
        setIsCreatingAccount(false);
      }
      return;
    }

    setStep(step + 1);
  };

  const handleSubmit = async () => {
    if (!isBasicValid()) {
      toast.error('Please complete all required fields in step 1');
      return;
    }
    if (!isMusicValid()) {
      toast.error('Please add at least one tag');
      return;
    }

    setIsSubmitting(true);

    try {
      let eligibleNow = foundingEligible || inviteLocked;
      if (parentInviteCode.length === 5 && inviteCodeValid && !inviteLocked) {
        const attached = await userAPI.attachFoundingInvite(parentInviteCode);
        eligibleNow = true;
        setFoundingEligible(true);
        setInviteLocked(true);
        if (attached?.inviterUsername) setInviterUsername(attached.inviterUsername);
      }

      const submitData = new FormData();
      submitData.append('artistName', formData.artistName);
      submitData.append('genres', JSON.stringify(formData.genres));
      submitData.append('roles', JSON.stringify(formData.roles));
      submitData.append('website', formData.website);

      await creatorAPI.apply(submitData);
      await refreshUser();

      toast.success(
        alreadyFounding
          ? 'You\'re a creator.'
          : eligibleNow && foundingStatus.open
            ? 'You\'re a creator. Upload your own music to claim a founding share.'
            : requestStatus === 'pending'
              ? 'You\'re a creator. Your founding request is in review. You can still upload.'
              : 'You\'re a creator. A founding share needs an invite or an approved request.'
      );
      navigate('/creator/upload');
    } catch (error: any) {
      console.error('Error submitting creator application:', error);
      toast.error(error.response?.data?.error || 'Failed to submit application');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addGenre = (genre: string) => {
    if (genre && !formData.genres.includes(genre)) {
      setFormData({ ...formData, genres: [...formData.genres, genre] });
      setGenreInput('');
    }
  };

  const removeGenre = (genre: string) => {
    setFormData({
      ...formData,
      genres: formData.genres.filter(g => g !== genre),
    });
  };

  const toggleRole = (role: string) => {
    if (formData.roles.includes(role)) {
      setFormData({
        ...formData,
        roles: formData.roles.filter(r => r !== role),
      });
    } else {
      setFormData({
        ...formData,
        roles: [...formData.roles, role],
      });
    }
  };

  const renderBasicStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <User className="h-6 w-6 mr-2 text-purple-400" />
          Basic Information
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">
              Creator/Stage Name *
            </label>
            <input
              type="text"
              value={formData.artistName}
              onChange={(e) => setFormData({ ...formData, artistName: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="Your professional name"
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-white font-medium mb-2">
              Your Roles* (Select All That Apply)
            </label>
            <div className="flex flex-wrap gap-2">
              {availableRoles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.id)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    formData.roles.includes(role.id)
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAccountStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <User className="h-6 w-6 mr-2 text-purple-400" />
          Create Your Account
        </h3>

        {inviterUsername && inviteCodeValid && (
          <div className="flex items-center text-sm text-green-300 bg-green-900/20 border border-green-500/30 rounded-lg px-3 py-2">
            <Gift className="h-4 w-4 mr-2 flex-shrink-0" />
            Invited by <strong className="ml-1">@{inviterUsername}</strong>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">
              Email Address *
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                ref={emailInputRef}
                type="email"
                value={accountData.email}
                onChange={(e) => {
                  setAccountData({ ...accountData, email: e.target.value });
                  if (fieldErrors.email) {
                    setFieldErrors(prev => ({ ...prev, email: '' }));
                  }
                }}
                className={`w-full pl-10 pr-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                  fieldErrors.email
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-600 focus:border-purple-500 focus:ring-purple-500'
                }`}
                placeholder="your@email.com"
                required
              />
            </div>
            {fieldErrors.email && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-white font-medium mb-2">
              Username *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                ref={usernameInputRef}
                type="text"
                value={accountData.username}
                onChange={(e) => {
                  setAccountData({ ...accountData, username: e.target.value });
                  if (fieldErrors.username) {
                    setFieldErrors(prev => ({ ...prev, username: '' }));
                  }
                }}
                className={`w-full pl-10 pr-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                  fieldErrors.username
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-600 focus:border-purple-500 focus:ring-purple-500'
                }`}
                placeholder="Choose a username"
                required
              />
            </div>
            {fieldErrors.username && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.username}</p>
            )}
          </div>

          <div>
            <label className="block text-white font-medium mb-2">
              Password *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={accountData.password}
                onChange={(e) => setAccountData({ ...accountData, password: e.target.value })}
                className="w-full pl-10 pr-10 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="Password (min 6 characters)"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-white font-medium mb-2">
              Confirm Password *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={accountData.confirmPassword}
                onChange={(e) => setAccountData({ ...accountData, confirmPassword: e.target.value })}
                className="w-full pl-10 pr-10 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="Confirm your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {accountData.password && accountData.confirmPassword && accountData.password !== accountData.confirmPassword && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderMusicStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <Music className="h-6 w-6 mr-2 text-purple-400" />
          Tags
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">
              Tags * (add at least one)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addGenre(genreInput);
                  }
                }}
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="Type or select a tag"
              />
              <button
                type="button"
                onClick={() => addGenre(genreInput)}
                disabled={!genreInput.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {availableGenres.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => addGenre(genre)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-full transition-colors"
                >
                  + {genre}
                </button>
              ))}
            </div>

            {formData.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.genres.map((genre) => (
                  <span
                    key={genre}
                    className="inline-flex items-center px-3 py-1 bg-purple-600 text-white rounded-full text-sm"
                  >
                    {genre}
                    <button
                      type="button"
                      onClick={() => removeGenre(genre)}
                      className="ml-2 hover:text-gray-300"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-white font-medium mb-2">
              Website
            </label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="https://yourwebsite.com"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const handleFoundingRequest = async () => {
    if (!isAuthenticated) {
      toast.error('Create your account first, then send the request');
      return;
    }
    if (isRequesting) return;
    setIsRequesting(true);
    try {
      const result = await userAPI.requestFoundingSeat(requestNote);
      setRequestStatus('pending');
      toast.success(result?.alreadyPending
        ? 'You already have a request in review'
        : 'Request sent. A share is claimed only if it is approved and you upload your own music.');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to send request');
    } finally {
      setIsRequesting(false);
    }
  };

  const renderFoundingStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-2 flex items-center">
          <Award className="h-6 w-6 mr-2 text-amber-400" />
          Founding Creators
        </h3>
        <p className="text-gray-300 mb-6">
          {alreadyFounding
            ? 'You already have a founding share. We will issue shares where possible.'
            : foundingStatus.open
              ? `${foundingStatus.remaining.toLocaleString()} of ${foundingStatus.cap.toLocaleString()} shares left. A share is claimed when you upload your own music, and only if you have an invite or an approved request. We will issue shares where possible.`
              : `All ${foundingStatus.cap.toLocaleString()} founding shares are claimed. You can still become a creator and upload your music.`}
        </p>

        {foundingStatus.open && !alreadyFounding && (
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-white font-medium mb-2" htmlFor="founding-invite-code">
                Invite code
              </label>
              <input
                id="founding-invite-code"
                type="text"
                value={parentInviteCode}
                disabled={inviteLocked}
                maxLength={5}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => {
                  const code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
                  setParentInviteCode(code);
                }}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-amber-500 disabled:opacity-70 tracking-[0.3em] uppercase"
                placeholder="ABCDE"
              />
              <p className="text-sm mt-2 text-gray-300">
                {isValidatingCode ? (
                  'Checking invite…'
                ) : inviteCodeValid && inviterUsername ? (
                  <>Invited by <strong className="text-white">@{inviterUsername}</strong>. You are eligible. The share is still claimed when you upload.</>
                ) : inviteCodeValid && parentInviteCode ? (
                  <>Invite code {parentInviteCode} is valid. You are eligible. The share is still claimed when you upload.</>
                ) : inviteCodeValid === false ? (
                  'That invite code is invalid. You can still finish signup, or request a share below.'
                ) : (
                  'Have a code from another creator? Enter it here. A link with ?invite= is filled in for you.'
                )}
              </p>
            </div>

            {foundingEligible && !inviteLocked && !(inviteCodeValid && parentInviteCode.length === 5) && (
              <p className="text-sm text-amber-200">
                You are eligible{requestStatus === 'approved' ? ' — your request was approved' : ''}. The share is still claimed when you upload your own music.
              </p>
            )}

            {!foundingEligible && !inviteLocked && !(inviteCodeValid && parentInviteCode.length === 5) && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3">
                <p className="text-sm text-gray-200">
                  No invite? Request a founding share. Approval makes you eligible. It does not assign the share.
                </p>
                {requestStatus === 'pending' ? (
                  <p className="text-sm text-amber-200">
                    Request sent. You can finish signup and upload. A share is claimed only after this is approved, and only while shares remain.
                  </p>
                ) : (
                  <>
                    {requestStatus === 'rejected' && (
                      <p className="text-sm text-gray-400">Your last request was not approved. You can send another.</p>
                    )}
                    <textarea
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value.slice(0, 500))}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-amber-500 min-h-[90px]"
                      placeholder="Optional note — music, links, why you want a share"
                      maxLength={500}
                    />
                    <button
                      type="button"
                      onClick={handleFoundingRequest}
                      disabled={isRequesting}
                      className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {isRequesting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        'Request a founding share'
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-amber-500/30 bg-amber-900/20 p-5 space-y-3 text-sm text-amber-50">
          <p>
            <strong className="text-white">{foundingStatus.uploadQuotaMb.toLocaleString()} MB</strong> upload allowance for founding creators.
          </p>
          <p>
            Founding creators who invite an artist earn <strong className="text-white">{foundingStatus.affiliatePercent}%</strong> of that artist&apos;s paid tips for the first year after that artist is verified, taken from Tuneable&apos;s share, on music they upload themselves. The founding creator&apos;s own profile must be complete and verified before that share is paid.
          </p>
          <p>We will issue shares where possible.</p>
        </div>
      </div>
    </div>
  );

  const renderStepContent = () => {
    if (!isAuthenticated) {
      switch (step) {
        case 1: return renderBasicStep();
        case 2: return renderAccountStep();
        case 3: return renderMusicStep();
        case 4: return renderFoundingStep();
        default: return null;
      }
    }
    switch (step) {
      case 1: return renderBasicStep();
      case 2: return renderMusicStep();
      case 3: return renderFoundingStep();
      default: return null;
    }
  };

  useEffect(() => {
    const stepParam = searchParams.get('step');
    if (!stepParam) return;
    const stepNum = parseInt(stepParam, 10);
    const maxStep = isAuthenticated ? 3 : 4;
    if (!isNaN(stepNum) && stepNum >= 1 && stepNum <= maxStep) {
      setStep(stepNum);
    }
  }, [searchParams, isAuthenticated]);

  const totalSteps = isAuthenticated ? 3 : 4;
  const stepLabels = isAuthenticated
    ? ['Basic', 'Tags', 'Founding']
    : ['Basic', 'Account', 'Tags', 'Founding'];

  const nextDisabled = isCreatingAccount
    || (step === 1 && !isBasicValid())
    || (step === 2 && !isAuthenticated && !isAccountValid())
    || (isMusicStep && !isMusicValid())
    || isValidatingCode;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-8 pb-40">
      <div className="max-w-3xl mx-auto px-4">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Become a Creator</h1>
          {(parentInviteCode || inviterUsername) && !isAuthenticated && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-800/50 border border-purple-400/30 text-sm text-purple-100">
              <Gift className="h-4 w-4 flex-shrink-0" />
              {isValidatingCode ? (
                <span>Checking invite…</span>
              ) : inviteCodeValid && inviterUsername ? (
                <span>Invited by <strong>@{inviterUsername}</strong></span>
              ) : inviteCodeValid === false ? (
                <span>That invite code is invalid. You can still sign up.</span>
              ) : (
                <span>Invite code {parentInviteCode}</span>
              )}
            </div>
          )}
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((stepNum) => (
              <React.Fragment key={stepNum}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                      stepNum < step
                        ? 'bg-green-600 text-white'
                        : stepNum === step
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {stepNum < step ? <CheckCircle className="h-6 w-6" /> : stepNum}
                  </div>
                  <span className="text-xs text-gray-400 mt-1 hidden sm:block">
                    {stepLabels[stepNum - 1]}
                  </span>
                </div>
                {stepNum < totalSteps && (
                  <div
                    className={`flex-1 h-1 mx-2 transition-colors ${
                      stepNum < step ? 'bg-green-600' : 'bg-gray-700'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="bg-black/20 backdrop-blur-sm rounded-lg p-8 border border-white/10">
          {renderStepContent()}

          <div className="flex justify-between mt-8 pt-6 border-t border-gray-700">
            <button
              type="button"
              onClick={() => step === 1 ? navigate(-1) : setStep(step - 1)}
              className="flex items-center px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < totalSteps ? (
              <button
                type="button"
                onClick={handleNextStep}
                disabled={nextDisabled}
                className="flex items-center px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {isCreatingAccount ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || isValidatingCode}
                className="flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5 mr-2" />
                    Finish and continue to upload
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatorRegister;
