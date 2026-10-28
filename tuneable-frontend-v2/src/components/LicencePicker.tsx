import { useState } from 'react';
import { Download, Headphones, Megaphone, RefreshCw, Users } from 'lucide-react';
import { mediaAPI } from '../lib/api';
import { toast } from '../utils/toast';

export type LicenceChoice = {
  personalStreaming: true;
  publicStreaming: boolean;
  publicStreamingFloorPence: number | null;
  personalDownload: boolean;
  personalDownloadUnlockPence: number | null;
  openToRework: boolean;
  openToCommercial: boolean;
};

export type SavedLicence = Partial<LicenceChoice> & {
  chosen?: boolean;
};

export const DEFAULT_LICENCE_CHOICE: LicenceChoice = {
  personalStreaming: true,
  publicStreaming: false,
  publicStreamingFloorPence: null,
  personalDownload: false,
  personalDownloadUnlockPence: null,
  openToRework: false,
  openToCommercial: false,
};

export function licenceChoiceFromSaved(saved?: SavedLicence | null): LicenceChoice {
  if (!saved?.chosen) return { ...DEFAULT_LICENCE_CHOICE };
  return {
    personalStreaming: true,
    publicStreaming: saved.publicStreaming === true,
    publicStreamingFloorPence: saved.publicStreaming ? (saved.publicStreamingFloorPence ?? null) : null,
    personalDownload: saved.personalDownload === true,
    personalDownloadUnlockPence: saved.personalDownload
      ? (saved.personalDownloadUnlockPence ?? 1)
      : null,
    openToRework: saved.openToRework === true,
    openToCommercial: saved.openToCommercial === true,
  };
}

export function summariseLicence(saved?: SavedLicence | null): string {
  if (!saved?.chosen) return 'No licence chosen yet';
  const parts = ['Personal streaming'];
  if (saved.publicStreaming) {
    parts.push(
      saved.publicStreamingFloorPence
        ? `Public streaming from £${(saved.publicStreamingFloorPence / 100).toFixed(2)}`
        : 'Public streaming'
    );
  }
  if (saved.personalDownload) {
    const pence = saved.personalDownloadUnlockPence || 1;
    parts.push(`Personal download from £${(pence / 100).toFixed(2)}`);
  }
  if (saved.openToRework) parts.push('Open to rework requests');
  if (saved.openToCommercial) parts.push('Open to commercial requests');
  return parts.join(' · ');
}

type LicenceId = 'personal' | 'public' | 'download' | 'rework' | 'commercial';

const LICENCES: Array<{
  id: LicenceId;
  name: string;
  visual: string[];
  description: string;
  pdf: string;
}> = [
  {
    id: 'personal',
    name: 'Personal streaming',
    visual: ['Listener', 'Their library', 'Play on Tuneable'],
    description:
      'Included with every tune. People can add it to their library and play it on Tuneable. It stays off parties and public charts, and the file is not handed over. You keep the copyright. This does not allow samples, sync, adverts, redistribution, or use for training AI models.',
    pdf: '/licences/personal-streaming.pdf',
  },
  {
    id: 'public',
    name: 'Public streaming',
    visual: ['Supporter tips', 'Meets your minimum', 'Party can play it'],
    description:
      'Parties and public charts can play this tune. You can set a minimum tip from the person who adds it to a party. Leave the minimum blank if any tip is enough. Personal listening stays available either way. This is not a sync or advert clearance.',
    pdf: '/licences/public-streaming.pdf',
  },
  {
    id: 'download',
    name: 'Personal download',
    visual: ['Tip on this tune', 'Reaches your price', 'One private copy'],
    description:
      'A listener who has tipped at least this amount on this tune can keep one personal copy. 1p is the suggested price if you want it essentially open. The copy is for private listening. Turning this off stops new downloads. A copy someone already unlocked stays with them.',
    pdf: '/licences/personal-download.pdf',
  },
  {
    id: 'rework',
    name: 'Rework requests',
    visual: ['Someone asks', 'You approve one use', 'Credit and a tip share'],
    description:
      'Records that you are open to a request for one sample, remix, or cover. A request names the use, the credit, the share of tips on the new work, and whether that new work can also be released off Tuneable. Turning this on does not clear anything.',
    pdf: '/licences/rework.pdf',
  },
  {
    id: 'commercial',
    name: 'Commercial requests',
    visual: ['A sync or advert ask', 'Fee, term, territory', 'You approve one use'],
    description:
      'Records that you are open to a request for one film, advert, game, or brand use. A request names the media, territory, term, and a fee or tip share. Turning this on does not clear a use, and it does not include a rework.',
    pdf: '/licences/commercial.pdf',
  },
];

function isOn(value: LicenceChoice, id: LicenceId): boolean {
  if (id === 'personal') return true;
  if (id === 'public') return value.publicStreaming;
  if (id === 'download') return value.personalDownload;
  if (id === 'rework') return value.openToRework;
  return value.openToCommercial;
}

