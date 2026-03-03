import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';
import { colors, fonts } from '../styles';
import { SceneTransition } from '../components/SceneTransition';
import { PopWord } from '../components/PopWord';

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
  const logoOp = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });

  // Glow bloom intensity ramps up with logo
  const glowRadius = interpolate(logoSpring, [0, 1], [0, 40]);

  // Letter-by-letter wordmark reveal
  const wordmark = 'FlowFolio';
  const letterDelay = 3; // frames between each letter
  const wordStart = 25;

  // Tagline — last to appear
  const tagOp = interpolate(frame, [120, 160], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });
  const tagY = interpolate(frame, [120, 160], [6, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });

  return (
    <SceneTransition durationInFrames={250} fadeInDuration={24} fadeOutDuration={36}>
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
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
            easing: Easing.out(Easing.cubic),
            });
            const charY = interpolate(frame, [charStart, charStart + 8], [10, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
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
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            opacity: tagOp,
            transform: `translateY(${tagY}px)`,
            display: 'flex',
            gap: 7,
            fontFamily: fonts.sans,
          }}
        >
          <span style={{ color: colors.textMuted }}>Quantitative investing,</span>
          <PopWord delay={136} effect="glow-pulse" color={colors.primary}>
            beautifully
          </PopWord>
          <PopWord delay={144} effect="elastic" color={colors.primaryBright}>
            simple
          </PopWord>
        </div>

        {/* Sub-tagline */}
        <span
          style={{
            fontSize: 13,
            color: colors.textDim,
            fontFamily: fonts.mono,
            fontWeight: 400,
            letterSpacing: '0.02em',
            opacity: interpolate(frame, [140, 180], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          100% offline · open source · zero tracking
        </span>
      </div>
    </AbsoluteFill>
    </SceneTransition>
  );
};
