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
import { colors, fonts, radius } from '../styles';
import { SceneTransition } from '../components/SceneTransition';

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
  const logoOp = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const ctaOp = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ctaY = interpolate(frame, [30, 50], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const linkOp = interpolate(frame, [45, 62], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <SceneTransition durationInFrames={105} fadeInDuration={15} fadeOutDuration={20}>
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
          src={staticFile('icon-only.png')}
          style={{
            width: 96,
            height: 96,
            objectFit: 'contain',
            filter: 'drop-shadow(0 16px 36px rgba(0,0,0,0.3))',
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
            background: colors.primary,
            boxShadow: `0 8px 24px rgba(0, 229, 153, 0.2)`,
          }}
        >
          <span
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: colors.bg,
              fontFamily: fonts.sans,
            }}
          >
            Start Your Investing Story
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
