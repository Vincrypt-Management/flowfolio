// Design tokens matching FlowFolio's visual identity
// Enhanced palette with richer contrast and scene-specific accents

export const colors = {
  // Backgrounds
  bg: '#060608',
  bgCard: '#0c0c10',
  bgHover: '#16161c',
  bgActive: '#1e1e26',
  bgSidebar: '#020204',
  bgDeep: '#020617', // slate-950

  // Primary - Emerald Green (vibrant)
  primary: '#00e599',
  primaryHover: '#00c281',
  primaryBright: '#34ffc2',
  primaryDim: 'rgba(0, 229, 153, 0.1)',
  primaryDim15: 'rgba(0, 229, 153, 0.15)',
  primaryDim20: 'rgba(0, 229, 153, 0.2)',
  primaryDim40: 'rgba(0, 229, 153, 0.4)',
  primaryGlow: 'rgba(0, 229, 153, 0.6)',

  // Accent - Indigo (richer)
  accent: '#818cf8',
  accentHover: '#6366f1',
  accentBright: '#a5b4fc',
  accentDim: 'rgba(129, 140, 248, 0.1)',
  accentDim15: 'rgba(129, 140, 248, 0.15)',
  accentDim20: 'rgba(129, 140, 248, 0.2)',
  accentGlow: 'rgba(129, 140, 248, 0.5)',

  // Blue (sky)
  blue: '#38bdf8',
  blueLight: '#7dd3fc',
  blueDim: 'rgba(56, 189, 248, 0.15)',
  blueGlow: 'rgba(56, 189, 248, 0.3)',

  // Cyan
  cyan: '#22d3ee',
  cyanDim: 'rgba(34, 211, 238, 0.15)',

  // Rose (warm accent for alerts)
  rose: '#fb7185',
  roseDim: 'rgba(251, 113, 133, 0.15)',

  // Amber (warm)
  amber: '#fbbf24',
  amberDim: 'rgba(251, 191, 36, 0.15)',

  // Text — brighter for video readability
  text: '#f8fafc',
  textSoft: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',

  // Borders — slightly more visible
  border: '#1e293b',
  borderLight: '#334155',
  borderGlass: 'rgba(148, 163, 184, 0.12)',

  // Functional
  success: '#34d399',
  error: '#fb7185',
  warning: '#fbbf24',

  // Glass — richer
  glassBg: 'rgba(15, 23, 42, 0.6)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassShine: 'rgba(255, 255, 255, 0.06)',
} as const;

export const fonts = {
  sans: 'Inter, system-ui, sans-serif',
  mono: "'JetBrains Mono', monospace",
} as const;

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  full: 9999,
} as const;

// Shared gradient definitions
export const gradients = {
  primaryToAccent: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
  accentToPrimary: `linear-gradient(135deg, ${colors.accent}, ${colors.primary})`,
  heroBackground: `linear-gradient(180deg, #0f172a 0%, #0c1425 20%, #081020 50%, #020617 100%)`,
  cardGlass: `linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)`,
  showcaseFrame: `linear-gradient(135deg, ${colors.blueGlow} 0%, rgba(59, 130, 246, 0.1) 50%, ${colors.blueGlow} 100%)`,
  greenPurple: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`,
  subtleRadial: `radial-gradient(ellipse at center, rgba(59, 130, 246, 0.12) 0%, transparent 70%)`,
} as const;
