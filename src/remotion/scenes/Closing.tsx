import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig, Easing } from 'remotion';
import { colors, fonts, radius } from '../styles';
import { SceneTransition } from '../components/SceneTransition';
import { PopWord } from '../components/PopWord';

/**
 * Minimal closing CTA — logo, button, link.
 * Nothing else. Clean negative space like Vercel/Linear.
 */
export const Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 0.8 },
  });
  const logoOp = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });

  const ctaOp = interpolate(frame, [60, 100], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });
  const ctaY = interpolate(frame, [60, 100], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });

  const linkOp = interpolate(frame, [90, 124], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });

  // Pulsing CTA glow
  const glowPulse = interpolate(
    Math.sin(frame / 15 * Math.PI * 2),
    [-1, 1],
    [0.15, 0.4],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) },
  );

  return (
    <SceneTransition durationInFrames={210} fadeInDuration={30} fadeOutDuration={40}>
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Logo + Wordmark */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          opacity: logoOp,
          transform: `scale(${logoSpring})`,
        }}
      >
        <Img
          src={staticFile('logo.png')}
          style={{
            width: 96,
            height: 96,
            objectFit: 'contain',
            filter: `drop-shadow(0 0 30px rgba(0,229,153,0.35)) drop-shadow(0 16px 36px rgba(0,0,0,0.3))`,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span
            style={{
              fontSize: 48,
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
              fontSize: 48,
              fontWeight: 700,
              color: colors.primary,
              fontFamily: fonts.sans,
              letterSpacing: '-0.04em',
            }}
          >
            Folio
          </span>
        </div>
      </div>

      {/* CTA */}
      <div
        style={{
          marginTop: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          opacity: ctaOp,
          transform: `translateY(${ctaY}px)`,
        }}
      >
        <div
          style={{
            padding: '14px 44px',
            borderRadius: radius.lg,
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryHover})`,
            boxShadow: `0 8px 24px rgba(0, 229, 153, ${glowPulse}), 0 0 60px rgba(0, 229, 153, ${glowPulse * 0.4})`,
          }}
        >
          <span
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: colors.bg,
              fontFamily: fonts.sans,
              display: 'flex',
              gap: 6,
            }}
          >
            <span>Start Your</span>
            <PopWord delay={76} effect="elastic" color={colors.bg} style={{ textShadow: 'none' }}>
              Investing
            </PopWord>
            <span>Story</span>
          </span>
        </div>

        <span
          style={{
            fontSize: 13,
            color: colors.textDim,
            fontFamily: fonts.mono,
            fontWeight: 400,
            opacity: linkOp,
          }}
        >
          Free & open source · github.com/vincrypt/flowfolio
        </span>
      </div>
    </AbsoluteFill>
    </SceneTransition>
  );
};
