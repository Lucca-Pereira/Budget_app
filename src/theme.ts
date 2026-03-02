export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const typography = {
  heading:  { fontSize: 24, fontWeight: '700' as const },
  subtitle: { fontSize: 16, fontWeight: '600' as const },
  body:     { fontSize: 14 },
  caption:  { fontSize: 12 },
};

export type PaletteKey = 'blue' | 'green' | 'purple' | 'orange' | 'red';

export type ColorSet = {
  primary: string;
  success: string;
  danger: string;
  warning: string;
  background: string;
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
};

export const PALETTES: Record<PaletteKey, { label: string; icon: string; dark: ColorSet; light: ColorSet }> = {
  blue: {
    label: 'Ocean Blue',
    icon: '🔵',
    dark: {
      primary:       '#60A5FA',
      success:       '#34D399',
      danger:        '#F87171',
      warning:       '#FBBF24',
      background:    '#0F172A',
      surface:       '#1E293B',
      border:        '#334155',
      text:          '#F1F5F9',
      textSecondary: '#94A3B8',
    },
    light: {
      primary:       '#3B82F6',
      success:       '#10B981',
      danger:        '#EF4444',
      warning:       '#F59E0B',
      background:    '#F0F6FF',
      surface:       '#FFFFFF',
      border:        '#BFDBFE',
      text:          '#0F172A',
      textSecondary: '#475569',
    },
  },
  green: {
    label: 'Emerald',
    icon: '🟢',
    dark: {
      primary:       '#22D45A',
      success:       '#4ADE80',
      danger:        '#FF4D6D',
      warning:       '#FBBF24',
      background:    '#0D1117',
      surface:       '#161B22',
      border:        '#21331F',
      text:          '#FFFFFF',
      textSecondary: '#7EE89A',
    },
    light: {
      primary:       '#16A34A',
      success:       '#15803D',
      danger:        '#E11D48',
      warning:       '#D97706',
      background:    '#F0FDF4',
      surface:       '#FFFFFF',
      border:        '#BBF7D0',
      text:          '#052E16',
      textSecondary: '#166534',
    },
  },
  purple: {
    label: 'Violet',
    icon: '🟣',
    dark: {
      primary:       '#A78BFA',
      success:       '#34D399',
      danger:        '#F87171',
      warning:       '#FBBF24',
      background:    '#0E0B1A',
      surface:       '#1A1530',
      border:        '#2E2650',
      text:          '#F5F3FF',
      textSecondary: '#C4B5FD',
    },
    light: {
      primary:       '#7C3AED',
      success:       '#10B981',
      danger:        '#EF4444',
      warning:       '#F59E0B',
      background:    '#FAF5FF',
      surface:       '#FFFFFF',
      border:        '#DDD6FE',
      text:          '#1E1B4B',
      textSecondary: '#5B21B6',
    },
  },
  orange: {
    label: 'Sunset',
    icon: '🟠',
    dark: {
      primary:       '#FB923C',
      success:       '#34D399',
      danger:        '#F87171',
      warning:       '#FBBF24',
      background:    '#1A1208',
      surface:       '#261A0A',
      border:        '#3D2A10',
      text:          '#FFF7ED',
      textSecondary: '#FDBA74',
    },
    light: {
      primary:       '#EA580C',
      success:       '#10B981',
      danger:        '#EF4444',
      warning:       '#D97706',
      background:    '#FFF7ED',
      surface:       '#FFFFFF',
      border:        '#FED7AA',
      text:          '#1C0A00',
      textSecondary: '#9A3412',
    },
  },
  red: {
    label: 'Ruby',
    icon: '🔴',
    dark: {
      primary:       '#FB4A6E',
      success:       '#34D399',
      danger:        '#F87171',
      warning:       '#FBBF24',
      background:    '#1A0A0D',
      surface:       '#260D12',
      border:        '#3D1520',
      text:          '#FFF1F2',
      textSecondary: '#FDA4AF',
    },
    light: {
      primary:       '#E11D48',
      success:       '#10B981',
      danger:        '#DC2626',
      warning:       '#D97706',
      background:    '#FFF1F2',
      surface:       '#FFFFFF',
      border:        '#FECDD3',
      text:          '#1C0009',
      textSecondary: '#9F1239',
    },
  },
};

// Fallbacks for files not yet using palette system
export const darkColors  = PALETTES.blue.dark;
export const lightColors = PALETTES.blue.light;
export const colors      = darkColors;
