import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { colors } from '../styles';
import type { BGVariation } from '../lib/contentPools';

/**
 * Ambient background with dual drifting gradient orbs
 * and subtle dot grid. Clean but not flat.
 * Now supports seed-driven variation for unique renders.
 */
interface BackgroundProps {
  variant?: 'default' | 'hero' | 'feature';
  /** Seed-driven color/speed variation */
  bgVariation?: BGVariation;
}

export const Background: React.FC<BackgroundProps> = ({ variant = 'default', bgVariation }) => {
  const frame = useCurrentFrame();

  const speed1 = bgVariation?.orbSpeed1 ?? 700;
  const speed2 = bgVariation?.orbSpeed2 ?? 900;
  const orb1Color = bgVariation?.orb1Hue ?? 'rgba(0, 229, 153, 0.07)';
  const orb2Color = bgVariation?.orb2Hue ?? 'rgba(129, 140, 248, 0.05)';

  // Primary orb — slow clockwise drift
  const a1 = (frame / speed1) * Math.PI * 2;
  const x1 = 45 + Math.cos(a1) * 10;
  const y1 = 40 + Math.sin(a1) * 8;

  // Secondary orb — counter-clockwise, offset
  const a2 = (frame / speed2) * Math.PI * 2;
  const x2 = 60 + Math.cos(-a2) * 12;
  const y2 = 60 + Math.sin(-a2) * 10;

  const gridOpacity = variant === 'hero' ? 0.035 : 0.02;
  const orbSize = variant === 'hero' ? 750 : 550;

  return (
    <AbsoluteFill>
      {/* Solid dark base */}
      <AbsoluteFill style={{ background: colors.bg }} />

      {/* Primary green orb */}
      <div
        style={{
          position: 'absolute',
          left: `${x1}%`,
          top: `${y1}%`,
          width: orbSize,
          height: orbSize,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${orb1Color} 0%, transparent 70%)`,
          transform: 'translate(-50%, -50%)',
          filter: 'blur(80px)',
        }}
      />

      {/* Secondary indigo orb */}
      <div
        style={{
          position: 'absolute',
          left: `${x2}%`,
          top: `${y2}%`,
          width: orbSize * 0.7,
          height: orbSize * 0.7,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${orb2Color} 0%, transparent 70%)`,
          transform: 'translate(-50%, -50%)',
          filter: 'blur(80px)',
        }}
      />

      {/* Subtle dot grid */}
      <AbsoluteFill style={{ opacity: gridOpacity }}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="dotGrid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
              <circle cx="24" cy="24" r="0.6" fill="#ffffff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dotGrid)" />
        </svg>
      </AbsoluteFill>

      {/* Soft edge vignette */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.4) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
