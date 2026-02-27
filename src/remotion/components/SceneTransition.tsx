import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

/**
 * Cinematic scene transition — opacity + scale + blur.
 * Scenes gently zoom in on entry and blur out on exit.
 */
interface SceneTransitionProps {
  children: React.ReactNode;
  durationInFrames: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

export const SceneTransition: React.FC<SceneTransitionProps> = ({
  children,
  durationInFrames,
  fadeInDuration = 15,
  fadeOutDuration = 15,
}) => {
  const frame = useCurrentFrame();

  const fadeIn =
    fadeInDuration > 0
      ? interpolate(frame, [0, fadeInDuration], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;
  const fadeOut = interpolate(
    frame,
    [durationInFrames - fadeOutDuration, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  // Gentle scale: 0.97 → 1 on entry, 1 → 1.02 on exit
  const scaleIn = interpolate(frame, [0, fadeInDuration], [0.97, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scaleOut = interpolate(
    frame,
    [durationInFrames - fadeOutDuration, durationInFrames],
    [1, 1.02],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const scale = frame < durationInFrames - fadeOutDuration ? scaleIn : scaleOut;

  // Blur on entry and exit
  const blurIn = interpolate(frame, [0, fadeInDuration], [4, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const blurOut = interpolate(
    frame,
    [durationInFrames - fadeOutDuration, durationInFrames],
    [0, 3],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const blur = frame < durationInFrames - fadeOutDuration ? blurIn : blurOut;

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `scale(${scale})`,
        filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
