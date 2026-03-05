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

const portfolioAssets = [
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'Stock', score: 92, allocation: 18, price: '$178.42', sentiment: 'Bullish', analyst: 'Strong Buy' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', type: 'Stock', score: 89, allocation: 16, price: '$415.60', sentiment: 'Bullish', analyst: 'Buy' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'Stock', score: 95, allocation: 15, price: '$875.30', sentiment: 'Very Bullish', analyst: 'Strong Buy' },
  { symbol: 'AMZN', name: 'Amazon.com', type: 'Stock', score: 86, allocation: 12, price: '$185.92', sentiment: 'Bullish', analyst: 'Buy' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'Stock', score: 84, allocation: 10, price: '$152.14', sentiment: 'Neutral', analyst: 'Buy' },
  { symbol: 'META', name: 'Meta Platforms', type: 'Stock', score: 88, allocation: 10, price: '$502.30', sentiment: 'Bullish', analyst: 'Buy' },
  { symbol: 'QQQ', name: 'Invesco QQQ', type: 'ETF', score: 82, allocation: 10, price: '$438.21', sentiment: 'Neutral', analyst: 'Hold' },
  { symbol: 'CASH', name: 'Cash Reserve', type: 'Cash', score: 0, allocation: 9, price: '—', sentiment: '—', analyst: '—' },
];

const metaBadges = [
  { label: 'Risk', value: 'Moderate', color: colors.amber },
  { label: 'Horizon', value: '3-5 Years', color: colors.blue },
  { label: 'Rebalance', value: 'Monthly', color: colors.accent },
  { label: 'Sharpe', value: '1.84', color: colors.primary },
  { label: 'Diversification', value: 'Good', color: colors.primary },
];

const allocationColors = [
  '#00e599', '#818cf8', '#38bdf8', '#fb7185', '#fbbf24', '#22d3ee', '#a78bfa', '#94a3b8',
];

