import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { colors, fonts, radius } from '../styles';
import { AnimatedNumber } from './AnimatedNumber';

interface MetricCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delay?: number;
  color?: string;
  accentGlow?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  prefix,
  suffix,
  decimals = 0,
  delay = 0,
  color = colors.primary,
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame - delay, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame - delay, [0, 18], [8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${colors.glassBorder}`,
        borderRadius: radius.xl,
        padding: '20px 24px',
        opacity,
        transform: `translateY(${y}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 160,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: fonts.mono,
          color: colors.textDim,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </div>
      <AnimatedNumber
        value={value}
        prefix={prefix}
        suffix={suffix}
        decimals={decimals}
        delay={delay + 10}
        fontSize={28}
        color={color}
      />
    </div>
  );
};
