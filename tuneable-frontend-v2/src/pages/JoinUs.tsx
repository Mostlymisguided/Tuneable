import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Music, Users, ArrowRight, Mail } from 'lucide-react';
import { toast } from '../utils/toast';
import { emailAPI } from '../lib/api';
import { HOW_MONEY_WORKS_PATH } from '../constants';

const JoinUs: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!acknowledged) {
      toast.error('Confirm that this form does not buy shares');
      return;
    }
    setIsLoading(true);
    try {
      await emailAPI.registerFundingInterest({ name, email, note, acknowledged });
      setSent(true);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Could not send that. Email hi@tuneable.stream instead.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-indigo-800">
      <section className="text-white relative overflow-hidden pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Community funding is paused
          </h1>
          <p className="text-xl text-gray-200 leading-relaxed mb-6">
            Tuneable is a Community Interest Company. We are not taking payments for shares while we
            sort the legal structure of any future round.
          </p>
          <p className="text-base text-indigo-100 leading-relaxed">
            Registering interest does not buy shares, and it does not give you any stake in Tuneable.
            {' '}
            <Link to={HOW_MONEY_WORKS_PATH} className="underline hover:text-white">
              How tips are split
            </Link>
          </p>
        </div>
      </section>

      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto bg-gray-900/80 backdrop-blur-sm rounded-2xl p-8 border border-gray-700">
          {sent ? (
            <div className="text-center">
              <Mail className="h-10 w-10 text-purple-300 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-3">We have your note</h2>
              <p className="text-gray-300">
                If a funding round opens, we will email {email}. Nothing has been purchased.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <h2 className="text-2xl font-bold text-white">Hear about a future round</h2>
              <div>
                <label htmlFor="funding-name" className="block text-sm text-gray-300 mb-1">Name</label>
                <input
                  id="funding-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                  className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label htmlFor="funding-email" className="block text-sm text-gray-300 mb-1">Email</label>
                <input
                  id="funding-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label htmlFor="funding-note" className="block text-sm text-gray-300 mb-1">Note (optional)</label>
                <textarea
                  id="funding-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white"
                />
              </div>
              <label className="flex items-start gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-1"
                  required
                />
                <span>I understand this form does not buy shares or any other stake in Tuneable.</span>
              </label>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-lg font-semibold bg-gradient-to-r from-purple-600 to-pink-600 text-white disabled:opacity-50"
              >
                {isLoading ? 'Sending…' : 'Register interest'}
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Use Tuneable today</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://discord.gg/hwGMZV89up"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold"
            >
              <MessageCircle className="h-5 w-5 mr-2" />
              Join Discord
              <ArrowRight className="h-5 w-5 ml-2" />
            </a>
            <Link
              to="/register"
              className="inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold"
            >
              <Users className="h-5 w-5 mr-2" />
              Join as a listener
              <ArrowRight className="h-5 w-5 ml-2" />
            </Link>
            <Link
              to="/creator/register"
              className="inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold"
            >
              <Music className="h-5 w-5 mr-2" />
              Become a creator
              <ArrowRight className="h-5 w-5 ml-2" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default JoinUs;
