import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Crown, Globe, Instagram, Minus, Music, Plus, Youtube } from 'lucide-react';
import { artistCatalogAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../seo/usePageMeta';
import { getUserProfileUrl } from '../utils/profileNavigation';
import { toast } from '../utils/toast';
import UserAvatar from '../components/UserAvatar';
import MediaChampions from '../components/MediaChampions';
import TippedMediaQueueList, { type TippedQueueItem } from '../components/TippedMediaQueueList';

type ClaimedBy = {
  _id?: string;
  username?: string;
  uuid?: string;
  profilePic?: string | null;
  artistName?: string | null;
};

type CatalogPage = {
  catalog: {
    slug: string;
    name: string;
    aliases: string[];
    bio: string;
    genres: string[];
    profilePic: string;
    website: string;
    socialMedia?: {
      instagram?: string;
      spotify?: string;
      youtube?: string;
      soundcloud?: string;
      twitter?: string;
    };
    status: 'unclaimed' | 'claimed';
    claimedBy: ClaimedBy | null;
  };
  queue?: TippedQueueItem[];
  viewerClaim: { status: string; reviewNotes?: string; submittedAt?: string } | null;
};

type SocialLink = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
};

function errorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return data || fallback;
}

function externalHref(value: string | undefined, site?: string) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (site) return `https://${site}/${text.replace(/^@/, '')}`;
  return `https://${text}`;
}

const SoundCloudIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.144c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.144-.27-2.154c-.009-.054-.049-.1-.084-.1m-.099-1.521c-.06 0-.114.047-.117.113l-.282 3.662.282 3.649c.002.062.058.11.117.11.056 0 .105-.048.117-.11l.326-3.649-.326-3.662c-.012-.066-.061-.113-.117-.113m2.147-1.36c-.075 0-.132.061-.136.141l-.328 5.02.328 4.99c.004.076.061.13.136.13.07 0 .129-.054.136-.13l.375-4.99-.375-5.02c-.007-.08-.066-.141-.136-.141m4.289-2.459c-.086 0-.155.071-.16.16l-.367 7.08.367 7.046c.004.086.074.15.16.15.083 0 .15-.064.16-.15l.42-7.046-.42-7.08c-.01-.089-.077-.16-.16-.16m-.98.731c-.082 0-.147.066-.152.152l-.348 6.35.348 6.32c.005.083.07.145.152.145.078 0 .142-.062.152-.145l.396-6.32-.396-6.35c-.01-.086-.074-.152-.152-.152m2.447-1.428c-.09 0-.163.074-.168.167l-.387 7.577.387 7.54c.005.09.078.158.168.158.087 0 .158-.068.168-.158l.443-7.54-.443-7.577c-.01-.093-.081-.167-.168-.167m5.348-.118c-.005-.501-.058-1.836-1.47-3.02-.632-.53-1.503-.794-2.588-.794v13.405h6.69c2.074 0 3.771-1.686 3.771-3.76 0-2.031-1.609-3.688-3.616-3.76l-.787-.071" />
  </svg>
);

function socialLinks(catalog: CatalogPage['catalog']): SocialLink[] {
  const social = catalog.socialMedia || {};
  const links: SocialLink[] = [];
  const website = externalHref(catalog.website);
  if (website) {
    links.push({
      name: 'Website',
      href: website,
      icon: Globe,
      color: 'hover:bg-purple-600/30 hover:border-purple-500 text-purple-300',
    });
  }
  const instagram = externalHref(social.instagram, 'instagram.com');
  if (instagram) {
    links.push({
      name: 'Instagram',
      href: instagram,
      icon: Instagram,
      color: 'hover:bg-pink-600/30 hover:border-pink-500 text-pink-400',
    });
  }
  const youtube = externalHref(social.youtube, 'youtube.com');
  if (youtube) {
    links.push({
      name: 'YouTube',
      href: youtube,
      icon: Youtube,
      color: 'hover:bg-red-600/30 hover:border-red-500 text-red-400',
    });
  }
  const soundcloud = externalHref(social.soundcloud, 'soundcloud.com');
  if (soundcloud) {
    links.push({
      name: 'SoundCloud',
      href: soundcloud,
      icon: SoundCloudIcon,
      color: 'hover:bg-orange-600/30 hover:border-orange-500 text-orange-400',
    });
  }
  const spotify = externalHref(social.spotify, 'open.spotify.com');
  if (spotify) {
    links.push({
      name: 'Spotify',
      href: spotify,
      icon: Music,
      color: 'hover:bg-green-600/30 hover:border-green-500 text-green-400',
    });
  }
  return links;
}

