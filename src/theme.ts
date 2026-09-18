export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  input: string;
  ink: string;
  muted: string;
  placeholder: string;
  line: string;
  primary: string;
  primarySoft: string;
  sky: string;
  amber: string;
  danger: string;
  onPrimary: string;
  routeLine: string;
  completedBackground: string;
  completedText: string;
  plannedBackground: string;
  plannedText: string;
  tabBar: string;
};

export const lightColors: ThemeColors = {
  background: '#F5F7F6',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  input: '#F7FAF9',
  ink: '#18313A',
  muted: '#6E8289',
  placeholder: '#9AABA9',
  line: '#E5ECEB',
  primary: '#247B78',
  primarySoft: '#E4F2EF',
  sky: '#E9F3F8',
  amber: '#FFF3DF',
  danger: '#B95651',
  onPrimary: '#FFFFFF',
  routeLine: '#B6D5D4',
  completedBackground: '#DDF5E8',
  completedText: '#176B45',
  plannedBackground: '#E5EEFF',
  plannedText: '#315C9B',
  tabBar: '#FFFFFF',
};

export const darkColors: ThemeColors = {
  background: '#101817',
  surface: '#172321',
  surfaceRaised: '#1C2A28',
  input: '#1D2B29',
  ink: '#EDF5F3',
  muted: '#9CB0AC',
  placeholder: '#708480',
  line: '#2B3D3A',
  primary: '#69C5BB',
  primarySoft: '#203B37',
  sky: '#192F38',
  amber: '#463A25',
  danger: '#F08A83',
  onPrimary: '#0D2421',
  routeLine: '#3F625D',
  completedBackground: '#173D2C',
  completedText: '#79D7A7',
  plannedBackground: '#223650',
  plannedText: '#91B9F4',
  tabBar: '#15201E',
};

// Compatibilidad con componentes que todavía usan el tema claro por defecto.
export const colors = lightColors;
