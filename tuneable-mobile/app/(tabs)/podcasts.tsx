import { Redirect } from 'expo-router';

export default function PodcastsRedirect() {
  return (
    <Redirect
      href={{ pathname: '/(tabs)/charts', params: { kind: 'podcasts' } }}
    />
  );
}
