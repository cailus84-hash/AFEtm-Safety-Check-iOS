import { StyleSheet } from 'react-native';

export const colors = {
  surface: '#0A0A0A',
  surfaceSecondary: '#1A1A1A',
  surfaceTertiary: '#262626',
  onSurface: '#FFFFFF',
  onSurfaceSecondary: '#E5E5E5',
  onSurfaceTertiary: '#A3A3A3',
  border: '#333333',
  borderStrong: '#4D4D4D',
  divider: '#1F1F1F',
  brandGold: '#D4AF37',
  brandBlue: '#3B82F6',
  zoneBlue: '#3B82F6',
  zoneGreen: '#22C55E',
  zoneYellow: '#F59E0B',
  zoneRed: '#EF4444',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
};

export type Zone = 'BLUE' | 'GREEN' | 'YELLOW' | 'RED';
export type Pattern = 'RAPID' | 'NORMAL' | 'DELAYED' | 'FLATTENED' | 'UNSTABLE';

export const zoneColor = (z: Zone): string => {
  switch (z) {
    case 'BLUE':
      return colors.zoneBlue;
    case 'GREEN':
      return colors.zoneGreen;
    case 'YELLOW':
      return colors.zoneYellow;
    case 'RED':
      return colors.zoneRed;
  }
};

export const zoneLabel = (z: Zone): string => {
  switch (z) {
    case 'BLUE':
      return 'Azul · Óptimo';
    case 'GREEN':
      return 'Verde · Favorable';
    case 'YELLOW':
      return 'Amarillo · Precaución';
    case 'RED':
      return 'Rojo · Alerta';
  }
};

export const zoneDescription = (z: Zone): string => {
  switch (z) {
    case 'BLUE':
      return 'Estado muy favorable. Recuperación cardiaca excelente y respuesta positiva general.';
    case 'GREEN':
      return 'Estado favorable. Condición adecuada para entrenar o continuar normalmente.';
    case 'YELLOW':
      return 'Estado de precaución. Observa el contexto y ajusta la carga si es necesario.';
    case 'RED':
      return 'Estado de alerta. Considera revisión profesional antes de esfuerzos exigentes.';
  }
};

export const patternLabel = (p: Pattern): string => {
  switch (p) {
    case 'RAPID':
      return 'Rápida';
    case 'NORMAL':
      return 'Normal';
    case 'DELAYED':
      return 'Lenta';
    case 'FLATTENED':
      return 'Meseta';
    case 'UNSTABLE':
      return 'Inestable';
  }
};

export const shared = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  h1: {
    color: colors.onSurface,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  h2: {
    color: colors.onSurface,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  h3: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: '700',
  },
  body: {
    color: colors.onSurfaceSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  muted: {
    color: colors.onSurfaceTertiary,
    fontSize: 12,
    lineHeight: 16,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  input: {
    backgroundColor: colors.surfaceTertiary,
    color: colors.onSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  label: {
    color: colors.onSurfaceTertiary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  primaryBtn: {
    backgroundColor: colors.brandGold,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
