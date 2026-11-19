import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { readLoaderCovers } from '@/src/lib/coverMemory';

const PAGE_SIZE = 112;
const SECTION_SIZE = 80;
const SPIN_MS = 16000;
const TILT = (-22 * Math.PI) / 180;
const START_YAW = -32;

type Axis = 'x' | 'y';

type Sleeve = {
  key: string;
  axis: Axis;
  offset: number;
  colors: readonly [string, string, ...string[]];
  locations: readonly [number, number, ...number[]];
  orb: string;
  line: string;
  turnPhoto?: boolean;
};

const SLEEVES: readonly Sleeve[] = [
  {
    key: 'front',
    axis: 'y',
    offset: 0,
    colors: ['#5b21b6', '#db2777', '#fb7185'],
    locations: [0, 0.72, 1],
    orb: '#f9a8d4',
    line: 'rgba(255,255,255,0.9)',
  },
  {
    key: 'right',
    axis: 'y',
    offset: 90,
    colors: ['#7f1d1d', '#ea580c', '#fde68a'],
    locations: [0, 0.48, 1],
    orb: 'rgba(67, 20, 7, 0.88)',
    line: 'rgba(255,255,255,0.75)',
  },
  {
    key: 'back',
    axis: 'y',
    offset: 180,
    colors: ['#155e75', '#0f172a'],
    locations: [0, 0.78],
    orb: '#67e8f9',
    line: 'rgba(255,255,255,0.8)',
  },
  {
    key: 'left',
    axis: 'y',
    offset: 270,
    colors: ['#292524', '#0c0a09'],
    locations: [0, 0.7],
    orb: 'transparent',
    line: '#fbbf24',
  },
  {
    key: 'top',
    axis: 'x',
    offset: 90,
    colors: ['#fce7f3', '#ddd6fe'],
    locations: [0, 1],
    orb: '#6d28d9',
    line: 'rgba(88, 28, 135, 0.8)',
    turnPhoto: true,
  },
];

function multiply(a: number[], b: number[]): number[] {
  'worklet';
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function rotateX(radians: number): number[] {
  'worklet';
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

function rotateY(radians: number): number[] {
  'worklet';
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

function translateZ(distance: number): number[] {
  'worklet';
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, distance, 1];
}

function perspective(distance: number): number[] {
  'worklet';
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / distance, 0, 0, 0, 1];
}

function faceMatrix(axis: Axis, offsetDeg: number, yawDeg: number, half: number, depth: number): number[] {
  'worklet';
  const local = ((offsetDeg * Math.PI) / 180);
  const yaw = (yawDeg * Math.PI) / 180;
  const placed = multiply(axis === 'y' ? rotateY(local) : rotateX(local), translateZ(half));
  const spun = multiply(rotateY(yaw), placed);
  const tilted = multiply(rotateX(TILT), spun);
  return multiply(perspective(depth), tilted);
}

type FaceProps = {
  sleeve: Sleeve;
  uri?: string;
  size: number;
  yaw: SharedValue<number>;
};

function CubeFace({ sleeve, uri, size, yaw }: FaceProps) {
  const [failed, setFailed] = useState(false);
  const half = size / 2;
  const depth = size * 5.2;
  const animated = useAnimatedStyle(() => ({
    transform: [{ matrix: faceMatrix(sleeve.axis, sleeve.offset, yaw.value, half, depth) }],
  }));
  const showPhoto = Boolean(uri) && !failed;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.face,
        {
          width: size,
          height: size,
          marginLeft: -half,
          marginTop: -half,
        },
        animated,
      ]}>
      <View style={[styles.sleeve, { borderRadius: Math.round(size * 0.06) }]}>
        <LinearGradient
          colors={sleeve.colors}
          locations={sleeve.locations}
          start={{ x: 0.12, y: 0 }}
          end={{ x: 0.88, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.orb,
            {
              backgroundColor: sleeve.orb,
              borderColor: sleeve.key === 'left' ? '#fbbf24' : 'transparent',
              borderWidth: sleeve.key === 'left' ? 2 : 0,
            },
          ]}
        />
        <View style={[styles.line, { backgroundColor: sleeve.line }]} />
        <View style={[styles.lineThin, { backgroundColor: sleeve.line, opacity: 0.55 }]} />
        {showPhoto ? (
          <Image
            source={{ uri }}
            resizeMode="cover"
            fadeDuration={0}
            onError={() => setFailed(true)}
            style={[StyleSheet.absoluteFill, sleeve.turnPhoto && styles.turned]}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

type CubeProps = {
  size: number;
};

export function ArtworkCube({ size }: CubeProps) {
  const yaw = useSharedValue(START_YAW);
  const [photos] = useState(() => readLoaderCovers());

  useEffect(() => {
    yaw.value = withRepeat(
      withTiming(START_YAW + 360, {
        duration: SPIN_MS,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      false,
    );
    return () => cancelAnimation(yaw);
  }, [yaw]);

  return (
    <View
      pointerEvents="none"
      style={[styles.stage, { width: size * 2.05, height: size * 1.9 }]}>
      <View
        style={[
          styles.shadow,
          { width: size * 0.78, height: size * 0.14, bottom: size * 0.12 },
        ]}
      />
      {SLEEVES.map((sleeve, index) => (
        <CubeFace
          key={sleeve.key}
          sleeve={sleeve}
          uri={photos[index]}
          size={size}
          yaw={yaw}
        />
      ))}
    </View>
  );
}

type LoaderProps = {
  size?: 'page' | 'section';
  style?: StyleProp<ViewStyle>;
};

export function ArtworkLoader({ size = 'page', style }: LoaderProps) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      pointerEvents="none"
      style={style}>
      <ArtworkCube size={size === 'section' ? SECTION_SIZE : PAGE_SIZE} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  face: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    backfaceVisibility: 'hidden',
  },
  sleeve: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  orb: {
    position: 'absolute',
    width: '46%',
    height: '46%',
    left: '18%',
    top: '14%',
    borderRadius: 999,
  },
  line: {
    position: 'absolute',
    left: '12%',
    bottom: '16%',
    width: '52%',
    height: 3,
    borderRadius: 99,
  },
  lineThin: {
    position: 'absolute',
    left: '12%',
    bottom: '26%',
    width: '32%',
    height: 2,
    borderRadius: 99,
  },
  turned: {
    transform: [{ rotate: '180deg' }],
  },
});
