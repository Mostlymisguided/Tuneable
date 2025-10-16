import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  Music, 
  User, 
  Calendar, 
  Clock, 
  Heart, 
  ThumbsUp,
  Trash2,
  Edit,
  Play,
  ExternalLink,
  Globe,
  Tag,
  Mic,
  Disc,
  Headphones,
  Volume2,
  Award,
  X
} from 'lucide-react';
import { songAPI, claimAPI } from '../lib/api';
import TopBidders from '../components/TopBidders';
import { useAuth } from '../contexts/AuthContext';

interface Song {
  _id: string;
  uuid: string;
  title: string;
  artist: string;
  producer?: string;
  featuring?: string[];
  rightsHolder?: string;
  rightsHolderEmail?: string;
  album?: string;
  genre?: string;
  releaseDate?: string;
  duration?: number;
  coverArt?: string;
  explicit?: boolean;
  isrc?: string;
  upc?: string;
  globalMediaAggregate?: number; // Updated to schema grammar
  globalMediaBidTop?: number;
  globalMediaAggregateTop?: number;
  globalMediaAggregateTopRank?: number;
  bpm?: number;
  pitch?: number;
  key?: string;
  elements?: string[];
  tags?: string[];
  category?: string;
  timeSignature?: string;
  bitrate?: number;
  sampleRate?: number;
  lyrics?: string;
  playCount?: number;
  popularity?: number;
  sources?: { [key: string]: string };
  bids?: Bid[];
  comments?: Comment[];
  addedBy?: {
    _id: string;
    username: string;
    profilePic?: string;
    uuid: string;
  };
  uploadedAt?: string;
  updatedAt?: string;
}

interface Bid {
  _id: string;
  userId: {
    _id: string;
    username: string;
    profilePic?: string;
    uuid: string;
  };
  amount: number;
  createdAt: string;
}

interface Comment {
  _id: string;
  content: string;
  userId: {
    _id: string;
    username: string;
    profilePic?: string;
    uuid: string;
  };
  likeCount: number;
  likes: string[];
  createdAt: string;
  updatedAt: string;
}

