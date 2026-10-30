import {
  ARTIST_INVITE_AFFILIATE_PERCENT,
  ARTIST_TIP_SHARE_TARGET_PERCENT,
  ARTIST_TIP_SHARE_TODAY_PERCENT,
  FOUNDING_CREATOR_CAP,
  FOUNDING_UPLOAD_QUOTA_MB,
  HOW_MONEY_WORKS_PATH,
  PLATFORM_TAKE_TARGET_PERCENT,
  PLATFORM_TAKE_TODAY_PERCENT,
} from '../constants';

export const FAQ_PATH = '/faq';

export const FAQ_DESCRIPTION =
  'Short answers on tipping, rights, licences, welcome credit, TuneBytes, and how creators get paid.';

export type FaqLink = { to: string; label: string };

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  links: FaqLink[];
};

export type FaqGroup = {
  id: string;
  title: string;
  items: FaqItem[];
};

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: 'listeners',
    title: 'Listeners',
    items: [
      {
        id: 'what-is-tuneable',
        question: 'What is Tuneable?',
        answer:
          'Tuneable is a place to tip music, podcasts, and books. Your tips pay creators and move what you love up public charts.',
        links: [
          { to: '/about', label: 'About' },
          { to: '/help#getting-started', label: 'Getting started' },
        ],
      },
      {
        id: 'streaming',
        question: 'Is this a streaming service?',
        answer:
          'You can play tunes the creator has allowed, in a library, a party, or on the charts. A tip is support and a vote. It does not hand you the file.',
        links: [{ to: '/help#tipping', label: 'How tipping works' }],
      },
      {
        id: 'where-tips-go',
        question: 'Where does my tip go?',
        answer: `${ARTIST_TIP_SHARE_TODAY_PERCENT}% of each tip goes to the artist, or is split among rights-holders. Tuneable keeps ${PLATFORM_TAKE_TODAY_PERCENT}% today and is committed to cutting that to ${PLATFORM_TAKE_TARGET_PERCENT}% at scale, so ${ARTIST_TIP_SHARE_TARGET_PERCENT}% reaches artists. Card and app-store fees are charged separately.`,
        links: [{ to: HOW_MONEY_WORKS_PATH, label: 'How money works' }],
      },
      {
        id: 'owning-a-tune',
        question: 'Do I own a tune I tip on?',
        answer:
          'A tip does not transfer the copyright or give you a file to keep. If the creator has allowed a personal download, one private copy unlocks once your tips on that tune reach the price they set.',
        links: [{ to: '/terms-of-service', label: 'Terms of Service' }],
      },
      {
        id: 'welcome-credit',
        question: 'What is the welcome credit, and what are its limits?',
        answer:
          'New users can claim £11.11 in promotional credit. Tips paid with it are capped at £1.11 each, £3.33 and three songs per artist, and £1.11 on a track you own. Unused credit can expire after 12 months.',
        links: [
          { to: '/help#getting-started', label: 'Getting started' },
          { to: '/terms-of-service#welcome-credit', label: 'Welcome credit terms' },
        ],
      },
      {
        id: 'tunebytes',
        question: 'What are TuneBytes?',
        answer:
          'You earn TuneBytes when other people later tip tunes you tipped. You can earn them now. Spending them with that creator, on merch, vinyl, gigs, and perks, starts in a later release.',
        links: [{ to: '/about#tunebytes', label: 'TuneBytes' }],
      },
    ],
  },
  {
    id: 'creators',
    title: 'Creators',
    items: [
      {
        id: 'your-rights',
        question: 'Do I keep my rights?',
        answer:
          'You keep the copyright. Uploading or claiming a tune grants Tuneable only the licences you choose, and you can change or revoke them later.',
        links: [{ to: '/terms-of-service', label: 'Terms of Service' }],
      },
      {
        id: 'licences',
        question: 'What does choosing a licence actually allow?',
        answer:
          'Streaming is included, so people can play the tune on Tuneable. You can also allow a personal download at a tip price you set, and record that you are open to a rework or a commercial request. Those options stay off until you turn them on, and a request still needs your approval.',
        links: [{ to: '/terms-of-service#tune-licences', label: 'Tune licences' }],
      },
      {
        id: 'getting-paid',
        question: 'How and when do I get paid?',
        answer: `Verified creators receive ${ARTIST_TIP_SHARE_TODAY_PERCENT}% of each tip in escrow and request a payout from the artist dashboard. Tips are stored until an unverified artist claims them. The part of a tip paid with welcome credit stays pending until that listener tops up with real money.`,
        links: [
          { to: HOW_MONEY_WORKS_PATH, label: 'How money works' },
          { to: '/help#creating-content', label: 'Artist earnings' },
        ],
      },
      {
        id: 'founding-creators',
        question: 'What is a founding creator?',
        answer: `Eligible creators claim a founding seat when they upload their own music, up to ${FOUNDING_CREATOR_CAP.toLocaleString()} seats (${FOUNDING_UPLOAD_QUOTA_MB.toLocaleString()} MB of uploads). Founding status is not equity. A founding creator with a complete verified profile earns ${ARTIST_INVITE_AFFILIATE_PERCENT}% of an invited artist's paid tips for a year after that artist is verified, taken from Tuneable's share, on music the artist uploads.`,
        links: [{ to: '/help#creating-content', label: 'Creating content' }],
      },
      {
        id: 'ai-in-music',
        question: 'Do I have to say if I used AI?',
        answer:
          'Yes. Say if, how, and where you used AI to make the music. Listeners can then tell human-made work from work made with AI, and filter on that difference.',
        links: [{ to: '/help#creating-content', label: 'AI in music creation' }],
      },
    ],
  },
];

export const FAQ_ITEMS: FaqItem[] = FAQ_GROUPS.flatMap((group) => group.items);

export function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
