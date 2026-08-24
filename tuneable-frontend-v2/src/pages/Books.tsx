import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Search, Coins } from 'lucide-react';
import { booksAPI } from '../lib/api';
import { penceToPounds } from '../utils/currency';
import { DEFAULT_COVER_ART } from '../constants';

type ChartBook = {
  _id: string;
  title: string;
  coverArt?: string;
  authors?: string[];
  creatorDisplay?: string;
  author?: Array<{ name?: string }>;
  globalMediaAggregate?: number;
  isbn?: string;
};

function authorLine(book: ChartBook): string {
  if (book.creatorDisplay) return book.creatorDisplay;
  if (book.authors?.length) return book.authors.join(', ');
  if (book.author?.length) return book.author.map((a) => a.name).filter(Boolean).join(', ');
  return 'Unknown author';
}

const Books: React.FC = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState<ChartBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('all-time');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await booksAPI.getChart({ limit: 50, timePeriod: period });
        if (!cancelled) setBooks(data.books || []);
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load books chart');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="min-h-screen bg-gray-950 text-white pt-20 pb-24 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BookOpen className="h-8 w-8 text-purple-400" />
              Books
            </h1>
            <p className="text-gray-400 mt-1">
              Catalogue, tip, and chart written works. Reading stays off-platform for now.
            </p>
          </div>
          <button
            onClick={() => navigate('/books/search')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 rounded-lg font-medium hover:bg-purple-500"
          >
            <Search className="h-4 w-4" />
            Find books
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          {['all-time', 'this-week', 'this-month'].map((value) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`px-3 py-1 rounded-full text-sm ${
                period === value ? 'bg-purple-600' : 'bg-gray-800 text-gray-300'
              }`}
            >
              {value.replace('-', ' ')}
            </button>
          ))}
        </div>

        {loading && <p className="text-gray-400">Loading chart…</p>}
        {error && <p className="text-red-400">{error}</p>}
        {!loading && !error && books.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-400">
            No books on the chart yet. Search Open Library and import the first ones.
          </div>
        )}

        <ol className="space-y-3">
          {books.map((book, index) => (
            <li key={book._id}>
              <Link
                to={`/book/${book._id}`}
                className="flex items-center gap-4 bg-gray-900/80 border border-gray-800 rounded-xl p-3 hover:border-purple-500"
                style={{ textDecoration: 'none' }}
              >
                <span className="w-7 text-gray-500 font-mono">{index + 1}</span>
                <img
                  src={book.coverArt || DEFAULT_COVER_ART}
                  alt=""
                  className="w-12 h-16 object-cover rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{book.title}</div>
                  <div className="text-sm text-gray-400 truncate">{authorLine(book)}</div>
                </div>
                <div className="flex items-center gap-1 text-purple-300 text-sm">
                  <Coins className="h-4 w-4" />
                  {penceToPounds(book.globalMediaAggregate || 0)}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

export default Books;
