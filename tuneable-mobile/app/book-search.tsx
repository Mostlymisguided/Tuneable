import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { BookRow } from '@/src/components/BookRow';
import { booksAPI, type BookRecord, type DiscoveryBook } from '@/src/api/books';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { colors } from '@/src/theme/colors';

function authorLine(book: { authors?: string[]; creatorDisplay?: string | null }): string {
  if (book.creatorDisplay) return book.creatorDisplay;
  if (book.authors?.length) return book.authors.join(', ');
  return 'Unknown author';
}

export default function BookSearchScreen() {
  const { user } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<BookRecord[]>([]);
  const [openLibrary, setOpenLibrary] = useState<DiscoveryBook[]>([]);
  const [googleBooks, setGoogleBooks] = useState<DiscoveryBook[]>([]);
  const [googleDisabled, setGoogleDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importingKey, setImportingKey] = useState<string | null>(null);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      Alert.alert('Search', 'Enter at least 2 characters.');
      return;
    }
    setLoading(true);
    try {
      const [local, ol, gb] = await Promise.all([
        booksAPI.searchCatalog(q).catch(() => ({ books: [] as BookRecord[] })),
        booksAPI.searchOpenLibrary(q).catch(() => ({ books: [] as DiscoveryBook[] })),
        booksAPI.searchGoogleBooks(q).catch(() => ({ books: [] as DiscoveryBook[], disabled: true })),
      ]);
      setCatalog(local.books || []);
      setOpenLibrary(ol.books || []);
      setGoogleBooks(gb.books || []);
      setGoogleDisabled(Boolean(gb.disabled));
    } catch (err) {
      Alert.alert('Search failed', err instanceof Error ? err.message : 'Try again');
    } finally {
      setLoading(false);
    }
  };

  const importBook = async (book: DiscoveryBook) => {
    if (!user) {
      Alert.alert('Log in', 'Log in to add a book to the catalogue.');
      router.push('/login');
      return;
    }
    const key = book.openLibraryKey || book.googleBooksId || book.isbn || book.title;
    setImportingKey(key || book.title);
    try {
      const result = await booksAPI.importBook({
        ...book,
        source: book.source || (book.googleBooksId ? 'googleBooks' : 'openLibrary'),
      });
      router.push(`/book/${result.book._id}`);
    } catch (err) {
      Alert.alert('Import failed', err instanceof Error ? err.message : 'Could not add this book');
    } finally {
      setImportingKey(null);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(96, contentPaddingBottom + 24) }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Find books</Text>
        <Text style={styles.subtitle}>
          Search Tuneable’s catalogue, then Open Library (and Google Books when configured).
        </Text>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Title, author, or ISBN"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => void runSearch()}
          />
          <Pressable style={styles.searchBtn} onPress={() => void runSearch()}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="search" size={18} color="#fff" />
            )}
          </Pressable>
        </View>

        <Text style={styles.section}>On Tuneable</Text>
        {catalog.length === 0 ? (
          <Text style={styles.empty}>No catalogue matches yet.</Text>
        ) : (
          catalog.map((book) => (
            <BookRow
              key={book._id}
              title={book.title}
              subtitle={authorLine(book)}
              coverArt={book.coverArt}
              isbn={book.isbn}
              onPress={() => router.push(`/book/${book._id}`)}
            />
          ))
        )}

        <Text style={styles.section}>Open Library</Text>
        {openLibrary.length === 0 ? (
          <Text style={styles.empty}>No Open Library results.</Text>
        ) : (
          openLibrary.map((book) => {
            const key = book.openLibraryKey || `${book.title}-${book.isbn}`;
            return (
              <BookRow
                key={key}
                title={book.title}
                subtitle={authorLine(book)}
                coverArt={book.coverArt}
                isbn={book.isbn}
                actionLabel="Add"
                actionBusy={importingKey === key}
                onPress={() => void importBook(book)}
                onAction={() => void importBook(book)}
              />
            );
          })
        )}

        <Text style={styles.section}>Google Books</Text>
        {googleDisabled ? (
          <Text style={styles.empty}>Google Books is not configured on this server.</Text>
        ) : googleBooks.length === 0 ? (
          <Text style={styles.empty}>No Google Books results.</Text>
        ) : (
          googleBooks.map((book) => {
            const key = book.googleBooksId || `${book.title}-${book.isbn}`;
            return (
              <BookRow
                key={key}
                title={book.title}
                subtitle={authorLine(book)}
                coverArt={book.coverArt}
                isbn={book.isbn}
                actionLabel="Add"
                actionBusy={importingKey === key}
                onPress={() => void importBook(book)}
                onAction={() => void importBook(book)}
              />
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, marginTop: 6, marginBottom: 14, lineHeight: 20 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  searchBtn: {
    width: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  empty: { color: colors.textMuted, fontSize: 13, marginBottom: 12 },
});
