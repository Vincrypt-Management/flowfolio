import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig, Easing } from 'remotion';
import { colors, fonts, radius } from '../styles';
import { MockSidebar } from '../components/MockSidebar';
import { GlassCard } from '../components/GlassCard';
import { SceneTransition } from '../components/SceneTransition';
import { useSceneRNG } from '../lib/uniqueness';
import { generateJournalData } from '../lib/sceneData';

// ─── SVG Icons for Journal Entry Types ──────────────────────────

/** Briefcase — Trade Decision */
const IconTrade: React.FC<{ color: string }> = ({ color }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="10" width="18" height="11" rx="2" stroke={color} strokeWidth="1.6" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    <line x1="3" y1="14" x2="21" y2="14" stroke={color} strokeWidth="1.2" opacity="0.3" />
    <circle cx="12" cy="14" r="1.5" fill={color} opacity="0.6" />
  </svg>
);

/** Bar chart with trend — Review */
const IconReview: React.FC<{ color: string }> = ({ color }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <rect x="4" y="14" width="3" height="6" rx="0.5" fill={color} fillOpacity="0.3" />
    <rect x="10" y="10" width="3" height="10" rx="0.5" fill={color} fillOpacity="0.5" />
    <rect x="16" y="6" width="3" height="14" rx="0.5" fill={color} fillOpacity="0.7" />
    <polyline points="4,12 10,8 16,5 20,3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
  </svg>
);

/** Thought bubble — Reflection */
const IconReflection: React.FC<{ color: string }> = ({ color }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.2 0-2.3-.3-3.3-.7L4 20l1.2-3.7A7.9 7.9 0 0 1 4 12z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="9" cy="12" r="1" fill={color} opacity="0.5" />
    <circle cx="12" cy="12" r="1" fill={color} opacity="0.5" />
    <circle cx="15" cy="12" r="1" fill={color} opacity="0.5" />
  </svg>
);

/** Sparkle/star — Strategy Creation */
const IconStrategy: React.FC<{ color: string }> = ({ color }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6L12 2z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" fill={color} fillOpacity="0.15" />
  </svg>
);

interface JournalEntry {
  Icon: React.FC<{ color: string }>;
  iconColor: string;
  title: string;
  type: string;
  typeColor: string;
  borderColor: string;
  time: string;
  content: string;
  tags: string[];
}

const entries: JournalEntry[] = [
  {
    Icon: IconTrade,
    iconColor: colors.blue,
    title: 'NVIDIA Position Adjustment',
    type: 'Trade Decision',
    typeColor: colors.blue,
    borderColor: colors.blue,
    time: 'Feb 15, 2025',
    content: 'Reduced NVDA from 15 to 10 shares after hitting price target. Profit-taking based on 45% YTD gains.',
    tags: ['profit-taking', 'earnings-season'],
  },
  {
    Icon: IconReview,
    iconColor: colors.primary,
    title: 'Quarterly Strategy Review',
    type: 'Review',
    typeColor: colors.primary,
    borderColor: colors.primary,
    time: 'Feb 01, 2025',
    content: 'Q4 performance: Portfolio +12.3% vs SPY +8.5%. Tech slightly overweight but justified.',
    tags: ['performance', 'quarterly'],
  },
  {
    Icon: IconReflection,
    iconColor: colors.textMuted,
    title: 'Market Sentiment Shift',
    type: 'Reflection',
    typeColor: colors.textMuted,
    borderColor: colors.textMuted,
    time: 'Jan 28, 2025',
    content: 'Fed signals no more cuts in Q1. Rotating from growth to defensive value positions.',
    tags: ['macro', 'fed-policy', 'rotation'],
  },
  {
    Icon: IconStrategy,
    iconColor: colors.accent,
    title: 'New Vibe Strategy Created',
    type: 'Strategy Creation',
    typeColor: colors.accent,
    borderColor: colors.accent,
    time: 'Jan 20, 2025',
    content: 'Created "Momentum Value" vibe: 40% momentum, 30% value, 20% quality, 10% growth.',
    tags: ['new-strategy', 'momentum'],
  },
];

const typeBars = [
  { type: 'Trade', count: 14, color: colors.blue },
  { type: 'Review', count: 8, color: colors.primary },
  { type: 'Reflect', count: 7, color: colors.textMuted },
  { type: 'Strategy', count: 6, color: colors.accent },
  { type: 'Rebalance', count: 5, color: colors.amber },
  { type: 'Change', count: 2, color: colors.rose },
];

