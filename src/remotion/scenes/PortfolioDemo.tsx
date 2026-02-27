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
import { generatePortfolioData } from '../lib/sceneData';

const allocationColors = [colors.blue, colors.accent, colors.amber, colors.cyan, colors.rose];

export const PortfolioDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const rng = useSceneRNG('portfolio');
  const data = generatePortfolioData(rng);

  // Generate unique performance chart
  const chartFork = rng.fork('perf-chart');
  const perfData: number[] = [10000];
  for (let i = 1; i < 36; i++) {
    perfData.push(Math.max(8000, perfData[i - 1] * (1 + chartFork.offset(0.005, 0.012))));
  }

  const allocations = data.allocations.map((a, i) => ({
    name: a.sector,
    pct: Math.round(a.pct),
    color: allocationColors[i % allocationColors.length],
  }));

  // Pie chart animation
  const pieProgress = interpolate(frame, [30, 90], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const pieSize = 200;
  const pieR = 82;
  const pieCx = pieSize / 2;
  const pieCy = pieSize / 2;

  let cumulativeAngle = -90;
  const pieSlices = allocations.map((a) => {
    const sliceAngle = (a.pct / 100) * 360 * pieProgress;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + sliceAngle;
    cumulativeAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const largeArc = sliceAngle > 180 ? 1 : 0;

    const x1 = pieCx + pieR * Math.cos(startRad);
    const y1 = pieCy + pieR * Math.sin(startRad);
    const x2 = pieCx + pieR * Math.cos(endRad);
    const y2 = pieCy + pieR * Math.sin(endRad);

    const d = sliceAngle > 0.1
      ? `M ${pieCx} ${pieCy} L ${x1} ${y1} A ${pieR} ${pieR} 0 ${largeArc} 1 ${x2} ${y2} Z`
      : '';

    return { ...a, d };
  });

  return (
    <SceneTransition durationInFrames={230}>
      <AbsoluteFill>
        <div style={{ display: 'flex', height: '100%' }}>
          <MockSidebar activeIndex={1} />

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
                  color: colors.blue,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  marginBottom: 8,
                  opacity: interpolate(frame, [10, 25], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                Portfolio
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
                Portfolio Dashboard
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
                Real-time holdings, allocation breakdown, and performance tracking
              </div>
            </div>

            {/* Metrics */}
            <div style={{ display: 'flex', gap: 14 }}>
              <MetricCard label="Total Value" value={Math.round(data.totalValue)} prefix="$" delay={15} color={colors.text} />
              <MetricCard label="Total Return" value={Math.round(data.totalReturn * 10) / 10} suffix="%" decimals={1} delay={22} color={colors.primary} />
              <MetricCard label="Daily P&L" value={Math.round(data.dayChange * 1000)} prefix="+$" delay={29} color={colors.primary} />
              <MetricCard label="Sharpe Ratio" value={Math.round(data.sharpeRatio * 100) / 100} decimals={2} delay={36} color={colors.accent} />
            </div>

            {/* Charts row */}
            <div style={{ display: 'flex', gap: 20, flex: 1 }}>
              {/* Performance chart */}
              <GlassCard delay={20} style={{ flex: 2, display: 'flex', flexDirection: 'column' }} glowColor={colors.primaryDim20}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: colors.textDim,
                    fontFamily: fonts.mono,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 12,
                  }}
                >
                  Growth of $10,000
                </div>
                <AnimatedChart
                  data={perfData}
                  width={700}
                  height={310}
                  delay={25}
                  duration={100}
                />
              </GlassCard>

              {/* Allocation donut */}
              <GlassCard delay={30} style={{ flex: 0.9, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: colors.textDim,
                    fontFamily: fonts.mono,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 12,
                    alignSelf: 'flex-start',
                  }}
                >
                  Allocation
                </div>
                <svg width={pieSize} height={pieSize}>
                  {pieSlices.map(
                    (s) =>
                      s.d && (
                        <path
                          key={s.name}
                          d={s.d}
                          fill={s.color}
                          opacity={0.85}
                        />
                      )
                  )}
                  {/* Center donut hole */}
                  <circle cx={pieCx} cy={pieCy} r={46} fill={colors.bgCard} />
                  <circle cx={pieCx} cy={pieCy} r={46} fill="rgba(255,255,255,0.03)" />
                </svg>

                {/* Legend */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 14, width: '100%' }}>
                  {allocations.map((a, i) => {
                    const lo = interpolate(frame, [65 + i * 8, 78 + i * 8], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    });
                    return (
                      <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: lo }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: a.color }} />
                        <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.mono, flex: 1 }}>
                          {a.name}
                        </span>
                        <span style={{ fontSize: 11, color: colors.text, fontFamily: fonts.mono, fontWeight: 600 }}>
                          {a.pct}%
                        </span>
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
