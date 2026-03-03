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
import { RadarChartAnim } from '../components/RadarChartAnim';
import { SceneTransition } from '../components/SceneTransition';
import { useSceneRNG } from '../lib/uniqueness';
import { generateQuantData } from '../lib/sceneData';

const metricColors = [colors.primary, colors.accent, colors.cyan, colors.amber, colors.blue, colors.rose];

export const QuantDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rng = useSceneRNG('quant');
  const data = generateQuantData(rng);

  const radarLabels = data.metrics.map((m) => m.name.split(' ')[0]);
  const radarValues = data.radarValues;

  const quantMetrics = data.metrics.map((m, i) => ({
    label: m.name.split(' ').slice(0, 2).join(' '),
    value: m.value.toFixed(2),
    color: metricColors[i % metricColors.length],
  }));

  return (
    <SceneTransition durationInFrames={380}>
      <AbsoluteFill>
        <div style={{ display: 'flex', height: '100%' }}>
          <MockSidebar activeIndex={3} />

          <div
            style={{
              flex: 1,
              padding: '44px 48px',
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
            }}
          >
            {/* Header — wide stagger with downward slide */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: fonts.mono,
                  color: colors.primary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  marginBottom: 8,
                  opacity: interpolate(frame, [10, 42], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                  }),
                  transform: `translateY(${interpolate(frame, [10, 42], [-10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })}px)`,
                }}
              >
                Quant Analysis
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: colors.text,
                  fontFamily: fonts.sans,
                  letterSpacing: '-0.02em',
                  opacity: interpolate(frame, [32, 64], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                  }),
                  transform: `translateY(${interpolate(frame, [32, 64], [-12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })}px)`,
                }}
              >
                Multi-Factor Risk Engine
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: colors.textMuted,
                  fontFamily: fonts.sans,
                  marginTop: 4,
                  opacity: interpolate(frame, [56, 88], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                  }),
                  transform: `translateY(${interpolate(frame, [56, 88], [-8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })}px)`,
                }}
              >
                Sharpe, Sortino, max drawdown, and factor decomposition per holding
              </div>
            </div>

            <div style={{ display: 'flex', gap: 28, flex: 1 }}>
              {/* Radar chart */}
              <GlassCard
                delay={24}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                glowColor={colors.primaryDim20}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: colors.textDim,
                    fontFamily: fonts.mono,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 20,
                    alignSelf: 'flex-start',
                  }}
                >
                  Factor Profile — AAPL
                </div>
                <RadarChartAnim
                  labels={radarLabels}
                  values={radarValues}
                  size={370}
                  delay={36}
                  duration={55}
                />
              </GlassCard>

              {/* Quant metrics grid */}
              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 14,
                  alignContent: 'start',
                }}
              >
                {quantMetrics.map((m, i) => {
                  const cardDelay = 50 + i * 20;
                  const cardScale = spring({
                    frame: Math.max(0, frame - cardDelay),
                    fps,
                    config: { damping: 14, stiffness: 120, mass: 0.4 },
                  });
                  const cardOpacity = interpolate(frame - cardDelay, [0, 30], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
                  });

                  return (
                    <div
                      key={m.label}
                      style={{
                        background: `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`,
                        border: `1px solid ${colors.glassBorder}`,
                        borderRadius: radius['2xl'],
                        padding: '20px 24px',
                        transform: `scale(${cardScale})`,
                        opacity: cardOpacity,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: `0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)`,
                      }}
                    >
                      {/* Top shine */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: '15%',
                          right: '15%',
                          height: 1,
                          background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)`,
                        }}
                      />
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: fonts.mono,
                          color: colors.textDim,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                        }}
                      >
                        {m.label}
                      </div>
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          fontFamily: fonts.mono,
                          color: m.color,
                          textShadow: `0 0 20px ${m.color}30`,
                        }}
                      >
                        {m.value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};
