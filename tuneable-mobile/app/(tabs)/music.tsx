import { Redirect } from 'expo-router';

export default function MusicRedirect() {
  return (
    <Redirect href={{ pathname: '/(tabs)/charts', params: { kind: 'music' } }} />
  );
}
