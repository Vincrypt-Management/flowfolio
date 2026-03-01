import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { colors, fonts } from './styles';
import { Background } from './components/Background';
import { HookScene } from './scenes/HookScene';
import { LogoReveal } from './scenes/LogoReveal';
import { PrivacyMessage } from './scenes/PrivacyMessage';
import { Platforms } from './scenes/Platforms';
import { Closing } from './scenes/Closing';
import { AudioTrack } from './audio/AudioTrack';
import { buildIntroAudio } from './audio/SynthEngine';
import { VideoRNG, VideoSeedContext } from './lib/uniqueness';
import { hookVariants, pickBGVariation } from './lib/contentPools';

interface IntroProps {
  seed?: number;
}

// Intro: Hook → Logo → Privacy → Platforms → Closing (~24.3s = 1460 frames at 60fps)
// Audio: Formal, professional — warm pad, refined chimes, subtle presence
export const FlowFolioIntro: React.FC<IntroProps> = ({ seed }) => {
  const rng = useMemo(() => new VideoRNG(seed), [seed]);
  const hookVariant = useMemo(() => rng.pick(hookVariants), [rng]);
  const bgVariation = useMemo(() => pickBGVariation(rng), [rng]);

  const audioSeed = rng.seed;
  const audioGen = useMemo(
    () => (dur: number) => buildIntroAudio(dur, audioSeed),
    [audioSeed]
  );

  return (
    <VideoSeedContext.Provider value={rng}>
      <AbsoluteFill
        style={{
          backgroundColor: colors.bg,
          fontFamily: fonts.sans,
          overflow: 'hidden',
        }}
      >
        <Background variant="hero" bgVariation={bgVariation} />
        <AudioTrack generator={audioGen} volume={0.75} fadeInFrames={40} fadeOutFrames={50} />

        {/* Hook (0-300) — compact problem statement */}
        <Sequence from={0} durationInFrames={300}>
          <HookScene durationInFrames={300} compact hookVariant={hookVariant} />
        </Sequence>

        {/* Logo (280-580) */}
        <Sequence from={280} durationInFrames={300}>
          <LogoReveal />
        </Sequence>

        {/* Privacy (560-900) */}
        <Sequence from={560} durationInFrames={340}>
          <PrivacyMessage />
        </Sequence>

        {/* Platforms (880-1180) */}
        <Sequence from={880} durationInFrames={300}>
          <Platforms />
        </Sequence>

        {/* Closing (1160-1460) */}
        <Sequence from={1160} durationInFrames={300}>
          <Closing />
        </Sequence>
      </AbsoluteFill>
    </VideoSeedContext.Provider>
  );
};
