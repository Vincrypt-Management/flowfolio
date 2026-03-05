import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from 'remotion';
import { colors, fonts } from '../../styles';
import { AppChrome } from '../../components/AppChrome';
import { SceneTransition } from '../../components/SceneTransition';

const metrics = [
  { label: 'CAGR', value: '24.8%', color: colors.primary },
  { label: 'Sharpe Ratio', value: '1.92', color: colors.accent },
  { label: 'Max Drawdown', value: '-14.3%', color: '#ef4444' },
  { label: 'Volatility', value: '18.7%', color: colors.amber },
  { label: 'Turnover', value: '32.1%', color: colors.blue },
  { label: 'Total Trades', value: '48', color: colors.cyan },
];

const positions = [
  { symbol: 'AAPL', shares: 52, price: '$178.42', value: '$9,278', weight: '18.1%' },
  { symbol: 'MSFT', shares: 20, price: '$415.60', value: '$8,312', weight: '16.2%' },
  { symbol: 'NVDA', shares: 10, price: '$875.30', value: '$8,753', weight: '17.1%' },
  { symbol: 'AMZN', shares: 35, price: '$185.92', value: '$6,507', weight: '12.7%' },
  { symbol: 'GOOGL', shares: 35, price: '$152.14', value: '$5,325', weight: '10.4%' },
];

// Simulated portfolio value over time (24 months)
const chartData = Array.from({ length: 24 }, (_, i) => {
  const base = 50000;
  const growth = base * Math.pow(1.018, i);
  const noise = Math.sin(i * 0.8) * 1200 + Math.cos(i * 1.3) * 800;
  return Math.round(growth + noise);
});

const benchmarkData = Array.from({ length: 24 }, (_, i) => {
  const base = 50000;
  const growth = base * Math.pow(1.008, i);
  const noise = Math.sin(i * 0.6) * 900;
  return Math.round(growth + noise);
});

export const BacktestResultScreen: React.FC = () => {
  const frame = useCurrentFrame();

  const chartMax = Math.max(...chartData, ...benchmarkData) * 1.05;
  const chartMin = Math.min(...chartData, ...benchmarkData) * 0.95;

  return (
    <SceneTransition durationInFrames={420}>
      <AbsoluteFill>
        <AppChrome activeTab="Backtest" headerTitle="Backtest Results" headerSubtitle="Jan 2024 – Dec 2025 · $50,000 initial · $500/mo contribution">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
            {/* Top summary */}
            <div
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: 8,
                padding: '16px 20px',
                borderLeft: `3px solid ${colors.primary}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: interpolate(frame, [20, 45], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.sans }}>Final Portfolio Value</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: colors.text, fontFamily: fonts.mono, letterSpacing: '-0.02em' }}>$76,234.50</div>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.sans }}>Total Return</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: colors.primary, fontFamily: fonts.mono }}>+52.5%</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.sans }}>Total Invested</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: colors.textMuted, fontFamily: fonts.mono }}>$62,000</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.sans }}>Profit/Loss</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: colors.primary, fontFamily: fonts.mono }}>+$14,234</div>
                </div>
              </div>
            </div>

            {/* Metrics grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
              {metrics.map((m, i) => {
                const delay = 40 + i * 10;
                const cardOpacity = interpolate(frame, [delay, delay + 20], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
                return (
                  <div
                    key={m.label}
                    style={{
                      background: '#0a0a0a',
                      border: '1px solid #1a1a1a',
                      borderRadius: 6,
                      padding: '12px 12px',
                      opacity: cardOpacity,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700, color: m.color, fontFamily: fonts.mono }}>{m.value}</div>
                    <div style={{ fontSize: 9, color: colors.textDim, fontFamily: fonts.sans, marginTop: 2 }}>{m.label}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
              {/* Chart */}
              <div
                style={{
                  flex: 1.5,
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '16px 20px',
                  opacity: interpolate(frame, [80, 105], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Portfolio Value Over Time
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 12, height: 2, background: colors.primary, borderRadius: 1 }} />
                      <span style={{ fontSize: 9, color: colors.textMuted, fontFamily: fonts.mono }}>Strategy</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 12, height: 2, background: colors.textDim, borderRadius: 1 }} />
                      <span style={{ fontSize: 9, color: colors.textMuted, fontFamily: fonts.mono }}>Benchmark</span>
                    </div>
                  </div>
                </div>

                {/* SVG chart */}
                <svg width="100%" height="200" viewBox="0 0 800 200" preserveAspectRatio="none">
                  {/* Grid lines */}
                  {[0, 50, 100, 150, 200].map((y) => (
                    <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#1a1a1a" strokeWidth="1" />
                  ))}

                  {/* Benchmark line */}
                  <polyline
                    fill="none"
                    stroke={colors.textDim}
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity={0.5}
                    points={benchmarkData.map((v, i) => {
                      const x = (i / (benchmarkData.length - 1)) * 800;
                      const y = 200 - ((v - chartMin) / (chartMax - chartMin)) * 200;
                      return `${x},${y}`;
                    }).join(' ')}
                  />

                  {/* Strategy line - animated */}
                  {(() => {
                    const drawProgress = interpolate(frame, [90, 200], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                      easing: Easing.out(Easing.cubic),
                    });
                    const pointsToShow = Math.ceil(drawProgress * chartData.length);
                    const visibleData = chartData.slice(0, pointsToShow);

                    const points = visibleData.map((v, i) => {
                      const x = (i / (chartData.length - 1)) * 800;
                      const y = 200 - ((v - chartMin) / (chartMax - chartMin)) * 200;
                      return `${x},${y}`;
                    }).join(' ');

                    const areaPoints = points + ` 800,200 0,200`;

                    return (
                      <>
                        <polyline fill="none" stroke={colors.primary} strokeWidth="2.5" points={points} />
                        <polygon fill={`${colors.primary}15`} points={areaPoints} />
                      </>
                    );
                  })()}
                </svg>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 9, color: colors.textDim, fontFamily: fonts.mono }}>Jan 2024</span>
                  <span style={{ fontSize: 9, color: colors.textDim, fontFamily: fonts.mono }}>Dec 2025</span>
                </div>
              </div>

              {/* Final positions */}
              <div
                style={{
                  flex: 1,
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '16px 18px',
                  opacity: interpolate(frame, [150, 175], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Final Positions
                </div>

                {positions.map((p, i) => {
                  const rowDelay = 160 + i * 12;
                  const rowOpacity = interpolate(frame, [rowDelay, rowDelay + 18], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  return (
                    <div
                      key={p.symbol}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        opacity: rowOpacity,
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.text, fontWeight: 600 }}>{p.symbol}</span>
                        <span style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.textDim, marginLeft: 8 }}>{p.shares} shares</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.text }}>{p.value}</span>
                        <span style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.textDim, marginLeft: 8 }}>{p.weight}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </AppChrome>
      </AbsoluteFill>
    </SceneTransition>
  );
};
