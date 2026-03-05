import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from 'remotion';
import { colors, fonts } from '../../styles';
import { AppChrome } from '../../components/AppChrome';
import { SceneTransition } from '../../components/SceneTransition';

const holdings = [
  { symbol: 'AAPL', shares: 50, price: '$178.42', value: '$8,921', target: 18, current: 17.2, drift: -0.8 },
  { symbol: 'MSFT', shares: 20, price: '$415.60', value: '$8,312', target: 16, current: 16.0, drift: 0.0 },
  { symbol: 'NVDA', shares: 10, price: '$875.30', value: '$8,753', target: 15, current: 16.9, drift: +1.9 },
  { symbol: 'AMZN', shares: 35, price: '$185.92', value: '$6,507', target: 12, current: 12.5, drift: +0.5 },
  { symbol: 'GOOGL', shares: 35, price: '$152.14', value: '$5,325', target: 10, current: 10.2, drift: +0.2 },
  { symbol: 'META', shares: 10, price: '$502.30', value: '$5,023', target: 10, current: 9.7, drift: -0.3 },
];

const buyList = [
  { symbol: 'AAPL', action: 'BUY', amount: '$450', shares: '2.5', priority: 'High', rationale: 'Below target allocation — strong momentum score' },
  { symbol: 'META', action: 'BUY', amount: '$200', shares: '0.4', priority: 'Medium', rationale: 'Slight underweight — rising analyst consensus' },
  { symbol: 'NVDA', action: 'HOLD', amount: '—', shares: '—', priority: 'Low', rationale: 'Slightly above target — let position drift naturally' },
];

export const PortfolioScreen: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneTransition durationInFrames={360}>
      <AbsoluteFill>
        <AppChrome activeTab="Portfolio" headerTitle="Portfolio" headerSubtitle="Track holdings and rebalance">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
            {/* Summary row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Total Value', value: '$51,841.00' },
                { label: 'Cash', value: '$4,500.00' },
                { label: 'Holdings', value: '6' },
                { label: 'Last Updated', value: 'Just now' },
              ].map((item, i) => {
                const delay = 25 + i * 10;
                return (
                  <div
                    key={item.label}
                    style={{
                      background: '#0a0a0a',
                      border: '1px solid #1a1a1a',
                      borderRadius: 6,
                      padding: '12px 14px',
                      opacity: interpolate(frame, [delay, delay + 20], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                      }),
                    }}
                  >
                    <div style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.sans }}>{item.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, fontFamily: fonts.mono, marginTop: 4 }}>{item.value}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
              {/* Holdings table */}
              <div
                style={{
                  flex: 1.5,
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '16px 18px',
                  opacity: interpolate(frame, [50, 75], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Holdings
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '0.8fr 0.6fr 0.8fr 0.9fr 0.6fr 0.7fr 0.7fr',
                    padding: '6px 0',
                    borderBottom: '1px solid #1a1a1a',
                  }}
                >
                  {['Symbol', 'Shares', 'Price', 'Value', 'Target', 'Current', 'Drift'].map((h) => (
                    <div key={h} style={{ fontSize: 9, fontFamily: fonts.mono, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {h}
                    </div>
                  ))}
                </div>

                {holdings.map((h, i) => {
                  const rowDelay = 70 + i * 14;
                  const rowOpacity = interpolate(frame, [rowDelay, rowDelay + 20], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  const driftColor = h.drift > 1 ? colors.amber : h.drift < -0.5 ? '#ef4444' : h.drift === 0 ? colors.textDim : colors.primary;

                  return (
                    <div
                      key={h.symbol}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '0.8fr 0.6fr 0.8fr 0.9fr 0.6fr 0.7fr 0.7fr',
                        padding: '9px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        opacity: rowOpacity,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.text, fontWeight: 600 }}>{h.symbol}</span>
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.textMuted }}>{h.shares}</span>
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.textMuted }}>{h.price}</span>
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.text }}>{h.value}</span>
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.textDim }}>{h.target}%</span>
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.text }}>{h.current}%</span>
                      <span style={{ fontSize: 12, fontFamily: fonts.mono, color: driftColor, fontWeight: 600 }}>
                        {h.drift > 0 ? '+' : ''}{h.drift.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Buy list */}
              <div
                style={{
                  flex: 1,
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '16px 18px',
                  opacity: interpolate(frame, [120, 145], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Buy List — $650 Monthly Contribution
                </div>

                {buyList.map((item, i) => {
                  const cardDelay = 140 + i * 20;
                  const cardOpacity = interpolate(frame, [cardDelay, cardDelay + 20], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });

                  const actionColor = item.action === 'BUY' ? colors.primary : colors.textDim;

                  return (
                    <div
                      key={`${item.symbol}-${item.action}`}
                      style={{
                        background: '#111',
                        border: '1px solid #1a1a1a',
                        borderLeft: `3px solid ${actionColor}`,
                        borderRadius: 6,
                        padding: '12px 14px',
                        marginBottom: 10,
                        opacity: cardOpacity,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.text, fontWeight: 700 }}>{item.symbol}</span>
                          <span style={{ fontSize: 9, fontFamily: fonts.mono, color: actionColor, background: `${actionColor}15`, padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>
                            {item.action}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, fontFamily: fonts.mono, color: item.priority === 'High' ? colors.primary : item.priority === 'Medium' ? colors.amber : colors.textDim }}>
                          {item.priority}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textMuted }}>Amount: <span style={{ color: colors.text }}>{item.amount}</span></span>
                        <span style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textMuted }}>Shares: <span style={{ color: colors.text }}>{item.shares}</span></span>
                      </div>
                      <div style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.sans, lineHeight: 1.4 }}>
                        {item.rationale}
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
