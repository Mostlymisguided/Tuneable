/**
 * Small-size flag layouts for place rank badges.
 * Colours follow each country's flag, in the same arrangement (stripes, cross,
 * canton, and so on) so the badge reads as that flag rather than one flat colour.
 */

export type FlagBand = { color: string; weight?: number };

export type FlagDisc = {
  color: string;
  /** Diameter as a fraction of the badge. */
  size: number;
  inner?: { color: string; size: number };
};

export type FlagDesign =
  | {
      type: 'stripes';
      direction: 'horizontal' | 'vertical' | 'diagonal';
      bands: FlagBand[];
      disc?: FlagDisc;
      /** Centered vertical bar (Central African Republic). */
      bar?: { color: string; thickness?: number };
    }
  | {
      type: 'hoist';
      hoist: string;
      hoistWeight?: number;
      bands: FlagBand[];
      disc?: FlagDisc;
    }
  | {
      type: 'disc';
      field: string;
      disc: string;
      size?: number;
      inner?: string;
      innerSize?: number;
      /** Bottom half of the disc, for the South Korean taegeuk. */
      lower?: string;
    }
  | {
      type: 'cross';
      field: string;
      cross: string;
      thickness?: number;
      fimbriation?: string;
      fimbriationThickness?: number;
      /** Empty margin around the cross, for the Swiss flag. */
      inset?: number;
      corners?: string;
      disc?: FlagDisc;
    }
  | { type: 'saltire'; field: string; saltire: string; thickness?: number }
  | { type: 'union' }
  | { type: 'ensign'; field: string; star?: string; starRing?: string }
  | {
      type: 'canton';
      bands: FlagBand[];
      canton: string;
      cantonWidth?: number;
      cantonHeight?: number;
      cantonCross?: string;
      cantonDisc?: string;
    }
  | {
      type: 'quarters';
      /** Top-left, top-right, bottom-left, bottom-right. */
      colors: [string, string, string, string];
      cross?: string;
    };

function C(color: string, weight?: number): FlagBand {
  return weight === undefined ? { color } : { color, weight };
}

function h(...colors: string[]): FlagDesign {
  return { type: 'stripes', direction: 'horizontal', bands: colors.map((color) => ({ color })) };
}

function v(...colors: string[]): FlagDesign {
  return { type: 'stripes', direction: 'vertical', bands: colors.map((color) => ({ color })) };
}

function hw(...bands: FlagBand[]): FlagDesign {
  return { type: 'stripes', direction: 'horizontal', bands };
}

function vw(...bands: FlagBand[]): FlagDesign {
  return { type: 'stripes', direction: 'vertical', bands };
}

function diag(...bands: FlagBand[]): FlagDesign {
  return { type: 'stripes', direction: 'diagonal', bands };
}

function hd(design: FlagDesign, disc: FlagDisc): FlagDesign {
  if (design.type === 'stripes' || design.type === 'hoist') return { ...design, disc };
  return design;
}

