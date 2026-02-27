import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
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
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame - delay, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const translateY = interpolate(frame - delay, [0, 20], [8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
