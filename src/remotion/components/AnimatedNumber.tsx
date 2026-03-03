import React from 'react';
import { interpolate, useCurrentFrame , Easing } from 'remotion';
import { colors, fonts } from '../styles';

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delay?: number;
  duration?: number;
  fontSize?: number;
  color?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  delay = 0,
  duration = 90,
  fontSize = 36,
  color = colors.text,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });
  const opacity = interpolate(frame - delay, [0, 33], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });

  // Cubic ease-out for satisfying counting
  const eased = 1 - Math.pow(1 - progress, 3);
  const current = value * eased;

  return (
    <span
      style={{
        fontSize,
        fontWeight: 700,
        fontFamily: fonts.mono,
        color,
        opacity,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
      }}
    >
      {prefix}
      {current.toFixed(decimals)}
      {suffix}
    </span>
  );
};
