import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { partyAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { Music, Calendar, Shield } from 'lucide-react';

const CreateParty: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    startTime: '',
    endTime: '',
    type: 'public' as 'public' | 'private',
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name === 'watershed') {
      setFormData({
        ...formData,
        [name]: (e.target as HTMLInputElement).checked,
      });
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await partyAPI.createParty(formData);
      toast.success('Party created successfully!');
      navigate(`/party/${response.party._id}`);
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

  // Set default start time to 1 hour from now
  React.useEffect(() => {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    setFormData(prev => ({
      ...prev,
      startTime: formatDateTime(oneHourLater),
    }));
  }, []);

  return (
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
            <Music className="h-5 w-5 mr-2" />
            Basic Information
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
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Date & Time
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-gray-700">
                Start Time *
              </label>
              <input
                type="datetime-local"
                id="startTime"
                name="startTime"
                required
                className="input mt-1"
                value={formData.startTime}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="endTime" className="block text-sm font-medium text-gray-700">
                End Time
              </label>
              <input
                type="datetime-local"
                id="endTime"
                name="endTime"
                className="input mt-1"
                value={formData.endTime}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            Party Settings
          </h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700">
                Party Type
              </label>
              <select
                id="type"
                name="type"
                className="input mt-1"
                value={formData.type}
                onChange={handleChange}
              >
                <option value="public">Public - Anyone Can Join</option>
                <option value="private">Private - Invite Code Required</option>
              </select>
            </div>

          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/parties')}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create Party'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateParty;
