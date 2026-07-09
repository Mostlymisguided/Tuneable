import React from 'react';
import { MapPin } from 'lucide-react';

interface PodcastChartHeroProps {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

const PodcastChartHero: React.FC<PodcastChartHeroProps> = ({
  categories,
  selectedCategory,
  onCategoryChange,
}) => {
  const quickPicks = categories.slice(0, 6);

  return (
    <div className="text-center px-3 sm:px-6 pt-6 sm:pt-10 pb-3">
      <p className="text-[10px] sm:text-xs font-semibold tracking-[0.3em] uppercase text-purple-300/80 mb-2">
        The World&apos;s Best Podcasts
      </p>
      <p className="text-[10px] sm:text-xs font-semibold tracking-[0.3em] uppercase text-purple-300/80 mb-2">
        Voted From
      </p>
      <h1 className="text-3xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-white to-purple-300 drop-shadow-[0_2px_10px_rgba(168,85,247,0.35)]">
        Earth
      </h1>
      <span className="mt-3 inline-flex items-center gap-2 text-xs sm:text-sm text-gray-400">
        <MapPin className="h-3.5 w-3.5 text-purple-400" />
        Ranked by tips from listeners worldwide
      </span>

      {quickPicks.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => onCategoryChange('')}
            className={`rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
              !selectedCategory
                ? 'bg-purple-600 text-white ring-1 ring-purple-400/50'
                : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
            }`}
          >
            All
          </button>
          {quickPicks.map((cat) => {
            const selected = selectedCategory.toLowerCase() === cat.toLowerCase();
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onCategoryChange(selected ? '' : cat)}
                className={`rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-purple-600 text-white ring-1 ring-purple-400/50'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PodcastChartHero;