const FLAG_DESIGNS: Record<string, FlagDesign> = {
  AD: v('#0018A8', '#FEDF00', '#C8102E'),
  AE: { type: 'hoist', hoist: '#FF0000', hoistWeight: 0.28, bands: [C('#00732F'), C('#FFFFFF'), C('#000000')] },
  // Black, red, and green vertical tricolour.
  AF: v('#000000', '#D32011', '#007A36'),
  AG: hw(C('#000000'), C('#0072C6'), C('#FFFFFF'), C('#FCD116', 0.7), C('#CE1126', 1.3)),
  AL: { type: 'disc', field: '#E41E20', disc: '#000000', size: 0.42 },
  AM: h('#D90012', '#0033A0', '#F2A800'),
  AO: hd(h('#CC0000', '#000000'), { color: '#FFCB00', size: 0.3 }),
  AR: hd(h('#74ACDF', '#FFFFFF', '#74ACDF'), { color: '#F6B40E', size: 0.26 }),
  AT: h('#ED2939', '#FFFFFF', '#ED2939'),
  AU: { type: 'ensign', field: '#012169', star: '#FFFFFF' },
  AZ: hd(h('#00B5E2', '#EF3340', '#3F9C35'), { color: '#FFFFFF', size: 0.18 }),
  BA: diag(C('#002395', 1.6), C('#FECB00'), C('#FFFFFF', 0.4)),
  BB: v('#00267F', '#FFC726', '#00267F'),
  BD: { type: 'disc', field: '#006A4E', disc: '#F42A41', size: 0.56 },
  BE: v('#000000', '#FDDA24', '#EF3340'),
  BF: hd(h('#EF2B2D', '#009E49'), { color: '#FCD116', size: 0.26 }),
  BG: h('#FFFFFF', '#00966E', '#D62612'),
  BH: v('#FFFFFF', '#CE1126'),
  BI: h('#CE1126', '#FFFFFF', '#1EB53A'),
  BJ: { type: 'hoist', hoist: '#008751', hoistWeight: 0.4, bands: [C('#FCD116'), C('#E8112D')] },
  BN: hd(diag(C('#F7E017', 2.6), C('#000000', 0.45), C('#FFFFFF', 0.4), C('#F7E017', 2.6)), { color: '#CF1126', size: 0.22 }),
  BO: h('#D52B1E', '#F9E300', '#007934'),
  BR: { type: 'disc', field: '#009C3B', disc: '#FFDF00', size: 0.82, inner: '#002776', innerSize: 0.44 },
  BS: { type: 'hoist', hoist: '#000000', hoistWeight: 0.32, bands: [C('#00778B'), C('#FFC72C'), C('#00778B')] },
  BT: diag(C('#FFD520'), C('#FF4E12')),
  BW: hw(C('#75AADB', 3.2), C('#FFFFFF', 0.55), C('#000000', 1.15), C('#FFFFFF', 0.55), C('#75AADB', 3.2)),
  BY: { type: 'hoist', hoist: '#FFFFFF', hoistWeight: 0.16, bands: [C('#CF101A'), C('#007D36')] },
  BZ: hd(hw(C('#CE1126', 0.75), C('#003F87', 4), C('#CE1126', 0.75)), { color: '#FFFFFF', size: 0.4 }),
  CA: v('#FF0000', '#FFFFFF', '#FF0000'),
  CD: diag(C('#007FFF', 2), C('#F7D618', 0.4), C('#CE1021'), C('#F7D618', 0.4), C('#007FFF', 2)),
  CF: {
    type: 'stripes',
    direction: 'horizontal',
    bands: [C('#003082'), C('#FFFFFF'), C('#289728'), C('#FFCE00')],
    bar: { color: '#D21034', thickness: 0.18 },
    disc: { color: '#FFCE00', size: 0.16 },
  },
  CG: diag(C('#009543', 2.2), C('#FBDE4A', 1.1), C('#009543', 2.2)),
  CH: { type: 'cross', field: '#FF0000', cross: '#FFFFFF', thickness: 0.2, inset: 0.18 },
  CI: v('#F77F00', '#FFFFFF', '#009E60'),
  CL: {
    type: 'canton',
    bands: [C('#FFFFFF'), C('#D52B1E')],
    canton: '#0039A6',
    cantonDisc: '#FFFFFF',
    cantonWidth: 0.36,
    cantonHeight: 0.5,
  },
  CM: hd(v('#007A5E', '#CE1126', '#FCD116'), { color: '#FCD116', size: 0.2 }),
  CN: { type: 'disc', field: '#DE2910', disc: '#FFDE00', size: 0.36 },
  CO: hw(C('#FCD116', 2), C('#003893'), C('#CE1126')),
  CR: hw(C('#002B7F'), C('#FFFFFF'), C('#CE1126', 2), C('#FFFFFF'), C('#002B7F')),
  CU: {
    type: 'hoist',
    hoist: '#CB1515',
    hoistWeight: 0.32,
    bands: [C('#002A8F'), C('#FFFFFF'), C('#002A8F'), C('#FFFFFF'), C('#002A8F')],
    disc: { color: '#FFFFFF', size: 0.14 },
  },
  CV: hd(hw(C('#003893', 5), C('#FFFFFF', 0.4), C('#CF2027', 0.75), C('#FFFFFF', 0.4)), { color: '#F7D116', size: 0.22 }),
  CY: hd(hw(C('#FFFFFF', 5), C('#2E7D32', 0.75)), { color: '#C67C2A', size: 0.42 }),
  CZ: { type: 'hoist', hoist: '#11457E', hoistWeight: 0.36, bands: [C('#FFFFFF'), C('#D7141A')] },
  DE: h('#000000', '#DD0000', '#FFCE00'),
  DJ: {
    type: 'hoist',
    hoist: '#FFFFFF',
    hoistWeight: 0.36,
    bands: [C('#6AB2E7'), C('#12AD2B')],
    disc: { color: '#D7141A', size: 0.16 },
  },
  DK: { type: 'cross', field: '#C60C30', cross: '#FFFFFF', thickness: 0.16 },
  DM: {
    type: 'cross',
    field: '#009A44',
    cross: '#000000',
    fimbriation: '#FCD116',
    thickness: 0.12,
    fimbriationThickness: 0.28,
    disc: { color: '#D21034', size: 0.34 },
  },
  DO: { type: 'quarters', colors: ['#002D62', '#CE1126', '#CE1126', '#002D62'], cross: '#FFFFFF' },
  DZ: hd(v('#006233', '#FFFFFF'), { color: '#D21034', size: 0.26 }),
  EC: hw(C('#FCD116', 2), C('#034EA2'), C('#ED1C24')),
  EE: h('#0072CE', '#000000', '#FFFFFF'),
  EG: hd(h('#CE1126', '#FFFFFF', '#000000'), { color: '#C5A572', size: 0.22 }),
  ER: { type: 'hoist', hoist: '#E31B23', hoistWeight: 0.38, bands: [C('#12AD2B'), C('#4189DD')] },
  ES: hw(C('#AA151B'), C('#F1BF00', 2), C('#AA151B')),
  ET: hd(h('#078930', '#FCDD09', '#DA121A'), { color: '#0F47AF', size: 0.18 }),
  FI: { type: 'cross', field: '#FFFFFF', cross: '#003580', thickness: 0.18 },
  FJ: { type: 'ensign', field: '#62B5E5' },
  FM: { type: 'disc', field: '#75B2DD', disc: '#FFFFFF', size: 0.18 },
  FR: v('#0055A4', '#FFFFFF', '#EF4135'),
  GA: h('#009E60', '#FCD116', '#3A75C4'),
  GB: { type: 'union' },
  'GB-ENG': { type: 'cross', field: '#FFFFFF', cross: '#CF142B', thickness: 0.2 },
  'GB-SCT': { type: 'saltire', field: '#005EB8', saltire: '#FFFFFF', thickness: 0.18 },
  'GB-WLS': hw(C('#FFFFFF'), C('#C8102E', 0.85), C('#00843D')),
  GD: hd(hw(C('#CE1126', 0.4), C('#007A5E'), C('#FCD116'), C('#007A5E'), C('#CE1126', 0.4)), { color: '#CE1126', size: 0.16 }),
  GE: { type: 'cross', field: '#FFFFFF', cross: '#FF0000', thickness: 0.16, corners: '#FF0000' },
  GH: hd(h('#CE1126', '#FCD116', '#006B3F'), { color: '#000000', size: 0.2 }),
  GM: hw(C('#CE1126'), C('#FFFFFF', 0.32), C('#0C1C8C'), C('#FFFFFF', 0.32), C('#3A7728')),
  GN: v('#CE1126', '#FCD116', '#009460'),
  GQ: { type: 'hoist', hoist: '#0073CE', hoistWeight: 0.28, bands: [C('#3E9A00'), C('#FFFFFF'), C('#E32118')] },
  GR: {
    type: 'canton',
    bands: [C('#0D5EAF'), C('#FFFFFF'), C('#0D5EAF'), C('#FFFFFF'), C('#0D5EAF'), C('#FFFFFF'), C('#0D5EAF'), C('#FFFFFF'), C('#0D5EAF')],
    canton: '#0D5EAF',
    cantonCross: '#FFFFFF',
    cantonWidth: 0.4,
    cantonHeight: 0.56,
  },
  GT: v('#4997D0', '#FFFFFF', '#4997D0'),
  GW: {
    type: 'hoist',
    hoist: '#CE1126',
    hoistWeight: 0.33,
    bands: [C('#FCD116'), C('#009E49')],
    disc: { color: '#000000', size: 0.16 },
  },
  GY: diag(
    C('#009E49', 1.3),
    C('#FFFFFF', 0.18),
    C('#FCD116', 0.65),
    C('#FFFFFF', 0.14),
    C('#CE1126'),
    C('#FFFFFF', 0.14),
    C('#FCD116', 0.65),
    C('#FFFFFF', 0.18),
    C('#009E49', 1.3)
  ),
  HN: hd(h('#0073CF', '#FFFFFF', '#0073CF'), { color: '#0073CF', size: 0.14 }),
  HR: h('#FF0000', '#FFFFFF', '#171796'),
  HT: h('#00209F', '#D21034'),
  HU: h('#CE2939', '#FFFFFF', '#477050'),
  ID: h('#CE1126', '#FFFFFF'),
  IE: v('#169B62', '#FFFFFF', '#FF883E'),
  IL: hw(C('#FFFFFF', 1.3), C('#0038B8', 0.5), C('#FFFFFF', 2.2), C('#0038B8', 0.5), C('#FFFFFF', 1.3)),
  IN: hd(h('#FF9933', '#FFFFFF', '#138808'), { color: '#000080', size: 0.2 }),
  IQ: hd(h('#CE1126', '#FFFFFF', '#000000'), { color: '#007A3D', size: 0.18 }),
  IR: hd(h('#239F40', '#FFFFFF', '#DA0000'), { color: '#DA0000', size: 0.16 }),
  IS: {
    type: 'cross',
    field: '#02529C',
    cross: '#DC1E35',
    fimbriation: '#FFFFFF',
    thickness: 0.12,
    fimbriationThickness: 0.26,
  },
  IT: v('#009246', '#FFFFFF', '#CE2B37'),
  JM: diag(C('#009B3A', 2), C('#FED100', 0.45), C('#000000', 2)),
  JO: {
    type: 'hoist',
    hoist: '#CE1126',
    hoistWeight: 0.32,
    bands: [C('#000000'), C('#FFFFFF'), C('#007A3D')],
    disc: { color: '#FFFFFF', size: 0.14 },
  },
  JP: { type: 'disc', field: '#FFFFFF', disc: '#BC002D', size: 0.6 },
  KE: hw(C('#000000', 1.3), C('#FFFFFF', 0.26), C('#BB0000', 1.3), C('#FFFFFF', 0.26), C('#006600', 1.3)),
  KG: { type: 'disc', field: '#E8112D', disc: '#FFEF00', size: 0.55 },
  KH: hd(hw(C('#032EA1'), C('#DE2010', 2), C('#032EA1')), { color: '#FFFFFF', size: 0.26 }),
  KI: hw(C('#C8102E', 1.1), C('#FCD116', 0.45), C('#003F87', 1.5)),
  KM: {
    type: 'hoist',
    hoist: '#3A7728',
    hoistWeight: 0.32,
    bands: [C('#FFC61E'), C('#FFFFFF'), C('#CE1126'), C('#3A75C4')],
    disc: { color: '#FFFFFF', size: 0.18 },
  },
  KN: diag(C('#009739', 2), C('#FCD116', 0.32), C('#C8102E', 0.75), C('#FCD116', 0.32), C('#000000', 2)),
  KP: hd(hw(C('#024FA2'), C('#FFFFFF', 0.22), C('#ED1C27', 2.2), C('#FFFFFF', 0.22), C('#024FA2')), {
    color: '#FFFFFF',
    size: 0.32,
    inner: { color: '#ED1C27', size: 0.14 },
  }),
  KR: { type: 'disc', field: '#FFFFFF', disc: '#CD2E3A', lower: '#0047A0', size: 0.58 },
  KW: { type: 'hoist', hoist: '#000000', hoistWeight: 0.28, bands: [C('#007A3D'), C('#FFFFFF'), C('#CE1126')] },
  KZ: {
    type: 'stripes',
    direction: 'vertical',
    bands: [C('#FEC50C', 0.5), C('#00AFCA', 8)],
    disc: { color: '#FEC50C', size: 0.34 },
  },
  LA: hd(hw(C('#CE1126'), C('#002868', 2), C('#CE1126')), { color: '#FFFFFF', size: 0.32 }),
  LB: hd(h('#ED1C24', '#FFFFFF', '#ED1C24'), { color: '#007A3D', size: 0.22 }),
  LC: { type: 'disc', field: '#66CCFF', disc: '#FCD116', size: 0.5, inner: '#000000', innerSize: 0.28 },
  LI: hd(h('#002B7F', '#CE1126'), { color: '#FFD100', size: 0.16 }),
  LK: vw(C('#FFB700', 0.35), C('#00534E'), C('#EB7400'), C('#8D153A', 4), C('#FFB700', 0.35)),
  LR: {
    type: 'canton',
    bands: [C('#BF0A30'), C('#FFFFFF'), C('#BF0A30'), C('#FFFFFF'), C('#BF0A30'), C('#FFFFFF'), C('#BF0A30')],
    canton: '#002868',
    cantonDisc: '#FFFFFF',
    cantonWidth: 0.4,
    cantonHeight: 0.5,
  },
  LS: hd(h('#00209F', '#FFFFFF', '#009543'), { color: '#000000', size: 0.2 }),
  LT: h('#FDB913', '#006A44', '#C1272D'),
  LU: h('#ED2939', '#FFFFFF', '#00A1DE'),
  LV: hw(C('#9E3039', 2), C('#FFFFFF'), C('#9E3039', 2)),
  LY: hd(h('#E70013', '#000000', '#239E46'), { color: '#FFFFFF', size: 0.2 }),
  MA: { type: 'disc', field: '#C1272D', disc: '#006233', size: 0.42 },
  MC: h('#CE1126', '#FFFFFF'),
  MD: hd(v('#003DA5', '#FFD200', '#C8102E'), { color: '#8C6239', size: 0.16 }),
  ME: { type: 'disc', field: '#C40308', disc: '#D4AF37', size: 0.5 },
  MG: { type: 'hoist', hoist: '#FFFFFF', hoistWeight: 0.33, bands: [C('#FC3D32'), C('#007E3A')] },
  MH: hd(diag(C('#003893', 2.2), C('#FFFFFF', 0.28), C('#DD7500', 0.55), C('#003893', 2.2)), { color: '#FFFFFF', size: 0.14 }),
  MK: { type: 'disc', field: '#CE2028', disc: '#F8E600', size: 0.62 },
  ML: v('#14B53A', '#FCD116', '#CE1126'),
  MM: hd(h('#FECB00', '#34B233', '#EA2839'), { color: '#FFFFFF', size: 0.2 }),
  MN: hd(v('#DA2032', '#0066B3', '#DA2032'), { color: '#FFD900', size: 0.22 }),
  MO: { type: 'disc', field: '#067662', disc: '#FFFFFF', size: 0.42 },
  MR: hd(hw(C('#D01C1F', 0.7), C('#00A95C', 3), C('#D01C1F', 0.7)), { color: '#FFD700', size: 0.28 }),
  MT: v('#FFFFFF', '#CF142B'),
  MU: h('#EA2839', '#1A206D', '#FFD500', '#00A551'),
  MV: { type: 'disc', field: '#D21034', disc: '#007E3A', size: 0.72, inner: '#FFFFFF', innerSize: 0.34 },
  MW: h('#000000', '#CE1126', '#339E35'),
  MX: v('#006847', '#FFFFFF', '#CE1126'),
  MY: {
    type: 'canton',
    bands: [C('#CC0001'), C('#FFFFFF'), C('#CC0001'), C('#FFFFFF'), C('#CC0001'), C('#FFFFFF'), C('#CC0001'), C('#FFFFFF')],
    canton: '#0032A0',
    cantonDisc: '#FFD100',
    cantonWidth: 0.5,
    cantonHeight: 0.5,
  },
  MZ: {
    type: 'hoist',
    hoist: '#D21034',
    hoistWeight: 0.32,
    bands: [C('#009639', 1.2), C('#FFFFFF', 0.2), C('#000000', 1.2), C('#FFFFFF', 0.2), C('#FCE100', 1.2)],
    disc: { color: '#FCE100', size: 0.16 },
  },
  NA: hd(diag(C('#003580', 2), C('#FFFFFF', 0.26), C('#C8102E', 0.7), C('#FFFFFF', 0.26), C('#009543', 2)), { color: '#FFD100', size: 0.18 }),
  NE: hd(h('#E05206', '#FFFFFF', '#0DB02B'), { color: '#E05206', size: 0.22 }),
  NG: v('#008751', '#FFFFFF', '#008751'),
  NI: h('#0067C6', '#FFFFFF', '#0067C6'),
  NL: h('#AE1C28', '#FFFFFF', '#21468B'),
  NO: {
    type: 'cross',
    field: '#BA0C2F',
    cross: '#00205B',
    fimbriation: '#FFFFFF',
    thickness: 0.12,
    fimbriationThickness: 0.26,
  },
  NP: hw(C('#DC143C', 3), C('#003893'), C('#FFFFFF', 0.65)),
  NR: hd(hw(C('#012169', 2), C('#FFC72C', 0.4), C('#012169', 2)), { color: '#FFFFFF', size: 0.14 }),
  NZ: { type: 'ensign', field: '#012169', star: '#CC142B', starRing: '#FFFFFF' },
  OM: { type: 'hoist', hoist: '#ED1C24', hoistWeight: 0.28, bands: [C('#FFFFFF'), C('#ED1C24'), C('#00843D')] },
  PA: { type: 'quarters', colors: ['#FFFFFF', '#DA121A', '#005293', '#FFFFFF'] },
  PE: v('#D91023', '#FFFFFF', '#D91023'),
  PG: hd(diag(C('#CE1126'), C('#000000')), { color: '#FCD116', size: 0.18 }),
  PH: {
    type: 'hoist',
    hoist: '#FFFFFF',
    hoistWeight: 0.34,
    bands: [C('#0038A8'), C('#CE1126')],
    disc: { color: '#FCD116', size: 0.16 },
  },
  PK: {
    type: 'stripes',
    direction: 'vertical',
    bands: [C('#FFFFFF'), C('#01411C', 3)],
    disc: { color: '#FFFFFF', size: 0.28 },
  },
  PL: h('#FFFFFF', '#DC143C'),
  PS: { type: 'hoist', hoist: '#EE2A35', hoistWeight: 0.34, bands: [C('#000000'), C('#FFFFFF'), C('#007A3D')] },
  PT: {
    type: 'stripes',
    direction: 'vertical',
    bands: [C('#006600', 2), C('#FF0000', 3)],
    disc: { color: '#FFD700', size: 0.26 },
  },
  PW: { type: 'disc', field: '#4AADD2', disc: '#FFDE00', size: 0.52 },
  PY: h('#D52B1E', '#FFFFFF', '#0038A8'),
  QA: v('#FFFFFF', '#8A1538'),
  RO: v('#002B7F', '#FCD116', '#CE1126'),
  RS: h('#C6363C', '#0C4076', '#FFFFFF'),
  RU: h('#FFFFFF', '#0039A6', '#D52B1E'),
  RW: hd(h('#00A1DE', '#FAD201', '#20603D'), { color: '#E5BE01', size: 0.18 }),
  SA: { type: 'disc', field: '#006C35', disc: '#FFFFFF', size: 0.4 },
  SB: diag(C('#0051BA', 2), C('#FCD116', 0.4), C('#215B33', 2)),
  SC: diag(C('#003F87'), C('#FCD856'), C('#D62828'), C('#FFFFFF'), C('#007A3D')),
  SD: { type: 'hoist', hoist: '#007229', hoistWeight: 0.32, bands: [C('#D21034'), C('#FFFFFF'), C('#000000')] },
  SE: { type: 'cross', field: '#006AA7', cross: '#FECC00', thickness: 0.2 },
  SG: h('#EF3340', '#FFFFFF'),
  SI: h('#FFFFFF', '#005DA4', '#ED1C24'),
  SK: h('#FFFFFF', '#0B4EA2', '#EE1C25'),
  SL: h('#1EB53A', '#FFFFFF', '#0072C6'),
  SM: h('#FFFFFF', '#5EB6E4'),
  SN: hd(v('#00853F', '#FDEF42', '#E31B23'), { color: '#00853F', size: 0.18 }),
  SO: { type: 'disc', field: '#4189DD', disc: '#FFFFFF', size: 0.38 },
  SR: hd(hw(C('#377E3F'), C('#FFFFFF', 0.4), C('#B40A2D', 2), C('#FFFFFF', 0.4), C('#377E3F')), { color: '#ECC81D', size: 0.2 }),
  SS: {
    type: 'hoist',
    hoist: '#0F47AF',
    hoistWeight: 0.34,
    bands: [C('#000000', 1.2), C('#FFFFFF', 0.22), C('#D21034', 1.2), C('#FFFFFF', 0.22), C('#078930', 1.2)],
    disc: { color: '#FCD116', size: 0.14 },
  },
  ST: {
    type: 'hoist',
    hoist: '#D21034',
    hoistWeight: 0.3,
    bands: [C('#12AD2B'), C('#FFCE00'), C('#12AD2B')],
    disc: { color: '#000000', size: 0.14 },
  },
  SV: h('#0F47AF', '#FFFFFF', '#0F47AF'),
  SY: hd(h('#CE1126', '#FFFFFF', '#000000'), { color: '#007A3D', size: 0.16 }),
  SZ: hw(C('#3E5EB9'), C('#FFD900', 0.35), C('#B10C0C', 2), C('#FFD900', 0.35), C('#3E5EB9')),
  TD: v('#002664', '#FFCD00', '#C60C30'),
  TG: {
    type: 'canton',
    bands: [C('#006A4E'), C('#FFCE00'), C('#006A4E'), C('#FFCE00'), C('#006A4E')],
    canton: '#D21034',
    cantonDisc: '#FFFFFF',
    cantonWidth: 0.4,
    cantonHeight: 0.6,
  },
  TH: hw(C('#A51931'), C('#F4F5F8'), C('#2D2A4A', 2), C('#F4F5F8'), C('#A51931')),
  TJ: hd(hw(C('#CC0000'), C('#FFFFFF', 1.4), C('#006600')), { color: '#F8C300', size: 0.16 }),
  TL: { type: 'disc', field: '#DC241F', disc: '#FFC726', size: 0.62, inner: '#000000', innerSize: 0.32 },
  TM: {
    type: 'stripes',
    direction: 'vertical',
    bands: [C('#D22630', 0.7), C('#009A44', 4)],
    disc: { color: '#FFFFFF', size: 0.22 },
  },
  TN: { type: 'disc', field: '#E70013', disc: '#FFFFFF', size: 0.52, inner: '#E70013', innerSize: 0.28 },
  TO: {
    type: 'canton',
    bands: [C('#C10000')],
    canton: '#FFFFFF',
    cantonCross: '#C10000',
    cantonWidth: 0.45,
    cantonHeight: 0.55,
  },
  TR: { type: 'disc', field: '#E30A17', disc: '#FFFFFF', size: 0.4 },
  TT: diag(C('#CE1126', 1.6), C('#FFFFFF', 0.26), C('#000000', 1.05), C('#FFFFFF', 0.26), C('#CE1126', 1.6)),
  TV: { type: 'ensign', field: '#4F9FD0', star: '#FFD100' },
  TW: {
    type: 'canton',
    bands: [C('#FE0000')],
    canton: '#000095',
    cantonDisc: '#FFFFFF',
    cantonWidth: 0.42,
    cantonHeight: 0.52,
  },
  TZ: diag(C('#1EB53A', 2), C('#FCD116', 0.32), C('#000000', 0.85), C('#FCD116', 0.32), C('#00A3DD', 2)),
  UA: h('#005BBB', '#FFD500'),
  UG: hd(h('#000000', '#FCDC04', '#D90000', '#000000', '#FCDC04', '#D90000'), { color: '#FFFFFF', size: 0.28 }),
  US: {
    type: 'canton',
    bands: [C('#B22234'), C('#FFFFFF'), C('#B22234'), C('#FFFFFF'), C('#B22234'), C('#FFFFFF'), C('#B22234')],
    canton: '#3C3B6E',
    cantonWidth: 0.44,
    cantonHeight: 0.54,
  },
  UY: {
    type: 'canton',
    bands: [C('#FFFFFF'), C('#0038A8'), C('#FFFFFF'), C('#0038A8'), C('#FFFFFF'), C('#0038A8'), C('#FFFFFF'), C('#0038A8'), C('#FFFFFF')],
    canton: '#FFFFFF',
    cantonDisc: '#FCD116',
    cantonWidth: 0.4,
    cantonHeight: 0.5,
  },
  UZ: hw(C('#009ABF', 1.3), C('#CE1126', 0.15), C('#FFFFFF', 1.3), C('#CE1126', 0.15), C('#1EB53A', 1.3)),
  VA: v('#FFD100', '#FFFFFF'),
  VC: v('#0072CE', '#FFD100', '#009E49'),
  VE: hd(h('#FFCC00', '#00247D', '#CF142B'), { color: '#FFFFFF', size: 0.14 }),
  VN: { type: 'disc', field: '#DA251D', disc: '#FFCD00', size: 0.4 },
  VU: { type: 'hoist', hoist: '#FDCE12', hoistWeight: 0.25, bands: [C('#000000'), C('#009543', 0.55), C('#D21034')] },
  WS: {
    type: 'canton',
    bands: [C('#CE1126')],
    canton: '#002B7F',
    cantonDisc: '#FFFFFF',
    cantonWidth: 0.5,
    cantonHeight: 0.56,
  },
  XK: { type: 'disc', field: '#244AA5', disc: '#D0A650', size: 0.42 },
  YE: h('#CE1126', '#FFFFFF', '#000000'),
  ZA: {
    type: 'hoist',
    hoist: '#000000',
    hoistWeight: 0.28,
    bands: [C('#DE3831', 1.6), C('#FFFFFF', 0.3), C('#007A4D', 1.15), C('#FFB612', 0.35), C('#002395', 1.6)],
  },
  ZM: vw(C('#198A00', 4), C('#EF3340'), C('#000000'), C('#EF7D00')),
  ZW: {
    type: 'hoist',
    hoist: '#FFFFFF',
    hoistWeight: 0.26,
    bands: [C('#009739'), C('#FFD200'), C('#D21034'), C('#000000'), C('#D21034'), C('#FFD200'), C('#009739')],
    disc: { color: '#D21034', size: 0.16 },
  },
};

