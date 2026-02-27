import React, { useCallback, useEffect, useState } from 'react';
import { audioBufferToDataUrl } from '@remotion/media-utils';
import {
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  useVideoConfig,
} from 'remotion';
import { Audio } from '@remotion/media';

interface AudioTrackProps {
  /** Function that generates the AudioBuffer */
  generator: (durationSec: number) => Promise<AudioBuffer>;
  /** Master volume 0-1 */
  volume?: number;
  /** Fade in duration in frames */
  fadeInFrames?: number;
  /** Fade out duration in frames */
  fadeOutFrames?: number;
}

/**
 * Generic audio track component.
 * Takes a generator function, renders it to a data URL, and plays it
 * with optional fade in/out.
 */
export const AudioTrack: React.FC<AudioTrackProps> = ({
  generator,
  volume = 0.7,
  fadeInFrames = 15,
  fadeOutFrames = 20,
}) => {
  const [handle] = useState(() => delayRender('Generating audio...'));
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const { fps, durationInFrames } = useVideoConfig();
  const durationSec = durationInFrames / fps;

  const renderAudio = useCallback(async () => {
    try {
      const buffer = await generator(durationSec);
      const dataUrl = audioBufferToDataUrl(buffer);
      setAudioSrc(dataUrl);
      continueRender(handle);
    } catch (err) {
      cancelRender(err);
    }
  }, [generator, durationSec, handle]);

  useEffect(() => {
    renderAudio();
  }, [renderAudio]);

  if (!audioSrc) return null;

  return (
    <Audio
      src={audioSrc}
      volume={(f) => {
        const fadeIn = interpolate(f, [0, fadeInFrames], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const fadeOut = interpolate(
          f,
          [durationInFrames - fadeOutFrames, durationInFrames],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        return volume * Math.min(fadeIn, fadeOut);
      }}
    />
  );
};
