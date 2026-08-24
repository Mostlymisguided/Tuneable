import { Redirect } from 'expo-router';

/** Books discovery is web-only for now. */
export default function BookSearchScreen() {
  return <Redirect href="/(tabs)" />;
}