export const VibeStudioResultScreen: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneTransition durationInFrames={480}>
      <AbsoluteFill>
        <AppChrome activeTab="Vibe Studio" headerTitle="Vibe Studio" headerSubtitle="AI-powered portfolio generation">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
            {/* Generated portfolio header */}
            <div
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: 8,
                padding: '16px 20px',
                borderLeft: `3px solid ${colors.accent}`,
                opacity: interpolate(frame, [20, 45], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: colors.text, fontFamily: fonts.sans }}>
                    Growth Momentum Alpha
                  </div>
                  <div style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.sans, marginTop: 3, maxWidth: 600 }}>
                    AI-generated multi-factor portfolio targeting high-growth technology stocks with strong momentum and quality fundamentals
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.primary, padding: '3px 8px', borderRadius: 3, background: 'rgba(0,229,153,0.1)', border: '1px solid rgba(0,229,153,0.2)' }}>
                    ✓ Quant Optimized
                  </div>
                  <div style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.accent, padding: '3px 8px', borderRadius: 3, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                    AI Generated
                  </div>
                </div>
              </div>

              {/* Meta badges */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {metaBadges.map((badge, i) => {
                  const badgeDelay = 40 + i * 8;
                  const badgeOpacity = interpolate(frame, [badgeDelay, badgeDelay + 15], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  return (
                    <div
                      key={badge.label}
                      style={{
                        fontSize: 10,
                        fontFamily: fonts.mono,
                        color: badge.color,
                        padding: '3px 8px',
                        borderRadius: 3,
                        background: `${badge.color}10`,
                        border: `1px solid ${badge.color}20`,
                        opacity: badgeOpacity,
                      }}
                    >
                      {badge.label}: {badge.value}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
              {/* Left: Allocation chart + performance */}
              <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Pie chart mockup */}
                <div
                  style={{
                    background: '#0a0a0a',
                    border: '1px solid #1a1a1a',
                    borderRadius: 8,
                    padding: '16px',
                    opacity: interpolate(frame, [50, 75], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    }),
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                    Allocation
                  </div>
                  {/* SVG donut chart */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                    <svg width="140" height="140" viewBox="0 0 140 140">
                      {(() => {
                        let cumAngle = -90;
                        return portfolioAssets.filter(a => a.type !== 'Cash').map((asset, i) => {
                          const angle = (asset.allocation / 100) * 360;
                          const startAngle = cumAngle;
                          cumAngle += angle;
                          const endAngle = cumAngle;
                          const startRad = (startAngle * Math.PI) / 180;
                          const endRad = (endAngle * Math.PI) / 180;
                          const cx = 70, cy = 70, r = 55, ir = 35;
                          const x1 = cx + r * Math.cos(startRad);
                          const y1 = cy + r * Math.sin(startRad);
                          const x2 = cx + r * Math.cos(endRad);
                          const y2 = cy + r * Math.sin(endRad);
                          const x3 = cx + ir * Math.cos(endRad);
                          const y3 = cy + ir * Math.sin(endRad);
                          const x4 = cx + ir * Math.cos(startRad);
                          const y4 = cy + ir * Math.sin(startRad);
                          const largeArc = angle > 180 ? 1 : 0;

                          const progress = interpolate(frame, [60 + i * 8, 90 + i * 8], [0, 1], {
                            extrapolateLeft: 'clamp',
                            extrapolateRight: 'clamp',
                          });

                          return (
                            <path
                              key={asset.symbol}
                              d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${ir} ${ir} 0 ${largeArc} 0 ${x4} ${y4} Z`}
                              fill={allocationColors[i]}
                              opacity={progress}
                            />
                          );
                        });
                      })()}
                    </svg>
                  </div>
                  {/* Legend */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {portfolioAssets.filter(a => a.type !== 'Cash').map((asset, i) => (
                      <div key={asset.symbol} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: allocationColors[i] }} />
                        <span style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.textMuted, flex: 1 }}>{asset.symbol}</span>
                        <span style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.text }}>{asset.allocation}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Performance card */}
                <div
                  style={{
                    background: '#0a0a0a',
                    border: '1px solid #1a1a1a',
                    borderRadius: 8,
                    padding: '14px 16px',
                    opacity: interpolate(frame, [100, 125], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    }),
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    Expected Performance
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.sans }}>Expected Return</span>
                    <span style={{ fontSize: 13, color: colors.primary, fontFamily: fonts.mono, fontWeight: 700 }}>18.4%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.sans }}>Volatility</span>
                    <span style={{ fontSize: 13, color: colors.amber, fontFamily: fonts.mono, fontWeight: 700 }}>22.1%</span>
                  </div>
                </div>
              </div>

              {/* Right: Assets table */}
              <div
                style={{
                  flex: 1,
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '16px 20px',
                  opacity: interpolate(frame, [60, 85], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Portfolio Assets
                </div>

                {/* Table header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '0.8fr 1.5fr 0.6fr 0.6fr 0.7fr 0.7fr 0.8fr 0.8fr',
                    padding: '8px 0',
                    borderBottom: '1px solid #1a1a1a',
                    marginBottom: 2,
                  }}
                >
                  {['Symbol', 'Name', 'Type', 'Score', 'Alloc', 'Price', 'Sentiment', 'Analyst'].map((h) => (
                    <div key={h} style={{ fontSize: 9, fontFamily: fonts.mono, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {h}
                    </div>
                  ))}
                </div>

                {/* Table rows */}
                {portfolioAssets.map((asset, i) => {
                  const rowDelay = 80 + i * 14;
                  const rowOpacity = interpolate(frame, [rowDelay, rowDelay + 20], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  const rowX = interpolate(frame, [rowDelay, rowDelay + 20], [10, 0], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                    easing: Easing.out(Easing.cubic),
                  });

                  const scoreColor = asset.score >= 90 ? colors.primary : asset.score >= 80 ? colors.accent : colors.textMuted;
                  const sentimentColor = asset.sentiment.includes('Bullish') ? colors.primary : colors.textMuted;

                  return (
                    <div
                      key={asset.symbol}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '0.8fr 1.5fr 0.6fr 0.6fr 0.7fr 0.7fr 0.8fr 0.8fr',
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        opacity: rowOpacity,
                        transform: `translateX(${rowX}px)`,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.text, fontWeight: 600 }}>{asset.symbol}</span>
                      <span style={{ fontSize: 11, fontFamily: fonts.sans, color: colors.textMuted }}>{asset.name}</span>
                      <span style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.textDim, background: '#1a1a1a', padding: '1px 6px', borderRadius: 3, width: 'fit-content' }}>{asset.type}</span>
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: scoreColor, fontWeight: 700 }}>{asset.score || '—'}</span>
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.text }}>{asset.allocation}%</span>
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.textMuted }}>{asset.price}</span>
                      <span style={{ fontSize: 10, fontFamily: fonts.mono, color: sentimentColor }}>{asset.sentiment}</span>
                      <span style={{ fontSize: 10, fontFamily: fonts.mono, color: asset.analyst.includes('Strong') ? colors.primary : asset.analyst === 'Hold' ? colors.textDim : colors.blue }}>{asset.analyst}</span>
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
