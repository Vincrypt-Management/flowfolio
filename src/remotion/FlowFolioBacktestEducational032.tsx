/**
 * FlowFolio Backtest Educational Reel (1080x1920, ~55s)
 *
 * 6 scenes: Hook → Problem → HowTo → Results → Verdict → CTA
 * Design: clean, typographic, solid colors — no gradients.
 * Audio-driven timing via voSegments prop (computed by calculateMetadata in Root.tsx).
 */

import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  Img,
  staticFile,
} from 'remotion';
import { Audio } from '@remotion/media';
import { colors, fonts, radius } from './styles';
import { VideoRNG, VideoSeedContext } from './lib/uniqueness';
import { type VoSegment } from './FlowFolioSecurityEducational031';

// ─── Fallback timing (before audio is generated) ────────────

const FALLBACK_SEGMENTS: VoSegment[] = [
  { id: 'hook',    startFrame: 0,    audioDur: 300, visualDur: 310 },
  { id: 'problem', startFrame: 320,  audioDur: 540, visualDur: 550 },
  { id: 'howto',   startFrame: 880,  audioDur: 660, visualDur: 670 },
  { id: 'results', startFrame: 1560, audioDur: 600, visualDur: 610 },
  { id: 'verdict', startFrame: 2180, audioDur: 660, visualDur: 670 },
  { id: 'cta',     startFrame: 2860, audioDur: 360, visualDur: 390 },
];

// ─── SVG Icon Paths ──────────────────────────────────────────

const PATHS: Record<string, string> = {
  'alert-tri': 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01',
  search:      'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  calendar:    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  sliders:     'M4 6h16M8 6V4m0 4v2M16 12H4m12-2v2m0 0v2M4 18h16m-4-2v2m0 0v2',
  play:        'M5 3l14 9-14 9V3z',
};

