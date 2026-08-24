import { Redirect } from 'expo-router';

/** Book profiles are web-only for now. */
export default function BookProfileScreen() {
  return <Redirect href="/(tabs)" />;
}
