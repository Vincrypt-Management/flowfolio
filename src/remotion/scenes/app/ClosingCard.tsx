import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  staticFile,
  Img,
} from 'remotion';
import { colors, fonts, gradients } from '../../styles';

export const ClosingCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({
    frame: frame - 15,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.5 },
  });

  const ctaOpacity = interpolate(frame, [50, 80], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const featuresOpacity = interpolate(frame, [70, 100], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const linkOpacity = interpolate(frame, [100, 130], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const pulseCycle = Math.sin(frame * 0.08) * 0.3 + 0.7;

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #0a0a0a 0%, #050505 40%, #020204 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* Glow */}
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(0, 229, 153, ${0.04 * pulseCycle}) 0%, transparent 70%)`,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Logo */}
      <Img
        src={staticFile('logo.png')}
        style={{
          width: 72,
          height: 72,
          objectFit: 'contain',
          transform: `scale(${logoScale})`,
          filter: `drop-shadow(0 0 24px rgba(0, 229, 153, ${0.3 * pulseCycle}))`,
        }}
      />

      {/* CTA */}
      <div
        style={{
          fontSize: 36,
          fontWeight: 800,
          color: colors.text,
          fontFamily: fonts.sans,
          letterSpacing: '-0.03em',
          textAlign: 'center',
          opacity: ctaOpacity,
        }}
      >
        Your data. Your strategy.{' '}
        <span style={{ color: colors.primary }}>Your edge.</span>
      </div>

      {/* Feature highlights */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          opacity: featuresOpacity,
        }}
      >
        {[
          'Fully Offline',
          'AI-Powered',
          'Quant-Grade',
          'Cross-Platform',
        ].map((feature) => (
          <div
            key={feature}
            style={{
              fontSize: 13,
              fontFamily: fonts.sans,
              color: colors.textMuted,
              padding: '6px 14px',
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            {feature}
          </div>
        ))}
      </div>

      {/* Platforms */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          opacity: featuresOpacity,
          marginTop: 4,
        }}
      >
        {['macOS', 'Windows', 'Linux'].map((platform) => (
          <div
            key={platform}
            style={{
              fontSize: 11,
              fontFamily: fonts.mono,
              color: colors.textDim,
              padding: '4px 10px',
              borderRadius: 4,
              background: '#111',
              border: '1px solid #1a1a1a',
            }}
          >
            {platform}
          </div>
        ))}
      </div>

      {/* Download button */}
      <div
        style={{
          opacity: linkOpacity,
          marginTop: 8,
          padding: '10px 28px',
          borderRadius: 8,
          background: gradients.primaryToAccent,
          fontSize: 14,
          fontWeight: 700,
          color: '#000',
          fontFamily: fonts.sans,
          boxShadow: `0 0 20px rgba(0, 229, 153, ${0.2 * pulseCycle})`,
        }}
      >
        Download Free on GitHub
      </div>

      {/* Link */}
      <div
        style={{
          fontSize: 12,
          fontFamily: fonts.mono,
          color: colors.textDim,
          opacity: linkOpacity,
        }}
      >
        github.com/vincrypt/flowfolio
      </div>
    </AbsoluteFill>
  );
};
