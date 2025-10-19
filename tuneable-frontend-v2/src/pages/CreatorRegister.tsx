import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { creatorAPI } from '../lib/api';
import {
  User,
  Music,
  Award,
  Link as LinkIcon,
  Building,
  Upload,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Loader2
} from 'lucide-react';

const CreatorRegister: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    artistName: '',
    bio: '',
    genres: [] as string[],
    roles: [] as string[],
    website: '',
    socialMedia: {
      instagram: '',
      facebook: '',
      soundcloud: '',
      spotify: '',
      youtube: '',
      twitter: ''
    },
    label: '',
    management: '',
    distributor: '',
    verificationMethod: 'manual'
  });

  const [genreInput, setGenreInput] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);

  // Available options
  const availableGenres = [
    'Pop', 'Rock', 'Hip Hop', 'R&B', 'Electronic', 'Country', 'Jazz', 
    'Classical', 'Reggae', 'Metal', 'Indie', 'Folk', 'Blues', 'Soul', 
    'Funk', 'Punk', 'Alternative', 'Dance', 'Latin', 'World',
    'Techno', 'House', 'Minimal', 'D&B', 'Jungle', 'Trance'
  ];

  const availableRoles = [
    'artist', 'producer', 'songwriter', 'composer', 'host', 
    'narrator', 'director', 'editor', 'author', 'DJ', 'vocalist', 'instrumentalist'
  ];

  const distributors = [
    'DistroKid', 'TuneCore', 'CD Baby', 'Ditto Music', 'AWAL', 
    'Stem', 'Amuse', 'RouteNote', 'Other'
  ];

  // Validation
  const isStep1Valid = () => {
    return formData.artistName.trim().length > 0 && 
           formData.bio.trim().length >= 50 &&
           formData.roles.length > 0;
  };

  const isStep2Valid = () => {
    return formData.genres.length > 0;
  };

  const handleSubmit = async () => {
    if (!isStep1Valid() || !isStep2Valid()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const submitData = new FormData();
      submitData.append('artistName', formData.artistName);
      submitData.append('bio', formData.bio);
      submitData.append('genres', JSON.stringify(formData.genres));
      submitData.append('roles', JSON.stringify(formData.roles));
      submitData.append('website', formData.website);
      submitData.append('socialMedia', JSON.stringify(formData.socialMedia));
      submitData.append('label', formData.label);
      submitData.append('management', formData.management);
      submitData.append('distributor', formData.distributor);
      submitData.append('verificationMethod', formData.verificationMethod);

      // Add proof files
      proofFiles.forEach(file => {
        submitData.append('proofFiles', file);
      });

      const response = await creatorAPI.apply(submitData);
      
      toast.success(response.message);
      
      // Navigate to profile or back to where they came from
      setTimeout(() => {
        navigate('/profile');
      }, 2000);
    } catch (error: any) {
      console.error('Error submitting creator application:', error);
      toast.error(error.response?.data?.error || 'Failed to submit application');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addGenre = (genre: string) => {
    if (genre && !formData.genres.includes(genre)) {
      setFormData({ ...formData, genres: [...formData.genres, genre] });
      setGenreInput('');
    }
  };

  const removeGenre = (genre: string) => {
    setFormData({
      ...formData,
      genres: formData.genres.filter(g => g !== genre)
    });
  };

  const toggleRole = (role: string) => {
    if (formData.roles.includes(role)) {
      setFormData({
        ...formData,
        roles: formData.roles.filter(r => r !== role)
      });
    } else {
      setFormData({
        ...formData,
        roles: [...formData.roles, role]
      });
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <User className="h-6 w-6 mr-2 text-purple-400" />
          Basic Information
        </h3>

        <div className="space-y-4">
          {/* Artist Name */}
          <div>
            <label className="block text-white font-medium mb-2">
              Artist/Stage Name *
            </label>
            <input
              type="text"
              value={formData.artistName}
              onChange={(e) => setFormData({ ...formData, artistName: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="Your professional name"
              maxLength={100}
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-white font-medium mb-2">
              Artist Bio * (min 50 characters)
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 min-h-[120px]"
              placeholder="Tell us about yourself, your music, and your journey..."
              maxLength={500}
            />
            <div className="text-xs text-gray-400 mt-1">
              {formData.bio.length}/500 characters {formData.bio.length < 50 && `(${50 - formData.bio.length} more needed)`}
            </div>
          </div>

          {/* Roles */}
          <div>
            <label className="block text-white font-medium mb-2">
              Your Roles * (select all that apply)
            </label>
            <div className="flex flex-wrap gap-2">
              {availableRoles.map((role) => (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    formData.roles.includes(role)
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <Music className="h-6 w-6 mr-2 text-purple-400" />
          Musical Details
        </h3>

        <div className="space-y-4">
          {/* Genres */}
          <div>
            <label className="block text-white font-medium mb-2">
              Genres * (add at least one)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addGenre(genreInput);
                  }
                }}
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder="Type or select a genre"
              />
              <button
                onClick={() => addGenre(genreInput)}
                disabled={!genreInput.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                Add
              </button>
            </div>

            {/* Quick select genres */}
            <div className="flex flex-wrap gap-2 mb-3">
              {availableGenres.map((genre) => (
                <button
                  key={genre}
                  onClick={() => addGenre(genre)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-full transition-colors"
                >
                  + {genre}
                </button>
              ))}
            </div>

            {/* Selected genres */}
            {formData.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.genres.map((genre) => (
                  <span
                    key={genre}
                    className="inline-flex items-center px-3 py-1 bg-purple-600 text-white rounded-full text-sm"
                  >
                    {genre}
                    <button
                      onClick={() => removeGenre(genre)}
                      className="ml-2 hover:text-gray-300"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Website */}
          <div>
            <label className="block text-white font-medium mb-2">
              Website
            </label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="https://yourwebsite.com"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <LinkIcon className="h-6 w-6 mr-2 text-purple-400" />
          Social Media & Streaming
        </h3>

        <div className="space-y-3">
          {Object.entries({
            instagram: 'Instagram',
            facebook: 'Facebook',
            soundcloud: 'SoundCloud',
            spotify: 'Spotify',
            youtube: 'YouTube',
            twitter: 'Twitter/X'
          }).map(([key, label]) => (
            <div key={key}>
              <label className="block text-gray-300 font-medium mb-1 text-sm">
                {label}
              </label>
              <input
                type="url"
                value={formData.socialMedia[key as keyof typeof formData.socialMedia]}
                onChange={(e) => setFormData({
                  ...formData,
                  socialMedia: {
                    ...formData.socialMedia,
                    [key]: e.target.value
                  }
                })}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                placeholder={`Your ${label} profile URL`}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg">
          <p className="text-blue-200 text-sm">
            <strong>Tip:</strong> Adding verified social media accounts can speed up the verification process.
          </p>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <Building className="h-6 w-6 mr-2 text-purple-400" />
          Professional Details
        </h3>

        <div className="space-y-4">
          {/* Label */}
          <div>
            <label className="block text-white font-medium mb-2">
              Record Label
            </label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="Your record label (if applicable)"
            />
          </div>

          {/* Management */}
          <div>
            <label className="block text-white font-medium mb-2">
              Management Company
            </label>
            <input
              type="text"
              value={formData.management}
              onChange={(e) => setFormData({ ...formData, management: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
              placeholder="Your management company (if applicable)"
            />
          </div>

          {/* Distributor */}
          <div>
            <label className="block text-white font-medium mb-2">
              Music Distributor
            </label>
            <select
              value={formData.distributor}
              onChange={(e) => setFormData({ ...formData, distributor: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">Select distributor (if applicable)</option>
              {distributors.map(dist => (
                <option key={dist} value={dist}>{dist}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
          <Award className="h-6 w-6 mr-2 text-purple-400" />
          Verification
        </h3>

        <div className="space-y-4">
          <p className="text-gray-300">
            To verify your identity as a creator, please upload supporting documents such as:
          </p>

          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
            <li>Screenshots from distribution platforms (DistroKid, TuneCore, etc.)</li>
            <li>Screenshots from streaming services showing your artist profile</li>
            <li>Contracts or agreements with labels/management</li>
            <li>ISRC/UPC documentation</li>
            <li>Social media verification screenshots</li>
          </ul>

          {/* File Upload */}
          <div>
            <label className="block text-white font-medium mb-2">
              <Upload className="inline h-5 w-5 mr-2" />
              Upload Proof Documents (Optional but recommended)
            </label>
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={(e) => setProofFiles(Array.from(e.target.files || []))}
              className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
            />
            {proofFiles.length > 0 && (
              <div className="mt-2 text-sm text-gray-300">
                {proofFiles.length} file(s) selected
              </div>
            )}
          </div>

          <div className="p-4 bg-yellow-900/30 border border-yellow-500/30 rounded-lg">
            <p className="text-yellow-200 text-sm">
              <strong>Note:</strong> Your application will be reviewed by our team within 24-48 hours. 
              Providing verification documents will help speed up the process.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-8 pb-40">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Become a Creator</h1>
          <p className="text-gray-300">
            Join Tuneable as a verified creator and claim your music
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4, 5].map((stepNum) => (
              <React.Fragment key={stepNum}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                      stepNum < step
                        ? 'bg-green-600 text-white'
                        : stepNum === step
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {stepNum < step ? <CheckCircle className="h-6 w-6" /> : stepNum}
                  </div>
                  <span className="text-xs text-gray-400 mt-1 hidden sm:block">
                    {['Basic', 'Music', 'Social', 'Pro', 'Verify'][stepNum - 1]}
                  </span>
                </div>
                {stepNum < 5 && (
                  <div
                    className={`flex-1 h-1 mx-2 transition-colors ${
                      stepNum < step ? 'bg-green-600' : 'bg-gray-700'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="bg-black/20 backdrop-blur-sm rounded-lg p-8 border border-white/10">
          {renderStepContent()}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-700">
            <button
              onClick={() => step === 1 ? navigate(-1) : setStep(step - 1)}
              className="flex items-center px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step < 5 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 ? !isStep1Valid() : step === 2 ? !isStep2Valid() : false}
                className="flex items-center px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                Next
                <ArrowRight className="h-5 w-5 ml-2" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Submit Application
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatorRegister;

