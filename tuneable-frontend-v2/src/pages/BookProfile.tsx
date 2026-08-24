import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { BookOpen, Coins, ExternalLink, Loader2 } from 'lucide-react';
import { booksAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { penceToPounds, penceToPoundsNumber } from '../utils/currency';
import { DEFAULT_COVER_ART } from '../constants';
import BidConfirmationModal from '../components/BidConfirmationModal';
import MediaChampions from '../components/MediaChampions';
import { getReadElsewhereTarget } from '../utils/listenElsewhere';
import { getTipCurrentLocation } from '../utils/currentLocationCache';

const BookProfile: React.FC = () => {
  const { mediaId } = useParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [book, setBook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipping, setTipping] = useState(false);

  const load = async () => {
    if (!mediaId) return;
    setLoading(true);
    try {
      const data = await booksAPI.getBook(mediaId);
      setBook(data.book);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Book not found');
      navigate('/books');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId]);

  const authors = useMemo(() => {
    if (!book) return '';
    if (book.creatorDisplay) return book.creatorDisplay;
    if (Array.isArray(book.authors) && book.authors.length) return book.authors.join(', ');
    if (Array.isArray(book.author)) return book.author.map((a: any) => a.name).filter(Boolean).join(', ');
    return 'Unknown author';
  }, [book]);

  const elsewhere = book ? getReadElsewhereTarget(book) : null;
  const defaultTip = user?.preferences?.defaultTip || 1.11;

  const handleConfirmTip = async (_tags: string[], amount: number) => {
    if (!mediaId) return;
    setTipping(true);
    try {
      const currentLocation = getTipCurrentLocation();
      const result = await booksAPI.boost(mediaId, amount, currentLocation);
      setBook(result.book);
      setShowTipModal(false);
      toast.success('Tip placed');
      await refreshUser?.();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to tip');
    } finally {
      setTipping(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white pt-24 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!book) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white pt-20 pb-24 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row gap-6">
          <img
            src={book.coverArt || DEFAULT_COVER_ART}
            alt=""
            className="w-40 h-56 object-cover rounded-xl shadow-lg"
          />
          <div className="flex-1">
            <div className="text-sm text-purple-300 flex items-center gap-1 mb-1">
              <BookOpen className="h-4 w-4" /> Book
            </div>
            <h1 className="text-3xl font-bold">{book.title}</h1>
            <p className="text-lg text-gray-300 mt-1">{authors}</p>
            <div className="text-sm text-gray-500 mt-2 space-y-1">
              {book.isbn && <div>ISBN {book.isbn}</div>}
              {book.publisher && <div>{book.publisher}</div>}
              {book.pages && <div>{book.pages} pages</div>}
              {book.releaseYear && <div>{book.releaseYear}</div>}
            </div>
            <div className="flex items-center gap-3 mt-4">
              <div className="flex items-center gap-1 text-purple-300">
                <Coins className="h-4 w-4" />
                {penceToPounds(book.globalMediaAggregate || 0)} tipped
              </div>
              <button
                onClick={() => {
                  if (!user) {
                    navigate(`/login?returnUrl=${encodeURIComponent(`/book/${mediaId}`)}`);
                    return;
                  }
                  setShowTipModal(true);
                }}
                className="px-4 py-2 bg-purple-600 rounded-lg font-medium"
              >
                Tip this book
              </button>
              {elsewhere && (
                <a
                  href={elsewhere.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gray-800 rounded-lg inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-4 w-4" />
                  {elsewhere.label}
                </a>
              )}
            </div>
          </div>
        </div>

        {book.description && (
          <p className="mt-8 text-gray-300 whitespace-pre-wrap">{book.description}</p>
        )}

        {Array.isArray(book.tags) && book.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-6">
            {book.tags.map((tag: string) => (
              <span key={tag} className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-10">
          <MediaChampions mediaId={book._id} />
        </div>
      </div>

      <BidConfirmationModal
        isOpen={showTipModal}
        onClose={() => setShowTipModal(false)}
        onConfirm={handleConfirmTip}
        bidAmount={defaultTip}
        mediaTitle={book.title}
        mediaArtist={authors}
        userBalance={penceToPoundsNumber((user as any)?.balance)}
        isLoading={tipping}
        isNonPlayable
      />
    </div>
  );
};

export default BookProfile;
