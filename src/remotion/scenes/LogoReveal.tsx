import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { colors, fonts } from '../styles';

/**
 * Clean logo reveal — one element at a time.
 * Logo scales in → wordmark fades in → tagline appears.
 * No particles, no rings. Just smooth motion and negative space.
 */
export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo scales in smoothly
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 0.8 },
  });
  const logoScale = interpolate(logoSpring, [0, 1], [0.8, 1]);
  const logoOp = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Glow bloom intensity ramps up with logo
  const glowRadius = interpolate(logoSpring, [0, 1], [0, 40]);

  // Letter-by-letter wordmark reveal
  const wordmark = 'FlowFolio';
  const letterDelay = 3; // frames between each letter
  const wordStart = 25;

  // Tagline — last to appear
  const tagOp = interpolate(frame, [60, 80], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tagY = interpolate(frame, [60, 80], [6, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Scene fade-out
  const fadeOut = interpolate(frame, [105, 125], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
      >
        {/* Logo mark with glow bloom */}
        <div
          style={{
            transform: `scale(${logoScale})`,
            opacity: logoOp,
            filter: `drop-shadow(0 0 ${glowRadius}px rgba(0,229,153,0.4)) drop-shadow(0 20px 40px rgba(0,0,0,0.4))`,
          }}
        >
          <Img
            src={staticFile('icon-only.png')}
            style={{
              width: 120,
              height: 120,
              objectFit: 'contain',
            }}
          />
        </div>

        {/* Letter-by-letter wordmark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 0,
          }}
        >
          {[...wordmark].map((char, i) => {
            const charStart = wordStart + i * letterDelay;
            const charOp = interpolate(frame, [charStart, charStart + 8], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const charY = interpolate(frame, [charStart, charStart + 8], [10, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const isPrimary = i >= 4; // "Folio" in primary color

            return (
              <span
                key={i}
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  color: isPrimary ? colors.primary : colors.text,
                  fontFamily: fonts.sans,
                  letterSpacing: '-0.04em',
                  opacity: charOp,
                  transform: `translateY(${charY}px)`,
                  display: 'inline-block',
                  textShadow: isPrimary && charOp > 0.5
                    ? `0 0 20px rgba(0,229,153,0.3)`
                    : undefined,
                }}
              >
                {char}
              </span>
            );
          })}
        </div>

        {/* Tagline */}
        <span
          style={{
            fontSize: 18,
            color: colors.textMuted,
            fontFamily: fonts.sans,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            opacity: tagOp,
            transform: `translateY(${tagY}px)`,
          }}
        >
          Quantitative investing, beautifully simple
        </span>

        {/* Sub-tagline */}
        <span
          style={{
            fontSize: 13,
            color: colors.textDim,
            fontFamily: fonts.mono,
            fontWeight: 400,
            letterSpacing: '0.02em',
            opacity: interpolate(frame, [70, 90], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          100% offline · open source · zero tracking
        </span>
      </div>
    </AbsoluteFill>
  );
};
