import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { FAQ_GROUPS } from '../content/faq';

const Faq: React.FC = () => {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.replace('#', '');
    const el = document.getElementById(id);
    if (el instanceof HTMLDetailsElement) el.open = true;
    const scrollToHash = () => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    };
    const timer = window.setTimeout(scrollToHash, 50);
    return () => window.clearTimeout(timer);
  }, [hash]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-xl p-8 shadow-2xl">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-4 flex items-center gap-3">
              <HelpCircle className="h-10 w-10 text-purple-400" />
              FAQ
            </h1>
            <p className="text-gray-300 text-lg">
              Short answers before you join. The longer how-to is on{' '}
              <Link to="/help" className="text-purple-300 underline">
                Help
              </Link>
              .
            </p>
            <nav aria-label="FAQ sections" className="mt-4 flex gap-4">
              {FAQ_GROUPS.map((group) => (
                <a key={group.id} href={`#${group.id}`} className="text-purple-300 underline">
                  {group.title}
                </a>
              ))}
            </nav>
          </div>

          <div className="space-y-10">
            {FAQ_GROUPS.map((group) => (
              <section key={group.id} id={group.id} className="scroll-mt-24">
                <h2 className="text-2xl font-semibold text-white mb-2">{group.title}</h2>
                <div className="divide-y divide-white/10 border-y border-white/10">
                  {group.items.map((item) => (
                    <details key={item.id} id={item.id} className="group scroll-mt-24">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left [&::-webkit-details-marker]:hidden">
                        <h3 className="text-lg font-semibold text-white">{item.question}</h3>
                        <ChevronDown className="h-5 w-5 shrink-0 text-purple-300 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="pb-4 pr-8">
                        <p className="text-gray-300">{item.answer}</p>
                        {item.links.length > 0 && (
                          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                            {item.links.map((link) => (
                              <Link key={link.to} to={link.to} className="text-purple-300 underline">
                                {link.label}
                              </Link>
                            ))}
                          </p>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Faq;
