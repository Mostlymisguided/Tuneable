import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Camera, Crown, Globe, Instagram, Loader2, MapPin, Minus, Music, Plus, Settings, Tag, Trash2, Youtube } from 'lucide-react';
import { artistCatalogAPI, mediaAPI, partyAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../seo/usePageMeta';
import { getUserProfileUrl } from '../utils/profileNavigation';
import { isAdmin } from '../utils/permissionHelpers';
import { refreshArtistCatalogIndex } from '../utils/artistCatalogIndex';
import { toast } from '../utils/toast';
import { DEFAULT_COVER_ART, hasCustomProfilePic } from '../constants';
import { prepareProfileImage } from '../utils/profileImage';
import { formatLocation, getPlaceProfilePath, type ResolvedLocation } from '../utils/locationHelpers';
import { getTagProfilePath } from '../utils/tagNormalizer';
import LocationAutocomplete from '../components/LocationAutocomplete';
import UserAvatar from '../components/UserAvatar';
import MediaChampions from '../components/MediaChampions';
import PublicUserLibraryChart from '../components/PublicUserLibraryChart';
import BidConfirmationModal from '../components/BidConfirmationModal';
import type { LibraryItem } from '../components/TuneLibraryTable';
import type { TippedQueueItem } from '../components/TippedMediaQueueList';
import { getCreatorDisplay } from '../utils/creatorDisplay';
import { getMediaProfileUrl } from '../utils/mediaNavigation';
import { enrichMediaWithPlayability, isMediaPlayable, playerPlayabilityFields } from '../utils/mediaPlayability';
import { requireAuthToPlay } from '../utils/playAuth';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { usePodcastPlayerStore } from '../stores/podcastPlayerStore';
import { useGlobalAverageTip } from '../lib/globalAverageTip';
import { resolveTipStatInputs } from '../utils/tipStats';
import { ensureSpendableBalance } from '../utils/spendableBalance';
import { penceToPoundsNumber } from '../utils/currency';
import { buildLoginUrl, getCurrentReturnPath } from '../utils/authHelpers';

type ClaimedBy = {
  _id?: string;
  username?: string;
  uuid?: string;
  profilePic?: string | null;
  artistName?: string | null;
};

type CatalogSocial = {
  instagram?: string;
  spotify?: string;
  youtube?: string;
  soundcloud?: string;
  twitter?: string;
};

type CatalogRecord = {
  _id: string;
  slug: string;
  name: string;
  aliases: string[];
  bio: string;
  genres: string[];
  profilePic: string;
  website: string;
  location?: ResolvedLocation | null;
  socialMedia?: CatalogSocial;
  status: 'unclaimed' | 'claimed';
  claimedBy: ClaimedBy | null;
};

type TagRanking = { tag: string; rank: number };
type LocationRanking = { placeId: string; name: string; rank: number };

type CatalogPage = {
  catalog: CatalogRecord;
  queue?: TippedQueueItem[];
  tagRankings?: TagRanking[];
  locationRankings?: LocationRanking[];
  viewerClaim: { status: string; reviewNotes?: string; submittedAt?: string } | null;
};

type SocialLink = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
};

type EditForm = {
  name: string;
  aliases: string;
  bio: string;
  genres: string;
  website: string;
  profilePic: string;
  instagram: string;
  spotify: string;
  youtube: string;
  soundcloud: string;
  location: ResolvedLocation | null;
};

type EditMedia = {
  _id: string;
  title: string;
  coverArt?: string | null;
  roles?: string[];
  rightsStatus?: string;
  defaultSelected?: boolean;
};

const emptyEditForm: EditForm = {
  name: '',
  aliases: '',
  bio: '',
  genres: '',
  website: '',
  profilePic: '',
  instagram: '',
  spotify: '',
  youtube: '',
  soundcloud: '',
  location: null,
};

