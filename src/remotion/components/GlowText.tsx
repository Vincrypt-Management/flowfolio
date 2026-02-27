import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { colors, fonts } from '../styles';

interface GlowTextProps {
  text: string;
  fontSize?: number;
  color?: string;
  glowColor?: string;
  delay?: number;
  style?: React.CSSProperties;
  gradient?: boolean;
}

export const GlowText: React.FC<GlowTextProps> = ({
  text,
  fontSize = 48,
  color = colors.text,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame - delay, [0, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame - delay, [0, 22], [8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        fontSize,
        fontWeight: 700,
        color,
        opacity,
        transform: `translateY(${y}px)`,
        letterSpacing: '-0.03em',
        fontFamily: fonts.sans,
        lineHeight: 1.1,
        ...style,
      }}
    >
      {text}
    </div>
  );
};
