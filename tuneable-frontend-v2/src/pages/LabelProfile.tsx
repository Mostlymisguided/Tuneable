import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, Music, TrendingUp, Calendar, MapPin, Globe, Instagram, Facebook, Youtube, Twitter } from 'lucide-react';
import { labelAPI } from '../lib/api';

interface Label {
  _id: string;
  name: string;
  slug: string;
  description: string;
  logo: string;
  coverImage: string;
  email: string;
  website: string;
  location: {
    city: string;
    country: string;
  };
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    soundcloud?: string;
    spotify?: string;
    youtube?: string;
    twitter?: string;
    tiktok?: string;
  };
  foundedYear: number;
  genres: string[];
  stats?: {
    artistCount?: number;
    releaseCount?: number;
    totalBidAmount?: number;
    averageBidAmount?: number;
    topBidAmount?: number;
    totalBidCount?: number;
  };
  verificationStatus: string;
  createdAt: string;
}

interface Media {
  _id: string;
  title: string;
  artist: string;
  coverArt: string;
  releaseDate: string;
  stats: {
    totalBidAmount: number;
    bidCount: number;
  };
}

interface Artist {
  _id: string;
  username: string;
  profilePic: string;
  creatorProfile: {
    artistName: string;
    genres: string[];
  };
}

