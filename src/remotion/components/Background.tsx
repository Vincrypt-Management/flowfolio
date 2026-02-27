import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { colors } from '../styles';
import type { BGVariation } from '../lib/contentPools';

/**
 * Cinematic ambient background with layered depth:
 * - Dual drifting gradient orbs with motion blur
 * - Third accent orb for parallax depth
 * - Subtle grain texture overlay
 * - Dot grid + vignette
 */
interface BackgroundProps {
  variant?: 'default' | 'hero' | 'feature';
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

  // Third orb — slow parallax depth layer
  const a3 = (frame / 1200) * Math.PI * 2;
  const x3 = 30 + Math.cos(a3 + 1.5) * 15;
  const y3 = 70 + Math.sin(a3 * 0.7) * 12;

  const gridOpacity = variant === 'hero' ? 0.035 : 0.02;
  const orbSize = variant === 'hero' ? 750 : 550;

  // Grain animation — shift grain phase over time
  const grainSeed = Math.floor(frame / 2) * 100;

  // Subtle global pulse for organic feel
  const breathe = interpolate(
    Math.sin(frame / 90 * Math.PI * 2),
    [-1, 1],
    [0.85, 1],
  );

  return (
    <AbsoluteFill>
      {/* Solid dark base */}
      <AbsoluteFill style={{ background: colors.bg }} />

      {/* Deep background orb — parallax layer (slowest) */}
      <div
        style={{
          position: 'absolute',
          left: `${x3}%`,
          top: `${y3}%`,
          width: orbSize * 1.3,
          height: orbSize * 1.3,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(56, 189, 248, 0.03) 0%, transparent 65%)`,
          transform: 'translate(-50%, -50%)',
          filter: 'blur(120px)',
          opacity: breathe,
        }}
      />

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
          opacity: breathe,
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

      {/* Film grain overlay */}
      <AbsoluteFill style={{ opacity: 0.025, mixBlendMode: 'overlay' }}>
        <svg width="100%" height="100%">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed={grainSeed} />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>

      {/* Soft edge vignette — darker for cinematic feel */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.5) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
