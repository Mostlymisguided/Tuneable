import React from 'react';
import { TrendingUp } from 'lucide-react';
import { DEFAULT_COVER_ART } from '../constants';
import { penceToPounds } from '../utils/currency';

export interface PodcastSeriesItem {
  _id: string;
  title: string;
  coverArt?: string;
  description?: string;
  genres?: string[];
  totalGlobalMediaAggregate: number;
  episodeCount: number;
}

interface PodcastSeriesStripProps {
  series: PodcastSeriesItem[];
  isLoading?: boolean;
  onSeriesClick: (seriesId: string) => void;
}

const PodcastSeriesStrip: React.FC<PodcastSeriesStripProps> = ({
  series,
  isLoading = false,
  onSeriesClick,
}) => {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (series.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-purple-500/20">
      <h2 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center px-1">
        <TrendingUp className="h-5 w-5 mr-2 text-purple-400 flex-shrink-0" />
        Top Shows
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-purple-600/40">
        {series.map((item, index) => (
          <button
            key={item._id}
            type="button"
            onClick={() => onSeriesClick(item._id)}
            className="flex-shrink-0 w-36 sm:w-44 text-left rounded-xl overflow-hidden bg-gray-900/50 border border-white/10 hover:border-purple-500/40 hover:shadow-[0_0_20px_rgba(168,85,247,0.12)] transition-all group"
          >
            <div className="relative">
              <img
                src={item.coverArt || DEFAULT_COVER_ART}
                alt={item.title}
                className="w-full aspect-square object-cover"
              />
              <span className="absolute top-2 left-2 text-purple-300 font-bold text-sm bg-black/50 rounded-full w-7 h-7 flex items-center justify-center">
                {index + 1}
              </span>
            </div>
            <div className="p-3">
              <h3 className="text-white font-semibold text-sm line-clamp-2 group-hover:text-purple-200 transition-colors">
                {item.title}
              </h3>
              <p className="text-purple-300 text-xs font-medium mt-1">
                {penceToPounds(item.totalGlobalMediaAggregate)}
              </p>
              <p className="text-gray-500 text-[10px] mt-0.5">
                {item.episodeCount} {item.episodeCount === 1 ? 'episode' : 'episodes'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PodcastSeriesStrip;
