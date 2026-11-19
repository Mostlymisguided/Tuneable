import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  bandStops,
  resolveFlagDesign,
  type FlagBand,
  type FlagDesign,
  type FlagDisc,
} from '@/src/lib/flagDesign';

const SIZE = 32;

function gradientPoints(direction: 'horizontal' | 'vertical' | 'diagonal') {
  if (direction === 'vertical') return { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } };
  if (direction === 'diagonal') return { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
  return { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } };
}

function StripeFill({
  direction,
  bands,
}: {
  direction: 'horizontal' | 'vertical' | 'diagonal';
  bands: FlagBand[];
}) {
  if (bands.length <= 1) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: bands[0]?.color ?? 'transparent' }]} />;
  }
  const stops = bandStops(bands);
  const { start, end } = gradientPoints(direction);
  return (
    <LinearGradient
      colors={stops.colors}
      locations={stops.locations}
      start={start}
      end={end}
      style={StyleSheet.absoluteFill}
    />
  );
}

function DiscMark({ disc, size }: { disc: FlagDisc; size: number }) {
  const diameter = size * disc.size;
  const inner = disc.inner;
  const innerDiameter = inner ? size * inner.size : 0;
  return (
    <View
      style={{
        position: 'absolute',
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        backgroundColor: disc.color,
        left: (size - diameter) / 2,
        top: (size - diameter) / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {inner ? (
        <View
          style={{
            width: innerDiameter,
            height: innerDiameter,
            borderRadius: innerDiameter / 2,
            backgroundColor: inner.color,
          }}
        />
      ) : null}
    </View>
  );
}

function CrossBars({
  color,
  thickness,
  size,
  width,
  height,
  inset = 0,
}: {
  color: string;
  thickness: number;
  size?: number;
  width?: number;
  height?: number;
  inset?: number;
}) {
  const boxW = width ?? size ?? 0;
  const boxH = height ?? size ?? 0;
  const thicknessPx = Math.min(boxW, boxH) * thickness;
  const vLength = boxH * (1 - inset * 2);
  const hLength = boxW * (1 - inset * 2);
  return (
    <>
      <View
        style={{
          position: 'absolute',
          width: thicknessPx,
          height: vLength,
          left: (boxW - thicknessPx) / 2,
          top: boxH * inset,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          height: thicknessPx,
          width: hLength,
          top: (boxH - thicknessPx) / 2,
          left: boxW * inset,
          backgroundColor: color,
        }}
      />
    </>
  );
}

function SaltireBars({
  color,
  thickness,
  size,
}: {
  color: string;
  thickness: number;
  size: number;
}) {
  const barWidth = Math.max(2, size * thickness);
  const barHeight = size * 1.7;
  const bar = (deg: `${number}deg`) => (
    <View
      style={{
        position: 'absolute',
        width: barWidth,
        height: barHeight,
        left: (size - barWidth) / 2,
        top: (size - barHeight) / 2,
        backgroundColor: color,
        transform: [{ rotate: deg }],
      }}
    />
  );
  return (
    <>
      {bar('45deg')}
      {bar('-45deg')}
    </>
  );
}

function UnionFill({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, backgroundColor: '#012169', overflow: 'hidden' }}>
      <SaltireBars color="#FFFFFF" thickness={0.2} size={size} />
      <SaltireBars color="#C8102E" thickness={0.09} size={size} />
      <CrossBars color="#FFFFFF" thickness={0.32} size={size} />
      <CrossBars color="#C8102E" thickness={0.16} size={size} />
    </View>
  );
}

function CornerMarks({ color, size }: { color: string; size: number }) {
  const diameter = size * 0.14;
  const spot = (x: number, y: number) => (
    <View
      style={{
        position: 'absolute',
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        backgroundColor: color,
        left: x - diameter / 2,
        top: y - diameter / 2,
      }}
    />
  );
  return (
    <>
      {spot(size * 0.28, size * 0.28)}
      {spot(size * 0.72, size * 0.28)}
      {spot(size * 0.28, size * 0.72)}
      {spot(size * 0.72, size * 0.72)}
    </>
  );
}

