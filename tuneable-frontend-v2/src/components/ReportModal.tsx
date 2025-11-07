import React, { useState } from 'react';
import { X, Flag, AlertTriangle } from 'lucide-react';
import { reportAPI } from '../lib/api';
import { toast } from 'react-toastify';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: 'media' | 'user' | 'label';
  targetId: string;
  targetTitle: string;
}

// Report categories by type
const reportCategoriesByType = {
  media: [
    {
      value: 'copyright',
      label: 'Copyright/Rights Issue',
      description: 'I own the rights to this tune or represent the rights holder',
      requiresEmail: true,
      priority: true
    },
    {
      value: 'incorrect_info',
      label: 'Incorrect Information',
      description: 'Artist name, title, or other metadata is wrong',
      requiresEmail: false,
      priority: false
    },
    {
      value: 'incorrect_tags',
      label: 'Incorrect Tags',
      description: 'Genre or other tags are inaccurate',
      requiresEmail: false,
      priority: false
    },
    {
      value: 'inappropriate',
      label: 'Inappropriate Content',
      description: 'Offensive, explicit, or otherwise inappropriate',
      requiresEmail: false,
      priority: false
    },
    {
      value: 'duplicate',
      label: 'Duplicate',
      description: 'This tune already exists on the platform',
      requiresEmail: false,
      priority: false
    },
    {
      value: 'other',
      label: 'Other Issue',
      description: 'Something else needs attention',
      requiresEmail: false,
      priority: false
    }
  ],
  user: [
    {
      value: 'harassment',
      label: 'Harassment/Bullying',
      description: 'This user is harassing or bullying others',
      requiresEmail: false,
      priority: true
    },
    {
      value: 'spam',
      label: 'Spam/Scam',
      description: 'This user is posting spam or running scams',
      requiresEmail: false,
      priority: false
    },
    {
      value: 'impersonation',
      label: 'Impersonation',
      description: 'This user is impersonating someone else',
      requiresEmail: false,
      priority: true
    },
    {
      value: 'inappropriate',
      label: 'Inappropriate Content/Behavior',
      description: 'This user is posting inappropriate content or behaving inappropriately',
      requiresEmail: false,
      priority: false
    },
    {
      value: 'copyright',
      label: 'Copyright Infringement',
      description: 'This user is infringing on copyrights',
      requiresEmail: true,
      priority: false
    },
    {
      value: 'other',
      label: 'Other Issue',
      description: 'Something else needs attention',
      requiresEmail: false,
      priority: false
    }
  ],
  label: [
    {
      value: 'copyright',
      label: 'Copyright/Rights Infringement',
      description: 'This label is claiming rights to music they don\'t own or represent',
      requiresEmail: true,
      priority: true
    },
    {
      value: 'unauthorized_claim',
      label: 'Unauthorized Use/False Claim',
      description: 'Someone is claiming to represent a label they\'re not authorized to represent',
      requiresEmail: false,
      priority: true
    },
    {
      value: 'label_incorrect_info',
      label: 'Incorrect Information',
      description: 'Label name, location, contact info, or other details are incorrect',
      requiresEmail: false,
      priority: false
    },
    {
      value: 'inappropriate',
      label: 'Inappropriate Content',
      description: 'This label is posting inappropriate, offensive, or harmful content',
      requiresEmail: false,
      priority: false
    },
    {
      value: 'other',
      label: 'Other Issue',
      description: 'Something else needs attention',
      requiresEmail: false,
      priority: false
    }
  ]
};

const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, reportType, targetId, targetTitle }) => {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reportCategories = reportCategoriesByType[reportType];
  const selectedCategory = reportCategories.find(c => c.value === category);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!category || !description.trim()) {
      toast.error('Please select a category and provide a description');
      return;
    }

    if (selectedCategory?.requiresEmail && !contactEmail.trim()) {
      toast.error('Contact email is required for this report type');
      return;
    }

    setIsSubmitting(true);

    try {
      switch (reportType) {
        case 'media':
          await reportAPI.reportMedia(targetId, {
            category,
            description: description.trim(),
            contactEmail: contactEmail.trim() || undefined
          });
          break;
        case 'user':
          await reportAPI.reportUser(targetId, {
            category,
            description: description.trim(),
            contactEmail: contactEmail.trim() || undefined
          });
          break;
        case 'label':
          await reportAPI.reportLabel(targetId, {
            category,
            description: description.trim(),
            contactEmail: contactEmail.trim() || undefined
          });
          break;
      }

      toast.success('Report submitted successfully. We\'ll review it shortly.');
      onClose();
      
      // Reset form
      setCategory('');
      setDescription('');
      setContactEmail('');
    } catch (error: any) {
      console.error('Error submitting report:', error);
      toast.error(error.response?.data?.error || 'Failed to submit report');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setCategory('');
      setDescription('');
      setContactEmail('');
      onClose();
    }
  };

  const getCopyrightNotice = () => {
    if ((reportType === 'media' || reportType === 'label') && category === 'copyright') {
      return (
        <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <p className="font-medium mb-1">Copyright Notice</p>
              <p>
                Please ensure you are the copyright holder or authorized representative. 
                False claims may result in account suspension. We will contact you at 
                the provided email for verification.
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-purple-500/20">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-br from-gray-900 to-gray-800 border-b border-gray-700 p-6 flex items-center justify-between z-10">
          <div className="flex items-center space-x-3">
            <Flag className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-bold text-white">Report Issue</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Target Info */}
          <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
            <p className="text-sm text-gray-400">Reporting:</p>
            <p className="text-white font-medium">{targetTitle}</p>
          </div>

          {/* Category Selection */}
          <div>
            <label className="block text-white font-medium mb-3">Issue Category *</label>
            <div className="space-y-2">
              {reportCategories.map((cat) => (
                <label
                  key={cat.value}
                  className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    category === cat.value
                      ? 'border-purple-500 bg-purple-900/20'
                      : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.value}
                    checked={category === cat.value}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 mr-3"
                    disabled={isSubmitting}
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-white font-medium">{cat.label}</span>
                      {cat.priority && (
                        <span className="flex items-center space-x-1 text-xs bg-red-600 text-white px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Priority</span>
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{cat.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-white font-medium mb-2">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please provide details about the issue..."
              rows={5}
              maxLength={2000}
              disabled={isSubmitting}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
            <p className="text-xs text-gray-400 mt-1">
              {description.length}/2000 characters
            </p>
          </div>

          {/* Contact Email (conditional) */}
          {selectedCategory?.requiresEmail && (
            <div>
              <label className="block text-white font-medium mb-2">
                Contact Email *
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={isSubmitting}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              />
              <p className="text-xs text-gray-400 mt-1">
                Required for copyright claims so we can contact you for verification
              </p>
            </div>
          )}

          {/* Copyright Notice */}
          {getCopyrightNotice()}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !category || !description.trim()}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Flag className="w-4 h-4" />
              <span>{isSubmitting ? 'Submitting...' : 'Submit Report'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReportModal;
