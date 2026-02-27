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

// Intro: Hook → Logo → Privacy → Platforms → Closing (~17.7s = 530 frames)
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
        <AudioTrack generator={audioGen} volume={0.75} fadeInFrames={20} fadeOutFrames={25} />

        {/* Hook (0-90) — compact problem statement */}
        <Sequence from={0} durationInFrames={90}>
          <HookScene durationInFrames={90} compact hookVariant={hookVariant} />
        </Sequence>

        {/* Logo (80-205) */}
        <Sequence from={80} durationInFrames={125}>
          <LogoReveal />
        </Sequence>

        {/* Privacy (195-325) */}
        <Sequence from={195} durationInFrames={130}>
          <PrivacyMessage />
        </Sequence>

        {/* Platforms (315-445) */}
        <Sequence from={315} durationInFrames={130}>
          <Platforms />
        </Sequence>

        {/* Closing (435-530) */}
        <Sequence from={435} durationInFrames={95}>
          <Closing />
        </Sequence>
      </AbsoluteFill>
    </VideoSeedContext.Provider>
  );
};
