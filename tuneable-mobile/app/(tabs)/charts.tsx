import { useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import {
  getLastChartKind,
  normalizeChartKind,
  rememberChartKind,
  type ChartMediaKind,
} from '@/src/lib/chartKind';
import { BookChartScreen } from '@/src/screens/BookChartScreen';
import { MusicChartScreen } from '@/src/screens/MusicChartScreen';
import { PodcastChartScreen } from '@/src/screens/PodcastChartScreen';

export default function ChartsScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string | string[] }>();
  const raw = Array.isArray(kindParam) ? kindParam[0] : kindParam;
  const kind = raw ? normalizeChartKind(raw) : getLastChartKind();

  useEffect(() => {
    rememberChartKind(kind);
  }, [kind]);

  const onChartKindChange = (next: ChartMediaKind) => {
    rememberChartKind(next);
    router.setParams({ kind: next });
  };

  if (kind === 'podcasts') {
    return <PodcastChartScreen onChartKindChange={onChartKindChange} />;
  }
  if (kind === 'books') {
    return <BookChartScreen onChartKindChange={onChartKindChange} />;
  }
  return <MusicChartScreen onChartKindChange={onChartKindChange} />;
}