export const JournalDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rng = useSceneRNG('journal');
  const journalData = generateJournalData(rng);

  // Override stats with seed-driven values
  const dynamicStats = [
    { label: 'Total Entries', value: String(journalData.totalEntries), color: colors.text },
    { label: 'Day Streak', value: String(journalData.streak), color: colors.accent },
    { label: 'Unique Tags', value: String(rng.int(15, 40)), color: colors.primary },
  ];

  return (
    <SceneTransition durationInFrames={400}>
      <AbsoluteFill>
        <div style={{ display: 'flex', height: '100%' }}>
          <MockSidebar activeIndex={4} />

          <div
            style={{
              flex: 1,
              padding: '44px 48px',
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
            }}
          >
            {/* Header — gentle float up with quick timing */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: fonts.mono,
                  color: colors.primary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  marginBottom: 8,
                  opacity: interpolate(frame, [10, 49], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                  }),
                  transform: `translateY(${interpolate(frame, [10, 49], [8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })}px)`,
                }}
              >
                Journal
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: colors.text,
                  fontFamily: fonts.sans,
                  letterSpacing: '-0.02em',
                  opacity: interpolate(frame, [16, 55], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                  }),
                  transform: `translateY(${interpolate(frame, [16, 55], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })}px)`,
                }}
              >
                Decision Log
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: colors.textMuted,
                  fontFamily: fonts.sans,
                  marginTop: 4,
                  opacity: interpolate(frame, [24, 63], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                  }),
                  transform: `translateY(${interpolate(frame, [24, 63], [6, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })}px)`,
                }}
              >
                Structured trade rationale, post-mortems, and strategy evolution tracking
              </div>
            </div>

            <div style={{ display: 'flex', gap: 22, flex: 1 }}>
              {/* Timeline entries */}
              <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {entries.map((entry, i) => {
                  const entryDelay = 60 + i * 44;
                  const entryOp = interpolate(frame - entryDelay, [0, 30], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                  });
                  const entryX = interpolate(frame - entryDelay, [0, 30], [-20, 0], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                  });

                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 14,
                        opacity: entryOp,
                        transform: `translateX(${entryX}px)`,
                      }}
                    >
                      {/* Timeline line + dot */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: entry.borderColor, boxShadow: `0 0 8px ${entry.borderColor}40`, flexShrink: 0 }} />
                        {i < entries.length - 1 && <div style={{ width: 1, flex: 1, background: colors.border, marginTop: 4 }} />}
                      </div>

                      {/* Entry card */}
                      <div
                        style={{
                          flex: 1,
                          background: `linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)`,
                          border: `1px solid ${colors.glassBorder}`,
                          borderLeft: `3px solid ${entry.borderColor}`,
                          borderRadius: radius.xl,
                          padding: '14px 18px',
                          marginBottom: 2,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: radius.md,
                              background: `${entry.iconColor}15`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <entry.Icon color={entry.iconColor} />
                          </div>
                          <span style={{ fontSize: 14, fontFamily: fonts.sans, fontWeight: 600, color: colors.text, flex: 1 }}>
                            {entry.title}
                          </span>
                          <div style={{ padding: '2px 8px', borderRadius: radius.full, background: `${entry.typeColor}15`, fontSize: 10, fontFamily: fonts.mono, color: entry.typeColor, fontWeight: 500 }}>
                            {entry.type}
                          </div>
                        </div>
                        <div style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.textDim, marginBottom: 8 }}>
                          {entry.time}
                        </div>
                        <div style={{ fontSize: 12, fontFamily: fonts.sans, color: colors.textMuted, lineHeight: 1.5, marginBottom: 10 }}>
                          {entry.content}
                        </div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {entry.tags.map((tag) => (
                            <div key={tag} style={{ padding: '2px 8px', borderRadius: radius.full, background: 'rgba(255,255,255,0.05)', fontSize: 9, fontFamily: fonts.mono, color: colors.textDim }}>
                              {tag}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stats sidebar */}
              <div style={{ flex: 0.7, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Stat cards */}
                {dynamicStats.map((s, i) => {
                  const sDelay = 110 + i * 32;
                  const sScale = spring({
                    frame: Math.max(0, frame - sDelay),
                    fps,
                    config: { damping: 14, stiffness: 120, mass: 0.4 },
                  });
                  const sOp = interpolate(frame - sDelay, [0, 30], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                  });

                  return (
                    <div
                      key={s.label}
                      style={{
                        background: `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`,
                        border: `1px solid ${colors.glassBorder}`,
                        borderRadius: radius['2xl'],
                        padding: '14px 18px',
                        transform: `scale(${sScale})`,
                        opacity: sOp,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: `0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)`,
                      }}
                    >
                      <span style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
                      <span style={{ fontSize: 22, fontFamily: fonts.mono, fontWeight: 800, color: s.color, textShadow: `0 0 12px ${s.color}20` }}>{s.value}</span>
                    </div>
                  );
                })}

                {/* Entries by type bar chart */}
                <GlassCard delay={170} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 11, fontFamily: fonts.mono, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                    Entries by Type
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {typeBars.map((bar, i) => {
                      const barDelay = 200 + i * 20;
                      const barWidth = interpolate(frame - barDelay, [0, 30], [0, (bar.count / 14) * 100], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                      easing: Easing.out(Easing.cubic),
                      });
                      const barOp = interpolate(frame - barDelay, [0, 30], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                      easing: Easing.out(Easing.cubic),
                      });

                      return (
                        <div key={bar.type} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: barOp }}>
                          <span style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.textDim, width: 50, textAlign: 'right' }}>{bar.type}</span>
                          <div style={{ flex: 1, height: 6, background: colors.bgHover, borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${barWidth}%`, background: `linear-gradient(90deg, ${bar.color}80, ${bar.color})`, borderRadius: 3, boxShadow: `0 0 6px ${bar.color}30` }} />
                          </div>
                          <span style={{ fontSize: 10, fontFamily: fonts.mono, color: bar.color, fontWeight: 600, width: 16 }}>{bar.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};
