import { Redirect } from 'expo-router';

/** Books discovery is web-only for now. */
export default function BooksScreen() {
  return <Redirect href="/(tabs)" />;
}
