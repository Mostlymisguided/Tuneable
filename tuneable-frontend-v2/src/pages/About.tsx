import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  Crown,
  Headphones,
  Heart,
  Globe,
  MapPin,
  Music,
  Users,
  Shield,
  Waves,
  Coins,
  Percent,
  Landmark,
  Vote,
  Ticket,
  Shirt,
  Disc3,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

const pillars: {
  title: string;
  items: { icon: LucideIcon; label: string; panel: string }[];
  note?: string;
}[] = [
  {
    title: 'Tip what you love',
    items: [
      { icon: Heart, label: 'Pays the creator', panel: 'bg-pink-100 text-pink-600' },
      { icon: Globe, label: 'Moves the charts', panel: 'bg-purple-100 text-purple-600' },
    ],
  },
  {
    title: 'Own what you champion',
    items: [
      { icon: Crown, label: 'Be a local champion', panel: 'bg-amber-100 text-amber-600' },
      { icon: MapPin, label: 'Local or worldwide', panel: 'bg-indigo-100 text-indigo-600' },
    ],
  },
  {
    title: 'Showcase your taste',
    items: [
      { icon: Music, label: 'Music', panel: 'bg-purple-100 text-purple-600' },
      { icon: Headphones, label: 'Podcasts', panel: 'bg-pink-100 text-pink-600' },
      { icon: BookOpen, label: 'Books', panel: 'bg-indigo-100 text-indigo-600' },
    ],
    note: 'Stays in your library.',
  },
];

const objects: { icon: LucideIcon; title: string }[] = [
  { icon: Heart, title: 'Promote healing and communication through music' },
  { icon: Globe, title: 'Democratically and transparently chart the global music catalogue' },
  { icon: Coins, title: 'Empower artists by encouraging users to pay a fair price for music' },
  {
    icon: Waves,
    title:
      'Promote the adoption of more resonant musical tuning standards than the current standard pitch of A4 = 440Hz',
  },
  {
    icon: Users,
    title: 'Provide participatory musical experiences in public and private spaces',
  },
];

