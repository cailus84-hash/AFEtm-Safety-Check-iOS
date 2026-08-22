import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { colors, radius, spacing } from '@/src/lib/theme';

export type CompareSeries = {
  label: string;
  color: string;
  readings: Record<string, number>;
};

type Props = {
  a: CompareSeries;
  b: CompareSeries;
  times: number[];
  width?: number;
  height?: number;
};

/**
 * Overlays two recovery curves in the same coordinate space so the
 * user can visually compare how their recovery evolved between the
 * two selected sessions.
 */
export function CompareChart({ a, b, times, width = 340, height = 240 }: Props) {
  const padL = 34;
  const padR = 14;
  const padT = 22;
  const padB = 34;
  const w = width - padL - padR;
  const h = height - padT - padB;

  const values: number[] = [];
  for (const s of [a, b]) {
    for (const t of times) if (typeof s.readings[String(t)] === 'number') values.push(s.readings[String(t)]);
  }
  if (values.length < 2) {
    return (
      <View style={[styles.wrap, { width, height, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.empty}>Datos insuficientes.</Text>
      </View>
    );
  }

  const tMax = 180;
  const vMin = Math.min(...values) - 5;
  const vMax = Math.max(...values) + 5;
  const span = Math.max(vMax - vMin, 1);

  const xFor = (t: number) => padL + (t / tMax) * w;
  const yFor = (v: number) => padT + (1 - (v - vMin) / span) * h;

  const seriesPath = (s: CompareSeries) => {
    const pts = times
      .filter((t) => typeof s.readings[String(t)] === 'number')
      .map((t) => ({ x: xFor(t), y: yFor(s.readings[String(t)]), t, v: s.readings[String(t)] }));
    return { pts, d: buildSmoothPath(pts) };
  };

  const A = seriesPath(a);
  const B = seriesPath(b);

  const yTicks = [vMin, Math.round((vMin + vMax) / 2), vMax];

  return (
    <View style={[styles.wrap, { width, height }]} testID="compare-chart">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={a.color} stopOpacity="0.25" />
            <Stop offset="1" stopColor={a.color} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="bGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={b.color} stopOpacity="0.25" />
            <Stop offset="1" stopColor={b.color} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        <Rect x={padL} y={padT} width={w} height={h} rx={4} fill={colors.surface} stroke={colors.divider} />

        {yTicks.map((v, i) => {
          const y = yFor(v);
          return (
            <G key={`y-${i}`}>
              <Line x1={padL} x2={padL + w} y1={y} y2={y} stroke={colors.divider} strokeDasharray="2,3" />
              <SvgText x={padL - 6} y={y + 3} fontSize="9" fill={colors.onSurfaceTertiary} textAnchor="end">
                {v}
              </SvgText>
            </G>
          );
        })}

        {/* Series A */}
        {A.pts.length > 1 && (
          <>
            <Path d={A.d + ` L ${A.pts[A.pts.length - 1].x} ${padT + h} L ${A.pts[0].x} ${padT + h} Z`} fill="url(#aGrad)" />
            <Path d={A.d} stroke={a.color} strokeWidth={2.4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
        {A.pts.map((p, i) => (
          <Circle key={`ap-${i}`} cx={p.x} cy={p.y} r={3.5} fill={colors.surface} stroke={a.color} strokeWidth={2} />
        ))}

        {/* Series B */}
        {B.pts.length > 1 && (
          <>
            <Path d={B.d + ` L ${B.pts[B.pts.length - 1].x} ${padT + h} L ${B.pts[0].x} ${padT + h} Z`} fill="url(#bGrad)" />
            <Path
              d={B.d}
              stroke={b.color}
              strokeWidth={2.4}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="6,4"
            />
          </>
        )}
        {B.pts.map((p, i) => (
          <Circle key={`bp-${i}`} cx={p.x} cy={p.y} r={3.5} fill={colors.surface} stroke={b.color} strokeWidth={2} />
        ))}

        {/* X axis */}
        {times.map((t, i) => (
          <SvgText
            key={`x-${i}`}
            x={xFor(t)}
            y={padT + h + 14}
            fontSize="9"
            fill={colors.onSurfaceTertiary}
            textAnchor="middle"
          >
            {t}s
          </SvgText>
        ))}
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendItem color={a.color} label={a.label} />
        <LegendItem color={b.color} label={b.label} dashed />
      </View>
    </View>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View
        style={{
          width: 22,
          height: 3,
          backgroundColor: dashed ? 'transparent' : color,
          borderRadius: 2,
          borderTopWidth: dashed ? 3 : 0,
          borderColor: color,
          borderStyle: dashed ? 'dashed' : 'solid',
        }}
      />
      <Text style={styles.legendText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const smooth = 0.22;
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
    padding: spacing.sm,
    overflow: 'hidden',
  },
  empty: { color: colors.onSurfaceTertiary, fontSize: 12 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  legendText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: '600', flexShrink: 1 },
});