function toggle(value: LicenceChoice, id: LicenceId): LicenceChoice {
  if (id === 'personal') return value;
  if (id === 'public') {
    const publicStreaming = !value.publicStreaming;
    return {
      ...value,
      publicStreaming,
      publicStreamingFloorPence: publicStreaming ? value.publicStreamingFloorPence : null,
    };
  }
  if (id === 'download') {
    const personalDownload = !value.personalDownload;
    return {
      ...value,
      personalDownload,
      personalDownloadUnlockPence: personalDownload ? (value.personalDownloadUnlockPence || 1) : null,
    };
  }
  if (id === 'rework') return { ...value, openToRework: !value.openToRework };
  return { ...value, openToCommercial: !value.openToCommercial };
}

function penceField(label: string, hint: string, amount: number | null, onAmount: (pence: number | null) => void) {
  return (
    <label className="block mt-3">
      <span className="block text-xs font-medium text-purple-100">{label}</span>
      <input
        inputMode="numeric"
        value={amount == null ? '' : String(amount)}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, '');
          onAmount(digits === '' ? null : Number(digits));
        }}
        className="mt-1 w-full max-w-[12rem] bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white"
        placeholder="1"
      />
      <span className="block text-xs text-gray-400 mt-1">{hint}</span>
    </label>
  );
}

const ICONS = {
  personal: Headphones,
  public: Users,
  download: Download,
  rework: RefreshCw,
  commercial: Megaphone,
};

type EditorProps = {
  mediaId: string;
  saved?: SavedLicence | null;
  canEdit: boolean;
  onSaved?: (licence: SavedLicence) => void;
};

export function MediaLicenceCard({ mediaId, saved, canEdit, onSaved }: EditorProps) {
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<LicenceChoice>(() => licenceChoiceFromSaved(saved));
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setChoice(licenceChoiceFromSaved(saved));
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await mediaAPI.updateMediaLicence(mediaId, choice);
      toast.success('Licence saved');
      setEditing(false);
      onSaved?.(result.licence);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not save the licence');
    } finally {
      setSaving(false);
    }
  };

  if (!saved?.chosen && !canEdit) return null;

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Licences</p>
          <p className="text-sm text-gray-300 mt-1">{summariseLicence(saved)}</p>
          {!saved?.chosen && canEdit && (
            <p className="text-xs text-amber-200 mt-1">
              Until you save a choice, parties can still play this tune.
            </p>
          )}
        </div>
        {canEdit && !editing && (
          <button type="button" onClick={startEditing} className="text-sm text-purple-300 underline shrink-0">
            {saved?.chosen ? 'Change' : 'Choose'}
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-3">
          <LicencePicker value={choice} onChange={setChoice} />
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : 'Save licences'}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Props = {
  value: LicenceChoice;
  onChange: (next: LicenceChoice) => void;
};

export default function LicencePicker({ value, onChange }: Props) {
  const [openId, setOpenId] = useState<LicenceId | null>('personal');

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-white font-semibold">Choose a licence</h3>
        <p className="text-sm text-gray-300 mt-1">
          Personal streaming is included. The others stay off until you open them. You can change this later.
          Example contracts are blanks, not legal advice.
        </p>
      </div>
      {LICENCES.map((licence) => {
        const open = openId === licence.id;
        const selected = isOn(value, licence.id);
        const Icon = ICONS[licence.id];
        return (
          <div
            key={licence.id}
            className={`rounded-lg border ${selected ? 'border-purple-400/70 bg-purple-900/30' : 'border-white/15 bg-black/20'}`}
          >
            <button
              type="button"
              className="w-full flex items-center gap-3 px-3 py-3 text-left"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : licence.id)}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-600/40 text-purple-100">
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 text-white font-medium">{licence.name}</span>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${selected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-gray-300'}`}>
                {licence.id === 'personal' ? 'Included' : selected ? 'On' : 'Off'}
              </span>
            </button>
            {open && (
              <div className="px-3 pb-3">
                <div className="flex flex-wrap items-center gap-1 text-xs text-purple-100 mb-2">
                  {licence.visual.map((step, index) => (
                    <span key={step} className="inline-flex items-center gap-1">
                      {index > 0 && <span className="text-purple-300">→</span>}
                      <span className="rounded-full bg-white/10 px-2 py-1">{step}</span>
                    </span>
                  ))}
                </div>
                <p className="text-sm text-gray-300">{licence.description}</p>
                <a
                  href={licence.pdf}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-2 text-sm text-purple-300 underline hover:text-purple-200"
                >
                  Example contract (PDF)
                </a>
                {licence.id !== 'personal' && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => onChange(toggle(value, licence.id))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${selected ? 'bg-white/10 text-white' : 'bg-purple-600 text-white'}`}
                    >
                      {selected ? 'Turn off' : 'Offer this'}
                    </button>
                  </div>
                )}
                {licence.id === 'public' && value.publicStreaming && penceField(
                  'Minimum tip before a party can play this (pence)',
                  'Optional. 100 pence is £1. Leave blank if any tip is enough.',
                  value.publicStreamingFloorPence,
                  (pence) => onChange({ ...value, publicStreamingFloorPence: pence })
                )}
                {licence.id === 'download' && value.personalDownload && penceField(
                  'Tip that unlocks a personal copy (pence)',
                  '1p is the suggested minimum. 100 pence is £1.',
                  value.personalDownloadUnlockPence,
                  (pence) => onChange({ ...value, personalDownloadUnlockPence: pence })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
