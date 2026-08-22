import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { colors, radius, spacing } from '@/src/lib/theme';

type Props = {
  readings: Record<string, number>;
  times: number[];
  fcr: number;
  fcpTarget: number;
  zoneColor: string;
  width?: number;
  height?: number;
};

/**
 * Compact line chart of the recovery curve:
 *  - X axis: recovery time (seconds)
 *  - Y axis: heart rate (bpm)
 *  - Reference lines: FCr (baseline) and FCP target
 *  - Curve is drawn with cubic bezier smoothing and filled with a
 *    zone-color gradient to reinforce the AFE classification.
 */
export function RecoveryChart({
  readings,
  times,
  fcr,
  fcpTarget,
  zoneColor,
  width = 320,
  height = 200,
}: Props) {
  const padL = 34;
  const padR = 14;
  const padT = 16;
  const padB = 28;
  const w = width - padL - padR;
  const h = height - padT - padB;

  const points = times
    .map((t) => ({ t, hr: readings[String(t)] }))
    .filter((p) => typeof p.hr === 'number');

  if (points.length < 2) {
    return (
      <View style={[styles.wrap, { width, height, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.emptyText}>Sin datos suficientes para graficar.</Text>
      </View>
    );
  }

  const tMax = 180;
  const hrValues = points.map((p) => p.hr);
  const hrMin = Math.min(fcr, ...hrValues) - 5;
  const hrMax = Math.max(fcpTarget, ...hrValues) + 5;
  const hrSpan = Math.max(hrMax - hrMin, 1);

  const xFor = (t: number) => padL + (t / tMax) * w;
  const yFor = (hr: number) => padT + (1 - (hr - hrMin) / hrSpan) * h;

  const pts = points.map((p) => ({ x: xFor(p.t), y: yFor(p.hr) }));

  // Smooth cubic bezier path
  const linePath = buildSmoothPath(pts);
  // Area path (same curve, closed to baseline)
  const areaPath =
    linePath +
    ` L ${pts[pts.length - 1].x} ${padT + h} L ${pts[0].x} ${padT + h} Z`;

  const fcrY = yFor(fcr);
  const fcpY = yFor(fcpTarget);

  // Y-axis labels (3 lines): min, mid, max
  const yTicks = [hrMin, Math.round((hrMin + hrMax) / 2), hrMax];

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={zoneColor} stopOpacity="0.45" />
            <Stop offset="1" stopColor={zoneColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Plot background */}
        <Rect
          x={padL}
          y={padT}
          width={w}
          height={h}
          rx={4}
          fill={colors.surface}
          stroke={colors.divider}
        />

        {/* Y-axis ticks + grid */}
        {yTicks.map((v, i) => {
          const y = yFor(v);
          return (
            <G key={`y-${i}`}>
              <Line
                x1={padL}
                x2={padL + w}
                y1={y}
                y2={y}
                stroke={colors.divider}
                strokeDasharray="2,3"
              />
              <SvgText
                x={padL - 6}
                y={y + 3}
                fontSize="9"
                fill={colors.onSurfaceTertiary}
                textAnchor="end"
              >
                {v}
              </SvgText>
            </G>
          );
        })}

        {/* Reference lines: FCr + FCP */}
        {fcrY > padT && fcrY < padT + h && (
          <G>
            <Line
              x1={padL}
              x2={padL + w}
              y1={fcrY}
              y2={fcrY}
              stroke={colors.onSurfaceTertiary}
              strokeDasharray="4,3"
              strokeWidth={1}
            />
            <SvgText
              x={padL + w - 4}
              y={fcrY - 3}
              fontSize="9"
              fill={colors.onSurfaceTertiary}
              textAnchor="end"
            >
              FCr {fcr}
            </SvgText>
          </G>
        )}
        {fcpY > padT && fcpY < padT + h && (
          <G>
            <Line
              x1={padL}
              x2={padL + w}
              y1={fcpY}
              y2={fcpY}
              stroke={colors.brandGold}
              strokeDasharray="4,3"
              strokeWidth={1}
            />
            <SvgText
              x={padL + w - 4}
              y={fcpY - 3}
              fontSize="9"
              fill={colors.brandGold}
              textAnchor="end"
            >
              FCP {fcpTarget}
            </SvgText>
          </G>
        )}

        {/* Curve area */}
        <Path d={areaPath} fill="url(#areaGrad)" />
        {/* Curve line */}
        <Path
          d={linePath}
          stroke={zoneColor}
          strokeWidth={2.4}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {pts.map((p, i) => (
          <G key={`pt-${i}`}>
            <Circle cx={p.x} cy={p.y} r={4} fill={colors.surface} stroke={zoneColor} strokeWidth={2} />
            <SvgText
              x={p.x}
              y={p.y - 8}
              fontSize="9"
              fill={colors.onSurfaceSecondary}
              textAnchor="middle"
              fontWeight="700"
            >
              {points[i].hr}
            </SvgText>
          </G>
        ))}

        {/* X-axis ticks */}
        {points.map((p, i) => {
          const x = xFor(p.t);
          return (
            <SvgText
              key={`x-${i}`}
              x={x}
              y={padT + h + 14}
              fontSize="9"
              fill={colors.onSurfaceTertiary}
              textAnchor="middle"
            >
              {p.t}s
            </SvgText>
          );
        })}
      </Svg>
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
    padding: spacing.xs,
    overflow: 'hidden',
  },
  emptyText: { color: colors.onSurfaceTertiary, fontSize: 12 },
});
