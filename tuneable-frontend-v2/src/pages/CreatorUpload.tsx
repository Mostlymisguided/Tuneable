import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Upload, Music, Image, FileText, Calendar, Clock, Tag, Loader2, CheckCircle, Zap, AlertTriangle, Building } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMetadataExtraction } from '../hooks/useMetadataExtraction';
import { labelAPI, emailAPI } from '../lib/api';
import axios from 'axios';
import MultiArtistInput from '../components/MultiArtistInput';
import type { ArtistEntry } from '../components/MultiArtistInput';

// Helper functions to convert between MM:SS format and seconds
const secondsToMMSS = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const mmssToSeconds = (mmss: string): number => {
  if (!mmss || !mmss.trim()) return 0;
  const parts = mmss.trim().split(':');
  if (parts.length !== 2) return 0;
  const mins = parseInt(parts[0], 10) || 0;
  const secs = parseInt(parts[1], 10) || 0;
  return mins * 60 + secs;
};

const createArtistEntry = (name: string = '', overrides: Partial<ArtistEntry> = {}): ArtistEntry => ({
  id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
  name,
  relationToNext: null,
  ...overrides
});

const CreatorUpload: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { extractMetadata, isExtracting, extractedMetadata, error: metadataError, warnings } = useMetadataExtraction();
  
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [labelSuggestions, setLabelSuggestions] = useState<any[]>([]);
  const [isSearchingLabels, setIsSearchingLabels] = useState(false);
  const [showLabelSuggestions, setShowLabelSuggestions] = useState(false);
  const [labelSearchDebounce, setLabelSearchDebounce] = useState<NodeJS.Timeout | null>(null);
  const [selectedLabelIndex, setSelectedLabelIndex] = useState(-1);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const labelSuggestionsRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    title: '',
    artistName: '', // For admins or to override creatorProfile name
    album: '',
    genre: '',
    releaseDate: '',
    duration: '',
    explicit: false,
    tags: '',
    description: '',
    coverArt: '',
    // Enhanced metadata fields
    bpm: '',
    key: '',
    isrc: '',
    upc: '',
    lyrics: '',
    composer: '',
    producer: '',
    label: '',
    language: ''
  });
  const [useMultipleArtists, setUseMultipleArtists] = useState(false);
  const [artistEntries, setArtistEntries] = useState<ArtistEntry[]>(() => [
    createArtistEntry(
      ((user as any)?.creatorProfile?.artistName || user?.username || '') as string,
      {
        userId: user?._id || null,
        userUuid: (user as any)?.uuid || null
      }
    )
  ]);
  const [coverArtFile, setCoverArtFile] = useState<File | null>(null);
  const coverArtFileInputRef = useRef<HTMLInputElement>(null);

  // Check if user is verified creator or admin
  const isAdmin = user && (user as any).role?.includes('admin');
  const isCreator = user && (user as any).role?.includes('creator');

  if (!isCreator && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full card bg-black/40 border border-red-500/30 rounded-lg p-8 text-center">
          <Music className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-300 mb-4">
            Only verified creators can upload media
          </p>
          <button
            onClick={() => navigate('/creator-register')}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            Apply to Become a Creator
          </button>
        </div>
      </div>
    );
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Check email verification before allowing file selection
    if (!user?.emailVerified) {
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      const shouldSendVerification = window.confirm(
        'Please verify your email address before uploading media. Would you like us to send you a verification email?'
      );
      
      if (shouldSendVerification) {
        try {
          await emailAPI.resendVerification();
          toast.success('Verification email sent! Please check your inbox and click the verification link.');
        } catch (error: any) {
          console.error('Error sending verification email:', error);
          toast.error(error.response?.data?.error || 'Failed to send verification email');
        }
      }
      return;
    }

    // Validate file type
    if (!selectedFile.name.toLowerCase().endsWith('.mp3')) {
      toast.error('Only MP3 files are supported');
      return;
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      toast.error('File size must be less than 50MB');
      return;
    }

    setFile(selectedFile);
    
    // Auto-fill title from filename if empty
    if (!formData.title) {
      const filename = selectedFile.name.replace('.mp3', '').replace(/_/g, ' ');
      setFormData(prev => ({ ...prev, title: filename }));
    }

    // Extract metadata from the file
    await extractMetadata(selectedFile);
  };

  // Auto-populate form when metadata is extracted
  useEffect(() => {
    if (extractedMetadata) {
      setFormData(prev => ({
        ...prev,
        title: extractedMetadata.title || prev.title,
        artistName: extractedMetadata.artist || prev.artistName,
        album: extractedMetadata.album || prev.album,
        genre: extractedMetadata.genre?.[0] || prev.genre,
        duration: extractedMetadata.duration ? secondsToMMSS(extractedMetadata.duration) : prev.duration,
        explicit: extractedMetadata.explicit || prev.explicit,
        bpm: extractedMetadata.bpm?.toString() || prev.bpm,
        key: extractedMetadata.key || prev.key,
        isrc: extractedMetadata.isrc || prev.isrc,
        upc: extractedMetadata.upc || prev.upc,
        lyrics: extractedMetadata.lyrics || prev.lyrics,
        composer: extractedMetadata.composer || prev.composer,
        producer: extractedMetadata.producer || prev.producer,
        label: extractedMetadata.label || prev.label,
        language: extractedMetadata.language || prev.language
      }));
    }
  }, [extractedMetadata]);

  // Debounced label search function
  const searchLabels = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setLabelSuggestions([]);
      setShowLabelSuggestions(false);
      return;
    }

    setIsSearchingLabels(true);
    try {
      const response = await labelAPI.getLabels({
        search: query.trim(),
        limit: 10,
        sortBy: 'name',
        sortOrder: 'asc'
      });
      setLabelSuggestions(response.labels || []);
      setShowLabelSuggestions(true);
    } catch (error) {
      console.error('Error searching labels:', error);
      setLabelSuggestions([]);
    } finally {
      setIsSearchingLabels(false);
    }
  }, []);

  // Handle label input change with debouncing
  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, label: value }));
    setSelectedLabelIndex(-1); // Reset selection when typing

    // Clear existing debounce
    if (labelSearchDebounce) {
      clearTimeout(labelSearchDebounce);
    }

    // Set new debounce
    const timeout = setTimeout(() => {
      searchLabels(value);
    }, 300);
    setLabelSearchDebounce(timeout);
  };

  // Handle keyboard navigation for label suggestions
  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showLabelSuggestions || labelSuggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedLabelIndex((prev) => 
          prev < labelSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedLabelIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedLabelIndex >= 0 && selectedLabelIndex < labelSuggestions.length) {
          handleLabelSelect(labelSuggestions[selectedLabelIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowLabelSuggestions(false);
        setSelectedLabelIndex(-1);
        labelInputRef.current?.blur();
        break;
    }
  };

  // Handle label selection from suggestions
  const handleLabelSelect = (label: any) => {
    setFormData(prev => ({ ...prev, label: label.name }));
    setLabelSuggestions([]);
    setShowLabelSuggestions(false);
    setSelectedLabelIndex(-1);
    labelInputRef.current?.blur();
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        labelInputRef.current &&
        labelSuggestionsRef.current &&
        !labelInputRef.current.contains(event.target as Node) &&
        !labelSuggestionsRef.current.contains(event.target as Node)
      ) {
        setShowLabelSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (labelSearchDebounce) {
        clearTimeout(labelSearchDebounce);
      }
    };
  }, [labelSearchDebounce]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleMultipleArtistsToggle = (checked: boolean) => {
    setUseMultipleArtists(checked);
    if (checked) {
      setArtistEntries(prev => {
        // If we have 0 or 1 entries, ensure we have at least 2 for multiple artists mode
        if (prev.length === 0) {
          return [
            createArtistEntry(
              formData.artistName ||
                (user as any)?.creatorProfile?.artistName ||
                user?.username ||
                '',
              {
                userId: user?._id || null,
                userUuid: (user as any)?.uuid || null
              }
            ),
            createArtistEntry('') // Add second empty entry
          ];
        } else if (prev.length === 1) {
          // Add a second empty entry if we only have one
          return [...prev, createArtistEntry('')];
        }
        return prev; // Already has 2+ entries
      });
    } else {
      if (artistEntries.length > 0) {
        setFormData(prev => ({ ...prev, artistName: artistEntries[0].name || '' }));
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!rightsConfirmed) {
      toast.error('Please confirm your rights to the uploaded content');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const uploadData = new FormData();
      uploadData.append('audioFile', file);
      uploadData.append('title', formData.title.trim());

      const cleanedArtists = artistEntries
        .map((artist, idx) => ({
          ...artist,
          name: artist.name?.trim(),
          relationToNext: idx === artistEntries.length - 1 ? null : (artist.relationToNext || '&')
        }))
        .filter(artist => artist.name && artist.name.length > 0);

      if (useMultipleArtists && cleanedArtists.length > 0) {
        uploadData.append('artists', JSON.stringify(cleanedArtists));
        uploadData.append('artistName', cleanedArtists.map(a => a.name).join(' & '));
      } else if (formData.artistName) {
        uploadData.append('artistName', formData.artistName.trim());
      }
      if (formData.album) uploadData.append('album', formData.album.trim());
      if (formData.genre) uploadData.append('genre', formData.genre);
      if (formData.releaseDate) uploadData.append('releaseDate', formData.releaseDate);
      if (formData.duration) {
        const durationSeconds = mmssToSeconds(formData.duration);
        if (durationSeconds > 0) {
          uploadData.append('duration', durationSeconds.toString());
        }
      }
      uploadData.append('explicit', formData.explicit.toString());
      if (formData.tags) uploadData.append('tags', formData.tags);
      if (formData.description) uploadData.append('description', formData.description.trim());
      // Add cover art file if selected
      if (coverArtFile) {
        uploadData.append('coverArtFile', coverArtFile);
      } else if (formData.coverArt) {
        uploadData.append('coverArt', formData.coverArt.trim());
      }

      // Add extracted artwork if available and no custom cover art URL or file provided
      if (extractedMetadata?.artwork && extractedMetadata.artwork.length > 0 && !formData.coverArt && !coverArtFile) {
        try {
          const artwork = extractedMetadata.artwork[0]; // Get the first (primary) artwork
          const blob = new Blob([artwork.data], { type: artwork.format });
          const artworkFile = new File([blob], 'cover-art.jpg', { type: artwork.format });
          uploadData.append('coverArtFile', artworkFile);
          console.log('📷 Added extracted artwork to upload:', artworkFile.name, artworkFile.size, 'bytes');
        } catch (error) {
          console.error('❌ Error processing extracted artwork:', error);
        }
      }
      
      // Enhanced metadata fields
      if (formData.bpm) uploadData.append('bpm', formData.bpm);
      if (formData.key) uploadData.append('key', formData.key);
      if (formData.isrc) uploadData.append('isrc', formData.isrc);
      if (formData.upc) uploadData.append('upc', formData.upc);
      if (formData.lyrics) uploadData.append('lyrics', formData.lyrics);
      if (formData.composer) uploadData.append('composer', formData.composer);
      if (formData.producer) uploadData.append('producer', formData.producer);
      if (formData.label) uploadData.append('label', formData.label);
      if (formData.language) uploadData.append('language', formData.language);

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
      const token = localStorage.getItem('token');

      const response = await axios.post(`${API_URL}/media/upload`, uploadData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          );
          setUploadProgress(percentCompleted);
        }
      });

      toast.success('Upload successful!');
      
      // Redirect to the new tune's profile
      if (response.data.media?._id) {
        navigate(`/tune/${response.data.media._id}`);
      } else {
        navigate('/dashboard');
      }
      
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.error || 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const availableGenres = [
    'Pop', 'Rock', 'Hip Hop', 'R&B', 'Electronic', 'Country', 'Jazz',
    'Classical', 'Reggae', 'Metal', 'Indie', 'Folk', 'Blues', 'Soul',
    'Funk', 'Punk', 'Alternative', 'Dance', 'Latin', 'World',
    'Techno', 'House', 'Minimal', 'D&B', 'Jungle', 'Trance'
  ];

  useEffect(() => {
    if (useMultipleArtists) {
      const joined = artistEntries.map(entry => entry.name?.trim()).filter(Boolean).join(' & ');
      setFormData(prev => (prev.artistName === joined ? prev : { ...prev, artistName: joined }));
    }
  }, [artistEntries, useMultipleArtists]);

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Upload Your Music</h1>
          <p className="text-gray-300">
            Share your music with the Tuneable community
          </p>
        </div>

        {/* Upload Form */}
        <div className="card bg-black/40 backdrop-blur-sm border border-purple-500/20 rounded-lg p-8">
          {/* File Upload Area */}
          <div className="mb-8">
            <label className="block text-white font-semibold mb-4 flex items-center">
              <Upload className="h-5 w-5 mr-2 text-purple-400" />
              Audio File (MP3 only) *
            </label>
            
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all ${
                file
                  ? 'border-green-500/50 bg-green-900/10'
                  : 'border-purple-500/30 bg-purple-900/10 hover:border-purple-500/50 hover:bg-purple-900/20'
              }`}
            >
              {file ? (
                <div>
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                  <p className="text-white font-semibold mb-1">{file.name}</p>
                  <p className="text-gray-400 text-sm">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="mt-3 text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-white font-medium mb-1">
                    Click to select MP3 file
                  </p>
                  <p className="text-gray-400 text-sm">
                    or drag and drop (Max 50MB)
                  </p>
                </div>
              )}
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,audio/mpeg"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Metadata Extraction Status */}
          {file && (
            <div className="mb-6">
              {isExtracting && (
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                    <span className="text-blue-300 font-medium">Extracting metadata from audio file...</span>
                  </div>
                </div>
              )}

              {extractedMetadata && (
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span className="text-green-300 font-medium">Metadata extracted successfully!</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Title:</span>
                      <span className="text-white ml-2">{extractedMetadata.title || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Artist:</span>
                      <span className="text-white ml-2">{extractedMetadata.artist || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Duration:</span>
                      <span className="text-white ml-2">{extractedMetadata.duration ? `${Math.floor(extractedMetadata.duration / 60)}:${(extractedMetadata.duration % 60).toString().padStart(2, '0')}` : 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">BPM:</span>
                      <span className="text-white ml-2">{extractedMetadata.bpm || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Artwork:</span>
                      <span className="text-white ml-2">
                        {extractedMetadata.artwork && extractedMetadata.artwork.length > 0 
                          ? `${extractedMetadata.artwork.length} image${extractedMetadata.artwork.length > 1 ? 's' : ''} found` 
                          : 'None'
                        }
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Bitrate:</span>
                      <span className="text-white ml-2">
                        {extractedMetadata.bitrate ? `${Math.round(extractedMetadata.bitrate / 1000)} kbps` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {metadataError && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                    <span className="text-red-300 font-medium">Metadata extraction failed: {metadataError}</span>
                  </div>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-400" />
                    <span className="text-yellow-300 font-medium">Metadata warnings:</span>
                  </div>
                  <ul className="text-yellow-200 text-sm space-y-1">
                    {warnings.map((warning, index) => (
                      <li key={index}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Metadata Form */}
          <div className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-white font-medium mb-2 flex items-center">
                <Music className="h-4 w-4 mr-2 text-purple-400" />
                Track Title *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="Enter track title"
                required
              />
            </div>

            {/* Artist Name */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-white font-medium">
                  Primary Artists
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    className="accent-purple-600"
                    checked={useMultipleArtists}
                    onChange={(e) => handleMultipleArtistsToggle(e.target.checked)}
                  />
                  Multiple artists
                </label>
              </div>
              
              {useMultipleArtists ? (
                <MultiArtistInput
                  value={artistEntries}
                  onChange={setArtistEntries}
                  description="Search and link each artist. Choose how they connect (e.g. '&', 'ft.', 'with')."
                />
              ) : (
                <>
                  <input
                    type="text"
                    name="artistName"
                    value={formData.artistName}
                    onChange={handleChange}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                    placeholder={
                      (user as any).creatorProfile?.artistName || 
                      user?.username || 
                      'Artist name (defaults to your username)'
                    }
                  />
                  <p className="text-xs text-gray-400">
                    Leave blank to use {(user as any).creatorProfile?.artistName ? 'your artist name' : 'your username'}
                  </p>
                  <button
                    type="button"
                    className="text-xs text-purple-300 hover:text-white transition-colors"
                    onClick={() => handleMultipleArtistsToggle(true)}
                  >
                    Need multiple artists? Enable advanced mode
                  </button>
                </>
              )}
            </div>

            {/* Album */}
            <div>
              <label className="block text-white font-medium mb-2">
                Album
              </label>
              <input
                type="text"
                name="album"
                value={formData.album}
                onChange={handleChange}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="Album name (optional)"
              />
            </div>

            {/* Genre */}
            <div>
              <label className="block text-white font-medium mb-2">
                Genre
              </label>
              <select
                name="genre"
                value={formData.genre}
                onChange={handleChange}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">Select a genre (optional)</option>
                {availableGenres.map(genre => (
                  <option key={genre} value={genre}>{genre}</option>
                ))}
              </select>
            </div>

            {/* Release Date & Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white font-medium mb-2 flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-purple-400" />
                  Release Date
                </label>
                <input
                  type="date"
                  name="releaseDate"
                  value={formData.releaseDate}
                  onChange={handleChange}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-white font-medium mb-2 flex items-center">
                  <Clock className="h-4 w-4 mr-2 text-purple-400" />
                  Duration (MM:SS)
                </label>
                <input
                  type="text"
                  name="duration"
                  value={formData.duration}
                  onChange={handleChange}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="3:00"
                  pattern="[0-9]+:[0-5][0-9]"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Format: minutes:seconds (e.g., 3:45 for 3 minutes 45 seconds)
                </p>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-white font-medium mb-2 flex items-center">
                <Tag className="h-4 w-4 mr-2 text-purple-400" />
                Tags
              </label>
              <input
                type="text"
                name="tags"
                value={formData.tags}
                onChange={handleChange}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="pop, upbeat, summer (comma-separated)"
              />
            </div>

            {/* Cover Art URL */}
            <div>
              <label className="block text-white font-medium mb-2 flex items-center">
                <Image className="h-4 w-4 mr-2 text-purple-400" />
                Cover Art URL
                {extractedMetadata?.artwork && extractedMetadata.artwork.length > 0 && (
                  <span className="ml-2 px-2 py-1 bg-green-900/30 text-green-300 text-xs rounded-full border border-green-500/30">
                    🖼️ Artwork found in file
                  </span>
                )}
                {coverArtFile && (
                  <span className="ml-2 px-2 py-1 bg-purple-900/30 text-purple-300 text-xs rounded-full border border-purple-500/30">
                    📁 File selected: {coverArtFile.name}
                  </span>
                )}
              </label>
              <div className="flex space-x-2">
                <input
                  type="url"
                  name="coverArt"
                  value={formData.coverArt}
                  onChange={handleChange}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder={
                    extractedMetadata?.artwork && extractedMetadata.artwork.length > 0
                      ? "Artwork found in file - enter URL to override or leave blank to use embedded artwork"
                      : "https://example.com/cover.jpg"
                  }
                />
                <button
                  type="button"
                  onClick={() => coverArtFileInputRef.current?.click()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors flex items-center space-x-2"
                >
                  <Upload className="h-4 w-4" />
                  <span>Upload</span>
                </button>
                <input
                  ref={coverArtFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // Validate file type
                      if (!file.type.startsWith('image/')) {
                        toast.error('Please select an image file');
                        return;
                      }
                      // Validate file size (5MB max)
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error('Cover art file size must be less than 5MB');
                        return;
                      }
                      setCoverArtFile(file);
                      // Clear URL field when file is selected (file takes priority)
                      setFormData(prev => ({ ...prev, coverArt: '' }));
                    }
                  }}
                  className="hidden"
                />
              </div>
              {coverArtFile && (
                <div className="mt-2 text-sm text-purple-300">
                  Selected file: {coverArtFile.name} ({(coverArtFile.size / 1024 / 1024).toFixed(2)} MB)
                  <button
                    type="button"
                    onClick={() => {
                      setCoverArtFile(null);
                      if (coverArtFileInputRef.current) {
                        coverArtFileInputRef.current.value = '';
                      }
                    }}
                    className="ml-2 text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              )}
              {extractedMetadata?.artwork && extractedMetadata.artwork.length > 0 && (
                <div className="mt-2 p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <Image className="h-4 w-4 text-green-400" />
                    <span className="text-green-300 font-medium text-sm">Embedded Artwork Found</span>
                  </div>
                  <p className="text-green-200 text-sm">
                    This file contains {extractedMetadata.artwork.length} embedded image{extractedMetadata.artwork.length > 1 ? 's' : ''}. 
                    The artwork will be automatically extracted and used as the cover art.
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    You can upload a custom file or provide a custom URL above to override the embedded artwork.
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-white font-medium mb-2 flex items-center">
                <FileText className="h-4 w-4 mr-2 text-purple-400" />
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="Tell fans about this track..."
              />
            </div>

            {/* Explicit Content */}
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="explicit"
                name="explicit"
                checked={formData.explicit}
                onChange={handleChange}
                className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="explicit" className="text-white font-medium">
                Explicit Content (Parental Advisory)
              </label>
            </div>

            {/* Enhanced Metadata Section */}
            <div className="border-t border-gray-600 pt-6">
              <div className="flex items-center space-x-2 mb-4">
                <Zap className="h-5 w-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">Enhanced Metadata</h3>
                <span className="text-sm text-gray-400">(Auto-populated from file)</span>
              </div>

              {/* Technical Metadata */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-white font-medium mb-2">
                    BPM
                  </label>
                  <input
                    type="number"
                    name="bpm"
                    value={formData.bpm}
                    onChange={handleChange}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                    placeholder="120"
                  />
                </div>
                
                <div>
                  <label className="block text-white font-medium mb-2">
                    Key
                  </label>
                  <input
                    type="text"
                    name="key"
                    value={formData.key}
                    onChange={handleChange}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                    placeholder="C Major"
                  />
                </div>
              </div>


              {/* Creator Information */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-white font-medium mb-2">
                    Composer
                  </label>
                  <input
                    type="text"
                    name="composer"
                    value={formData.composer}
                    onChange={handleChange}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                    placeholder="Composer name"
                  />
                </div>
                
                <div>
                  <label className="block text-white font-medium mb-2">
                    Producer
                  </label>
                  <input
                    type="text"
                    name="producer"
                    value={formData.producer}
                    onChange={handleChange}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                    placeholder="Producer name"
                  />
                </div>
              </div>

              {/* Business Information */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-white font-medium mb-2">
                    ISRC
                  </label>
                  <input
                    type="text"
                    name="isrc"
                    value={formData.isrc}
                    onChange={handleChange}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                    placeholder="USRC17607839"
                  />
                </div>
                
                <div>
                  <label className="block text-white font-medium mb-2">
                    UPC
                  </label>
                  <input
                    type="text"
                    name="upc"
                    value={formData.upc}
                    onChange={handleChange}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                    placeholder="123456789012"
                  />
                </div>
              </div>

              {/* Label */}
              <div className="grid grid-cols-1 gap-4 mb-6">
                <div className="relative">
                  <label className="block text-white font-medium mb-2 flex items-center">
                    <Building className="h-4 w-4 mr-2 text-purple-400" />
                    Label
                  </label>
                  <div className="relative">
                    <input
                      ref={labelInputRef}
                      type="text"
                      name="label"
                      value={formData.label}
                      onChange={handleLabelChange}
                      onKeyDown={handleLabelKeyDown}
                      onFocus={() => {
                        if (formData.label && formData.label.trim().length >= 2) {
                          searchLabels(formData.label);
                        }
                      }}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 pr-10"
                      placeholder="Start typing to search labels..."
                    />
                    {isSearchingLabels && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
                      </div>
                    )}
                    {showLabelSuggestions && labelSuggestions.length > 0 && (
                      <div
                        ref={labelSuggestionsRef}
                        className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                      >
                        {labelSuggestions.map((label, index) => (
                          <button
                            key={label._id}
                            type="button"
                            onClick={() => handleLabelSelect(label)}
                            className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-3 border-b border-gray-700 last:border-b-0 ${
                              index === selectedLabelIndex ? 'bg-gray-700' : ''
                            }`}
                          >
                            {label.profilePicture ? (
                              <img
                                src={label.profilePicture}
                                alt={label.name}
                                className="h-8 w-8 rounded object-cover"
                                onError={(e) => {
                                  e.currentTarget.src = '';
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="h-8 w-8 rounded bg-gray-700 flex items-center justify-center">
                                <Building className="h-4 w-4 text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="text-white font-medium">{label.name}</div>
                              {label.description && (
                                <div className="text-gray-400 text-sm truncate">{label.description}</div>
                              )}
                            </div>
                            {label.verificationStatus === 'verified' && (
                              <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {showLabelSuggestions && labelSuggestions.length === 0 && formData.label.trim().length >= 2 && !isSearchingLabels && (
                      <div
                        ref={labelSuggestionsRef}
                        className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-4 text-center"
                      >
                        <p className="text-gray-400 text-sm">No labels found</p>
                        <p className="text-gray-500 text-xs mt-1">You can still enter a custom label name</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Start typing to search existing labels or enter a custom label name
                  </p>
                </div>
              </div>

              {/* Language & Lyrics */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-white font-medium mb-2">
                    Language
                  </label>
                  <select
                    name="language"
                    value={formData.language}
                    onChange={handleChange}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">Select language (optional)</option>
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="ru">Russian</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                    <option value="zh">Chinese</option>
                    <option value="ar">Arabic</option>
                    <option value="hi">Hindi</option>
                    <option value="tr">Turkish</option>
                    <option value="pl">Polish</option>
                    <option value="nl">Dutch</option>
                    <option value="sv">Swedish</option>
                    <option value="no">Norwegian</option>
                    <option value="da">Danish</option>
                    <option value="fi">Finnish</option>
                    <option value="el">Greek</option>
                    <option value="he">Hebrew</option>
                    <option value="th">Thai</option>
                    <option value="vi">Vietnamese</option>
                    <option value="id">Indonesian</option>
                    <option value="ms">Malay</option>
                    <option value="cs">Czech</option>
                    <option value="hu">Hungarian</option>
                    <option value="ro">Romanian</option>
                    <option value="uk">Ukrainian</option>
                    <option value="bg">Bulgarian</option>
                    <option value="hr">Croatian</option>
                    <option value="sr">Serbian</option>
                    <option value="sk">Slovak</option>
                    <option value="sl">Slovenian</option>
                    <option value="et">Estonian</option>
                    <option value="lv">Latvian</option>
                    <option value="lt">Lithuanian</option>
                    <option value="ga">Irish</option>
                    <option value="cy">Welsh</option>
                    <option value="mt">Maltese</option>
                    <option value="sw">Swahili</option>
                    <option value="af">Afrikaans</option>
                    <option value="sq">Albanian</option>
                    <option value="az">Azerbaijani</option>
                    <option value="be">Belarusian</option>
                    <option value="bn">Bengali</option>
                    <option value="bs">Bosnian</option>
                    <option value="ca">Catalan</option>
                    <option value="eu">Basque</option>
                    <option value="fa">Persian</option>
                    <option value="gl">Galician</option>
                    <option value="is">Icelandic</option>
                    <option value="mk">Macedonian</option>
                    <option value="ml">Malayalam</option>
                    <option value="mr">Marathi</option>
                    <option value="ne">Nepali</option>
                    <option value="pa">Punjabi</option>
                    <option value="si">Sinhala</option>
                    <option value="ta">Tamil</option>
                    <option value="te">Telugu</option>
                    <option value="ur">Urdu</option>
                    <option value="zu">Zulu</option>
                  </select>
                </div>
              </div>

              {/* Lyrics */}
              <div>
                <label className="block text-white font-medium mb-2">
                  Lyrics
                </label>
                <textarea
                  name="lyrics"
                  value={formData.lyrics}
                  onChange={handleChange}
                  rows={6}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="Enter media lyrics..."
                />
              </div>
            </div>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="mt-8 bg-purple-900/20 border border-purple-500/30 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium">Uploading...</span>
                <span className="text-purple-400 font-bold">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-600 to-pink-600 h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Rights Confirmation */}
          <div className="mb-8 bg-purple-900/20 border border-purple-500/30 rounded-lg p-6">
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="rights-confirmation"
                checked={rightsConfirmed}
                onChange={(e) => setRightsConfirmed(e.target.checked)}
                className="mt-1 h-5 w-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                required
              />
              <label htmlFor="rights-confirmation" className="text-sm text-gray-300">
                <strong className="text-white">Rights Confirmation:</strong> I confirm that I own or have authorization 
                to distribute the rights (composition and master) in this uploaded work, and I grant Tuneable CIC a 
                non-exclusive, worldwide, royalty-free license to host, stream, display, and distribute this content.
                <br /><br />
                <strong className="text-white">✨Your Rights✨ You retain full rights over your works. You may 
                revoke any rights granted to Tuneable at any time by removing your works from the platform.</strong>
                <Link to="/terms-of-service" className="text-purple-400 underline ml-1 hover:text-purple-300">
                  View Terms
                </Link>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4 mt-8">
            <button
              onClick={() => navigate('/dashboard')}
              disabled={isUploading}
              className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading || !file || !formData.title.trim() || !rightsConfirmed}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all flex items-center justify-center space-x-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span>Upload Track</span>
                </>
              )}
            </button>
          </div>

          {/* Info Box */}
          <div className="mt-6 bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <h4 className="text-white font-semibold mb-2 text-sm">📌 Upload Guidelines</h4>
            <ul className="text-gray-300 text-sm space-y-1">
              <li>• MP3 format only (max 50MB)</li>
              <li>• You'll be automatically verified as the artist</li>
              <li>• Your track will be available on Tuneable immediately</li>
              <li>• You can edit metadata after upload</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatorUpload;

