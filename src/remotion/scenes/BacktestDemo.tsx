import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from 'remotion';
import { colors, fonts } from '../styles';
import { MockSidebar } from '../components/MockSidebar';
import { AnimatedChart } from '../components/AnimatedChart';
import { MetricCard } from '../components/MetricCard';
import { GlassCard } from '../components/GlassCard';
import { SceneTransition } from '../components/SceneTransition';
import { useSceneRNG } from '../lib/uniqueness';
import { generateBacktestData } from '../lib/sceneData';

export const BacktestDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const rng = useSceneRNG('backtest');
  const data = generateBacktestData(rng);

  // Generate longer chart data for smoother curves
  const strategyFork = rng.fork('strategy-chart');
  const benchmarkFork = rng.fork('benchmark-chart');
  const strategyData: number[] = [100];
  const benchmarkData: number[] = [100];
  for (let i = 1; i < 36; i++) {
    strategyData.push(Math.max(80, strategyData[i - 1] * (1 + strategyFork.offset(0.008, 0.015))));
    benchmarkData.push(Math.max(85, benchmarkData[i - 1] * (1 + benchmarkFork.offset(0.004, 0.01))));
  }

  return (
    <SceneTransition durationInFrames={230}>
      <AbsoluteFill>
        <div style={{ display: 'flex', height: '100%' }}>
          <MockSidebar activeIndex={2} />

          <div
            style={{
              flex: 1,
              padding: '44px 48px',
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
            }}
          >
            {/* Header */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: fonts.mono,
                  color: colors.cyan,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  marginBottom: 8,
                  opacity: interpolate(frame, [10, 25], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                Backtest
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
                Historical Simulation
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
                Test your strategy against 5 years of market data before risking real capital
              </div>
            </div>

            {/* Metrics */}
            <div style={{ display: 'flex', gap: 14 }}>
              <MetricCard label="CAGR" value={Math.round(data.cagr * 10) / 10} suffix="%" decimals={1} delay={15} color={colors.primary} />
              <MetricCard label="Max Drawdown" value={Math.round(data.maxDrawdown * 10) / 10} suffix="%" decimals={1} delay={22} color={colors.rose} />
              <MetricCard label="Win Rate" value={Math.round(data.winRate)} suffix="%" delay={29} color={colors.cyan} />
              <MetricCard label="Alpha" value={8.6} suffix="%" decimals={1} delay={36} color={colors.accent} />
            </div>

            {/* Chart */}
            <GlassCard delay={18} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} glowColor={colors.primaryDim20}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: colors.textDim,
                    fontFamily: fonts.mono,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Cumulative Returns (2020-2025)
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 16, height: 2.5, backgroundColor: colors.primary, borderRadius: 2, boxShadow: `0 0 6px ${colors.primaryDim40}` }} />
                    <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.mono }}>Strategy</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 16, height: 2.5, backgroundColor: colors.textDim, borderRadius: 2 }} />
                    <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.mono }}>S&P 500</span>
                  </div>
                </div>
              </div>

              <div style={{ position: 'relative', flex: 1 }}>
                {/* Benchmark (behind) */}
                <div style={{ position: 'absolute', top: 0, left: 0 }}>
                  <AnimatedChart
                    data={benchmarkData}
                    width={1060}
                    height={370}
                    delay={25}
                    duration={90}
                    strokeColor={colors.textDim}
                    fillColor="rgba(82, 82, 91, 0.06)"
                    strokeWidth={1.8}
                    showGlow={false}
                  />
                </div>
                {/* Strategy (front, with glow) */}
                <div style={{ position: 'absolute', top: 0, left: 0 }}>
                  <AnimatedChart
                    data={strategyData}
                    width={1060}
                    height={370}
                    delay={25}
                    duration={90}
                  />
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};