const Icon: React.FC<{ name: string; size?: number; color?: string }> = ({
  name, size = 24, color = colors.text,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke={color} strokeWidth={1.5}
    strokeLinecap="round" strokeLinejoin="round">
    <path d={PATHS[name] || PATHS['alert-tri']} />
  </svg>
);

// ─── Animation Helpers ───────────────────────────────────────

function fadeUp(frame: number, delay = 0, duration = 30) {
  const f = frame - delay;
  return {
    opacity: interpolate(f, [0, duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }),
    transform: `translateY(${interpolate(f, [0, duration], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })}px)`,
  };
}

function fadeIn(frame: number, delay = 0, duration = 24) {
  return {
    opacity: interpolate(frame - delay, [0, duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }),
  };
}

function fadeOut(frame: number, dur: number) {
  return interpolate(frame, [dur - 60, dur - 20], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

// ─── Shared Background ───────────────────────────────────────

const SceneBg: React.FC = () => (
  <AbsoluteFill style={{ background: colors.bg }}>
    {/* Subtle dot grid */}
    <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.025 }}>
      <defs>
        <pattern id="btGrid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="20" cy="20" r="0.7" fill="#ffffff" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#btGrid)" />
    </svg>
  </AbsoluteFill>
);

// ─── Scene 1: Hook ───────────────────────────────────────────

const HookScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const iconOp    = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const iconScale = interpolate(frame, [0, 40], [0.8, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.4)) });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 72px', opacity: fadeOut(frame, dur) }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>

        <div style={{ opacity: iconOp, transform: `scale(${iconScale})` }}>
          <div style={{
            width: 100, height: 100, borderRadius: radius.full,
            border: `1.5px solid ${colors.rose}30`,
            background: `${colors.rose}0a`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="alert-tri" size={44} color={colors.rose} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{
            ...fadeUp(frame, 30, 28),
            fontSize: 40, fontWeight: 700, color: colors.text,
            fontFamily: fonts.sans, textAlign: 'center',
            letterSpacing: '-0.03em', lineHeight: 1.1,
          }}>
            Running a strategy blind
          </div>
          <div style={{
            ...fadeUp(frame, 46, 28),
            fontSize: 40, fontWeight: 700, color: colors.rose,
            fontFamily: fonts.sans, textAlign: 'center',
            letterSpacing: '-0.03em', lineHeight: 1.1,
          }}>
            is how you lose money.
          </div>
        </div>

        <div style={{
          ...fadeIn(frame, 70, 24),
          fontSize: 20, color: colors.textMuted,
          fontFamily: fonts.sans, textAlign: 'center',
          lineHeight: 1.6, maxWidth: 680,
        }}>
          Most investors find out the hard way.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 2: Problem ────────────────────────────────────────

const ProblemScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const chartDraw   = interpolate(frame, [40, 160], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const drawdownOp  = interpolate(frame, [155, 195], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const labelOp     = interpolate(frame, [180, 220], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Dash offsets for SVG stroke animation
  const upLen   = 220;
  const downLen = 160;
  const upOffset   = upLen   * (1 - Math.min(chartDraw / 0.65, 1));
  const downOffset = downLen * (1 - Math.max(0, (chartDraw - 0.65) / 0.35));

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 64px', opacity: fadeOut(frame, dur) }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36, width: '100%' }}>

        <div style={{ ...fadeUp(frame, 0, 26), fontSize: 34, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, textAlign: 'center', letterSpacing: '-0.03em' }}>
          Hidden in your history
        </div>

        {/* Chart */}
        <div style={{ width: '100%', height: 200, position: 'relative' }}>
          <svg viewBox="0 0 320 100" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
            {/* Drawdown fill */}
            <rect
              x="195" y="22" width="110" height="60"
              fill={colors.rose} opacity={drawdownOp * 0.08}
            />
            {/* Rise */}
            <polyline
              points="10,72 70,58 130,42 195,22"
              fill="none" stroke={colors.primary} strokeWidth="2.5"
              strokeDasharray={upLen} strokeDashoffset={upOffset}
              strokeLinecap="round"
            />
            {/* Drop */}
            <polyline
              points="195,22 230,48 270,68 305,78"
              fill="none" stroke={colors.rose} strokeWidth="2.5"
              strokeDasharray={downLen} strokeDashoffset={downOffset}
              strokeLinecap="round"
            />
          </svg>

          {/* Drawdown label */}
          <div style={{
            position: 'absolute', right: 8, top: '25%',
            opacity: labelOp,
            padding: '4px 10px', borderRadius: radius.md,
            background: `${colors.rose}12`, border: `1px solid ${colors.rose}20`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.rose, fontFamily: fonts.mono }}>−40% drawdown</span>
          </div>
        </div>

        {/* Caption */}
        <div style={{
          ...fadeIn(frame, 210, 28),
          padding: '20px 28px', borderRadius: radius.xl,
          background: 'rgba(12,12,16,0.7)',
          border: '1px solid rgba(255,255,255,0.07)',
          width: '100%',
        }}>
          <div style={{ fontSize: 19, color: colors.textSoft, fontFamily: fonts.sans, textAlign: 'center', lineHeight: 1.65 }}>
            A great 3-month run can hide a 40% drawdown.<br />
            <span style={{ color: colors.textDim, fontSize: 16 }}>You find it by backtesting — not by watching.</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 3: HowTo ──────────────────────────────────────────

const HowToScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const barW = interpolate(frame, [260, 400], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  const steps = [
    { icon: 'search',   label: 'Pick symbols',    delay: 30,  color: colors.primary },
    { icon: 'calendar', label: 'Set date range',  delay: 90,  color: colors.accent  },
    { icon: 'sliders',  label: 'Choose strategy', delay: 150, color: colors.blue    },
    { icon: 'play',     label: 'Run backtest',    delay: 210, color: colors.amber   },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 64px', opacity: fadeOut(frame, dur) }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}>

        <div style={{ ...fadeUp(frame, 0, 26), fontSize: 34, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, textAlign: 'center', letterSpacing: '-0.03em' }}>
          4 steps in FlowFolio
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          {steps.map((step, i) => {
            const op = interpolate(frame, [step.delay, step.delay + 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const x  = interpolate(frame, [step.delay, step.delay + 28], [18, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
            return (
              <div key={step.label} style={{
                opacity: op, transform: `translateX(${x}px)`,
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '15px 22px', borderRadius: radius.xl,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${step.color}18`,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: radius.md,
                  border: `1px solid ${step.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: step.color, fontFamily: fonts.mono }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <Icon name={step.icon} size={18} color={step.color} />
                <span style={{ fontSize: 19, fontWeight: 500, color: colors.textSoft, fontFamily: fonts.sans }}>{step.label}</span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div style={{ width: '100%', height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barW * 100}%`, background: colors.primary, borderRadius: 1 }} />
        </div>

        <div style={{ ...fadeIn(frame, 300, 22), fontSize: 13, fontFamily: fonts.mono, color: colors.textDim, letterSpacing: '0.05em' }}>
          8 providers · full historical simulation
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 4: Results ────────────────────────────────────────

const ResultsScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();

  const metrics = [
    { label: 'Sharpe Ratio',  value: '1.42', color: colors.primary, delay: 20  },
    { label: 'Max Drawdown',  value: '−17%', color: colors.rose,    delay: 80  },
    { label: 'Sortino Ratio', value: '2.01', color: colors.accent,  delay: 140 },
    { label: 'Beta',          value: '0.74', color: colors.blue,    delay: 200 },
    { label: 'Profit Factor', value: '1.68', color: colors.amber,   delay: 260 },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 64px', opacity: fadeOut(frame, dur) }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%' }}>

        <div style={{ ...fadeUp(frame, 0, 26), fontSize: 34, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, textAlign: 'center', letterSpacing: '-0.03em' }}>
          5 numbers that matter
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          {metrics.map((m) => {
            const op = interpolate(frame, [m.delay, m.delay + 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const x  = interpolate(frame, [m.delay, m.delay + 34], [14, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
            return (
              <div key={m.label} style={{
                opacity: op, transform: `translateX(${x}px)`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '13px 20px', borderRadius: radius.xl,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid rgba(255,255,255,0.06)`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 17, color: colors.textSoft, fontFamily: fonts.sans }}>{m.label}</span>
                </div>
                <span style={{ fontSize: 19, fontWeight: 700, color: m.color, fontFamily: fonts.mono }}>{m.value}</span>
              </div>
            );
          })}
        </div>

        <div style={{ ...fadeIn(frame, 320, 24), fontSize: 14, color: colors.textDim, fontFamily: fonts.mono, letterSpacing: '0.04em' }}>
          from the last post · now you know where they come from
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 5: Verdict ────────────────────────────────────────

const VerdictScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const leftOp  = interpolate(frame, [20, 52],  [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const leftY   = interpolate(frame, [20, 52],  [12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const rightOp = interpolate(frame, [60, 92],  [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rightY  = interpolate(frame, [60, 92],  [12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const ruleOp  = interpolate(frame, [130, 170],[0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const col = (accent: string): React.CSSProperties => ({
    flex: 1, padding: '20px 18px', borderRadius: radius['2xl'],
    background: 'rgba(255,255,255,0.025)',
    border: `1px solid ${accent}20`,
    display: 'flex', flexDirection: 'column', gap: 12,
  });

  const row = (label: string, value: string, color: string) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: colors.textDim, fontFamily: fonts.sans }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color, fontFamily: fonts.mono }}>{value}</span>
    </div>
  );

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 48px', opacity: fadeOut(frame, dur) }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}>

        <div style={{ ...fadeUp(frame, 0, 26), fontSize: 34, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, textAlign: 'center', letterSpacing: '-0.03em' }}>
          Pass or fail?
        </div>

        <div style={{ display: 'flex', gap: 14, width: '100%' }}>
          <div style={{ ...col(colors.primary), opacity: leftOp, transform: `translateY(${leftY}px)` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.primary, fontFamily: fonts.mono, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Good</span>
            {row('Sharpe', '> 1.0', colors.primary)}
            {row('Drawdown', '< 20%', colors.primary)}
            {row('Profit F.', '> 1.5', colors.primary)}
          </div>
          <div style={{ ...col(colors.rose), opacity: rightOp, transform: `translateY(${rightY}px)` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.rose, fontFamily: fonts.mono, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Drawing board</span>
            {row('Sharpe', '0.4', colors.rose)}
            {row('Drawdown', '41%', colors.rose)}
            {row('Profit F.', '0.9', colors.rose)}
          </div>
        </div>

        <div style={{
          opacity: ruleOp,
          padding: '14px 32px', borderRadius: radius.full,
          border: `1px solid ${colors.primary}25`,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: colors.primary, fontFamily: fonts.sans }}>
            Pass the test before risking real money
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 6: CTA ────────────────────────────────────────────

const CTAScene: React.FC<{ dur: number }> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 20, stiffness: 80, mass: 0.8 } });
  const logoOp  = interpolate(frame, [0, 40],    [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const textOp  = interpolate(frame, [50, 82],   [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const textY   = interpolate(frame, [50, 82],   [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const pillOp  = interpolate(frame, [90, 120],  [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOp   = interpolate(frame, [120, 150], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const pills = ['Backtest any strategy', '8 market data providers', '100% offline'];

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 64px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>

        <div style={{ opacity: logoOp, transform: `scale(${logoSpring})` }}>
          <Img
            src={staticFile('logo.png')}
            style={{ width: 96, height: 96, objectFit: 'contain' }}
          />
        </div>

        <div style={{ opacity: textOp, transform: `translateY(${textY}px)`, display: 'flex', alignItems: 'baseline', gap: 0 }}>
          <span style={{ fontSize: 52, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>Flow</span>
          <span style={{ fontSize: 52, fontWeight: 700, color: colors.primary, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>Folio</span>
        </div>

        <div style={{ width: 40, height: 2, borderRadius: 1, background: colors.primary, opacity: textOp }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', opacity: pillOp }}>
          {pills.map((p) => (
            <div key={p} style={{
              padding: '9px 22px', borderRadius: radius.full,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{ fontSize: 16, color: colors.textSoft, fontFamily: fonts.sans }}>{p}</span>
            </div>
          ))}
        </div>

        <div style={{ opacity: subOp, fontSize: 14, fontFamily: fonts.mono, color: colors.primary, letterSpacing: '0.03em' }}>
          link in bio · free download
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene Dispatcher ────────────────────────────────────────

function renderScene(seg: VoSegment): React.ReactNode {
  switch (seg.id) {
    case 'hook':    return <HookScene dur={seg.visualDur} />;
    case 'problem': return <ProblemScene dur={seg.visualDur} />;
    case 'howto':   return <HowToScene dur={seg.visualDur} />;
    case 'results': return <ResultsScene dur={seg.visualDur} />;
    case 'verdict': return <VerdictScene dur={seg.visualDur} />;
    case 'cta':     return <CTAScene dur={seg.visualDur} />;
    default:        return null;
  }
}

// ─── Main Composition ────────────────────────────────────────

export const BacktestEducational032: React.FC<{ seed?: number; voSegments?: VoSegment[] }> = ({
  seed, voSegments,
}) => {
  const rng      = useMemo(() => new VideoRNG(seed), [seed]);
  const segments = voSegments ?? FALLBACK_SEGMENTS;

  return (
    <VideoSeedContext.Provider value={rng}>
      <AbsoluteFill style={{ backgroundColor: colors.bg, fontFamily: fonts.sans, overflow: 'hidden' }}>
        <SceneBg />

        {/* ── Voiceover — duration matches actual audio file ── */}
        {segments.map((seg) => (
          <Sequence key={seg.id} from={seg.startFrame} durationInFrames={seg.audioDur}>
            <Audio
              src={staticFile(`audio/vo/backtest032/${seg.id}.wav`)}
              volume={(f) => {
                const fi = interpolate(f, [0, 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                const fo = interpolate(f, [seg.audioDur - 8, seg.audioDur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                return 0.9 * Math.min(fi, fo);
              }}
            />
          </Sequence>
        ))}


        {/* ── Visual scenes — duration follows audio ── */}
        {segments.map((seg) => (
          <Sequence key={seg.id} from={seg.startFrame} durationInFrames={seg.visualDur}>
            {renderScene(seg)}
          </Sequence>
        ))}
      </AbsoluteFill>
    </VideoSeedContext.Provider>
  );
};