function FlagFill({ design, size }: { design: FlagDesign; size: number }) {
  if (design.type === 'stripes') {
    return (
      <View style={{ width: size, height: size }}>
        <StripeFill direction={design.direction} bands={design.bands} />
        {design.bar ? (
          <View
            style={{
              position: 'absolute',
              width: size * (design.bar.thickness ?? 0.18),
              height: size,
              left: (size - size * (design.bar.thickness ?? 0.18)) / 2,
              top: 0,
              backgroundColor: design.bar.color,
            }}
          />
        ) : null}
        {design.disc ? <DiscMark disc={design.disc} size={size} /> : null}
      </View>
    );
  }

  if (design.type === 'hoist') {
    const hoistWidth = size * (design.hoistWeight ?? 0.33);
    return (
      <View style={{ width: size, height: size }}>
        <View style={{ flexDirection: 'row', width: size, height: size }}>
          <View style={{ width: hoistWidth, height: size, backgroundColor: design.hoist }} />
          <View style={{ width: size - hoistWidth, height: size, overflow: 'hidden' }}>
            <StripeFill direction="horizontal" bands={design.bands} />
          </View>
        </View>
        {design.disc ? <DiscMark disc={design.disc} size={size} /> : null}
      </View>
    );
  }

  if (design.type === 'disc') {
    const diameter = size * (design.size ?? 0.5);
    const innerDiameter = size * (design.innerSize ?? 0.25);
    return (
      <View style={{ width: size, height: size, backgroundColor: design.field }}>
        <View
          style={{
            position: 'absolute',
            width: diameter,
            height: diameter,
            borderRadius: diameter / 2,
            backgroundColor: design.disc,
            left: (size - diameter) / 2,
            top: (size - diameter) / 2,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {design.lower ? (
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: diameter / 2,
                backgroundColor: design.lower,
              }}
            />
          ) : null}
          {design.inner ? (
            <View
              style={{
                width: innerDiameter,
                height: innerDiameter,
                borderRadius: innerDiameter / 2,
                backgroundColor: design.inner,
              }}
            />
          ) : null}
        </View>
      </View>
    );
  }

  if (design.type === 'cross') {
    return (
      <View style={{ width: size, height: size, backgroundColor: design.field }}>
        {design.fimbriation ? (
          <CrossBars
            color={design.fimbriation}
            thickness={design.fimbriationThickness ?? 0.34}
            size={size}
            inset={design.inset ?? 0}
          />
        ) : null}
        <CrossBars color={design.cross} thickness={design.thickness ?? 0.2} size={size} inset={design.inset ?? 0} />
        {design.corners ? <CornerMarks color={design.corners} size={size} /> : null}
        {design.disc ? <DiscMark disc={design.disc} size={size} /> : null}
      </View>
    );
  }

  if (design.type === 'saltire') {
    return (
      <View style={{ width: size, height: size, backgroundColor: design.field, overflow: 'hidden' }}>
        <SaltireBars color={design.saltire} thickness={design.thickness ?? 0.18} size={size} />
      </View>
    );
  }

  if (design.type === 'union') return <UnionFill size={size} />;

  if (design.type === 'ensign') {
    const canton = size * 0.52;
    const star = size * 0.18;
    return (
      <View style={{ width: size, height: size, backgroundColor: design.field }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: canton, height: canton, overflow: 'hidden' }}>
          <UnionFill size={canton} />
        </View>
        {design.star ? (
          <View
            style={{
              position: 'absolute',
              width: star,
              height: star,
              borderRadius: star / 2,
              backgroundColor: design.starRing ?? design.star,
              right: size * 0.18,
              bottom: size * 0.24,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {design.starRing ? (
              <View
                style={{
                  width: star * 0.62,
                  height: star * 0.62,
                  borderRadius: star,
                  backgroundColor: design.star,
                }}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  if (design.type === 'canton') {
    const cantonWidth = size * (design.cantonWidth ?? 0.45);
    const cantonHeight = size * (design.cantonHeight ?? 0.54);
    const disc = Math.min(cantonWidth, cantonHeight) * 0.46;
    return (
      <View style={{ width: size, height: size }}>
        <StripeFill direction="horizontal" bands={design.bands} />
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: cantonWidth,
            height: cantonHeight,
            backgroundColor: design.canton,
            overflow: 'hidden',
          }}>
          {design.cantonCross ? (
            <CrossBars color={design.cantonCross} thickness={0.28} width={cantonWidth} height={cantonHeight} />
          ) : null}
          {design.cantonDisc ? (
            <View
              style={{
                position: 'absolute',
                width: disc,
                height: disc,
                borderRadius: disc / 2,
                backgroundColor: design.cantonDisc,
                left: (cantonWidth - disc) / 2,
                top: (cantonHeight - disc) / 2,
              }}
            />
          ) : null}
        </View>
      </View>
    );
  }

  const half = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width: half, height: half, backgroundColor: design.colors[0] }} />
      <View style={{ position: 'absolute', left: half, top: 0, width: half, height: half, backgroundColor: design.colors[1] }} />
      <View style={{ position: 'absolute', left: 0, top: half, width: half, height: half, backgroundColor: design.colors[2] }} />
      <View style={{ position: 'absolute', left: half, top: half, width: half, height: half, backgroundColor: design.colors[3] }} />
      {design.cross ? <CrossBars color={design.cross} thickness={0.16} size={size} /> : null}
    </View>
  );
}

function RankNum({ rank }: { rank: number }) {
  const fontSize = rank >= 100 ? 11 : 13;
  const glyph = { fontSize, fontWeight: '800' as const };
  return (
    <View style={styles.rankWrap} pointerEvents="none">
      <View>
        {([-1, 1] as const).map((dx) => (
          <Text
            key={`x${dx}`}
            accessible={false}
            importantForAccessibility="no"
            style={[styles.rankShadow, glyph, { left: dx, top: 0 }]}>
            {rank}
          </Text>
        ))}
        {([-1, 1] as const).map((dy) => (
          <Text
            key={`y${dy}`}
            accessible={false}
            importantForAccessibility="no"
            style={[styles.rankShadow, glyph, { left: 0, top: dy }]}>
            {rank}
          </Text>
        ))}
        <Text style={[styles.rank, glyph]}>{rank}</Text>
      </View>
    </View>
  );
}

export function FlagRankBadge({
  rank,
  countryCode,
  countryName,
}: {
  rank: number;
  countryCode?: string | null;
  countryName?: string | null;
}) {
  const design = resolveFlagDesign(countryCode, countryName);

  return (
    <View
      style={[styles.badge, !design && styles.fallback]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {design ? (
        <View style={styles.fill} pointerEvents="none">
          <FlagFill design={design} size={SIZE} />
        </View>
      ) : null}
      <View pointerEvents="none" style={styles.ring} />
      <RankNum rank={rank} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.4)',
  },
  rankWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: {
    color: '#fff',
  },
  rankShadow: {
    position: 'absolute',
    color: 'rgba(0,0,0,0.9)',
  },
});
