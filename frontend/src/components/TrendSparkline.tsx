import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, radius, spacing, zoneColor, Zone } from '@/src/lib/theme';

type Point = { recpct: number; zone: Zone };

/**
 * Compact 7-point sparkline that plots the recovery % of recent
 * assessments. Each data point is colored by its zone so weekly
 * fluctuations are visible at a glance.
 */
export function TrendSparkline({
  data,
  width = 320,
  height = 88,
}: {
  data: Point[];
  width?: number;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <View style={[styles.wrap, { width, height, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.empty}>Sin datos para tendencia.</Text>
      </View>
    );
  }

  const padX = 12;
  const padY = 14;
  const w = width - padX * 2;
  const h = height - padY * 2;

  const values = data.map((d) => d.recpct);
  const vMin = Math.min(0, ...values) - 5;
  const vMax = Math.max(100, ...values) + 5;
  const span = Math.max(vMax - vMin, 1);

  const stepX = data.length > 1 ? w / (data.length - 1) : 0;
  const pts = data.map((d, i) => ({
    x: padX + stepX * i,
    y: padY + (1 - (d.recpct - vMin) / span) * h,
    zone: d.zone,
    recpct: d.recpct,
  }));

  const linePath = buildSmoothPath(pts);
  const areaPath =
    pts.length > 1
      ? linePath +
        ` L ${pts[pts.length - 1].x} ${padY + h} L ${pts[0].x} ${padY + h} Z`
      : '';

  // Use last point's zone color as line theme
  const lineColor = zoneColor(pts[pts.length - 1].zone);

  return (
    <View style={[styles.wrap, { width, height }]} testID="trend-sparkline">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity="0.4" />
            <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} rx={8} fill={colors.surface} />
        {areaPath ? <Path d={areaPath} fill="url(#sparkGrad)" /> : null}
        {pts.length > 1 && (
          <Path
            d={linePath}
            stroke={lineColor}
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {pts.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={colors.surface}
            stroke={zoneColor(p.zone)}
            strokeWidth={2.2}
          />
        ))}
      </Svg>
    </View>
  );
}

function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const smooth = 0.2;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) * smooth;
    const c1y = p1.y + (p2.y - p0.y) * smooth;
    const c2x = p2.x - (p3.x - p1.x) * smooth;
    const c2y = p2.y - (p3.y - p1.y) * smooth;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    overflow: 'hidden',
    padding: spacing.xs,
  },
  empty: { color: colors.onSurfaceTertiary, fontSize: 11 },
});
