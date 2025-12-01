import React, { useState } from 'react';
import { X, Flag, AlertTriangle, Lightbulb } from 'lucide-react';
import { toast } from 'react-toastify';
import { SUPPORT_EMAIL } from '../constants';

interface GeneralReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const reportCategories = [
  {
    value: 'bug',
    label: 'Bug / Technical Issue',
    description: 'Something is broken or not working as expected',
    icon: <AlertTriangle className="w-5 h-5" />
  },
  {
    value: 'feature',
    label: 'Feature Suggestion',
    description: 'I have an idea for a new feature or improvement',
    icon: <Lightbulb className="w-5 h-5" />
  },
  {
    value: 'other',
    label: 'Other Issue',
    description: 'Something else that needs attention',
    icon: <Flag className="w-5 h-5" />
  }
];

const GeneralReportModal: React.FC<GeneralReportModalProps> = ({ isOpen, onClose }) => {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCategory = reportCategories.find(c => c.value === category);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!category || !description.trim()) {
      toast.error('Please select a category and provide a description');
      return;
    }

    setIsSubmitting(true);

    try {
      // Create email subject and body
      const categoryLabel = selectedCategory?.label || category;
      const subject = encodeURIComponent(`[Help Page Report] ${categoryLabel}`);
      const body = encodeURIComponent(
        `Category: ${categoryLabel}\n\n` +
        `Description:\n${description.trim()}\n\n` +
        `---\n` +
        `Submitted from Help & Support page`
      );

      // Open email client with pre-filled information
      window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
      
      toast.success('Opening your email client... Please send the email to complete your report.');
      onClose();
      
      // Reset form
      setCategory('');
      setDescription('');
    } catch (error: any) {
      console.error('Error preparing report:', error);
      toast.error('Failed to prepare report. Please email us directly at ' + SUPPORT_EMAIL);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setCategory('');
      setDescription('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-purple-500/20">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-br from-gray-900 to-gray-800 border-b border-gray-700 p-6 flex items-center justify-between z-10">
          <div className="flex items-center space-x-3">
            <Flag className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-bold text-white">Report a Problem or Suggest a Feature</h2>
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
          {/* Category Selection */}
          <div>
            <label className="block text-white font-medium mb-3">What would you like to report? *</label>
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
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="text-purple-400 mt-0.5">
                      {cat.icon}
                    </div>
                    <div className="flex-1">
                      <span className="text-white font-medium block">{cat.label}</span>
                      <p className="text-sm text-gray-400 mt-1">{cat.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-white font-medium mb-2">
              Please provide details *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                category === 'bug' 
                  ? 'Describe the issue you encountered. Include steps to reproduce if possible...'
                  : category === 'feature'
                  ? 'Describe your feature idea and how it would improve Tuneable...'
                  : 'Please provide details about your issue or suggestion...'
              }
              rows={6}
              maxLength={2000}
              disabled={isSubmitting}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
            <p className="text-xs text-gray-400 mt-1">
              {description.length}/2000 characters
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-900/20 border border-blue-600/50 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200">
                <p className="font-medium mb-1">How this works</p>
                <p>
                  When you submit, we'll open your email client with a pre-filled message. 
                  Simply send the email to complete your report. Our team will review it and get back to you.
                </p>
              </div>
            </div>
          </div>

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
              <span>{isSubmitting ? 'Preparing...' : 'Submit Report'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GeneralReportModal;

