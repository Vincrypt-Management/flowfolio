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

const categories = [
  {
    name: 'Performance Review',
    items: [
      { check: 'Total return exceeded benchmark', status: 'pass' },
      { check: 'Sharpe ratio above 1.0', status: 'pass' },
      { check: 'Max drawdown within tolerance', status: 'pass' },
    ],
  },
  {
    name: 'Risk Assessment',
    items: [
      { check: 'No single position > 20%', status: 'pass' },
      { check: 'Sector concentration < 40%', status: 'review' },
      { check: 'Beta within target range', status: 'pass' },
    ],
  },
  {
    name: 'Rebalancing',
    items: [
      { check: 'Drift within threshold', status: 'action' },
      { check: 'Rebalance executed on schedule', status: 'pass' },
      { check: 'Transaction costs reasonable', status: 'pass' },
    ],
  },
  {
    name: 'Tax Optimization',
    items: [
      { check: 'Tax-loss harvesting opportunities', status: 'review' },
      { check: 'Long-term vs short-term gains', status: 'pass' },
    ],
  },
];

const statusConfig = {
  pass: { label: 'Pass', color: colors.primary, bg: 'rgba(0,229,153,0.08)' },
  review: { label: 'Needs Review', color: colors.amber, bg: 'rgba(251,191,36,0.08)' },
  action: { label: 'Action Required', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
};

const recommendations = [
  'Consider reducing NVDA position from 17.1% to 15% target — currently above threshold',
  'Tech sector at 38% — approaching 40% concentration limit. Monitor closely.',
  'Tax-loss harvesting opportunity: TSLA position showing unrealized loss of $420',
];

export const YearlyReviewScreen: React.FC = () => {
  const frame = useCurrentFrame();

  const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);
  const passedItems = categories.reduce(
    (sum, c) => sum + c.items.filter((item) => item.status === 'pass').length,
    0
  );
  const healthScore = Math.round((passedItems / totalItems) * 100);

  return (
    <SceneTransition durationInFrames={300}>
      <AbsoluteFill>
        <AppChrome activeTab="Yearly Review" headerTitle="Yearly Review" headerSubtitle="Annual portfolio health assessment — 2025">
          <div style={{ display: 'flex', gap: 16, height: '100%' }}>
            {/* Left: Health score + checklist */}
            <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Health score */}
              <div
                style={{
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 24,
                  opacity: interpolate(frame, [20, 45], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                {/* Circular progress */}
                <div style={{ position: 'relative', width: 80, height: 80 }}>
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="#1a1a1a" strokeWidth="6" />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke={colors.primary}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 34}`}
                      strokeDashoffset={(() => {
                        const progress = interpolate(frame, [30, 90], [1, 1 - healthScore / 100], {
                          extrapolateLeft: 'clamp',
                          extrapolateRight: 'clamp',
                          easing: Easing.out(Easing.cubic),
                        });
                        return 2 * Math.PI * 34 * progress;
                      })()}
                      transform="rotate(-90 40 40)"
                    />
                  </svg>
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: 20,
                      fontWeight: 800,
                      color: colors.primary,
                      fontFamily: fonts.mono,
                    }}
                  >
                    {(() => {
                      const animScore = interpolate(frame, [30, 90], [0, healthScore], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                        easing: Easing.out(Easing.cubic),
                      });
                      return Math.round(animScore);
                    })()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: colors.text, fontFamily: fonts.sans }}>Portfolio Health Score</div>
                  <div style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.sans, marginTop: 2 }}>
                    {passedItems} of {totalItems} checks passed · {totalItems - passedItems} items need attention
                  </div>
                </div>
              </div>

              {/* Checklist categories */}
              {categories.map((category, ci) => {
                const catDelay = 50 + ci * 25;
                const catOpacity = interpolate(frame, [catDelay, catDelay + 20], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });

                return (
                  <div
                    key={category.name}
                    style={{
                      background: '#0a0a0a',
                      border: '1px solid #1a1a1a',
                      borderRadius: 8,
                      padding: '14px 18px',
                      opacity: catOpacity,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, fontFamily: fonts.sans, marginBottom: 10 }}>
                      {category.name}
                    </div>
                    {category.items.map((item, ii) => {
                      const itemDelay = catDelay + 10 + ii * 8;
                      const itemOpacity = interpolate(frame, [itemDelay, itemDelay + 15], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                      });
                      const cfg = statusConfig[item.status as keyof typeof statusConfig];
                      return (
                        <div
                          key={item.check}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '7px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                            opacity: itemOpacity,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 3,
                                background: cfg.bg,
                                border: `1px solid ${cfg.color}40`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 8,
                                color: cfg.color,
                              }}
                            >
                              {item.status === 'pass' ? '✓' : item.status === 'review' ? '!' : '✗'}
                            </div>
                            <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.sans }}>{item.check}</span>
                          </div>
                          <span
                            style={{
                              fontSize: 9,
                              fontFamily: fonts.mono,
                              color: cfg.color,
                              background: cfg.bg,
                              padding: '1px 6px',
                              borderRadius: 3,
                              fontWeight: 600,
                            }}
                          >
                            {cfg.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Right: Recommendations */}
            <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '16px 18px',
                  opacity: interpolate(frame, [120, 145], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  AI Recommendations
                </div>
                {recommendations.map((rec, i) => {
                  const recDelay = 140 + i * 15;
                  const recOpacity = interpolate(frame, [recDelay, recDelay + 18], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  return (
                    <div
                      key={rec}
                      style={{
                        padding: '10px 12px',
                        background: '#111',
                        border: '1px solid #1a1a1a',
                        borderLeft: `3px solid ${colors.amber}`,
                        borderRadius: 6,
                        marginBottom: 8,
                        opacity: recOpacity,
                      }}
                    >
                      <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.sans, lineHeight: 1.5 }}>
                        {rec}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary stats */}
              <div
                style={{
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '14px 16px',
                  opacity: interpolate(frame, [160, 185], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Year Summary
                </div>
                {[
                  { label: 'Total Return', value: '+24.8%', color: colors.primary },
                  { label: 'Trades Executed', value: '48', color: colors.text },
                  { label: 'Rebalances', value: '12', color: colors.text },
                  { label: 'Journal Entries', value: '47', color: colors.text },
                  { label: 'Avg Monthly Return', value: '+1.9%', color: colors.primary },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.sans }}>{item.label}</span>
                    <span style={{ fontSize: 12, color: item.color, fontFamily: fonts.mono, fontWeight: 600 }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AppChrome>
      </AbsoluteFill>
    </SceneTransition>
  );
};
