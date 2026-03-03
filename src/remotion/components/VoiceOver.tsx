import React from 'react';
import { Sequence, interpolate, useVideoConfig , Easing } from 'remotion';
import { Audio } from '@remotion/media';
import { staticFile } from 'remotion';
import type { NarrationSegment } from '../lib/narrationScripts';

interface VoiceOverProps {
  /** Which composition's VO folder to read from */
  compositionId: 'showcase' | 'intro' | 'ig';
  /** Narration segments with timing info */
  segments: NarrationSegment[];
  /** Master VO volume 0-1 */
  volume?: number;
}

/**
 * Plays pre-generated voiceover audio files at the correct frame timings.
 * Each segment is a separate .wav file positioned via <Sequence>.
 */
export const VoiceOver: React.FC<VoiceOverProps> = ({
  compositionId,
  segments,
  volume = 0.85,
}) => {
  const { durationInFrames } = useVideoConfig();

  return (
    <>
      {segments.map((seg) => {
        const fadeIn = 5;
        const fadeOut = 8;
        return (
          <Sequence key={seg.id} from={seg.startFrame} durationInFrames={seg.durationInFrames}>
            <Audio
              src={staticFile(`audio/vo/${compositionId}/${seg.id}.wav`)}
              volume={(f) => {
                const totalFrames = Math.min(seg.durationInFrames, durationInFrames - seg.startFrame);
                const vIn = interpolate(f, [0, fadeIn], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                easing: Easing.out(Easing.cubic),
                });
                const vOut = interpolate(f, [totalFrames - fadeOut, totalFrames], [1, 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                easing: Easing.out(Easing.cubic),
                });
                return volume * Math.min(vIn, vOut);
              }}
            />
          </Sequence>
        );
      })}
    </>
  );
};