const ArtistCatalogPage: React.FC = () => {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [showChampions, setShowChampions] = useState(false);
  const [playableOnly, setPlayableOnly] = useState(false);
  const [proofText, setProofText] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadPage = useCallback(async () => {
    const data = await artistCatalogAPI.get(slug);
    setPage(data);
    setMissing(false);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    artistCatalogAPI.get(slug)
      .then((data) => {
        if (!cancelled) setPage(data);
      })
      .catch((error: { response?: { status?: number } }) => {
        if (cancelled) return;
        if (error?.response?.status === 404) setMissing(true);
        else toast.error(errorMessage(error, 'Failed to load artist page'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const catalog = page?.catalog;
  usePageMeta(catalog ? {
    title: catalog.name,
    description: catalog.bio || `${catalog.name} on Tuneable.`,
    path: `/artist/${catalog.slug}`,
    image: catalog.profilePic || undefined,
  } : null);

  const submitClaim = async () => {
    if (!user) {
      navigate(`/login?returnUrl=${encodeURIComponent(`/artist/${slug}`)}`);
      return;
    }
    if (proofText.trim().length < 10) {
      toast.error('Add a short explanation of how this catalog is yours');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('proofText', proofText.trim());
      proofFiles.forEach((file) => formData.append('proofFiles', file));
      await artistCatalogAPI.submitClaim(slug, formData);
      toast.success('Claim submitted');
      setProofText('');
      setProofFiles([]);
      setShowClaim(false);
      await loadPage();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to submit claim'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading profile...</div>
      </div>
    );
  }

  if (missing || !page || !catalog) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Artist page not found</div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg font-medium transition-colors bg-black/20 text-white hover:bg-gray-700/30"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const queue = page.queue || [];
  const links = socialLinks(catalog);
  const claimPending = page.viewerClaim?.status === 'pending';
  const unclaimed = catalog.status !== 'claimed';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-2 md:px-4 py-8">
        <div className="mb-8 relative">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-3 md:px-4 py-2 mb-4 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30 text-sm md:text-base"
          >
            Back
          </button>

          {unclaimed && (
            <div className="inline rounded-full items-center absolute right-0 top-0 md:right-3 mb-4 flex space-x-2">
              <button
                type="button"
                onClick={() => setShowClaim((open) => !open)}
                className="px-3 md:px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all text-sm md:text-base"
              >
                {claimPending ? 'Claim pending' : 'Claim'}
              </button>
            </div>
          )}

          <div className="card p-4 flex flex-col sm:flex-row items-start relative">
            <div className="flex-shrink-0 relative mb-2 md:mb-0 md:mr-4">
              <UserAvatar
                name={catalog.name}
                profilePic={catalog.profilePic}
                alt={`${catalog.name} profile`}
                className="shadow-xl object-cover"
                style={{ width: '200px', height: '200px' }}
              />
            </div>

            <div className="flex-1 text-white">
              <h1 className="text-4xl font-bold mb-2">{catalog.name}</h1>
              {catalog.aliases.length > 0 && (
                <p className="text-xl text-gray-300 mb-2">{catalog.aliases.join(', ')}</p>
              )}
              {catalog.status === 'claimed' && catalog.claimedBy ? (
                <p className="text-gray-300 mb-3">
                  <Link to={getUserProfileUrl(catalog.claimedBy)} className="text-purple-200 hover:text-white">
                    @{catalog.claimedBy.username}
                  </Link>
                </p>
              ) : (
                <p className="text-gray-300 mb-3">Hasn't joined Tuneable yet.</p>
              )}
              {catalog.bio && (
                <p className="text-gray-200 whitespace-pre-wrap mb-3 max-w-2xl">{catalog.bio}</p>
              )}
              {catalog.genres.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {catalog.genres.map((genre) => (
                    <span
                      key={genre}
                      className="inline-flex items-center px-3 py-1.5 bg-purple-900/30 border border-purple-500/30 rounded-full text-gray-300 text-sm"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              <div className="mb-4 w-full max-w-lg">
                <button
                  type="button"
                  onClick={() => setShowChampions((open) => !open)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black/20 hover:bg-black/30 border border-amber-500/20 transition-colors"
                >
                  <Crown className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">
                    {showChampions ? 'Hide artist Champions' : `Champions of ${catalog.name}`}
                  </span>
                  {showChampions ? (
                    <Minus className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Plus className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                {showChampions && (
                  <div className="mt-3 card bg-black/20 rounded-lg p-3 md:p-4">
                    <MediaChampions
                      artistUserId={catalog.claimedBy?.uuid || catalog.claimedBy?._id}
                      artistName={catalog.name}
                      entityLabel={catalog.name}
                      maxDisplay={10}
                      compact
                    />
                  </div>
                )}
              </div>

              {links.length > 0 && (
                <div className="mb-2">
                  <div className="flex flex-wrap gap-2">
                    {links.map((social) => (
                      <a
                        key={social.name}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={social.name}
                        aria-label={social.name}
                        className={`inline-flex items-center justify-center p-2.5 bg-black/20 border border-white/20 rounded-lg text-gray-200 transition-all ${social.color}`}
                      >
                        <social.icon className="w-5 h-5" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {unclaimed && showClaim && (
          <div className="card p-4 md:p-6 mb-6 space-y-3">
            <h2 className="text-lg font-semibold text-white">Claim this page</h2>
            {claimPending ? (
              <p className="text-sm text-gray-300">Your claim is waiting for review.</p>
            ) : (
              <>
                <p className="text-sm text-gray-400">
                  One claim covers this catalog. Ownership and tip payouts stay on hold until the claim is confirmed.
                </p>
                {page.viewerClaim?.status === 'rejected' && page.viewerClaim.reviewNotes && (
                  <p className="text-sm text-amber-300">Previous claim declined: {page.viewerClaim.reviewNotes}</p>
                )}
                {user ? (
                  <>
                    <textarea
                      value={proofText}
                      onChange={(event) => setProofText(event.target.value)}
                      rows={4}
                      maxLength={2000}
                      placeholder="How can you show this catalog is yours?"
                      className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
                    />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      multiple
                      onChange={(event) => setProofFiles(Array.from(event.target.files || []).slice(0, 5))}
                      className="block text-sm text-gray-300"
                    />
                    <button
                      type="button"
                      onClick={submitClaim}
                      disabled={submitting}
                      className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                    >
                      {submitting ? 'Submitting…' : 'Submit claim'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={submitClaim}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                  >
                    Log in to claim this page
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <TippedMediaQueueList
          items={queue}
          playableOnly={playableOnly}
          onPlayableOnlyChange={setPlayableOnly}
          onTipPlaced={loadPage}
          header={(
            <div className="flex items-center">
              <Music className="h-6 w-6 text-purple-400 mr-2" />
              <h2 className="text-2xl font-semibold text-white">Catalog</h2>
              <span className="ml-3 px-3 py-1 bg-purple-900 text-purple-200 text-sm rounded-full">
                {queue.length}
              </span>
            </div>
          )}
        />
        {queue.length === 0 && (
          <p className="text-center text-gray-300 py-8">No tunes on this page yet.</p>
        )}
      </div>
    </div>
  );
};

export default ArtistCatalogPage;
