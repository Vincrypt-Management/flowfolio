import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { colors, fonts } from './styles';
import { Background } from './components/Background';
import { StoryBeat } from './components/StoryBeat';
import { HookScene } from './scenes/HookScene';
import { AudioTrack } from './audio/AudioTrack';
import { buildShowcaseAudio } from './audio/SynthEngine';
import { LogoReveal } from './scenes/LogoReveal';
import { PrivacyMessage } from './scenes/PrivacyMessage';
import { VibeStudioDemo } from './scenes/VibeStudioDemo';
import { PortfolioDemo } from './scenes/PortfolioDemo';
import { BacktestDemo } from './scenes/BacktestDemo';
import { QuantDemo } from './scenes/QuantDemo';
import { FundamentalsDemo } from './scenes/FundamentalsDemo';
import { OptimizerDemo } from './scenes/OptimizerDemo';
import { JournalDemo } from './scenes/JournalDemo';
import { AIChatDemo } from './scenes/AIChatDemo';
import { Platforms } from './scenes/Platforms';
import { Closing } from './scenes/Closing';
import { VideoRNG, VideoSeedContext } from './lib/uniqueness';
import {
  hookVariants,
  pickPainPoints,
  pickStoryBeat,
  pickBGVariation,
  animationStyles,
  type AnimationStyle,
} from './lib/contentPools';

interface ShowcaseProps {
  seed?: number;
}

/**
 * Full product showcase — story-driven sequence with narrative arc.
 * ~88s at 30fps = 2640 frames
 * Now seed-driven: every render with a different seed produces unique content.
 */
export const FlowFolioShowcase: React.FC<ShowcaseProps> = ({ seed }) => {
  const rng = useMemo(() => new VideoRNG(seed), [seed]);

  // Seed-driven content selection
  const hookVariant = useMemo(() => rng.pick(hookVariants), [rng]);
  const painPoints = useMemo(() => pickPainPoints(rng), [rng]);
  const bgVariation = useMemo(() => pickBGVariation(rng), [rng]);

  // Story beat selection — each scene gets a unique narrative line
  const beatVibe = useMemo(() => pickStoryBeat(rng, 'vibe-studio'), [rng]);
  const beatPortfolio = useMemo(() => pickStoryBeat(rng, 'portfolio'), [rng]);
  const beatBacktest = useMemo(() => pickStoryBeat(rng, 'backtest'), [rng]);
  const beatQuant = useMemo(() => pickStoryBeat(rng, 'quant'), [rng]);
  const beatOptimizer = useMemo(() => pickStoryBeat(rng, 'optimizer'), [rng]);
  const beatJournal = useMemo(() => pickStoryBeat(rng, 'journal'), [rng]);
  const beatChat = useMemo(() => pickStoryBeat(rng, 'ai-chat'), [rng]);

  // Animation style variety — each beat gets a different reveal style
  const accentVariants = ['line', 'dots', 'glow', 'gradient'] as const;
  const beatStyles = useMemo(() => {
    const styles = rng.shuffle([...animationStyles]) as AnimationStyle[];
    const accents = rng.shuffle([...accentVariants]);
    return { styles, accents };
  }, [rng]);

  // Seed-driven background music
  const audioSeed = rng.seed;
  const audioGen = useMemo(
    () => (dur: number) => buildShowcaseAudio(dur, audioSeed),
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
        <AudioTrack generator={audioGen} volume={0.7} fadeInFrames={25} fadeOutFrames={30} />

        {/* ═══ ACT 1: THE PROBLEM ═══ */}
        <Sequence from={0} durationInFrames={150}>
          <HookScene durationInFrames={150} hookVariant={hookVariant} painPointsData={painPoints} />
        </Sequence>

        {/* ═══ ACT 2: THE DISCOVERY ═══ */}
        <Sequence from={140} durationInFrames={125}>
          <LogoReveal />
        </Sequence>

        <Sequence from={255} durationInFrames={130}>
          <PrivacyMessage />
        </Sequence>

        {/* ═══ ACT 3: THE JOURNEY ═══ */}

        <Sequence from={375} durationInFrames={70}>
          <StoryBeat line={beatVibe.line} accentColor={beatVibe.accentColor}
            animStyle={beatStyles.styles[0]} accentVariant={beatStyles.accents[0]} />
        </Sequence>

        <Sequence from={435} durationInFrames={230}>
          <VibeStudioDemo />
        </Sequence>

        <Sequence from={655} durationInFrames={70}>
          <StoryBeat line={beatPortfolio.line} accentColor={beatPortfolio.accentColor}
            animStyle={beatStyles.styles[1]} accentVariant={beatStyles.accents[1]} />
        </Sequence>

        <Sequence from={715} durationInFrames={230}>
          <PortfolioDemo />
        </Sequence>

        <Sequence from={935} durationInFrames={70}>
          <StoryBeat line={beatBacktest.line} accentColor={beatBacktest.accentColor}
            animStyle={beatStyles.styles[2]} accentVariant={beatStyles.accents[2]} />
        </Sequence>

        <Sequence from={995} durationInFrames={230}>
          <BacktestDemo />
        </Sequence>

        <Sequence from={1215} durationInFrames={70}>
          <StoryBeat line={beatQuant.line} accentColor={beatQuant.accentColor}
            animStyle={beatStyles.styles[3]} accentVariant={beatStyles.accents[3]} />
        </Sequence>

        <Sequence from={1275} durationInFrames={190}>
          <QuantDemo />
        </Sequence>

        <Sequence from={1455} durationInFrames={200}>
          <FundamentalsDemo />
        </Sequence>

        <Sequence from={1645} durationInFrames={70}>
          <StoryBeat line={beatOptimizer.line} accentColor={beatOptimizer.accentColor}
            animStyle={beatStyles.styles[0]} accentVariant={beatStyles.accents[1]} />
        </Sequence>

        <Sequence from={1705} durationInFrames={220}>
          <OptimizerDemo />
        </Sequence>

        <Sequence from={1915} durationInFrames={70}>
          <StoryBeat line={beatJournal.line} accentColor={beatJournal.accentColor}
            animStyle={beatStyles.styles[1]} accentVariant={beatStyles.accents[2]} />
        </Sequence>

        <Sequence from={1975} durationInFrames={200}>
          <JournalDemo />
        </Sequence>

        <Sequence from={2165} durationInFrames={70}>
          <StoryBeat line={beatChat.line} accentColor={beatChat.accentColor}
            animStyle={beatStyles.styles[2]} accentVariant={beatStyles.accents[3]} />
        </Sequence>

        <Sequence from={2225} durationInFrames={200}>
          <AIChatDemo />
        </Sequence>

        {/* ═══ ACT 4: THE RESOLUTION ═══ */}
        <Sequence from={2415} durationInFrames={130}>
          <Platforms />
        </Sequence>

        <Sequence from={2535} durationInFrames={105}>
          <Closing />
        </Sequence>
      </AbsoluteFill>
    </VideoSeedContext.Provider>
  );
};
