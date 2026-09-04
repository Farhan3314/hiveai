// HiveAI Design Tokens
// Derived from the provided UI screens: deep navy/indigo background,
// violet/purple primary accent, soft lavender text on dark surfaces.

export const darkTheme = {
  mode: 'dark',

  // Backgrounds
  background: '#0B0B18',       // app background (near-black indigo)
  surface: '#14142B',          // cards, inputs, message bubbles (bot)
  surfaceAlt: '#1C1C3A',       // elevated cards / list items
  border: '#2A2A4A',

  // Brand / accent
  primary: '#6C5CE7',          // main purple (buttons, links, active tab)
  primaryPressed: '#5A4BD1',
  primaryGradientStart: '#7B6CF6',
  primaryGradientEnd: '#5A4BD1',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0C0',
  textMuted: '#6B6B8D',
  textOnPrimary: '#FFFFFF',

  // Chat bubbles
  bubbleUser: '#6C5CE7',
  bubbleUserText: '#FFFFFF',
  bubbleAI: '#1C1C3A',
  bubbleAIText: '#E4E4F5',
  aiAccent: '#8B7CF6',         // "HiveAI" name label, AI icon glow

  // Status
  success: '#3ED598',
  warning: '#F5A623',
  danger: '#FF5C7C',
  online: '#3ED598',

  // Misc
  divider: '#22223F',
  overlay: 'rgba(0,0,0,0.6)',
  inputBackground: '#14142B',
  tabBarBackground: '#0F0F22',
  shadow: 'rgba(108, 92, 231, 0.25)',
};

export const lightTheme = {
  mode: 'light',

  background: '#F7F7FC',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F0FA',
  border: '#E4E4F0',

  primary: '#6C5CE7',
  primaryPressed: '#5A4BD1',
  primaryGradientStart: '#7B6CF6',
  primaryGradientEnd: '#5A4BD1',

  textPrimary: '#14142B',
  textSecondary: '#5B5B7A',
  textMuted: '#9494B0',
  textOnPrimary: '#FFFFFF',

  bubbleUser: '#6C5CE7',
  bubbleUserText: '#FFFFFF',
  bubbleAI: '#F0F0FA',
  bubbleAIText: '#2A2A45',
  aiAccent: '#6C5CE7',

  success: '#1FAE72',
  warning: '#DB8B12',
  danger: '#E23B5C',
  online: '#1FAE72',

  divider: '#ECECF6',
  overlay: 'rgba(0,0,0,0.4)',
  inputBackground: '#F0F0FA',
  tabBarBackground: '#FFFFFF',
  shadow: 'rgba(108, 92, 231, 0.15)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' },
  h2: { fontSize: 22, fontWeight: '700' },
  h3: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 13, fontWeight: '400' },
  small: { fontSize: 11, fontWeight: '400' },
};