const HOME_NATIONS = new Set(['GB-ENG', 'GB-SCT', 'GB-WLS']);

const CODE_ALIASES: Record<string, string> = {
  UK: 'GB',
  GBR: 'GB',
  USA: 'US',
  'GB-NIR': 'GB',
  EL: 'GR',
};

const COUNTRY_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['United Kingdom', 'GB'],
  ['UK', 'GB'],
  ['Great Britain', 'GB'],
  ['Britain', 'GB'],
  ['United Kingdom of Great Britain and Northern Ireland', 'GB'],
  ['Northern Ireland', 'GB'],
  ['England', 'GB-ENG'],
  ['Scotland', 'GB-SCT'],
  ['Wales', 'GB-WLS'],
  ['Afghanistan', 'AF'],
  ['Albania', 'AL'],
  ['Algeria', 'DZ'],
  ['Andorra', 'AD'],
  ['Angola', 'AO'],
  ['Antigua and Barbuda', 'AG'],
  ['Argentina', 'AR'],
  ['Armenia', 'AM'],
  ['Australia', 'AU'],
  ['Austria', 'AT'],
  ['Azerbaijan', 'AZ'],
  ['Bahamas', 'BS'],
  ['The Bahamas', 'BS'],
  ['Bahrain', 'BH'],
  ['Bangladesh', 'BD'],
  ['Barbados', 'BB'],
  ['Belarus', 'BY'],
  ['Belgium', 'BE'],
  ['Belize', 'BZ'],
  ['Benin', 'BJ'],
  ['Bhutan', 'BT'],
  ['Bolivia', 'BO'],
  ['Bosnia and Herzegovina', 'BA'],
  ['Botswana', 'BW'],
  ['Brazil', 'BR'],
  ['Brunei', 'BN'],
  ['Brunei Darussalam', 'BN'],
  ['Bulgaria', 'BG'],
  ['Burkina Faso', 'BF'],
  ['Burundi', 'BI'],
  ['Cambodia', 'KH'],
  ['Cameroon', 'CM'],
  ['Canada', 'CA'],
  ['Cape Verde', 'CV'],
  ['Cabo Verde', 'CV'],
  ['Central African Republic', 'CF'],
  ['Chad', 'TD'],
  ['Chile', 'CL'],
  ['China', 'CN'],
  ['Colombia', 'CO'],
  ['Comoros', 'KM'],
  ['Congo', 'CG'],
  ['Republic of the Congo', 'CG'],
  ['Costa Rica', 'CR'],
  ['Croatia', 'HR'],
  ['Cuba', 'CU'],
  ['Cyprus', 'CY'],
  ['Czech Republic', 'CZ'],
  ['Czechia', 'CZ'],
  ['Democratic Republic of the Congo', 'CD'],
  ['DR Congo', 'CD'],
  ['DRC', 'CD'],
  ['Denmark', 'DK'],
  ['Djibouti', 'DJ'],
  ['Dominica', 'DM'],
  ['Dominican Republic', 'DO'],
  ['East Timor', 'TL'],
  ['Timor-Leste', 'TL'],
  ['Ecuador', 'EC'],
  ['Egypt', 'EG'],
  ['El Salvador', 'SV'],
  ['Equatorial Guinea', 'GQ'],
  ['Eritrea', 'ER'],
  ['Estonia', 'EE'],
  ['Eswatini', 'SZ'],
  ['Ethiopia', 'ET'],
  ['Fiji', 'FJ'],
  ['Finland', 'FI'],
  ['France', 'FR'],
  ['Gabon', 'GA'],
  ['Gambia', 'GM'],
  ['The Gambia', 'GM'],
  ['Georgia', 'GE'],
  ['Germany', 'DE'],
  ['Ghana', 'GH'],
  ['Greece', 'GR'],
  ['Grenada', 'GD'],
  ['Guatemala', 'GT'],
  ['Guinea', 'GN'],
  ['Guinea-Bissau', 'GW'],
  ['Guyana', 'GY'],
  ['Haiti', 'HT'],
  ['Honduras', 'HN'],
  ['Hungary', 'HU'],
  ['Iceland', 'IS'],
  ['India', 'IN'],
  ['Indonesia', 'ID'],
  ['Iran', 'IR'],
  ['Iraq', 'IQ'],
  ['Ireland', 'IE'],
  ['Israel', 'IL'],
  ['Italy', 'IT'],
  ['Ivory Coast', 'CI'],
  ["Côte d'Ivoire", 'CI'],
  ['Jamaica', 'JM'],
  ['Japan', 'JP'],
  ['Jordan', 'JO'],
  ['Kazakhstan', 'KZ'],
  ['Kenya', 'KE'],
  ['Kiribati', 'KI'],
  ['Kosovo', 'XK'],
  ['Kuwait', 'KW'],
  ['Kyrgyzstan', 'KG'],
  ['Laos', 'LA'],
  ['Latvia', 'LV'],
  ['Lebanon', 'LB'],
  ['Lesotho', 'LS'],
  ['Liberia', 'LR'],
  ['Libya', 'LY'],
  ['Liechtenstein', 'LI'],
  ['Lithuania', 'LT'],
  ['Luxembourg', 'LU'],
  ['Macau', 'MO'],
  ['Macao', 'MO'],
  ['Madagascar', 'MG'],
  ['Malawi', 'MW'],
  ['Malaysia', 'MY'],
  ['Maldives', 'MV'],
  ['Mali', 'ML'],
  ['Malta', 'MT'],
  ['Marshall Islands', 'MH'],
  ['Mauritania', 'MR'],
  ['Mauritius', 'MU'],
  ['Mexico', 'MX'],
  ['Micronesia', 'FM'],
  ['Moldova', 'MD'],
  ['Monaco', 'MC'],
  ['Mongolia', 'MN'],
  ['Montenegro', 'ME'],
  ['Morocco', 'MA'],
  ['Mozambique', 'MZ'],
  ['Myanmar', 'MM'],
  ['Burma', 'MM'],
  ['Namibia', 'NA'],
  ['Nauru', 'NR'],
  ['Nepal', 'NP'],
  ['Netherlands', 'NL'],
  ['Holland', 'NL'],
  ['New Zealand', 'NZ'],
  ['Nicaragua', 'NI'],
  ['Niger', 'NE'],
  ['Nigeria', 'NG'],
  ['North Korea', 'KP'],
  ['North Macedonia', 'MK'],
  ['Macedonia', 'MK'],
  ['Norway', 'NO'],
  ['Oman', 'OM'],
  ['Pakistan', 'PK'],
  ['Palau', 'PW'],
  ['Palestine', 'PS'],
  ['Panama', 'PA'],
  ['Papua New Guinea', 'PG'],
  ['Paraguay', 'PY'],
  ['Peru', 'PE'],
  ['Philippines', 'PH'],
  ['Poland', 'PL'],
  ['Portugal', 'PT'],
  ['Qatar', 'QA'],
  ['Romania', 'RO'],
  ['Russia', 'RU'],
  ['Russian Federation', 'RU'],
  ['Rwanda', 'RW'],
  ['Saint Kitts and Nevis', 'KN'],
  ['Saint Lucia', 'LC'],
  ['Saint Vincent and the Grenadines', 'VC'],
  ['Samoa', 'WS'],
  ['San Marino', 'SM'],
  ['Sao Tome and Principe', 'ST'],
  ['Saudi Arabia', 'SA'],
  ['Senegal', 'SN'],
  ['Serbia', 'RS'],
  ['Seychelles', 'SC'],
  ['Sierra Leone', 'SL'],
  ['Singapore', 'SG'],
  ['Slovakia', 'SK'],
  ['Slovenia', 'SI'],
  ['Solomon Islands', 'SB'],
  ['Somalia', 'SO'],
  ['South Africa', 'ZA'],
  ['South Korea', 'KR'],
  ['Republic of Korea', 'KR'],
  ['South Sudan', 'SS'],
  ['Spain', 'ES'],
  ['Sri Lanka', 'LK'],
  ['Sudan', 'SD'],
  ['Suriname', 'SR'],
  ['Swaziland', 'SZ'],
  ['Sweden', 'SE'],
  ['Switzerland', 'CH'],
  ['Syria', 'SY'],
  ['Taiwan', 'TW'],
  ['Tajikistan', 'TJ'],
  ['Tanzania', 'TZ'],
  ['Thailand', 'TH'],
  ['Togo', 'TG'],
  ['Tonga', 'TO'],
  ['Trinidad and Tobago', 'TT'],
  ['Tunisia', 'TN'],
  ['Turkey', 'TR'],
  ['Türkiye', 'TR'],
  ['Turkmenistan', 'TM'],
  ['Tuvalu', 'TV'],
  ['Uganda', 'UG'],
  ['Ukraine', 'UA'],
  ['United Arab Emirates', 'AE'],
  ['UAE', 'AE'],
  ['United States', 'US'],
  ['United States of America', 'US'],
  ['USA', 'US'],
  ['Uruguay', 'UY'],
  ['Uzbekistan', 'UZ'],
  ['Vanuatu', 'VU'],
  ['Vatican City', 'VA'],
  ['Holy See', 'VA'],
  ['Venezuela', 'VE'],
  ['Vietnam', 'VN'],
  ['Viet Nam', 'VN'],
  ['Yemen', 'YE'],
  ['Zambia', 'ZM'],
  ['Zimbabwe', 'ZW'],
];

