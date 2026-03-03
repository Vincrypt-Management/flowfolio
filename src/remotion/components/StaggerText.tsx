import React from 'react';
import { interpolate, useCurrentFrame , Easing } from 'remotion';
import { colors, fonts } from '../styles';

/**
 * Text that reveals word-by-word with a clean fade + subtle rise.
 */
interface StaggerTextProps {
  text: string;
  fontSize?: number;
  color?: string;
  delay?: number;
  mode?: 'chars' | 'words';
  fontWeight?: number;
  fontFamily?: string;
  letterSpacing?: string;
  style?: React.CSSProperties;
}

export const StaggerText: React.FC<StaggerTextProps> = ({
  text,
  fontSize = 48,
  color = colors.text,
  delay = 0,
  mode = 'words',
  fontWeight = 700,
  fontFamily = fonts.sans,
  letterSpacing = '-0.02em',
  style,
}) => {
  const frame = useCurrentFrame();
  const units = mode === 'chars' ? text.split('') : text.split(' ');

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: mode === 'chars' ? 0 : fontSize * 0.3,
        fontSize,
        fontWeight,
        fontFamily,
        letterSpacing,
        lineHeight: 1.1,
        ...style,
      }}
    >
      {units.map((unit, i) => {
        const unitDelay = delay + i * (mode === 'chars' ? 1.5 : 4);
        const op = interpolate(frame - unitDelay, [0, 35], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
        });
        const y = interpolate(frame - unitDelay, [0, 35], [8, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
        });

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              color,
              opacity: op,
              transform: `translateY(${y}px)`,
            }}
          >
            {unit}
          </span>
        );
      })}
    </div>
  );
};
