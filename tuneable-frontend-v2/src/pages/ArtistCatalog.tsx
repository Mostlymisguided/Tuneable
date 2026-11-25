import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { artistCatalogAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../seo/usePageMeta';
import { getMediaProfileUrl } from '../utils/mediaNavigation';
import { getUserProfileUrl } from '../utils/profileNavigation';
import { penceToPounds } from '../utils/currency';
import { DEFAULT_COVER_ART } from '../constants';
import { toast } from '../utils/toast';
import EntertainingLoader from '../components/EntertainingLoader';

type CatalogMedia = {
  _id: string;
  uuid?: string;
  slug?: string | null;
  title: string;
  coverArt?: string | null;
  contentForm?: string[] | string;
  contentType?: string[] | string;
  globalMediaAggregate?: number;
  roles?: string[];
};

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
  sections: {
    artist: CatalogMedia[];
    appears: CatalogMedia[];
    credits: CatalogMedia[];
  };
  viewerClaim: { status: string; reviewNotes?: string; submittedAt?: string } | null;
};

const SECTION_LABELS: { key: keyof CatalogPage['sections']; label: string }[] = [
  { key: 'artist', label: 'Catalog' },
  { key: 'appears', label: 'Appears on' },
  { key: 'credits', label: 'Other credits' },
];

function errorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return data || fallback;
}

function linkFor(value: string | undefined, site?: string) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return { href: text, label: text.replace(/^https?:\/\//, '') };
  if (site) {
    const handle = text.replace(/^@/, '');
    return { href: `https://${site}/${handle}`, label: text };
  }
  return { href: `https://${text}`, label: text };
}

const MediaRow: React.FC<{ item: CatalogMedia }> = ({ item }) => (
  <Link
    to={getMediaProfileUrl(item)}
    className="flex items-center gap-3 rounded-lg bg-gray-800 p-3 hover:bg-gray-700 transition-colors"
  >
    <img
      src={item.coverArt || DEFAULT_COVER_ART}
      alt=""
      className="h-14 w-14 rounded object-cover bg-gray-900"
    />
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium text-white">{item.title}</p>
      <p className="text-sm text-gray-400">{penceToPounds(item.globalMediaAggregate || 0)} tipped</p>
    </div>
  </Link>
);

const ArtistCatalogPage: React.FC = () => {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [proofText, setProofText] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

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
    description: catalog.bio
      ? catalog.bio
      : `Music credited to ${catalog.name} on Tuneable.`,
    path: `/artist/${catalog.slug}`,
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
      const data = await artistCatalogAPI.get(slug);
      setPage(data);
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to submit claim'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <EntertainingLoader />
      </div>
    );
  }

  if (missing || !page || !catalog) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h1 className="text-2xl font-semibold">Artist page not found</h1>
          <p className="mt-2 text-gray-400">This catalog has not been published.</p>
        </div>
      </div>
    );
  }

  const socials = [
    linkFor(catalog.website),
    linkFor(catalog.socialMedia?.instagram, 'instagram.com'),
    linkFor(catalog.socialMedia?.spotify),
    linkFor(catalog.socialMedia?.youtube),
    linkFor(catalog.socialMedia?.soundcloud),
    linkFor(catalog.socialMedia?.twitter, 'x.com'),
  ].filter(Boolean) as { href: string; label: string }[];

  const claimPending = page.viewerClaim?.status === 'pending';
  const cover = catalog.profilePic
    || page.sections.artist[0]?.coverArt
    || page.sections.appears[0]?.coverArt
    || DEFAULT_COVER_ART;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <header className="flex gap-4 items-start">
          <img src={cover} alt="" className="h-24 w-24 rounded-lg object-cover bg-gray-800" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold">{catalog.name}</h1>
            {catalog.aliases.length > 0 && (
              <p className="mt-1 text-sm text-gray-400">Also credited as {catalog.aliases.join(', ')}</p>
            )}
            {catalog.status === 'claimed' && catalog.claimedBy ? (
              <p className="mt-3 text-sm text-gray-300">
                On Tuneable as{' '}
                <Link to={getUserProfileUrl(catalog.claimedBy)} className="text-purple-300 hover:text-purple-200">
                  @{catalog.claimedBy.username}
                </Link>
              </p>
            ) : (
              <p className="mt-3 text-sm text-gray-400">
                Tuneable compiled this page from credits on the catalog. {catalog.name} has not joined yet.
              </p>
            )}
            {catalog.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {catalog.genres.map((genre) => (
                  <span key={genre} className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {catalog.bio && <p className="text-gray-200 whitespace-pre-wrap">{catalog.bio}</p>}

        {socials.length > 0 && (
          <div className="flex flex-wrap gap-3 text-sm">
            {socials.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-purple-300 hover:text-purple-200"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        {catalog.status === 'unclaimed' && (
          <section className="rounded-lg border border-gray-700 bg-gray-800/60 p-4 space-y-3">
            <h2 className="text-lg font-medium">Are you {catalog.name}?</h2>
            {claimPending ? (
              <p className="text-sm text-gray-300">Your claim is waiting for review. The page stays public in the meantime.</p>
            ) : (
              <>
                <p className="text-sm text-gray-400">
                  Claim the page to gather these tunes on your account. Ownership and tip payouts stay on hold until a reviewer confirms the claim.
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
                      className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
                    >
                      {submitting ? 'Submitting…' : 'Claim this page'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={submitClaim}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium hover:bg-purple-700"
                  >
                    Log in to claim this page
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {SECTION_LABELS.map(({ key, label }) => {
          const items = page.sections[key] || [];
          if (!items.length) return null;
          return (
            <section key={key} className="space-y-3">
              <h2 className="text-xl font-medium">{label}</h2>
              <div className="space-y-2">
                {items.map((item) => (
                  <MediaRow key={item._id} item={item} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default ArtistCatalogPage;
