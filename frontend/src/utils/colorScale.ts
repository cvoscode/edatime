import chroma, { type Scale } from 'chroma-js';

export type ColorScaleName = 'viridis' | 'plasma' | 'inferno' | 'coolwarm' | 'rdbu';

interface ColormapDef {
  name: string;
  label: string;
  desc: string;
  diverging: boolean;
  domain: [number, number];
  colors: string[];
}

export const COLORMAPS: Record<ColorScaleName, ColormapDef> = {
  viridis: {
    name: 'viridis',
    label: 'Viridis',
    desc: 'Perceptually uniform, colorblind-safe. Purple to yellow.',
    diverging: false,
    domain: [0, 1],
    colors: chroma.scale(['#440154', '#21918c', '#fde725']).colors(6),
  },
  plasma: {
    name: 'plasma',
    label: 'Plasma',
    desc: 'Warm magenta to yellow. Great for density plots.',
    diverging: false,
    domain: [0, 1],
    colors: chroma.scale(['#0d0887', '#cc4778', '#f0f921']).colors(6),
  },
  inferno: {
    name: 'inferno',
    label: 'Inferno',
    desc: 'High-contrast black to orange. Punchy and dramatic.',
    diverging: false,
    domain: [0, 1],
    colors: chroma.scale(['#000004', '#fc4a1a', '#fcfdbf']).colors(6),
  },
  coolwarm: {
    name: 'coolwarm',
    label: 'Coolwarm',
    desc: 'Smooth diverging blue to pink. Easy on the eyes.',
    diverging: true,
    domain: [-1, 1],
    colors: chroma.scale(['#3b4cc0', '#ffffff', '#b40426']).colors(7),
  },
  rdbu: {
    name: 'rdbu',
    label: 'RdBu',
    desc: 'Classic red-blue diverging. Gold standard for correlations.',
    diverging: true,
    domain: [-1, 1],
    colors: chroma.scale(['#2166ac', '#f7f7f7', '#b2182b']).colors(7),
  },
};

export function getColorScale(name: ColorScaleName): Scale {
  const def = COLORMAPS[name];
  return chroma.scale(def.colors).domain(def.domain);
}

export function correlationColor(value: number | null, scaleName: ColorScaleName = 'rdbu'): string {
  if (value === null) return 'var(--color-surface)';
  const v = Math.max(-1, Math.min(1, value));
  const scale = getColorScale(scaleName);
  return scale(v).css();
}

export function dataColor(value: number, min: number, max: number, scaleName: ColorScaleName = 'viridis'): string {
  const normalized = max === min ? 0.5 : (value - min) / (max - min);
  const scale = getColorScale(scaleName);
  return scale(Math.max(0, Math.min(1, normalized))).css();
}

export function getColorScaleGradientCSS(scaleName: ColorScaleName, steps: number = 7): string {
  const def = COLORMAPS[scaleName];
  const scale = chroma.scale(def.colors).domain(def.domain);
  const stops: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const val = def.domain[0] + t * (def.domain[1] - def.domain[0]);
    stops.push(`${scale(val).css()} ${Math.round(t * 100)}%`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export function getColorPalette(scaleName: ColorScaleName, count: number = 6): string[] {
  const def = COLORMAPS[scaleName];
  return chroma.scale(def.colors).domain(def.domain).colors(count);
}

export function getColorForValue(
  value: number,
  scaleName: ColorScaleName,
  domain: [number, number] = [0, 1]
): string {
  const scale = getColorScale(scaleName);
  const [min, max] = domain;
  const normalized = max === min ? 0.5 : (value - min) / (max - min);
  return scale(Math.max(0, Math.min(1, normalized))).css();
}

export function isDiverging(scaleName: ColorScaleName): boolean {
  return COLORMAPS[scaleName].diverging;
}

export function getColorScaleDomain(scaleName: ColorScaleName): [number, number] {
  return COLORMAPS[scaleName].domain;
}

export function getContrastTextColor(bgColor: string): string {
  if (bgColor.startsWith('var(')) return '#ffffff';
  try {
    const lum = chroma(bgColor).luminance();
    return lum > 0.5 ? '#000000' : '#ffffff';
  } catch {
    return '#ffffff';
  }
}

const DISTRIBUTION_GROUP_COLORS = [
  '#4a9eff', '#ff6b6b', '#52c41a', '#ffc53d', '#a0d911',
  '#5ad8a6', '#ff9d4d', '#7ec8ff', '#f78fb3', '#9bde6d', '#ffd166',
];

export function getCategoryColor(index: number): string {
  return DISTRIBUTION_GROUP_COLORS[index % DISTRIBUTION_GROUP_COLORS.length];
}

const LOW_CARDINALITY_LIMIT = 8;

export interface CategoricalColorGroups {
  categories: string[];
  colorByLabel: Map<string, string>;
}

function normalizeCategoryLabel(label: unknown): string {
  if (label == null) return 'Missing';
  const text = String(label).trim();
  return text || 'Missing';
}

export function buildCategoricalColorGroups(labels?: unknown[] | null): CategoricalColorGroups | null {
  if (!Array.isArray(labels) || labels.length === 0) return null;
  const categories: string[] = [];
  const labelToIndex = new Map<string, number>();
  for (const rawLabel of labels) {
    const label = normalizeCategoryLabel(rawLabel);
    if (labelToIndex.has(label)) continue;
    labelToIndex.set(label, categories.length);
    categories.push(label);
    if (categories.length > LOW_CARDINALITY_LIMIT) return null;
  }
  if (categories.length === 0) return null;
  return {
    categories,
    colorByLabel: new Map(categories.map((l, i) => [l, getCategoryColor(i)])),
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = String(hex).replace('#', '');
  return {
    r: parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16) >> 16 & 255,
    g: parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16) >> 8 & 255,
    b: parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16) & 255,
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function sampleGradient(stops: string[], t: number): string {
  const n = stops.length;
  if (n === 0) return '#4a9eff';
  if (n === 1) return stops[0];
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (n - 1);
  const i0 = Math.floor(scaled);
  const i1 = Math.min(n - 1, i0 + 1);
  const frac = scaled - i0;
  const a = hexToRgb(stops[i0]);
  const b = hexToRgb(stops[i1]);
  return rgbToHex({
    r: a.r + (b.r - a.r) * frac,
    g: a.g + (b.g - a.g) * frac,
    b: a.b + (b.b - a.b) * frac,
  });
}