const LabelProfile: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [label, setLabel] = useState<Label | null>(null);
  const [recentReleases, setRecentReleases] = useState<Media[]>([]);
  const [topMedia, setTopMedia] = useState<Media[]>([]);
  const [artists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'artists' | 'media'>('overview');

  useEffect(() => {
    if (slug) {
      fetchLabelData();
    }
  }, [slug]);

  const fetchLabelData = async () => {
    try {
      setLoading(true);
      const data = await labelAPI.getLabelBySlug(slug!);
      
      setLabel(data.label);
      setRecentReleases(data.recentReleases || []);
      setTopMedia(data.topMedia || []);
    } catch (error: any) {
      console.error('Error fetching label data:', error);
      // Handle error (label not found, etc.)
    } finally {
      setLoading(false);
    }
  };


  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading label profile...</div>
      </div>
    );
  }

  if (!label) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Label not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="relative">
        {/* Cover Image */}
        {label.coverImage && (
          <div 
            className="h-64 md:h-80 bg-cover bg-center"
            style={{ backgroundImage: `url(${label.coverImage})` }}
          />
        )}
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/50 to-transparent" />
        
        {/* Label Info */}
        <div className="relative px-4 md:px-8 pb-8">
          <div className="flex flex-col md:flex-row items-start md:items-end space-y-4 md:space-y-0 md:space-x-6">
            {/* Logo */}
            {label.logo && (
              <img
                src={label.logo}
                alt={`${label.name} logo`}
                className="w-24 h-24 md:w-32 md:h-32 rounded-lg object-cover border-4 border-white shadow-lg"
              />
            )}
            
            {/* Label Details */}
            <div className="flex-1 text-white">
              <div className="flex items-center space-x-2 mb-2">
                <h1 className="text-3xl md:text-4xl font-bold">{label.name}</h1>
                {label.verificationStatus === 'verified' && (
                  <div className="bg-blue-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                    Verified
                  </div>
                )}
              </div>
              
              {label.description && (
                <p className="text-gray-300 mb-4 max-w-2xl">{label.description}</p>
              )}
              
              {/* Stats */}
              {label.stats && (
                <div className="flex flex-wrap gap-6 text-sm">
                  {label.stats.artistCount !== undefined && (
                    <div className="flex items-center space-x-1">
                      <Users className="w-4 h-4" />
                      <span>{label.stats.artistCount || 0} artists</span>
                    </div>
                  )}
                  {label.stats.releaseCount !== undefined && (
                    <div className="flex items-center space-x-1">
                      <Music className="w-4 h-4" />
                      <span>{label.stats.releaseCount || 0} releases</span>
                    </div>
                  )}
                  {label.stats.totalBidAmount !== undefined && (
                    <div className="flex items-center space-x-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>{formatCurrency(label.stats.totalBidAmount || 0)} total bids</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-700">
        <div className="px-4 md:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'artists', label: 'Artists' },
              { id: 'media', label: 'Releases' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 md:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Label Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Basic Info */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Label Information</h3>
                <div className="space-y-3">
                  {label.foundedYear && (
                    <div className="flex items-center space-x-2 text-gray-300">
                      <Calendar className="w-4 h-4" />
                      <span>Founded {label.foundedYear}</span>
                    </div>
                  )}
                  
                  {label.location && (label.location.city || label.location.country) && (
                    <div className="flex items-center space-x-2 text-gray-300">
                      <MapPin className="w-4 h-4" />
                      <span>{[label.location.city, label.location.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  
                  {label.website && (
                    <div className="flex items-center space-x-2 text-gray-300">
                      <Globe className="w-4 h-4" />
                      <a href={label.website} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                        {label.website}
                      </a>
                    </div>
                  )}
                  
                  {label.genres && label.genres.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {label.genres.map((genre, index) => (
                        <span key={index} className="bg-purple-600 text-white px-2 py-1 rounded-full text-xs">
                          {genre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Social Media */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Social Media</h3>
                <div className="space-y-3">
                  {label.socialMedia?.instagram && (
                    <a href={label.socialMedia.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-gray-300 hover:text-white">
                      <Instagram className="w-4 h-4" />
                      <span>Instagram</span>
                    </a>
                  )}
                  
                  {label.socialMedia?.facebook && (
                    <a href={label.socialMedia.facebook} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-gray-300 hover:text-white">
                      <Facebook className="w-4 h-4" />
                      <span>Facebook</span>
                    </a>
                  )}
                  
                  {label.socialMedia?.youtube && (
                    <a href={label.socialMedia.youtube} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-gray-300 hover:text-white">
                      <Youtube className="w-4 h-4" />
                      <span>YouTube</span>
                    </a>
                  )}
                  
                  {label.socialMedia?.twitter && (
                    <a href={label.socialMedia.twitter} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-gray-300 hover:text-white">
                      <Twitter className="w-4 h-4" />
                      <span>Twitter</span>
                    </a>
                  )}
                  
                  {(!label.socialMedia || (
                    !label.socialMedia.instagram &&
                    !label.socialMedia.facebook &&
                    !label.socialMedia.youtube &&
                    !label.socialMedia.twitter
                  )) && (
                    <p className="text-gray-400 text-sm">No social media links available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Releases */}
            {recentReleases.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold text-white mb-4">Recent Releases</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentReleases.map((release) => (
                    <div key={release._id} className="bg-gray-800 rounded-lg p-4 flex space-x-4">
                      <img
                        src={release.coverArt}
                        alt={release.title}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <h4 className="text-white font-medium">{release.title}</h4>
                        <p className="text-gray-400 text-sm">{release.artist}</p>
                        <p className="text-purple-400 text-sm">{formatCurrency(release.stats.totalBidAmount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Performing Media */}
            {topMedia.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold text-white mb-4">Top Performing Releases</h3>
                <div className="space-y-2">
                  {topMedia.map((media, index) => (
                    <div key={media._id} className="bg-gray-800 rounded-lg p-4 flex items-center space-x-4">
                      <div className="text-purple-400 font-bold w-8">#{index + 1}</div>
                      <img
                        src={media.coverArt}
                        alt={media.title}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <h4 className="text-white font-medium">{media.title}</h4>
                        <p className="text-gray-400 text-sm">{media.artist}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-purple-400 font-medium">{formatCurrency(media.stats.totalBidAmount)}</p>
                        <p className="text-gray-400 text-sm">{media.stats.bidCount} bids</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'artists' && (
          <div>
            <h3 className="text-xl font-semibold text-white mb-4">Artists</h3>
            {artists.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {artists.map((artist) => (
                  <Link
                    key={artist._id}
                    to={`/profile/${artist.username}`}
                    className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <img
                        src={artist.profilePic}
                        alt={artist.username}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div>
                        <h4 className="text-white font-medium">
                          {artist.creatorProfile?.artistName || artist.username}
                        </h4>
                        <p className="text-gray-400 text-sm">@{artist.username}</p>
                        {artist.creatorProfile?.genres && artist.creatorProfile.genres.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {artist.creatorProfile.genres.slice(0, 2).map((genre, index) => (
                              <span key={index} className="bg-purple-600 text-white px-1 py-0.5 rounded text-xs">
                                {genre}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">No artists found.</p>
            )}
          </div>
        )}

        {activeTab === 'media' && (
          <div>
            <h3 className="text-xl font-semibold text-white mb-4">All Releases</h3>
            {recentReleases.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentReleases.map((release) => (
                  <div key={release._id} className="bg-gray-800 rounded-lg p-4">
                    <img
                      src={release.coverArt}
                      alt={release.title}
                      className="w-full h-48 rounded-lg object-cover mb-4"
                    />
                    <h4 className="text-white font-medium">{release.title}</h4>
                    <p className="text-gray-400 text-sm mb-2">{release.artist}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-purple-400 font-medium">
                        {formatCurrency(release.stats.totalBidAmount)}
                      </span>
                      <span className="text-gray-400 text-sm">
                        {release.stats.bidCount} bids
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">No releases found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LabelProfile;
