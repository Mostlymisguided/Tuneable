import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { X, Loader2 } from 'lucide-react';
import { labelAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface LabelCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (label: any) => void; // Optional callback when label is created
}

const LabelCreateModal: React.FC<LabelCreateModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    email: '',
    website: '',
    genres: [] as string[],
    foundedYear: ''
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        description: '',
        email: user?.email || '',
        website: '',
        genres: [],
        foundedYear: ''
      });
    }
  }, [isOpen, user]);

  const handleCreateLabel = async () => {
    if (!formData.name || !formData.email) {
      toast.error('Label name and email are required');
      return;
    }

    try {
      setIsLoading(true);
      
      const response = await labelAPI.createLabel({
        name: formData.name,
        description: formData.description || undefined,
        email: formData.email,
        website: formData.website || undefined,
        genres: formData.genres.length > 0 ? formData.genres : undefined,
        foundedYear: formData.foundedYear ? parseInt(formData.foundedYear) : undefined
      });
      
      toast.success('Label created successfully!');
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess(response.label);
      } else {
        // Default behavior: navigate to label profile
        if (response.label?.slug) {
          navigate(`/label/${response.label.slug}`);
        }
      }
      
      // Close modal
      onClose();
    } catch (error: any) {
      console.error('Error creating label:', error);
      toast.error(error.response?.data?.error || 'Failed to create label');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Create Label</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">Label Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              placeholder="Enter label name"
            />
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              placeholder="label@example.com"
            />
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              rows={3}
              placeholder="Tell us about your label..."
            />
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Website</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              placeholder="https://example.com"
            />
          </div>
          
          <div>
            <label className="block text-white font-medium mb-2">Founded Year</label>
            <input
              type="number"
              value={formData.foundedYear}
              onChange={(e) => setFormData(prev => ({ ...prev, foundedYear: e.target.value }))}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
              placeholder="2020"
              min="1900"
              max={new Date().getFullYear()}
            />
          </div>
        </div>
        
        <div className="flex space-x-3 mt-6">
          <button
            onClick={handleCreateLabel}
            disabled={isLoading || !formData.name || !formData.email}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Creating...</span>
              </span>
            ) : (
              'Create Label'
            )}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default LabelCreateModal;