function foldName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NAME_TO_CODE: Record<string, string> = {};
for (const [name, code] of COUNTRY_NAMES) {
  NAME_TO_CODE[foldName(name)] = code;
}

function normalizeCode(countryCode?: string | null): string | null {
  if (!countryCode) return null;
  const raw = countryCode.trim().toUpperCase().replace(/\s+/g, '');
  if (!raw || raw === 'XX') return null;
  return CODE_ALIASES[raw] ?? raw;
}

function codeFromName(countryName?: string | null): string | null {
  if (!countryName) return null;
  const folded = foldName(countryName);
  return folded ? NAME_TO_CODE[folded] ?? null : null;
}

export function resolveFlagDesign(
  countryCode?: string | null,
  countryName?: string | null
): FlagDesign | null {
  const named = codeFromName(countryName);
  if (named && HOME_NATIONS.has(named) && FLAG_DESIGNS[named]) return FLAG_DESIGNS[named];
  const code = normalizeCode(countryCode);
  if (code && FLAG_DESIGNS[code]) return FLAG_DESIGNS[code];
  if (named && FLAG_DESIGNS[named]) return FLAG_DESIGNS[named];
  return null;
}

/** Country a chart row belongs to. Cities keep their country; a country row uses its own name. */
export function countryNameForPlace(place: {
  featureType?: string | null;
  country?: string | null;
  name?: string | null;
}): string | null {
  if (place.featureType === 'country') {
    const name = place.country?.trim() || place.name?.trim();
    return name || null;
  }
  const country = place.country?.trim();
  return country || null;
}

