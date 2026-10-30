import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';

export type LicenceChoice = {
  personalStreaming: true;
  personalDownload: boolean;
  personalDownloadUnlockPence: number | null;
  openToRework: boolean;
  openToCommercial: boolean;
};

export type SavedLicence = Partial<LicenceChoice> & { chosen?: boolean };

export const DEFAULT_LICENCE_CHOICE: LicenceChoice = {
  personalStreaming: true,
  personalDownload: false,
  personalDownloadUnlockPence: null,
  openToRework: false,
  openToCommercial: false,
};

const PDF_BASE = 'https://tuneable.stream/licences';

type LicenceId = 'streaming' | 'download' | 'rework' | 'commercial';

const LICENCES: Array<{
  id: LicenceId;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  visual: string;
  description: string;
  pdf: string;
}> = [
  {
    id: 'streaming',
    name: 'Streaming',
    icon: 'musical-notes-outline',
    visual: 'Listener → library, party, or chart → play on Tuneable',
    description:
      'Included. People can keep it in a library and play it on Tuneable, including in a party and on the public charts. The file is not handed over. You keep the copyright.',
    pdf: `${PDF_BASE}/streaming.pdf`,
  },
  {
    id: 'download',
    name: 'Personal download',
    icon: 'download-outline',
    visual: 'Tip on this tune → reaches your price → one private copy',
    description:
      'A listener who has tipped at least this amount can keep one personal copy. 1p is the suggested price. Turning this off stops new downloads. A copy already unlocked stays with that listener.',
    pdf: `${PDF_BASE}/personal-download.pdf`,
  },
  {
    id: 'rework',
    name: 'Rework requests',
    icon: 'refresh-outline',
    visual: 'Someone asks → you approve one use → credit and a tip share',
    description:
      'Records that you are open to a request for one sample, remix, or cover. Turning this on does not clear anything.',
    pdf: `${PDF_BASE}/rework.pdf`,
  },
  {
    id: 'commercial',
    name: 'Commercial requests',
    icon: 'megaphone-outline',
    visual: 'A sync or advert ask → fee, term, territory → you approve one use',
    description:
      'Records that you are open to a request for one film, advert, or brand use. Turning this on does not clear a use, and it does not include a rework.',
    pdf: `${PDF_BASE}/commercial.pdf`,
  },
];

function isOn(value: LicenceChoice, id: LicenceId): boolean {
  if (id === 'streaming') return true;
  if (id === 'download') return value.personalDownload;
  if (id === 'rework') return value.openToRework;
  return value.openToCommercial;
}

function toggle(value: LicenceChoice, id: LicenceId): LicenceChoice {
  if (id === 'streaming') return value;
  if (id === 'download') {
    const personalDownload = !value.personalDownload;
    return {
      ...value,
      personalDownload,
      personalDownloadUnlockPence: personalDownload ? (value.personalDownloadUnlockPence || 1) : null,
    };
  }
  if (id === 'rework') return { ...value, openToRework: !value.openToRework };
  if (id === 'commercial') return { ...value, openToCommercial: !value.openToCommercial };
  return value;
}

export function licenceChoiceFromSaved(saved?: SavedLicence | null): LicenceChoice {
  if (!saved?.chosen) return { ...DEFAULT_LICENCE_CHOICE };
  return {
    personalStreaming: true,
    personalDownload: saved.personalDownload === true,
    personalDownloadUnlockPence: saved.personalDownload ? (saved.personalDownloadUnlockPence ?? 1) : null,
    openToRework: saved.openToRework === true,
    openToCommercial: saved.openToCommercial === true,
  };
}

function PenceField({
  label,
  hint,
  amount,
  onAmount,
}: {
  label: string;
  hint: string;
  amount: number | null;
  onAmount: (pence: number | null) => void;
}) {
  return (
    <View style={styles.pence}>
      <Text style={styles.penceLabel}>{label}</Text>
      <TextInput
        value={amount == null ? '' : String(amount)}
        onChangeText={(text) => {
          const digits = text.replace(/[^\d]/g, '');
          onAmount(digits === '' ? null : Number(digits));
        }}
        keyboardType="number-pad"
        placeholder="1"
        placeholderTextColor={colors.textMuted}
        style={styles.penceInput}
      />
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

export function LicencePicker({
  value,
  onChange,
}: {
  value: LicenceChoice;
  onChange: (next: LicenceChoice) => void;
}) {
  const [openId, setOpenId] = useState<LicenceId | null>('streaming');

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Choose a licence</Text>
      <Text style={styles.intro}>
        Streaming is included. The others stay off until you open them. You can change this later.
        Example contracts are blanks, not legal advice.
      </Text>
      {LICENCES.map((licence) => {
        const open = openId === licence.id;
        const selected = isOn(value, licence.id);
        return (
          <View key={licence.id} style={[styles.card, selected && styles.cardOn]}>
            <Pressable
              onPress={() => setOpenId(open ? null : licence.id)}
              style={styles.header}
              accessibilityRole="button"
            >
              <Ionicons name={licence.icon} size={18} color={colors.accentLight} />
              <Text style={styles.name}>{licence.name}</Text>
              <Text style={[styles.badge, selected && styles.badgeOn]}>
                {licence.id === 'streaming' ? 'Included' : selected ? 'On' : 'Off'}
              </Text>
            </Pressable>
            {open ? (
              <View style={styles.body}>
                <Text style={styles.visual}>{licence.visual}</Text>
                <Text style={styles.description}>{licence.description}</Text>
                <Pressable onPress={() => void Linking.openURL(licence.pdf)}>
                  <Text style={styles.link}>Example contract (PDF)</Text>
                </Pressable>
                {licence.id !== 'streaming' ? (
                  <Pressable
                    style={[styles.offerBtn, selected && styles.offerBtnOff]}
                    onPress={() => onChange(toggle(value, licence.id))}
                  >
                    <Text style={styles.offerText}>{selected ? 'Turn off' : 'Offer this'}</Text>
                  </Pressable>
                ) : null}
                {licence.id === 'download' && value.personalDownload ? (
                  <PenceField
                    label="Tip that unlocks a personal copy (pence)"
                    hint="1p is the suggested minimum. 100 pence is £1."
                    amount={value.personalDownloadUnlockPence}
                    onAmount={(pence) => onChange({ ...value, personalDownloadUnlockPence: pence })}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 16 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  cardOn: { borderColor: 'rgba(168, 85, 247, 0.7)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  name: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  badge: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  badgeOn: { color: '#bbf7d0', backgroundColor: 'rgba(34, 197, 94, 0.2)' },
  body: { paddingHorizontal: 12, paddingBottom: 12 },
  visual: { color: '#e9d5ff', fontSize: 12, marginBottom: 6 },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  link: { color: colors.accentLight, textDecorationLine: 'underline', marginTop: 8, fontSize: 13 },
  offerBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  offerBtnOff: { backgroundColor: 'rgba(255,255,255,0.12)' },
  offerText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  pence: { marginTop: 10 },
  penceLabel: { color: colors.text, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  penceInput: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 140,
  },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
});
