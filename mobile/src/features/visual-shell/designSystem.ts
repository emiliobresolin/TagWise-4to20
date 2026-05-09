export const visualShellColors = {
  background: '#07101d',
  surface: '#111c2e',
  surfaceRaised: '#172337',
  surfacePressed: '#20304a',
  border: '#2b3c58',
  borderStrong: '#3f7fd0',
  text: '#f4f7fb',
  textMuted: '#aeb8c8',
  textSubtle: '#7f8ca3',
  blue: '#4a9bff',
  blueSoft: '#264b82',
  red: '#e6535a',
  redSoft: '#542b33',
  amber: '#ffd15a',
  amberSoft: '#473d25',
  green: '#57b783',
  teal: '#43d4c4',
  purple: '#9b63f3',
  white: '#ffffff',
} as const;

export const visualShellSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const visualShellRadius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const visualShellTypography = {
  logo: 44,
  screenTitle: 54,
  title: 30,
  subtitle: 20,
  body: 16,
  caption: 13,
} as const;
