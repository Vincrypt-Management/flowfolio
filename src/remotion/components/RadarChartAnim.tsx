import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { colors, fonts } from '../styles';

interface RadarChartAnimProps {
  labels: string[];
  values: number[];
  size?: number;
  delay?: number;
  duration?: number;
  color?: string;
}

export const RadarChartAnim: React.FC<RadarChartAnimProps> = ({
  labels,
  values,
  size = 300,
  delay = 0,
  duration = 50,
  color = colors.primary,
}) => {
  const frame = useCurrentFrame();

  const progress = interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(frame - delay, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 45;
  const n = labels.length;
  const angleStep = (2 * Math.PI) / n;

  const rings = [0.25, 0.5, 0.75, 1.0];

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = maxR * value * progress;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const dataPoints = values.map((v, i) => getPoint(i, v));

  return (
    <svg width={size} height={size} style={{ opacity }}>
      <defs>
        <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0.03} />
        </radialGradient>
      </defs>

      {/* Grid rings */}
      {rings.map((r) => {
        const ringPoints = Array.from({ length: n }, (_, i) => {
          const angle = angleStep * i - Math.PI / 2;
          return `${cx + maxR * r * Math.cos(angle)},${cy + maxR * r * Math.sin(angle)}`;
        }).join(' ');
        return (
          <polygon
            key={r}
            points={ringPoints}
            fill="none"
            stroke={colors.border}
            strokeWidth={0.6}
            opacity={0.4}
          />
        );
      })}

      {/* Axis lines */}
      {labels.map((_, i) => {
        const angle = angleStep * i - Math.PI / 2;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + maxR * Math.cos(angle)}
            y2={cy + maxR * Math.sin(angle)}
            stroke={colors.border}
            strokeWidth={0.6}
            opacity={0.3}
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={dataPoints.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="url(#radarFill)"
        stroke={color}
        strokeWidth={1.5}
        opacity={0.8}
      />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
      ))}

      {/* Labels */}
      {labels.map((label, i) => {
        const angle = angleStep * i - Math.PI / 2;
        const labelR = maxR + 28;
        return (
          <text
            key={label}
            x={cx + labelR * Math.cos(angle)}
            y={cy + labelR * Math.sin(angle)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={colors.textDim}
            fontSize={10}
            fontFamily={fonts.mono}
            fontWeight={400}
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
};
