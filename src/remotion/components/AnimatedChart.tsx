import React from 'react';
import { interpolate, useCurrentFrame , Easing } from 'remotion';
import { colors } from '../styles';

interface AnimatedChartProps {
  data: number[];
  width?: number;
  height?: number;
  delay?: number;
  duration?: number;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  showGlow?: boolean;
}

export const AnimatedChart: React.FC<AnimatedChartProps> = ({
  data,
  width = 600,
  height = 300,
  delay = 0,
  duration = 120,
  strokeColor = colors.primary,
  fillColor,
  strokeWidth = 2,
}) => {
  const frame = useCurrentFrame();

  if (!data || data.length < 2) return null;

  const progress = interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padX = Math.round(width * 0.02);
  const padTop = Math.round(height * 0.07);
  const padBot = Math.round(height * 0.03);

  const points = data.map((val, i) => {
    const x = padX + (i / (data.length - 1)) * (width - padX * 2);
    const y = padTop + (1 - (val - min) / range) * (height - padTop - padBot);
    return { x, y };
  });

  const visibleCount = Math.max(2, Math.floor(progress * points.length));
  const visiblePoints = points.slice(0, visibleCount);

  const pathD = buildSmoothPath(visiblePoints);
  if (!pathD) return null;

  const last = visiblePoints[visiblePoints.length - 1];
  const first = visiblePoints[0];
  const areaD = `${pathD} L ${last.x} ${height - padBot} L ${first.x} ${height - padBot} Z`;

  const opacity = interpolate(frame - delay, [0, 36], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });

  const defaultFill = `url(#areaGrad-${strokeColor.replace('#', '')})`;

  return (
    <svg width={width} height={height} style={{ opacity }}>
      <defs>
        <linearGradient id={`areaGrad-${strokeColor.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.15} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.01} />
        </linearGradient>
      </defs>

      {/* Subtle horizontal grid */}
      {[0.25, 0.5, 0.75].map((ratio) => {
        const y = padTop + ratio * (height - padTop - padBot);
        return (
          <line
            key={ratio}
            x1={padX}
            y1={y}
            x2={width - padX}
            y2={y}
            stroke={colors.border}
            strokeWidth={0.5}
            opacity={0.3}
          />
        );
      })}

      {/* Area fill */}
      <path d={areaD} fill={fillColor || defaultFill} />

      {/* Main line */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Endpoint dot */}
      {visiblePoints.length > 1 && (
        <circle cx={last.x} cy={last.y} r={3} fill={strokeColor} />
      )}
    </svg>
  );
};

// Catmull-Rom → cubic bezier smooth curve
function buildSmoothPath(pts: { x: number; y: number }[]): string | null {
  if (pts.length < 2) return null;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
