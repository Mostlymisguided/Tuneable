import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Users, Music, TrendingUp, Calendar, MapPin, Globe, Instagram, Facebook, Youtube, Twitter, ArrowLeft } from 'lucide-react';
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
  const navigate = useNavigate();
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

  // Get social media links for display
  const getSocialMediaLinks = () => {
    if (!label?.socialMedia) return [];
    
    const links = [];
    if (label.socialMedia.instagram) {
      links.push({ name: 'Instagram', url: label.socialMedia.instagram, icon: Instagram, color: 'hover:text-pink-400' });
    }
    if (label.socialMedia.facebook) {
      links.push({ name: 'Facebook', url: label.socialMedia.facebook, icon: Facebook, color: 'hover:text-blue-400' });
    }
    if (label.socialMedia.youtube) {
      links.push({ name: 'YouTube', url: label.socialMedia.youtube, icon: Youtube, color: 'hover:text-red-400' });
    }
    if (label.socialMedia.twitter) {
      links.push({ name: 'Twitter', url: label.socialMedia.twitter, icon: Twitter, color: 'hover:text-cyan-400' });
    }
    
    return links;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading label profile...</div>
      </div>
    );
  }

  if (!label) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Label not found</div>
      </div>
    );
  }

  const socialLinks = getSocialMediaLinks();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 relative">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 mb-4 rounded-lg font-medium transition-colors border border-white/20 bg-gray-700/40 text-white hover:bg-purple-500"
          >
            <ArrowLeft className="inline h-4 w-4 mr-2" />
            Back
          </button>
          
          <div className="card flex items-start relative">
            {/* Verification Badge - Top Right */}
            {label.verificationStatus === 'verified' && (
              <div className="absolute top-0 right-0 p-4">
                <span className="px-3 py-2 bg-blue-500 text-white text-xs md:text-sm rounded-full font-semibold">
                  Verified
                </span>
              </div>
            )}

            {/* Logo */}
            <div className="flex-shrink-0 relative">
              {label.logo ? (
                <img
                  src={label.logo}
                  alt={`${label.name} logo`}
                  className="rounded-lg shadow-xl object-cover border-2 border-purple-500/30"
                  style={{ width: '200px', height: '200px' }}
                  onError={(e) => {
                    e.currentTarget.src = '/android-chrome-192x192.png';
                  }}
                />
              ) : (
                <div 
                  className="rounded-lg shadow-xl object-cover border-2 border-purple-500/30 bg-purple-900/50 flex items-center justify-center text-white text-4xl font-bold"
                  style={{ width: '200px', height: '200px' }}
                >
                  {label.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            
            {/* Label Info */}
            <div className="ml-6 flex-1 text-white">
              <div className="">
                <h1 className="text-4xl font-bold mb-4">{label.name}</h1>
                {label.description && (
                  <p className="text-xl text-gray-300 mb-4 max-w-2xl">{label.description}</p>
                )}
                
                {/* Location */}
                {label.location && (label.location.city || label.location.country) && (
                  <div className="mb-4">
                    <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-purple-900/30 border border-purple-500/30 rounded-full text-gray-300 text-sm w-fit">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>
                        {[label.location.city, label.location.country].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Social Media Links */}
                {socialLinks.length > 0 && (
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-2">
                      {socialLinks.map((social) => {
                        const IconComponent = social.icon;
                        return (
                          <a
                            key={social.name}
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center space-x-2 px-4 py-2 bg-black/20 border border-white/20 rounded-lg text-gray-200 transition-all ${social.color}`}
                          >
                            <IconComponent className="w-4 h-4" />
                            <span className="text-sm font-medium">{social.name}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Website */}
                {label.website && (
                  <div className="mb-4">
                    <a
                      href={label.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-2 px-4 py-2 bg-black/20 border border-white/20 rounded-lg text-gray-200 hover:text-purple-400 transition-all"
                    >
                      <Globe className="w-4 h-4" />
                      <span className="text-sm font-medium">Website</span>
                    </a>
                  </div>
                )}

                {/* Genres */}
                {label.genres && label.genres.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {label.genres.map((genre, index) => (
                      <span key={index} className="bg-purple-600/50 text-white px-3 py-1 rounded-full text-xs font-medium border border-purple-500/30">
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        {label.stats && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-center text-white mb-4">Label Statistics</h2>
            <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {label.stats.artistCount !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <Users className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{label.stats.artistCount || 0}</div>
                  <div className="text-sm text-gray-300">Artists</div>
                </div>
              )}
              {label.stats.releaseCount !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <Music className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{label.stats.releaseCount || 0}</div>
                  <div className="text-sm text-gray-300">Releases</div>
                </div>
              )}
              {label.stats.totalBidAmount !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <TrendingUp className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{formatCurrency(label.stats.totalBidAmount || 0)}</div>
                  <div className="text-sm text-gray-300">Total Bids</div>
                </div>
              )}
              {label.stats.totalBidCount !== undefined && (
                <div className="card bg-black/20 rounded-lg p-6 text-center">
                  <Calendar className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{label.stats.totalBidCount || 0}</div>
                  <div className="text-sm text-gray-300">Total Bid Count</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="border-b border-gray-700">
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
        <div>
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Label Information */}
              <div className="card bg-black/20 rounded-lg p-6">
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
                </div>
              </div>

              {/* Recent Releases */}
              {recentReleases.length > 0 && (
                <div>
                  <h3 className="text-2xl font-bold text-white mb-4">Recent Releases</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentReleases.map((release) => (
                      <div key={release._id} className="card flex items-center space-x-4 p-4 bg-black/10 rounded-lg hover:bg-black/20 transition-colors">
                        <img
                          src={release.coverArt}
                          alt={release.title}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium truncate">{release.title}</h4>
                          <p className="text-gray-400 text-sm truncate">{release.artist}</p>
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
                  <h3 className="text-2xl font-bold text-white mb-4">Top Performing Releases</h3>
                  <div className="space-y-2">
                    {topMedia.map((media, index) => (
                      <div key={media._id} className="card flex items-center space-x-4 p-4 bg-black/10 rounded-lg hover:bg-black/20 transition-colors">
                        <div className="flex-shrink-0">
                          <div className="flex items-center justify-center w-12 h-12 bg-purple-600/50 rounded-full">
                            <span className="text-white font-bold text-lg">{index + 1}</span>
                          </div>
                        </div>
                        <img
                          src={media.coverArt}
                          alt={media.title}
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium truncate">{media.title}</h4>
                          <p className="text-gray-400 text-sm truncate">{media.artist}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
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
              <h3 className="text-2xl font-bold text-white mb-4">Artists</h3>
              {artists.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {artists.map((artist) => (
                    <Link
                      key={artist._id}
                      to={`/profile/${artist.username}`}
                      className="card bg-black/20 rounded-lg p-4 hover:bg-black/30 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <img
                          src={artist.profilePic}
                          alt={artist.username}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-medium truncate">
                            {artist.creatorProfile?.artistName || artist.username}
                          </h4>
                          <p className="text-gray-400 text-sm truncate">@{artist.username}</p>
                          {artist.creatorProfile?.genres && artist.creatorProfile.genres.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {artist.creatorProfile.genres.slice(0, 2).map((genre, index) => (
                                <span key={index} className="bg-purple-600/50 text-white px-2 py-0.5 rounded text-xs">
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
              <h3 className="text-2xl font-bold text-white mb-4">All Releases</h3>
              {recentReleases.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentReleases.map((release) => (
                    <div key={release._id} className="card bg-black/20 rounded-lg p-4 hover:bg-black/30 transition-colors">
                      <img
                        src={release.coverArt}
                        alt={release.title}
                        className="w-full h-48 rounded-lg object-cover mb-4"
                      />
                      <h4 className="text-white font-medium truncate">{release.title}</h4>
                      <p className="text-gray-400 text-sm mb-2 truncate">{release.artist}</p>
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
    </div>
  );
};

export default LabelProfile;
