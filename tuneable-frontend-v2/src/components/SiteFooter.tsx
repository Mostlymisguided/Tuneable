import { Link } from 'react-router-dom';
import { HOW_MONEY_WORKS_PATH } from '../constants';
import { usePodcastPlayerStore } from '../stores/podcastPlayerStore';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { isMediaPlayable } from '../utils/mediaPlayability';
import { hasAuthToken } from '../utils/playAuth';

const linkClass = 'text-gray-400 transition-colors hover:text-white';

const productLinks = [
  { to: '/about', label: 'About' },
  { to: '/help#support', label: 'Contact' },
  { to: '/help', label: 'Help' },
  { to: '/join-us', label: 'Join Us' },
  { to: '/party/global?period=all-time', label: 'Charts' },
  { to: '/places', label: 'Places' },
  { to: HOW_MONEY_WORKS_PATH, label: 'How money works' },
  { to: '/about#tunebytes', label: 'TuneBytes' },
];

const legalLinks = [
  { to: '/terms-of-service', label: 'Terms of Service' },
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/data-deletion', label: 'Data Deletion' },
];

const SiteFooter = () => {
  const year = new Date().getFullYear();
  const webMedia = useWebPlayerStore((state) => state.currentMedia);
  const webPlayerOpen = useWebPlayerStore((state) => state.isGlobalPlayerActive);
  const podcastOpen = usePodcastPlayerStore((state) => !!state.currentEpisode);
  const playerOpen =
    podcastOpen || webPlayerOpen || (!!webMedia && hasAuthToken() && isMediaPlayable(webMedia));

  return (
    <footer className={`bg-gray-900 pt-8 text-white ${playerOpen ? 'pb-40' : 'pb-8'}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 md:flex-row md:items-start md:justify-between">
          <p className="text-gray-400">&copy; {year} Tuneable CIC. All rights reserved.</p>
          <nav aria-label="Footer" className="flex flex-col items-center gap-3 md:items-end">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 md:justify-end">
              {productLinks.map((link) => (
                <Link key={link.label} to={link.to} className={linkClass}>
                  {link.label}
                </Link>
              ))}
              <a
                href="https://discord.gg/hwGMZV89up"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                Discord
              </a>
            </div>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 md:justify-end">
              {legalLinks.map((link) => (
                <Link key={link.label} to={link.to} className={linkClass}>
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
