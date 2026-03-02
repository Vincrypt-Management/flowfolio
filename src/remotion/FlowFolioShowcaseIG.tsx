import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';
import { colors, fonts, radius } from './styles';
import { AudioTrack } from './audio/AudioTrack';
import { buildIGDemoAudio } from './audio/SynthEngine';
import { VideoRNG, VideoSeedContext } from './lib/uniqueness';
import {
  hookVariants,
  pickStoryBeat,
  taglineVariants,
} from './lib/contentPools';
import { VibeStudioDemo } from './scenes/VibeStudioDemo';
import { BacktestDemo } from './scenes/BacktestDemo';
import { QuantDemo } from './scenes/QuantDemo';
import { OptimizerDemo } from './scenes/OptimizerDemo';
import { AIChatDemo } from './scenes/AIChatDemo';

interface IGDemoProps {
  seed?: number;
}

/**
 * Instagram Demo Reel — 1080x1920 (9:16), ~50s at 60fps = 3000 frames
 * Story-driven feature showcase: Hook → Logo → 5 feature demos with story beats → CTA
 * Condensed version of the full Showcase for social media.
 */

// ─── Scene: Hook ────────────────────────────────────────────────
const IGDemoHook: React.FC<{ line1: string; line2: string }> = ({ line1, line2 }) => {
  const frame = useCurrentFrame();

  const line1Op = interpolate(frame, [16, 52], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const line1Y = interpolate(frame, [16, 52], [14, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const line2Op = interpolate(frame, [56, 88], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const line2Y = interpolate(frame, [56, 88], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const fadeOut = interpolate(frame, [200, 236], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '0 48px' }}>
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: colors.text,
            fontFamily: fonts.sans,
            letterSpacing: '-0.04em',
            textAlign: 'center',
            lineHeight: 1.15,
            opacity: line1Op,
            transform: `translateY(${line1Y}px)`,
          }}
        >
          {line1}
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: colors.textMuted,
            fontFamily: fonts.sans,
            letterSpacing: '-0.04em',
            textAlign: 'center',
            lineHeight: 1.15,
            opacity: line2Op,
            transform: `translateY(${line2Y}px)`,
          }}
        >
          {line2}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: Logo Reveal ─────────────────────────────────────────
const IGDemoLogo: React.FC<{ tagline: string }> = ({ tagline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 0.8 },
  });
  const logoScale = interpolate(logoSpring, [0, 1], [0.8, 1]);
  const logoOp = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const wordOp = interpolate(frame, [50, 90], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const wordY = interpolate(frame, [50, 90], [8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const tagOp = interpolate(frame, [100, 136], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const fadeOut = interpolate(frame, [200, 236], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        <div style={{ transform: `scale(${logoScale})`, opacity: logoOp }}>
          <Img
            src={staticFile('icon-only.png')}
            style={{
              width: 140,
              height: 140,
              objectFit: 'contain',
              filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))',
            }}
          />
        </div>

        <div
          style={{
            opacity: wordOp,
            transform: `translateY(${wordY}px)`,
            display: 'flex',
            alignItems: 'baseline',
          }}
        >
          <span style={{ fontSize: 72, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>
            Flow
          </span>
          <span style={{ fontSize: 72, fontWeight: 700, color: colors.primary, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>
            Folio
          </span>
        </div>

        <span
          style={{
            fontSize: 18,
            color: colors.textMuted,
            fontFamily: fonts.mono,
            opacity: tagOp,
            letterSpacing: '0.02em',
          }}
        >
          {tagline}
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: Story Beat (IG Portrait) ────────────────────────────
const IGDemoStoryBeat: React.FC<{ line: string; accentColor: string }> = ({ line, accentColor }) => {
  const frame = useCurrentFrame();

  const lineOp = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const lineY = interpolate(frame, [10, 40], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const accentWidth = interpolate(frame, [5, 35], [0, 60], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const fadeOut = interpolate(frame, [100, 130], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '0 60px' }}>
        <div
          style={{
            width: accentWidth,
            height: 3,
            borderRadius: 2,
            background: accentColor,
            boxShadow: `0 0 12px ${accentColor}80`,
          }}
        />
        <div
          style={{
            fontSize: 38,
            fontWeight: 700,
            color: colors.text,
            fontFamily: fonts.sans,
            letterSpacing: '-0.03em',
            textAlign: 'center',
            lineHeight: 1.2,
            opacity: lineOp,
            transform: `translateY(${lineY}px)`,
          }}
        >
          {line}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: CTA ─────────────────────────────────────────────────
const IGDemoCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 0.8 },
  });
  const logoOp = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const ctaOp = interpolate(frame, [60, 96], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const ctaY = interpolate(frame, [60, 96], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const linkOp = interpolate(frame, [90, 120], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const platforms = ['macOS', 'Windows', 'Linux'];
  const platOp = interpolate(frame, [110, 144], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          opacity: logoOp,
          transform: `scale(${logoSpring})`,
        }}
      >
        <Img
          src={staticFile('icon-only.png')}
          style={{
            width: 112,
            height: 112,
            objectFit: 'contain',
            filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: 56, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>
            Flow
          </span>
          <span style={{ fontSize: 56, fontWeight: 700, color: colors.primary, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>
            Folio
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          opacity: ctaOp,
          transform: `translateY(${ctaY}px)`,
        }}
      >
        <div
          style={{
            padding: '16px 52px',
            borderRadius: radius.lg,
            background: colors.primary,
            boxShadow: '0 8px 24px rgba(0, 229, 153, 0.2)',
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 600, color: colors.bg, fontFamily: fonts.sans }}>
            Download Free
          </span>
        </div>

        <span style={{ fontSize: 14, fontFamily: fonts.mono, color: colors.primary, opacity: linkOp }}>
          Free & open source
        </span>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 32, opacity: platOp }}>
        {platforms.map((p) => (
          <span key={p} style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.textDim }}>
            {p}
          </span>
        ))}
      </div>

      <span style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.mono, marginTop: 16, opacity: linkOp }}>
        github.com/vincrypt/flowfolio
      </span>
    </AbsoluteFill>
  );
};

// ─── Background ─────────────────────────────────────────────────
const IGDemoBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const angle = (frame / 1200) * Math.PI * 2;
  const x = 50 + Math.cos(angle) * 8;
  const y = 45 + Math.sin(angle) * 6;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: colors.bg }} />
      <AbsoluteFill style={{ opacity: 0.025 }}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="igDemoDot" x="0" y="0" width="44" height="44" patternUnits="userSpaceOnUse">
              <circle cx="22" cy="22" r="0.5" fill="#ffffff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#igDemoDot)" />
        </svg>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0, 229, 153, 0.06) 0%, transparent 70%)',
          transform: 'translate(-50%,-50%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${100 - x}%`,
          top: `${100 - y}%`,
          width: 350,
          height: 350,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(129, 140, 248, 0.04) 0%, transparent 70%)',
          transform: 'translate(-50%,-50%)',
          filter: 'blur(80px)',
        }}
      />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

