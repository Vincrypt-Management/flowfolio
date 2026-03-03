import React from 'react';
import { interpolate, useCurrentFrame, Easing } from 'remotion';
import { colors, radius } from '../styles';

interface GlassCardProps {
  children: React.ReactNode;
  delay?: number;
  width?: number | string;
  height?: number | string;
  padding?: number | string;
  style?: React.CSSProperties;
  glowColor?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  delay = 0,
  width,
  height,
  padding = 28,
  style,
  glowColor,
}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - delay;

  const opacity = interpolate(localFrame, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });
  const translateY = interpolate(localFrame, [0, 40], [12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });

  // Shimmer sweep: diagonal highlight that crosses once after card appears
  const shimmerX = interpolate(localFrame, [20, 100], [-100, 200], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });
  const shimmerOp = localFrame > 20 && localFrame < 100 ? 1 : 0;

  // Subtle border glow pulse
  const glowStr = glowColor
    ? interpolate(Math.sin(frame / 80 * Math.PI * 2), [-1, 1], [0.3, 0.7],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
    : 0;

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${colors.glassBorder}`,
        borderRadius: radius['2xl'],
        padding,
        width,
        height,
        opacity,
        transform: `translateY(${translateY}px)`,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: [
          '0 4px 24px rgba(0,0,0,0.25)',
          'inset 0 1px 0 rgba(255,255,255,0.06)',
          glowColor ? `0 0 20px ${glowColor}${Math.min(255, Math.max(0, Math.round(glowStr * 50))).toString(16).padStart(2, '0')}` : '',
        ].filter(Boolean).join(', '),
        ...style,
      }}
    >
      {/* Shimmer sweep overlay */}
      {shimmerOp > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: `linear-gradient(105deg, transparent ${shimmerX - 40}%, rgba(255,255,255,0.08) ${shimmerX}%, transparent ${shimmerX + 40}%)`,
            pointerEvents: 'none',
            borderRadius: radius['2xl'],
          }}
        />
      )}
      {children}
    </div>
  );
};
