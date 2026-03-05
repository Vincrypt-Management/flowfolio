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

const rankings = [
  { symbol: 'NVDA', score: 95, momentum: 0.94, value: 0.72, quality: 0.91, trend: 0.96, change: '+3.2%' },
  { symbol: 'AAPL', score: 92, momentum: 0.88, value: 0.85, quality: 0.93, trend: 0.87, change: '+1.4%' },
  { symbol: 'MSFT', score: 89, momentum: 0.82, value: 0.80, quality: 0.95, trend: 0.84, change: '+0.9%' },
  { symbol: 'META', score: 88, momentum: 0.90, value: 0.76, quality: 0.86, trend: 0.88, change: '+2.1%' },
  { symbol: 'AMZN', score: 86, momentum: 0.79, value: 0.78, quality: 0.88, trend: 0.82, change: '+1.8%' },
  { symbol: 'GOOGL', score: 84, momentum: 0.76, value: 0.83, quality: 0.90, trend: 0.78, change: '+0.6%' },
  { symbol: 'TSLA', score: 78, momentum: 0.91, value: 0.52, quality: 0.68, trend: 0.85, change: '+4.5%' },
  { symbol: 'AMD', score: 76, momentum: 0.85, value: 0.61, quality: 0.74, trend: 0.80, change: '+2.8%' },
  { symbol: 'CRM', score: 74, momentum: 0.72, value: 0.70, quality: 0.82, trend: 0.73, change: '+0.4%' },
  { symbol: 'NFLX', score: 72, momentum: 0.68, value: 0.65, quality: 0.80, trend: 0.71, change: '+1.1%' },
];

export const RankingsScreen: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneTransition durationInFrames={300}>
      <AbsoluteFill>
        <AppChrome activeTab="Rankings" headerTitle="Stock Rankings" headerSubtitle="Multi-factor scoring based on your Vibe Plan">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
            {/* Strategy badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                opacity: interpolate(frame, [20, 40], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              }}
            >
              <span style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.sans }}>Active Plan:</span>
              <span style={{ fontSize: 12, color: colors.primary, fontFamily: fonts.mono, fontWeight: 600, background: 'rgba(0,229,153,0.08)', padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(0,229,153,0.15)' }}>
                Growth Momentum Alpha
              </span>
              <span style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.mono }}>·</span>
              <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.sans }}>10 symbols scored</span>
            </div>

            {/* Rankings table */}
            <div
              style={{
                flex: 1,
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: 8,
                padding: '16px 20px',
                opacity: interpolate(frame, [30, 55], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '0.3fr 0.8fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr',
                  padding: '8px 0',
                  borderBottom: '1px solid #1a1a1a',
                  marginBottom: 2,
                }}
              >
                {['#', 'Symbol', 'Score', 'Momentum', 'Value', 'Quality', 'Trend', 'Change'].map((h) => (
                  <div key={h} style={{ fontSize: 9, fontFamily: fonts.mono, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {h}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {rankings.map((stock, i) => {
                const rowDelay = 50 + i * 10;
                const rowOpacity = interpolate(frame, [rowDelay, rowDelay + 18], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
                const rowX = interpolate(frame, [rowDelay, rowDelay + 18], [15, 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                });

                const scoreColor = stock.score >= 90 ? colors.primary : stock.score >= 80 ? colors.accent : stock.score >= 70 ? colors.amber : colors.textMuted;
                const isTopThree = i < 3;

                const renderFactorCell = (value: number) => {
                  const cellColor = value >= 0.85 ? colors.primary : value >= 0.7 ? colors.textMuted : colors.textDim;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 28, height: 3, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${value * 100}%`, background: cellColor, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11, fontFamily: fonts.mono, color: cellColor }}>{value.toFixed(2)}</span>
                    </div>
                  );
                };

                return (
                  <div
                    key={stock.symbol}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '0.3fr 0.8fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr',
                      padding: '9px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      opacity: rowOpacity,
                      transform: `translateX(${rowX}px)`,
                      alignItems: 'center',
                      background: isTopThree ? `linear-gradient(90deg, ${colors.primaryDim}, transparent)` : 'transparent',
                    }}
                  >
                    <span style={{ fontSize: 11, fontFamily: fonts.mono, color: isTopThree ? colors.primary : colors.textDim, fontWeight: isTopThree ? 700 : 400 }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.text, fontWeight: 600 }}>
                      {stock.symbol}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 32, height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${stock.score}%`, background: scoreColor, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 13, fontFamily: fonts.mono, color: scoreColor, fontWeight: 700 }}>{stock.score}</span>
                    </div>
                    {renderFactorCell(stock.momentum)}
                    {renderFactorCell(stock.value)}
                    {renderFactorCell(stock.quality)}
                    {renderFactorCell(stock.trend)}
                    <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.primary, fontWeight: 600 }}>
                      {stock.change}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </AppChrome>
      </AbsoluteFill>
    </SceneTransition>
  );
};
