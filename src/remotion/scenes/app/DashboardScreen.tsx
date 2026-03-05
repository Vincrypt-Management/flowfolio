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

const summaryCards = [
  { label: 'Portfolio Value', value: '$127,450.32', change: '+12.4%', positive: true },
  { label: 'Day Change', value: '+$1,284.50', change: '+1.02%', positive: true },
  { label: 'Total Return', value: '+$27,450.32', change: 'Since Jan 2024', positive: true },
  { label: 'Sharpe Ratio', value: '1.84', change: 'Above benchmark', positive: true },
];

const marketItems = [
  { symbol: 'SPY', price: '512.34', change: '+0.8%', positive: true },
  { symbol: 'QQQ', price: '438.21', change: '+1.2%', positive: true },
  { symbol: 'IWM', price: '207.55', change: '-0.3%', positive: false },
  { symbol: 'VIX', price: '14.32', change: '-5.1%', positive: false },
];

const recentActions = [
  { action: 'Scored 25 symbols', time: '2 hours ago' },
  { action: 'Rebalanced portfolio', time: '1 day ago' },
  { action: 'Backtest completed', time: '2 days ago' },
  { action: 'Journal entry added', time: '3 days ago' },
];

export const DashboardScreen: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneTransition durationInFrames={300}>
      <AbsoluteFill>
        <AppChrome activeTab="Dashboard" headerTitle="Dashboard" headerSubtitle="Your investment command center">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>
            {/* Summary cards row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {summaryCards.map((card, i) => {
                const delay = 30 + i * 12;
                const cardOpacity = interpolate(frame, [delay, delay + 25], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                });
                const cardY = interpolate(frame, [delay, delay + 25], [15, 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                });

                return (
                  <div
                    key={card.label}
                    style={{
                      background: '#0a0a0a',
                      border: '1px solid #1a1a1a',
                      borderRadius: 8,
                      padding: '16px 18px',
                      opacity: cardOpacity,
                      transform: `translateY(${cardY}px)`,
                    }}
                  >
                    <div style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.sans, marginBottom: 6 }}>
                      {card.label}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: colors.text, fontFamily: fonts.mono, letterSpacing: '-0.02em' }}>
                      {card.value}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: fonts.mono,
                        color: card.positive ? colors.primary : '#ef4444',
                        marginTop: 4,
                      }}
                    >
                      {card.change}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 16, flex: 1 }}>
              {/* Active Plan */}
              <div
                style={{
                  flex: 1.5,
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '18px 20px',
                  opacity: interpolate(frame, [60, 85], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.textMuted, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                  Active Plan
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, marginBottom: 6 }}>
                  Growth Momentum Alpha
                </div>
                <div style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.sans, marginBottom: 16, lineHeight: 1.5 }}>
                  Multi-factor strategy focusing on momentum, value, and quality — targeting high-growth tech with strong fundamentals.
                </div>

                {/* Factor bars */}
                {[
                  { name: 'Momentum', value: 0.85, color: colors.primary },
                  { name: 'Value', value: 0.65, color: colors.accent },
                  { name: 'Quality', value: 0.75, color: colors.blue },
                  { name: 'Volatility', value: 0.40, color: colors.amber },
                ].map((factor, i) => {
                  const barDelay = 90 + i * 15;
                  const barWidth = interpolate(frame, [barDelay, barDelay + 40], [0, factor.value * 100], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                    easing: Easing.out(Easing.cubic),
                  });

                  return (
                    <div key={factor.name} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.mono }}>{factor.name}</span>
                        <span style={{ fontSize: 11, color: factor.color, fontFamily: fonts.mono, fontWeight: 600 }}>{Math.round(barWidth)}%</span>
                      </div>
                      <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${barWidth}%`, background: factor.color, borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Market Overview */}
              <div
                style={{
                  flex: 1,
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '18px 20px',
                  opacity: interpolate(frame, [70, 95], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.textMuted, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                  Market Overview
                </div>
                {marketItems.map((item, i) => {
                  const rowDelay = 100 + i * 10;
                  const rowOpacity = interpolate(frame, [rowDelay, rowDelay + 20], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  return (
                    <div
                      key={item.symbol}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 0',
                        borderBottom: '1px solid #1a1a1a',
                        opacity: rowOpacity,
                      }}
                    >
                      <span style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.text, fontWeight: 600 }}>{item.symbol}</span>
                      <span style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.textMuted }}>${item.price}</span>
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: item.positive ? colors.primary : '#ef4444', fontWeight: 600 }}>
                        {item.change}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Recent Activity */}
              <div
                style={{
                  flex: 1,
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '18px 20px',
                  opacity: interpolate(frame, [80, 105], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.textMuted, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                  Recent Activity
                </div>
                {recentActions.map((item, i) => {
                  const rowDelay = 110 + i * 12;
                  const rowOpacity = interpolate(frame, [rowDelay, rowDelay + 20], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  return (
                    <div
                      key={item.action}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 0',
                        borderBottom: '1px solid #1a1a1a',
                        opacity: rowOpacity,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, color: colors.text, fontFamily: fonts.sans }}>{item.action}</div>
                        <div style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.mono }}>{item.time}</div>
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
