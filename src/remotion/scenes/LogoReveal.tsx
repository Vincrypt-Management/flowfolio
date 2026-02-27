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

  // Wordmark fades in after logo settles
  const wordOp = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const wordY = interpolate(frame, [30, 50], [8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Tagline — last to appear
  const tagOp = interpolate(frame, [60, 80], [0, 1], {
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
        {/* Logo mark */}
        <div
          style={{
            transform: `scale(${logoScale})`,
            opacity: logoOp,
          }}
        >
          <Img
            src={staticFile('icon-only.png')}
            style={{
              width: 120,
              height: 120,
              objectFit: 'contain',
              filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))',
            }}
          />
        </div>

        {/* Wordmark */}
        <div
          style={{
            opacity: wordOp,
            transform: `translateY(${wordY}px)`,
            display: 'flex',
            alignItems: 'baseline',
            gap: 0,
          }}
        >
          <span
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: colors.text,
              fontFamily: fonts.sans,
              letterSpacing: '-0.04em',
            }}
          >
            Flow
          </span>
          <span
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: colors.primary,
              fontFamily: fonts.sans,
              letterSpacing: '-0.04em',
            }}
          >
            Folio
          </span>
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
