import {
  bandGradientCss,
  resolveFlagDesign,
  type FlagDesign,
  type FlagDisc,
} from '../utils/flagDesign';

const RANK_SHADOW =
  '0 0 2px rgba(0,0,0,0.95), 1px 0 0 rgba(0,0,0,0.8), -1px 0 0 rgba(0,0,0,0.8), 0 1px 0 rgba(0,0,0,0.8), 0 -1px 0 rgba(0,0,0,0.8)';

function bandsBackground(
  direction: 'horizontal' | 'vertical' | 'diagonal',
  bands: { color: string; weight?: number }[]
): { backgroundColor?: string; backgroundImage?: string } {
  if (bands.length <= 1) return { backgroundColor: bands[0]?.color ?? 'transparent' };
  return { backgroundImage: bandGradientCss(direction, bands) };
}

function DiscMark({ disc }: { disc: FlagDisc }) {
  return (
    <span
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        width: `${disc.size * 100}%`,
        height: `${disc.size * 100}%`,
        backgroundColor: disc.color,
      }}
    >
      {disc.inner ? (
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: `${(disc.inner.size / disc.size) * 100}%`,
            height: `${(disc.inner.size / disc.size) * 100}%`,
            backgroundColor: disc.inner.color,
          }}
        />
      ) : null}
    </span>
  );
}

function CrossBars({
  color,
  thickness,
  inset = 0,
}: {
  color: string;
  thickness: number;
  inset?: number;
}) {
  const start = `${inset * 100}%`;
  const length = `${(1 - inset * 2) * 100}%`;
  const t = `${thickness * 100}%`;
  const offset = `${((1 - thickness) / 2) * 100}%`;
  return (
    <>
      <span className="absolute" style={{ backgroundColor: color, width: t, height: length, left: offset, top: start }} />
      <span className="absolute" style={{ backgroundColor: color, height: t, width: length, top: offset, left: start }} />
    </>
  );
}

