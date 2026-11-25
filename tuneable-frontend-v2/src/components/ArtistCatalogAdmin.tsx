import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { artistCatalogAPI } from '../lib/api';
import { toast } from '../utils/toast';
import { penceToPounds } from '../utils/currency';
import { refreshArtistCatalogIndex } from '../utils/artistCatalogIndex';
import { DEFAULT_COVER_ART } from '../constants';
import LocationAutocomplete from './LocationAutocomplete';
import type { ResolvedLocation } from '../utils/locationHelpers';

type Suggestion = { name: string; count: number; catalog: { slug: string; name: string } | null };

type PreviewMedia = {
  _id: string;
  title: string;
  coverArt?: string | null;
  roles: string[];
  rightsStatus?: string;
  globalMediaAggregate?: number;
  defaultSelected?: boolean;
  onCatalogs?: Array<{ slug: string; name: string }>;
};

type Published = {
  _id: string;
  slug: string;
  name: string;
  aliases: string[];
  bio: string;
  genres: string[];
  website: string;
  profilePic: string;
  location?: ResolvedLocation | null;
  socialMedia?: { instagram?: string };
  status: 'unclaimed' | 'claimed';
  mediaIds: string[];
  pendingClaims: number;
  claimedBy?: { username?: string } | null;
};

type CatalogClaim = {
  _id: string;
  status: string;
  proofText: string;
  proofFiles: Array<{ url?: string; filename?: string }>;
  submittedAt?: string;
  claimant?: { username?: string; email?: string } | null;
  catalog?: { name?: string; slug?: string; status?: string } | null;
};

function errorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return data || fallback;
}

const emptyForm = {
  name: '',
  aliases: '',
  bio: '',
  genres: '',
  website: '',
  instagram: '',
  profilePic: '',
  location: null as ResolvedLocation | null,
};

