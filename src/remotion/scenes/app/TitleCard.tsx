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

/**
 * Opening title card — "FlowFolio in Action"
 */
export const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, stiffness: 80, mass: 0.5 },
  });

  const titleOpacity = interpolate(frame, [30, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const subtitleOpacity = interpolate(frame, [50, 80], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const badgeOpacity = interpolate(frame, [70, 100], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #0a0a0a 0%, #050505 50%, #020204 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Subtle radial glow */}
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(0, 229, 153, 0.06) 0%, transparent 70%)`,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Logo */}
      <Img
        src={staticFile('logo.png')}
        style={{
          width: 80,
          height: 80,
          objectFit: 'contain',
          transform: `scale(${logoScale})`,
          filter: `drop-shadow(0 0 30px rgba(0, 229, 153, 0.3))`,
        }}
      />

      {/* Title */}
      <div
        style={{
          fontSize: 48,
          fontWeight: 800,
          color: colors.text,
          fontFamily: fonts.sans,
          letterSpacing: '-0.03em',
          opacity: titleOpacity,
          transform: `translateY(${interpolate(frame, [30, 60], [20, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
          })}px)`,
        }}
      >
        FlowFolio{' '}
        <span style={{ color: colors.primary }}>in Action</span>
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 18,
          color: colors.textMuted,
          fontFamily: fonts.sans,
          opacity: subtitleOpacity,
          transform: `translateY(${interpolate(frame, [50, 80], [15, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
          })}px)`,
        }}
      >
        Every feature, real results, zero cloud
      </div>

      {/* Tech badges */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          opacity: badgeOpacity,
          marginTop: 8,
        }}
      >
        {['Tauri 2', 'React 19', 'Rust', 'SQLite'].map((tech) => (
          <div
            key={tech}
            style={{
              fontSize: 11,
              fontFamily: fonts.mono,
              color: colors.textDim,
              padding: '4px 12px',
              borderRadius: 4,
              border: `1px solid ${colors.border}`,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            {tech}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
