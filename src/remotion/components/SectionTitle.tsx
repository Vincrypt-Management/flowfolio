import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { colors, fonts } from '../styles';

/**
 * Cinematic section title card shown between feature demo groups.
 * Displays a category label + title with branded accent line.
 */
interface SectionTitleProps {
  category: string;
  title: string;
  /** Accent color for the category label and line */
  accentColor?: string;
  durationInFrames: number;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({
  category,
  title,
  accentColor = colors.primary,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade envelope
  const fadeIn = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  // Accent line extends
  const lineWidth = interpolate(frame, [5, 30], [0, 80], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Category label
  const catOp = interpolate(frame, [8, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const catX = interpolate(frame, [8, 22], [-15, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Title spring
  const titleSpring = spring({
    frame: Math.max(0, frame - 12),
    fps,
    config: { damping: 16, stiffness: 100, mass: 0.6 },
  });
  const titleOp = interpolate(frame, [12, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Subtle number/dot decoration
  const dotOp = interpolate(frame, [20, 35], [0, 0.4], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        opacity,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        {/* Accent line */}
        <div
          style={{
            width: lineWidth,
            height: 2,
            background: `linear-gradient(90deg, ${accentColor}, transparent)`,
            borderRadius: 1,
            boxShadow: `0 0 12px ${accentColor}40`,
          }}
        />

        {/* Category label */}
        <div
          style={{
            opacity: catOp,
            transform: `translateX(${catX}px)`,
            fontSize: 13,
            fontFamily: fonts.mono,
            color: accentColor,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            fontWeight: 600,
          }}
        >
          {category}
        </div>

        {/* Main title */}
        <div
          style={{
            opacity: titleOp,
            transform: `scale(${titleSpring})`,
            fontSize: 56,
            fontWeight: 800,
            color: colors.text,
            fontFamily: fonts.sans,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>

        {/* Decorative dot row */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            opacity: dotOp,
            marginTop: 4,
          }}
        >
          {[accentColor, colors.textDim, colors.textDim].map((c, i) => (
            <div
              key={i}
              style={{
                width: i === 0 ? 8 : 4,
                height: 4,
                borderRadius: 2,
                background: c,
                opacity: i === 0 ? 1 : 0.4,
              }}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