function splitList(value: string) {
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

function editFormFromCatalog(catalog: CatalogRecord): EditForm {
  const social = catalog.socialMedia || {};
  return {
    name: catalog.name || '',
    aliases: (catalog.aliases || []).join(', '),
    bio: catalog.bio || '',
    genres: (catalog.genres || []).join(', '),
    website: catalog.website || '',
    profilePic: catalog.profilePic || '',
    instagram: social.instagram || '',
    spotify: social.spotify || '',
    youtube: social.youtube || '',
    soundcloud: social.soundcloud || '',
    location: catalog.location || null,
  };
}

function hasLocation(location: ResolvedLocation | null | undefined) {
  return !!(location?.display || location?.city || location?.country || location?.region);
}

function asList(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function queueToLibraryItem(item: TippedQueueItem): LibraryItem {
  const release = item.releaseDate ? new Date(item.releaseDate).toISOString() : '';
  const aggregate = item.globalMediaAggregate || 0;
  const bids = (item.bids || []).filter((bid) => bid.userId?.username);
  return {
    mediaId: item._id,
    mediaUuid: item.uuid || item._id,
    slug: item.slug,
    title: item.title,
    artist: getCreatorDisplay(item),
    coverArt: item.coverArt || undefined,
    duration: item.duration,
    waveformPeaks: item.waveformPeaks,
    bpm: typeof item.bpm === 'number' && item.bpm > 0 ? item.bpm : undefined,
    releaseDate: release || null,
    releaseYear: item.releaseYear ?? null,
    primaryLocation: item.primaryLocation ?? null,
    tags: item.tags || [],
    contentForm: asList(item.contentForm),
    sources: item.sources || {},
    rightsStatus: item.rightsStatus,
    rightsCleared: item.rightsCleared,
    isPlayable: item.isPlayable,
    hasHostedAudio: item.hasHostedAudio,
    globalMediaAggregate: aggregate,
    globalMediaAggregateAvg: bids.length ? aggregate / bids.length : 0,
    globalUserMediaAggregate: aggregate,
    bidCount: bids.length,
    tuneBytesEarned: item.tuneBytesEarned || 0,
    lastBidAt: release,
    createdAt: release || null,
    bids,
    contentType: asList(item.contentType),
  } as LibraryItem;
}

function isLibraryPlayable(item: LibraryItem) {
  return isMediaPlayable(enrichMediaWithPlayability({
    sources: item.sources || {},
    contentForm: item.contentForm,
    contentType: (item as LibraryItem & { contentType?: string[] }).contentType,
    rightsStatus: item.rightsStatus,
    rightsCleared: item.rightsCleared,
    isPlayable: item.isPlayable,
    hasHostedAudio: item.hasHostedAudio,
  }));
}

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

function socialLinks(catalog: CatalogRecord): SocialLink[] {
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
  const { user, updateBalance, refreshUser } = useAuth();
  const admin = isAdmin(user);
  const globalAverageTip = useGlobalAverageTip();
  const { setCurrentMedia, setQueue, setGlobalPlayerActive, setCurrentPartyId, play } = useWebPlayerStore();
  const [page, setPage] = useState<CatalogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showChampions, setShowChampions] = useState(false);
  const [proofText, setProofText] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [editMedia, setEditMedia] = useState<EditMedia[]>([]);
  const [editSelected, setEditSelected] = useState<Set<string>>(new Set());
  const [savingEdit, setSavingEdit] = useState(false);
  const profilePicInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPic, setIsUploadingPic] = useState(false);
  const [isRemovingPic, setIsRemovingPic] = useState(false);
  const [minimumBid, setMinimumBid] = useState(0.01);
  const [itemToTip, setItemToTip] = useState<LibraryItem | null>(null);
  const [isPlacingTip, setIsPlacingTip] = useState(false);

  const libraryItems = useMemo(
    () => (page?.queue || []).map(queueToLibraryItem),
    [page]
  );
  const tipStats = useMemo(() => resolveTipStatInputs(itemToTip, user), [itemToTip, user]);

  useEffect(() => {
    let cancelled = false;
    partyAPI.getParties()
      .then((response) => {
        const globalParty = response.parties.find((party: { type?: string; minimumBid?: number }) => party.type === 'global');
        if (!cancelled && globalParty?.minimumBid) setMinimumBid(globalParty.minimumBid);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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

  const openEdit = () => {
    if (!page?.catalog) return;
    const rows: EditMedia[] = (page.queue || []).map((item) => ({
      _id: String(item._id),
      title: item.title,
      coverArt: item.coverArt,
      roles: (item as TippedQueueItem & { roles?: string[] }).roles,
      rightsStatus: item.rightsStatus,
    }));
    setEditForm(editFormFromCatalog(page.catalog));
    setEditMedia(rows);
    setEditSelected(new Set(rows.map((row) => row._id)));
    setShowClaim(false);
    setShowEdit(true);
  };

  const findTunes = async () => {
    const names = [editForm.name, ...splitList(editForm.aliases)];
    if (!names.length) {
      toast.error('Enter an artist name');
      return;
    }
    setSavingEdit(true);
    try {
      const preview = await artistCatalogAPI.preview(names);
      const rows: EditMedia[] = (preview.media || []).map((row: EditMedia) => ({
        ...row,
        _id: String(row._id),
      }));
      const known = new Set(editMedia.map((row) => row._id));
      setEditMedia((current) => {
        const byId = new Map(current.map((row) => [row._id, row]));
        rows.forEach((row) => byId.set(row._id, { ...byId.get(row._id), ...row }));
        return [...byId.values()];
      });
      setEditSelected((current) => {
        const next = new Set(current);
        rows.forEach((row) => {
          if (!known.has(row._id) && row.defaultSelected) next.add(row._id);
        });
        return next;
      });
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to find tunes'));
    } finally {
      setSavingEdit(false);
    }
  };

  const saveEdit = async () => {
    if (!page?.catalog?._id) return;
    if (!editForm.name.trim()) {
      toast.error('Artist name is required');
      return;
    }
    if (!editSelected.size) {
      toast.error('Choose at least one tune');
      return;
    }
    setSavingEdit(true);
    try {
      await artistCatalogAPI.update(page.catalog._id, {
        name: editForm.name.trim(),
        aliases: splitList(editForm.aliases),
        bio: editForm.bio.trim(),
        genres: splitList(editForm.genres),
        website: editForm.website.trim(),
        profilePic: editForm.profilePic.trim(),
        socialMedia: {
          instagram: editForm.instagram.trim(),
          spotify: editForm.spotify.trim(),
          youtube: editForm.youtube.trim(),
        soundcloud: editForm.soundcloud.trim(),
      },
      location: editForm.location,
      mediaIds: [...editSelected],
      });
      toast.success('Artist page updated');
      setShowEdit(false);
      await refreshArtistCatalogIndex(true);
      await loadPage();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to update artist page'));
    } finally {
      setSavingEdit(false);
    }
  };

  const playCatalog = (item: LibraryItem, _index?: number, sourceList?: LibraryItem[]) => {
    if (!requireAuthToPlay()) return;
    const list = sourceList && sourceList.length ? sourceList : libraryItems;
    const playable = list.filter(isLibraryPlayable);
    if (!playable.length) {
      toast.info(list[0]?.mediaId === item.mediaId ? 'No playable tracks yet.' : 'This track is not playable yet — opening its profile instead.');
      if (list[0]?.mediaId !== item.mediaId) navigate(getMediaProfileUrl(item));
      return;
    }
    let startIndex = playable.findIndex((row) => row.mediaId === item.mediaId);
    if (startIndex < 0) {
      if (list[0]?.mediaId === item.mediaId) {
        startIndex = 0;
      } else {
        toast.info('This track is not playable yet — opening its profile instead.');
        navigate(getMediaProfileUrl(item));
        return;
      }
    }
    usePodcastPlayerStore.getState().clear();
    const queue = playable.map((row) => ({
      id: row.mediaId,
      _id: row.mediaId,
      title: row.title,
      artist: row.artist,
      duration: row.duration || 0,
      coverArt: row.coverArt || DEFAULT_COVER_ART,
      sources: row.sources || {},
      globalMediaAggregate: row.globalMediaAggregate || 0,
      bids: [],
      addedBy: null,
      totalBidValue: row.globalMediaAggregate || 0,
      ...playerPlayabilityFields(row),
    }));
    setQueue(queue as never);
    setCurrentMedia(queue[startIndex] as never, startIndex);
    play();
    setGlobalPlayerActive(true);
    setCurrentPartyId(null);
    toast.success(`Now playing: ${queue[startIndex].title}`);
  };

  const openTip = (item: LibraryItem) => {
    if (!user) {
      toast.info('Please log in to support this tune');
      navigate(buildLoginUrl(getCurrentReturnPath()));
      return;
    }
    setItemToTip(item);
  };

  const confirmTip = async (
    tags: string[],
    amount: number,
    _setProgress?: unknown,
    moment?: { timestampSeconds: number; note?: string } | null
  ) => {
    if (!user || !itemToTip) return;
    const tipAmount = Number.isFinite(amount) && amount > 0 ? amount : globalAverageTip;
    if (tipAmount < minimumBid) {
      toast.error(`Minimum tip is £${minimumBid.toFixed(2)}`);
      return;
    }
    const canAfford = await ensureSpendableBalance(
      (user as { balance?: number }).balance,
      Math.round(tipAmount * 100),
      refreshUser
    );
    if (!canAfford) {
      toast.error('Insufficient balance. Please top up your wallet.');
      navigate('/wallet');
      return;
    }
    setIsPlacingTip(true);
    try {
      const result = await mediaAPI.placeGlobalBid(itemToTip.mediaUuid || itemToTip.mediaId, tipAmount, undefined, tags, moment);
      if (typeof result.updatedBalance === 'number') updateBalance(result.updatedBalance);
      toast.success(`Placed £${tipAmount.toFixed(2)} tip on "${itemToTip.title}"!`);
      setItemToTip(null);
      await loadPage();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to place tip'));
    } finally {
      setIsPlacingTip(false);
    }
  };

  const applyCatalogPic = (profilePic: string) => {
    setEditForm((current) => ({ ...current, profilePic }));
    setPage((current) => (
      current ? { ...current, catalog: { ...current.catalog, profilePic } } : current
    ));
  };

  const uploadCatalogPic = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const catalogId = page?.catalog?._id;
    if (!file || !catalogId) return;
    let prepared: File;
    try {
      prepared = await prepareProfileImage(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not use that image');
      event.target.value = '';
      return;
    }
    setIsUploadingPic(true);
    try {
      const response = await artistCatalogAPI.uploadProfilePic(catalogId, prepared);
      applyCatalogPic(response.profilePic || '');
      toast.success('Profile picture updated');
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to upload profile picture'));
    } finally {
      setIsUploadingPic(false);
      event.target.value = '';
    }
  };

  const removeCatalogPic = async () => {
    const catalogId = page?.catalog?._id;
    if (!catalogId || !hasCustomProfilePic(editForm.profilePic)) return;
    if (!window.confirm('Remove this picture? The initial will show instead.')) return;
    setIsRemovingPic(true);
    try {
      const response = await artistCatalogAPI.removeProfilePic(catalogId);
      applyCatalogPic(response.profilePic || '');
      toast.success('Profile picture removed');
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to remove profile picture'));
    } finally {
      setIsRemovingPic(false);
    }
  };

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

          {(admin || unclaimed) && (
            <div className="inline rounded-full items-center absolute right-0 top-0 md:right-3 mb-4 flex space-x-2">
              {admin && (
                <button
                  type="button"
                  onClick={() => (showEdit ? setShowEdit(false) : openEdit())}
                  className="px-3 md:px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
                >
                  <Settings className="h-4 w-4" />
                  <span>{showEdit ? 'Close' : 'Edit'}</span>
                </button>
              )}
              {unclaimed && (
                <button
                  type="button"
                  onClick={() => setShowClaim((open) => !open)}
                  className="px-3 md:px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all text-sm md:text-base"
                >
                  {claimPending ? 'Claim pending' : 'Claim'}
                </button>
              )}
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
              {catalog.status === 'claimed' && catalog.claimedBy && (
                <p className="text-gray-300 mb-3">
                  <Link to={getUserProfileUrl(catalog.claimedBy)} className="text-purple-200 hover:text-white">
                    @{catalog.claimedBy.username}
                  </Link>
                </p>
              )}
              {hasLocation(catalog.location) && (
                <div className="inline-flex items-center space-x-2 px-3 py-1.5 mb-3 bg-purple-900/30 border border-purple-500/30 rounded-full text-gray-300 text-sm w-fit">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{formatLocation(catalog.location)}</span>
                </div>
              )}
              {((page.tagRankings?.length || 0) > 0 || (page.locationRankings?.length || 0) > 0) && (
                <div className="flex flex-col gap-1.5 mb-3">
                  {(page.tagRankings?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {page.tagRankings!.map((ranking) => (
                        <Link
                          key={ranking.tag}
                          to={getTagProfilePath(ranking.tag)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs font-medium hover:bg-purple-500/25 hover:border-purple-400/50 transition-colors no-underline"
                        >
                          <Tag className="h-3 w-3 text-purple-400" />
                          #{ranking.rank} {ranking.tag}
                        </Link>
                      ))}
                    </div>
                  )}
                  {(page.locationRankings?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {page.locationRankings!.map((ranking) => {
                        const placePath = getPlaceProfilePath(ranking.placeId);
                        const chipClass = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-200 text-xs font-medium hover:bg-sky-500/25 hover:border-sky-400/50 transition-colors no-underline';
                        const chipBody = (
                          <>
                            <MapPin className="h-3 w-3 text-sky-400" />
                            #{ranking.rank} {ranking.name}
                          </>
                        );
                        return placePath ? (
                          <Link key={ranking.placeId} to={placePath} className={chipClass}>
                            {chipBody}
                          </Link>
                        ) : (
                          <span key={ranking.placeId} className={chipClass}>
                            {chipBody}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/25 hover:bg-black/40 border border-amber-400/25 transition-colors"
                >
                  <Crown className="h-4 w-4 text-amber-300" />
                  <span className="text-sm font-semibold text-white">
                    {showChampions ? 'Hide Champions' : 'Champions'}
                  </span>
                  {showChampions ? (
                    <Minus className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Plus className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                {showChampions && (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-3.5 md:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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

        {admin && showEdit && (
          <div className="card p-4 md:p-6 mb-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Edit page</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-gray-300">
                Name
                <input
                  value={editForm.name}
                  onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-gray-300">
                Aliases, comma separated
                <input
                  value={editForm.aliases}
                  onChange={(event) => setEditForm({ ...editForm, aliases: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-gray-300 md:col-span-2">
                Bio
                <textarea
                  value={editForm.bio}
                  onChange={(event) => setEditForm({ ...editForm, bio: event.target.value })}
                  rows={4}
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-gray-300">
                Genres
                <input
                  value={editForm.genres}
                  onChange={(event) => setEditForm({ ...editForm, genres: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
              <div className="md:col-span-2">
                <LocationAutocomplete
                  label="Location"
                  value={editForm.location}
                  onChange={(location) => setEditForm({ ...editForm, location })}
                  placeholder="Search for a city or town"
                />
              </div>
              <label className="block text-sm text-gray-300">
                Website
                <input
                  value={editForm.website}
                  onChange={(event) => setEditForm({ ...editForm, website: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-gray-300">
                Instagram
                <input
                  value={editForm.instagram}
                  onChange={(event) => setEditForm({ ...editForm, instagram: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-gray-300">
                YouTube
                <input
                  value={editForm.youtube}
                  onChange={(event) => setEditForm({ ...editForm, youtube: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-gray-300">
                SoundCloud
                <input
                  value={editForm.soundcloud}
                  onChange={(event) => setEditForm({ ...editForm, soundcloud: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-gray-300">
                Spotify
                <input
                  value={editForm.spotify}
                  onChange={(event) => setEditForm({ ...editForm, spotify: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
                />
              </label>
              <div className="md:col-span-2">
                <label className="block text-white font-medium mb-3">Profile Picture</label>
                <div className="flex items-center gap-4">
                  <UserAvatar
                    name={editForm.name || catalog.name}
                    profilePic={editForm.profilePic}
                    alt={`${editForm.name || catalog.name} profile`}
                    className="w-20 h-20 object-cover shadow-lg"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => profilePicInputRef.current?.click()}
                      disabled={isUploadingPic || isRemovingPic}
                      className="px-4 py-2 bg-purple-600/40 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center space-x-2"
                    >
                      {isUploadingPic ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="h-4 w-4" />
                          <span>{hasCustomProfilePic(editForm.profilePic) ? 'Change' : 'Upload'}</span>
                        </>
                      )}
                    </button>
                    {hasCustomProfilePic(editForm.profilePic) && (
                      <button
                        type="button"
                        onClick={removeCatalogPic}
                        disabled={isUploadingPic || isRemovingPic}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors flex items-center space-x-2"
                      >
                        {isRemovingPic ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Removing...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            <span>Remove</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={profilePicInputRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={uploadCatalogPic}
                  className="hidden"
                />
                <p className="text-xs text-gray-400 mt-2">
                  Large photos are resized automatically. Removing the picture shows the initial.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-400">
                  {editSelected.size} tune{editSelected.size === 1 ? '' : 's'} on this page
                </p>
                <button
                  type="button"
                  onClick={findTunes}
                  disabled={savingEdit}
                  className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-60"
                >
                  Find matching tunes
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {editMedia.map((item) => (
                  <label key={item._id} className="flex items-center gap-3 rounded-lg bg-gray-900 p-2">
                    <input
                      type="checkbox"
                      checked={editSelected.has(item._id)}
                      onChange={(event) => {
                        setEditSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(item._id);
                          else next.delete(item._id);
                          return next;
                        });
                      }}
                    />
                    <img src={item.coverArt || DEFAULT_COVER_ART} alt="" className="h-10 w-10 rounded object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{item.title}</span>
                      {(item.roles?.length || item.rightsStatus) && (
                        <span className="block text-xs text-gray-500">
                          {[...(item.roles || []), item.rightsStatus].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={saveEdit}
                disabled={savingEdit}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
              >
                {savingEdit ? 'Saving…' : 'Save page'}
              </button>
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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

        <div className="flex items-center mb-4">
          <Music className="h-6 w-6 text-purple-400 mr-2" />
          <h2 className="text-2xl font-semibold text-white">Catalog</h2>
          <span className="ml-3 px-3 py-1 bg-purple-900 text-purple-200 text-sm rounded-full">
            {queue.length}
          </span>
        </div>
        <PublicUserLibraryChart
          items={libraryItems}
          username={catalog.name}
          onPlay={playCatalog}
          onTip={openTip}
          rankBy="track"
          emptyMessage="No tunes on this page yet."
        />
        <BidConfirmationModal
          isOpen={!!itemToTip}
          onClose={() => setItemToTip(null)}
          onConfirm={confirmTip}
          bidAmount={globalAverageTip}
          minTip={minimumBid}
          avgTip={tipStats.avgTip}
          championAggregate={tipStats.championAggregate}
          viewerAggregate={tipStats.viewerAggregate}
          viewerIsChampion={tipStats.viewerIsChampion}
          viewerRank={tipStats.viewerRank}
          mediaTitle={itemToTip?.title || 'Unknown'}
          mediaArtist={itemToTip?.artist}
          userBalance={penceToPoundsNumber((user as { balance?: number } | null)?.balance)}
          isLoading={isPlacingTip}
          isNonPlayable={itemToTip ? !isLibraryPlayable(itemToTip) : false}
          durationSeconds={itemToTip?.duration}
          existingTags={itemToTip?.tags}
          user={user}
        />
      </div>
    </div>
  );
};

export default ArtistCatalogPage;
