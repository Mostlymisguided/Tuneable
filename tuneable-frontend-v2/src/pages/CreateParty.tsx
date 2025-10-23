import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { partyAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { Music, Calendar, Shield, ArrowLeft } from 'lucide-react';

// Slider styles
const sliderStyles = `
  .slider::-webkit-slider-thumb {
    appearance: none;
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .slider::-moz-range-thumb {
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
`;

const CreateParty: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    startTime: '',
    privacy: 'public' as 'public' | 'private',
    type: 'remote' as 'remote' | 'live' | 'global',
    musicSource: 'youtube' as 'youtube' | 'direct_upload',
    minimumBid: 0.33,
  });
  const [scheduleType, setScheduleType] = useState<'automatic' | 'custom'>('automatic');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    setFormData({
      ...formData,
      [name]: name === 'minimumBid' ? parseFloat(value) || 0.33 : value,
    });
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setFormData({
      ...formData,
      minimumBid: value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Prepare party data based on schedule type
      const partyData = {
        ...formData,
        // For automatic schedule, don't send startTime (backend will set to now)
        // For custom schedule, send the selected startTime
        ...(scheduleType === 'custom' ? { startTime: formData.startTime } : {})
      };

      const response = await partyAPI.createParty(partyData);
      toast.success('Party created successfully!');
      navigate(`/party/${response.party.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create party');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Set default start time to now only for custom schedule
  React.useEffect(() => {
    if (scheduleType === 'custom') {
      const now = new Date();
      setFormData(prev => ({
        ...prev,
        startTime: formatDateTime(now),
      }));
    } else {
      // For automatic, clear startTime so backend can set it to now
      setFormData(prev => ({
        ...prev,
        startTime: '',
      }));
    }
  }, [scheduleType]);

  return (
    <>
      <style>{sliderStyles}</style>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Create New Party</h1>
        <p className="text-gray-600 mt-2">
          Set up your music party and invite friends to join
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Music className="h-5 w-5 mr-3" />
            Party Details
          </h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Party Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="input mt-1"
                placeholder="Enter Party Name"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                Location / Venue *
              </label>
              <input
                type="text"
                id="location"
                name="location"
                required
                className="input mt-1"
                placeholder="Enter Location Address / Venue Name"
                value={formData.location}
                onChange={handleChange}
              />
            </div>
          </div>

          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center mt-8">
            <Calendar className="h-5 w-5 mr-3" />
            Party Schedule
          </h2>
          
          <div className="space-y-6">
            {/* Schedule Type Toggle */}
            <div className="bg-gradient-to-r from-gray-50 to-slate-50 p-4 rounded-lg border border-gray-200">
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setScheduleType('automatic')}
                  className={`flex-1 rounded-lg font-semibold transition-colors ${
                    scheduleType === 'automatic'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                  style={{ 
                    paddingTop: '0.5rem',
                    paddingRight: '1rem',
                    paddingBottom: '0.5rem',
                    paddingLeft: '1rem'
                  }}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-current"></div>
                    <span className="text-white">Automatic</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleType('custom')}
                  className={`flex-1 rounded-lg font-semibold transition-colors ${
                    scheduleType === 'custom'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                  style={{ 
                    paddingTop: '0.5rem',
                    paddingRight: '1rem',
                    paddingBottom: '0.5rem',
                    paddingLeft: '1rem'
                  }}
                >
                  <div className="flex items-center justify-center">
                    <span className="text-white">Custom</span>
                  </div>
                </button>
              </div>
              {scheduleType === 'automatic' && (
                <div className="text-center" style={{ paddingTop: '20px' }}>
                  <p className="text-sm text-gray-600">
                    Start Now - End When You Choose
                  </p>
                </div>
              )}
              {scheduleType === 'custom' && formData.startTime && (
                <div className="text-center" style={{ paddingTop: '20px' }}>
                  <p className="text-sm text-white">
                    {new Date(formData.startTime).toLocaleString('en-GB', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              )}
            </div>

            {/* Custom Start Time - Only show when custom is selected */}
            {scheduleType === 'custom' && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100" style={{ marginTop: '0' }}>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Start Time *
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Date</label>
                    <input
                      type="date"
                      value={formData.startTime.split('T')[0]}
                      onChange={(e) => {
                        const time = formData.startTime.split('T')[1] || '19:00';
                        setFormData({ ...formData, startTime: `${e.target.value}T${time}` });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Time</label>
                    <input
                      type="time"
                      value={formData.startTime.split('T')[1] || '19:00'}
                      onChange={(e) => {
                        const date = formData.startTime.split('T')[0];
                        setFormData({ ...formData, startTime: `${date}T${e.target.value}` });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}


          </div>

          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center mt-8">
            <Shield className="h-5 w-5 mr-3" />
            Party Settings
          </h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="privacy" className="block text-sm font-medium text-gray-700" style={{ paddingBottom: '5px' }}>
                Party Privacy
              </label>
              <select
                id="privacy"
                name="privacy"
                className="input mt-1"
                value={formData.privacy}
                onChange={handleChange}
              >
                <option value="public">Public</option>
                <option value="private">Private - Invite Code Required</option>
              </select>
            </div>

            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700" style={{ paddingBottom: '5px' }}>
                Party Type
              </label>
              <select
                id="type"
                name="type"
                className="input mt-1"
                value={formData.type}
                onChange={handleChange}
              >
                <option value="remote">Remote - Collaborative Playlist</option>
                <option value="live">Live - Real-time Venue</option>
              </select>
            </div>

            <div>
              <label htmlFor="musicSource" className="block text-sm font-medium text-gray-700" style={{ paddingBottom: '5px' }}>
                Music Source
              </label>
              <select
                id="musicSource"
                name="musicSource"
                className="input mt-1"
                value={formData.musicSource}
                onChange={handleChange}
              >
                <option value="youtube">YouTube</option>
                <option value="direct_upload" disabled>Direct Upload (Coming Soon)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Minimum Bid
              </label>
              
              {/* Value Display */}
              <div className="text-center mb-4">
                <div className="text-3xl font-bold text-white">
                  £{formData.minimumBid.toFixed(2)}
                </div>
              </div>

              {/* Slider */}
              <div className="mb-4">
                <input
                  type="range"
                  min="0.01"
                  max="11.11"
                  step="0.01"
                  value={formData.minimumBid}
                  onChange={handleSliderChange}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #9333ea 0%, #9333ea ${((formData.minimumBid - 0.01) / (11.11 - 0.01)) * 100}%, #e5e7eb ${((formData.minimumBid - 0.01) / (11.11 - 0.01)) * 100}%, #e5e7eb 100%)`
                  }}
                />
                
                {/* Slider Labels */}
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>£0.01</span>
                  <span>£5.55</span>
                  <span>£11.11</span>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap justify-center gap-2 mb-3">
                {[0.33, 0.55, 1.11, 2.22, 4.44, 8.88].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormData({ ...formData, minimumBid: value })}
                    className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                      Math.abs(formData.minimumBid - value) < 0.01
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    £{value.toFixed(2)}
                  </button>
                ))}
              </div>

              <p className="text-xs text-gray-500 text-center" style={{ paddingTop: '10px' }}>
                Minimum amount users must bid to add songs to the queue
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-center space-x-4">
          <button
            type="button"
            onClick={() => navigate('/parties')}
            className="btn-secondary flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary disabled:opacity-50 font-semibold"
          >
            {isLoading ? 'Creating...' : 'Create Party'}
          </button>
        </div>
      </form>
    </div>
    </>
  );
};

export default CreateParty;
