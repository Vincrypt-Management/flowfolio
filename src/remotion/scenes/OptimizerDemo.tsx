import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { colors, fonts, radius } from '../styles';
import { MockSidebar } from '../components/MockSidebar';
import { GlassCard } from '../components/GlassCard';
import { SceneTransition } from '../components/SceneTransition';
import { useSceneRNG } from '../lib/uniqueness';
import { generateOptimizerData } from '../lib/sceneData';
import { pickStocks } from '../lib/contentPools';

export const OptimizerDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rng = useSceneRNG('optimizer');
  const data = generateOptimizerData(rng);
  const stocks = pickStocks(rng, 4);

  const grades = ['A', 'A', 'B', 'F'] as const;
  const gradeColors = { A: colors.primary, B: colors.cyan, F: colors.rose } as const;

  const holdings = stocks.map((s, i) => ({
    symbol: s.symbol,
    grade: grades[i],
    color: gradeColors[grades[i]],
    value: `$${rng.int(15, 50)},000`,
    ret: i < 3 ? `+${rng.vary(20, 0.4).toFixed(1)}%` : `-${rng.vary(12, 0.3).toFixed(1)}%`,
    sharpe: rng.vary(1.2, 0.4).toFixed(1),
    vol: `${rng.vary(25, 0.5).toFixed(1)}%`,
  }));

  const replacements = data.replacements.slice(0, 2).map((sym) => ({
    symbol: sym,
    score: rng.int(78, 92),
    alloc: `$${rng.int(8, 15)},000`,
    reasons: rng.pickN(['Lower volatility', 'Higher Sharpe', 'AI exposure', 'Diversification', 'Lower fees', 'Strong momentum'], 3),
  }));

  const actionSteps = [
    { action: 'SELL', symbol: data.dropCandidate, amount: `$${rng.int(15, 25)},000`, reason: 'High volatility, deteriorating fundamentals', color: colors.rose },
    { action: 'BUY', symbol: replacements[0].symbol, amount: replacements[0].alloc, reason: 'Superior risk-adjusted returns', color: colors.primary },
    { action: 'BUY', symbol: replacements[1].symbol, amount: replacements[1].alloc, reason: 'Diversification via total market', color: colors.primary },
  ];

  // Health score animation
  const currentHealth = interpolate(frame, [30, 60], [0, data.currentScore], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const projectedHealth = interpolate(frame, [50, 80], [0, data.projectedScore], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <SceneTransition durationInFrames={220}>
      <AbsoluteFill>
        <div style={{ display: 'flex', height: '100%' }}>
          <MockSidebar activeIndex={1} />

          <div
            style={{
              flex: 1,
              padding: '40px 44px',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            {/* Header */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: fonts.mono,
                  color: colors.amber,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  marginBottom: 8,
                  opacity: interpolate(frame, [10, 25], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                Optimizer
              </div>
              <div
                style={{
                  fontSize: 28,
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
                Portfolio Optimizer
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
                AI-powered suggestions to improve your portfolio health score
              </div>
            </div>

            {/* Health scores row */}
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <HealthScoreCard
                label="Current Health"
                score={currentHealth}
                frame={frame}
                delay={20}
                fps={fps}
                scoreColor={currentHealth > 50 ? colors.amber : colors.rose}
              />
              {/* Arrow */}
              <div
                style={{
                  opacity: interpolate(frame, [55, 70], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width={48} height={24} viewBox="0 0 48 24">
                  <path d="M4 12 H36 L28 4 M36 12 L28 20" stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div
                  style={{
                    padding: '3px 10px',
                    borderRadius: radius.full,
                    background: colors.primaryDim,
                    border: `1px solid ${colors.primaryDim40}`,
                    fontSize: 12,
                    fontFamily: fonts.mono,
                    fontWeight: 700,
                    color: colors.primary,
                  }}
                >
                  +16 pts
                </div>
              </div>
              <HealthScoreCard
                label="Projected Health"
                score={projectedHealth}
                frame={frame}
                delay={35}
                fps={fps}
                scoreColor={colors.primary}
              />

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Holdings grades compact */}
              <GlassCard delay={40} style={{ display: 'flex', gap: 12, padding: '16px 20px' }}>
                {holdings.map((h, i) => {
                  const ho = interpolate(frame - (50 + i * 8), [0, 12], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  return (
                    <div key={h.symbol} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: ho }}>
                      <div style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textMuted }}>{h.symbol}</div>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: radius.md,
                          background: `${h.color}20`,
                          border: `1px solid ${h.color}40`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          fontFamily: fonts.mono,
                          fontWeight: 800,
                          color: h.color,
                        }}
                      >
                        {h.grade}
                      </div>
                    </div>
                  );
                })}
              </GlassCard>
            </div>

            {/* Bottom row: Drop + Replacements + Action plan */}
            <div style={{ display: 'flex', gap: 18, flex: 1 }}>
              {/* Underperformer to drop */}
              <GlassCard delay={60} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} glowColor="rgba(251, 113, 133, 0.1)">
                <div style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.rose, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
                  Position to Drop
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 14,
                    opacity: interpolate(frame, [75, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                  }}
                >
                  <div style={{ fontSize: 22, fontFamily: fonts.mono, fontWeight: 800, color: colors.text }}>TSLA</div>
                  <div style={{ padding: '2px 10px', borderRadius: radius.full, background: `${colors.rose}20`, border: `1px solid ${colors.rose}40`, fontSize: 11, fontFamily: fonts.mono, fontWeight: 700, color: colors.rose }}>
                    Grade F
                  </div>
                  <div style={{ padding: '2px 10px', borderRadius: radius.full, background: `${colors.rose}15`, fontSize: 10, fontFamily: fonts.mono, fontWeight: 600, color: colors.rose }}>
                    HIGH URGENCY
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { k: 'Value', v: '$22,000' },
                    { k: 'Return', v: '-12.5%' },
                    { k: 'Volatility', v: '52.1%' },
                    { k: 'Sharpe', v: '0.4' },
                  ].map((item, i) => (
                    <div key={item.k} style={{ display: 'flex', justifyContent: 'space-between', opacity: interpolate(frame - (85 + i * 6), [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
                      <span style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textDim }}>{item.k}</span>
                      <span style={{ fontSize: 11, fontFamily: fonts.mono, color: item.k === 'Return' || item.k === 'Volatility' ? colors.rose : colors.textMuted, fontWeight: 600 }}>{item.v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 11, fontFamily: fonts.mono, color: colors.textDim, lineHeight: 1.5, opacity: interpolate(frame, [105, 118], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
                  Excessive volatility with negative momentum and deteriorating technicals.
                </div>
              </GlassCard>

              {/* Replacements */}
              <GlassCard delay={75} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }} glowColor={colors.primaryDim20}>
                <div style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.primary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                  Recommended Replacements
                </div>
                {replacements.map((r, i) => {
                  const rDelay = 90 + i * 18;
                  const rOp = interpolate(frame - rDelay, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                  return (
                    <div
                      key={r.symbol}
                      style={{
                        padding: '14px 16px',
                        borderRadius: radius.xl,
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${colors.glassBorder}`,
                        opacity: rOp,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 22, height: 22, borderRadius: radius.md, background: `${colors.primary}20`, border: `1px solid ${colors.primary}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: fonts.mono, fontWeight: 800, color: colors.primary }}>
                          #{i + 1}
                        </div>
                        <span style={{ fontSize: 15, fontFamily: fonts.mono, fontWeight: 700, color: colors.text }}>{r.symbol}</span>
                        <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.primary, fontWeight: 600 }}>Score: {r.score}</span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textMuted }}>{r.alloc}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {r.reasons.map((reason) => (
                          <div key={reason} style={{ padding: '2px 8px', borderRadius: radius.full, background: `${colors.primary}10`, fontSize: 10, fontFamily: fonts.mono, color: colors.primary }}>
                            {reason}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </GlassCard>

              {/* Action plan */}
              <GlassCard delay={85} style={{ flex: 0.85, display: 'flex', flexDirection: 'column' }} glowColor={colors.accentDim20}>
                <div style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
                  Action Plan
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {actionSteps.map((step, i) => {
                    const sDelay = 100 + i * 16;
                    const sOp = interpolate(frame - sDelay, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                    const sX = interpolate(frame - sDelay, [0, 14], [12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          padding: '12px 14px',
                          borderRadius: radius.xl,
                          background: `${step.color}08`,
                          borderLeft: `3px solid ${step.color}`,
                          opacity: sOp,
                          transform: `translateX(${sX}px)`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, fontFamily: fonts.mono, fontWeight: 700, color: step.color, textTransform: 'uppercase' }}>
                            {step.action}
                          </span>
                          <span style={{ fontSize: 14, fontFamily: fonts.mono, fontWeight: 700, color: colors.text }}>{step.symbol}</span>
                          <div style={{ flex: 1 }} />
                          <span style={{ fontSize: 12, fontFamily: fonts.mono, color: step.color, fontWeight: 600 }}>{step.amount}</span>
                        </div>
                        <div style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.textDim, lineHeight: 1.4 }}>
                          {step.reason}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};

// Health score circular badge
const HealthScoreCard: React.FC<{
  label: string;
  score: number;
  frame: number;
  delay: number;
  fps: number;
  scoreColor: string;
}> = ({ label, score, frame, delay, fps, scoreColor }) => {
  const cardScale = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.5 },
  });
  const opacity = interpolate(frame - delay, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const circumference = 2 * Math.PI * 38;
  const dashOffset = circumference * (1 - Math.min(score, 100) / 100);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        background: `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${colors.glassBorder}`,
        borderRadius: radius['2xl'],
        padding: '18px 28px',
        transform: `scale(${cardScale})`,
        opacity,
        boxShadow: `0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <div style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <svg width={90} height={90} viewBox="0 0 90 90">
        {/* Track */}
        <circle cx={45} cy={45} r={38} fill="none" stroke={colors.bgHover} strokeWidth={5} />
        {/* Progress */}
        <circle
          cx={45}
          cy={45}
          r={38}
          fill="none"
          stroke={scoreColor}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 45 45)"
          style={{ filter: `drop-shadow(0 0 6px ${scoreColor}50)` }}
        />
        <text x={45} y={45} textAnchor="middle" dominantBaseline="central" fill={scoreColor} fontSize={24} fontWeight={800} fontFamily={fonts.mono}>
          {Math.round(score)}
        </text>
      </svg>
    </div>
  );
};