const About: React.FC = () => {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.replace('#', '');
    const scrollToHash = () => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const timer = window.setTimeout(scrollToHash, 50);
    return () => window.clearTimeout(timer);
  }, [hash]);

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-900 via-purple-900 to-indigo-800 text-white">
        <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 lg:px-8">
          <h1 className="text-balance text-3xl font-bold leading-tight sm:text-5xl md:text-6xl">
            <span className="block">Tip what you love</span>
            <span className="mt-3 block text-pink-300">Own what you champion</span>
            <span className="mt-3 block">Showcase your taste</span>
          </h1>
          <div className="mt-12 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              to="/party/global?period=all-time"
              className="rounded-lg border-2 border-white px-8 py-3 text-center text-lg font-semibold text-white transition-colors hover:bg-white hover:text-gray-900"
            >
              Charts
            </Link>
            <Link
              to="/places"
              className="rounded-lg border-2 border-white px-8 py-3 text-center text-lg font-semibold text-white transition-colors hover:bg-white hover:text-gray-900"
            >
              Places
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-center text-2xl font-bold text-gray-900">{pillar.title}</h2>
              <div
                className={`mt-6 grid gap-3 ${
                  pillar.items.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
                }`}
              >
                {pillar.items.map(({ icon: Icon, label, panel }) => (
                  <div key={label} className="overflow-hidden rounded-2xl border border-gray-200">
                    <div className={`flex h-24 items-center justify-center sm:h-28 ${panel}`}>
                      <Icon className="h-8 w-8 sm:h-10 sm:w-10" />
                    </div>
                    <p className="px-2 py-3 text-center text-sm font-semibold text-gray-900">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
              {pillar.note ? (
                <p className="mt-4 text-center text-sm text-gray-500">{pillar.note}</p>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl px-4 text-center text-base leading-relaxed text-gray-600">
          The people who tip a work the most become its champion - displayed beside the tune,
          podcast, or book they love. Vie for that place where you live, or worldwide. Anyone can
          take it by tipping more.
        </p>
      </section>

      <section id="how-money-works" className="scroll-mt-24 bg-indigo-950 py-16 text-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">Artists keep more as we grow</h2>
            <p className="text-lg leading-relaxed text-indigo-100">
              Shares below are of the tip itself. Card and app-store fees are charged separately.
            </p>
          </div>
          <div className="mb-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-white/15 bg-white/10 p-6">
              <Percent className="mb-4 h-8 w-8 text-pink-400" />
              <h3 className="mb-2 font-semibold text-white">Today</h3>
              <p className="text-3xl font-bold text-white">70%</p>
              <p className="mt-2 text-sm leading-relaxed text-indigo-100">
                of each tip goes to the artist. 30% funds Tuneable while we are still small.
              </p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-6">
              <Coins className="mb-4 h-8 w-8 text-yellow-400" />
              <h3 className="mb-2 font-semibold text-white">At scale</h3>
              <p className="text-3xl font-bold text-white">90%</p>
              <p className="mt-2 text-sm leading-relaxed text-indigo-100">
                to artists, 10% to the platform. The take rate is intended only to fall.
              </p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-6">
              <Vote className="mb-4 h-8 w-8 text-green-400" />
              <h3 className="mb-2 font-semibold text-white">At £1 billion</h3>
              <p className="mt-2 text-sm leading-relaxed text-indigo-100">
                Full community governance: a DAO owned and steered by artists and users.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-6">
            <Landmark className="mt-1 h-8 w-8 flex-shrink-0 text-purple-300" />
            <p className="leading-relaxed text-indigo-100">
              Tuneable is a UK Community Interest Company. It is not conducted for private gain:
              surplus and assets are used for the benefit of the community.
            </p>
          </div>
          <div className="mt-6 flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-6">
            <Shield className="mt-1 h-8 w-8 flex-shrink-0 text-pink-300" />
            <div>
              <h3 className="mb-2 font-semibold text-white">No billionaires</h3>
              <p className="leading-relaxed text-indigo-100">
                Anyone whose net worth exceeds £1 billion must sell their shares in Tuneable and
                end their involvement with the organisation.
              </p>
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6">
            <h3 className="mb-2 font-semibold text-white">Founding Creators</h3>
            <p className="text-sm leading-relaxed text-indigo-100">
              The first 1,111 creators who upload their own music become founding creators, with a
              tuneable upload allowance and exclusive access to the 3% artist-invite commission
              (from Tuneable&apos;s share). Founding status is a platform benefit — not equity or
              ownership. Details are in the Terms.
            </p>
          </div>
          <p className="mt-8 text-center text-sm text-indigo-200">
            The current split and this direction are also in our{' '}
            <Link to="/terms-of-service" className="underline hover:text-white">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </section>

      <section id="tunebytes" className="scroll-mt-24 bg-white py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">TuneBytes</h2>
            <p className="text-lg text-gray-600 md:text-xl">
              Tip media before it grows. Earlier tips earn more.
            </p>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 p-6 text-center sm:p-8">
            <h3 className="text-xl font-bold text-gray-900 md:text-2xl">
              After the MVP, spend them with that creator
            </h3>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: Shirt, label: 'Merch' },
                { icon: Disc3, label: 'Vinyl' },
                { icon: Ticket, label: 'Gigs' },
                { icon: Sparkles, label: 'Perks' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="rounded-xl bg-white px-3 py-4 shadow-sm">
                  <Icon className="mx-auto mb-2 h-7 w-7 text-purple-600" />
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-xl text-gray-600">
              Creators set aside a share of their earnings. That pool buys the perks. Fans spend
              the TuneBytes they earned.
            </p>
          </div>
          <p className="mt-8 text-center text-sm text-gray-500">
            You can earn TuneBytes today. Spending them opens after the MVP, when creators can fund
            these pools.
          </p>
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">Legal Mission</h2>
            <p className="mt-3 text-balance text-gray-600">
              As a CIC, Tuneable is legally bound to the following objectives.
            </p>
          </div>
          <ul className="space-y-3">
            {objects.map(({ icon: Icon, title }) => (
              <li
                key={title}
                className="flex items-center gap-4 rounded-xl bg-white px-4 py-4 shadow-sm"
              >
                <Icon className="h-5 w-5 shrink-0 text-purple-600" />
                <span className="font-medium text-gray-900">{title}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-gradient-to-r from-purple-600 to-indigo-600 py-16 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-8 text-3xl font-bold md:text-4xl">Tip what you love</h2>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              to="/register"
              className="rounded-lg bg-white px-8 py-3 font-semibold text-purple-600 transition-colors hover:bg-gray-100"
            >
              Get Started
            </Link>
            <Link
              to="/creator/register"
              className="rounded-lg border-2 border-purple-400 bg-purple-700 px-8 py-3 font-semibold text-white transition-colors hover:bg-purple-800"
            >
              Become a Creator
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-gray-900 py-8 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between md:flex-row">
            <div className="mb-4 md:mb-0">
              <p className="text-gray-400">&copy; 2025 Tuneable. All rights reserved.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <Link to="/party/global?period=all-time" className="text-gray-400 transition-colors hover:text-white">
                Charts
              </Link>
              <Link to="/places" className="text-gray-400 transition-colors hover:text-white">
                Places
              </Link>
              <Link to="/join-us" className="text-gray-400 transition-colors hover:text-white">
                Join Us
              </Link>
              <a
                href="https://discord.gg/hwGMZV89up"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 transition-colors hover:text-white"
              >
                Discord
              </a>
              <Link to="/help" className="text-gray-400 transition-colors hover:text-white">
                Help
              </Link>
              <Link to="/about#how-money-works" className="text-gray-400 transition-colors hover:text-white">
                How money works
              </Link>
              <Link to="/about#tunebytes" className="text-gray-400 transition-colors hover:text-white">
                TuneBytes
              </Link>
              <Link to="/privacy-policy" className="text-gray-400 transition-colors hover:text-white">
                Privacy Policy
              </Link>
              <Link to="/terms-of-service" className="text-gray-400 transition-colors hover:text-white">
                Terms of Service
              </Link>
              <Link to="/data-deletion" className="text-gray-400 transition-colors hover:text-white">
                Data Deletion
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default About;