function SaltireBars({ color, thickness }: { color: string; thickness: number }) {
  const bar = (rotate: string) => (
    <span
      className="absolute"
      style={{
        width: `${thickness * 100}%`,
        height: '170%',
        left: '50%',
        top: '50%',
        backgroundColor: color,
        transform: `translate(-50%, -50%) rotate(${rotate})`,
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

function UnionFill() {
  return (
    <span className="absolute inset-0" style={{ backgroundColor: '#012169' }}>
      <SaltireBars color="#FFFFFF" thickness={0.2} />
      <SaltireBars color="#C8102E" thickness={0.09} />
      <CrossBars color="#FFFFFF" thickness={0.32} />
      <CrossBars color="#C8102E" thickness={0.16} />
    </span>
  );
}

function CornerMarks({ color }: { color: string }) {
  const spot = (left: string, top: string) => (
    <span
      className="absolute rounded-full"
      style={{
        width: '14%',
        height: '14%',
        left,
        top,
        backgroundColor: color,
        transform: 'translate(-50%, -50%)',
      }}
    />
  );
  return (
    <>
      {spot('28%', '28%')}
      {spot('72%', '28%')}
      {spot('28%', '72%')}
      {spot('72%', '72%')}
    </>
  );
}

function FlagFill({ design }: { design: FlagDesign }) {
  if (design.type === 'stripes') {
    return (
      <span className="absolute inset-0" style={bandsBackground(design.direction, design.bands)}>
        {design.bar ? (
          <span
            className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2"
            style={{
              width: `${(design.bar.thickness ?? 0.18) * 100}%`,
              backgroundColor: design.bar.color,
            }}
          />
        ) : null}
        {design.disc ? <DiscMark disc={design.disc} /> : null}
      </span>
    );
  }

  if (design.type === 'hoist') {
    const hoist = `${(design.hoistWeight ?? 0.33) * 100}%`;
    return (
      <span className="absolute inset-0">
        <span className="absolute inset-0 flex">
          <span style={{ width: hoist, backgroundColor: design.hoist }} />
          <span className="flex-1" style={bandsBackground('horizontal', design.bands)} />
        </span>
        {design.disc ? <DiscMark disc={design.disc} /> : null}
      </span>
    );
  }

  if (design.type === 'disc') {
    const size = `${(design.size ?? 0.5) * 100}%`;
    return (
      <span className="absolute inset-0" style={{ backgroundColor: design.field }}>
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
          style={{ width: size, height: size, backgroundColor: design.disc }}
        >
          {design.lower ? <span className="absolute inset-x-0 bottom-0 h-1/2" style={{ backgroundColor: design.lower }} /> : null}
          {design.inner ? (
            <span
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: `${((design.innerSize ?? 0.25) / (design.size ?? 0.5)) * 100}%`,
                height: `${((design.innerSize ?? 0.25) / (design.size ?? 0.5)) * 100}%`,
                backgroundColor: design.inner,
              }}
            />
          ) : null}
        </span>
      </span>
    );
  }

  if (design.type === 'cross') {
    return (
      <span className="absolute inset-0" style={{ backgroundColor: design.field }}>
        {design.fimbriation ? (
          <CrossBars color={design.fimbriation} thickness={design.fimbriationThickness ?? 0.34} inset={design.inset ?? 0} />
        ) : null}
        <CrossBars color={design.cross} thickness={design.thickness ?? 0.2} inset={design.inset ?? 0} />
        {design.corners ? <CornerMarks color={design.corners} /> : null}
        {design.disc ? <DiscMark disc={design.disc} /> : null}
      </span>
    );
  }

  if (design.type === 'saltire') {
    return (
      <span className="absolute inset-0" style={{ backgroundColor: design.field }}>
        <SaltireBars color={design.saltire} thickness={design.thickness ?? 0.18} />
      </span>
    );
  }

  if (design.type === 'union') return <UnionFill />;

  if (design.type === 'ensign') {
    return (
      <span className="absolute inset-0" style={{ backgroundColor: design.field }}>
        <span className="absolute left-0 top-0 h-[52%] w-[52%] overflow-hidden">
          <UnionFill />
        </span>
        {design.star ? (
          <span
            className="absolute rounded-full"
            style={{
              width: '18%',
              height: '18%',
              right: '18%',
              bottom: '24%',
              backgroundColor: design.starRing ?? design.star,
            }}
          >
            {design.starRing ? (
              <span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ width: '62%', height: '62%', backgroundColor: design.star }}
              />
            ) : null}
          </span>
        ) : null}
      </span>
    );
  }

  if (design.type === 'canton') {
    return (
      <span className="absolute inset-0" style={bandsBackground('horizontal', design.bands)}>
        <span
          className="absolute left-0 top-0 overflow-hidden"
          style={{
            width: `${(design.cantonWidth ?? 0.45) * 100}%`,
            height: `${(design.cantonHeight ?? 0.54) * 100}%`,
            backgroundColor: design.canton,
          }}
        >
          {design.cantonCross ? <CrossBars color={design.cantonCross} thickness={0.28} /> : null}
          {design.cantonDisc ? (
            <span
              className="absolute left-1/2 top-1/2 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ backgroundColor: design.cantonDisc }}
            />
          ) : null}
        </span>
      </span>
    );
  }

  return (
    <span className="absolute inset-0">
      <span className="absolute left-0 top-0 h-1/2 w-1/2" style={{ backgroundColor: design.colors[0] }} />
      <span className="absolute right-0 top-0 h-1/2 w-1/2" style={{ backgroundColor: design.colors[1] }} />
      <span className="absolute bottom-0 left-0 h-1/2 w-1/2" style={{ backgroundColor: design.colors[2] }} />
      <span className="absolute bottom-0 right-0 h-1/2 w-1/2" style={{ backgroundColor: design.colors[3] }} />
      {design.cross ? <CrossBars color={design.cross} thickness={0.16} /> : null}
    </span>
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
    <span
      className={`relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full ${
        design ? '' : 'bg-purple-700/60'
      }`}
    >
      {design ? (
        <span className="pointer-events-none absolute inset-0" aria-hidden>
          <FlagFill design={design} />
        </span>
      ) : null}
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4)' }}
        aria-hidden
      />
      <span
        className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums leading-none text-white ${
          rank >= 100 ? 'text-[10px]' : 'text-sm'
        }`}
        style={{ textShadow: RANK_SHADOW }}
      >
        {rank}
      </span>
    </span>
  );
}
