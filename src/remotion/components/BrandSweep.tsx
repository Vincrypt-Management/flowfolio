import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { colors } from '../styles';

/**
 * Brand signature transition — a horizontal gradient sweep (green→purple)
 * that wipes across the screen between scene groups.
 * Also includes a brief flash/bloom effect for cinematic impact.
 */
interface BrandSweepProps {
  durationInFrames: number;
  direction?: 'left' | 'right';
}

export const BrandSweep: React.FC<BrandSweepProps> = ({
  durationInFrames,
  direction = 'right',
}) => {
  const frame = useCurrentFrame();
  const mid = durationInFrames / 2;

  // Sweep bar position: enters → peaks at center → exits
  const sweepX = interpolate(frame, [0, mid, durationInFrames], [-120, 50, 220], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Overall opacity: fade in → peak → fade out
  const opacity = interpolate(
    frame,
    [0, mid * 0.4, mid, mid * 1.6, durationInFrames],
    [0, 1, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Flash bloom at midpoint
  const bloom = interpolate(
    frame,
    [mid - 8, mid, mid + 8],
    [0, 0.25, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Thin accent line that leads the sweep
  const lineX = interpolate(frame, [0, durationInFrames], [-50, 250], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: 'none' }}>
      {/* Full-screen bloom flash */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at ${direction === 'right' ? '50%' : '50%'} 50%, ${colors.primaryDim40}, transparent 70%)`,
          opacity: bloom,
        }}
      />

      {/* Leading thin line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${direction === 'right' ? lineX : 100 - lineX}%`,
          width: 1,
          background: `linear-gradient(180deg, transparent, ${colors.primary}, transparent)`,
          opacity: 0.6,
          filter: `blur(0.5px)`,
        }}
      />

      {/* Main gradient sweep bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${direction === 'right' ? sweepX - 15 : 100 - sweepX - 15}%`,
          width: '30%',
          background:
            direction === 'right'
              ? `linear-gradient(90deg, transparent, ${colors.primaryDim20}, ${colors.accentDim20}, transparent)`
              : `linear-gradient(90deg, transparent, ${colors.accentDim20}, ${colors.primaryDim20}, transparent)`,
          filter: 'blur(40px)',
        }}
      />

      {/* Narrow bright core */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          bottom: '20%',
          left: `${direction === 'right' ? sweepX - 2 : 100 - sweepX - 2}%`,
          width: '4%',
          background: `linear-gradient(90deg, transparent, ${colors.primaryGlow}, ${colors.accentGlow}, transparent)`,
          filter: 'blur(20px)',
          opacity: 0.5,
        }}
      />
    </AbsoluteFill>
  );
};
