import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Upload, Music, Image, FileText, Calendar, Clock, Tag, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const CreatorUpload: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [formData, setFormData] = useState({
    title: '',
    album: '',
    genre: '',
    releaseDate: '',
    duration: '',
    explicit: false,
    tags: '',
    description: '',
    coverArt: ''
  });

  // Check if user is verified creator
  const isVerifiedCreator = user && 
    (user as any).creatorProfile && 
    (user as any).creatorProfile.verificationStatus === 'verified';

  if (!isVerifiedCreator) {
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

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
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
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

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const uploadData = new FormData();
      uploadData.append('audioFile', file);
      uploadData.append('title', formData.title.trim());
      if (formData.album) uploadData.append('album', formData.album.trim());
      if (formData.genre) uploadData.append('genre', formData.genre);
      if (formData.releaseDate) uploadData.append('releaseDate', formData.releaseDate);
      if (formData.duration) uploadData.append('duration', formData.duration);
      uploadData.append('explicit', formData.explicit.toString());
      if (formData.tags) uploadData.append('tags', formData.tags);
      if (formData.description) uploadData.append('description', formData.description.trim());
      if (formData.coverArt) uploadData.append('coverArt', formData.coverArt.trim());

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
      if (response.data.media?.uuid) {
        navigate(`/tune/${response.data.media.uuid}`);
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
                  Duration (seconds)
                </label>
                <input
                  type="number"
                  name="duration"
                  value={formData.duration}
                  onChange={handleChange}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                  placeholder="180"
                />
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
              </label>
              <input
                type="url"
                name="coverArt"
                value={formData.coverArt}
                onChange={handleChange}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="https://example.com/cover.jpg"
              />
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
              disabled={isUploading || !file || !formData.title.trim()}
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