const ArtistCatalogAdmin: React.FC = () => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [media, setMedia] = useState<PreviewMedia[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [published, setPublished] = useState<Published[]>([]);
  const [claims, setClaims] = useState<CatalogClaim[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [clearRights, setClearRights] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const loadLists = useCallback(async () => {
    try {
      const [pages, claimData] = await Promise.all([
        artistCatalogAPI.list(),
        artistCatalogAPI.listClaims('pending'),
      ]);
      setPublished(pages.artists || []);
      setClaims(claimData.claims || []);
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to load artist pages'));
    }
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await artistCatalogAPI.suggest(q);
        setSuggestions(data.suggestions || []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const findTunes = async (name: string, aliases: string, preserve: Set<string> | null) => {
    const names = [name, ...aliases.split(',')].map((part) => part.trim()).filter(Boolean);
    if (!names.length) {
      toast.error('Enter an artist name');
      return;
    }
    setBusy(true);
    try {
      const preview = await artistCatalogAPI.preview(names);
      const rows: PreviewMedia[] = preview.media || [];
      setMedia(rows);
      setSelected(() => {
        const next = new Set<string>();
        rows.forEach((row) => {
          if (preserve ? preserve.has(row._id) : row.defaultSelected) next.add(row._id);
        });
        return next;
      });
      if (!form.name.trim()) {
        setForm((current) => ({ ...current, name: preview.name || name }));
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to find tunes'));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!form.name.trim()) {
      toast.error('Artist name is required');
      return;
    }
    if (!selected.size) {
      toast.error('Choose at least one tune');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        aliases: form.aliases.split(',').map((part) => part.trim()).filter(Boolean),
        bio: form.bio.trim(),
        genres: form.genres.split(',').map((part) => part.trim()).filter(Boolean),
        website: form.website.trim(),
        profilePic: form.profilePic.trim(),
        location: form.location,
        socialMedia: { instagram: form.instagram.trim() },
        mediaIds: [...selected],
      };
      if (editingId) {
        await artistCatalogAPI.update(editingId, body);
        toast.success('Artist page updated');
      } else {
        const created = await artistCatalogAPI.create(body);
        toast.success(`Published /artist/${created.artist?.slug || ''}`);
      }
      setForm(emptyForm);
      setEditingId(null);
      setMedia([]);
      setSelected(new Set());
      setQuery('');
      await refreshArtistCatalogIndex(true);
      await loadLists();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to save artist page'));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (page: Published) => {
    const aliases = (page.aliases || []).join(', ');
    setEditingId(page._id);
    setForm({
      name: page.name,
      aliases,
      bio: page.bio || '',
      genres: (page.genres || []).join(', '),
      website: page.website || '',
      instagram: page.socialMedia?.instagram || '',
      profilePic: page.profilePic || '',
      location: page.location || null,
    });
    const preserve = new Set(page.mediaIds || []);
    setSelected(preserve);
    findTunes(page.name, aliases, preserve);
  };

  const review = async (claimId: string, status: 'approved' | 'rejected') => {
    setBusy(true);
    try {
      const result = await artistCatalogAPI.reviewClaim(claimId, {
        status,
        reviewNotes: notes[claimId] || '',
        clearRights: status === 'approved' && clearRights[claimId] === true,
      });
      const warning = (result.warnings || []).filter(Boolean).join(' ');
      toast.success(warning ? `${result.message || 'Updated'}. ${warning}` : (result.message || 'Updated'));
      await refreshArtistCatalogIndex(true);
      await loadLists();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to review claim'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">Artist pages</h2>
        <p className="mt-1 text-sm text-gray-400 max-w-3xl">
          Publish a public catalog for an artist who has not joined. The page lists only the tunes you tick.
          A later claim links those credits to their account. Rights and tip escrow stay where they are unless you release them on approval.
        </p>
      </div>

      <div className="bg-gray-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search credited names"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => findTunes(form.name || query, form.aliases, editingId ? selected : null)}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600 disabled:opacity-60"
          >
            Find tunes
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.name}
                type="button"
                onClick={() => {
                  setForm((current) => ({ ...current, name: suggestion.name }));
                  setQuery(suggestion.name);
                  findTunes(suggestion.name, form.aliases, null);
                }}
                className="rounded-full bg-gray-900 px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
              >
                {suggestion.name}
                <span className="ml-2 text-gray-500">{suggestion.count}</span>
                {suggestion.catalog && <span className="ml-2 text-purple-300">page exists</span>}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-gray-300">
            Name
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Aliases, comma separated
            <input
              value={form.aliases}
              onChange={(event) => setForm({ ...form, aliases: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300 md:col-span-2">
            Bio
            <textarea
              value={form.bio}
              onChange={(event) => setForm({ ...form, bio: event.target.value })}
              rows={3}
              maxLength={500}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Genres
            <input
              value={form.genres}
              onChange={(event) => setForm({ ...form, genres: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Website
            <input
              value={form.website}
              onChange={(event) => setForm({ ...form, website: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Instagram
            <input
              value={form.instagram}
              onChange={(event) => setForm({ ...form, instagram: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Image URL
            <input
              value={form.profilePic}
              onChange={(event) => setForm({ ...form, profilePic: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
          </label>
          <div className="md:col-span-2">
            <LocationAutocomplete
              label="Location"
              value={form.location}
              onChange={(location) => setForm({ ...form, location })}
              placeholder="Search for a city or town"
            />
          </div>
        </div>

        {media.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            <p className="text-sm text-gray-400">{selected.size} of {media.length} selected. Primary artist credits start ticked.</p>
            {media.map((item) => (
              <label key={item._id} className="flex items-center gap-3 rounded-lg bg-gray-900 p-2">
                <input
                  type="checkbox"
                  checked={selected.has(item._id)}
                  onChange={(event) => {
                    setSelected((current) => {
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
                  <span className="block text-xs text-gray-500">
                    {(item.roles || []).join(', ')} · {item.rightsStatus} · {penceToPounds(item.globalMediaAggregate || 0)}
                    {(item.onCatalogs || []).length > 0 && ` · on ${item.onCatalogs!.map((page) => page.name).join(', ')}`}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={publish}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {editingId ? 'Save page' : 'Publish page'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
                setMedia([]);
                setSelected(new Set());
              }}
              className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:text-white"
            >
              Cancel edit
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-medium text-white">Published</h3>
        {published.length === 0 && <p className="text-sm text-gray-500">No artist pages yet.</p>}
        {published.map((page) => (
          <div key={page._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-800 px-4 py-3">
            <div>
              <Link to={`/artist/${page.slug}`} className="text-white hover:text-purple-300">
                {page.name}
              </Link>
              <p className="text-xs text-gray-500">
                /artist/{page.slug} · {page.mediaIds?.length || 0} tunes · {page.status}
                {page.pendingClaims ? ` · ${page.pendingClaims} claim${page.pendingClaims === 1 ? '' : 's'}` : ''}
                {page.claimedBy?.username ? ` · @${page.claimedBy.username}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => startEdit(page)}
              className="text-sm text-purple-300 hover:text-purple-200"
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-medium text-white">Claims waiting for review</h3>
        {claims.length === 0 && <p className="text-sm text-gray-500">No pending claims.</p>}
        {claims.map((claim) => (
          <div key={claim._id} className="rounded-lg bg-gray-800 p-4 space-y-3">
            <div>
              <p className="text-white">
                {claim.claimant?.username || 'User'} wants {claim.catalog?.name || 'an artist page'}
              </p>
              {claim.catalog?.slug && (
                <Link to={`/artist/${claim.catalog.slug}`} className="text-xs text-purple-300 hover:text-purple-200">
                  /artist/{claim.catalog.slug}
                </Link>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-gray-300">{claim.proofText}</p>
            {(claim.proofFiles || []).length > 0 && (
              <div className="flex flex-wrap gap-3 text-sm">
                {claim.proofFiles.map((file, index) => (
                  file.url ? (
                    <a key={file.url} href={file.url} target="_blank" rel="noreferrer" className="text-purple-300 hover:text-purple-200">
                      Proof {index + 1}
                    </a>
                  ) : null
                ))}
              </div>
            )}
            <textarea
              value={notes[claim._id] || ''}
              onChange={(event) => setNotes({ ...notes, [claim._id]: event.target.value })}
              rows={2}
              placeholder="Note to the claimant, optional"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
            />
            <label className="flex items-start gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={clearRights[claim._id] === true}
                onChange={(event) => setClearRights({ ...clearRights, [claim._id]: event.target.checked })}
              />
              <span>
                Also clear rights and release tip escrow for the attached tunes. Leave this off to link the credits only.
              </span>
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={busy || claim.catalog?.status === 'claimed'}
                onClick={() => review(claim._id, 'approved')}
                className="rounded-lg bg-green-700 px-4 py-2 text-sm text-white hover:bg-green-600 disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => review(claim._id, 'rejected')}
                className="rounded-lg bg-red-800 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60"
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ArtistCatalogAdmin;