const TuneProfile: React.FC = () => {
  const { songId } = useParams<{ songId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  
  // Claim tune modals
  const [showCreatorSignupModal, setShowCreatorSignupModal] = useState(false);
  const [showClaimVerificationModal, setShowClaimVerificationModal] = useState(false);
  const [claimProofText, setClaimProofText] = useState('');
  const [claimProofFiles, setClaimProofFiles] = useState<File[]>([]);

  useEffect(() => {
    if (songId) {
      fetchSongProfile();
    }
  }, [songId]);

  const fetchSongProfile = async () => {
    try {
      setLoading(true);
      const response = await songAPI.getProfile(songId!);
      setSong(response.song);
      setComments(response.song.comments || []);
    } catch (err: any) {
      console.error('Error fetching song profile:', err);
      setError(err.response?.data?.error || 'Failed to load song profile');
      toast.error('Failed to load song profile');
    } finally {
      setLoading(false);
    }
  };

  // Calculate GlobalMediaBidAvg (average individual bid amount)
  const calculateGlobalMediaBidAvg = (songData: Song) => {
    const bids = songData.bids || [];
    if (bids.length === 0) return 0;
    const total = bids.reduce((sum, bid) => sum + bid.amount, 0);
    return total / bids.length;
  };

  // Calculate total unique fans (users who bid on this song)
  const calculateTotalFans = (songData: Song) => {
    const bids = songData.bids || [];
    const uniqueUsers = new Set(bids.map(bid => bid.userId._id));
    return uniqueUsers.size;
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !songId || !user) return;

    try {
      setSubmittingComment(true);
      const response = await songAPI.createComment(songId, newComment.trim());
      setComments(prev => [response.comment, ...prev]);
      setNewComment('');
      toast.success('Comment added successfully!');
    } catch (err: any) {
      console.error('Error creating comment:', err);
      toast.error(err.response?.data?.error || 'Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!user) {
      toast.error('Please log in to like comments');
      return;
    }

    try {
      const response = await songAPI.likeComment(commentId);
      setComments(prev => prev.map(comment => 
        comment._id === commentId 
          ? { ...comment, likeCount: response.hasLiked ? comment.likeCount + 1 : comment.likeCount - 1 }
          : comment
      ));
    } catch (err: any) {
      console.error('Error liking comment:', err);
      toast.error('Failed to like comment');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;

    try {
      await songAPI.deleteComment(commentId);
      setComments(prev => prev.filter(comment => comment._id !== commentId));
      toast.success('Comment deleted successfully');
    } catch (err: any) {
      console.error('Error deleting comment:', err);
      toast.error('Failed to delete comment');
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  const getFieldValue = (value: any, fallback = 'Not specified') => {
    if (value === null || value === undefined || value === '') return fallback;
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : fallback;
    return value.toString();
  };

  // Handle claim tune button click
  const handleClaimTune = () => {
    if (!user) {
      toast.info('Please log in to claim this tune');
      navigate('/login');
      return;
    }

    if (!user.role?.includes('creator')) {
      // User is not a creator - show creator signup modal
      setShowCreatorSignupModal(true);
    } else {
      // User is already a creator - show claim verification modal
      setShowClaimVerificationModal(true);
    }
  };

  // Handle creator signup
  const handleCreatorSignup = () => {
    setShowCreatorSignupModal(false);
    // TODO: Navigate to dedicated creator signup page or update user role
    navigate('/profile'); // For now, send them to profile where CreatorUserToggle is
    toast.info('Use the Creator/User toggle on your profile to enable creator mode');
  };

  // Handle claim submission
  const handleSubmitClaim = async () => {
    if (!claimProofText.trim()) {
      toast.error('Please provide proof of ownership');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('mediaId', song?._id || '');
      formData.append('proofText', claimProofText);
      claimProofFiles.forEach((file) => {
        formData.append('proofFiles', file);
      });

      await claimAPI.submitClaim(formData);
      
      toast.success('Claim submitted for review! We\'ll notify you when it\'s processed.');
      setShowClaimVerificationModal(false);
      setClaimProofText('');
      setClaimProofFiles([]);
    } catch (err: any) {
      console.error('Error submitting claim:', err);
      toast.error(err.response?.data?.error || 'Failed to submit claim');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading song profile...</div>
      </div>
    );
  }

  if (error || !song) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Error loading song profile</div>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30"
            style={{ backgroundColor: 'rgba(55, 65, 81, 0.2)' }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const songFields = [
    { label: 'Title', value: song.title, icon: Music },
    { label: 'Artist', value: song.artist, icon: Mic },
    { label: 'Producer', value: song.producer, icon: Volume2 },
    { label: 'Featuring', value: song.featuring, icon: User },
    { label: 'Album', value: song.album, icon: Disc },
    { label: 'Genre', value: song.genre, icon: Tag },
    { label: 'Release Date', value: song.releaseDate, icon: Calendar },
    { label: 'Duration', value: song.duration ? formatDuration(song.duration) : null, icon: Clock },
    { label: 'Explicit', value: song.explicit ? 'Yes' : 'No', icon: Globe },
    { label: 'ISRC', value: song.isrc, icon: Music },
    { label: 'UPC', value: song.upc, icon: Disc },
    { label: 'BPM', value: song.bpm, icon: Headphones },
    { label: 'Key', value: song.key, icon: Music },
    { label: 'Time Signature', value: song.timeSignature, icon: Music },
    { label: 'Bitrate', value: song.bitrate ? `${song.bitrate} kbps` : null, icon: Headphones },
    { label: 'Sample Rate', value: song.sampleRate ? `${song.sampleRate} Hz` : null, icon: Headphones },
    { label: 'Elements', value: song.elements, icon: Tag },
    { label: 'Tags', value: song.tags, icon: Tag },
    { label: 'Category', value: song.category, icon: Tag },
    { label: 'Play Count', value: song.playCount, icon: Play },
    { label: 'Popularity', value: song.popularity, icon: Heart },
  ];

  const visibleFields = showAllFields ? songFields : songFields.slice(0, 8);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 mb-4 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30"
            style={{ backgroundColor: 'rgba(55, 65, 81, 0.2)' }}
          >
            Back
          </button>
          
          <div className="card flex items-start space-x-6 relative">
            {/* Claim Tune Button - Top Right */}
            <button
              onClick={handleClaimTune}
              className="absolute top-4 right-4 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2"
            >
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">Claim Tune</span>
              <span className="sm:hidden">Claim</span>
            </button>

            {/* Album Art */}
            <div className="flex-shrink-0">
              <img
                src={song.coverArt || '/android-chrome-192x192.png'}
                alt={`${song.title} cover`}
                className="w-48 h-48 rounded-lg shadow-xl object-cover"
              />
            </div>
            
            {/* Song Info */}
            <div className="flex-1 text-white">
              <h1 className="px-4 text-4xl font-bold mb-2">{song.title}</h1>
              <p className="px-4 text-3xl text-purple-300 mb-4">{song.artist}</p>
              
              {/* Bid Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {/* Bid Total */}
                <div className="card bg-black/20 rounded-lg p-4 border-l-4 border-green-500/50">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Bid Total</div>
                  <div className="text-2xl font-bold text-green-400">
                    £{song.globalMediaAggregate?.toFixed(2) || '0.00'}
                  </div>
                </div>
                
                {/* Top Bid */}
                <div className="card bg-black/20 rounded-lg p-4 border-l-4 border-yellow-500/50">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Top Bid</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    £{song.globalMediaBidTop?.toFixed(2) || '0.00'}
                  </div>
                </div>
                
                {/* Top Fan */}
                <div className="card bg-black/20 rounded-lg p-4 border-l-4 border-purple-500/50">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Top Fan</div>
                  <div className="text-2xl font-bold text-purple-400">
                    £{song.globalMediaAggregateTop?.toFixed(2) || '0.00'}
                  </div>
                </div>
                
                {/* Average Bid */}
                <div className="card bg-black/20 rounded-lg p-4 border-l-4 border-blue-500/50">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Avg Bid</div>
                  <div className="text-2xl font-bold text-blue-400">
                    £{calculateGlobalMediaBidAvg(song).toFixed(2)}
                  </div>
                </div>
                
                {/* Total Bids Count */}
                <div className="card bg-black/20 rounded-lg p-4 border-l-4 border-cyan-500/50">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Bids</div>
                  <div className="text-2xl font-bold text-cyan-400">
                    {song.bids?.length || 0}
                  </div>
                </div>
                
                {/* Global Rank */}
                <div className="card bg-black/20 rounded-lg p-4 border-l-4 border-pink-500/50">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Global Rank</div>
                  <div className="text-2xl font-bold text-pink-400">
                    #{song.globalMediaAggregateTopRank || '-'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {calculateTotalFans(song)} {calculateTotalFans(song) === 1 ? 'fan' : 'fans'}
                  </div>
                </div>
              </div>

              {/* Platform Links */}
              {song.sources && Object.keys(song.sources).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Listen on:</h3>
                  <div className="flex space-x-3">
                    {Object.entries(song.sources).map(([platform, url]) => (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top Bidders */}
        {song.bids && song.bids.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">Top Bidders</h2>
            <div className="card bg-black/20 rounded-lg p-6">
              <TopBidders bids={song.bids} maxDisplay={10} />
            </div>
          </div>
        )}

        {/* Song Details */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">Song Details</h2>
            <button
              onClick={() => setShowAllFields(!showAllFields)}
              className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors"
            >
              <Edit className="w-4 h-4 mr-2" />
              {showAllFields ? 'Show Less' : 'Show All Fields'}
            </button>
          </div>
          
          <div className="card bg-black/20 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleFields.map((field, index) => {
                const IconComponent = field.icon;
                return (
                  <div key={index} className="flex items-start space-x-3">
                    <IconComponent className="w-5 h-5 text-purple-400 mt-1 flex-shrink-0" />
                    <div>
                      <div className="text-sm text-gray-300">{field.label}</div>
                      <div className="text-white font-medium">
                        {getFieldValue(field.value)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Lyrics Section */}
            {song.lyrics && (
              <div className="mt-6 pt-6 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-3">Lyrics</h3>
                <div className="text-gray-300 whitespace-pre-wrap bg-black/10 rounded-lg p-4">
                  {song.lyrics}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Links Section */}
        {song.sources && Object.keys(song.sources).length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">Links</h2>
            <div className="bg-black/20 rounded-lg p-6">
              <div className="flex flex-wrap gap-4">
                {Object.entries(song.sources).map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg transition-colors group"
                  >
                    <svg className="w-6 h-6 mr-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    <span className="text-white font-semibold group-hover:text-gray-200 transition-colors">
                      Watch on YouTube
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Comments Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Comments</h2>
          
          {/* Add Comment Form */}
          {user && (
            <div className="card bg-black/20 rounded-lg p-6 mb-6">
              <form onSubmit={handleSubmitComment}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Share your thoughts about this song..."
                  className="w-full h-24 bg-black/20 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 resize-none focus:outline-none focus:border-purple-500"
                  style={{ color: 'white' }}
                  maxLength={1000}
                />
                <div className="flex justify-between items-center mt-3">
                  <div className="text-sm text-gray-400">
                    {newComment.length}/1000 characters
                  </div>
                  <button
                    type="submit"
                    disabled={!newComment.trim() || submittingComment}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                  >
                    {submittingComment ? 'Posting...' : 'Post Comment'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No comments yet. Be the first to share your thoughts!
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment._id} className="bg-black/20 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <img
                      src={comment.userId.profilePic || '/android-chrome-192x192.png'}
                      alt={comment.userId.username}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="font-semibold text-white">
                          {comment.userId.username}
                        </span>
                        <span className="text-sm text-gray-400">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-gray-300 mb-3">{comment.content}</p>
                      
                      <div className="flex items-center space-x-4">
                        <button
                          onClick={() => handleLikeComment(comment._id)}
                          className="flex items-center space-x-1 text-gray-400 hover:text-purple-400 transition-colors"
                        >
                          <ThumbsUp className="w-4 h-4" />
                          <span>{comment.likeCount}</span>
                        </button>
                        
                        {user && comment.userId._id === user.id && (
                          <button
                            onClick={() => handleDeleteComment(comment._id)}
                            className="flex items-center space-x-1 text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Creator Signup Modal */}
      {showCreatorSignupModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">Become a Creator</h2>
              <button
                onClick={() => setShowCreatorSignupModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <p className="text-gray-300 mb-6">
              Join Tuneable as a creator to claim your music, earn directly from fan bids, 
              and connect with your audience in a revolutionary new way.
            </p>
            
            <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4 mb-6">
              <h3 className="text-white font-semibold mb-2">Creator Benefits:</h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>✓ Claim ownership of your tracks</li>
                <li>✓ Earn directly from fan bids</li>
                <li>✓ Access to creator analytics</li>
                <li>✓ Verify your identity with badges</li>
                <li>✓ Connect with your biggest fans</li>
              </ul>
            </div>
            
            <div className="flex space-x-3">
              <button onClick={handleCreatorSignup} className="btn-primary flex-1">
                Enable Creator Mode
              </button>
              <button onClick={() => setShowCreatorSignupModal(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Claim Verification Modal */}
      {showClaimVerificationModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card max-w-lg w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                Claim "{song?.title}"
              </h2>
              <button
                onClick={() => setShowClaimVerificationModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <p className="text-gray-300 mb-4">
              To verify you're a creator of this tune, please provide proof of ownership:
            </p>
            
            <div className="mb-4">
              <label className="block text-white font-medium mb-2">
                Proof of Ownership
              </label>
              <textarea
                value={claimProofText}
                onChange={(e) => setClaimProofText(e.target.value)}
                placeholder="Describe your role (artist, producer, songwriter, etc.) and provide links to social media, streaming profiles, distribution platforms, or other verification..."
                className="input min-h-32"
                maxLength={2000}
              />
              <div className="text-xs text-gray-400 mt-1">
                {claimProofText.length}/2000 characters
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-white font-medium mb-2">
                Supporting Documents (Optional)
              </label>
              <input
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => setClaimProofFiles(Array.from(e.target.files || []))}
                className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
              />
              <p className="text-xs text-gray-400 mt-2">
                Upload screenshots, contracts, distribution receipts, or other proof
              </p>
              {claimProofFiles.length > 0 && (
                <div className="mt-2 text-sm text-gray-300">
                  {claimProofFiles.length} file(s) selected
                </div>
              )}
            </div>
            
            <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-lg p-3 mb-4">
              <p className="text-yellow-200 text-sm">
                <strong>Note:</strong> Claims are reviewed by our team. False claims may result in account suspension.
              </p>
            </div>
            
            <div className="flex space-x-3">
              <button 
                onClick={handleSubmitClaim}
                disabled={!claimProofText.trim()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Claim
              </button>
              <button 
                onClick={() => {
                  setShowClaimVerificationModal(false);
                  setClaimProofText('');
                  setClaimProofFiles([]);
                }} 
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TuneProfile;
