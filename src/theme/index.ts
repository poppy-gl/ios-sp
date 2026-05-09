export const lightColors = {
  background: '#fff7fb',
  backgroundSoft: '#fff0f7',
  backgroundElevated: '#ffffff',
  card: '#ffffff',
  cardMuted: '#fff5fa',
  cardPressed: '#fff0f7',
  primary: '#ff5c9a',
  primaryDark: '#db2777',
  primarySoft: '#ffe3ef',
  primarySubtle: '#fce7f3',
  border: '#f8cfe1',
  text: '#2c1822',
  textMuted: '#8b5870',
  textSoft: '#ad6f8c',
  textInverse: '#ffffff',
  white: '#ffffff',
  overlay: 'rgba(20, 8, 18, 0.44)',
  overlayStrong: 'rgba(20, 8, 18, 0.68)',
  danger: '#e11d48',
  warning: '#f59e0b',
  success: '#10b981',
} as const;

export const darkColors = {
  background: '#160b12',
  backgroundSoft: '#21111b',
  backgroundElevated: '#2a1622',
  card: '#24141e',
  cardMuted: '#2d1925',
  cardPressed: '#351d2b',
  primary: '#ff6faa',
  primaryDark: '#ff8fbd',
  primarySoft: '#4a2034',
  primarySubtle: '#3a1b2a',
  border: '#513047',
  text: '#fff4f9',
  textMuted: '#dfabc4',
  textSoft: '#bd7f9f',
  textInverse: '#1f0f18',
  white: '#ffffff',
  overlay: 'rgba(11, 4, 9, 0.5)',
  overlayStrong: 'rgba(11, 4, 9, 0.72)',
  danger: '#fb7185',
  warning: '#fbbf24',
  success: '#34d399',
} as const;

export const colorSchemes = {
  light: lightColors,
  dark: darkColors,
} as const;

export const colors = lightColors;

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  xs: 6,
  sm: 8,
  md: 8,
  lg: 8,
  pill: 999,
} as const;

export const touch = {
  minHeight: 44,
  icon: 40,
  iconSmall: 32,
  iconLarge: 48,
} as const;

export const size = {
  badgeHeight: 24,
  cardTitleMinHeight: 38,
  coverOverlayHeight: 38,
  listCoverHeight: 72,
  listCoverWidth: 116,
  progressHeight: 5,
  skeletonLine: 12,
  skeletonLineSmall: 10,
  videoCoverAspectRatio: 16 / 10,
} as const;

export const shadow = {
  soft: {
    shadowColor: '#f9a8d4',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  card: {
    shadowColor: '#f9a8d4',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 26,
} as const;

export const typography = {
  label: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    lineHeight: 16,
  },
  meta: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    lineHeight: 16,
  },
  body: {
    fontSize: fontSize.md,
    fontWeight: '700',
    lineHeight: 20,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '900',
    lineHeight: 20,
  },
  screenTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    lineHeight: 32,
  },
} as const;

export const opacity = {
  disabled: 0.5,
  muted: 0.72,
  pressed: 0.78,
} as const;

export const animation = {
  pressDuration: 80,
  cardPressDuration: 90,
  favoriteTapDuration: 70,
  skeletonPulseDuration: 700,
  pressScale: 0.97,
  cardPressScale: 0.975,
  listPressScale: 0.985,
} as const;

export const theme = {
  mode: 'light',
  colors,
  spacing,
  radius,
  shadow,
  fontSize,
  typography,
  touch,
  size,
  opacity,
  animation,
} as const;

export const lightTheme = {
  ...theme,
  mode: 'light',
  colors: lightColors,
} as const;

export const darkTheme = {
  ...theme,
  mode: 'dark',
  colors: darkColors,
} as const;
