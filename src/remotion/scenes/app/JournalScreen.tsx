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

const journalEntries = [
  {
    type: 'Trade',
    title: 'Added NVDA position',
    content: 'Bought 5 shares of NVDA at $845. Strong momentum and AI tailwinds. Entry aligns with vibe plan scoring above 90.',
    date: 'Mar 3, 2026',
    tags: ['nvda', 'entry', 'momentum'],
    color: colors.primary,
  },
  {
    type: 'Strategy',
    title: 'Rebalance threshold adjustment',
    content: 'Lowered rebalance threshold from 5% to 3% drift. Market volatility increasing — want tighter risk control.',
    date: 'Mar 1, 2026',
    tags: ['risk', 'rebalance'],
    color: colors.accent,
  },
  {
    type: 'Review',
    title: 'Monthly performance review',
    content: 'Portfolio up 3.2% in February. Tech sector driving returns. TSLA underperforming — considering replacement per optimizer suggestion.',
    date: 'Feb 28, 2026',
    tags: ['review', 'monthly'],
    color: colors.blue,
  },
  {
    type: 'Reflection',
    title: 'Conviction vs. data',
    content: 'Resisted urge to sell GOOGL during dip. Quant metrics still strong. Reminder: trust the system, not the noise.',
    date: 'Feb 25, 2026',
    tags: ['psychology', 'discipline'],
    color: colors.amber,
  },
  {
    type: 'Rebalance',
    title: 'Q1 rebalance executed',
    content: 'Sold 3 shares NVDA (overweight), bought 15 shares AMZN (underweight). Net cash impact: +$120.',
    date: 'Feb 20, 2026',
    tags: ['rebalance', 'q1'],
    color: colors.cyan,
  },
];

const stats = [
  { label: 'Total Entries', value: '47' },
  { label: 'This Month', value: '8' },
  { label: 'Streak', value: '12 days' },
  { label: 'Most Common', value: 'Trade' },
];

const entryTypeBars = [
  { type: 'Trade', count: 18, max: 20, color: colors.primary },
  { type: 'Strategy', count: 10, max: 20, color: colors.accent },
  { type: 'Review', count: 8, max: 20, color: colors.blue },
  { type: 'Reflection', count: 6, max: 20, color: colors.amber },
  { type: 'Rebalance', count: 5, max: 20, color: colors.cyan },
];

export const JournalScreen: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneTransition durationInFrames={300}>
      <AbsoluteFill>
        <AppChrome activeTab="Journal" headerTitle="Investment Journal" headerSubtitle="Track decisions, reflections, and trades">
          <div style={{ display: 'flex', gap: 16, height: '100%' }}>
            {/* Timeline */}
            <div
              style={{
                flex: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                opacity: interpolate(frame, [20, 45], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              }}
            >
              {journalEntries.map((entry, i) => {
                const cardDelay = 30 + i * 18;
                const cardOpacity = interpolate(frame, [cardDelay, cardDelay + 22], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
                const cardX = interpolate(frame, [cardDelay, cardDelay + 22], [-15, 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                });

                return (
                  <div
                    key={entry.title}
                    style={{
                      background: '#0a0a0a',
                      border: '1px solid #1a1a1a',
                      borderLeft: `3px solid ${entry.color}`,
                      borderRadius: 6,
                      padding: '14px 16px',
                      opacity: cardOpacity,
                      transform: `translateX(${cardX}px)`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 9, fontFamily: fonts.mono, color: entry.color, background: `${entry.color}15`, padding: '1px 6px', borderRadius: 3, fontWeight: 600, textTransform: 'uppercase' }}>
                          {entry.type}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, fontFamily: fonts.sans }}>{entry.title}</span>
                      </div>
                      <span style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.mono }}>{entry.date}</span>
                    </div>
                    <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.sans, lineHeight: 1.5, marginBottom: 8 }}>
                      {entry.content}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {entry.tags.map((tag) => (
                        <span key={tag} style={{ fontSize: 9, fontFamily: fonts.mono, color: colors.textDim, background: '#1a1a1a', padding: '1px 6px', borderRadius: 3 }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right sidebar: Stats + chart */}
            <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Stats cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  opacity: interpolate(frame, [60, 85], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                {stats.map((s) => (
                  <div
                    key={s.label}
                    style={{
                      background: '#0a0a0a',
                      border: '1px solid #1a1a1a',
                      borderRadius: 6,
                      padding: '10px 12px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, fontFamily: fonts.mono }}>{s.value}</div>
                    <div style={{ fontSize: 9, color: colors.textDim, fontFamily: fonts.sans }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Entries by type */}
              <div
                style={{
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '14px 16px',
                  opacity: interpolate(frame, [90, 115], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Entries by Type
                </div>
                {entryTypeBars.map((bar, i) => {
                  const barDelay = 100 + i * 10;
                  const barWidth = interpolate(frame, [barDelay, barDelay + 30], [0, (bar.count / bar.max) * 100], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                    easing: Easing.out(Easing.cubic),
                  });
                  return (
                    <div key={bar.type} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: fonts.sans }}>{bar.type}</span>
                        <span style={{ fontSize: 10, color: bar.color, fontFamily: fonts.mono, fontWeight: 600 }}>{bar.count}</span>
                      </div>
                      <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${barWidth}%`, background: bar.color, borderRadius: 2 }} />
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
