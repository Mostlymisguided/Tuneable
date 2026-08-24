import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Loader2, Search, BookPlus } from 'lucide-react';
import { booksAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_COVER_ART } from '../constants';

type DiscoveryBook = {
  source?: string;
  openLibraryKey?: string | null;
  googleBooksId?: string | null;
  isbn?: string | null;
  title: string;
  authors?: string[];
  coverArt?: string | null;
  pageCount?: number | null;
  publisher?: string | null;
  publishedYear?: number | null;
  description?: string | null;
  subjects?: string[];
  infoUrl?: string | null;
  previewUrl?: string | null;
};

const BookSearch: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<any[]>([]);
  const [openLibrary, setOpenLibrary] = useState<DiscoveryBook[]>([]);
  const [googleBooks, setGoogleBooks] = useState<DiscoveryBook[]>([]);
  const [googleDisabled, setGoogleDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importingKey, setImportingKey] = useState<string | null>(null);

  const runSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      toast.error('Enter at least 2 characters');
      return;
    }
    setLoading(true);
    try {
      const [local, ol, gb] = await Promise.all([
        booksAPI.searchCatalog(q).catch(() => ({ books: [] })),
        booksAPI.searchOpenLibrary(q).catch(() => ({ books: [] })),
        booksAPI.searchGoogleBooks(q).catch(() => ({ books: [], disabled: true })),
      ]);
      setCatalog(local.books || []);
      setOpenLibrary(ol.books || []);
      setGoogleBooks(gb.books || []);
      setGoogleDisabled(Boolean(gb.disabled));
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const importBook = async (book: DiscoveryBook) => {
    if (!user) {
      toast.info('Log in to add a book to the catalogue');
      navigate(`/login?returnUrl=${encodeURIComponent('/books/search')}`);
      return;
    }
    const key = book.openLibraryKey || book.googleBooksId || book.isbn || book.title;
    setImportingKey(key || book.title);
    try {
      const result = await booksAPI.importBook({
        ...book,
        source: book.source || (book.googleBooksId ? 'googleBooks' : 'openLibrary'),
      });
      toast.success(result.created ? 'Added to Tuneable' : 'Already in the catalogue');
      navigate(`/book/${result.book._id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setImportingKey(null);
    }
  };

  const renderDiscovery = (books: DiscoveryBook[], empty: string) => {
    if (!books.length) return <p className="text-gray-500 text-sm">{empty}</p>;
    return (
      <ul className="space-y-3">
        {books.map((book) => {
          const key = book.openLibraryKey || book.googleBooksId || `${book.title}-${book.isbn}`;
          return (
            <li
              key={key}
              className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-3"
            >
              <img
                src={book.coverArt || DEFAULT_COVER_ART}
                alt=""
                className="w-12 h-16 object-cover rounded"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{book.title}</div>
                <div className="text-sm text-gray-400 truncate">
                  {(book.authors || []).join(', ') || 'Unknown author'}
                  {book.publishedYear ? ` · ${book.publishedYear}` : ''}
                </div>
                {book.isbn && <div className="text-xs text-gray-500">ISBN {book.isbn}</div>}
              </div>
              <button
                onClick={() => importBook(book)}
                disabled={importingKey === key}
                className="flex items-center gap-1 px-3 py-2 bg-purple-600 rounded-lg text-sm disabled:opacity-50"
              >
                {importingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookPlus className="h-4 w-4" />}
                Add
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white pt-20 pb-24 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Find books</h1>
        <p className="text-gray-400 mb-6">
          Search Tuneable’s catalogue, then Open Library (and Google Books when configured).
        </p>
        <form onSubmit={runSearch} className="flex gap-2 mb-8">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, author, or ISBN"
            className="flex-1 px-4 py-3 rounded-lg bg-gray-900 border border-gray-700"
          />
          <button type="submit" className="px-4 py-3 bg-purple-600 rounded-lg flex items-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </form>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">On Tuneable</h2>
          {catalog.length === 0 ? (
            <p className="text-gray-500 text-sm">No catalogue matches yet.</p>
          ) : (
            <ul className="space-y-3">
              {catalog.map((book) => (
                <li key={book._id}>
                  <button
                    onClick={() => navigate(`/book/${book._id}`)}
                    className="w-full text-left flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-3"
                  >
                    <img src={book.coverArt || DEFAULT_COVER_ART} alt="" className="w-12 h-16 object-cover rounded" />
                    <div>
                      <div className="font-medium">{book.title}</div>
                      <div className="text-sm text-gray-400">
                        {book.creatorDisplay || (book.authors || []).join(', ')}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Open Library</h2>
          {renderDiscovery(openLibrary, 'No Open Library results.')}
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Google Books</h2>
          {googleDisabled ? (
            <p className="text-gray-500 text-sm">Google Books is not configured on this server.</p>
          ) : (
            renderDiscovery(googleBooks, 'No Google Books results.')
          )}
        </section>
      </div>
    </div>
  );
};

export default BookSearch;