// ─── Feature Demo Wrapper (scales landscape demos into portrait frame) ───
const DemoFrame: React.FC<{ children: React.ReactNode; label: string; accentColor: string }> = ({
  children,
  label,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  const frameOp = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const fadeOut = interpolate(frame, [280, 310], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const labelOp = interpolate(frame, [10, 36], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      {/* Feature label */}
      <div
        style={{
          position: 'absolute',
          top: 280,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          opacity: labelOp,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: accentColor,
            boxShadow: `0 0 8px ${accentColor}`,
          }}
        />
        <span
          style={{
            fontSize: 16,
            fontFamily: fonts.mono,
            color: accentColor,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>

      {/* Demo content — scaled to fit portrait */}
      <div
        style={{
          width: 960,
          height: 540,
          transform: 'scale(0.95)',
          borderRadius: radius.xl,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.1)',
          opacity: frameOp,
          position: 'relative',
          marginTop: 60,
        }}
      >
        <AbsoluteFill style={{ background: colors.bg }}>
          {children}
        </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
};

// ─── Main Composition ───────────────────────────────────────────
export const FlowFolioShowcaseIG: React.FC<IGDemoProps> = ({ seed }) => {
  const rng = useMemo(() => new VideoRNG(seed), [seed]);
  const hookVariant = useMemo(() => rng.pick(hookVariants), [rng]);
  const tagline = useMemo(() => rng.pick(taglineVariants), [rng]);

  // Story beats for each demo
  const beatVibe = useMemo(() => pickStoryBeat(rng, 'vibe-studio'), [rng]);
  const beatBacktest = useMemo(() => pickStoryBeat(rng, 'backtest'), [rng]);
  const beatQuant = useMemo(() => pickStoryBeat(rng, 'quant'), [rng]);
  const beatOptimizer = useMemo(() => pickStoryBeat(rng, 'optimizer'), [rng]);
  const beatChat = useMemo(() => pickStoryBeat(rng, 'ai-chat'), [rng]);

  const audioSeed = rng.seed;
  const audioGen = useMemo(
    () => (dur: number) => buildIGDemoAudio(dur, audioSeed),
    [audioSeed]
  );

  // Timeline (60fps):
  // Hook:          0-300     (5s)
  // Logo:        280-560     (4.7s)
  // Beat+Vibe:   540-940     (6.7s)  — beat 540-680, demo 660-940
  // Beat+Back:   920-1320    (6.7s)
  // Beat+Quant: 1300-1700    (6.7s)
  // Beat+Opt:   1680-2080    (6.7s)
  // Beat+AI:    2060-2460    (6.7s)
  // CTA:        2440-2800    (6s)
  // Total: 2800 frames = ~46.7s

  return (
    <VideoSeedContext.Provider value={rng}>
      <AbsoluteFill style={{ backgroundColor: colors.bg, fontFamily: fonts.sans, overflow: 'hidden' }}>
        <IGDemoBackground />
        <AudioTrack generator={audioGen} volume={0.8} fadeInFrames={20} fadeOutFrames={30} />

        {/* Hook */}
        <Sequence from={0} durationInFrames={300}>
          <IGDemoHook line1={hookVariant.line1} line2={hookVariant.line2} />
        </Sequence>

        {/* Logo */}
        <Sequence from={280} durationInFrames={280}>
          <IGDemoLogo tagline={tagline} />
        </Sequence>

        {/* ═══ Vibe Studio ═══ */}
        <Sequence from={540} durationInFrames={140}>
          <IGDemoStoryBeat line={beatVibe.line} accentColor={beatVibe.accentColor} />
        </Sequence>
        <Sequence from={660} durationInFrames={320}>
          <DemoFrame label="Vibe Studio" accentColor={colors.primary}>
            <VibeStudioDemo />
          </DemoFrame>
        </Sequence>

        {/* ═══ Backtest ═══ */}
        <Sequence from={960} durationInFrames={140}>
          <IGDemoStoryBeat line={beatBacktest.line} accentColor={beatBacktest.accentColor} />
        </Sequence>
        <Sequence from={1080} durationInFrames={320}>
          <DemoFrame label="Backtest Engine" accentColor={colors.cyan}>
            <BacktestDemo />
          </DemoFrame>
        </Sequence>

        {/* ═══ Quant ═══ */}
        <Sequence from={1380} durationInFrames={140}>
          <IGDemoStoryBeat line={beatQuant.line} accentColor={beatQuant.accentColor} />
        </Sequence>
        <Sequence from={1500} durationInFrames={320}>
          <DemoFrame label="Quant Analysis" accentColor={colors.blue}>
            <QuantDemo />
          </DemoFrame>
        </Sequence>

        {/* ═══ Optimizer ═══ */}
        <Sequence from={1800} durationInFrames={140}>
          <IGDemoStoryBeat line={beatOptimizer.line} accentColor={beatOptimizer.accentColor} />
        </Sequence>
        <Sequence from={1920} durationInFrames={320}>
          <DemoFrame label="AI Optimizer" accentColor={colors.amber}>
            <OptimizerDemo />
          </DemoFrame>
        </Sequence>

        {/* ═══ AI Chat ═══ */}
        <Sequence from={2220} durationInFrames={140}>
          <IGDemoStoryBeat line={beatChat.line} accentColor={beatChat.accentColor} />
        </Sequence>
        <Sequence from={2340} durationInFrames={320}>
          <DemoFrame label="Portfolio Agent" accentColor={colors.accent}>
            <AIChatDemo />
          </DemoFrame>
        </Sequence>

        {/* CTA */}
        <Sequence from={2640} durationInFrames={360}>
          <IGDemoCTA />
        </Sequence>
      </AbsoluteFill>
    </VideoSeedContext.Provider>
  );
};
