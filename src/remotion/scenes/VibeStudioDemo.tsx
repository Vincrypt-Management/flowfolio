import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { colors, fonts } from '../styles';
import { MockSidebar } from '../components/MockSidebar';
import { GlassCard } from '../components/GlassCard';
import { SceneTransition } from '../components/SceneTransition';
import { useSceneRNG } from '../lib/uniqueness';
import { generateVibeStudioData } from '../lib/sceneData';
import { pickStocks } from '../lib/contentPools';

const colorLookup = {
  primary: colors.primary,
  accent: colors.accent,
  amber: colors.amber,
  cyan: colors.cyan,
  rose: colors.rose,
} as const;

export const VibeStudioDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rng = useSceneRNG('vibe-studio');

  const data = generateVibeStudioData(rng);
  const stocks = pickStocks(rng, 5);

  const factors = data.factors.map((f) => ({
    name: f.name,
    value: f.value,
    color: colorLookup[f.colorKey],
  }));

  // Generate varied scores for stocks
  const stockFork = rng.fork('scores');
  const mockSymbols = stocks.map((s) => ({
    symbol: s.symbol,
    score: stockFork.int(72, 96),
    momentum: stockFork.vary(0.8, 0.15),
    value: stockFork.vary(0.75, 0.15),
    change: `+${stockFork.vary(1.8, 0.5).toFixed(1)}%`,
  })).sort((a, b) => b.score - a.score);

  return (
    <SceneTransition durationInFrames={230}>
      <AbsoluteFill>
        <div style={{ display: 'flex', height: '100%' }}>
          <MockSidebar activeIndex={0} />

          <div
            style={{
              flex: 1,
              padding: '44px 48px',
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
            }}
          >
            {/* Section label + title */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: fonts.mono,
                  color: colors.primary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  marginBottom: 8,
                  opacity: interpolate(frame, [10, 25], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                Vibe Studio
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: colors.text,
                  fontFamily: fonts.sans,
                  letterSpacing: '-0.02em',
                  opacity: interpolate(frame, [15, 30], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                Define Your Investment Vibe
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: colors.textMuted,
                  fontFamily: fonts.sans,
                  marginTop: 4,
                  opacity: interpolate(frame, [20, 35], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                Set factor weights to create a personalized scoring model — no code required
              </div>
            </div>

            <div style={{ display: 'flex', gap: 24, flex: 1 }}>
              {/* Factor sliders panel */}
              <GlassCard delay={15} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} glowColor={colors.accentDim20}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.textMuted,
                    fontFamily: fonts.mono,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 20,
                  }}
                >
                  Factor Weights
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {factors.map((factor, i) => {
                    const sliderDelay = 30 + i * 12;
                    const sliderProgress = interpolate(
                      frame,
                      [sliderDelay, sliderDelay + 45],
                      [0, factor.value],
                      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                    );

                    const bounceFrame = frame - (sliderDelay + 45);
                    const bounce = bounceFrame > 0
                      ? spring({ frame: bounceFrame, fps, config: { damping: 8, stiffness: 200, mass: 0.3 } })
                      : 0;
                    const finalProgress = Math.max(0, Math.min(
                      factor.value,
                      sliderProgress + bounce * 0.03
                    ));

                    return (
                      <div key={factor.name} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: 13,
                              color: colors.textMuted,
                              fontFamily: fonts.mono,
                            }}
                          >
                            {factor.name}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              color: factor.color,
                              fontFamily: fonts.mono,
                              fontWeight: 700,
                            }}
                          >
                            {Math.round(finalProgress * 100)}%
                          </span>
                        </div>
                        {/* Slider track */}
                        <div
                          style={{
                            height: 5,
                            background: colors.bgHover,
                            borderRadius: 3,
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${finalProgress * 100}%`,
                              background: `linear-gradient(90deg, ${factor.color}70, ${factor.color})`,
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Strategy name */}
                <div
                  style={{
                    marginTop: 24,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: `${colors.primary}08`,
                    border: `1px solid ${colors.primaryDim20}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    opacity: interpolate(frame, [120, 140], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    }),
                  }}
                >
                  <span style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textDim }}>Strategy:</span>
                  <span style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.primary, fontWeight: 600 }}>
                    "{data.strategyName}"
                  </span>
                </div>
              </GlassCard>

              {/* Score rankings panel */}
              <GlassCard delay={25} style={{ flex: 1.2, display: 'flex', flexDirection: 'column' }} glowColor={colors.primaryDim20}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.textMuted,
                    fontFamily: fonts.mono,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 16,
                  }}
                >
                  Vibe Score Rankings
                </div>

                {/* Table header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr',
                    padding: '8px 0',
                    borderBottom: `1px solid ${colors.glassBorder}`,
                    marginBottom: 4,
                  }}
                >
                  {['Symbol', 'Score', 'Mom', 'Val', 'Chg'].map((h) => (
                    <div
                      key={h}
                      style={{
                        fontSize: 10,
                        fontFamily: fonts.mono,
                        color: colors.textDim,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                      }}
                    >
                      {h}
                    </div>
                  ))}
                </div>

                {/* Rows */}
                {mockSymbols.map((s, i) => {
                  const rowDelay = 70 + i * 15;
                  const rowOpacity = interpolate(frame - rowDelay, [0, 14], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  const rowX = interpolate(frame - rowDelay, [0, 14], [20, 0], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });

                  const scoreColor = s.score >= 85 ? colors.primary : s.score >= 75 ? colors.amber : colors.textMuted;

                  return (
                    <div
                      key={s.symbol}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr',
                        padding: '11px 0',
                        borderBottom: `1px solid rgba(255,255,255,0.03)`,
                        opacity: rowOpacity,
                        transform: `translateX(${rowX}px)`,
                        alignItems: 'center',
                        background: i === 0 ? `linear-gradient(90deg, ${colors.primaryDim}, transparent)` : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: 14, fontFamily: fonts.mono, color: colors.text, fontWeight: 600 }}>
                        {s.symbol}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 30, height: 3, background: colors.bgHover, borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${s.score}%`, background: scoreColor, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 13, fontFamily: fonts.mono, color: scoreColor, fontWeight: 700 }}>
                          {s.score}
                        </span>
                      </div>
                      <span style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.textMuted }}>
                        {s.momentum.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.textMuted }}>
                        {s.value.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.primary }}>
                        {s.change}
                      </span>
                    </div>
                  );
                })}
              </GlassCard>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};
