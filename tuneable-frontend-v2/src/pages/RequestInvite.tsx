import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Mail, User, MessageSquare, Send, CheckCircle, ArrowLeft } from 'lucide-react';
import axios from 'axios';

const RequestInvite: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    reason: '',
  });

  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.reason) {
      toast.error('Please fill in all fields');
      return;
    }

    if (formData.reason.length < 20) {
      toast.error('Please tell us a bit more about why you want to join (at least 20 characters)');
      return;
    }

    setIsLoading(true);

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
      await axios.post(`${API_URL}/users/request-invite`, formData);
      
      setSubmitted(true);
      toast.success('Request submitted! We\'ll review it and get back to you soon.');
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Failed to submit request';
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="card bg-gradient-to-br from-purple-900/40 to-pink-900/40 border-2 border-purple-500/30 rounded-2xl p-8 text-center">
            <div className="mb-6">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-10 w-10 text-green-400" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-3">
                Request Submitted!
              </h1>
              <p className="text-gray-300 text-lg">
                Thanks for your interest in Tuneable
              </p>
            </div>

            <div className="bg-black/30 rounded-lg p-6 mb-6">
              <p className="text-gray-300 mb-4">
                We've received your invite request for <strong className="text-white">{formData.email}</strong>
              </p>
              <p className="text-gray-400 text-sm">
                We review requests regularly and will send you an invite code if approved. 
                Keep an eye on your inbox!
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/')}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-lg transition-all"
              >
                Back to Home
              </button>
              <button
                onClick={() => {
                  setSubmitted(false);
                  setFormData({ name: '', email: '', reason: '' });
                }}
                className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-all"
              >
                Submit Another Request
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="card bg-black/40 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                <Mail className="h-8 w-8 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-white mb-3">
              Request an Invite
            </h1>
            <p className="text-gray-300 text-lg">
              Early access to Tuneable
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4 mb-6">
            <h3 className="text-white font-semibold mb-2">Why invite-only?</h3>
            <p className="text-gray-300 text-sm">
              Tuneable is currently in Beta Testing with a carefully curated community of music lovers & creators.
              Tell us why you'd be a great fit, and we'll review your request!
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                Your Name *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="john@example.com"
                />
              </div>
            </div>

            {/* Reason */}
            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-300 mb-2">
                Why do you want to join Tuneable? *
              </label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <textarea
                  id="reason"
                  name="reason"
                  required
                  rows={5}
                  value={formData.reason}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  placeholder="Do you see yourself using Tuneable as a User or Creator? If as a Creator please include some links to your music or social media..."
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {formData.reason.length} / 20 characters minimum
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  <span>Submit Request</span>
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <Link
              to="/register"
              className="inline-flex items-center text-purple-400 hover:text-purple-300 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Already have an invite code? Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestInvite;