export function bandStops(bands: FlagBand[]): {
  colors: readonly [string, string, ...string[]];
  locations: readonly [number, number, ...number[]];
} {
  const weights = bands.map((band) => band.weight ?? 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const colors: string[] = [];
  const locations: number[] = [];
  let acc = 0;
  const gap = 0.0012;
  for (let i = 0; i < bands.length; i += 1) {
    const start = acc / total;
    acc += weights[i];
    const end = i === bands.length - 1 ? 1 : acc / total;
    let left = i === 0 ? 0 : start + gap;
    let right = end;
    const prev = locations.length ? locations[locations.length - 1] : -1;
    if (left <= prev) left = Math.min(1, prev + gap / 2);
    if (right <= left) right = Math.min(1, left + gap / 2);
    colors.push(bands[i].color, bands[i].color);
    locations.push(Number(left.toFixed(4)), Number(right.toFixed(4)));
  }
  if (locations.length) locations[locations.length - 1] = 1;
  return {
    colors: colors as unknown as readonly [string, string, ...string[]],
    locations: locations as unknown as readonly [number, number, ...number[]],
  };
}

export function bandGradientCss(
  direction: 'horizontal' | 'vertical' | 'diagonal',
  bands: FlagBand[]
): string {
  const axis =
    direction === 'vertical' ? 'to right' : direction === 'diagonal' ? 'to bottom right' : 'to bottom';
  const weights = bands.map((band) => band.weight ?? 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let acc = 0;
  const stops = bands.map((band, index) => {
    const start = (acc / total) * 100;
    acc += weights[index];
    const end = (acc / total) * 100;
    const a = Number(start.toFixed(2));
    const b = Number(end.toFixed(2));
    return `${band.color} ${a}% ${b}%`;
  });
  return `linear-gradient(${axis}, ${stops.join(', ')})`;
}
