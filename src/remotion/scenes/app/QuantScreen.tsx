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

const quantMetrics = [
  { label: 'Sharpe Ratio', value: 1.92, max: 3, color: colors.primary },
  { label: 'Sortino Ratio', value: 2.45, max: 4, color: colors.accent },
  { label: 'Calmar Ratio', value: 1.73, max: 3, color: colors.blue },
  { label: 'Beta', value: 0.87, max: 2, color: colors.cyan },
  { label: 'Alpha', value: 4.2, max: 10, color: colors.primary },
  { label: 'VaR (95%)', value: -2.8, max: 10, color: '#ef4444' },
];

const radarLabels = ['Sharpe', 'Sortino', 'Calmar', 'Momentum', 'Quality', 'Stability'];
const radarValues = [0.82, 0.88, 0.72, 0.91, 0.78, 0.85];

const riskMetrics = [
  { label: 'Max Drawdown', value: '-14.3%', color: '#ef4444' },
  { label: 'Ulcer Index', value: '4.21', color: colors.amber },
  { label: 'Tail Ratio', value: '1.34', color: colors.primary },
  { label: 'Gain/Loss', value: '2.18', color: colors.primary },
  { label: 'Skewness', value: '-0.23', color: colors.textMuted },
  { label: 'Omega Ratio', value: '1.56', color: colors.accent },
];

export const QuantScreen: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneTransition durationInFrames={300}>
      <AbsoluteFill>
        <AppChrome activeTab="Vibe Studio" headerTitle="Quant Dashboard" headerSubtitle="Advanced quantitative analysis metrics">
          <div style={{ display: 'flex', gap: 16, height: '100%' }}>
            {/* Left column: Radar + Risk metrics */}
            <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Radar chart */}
              <div
                style={{
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '16px',
                  opacity: interpolate(frame, [20, 45], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Performance Radar
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <svg width="240" height="220" viewBox="0 0 240 220">
                    {/* Grid rings */}
                    {[0.25, 0.5, 0.75, 1].map((ring) => (
                      <polygon
                        key={ring}
                        fill="none"
                        stroke="#1a1a1a"
                        strokeWidth="1"
                        points={radarLabels.map((_, i) => {
                          const angle = (i / radarLabels.length) * Math.PI * 2 - Math.PI / 2;
                          const r = ring * 85;
                          return `${120 + r * Math.cos(angle)},${105 + r * Math.sin(angle)}`;
                        }).join(' ')}
                      />
                    ))}

                    {/* Data polygon */}
                    {(() => {
                      const progress = interpolate(frame, [40, 100], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                        easing: Easing.out(Easing.cubic),
                      });
                      return (
                        <polygon
                          fill={`${colors.primary}20`}
                          stroke={colors.primary}
                          strokeWidth="2"
                          points={radarValues.map((v, i) => {
                            const angle = (i / radarValues.length) * Math.PI * 2 - Math.PI / 2;
                            const r = v * 85 * progress;
                            return `${120 + r * Math.cos(angle)},${105 + r * Math.sin(angle)}`;
                          }).join(' ')}
                        />
                      );
                    })()}

                    {/* Labels */}
                    {radarLabels.map((label, i) => {
                      const angle = (i / radarLabels.length) * Math.PI * 2 - Math.PI / 2;
                      const r = 100;
                      const x = 120 + r * Math.cos(angle);
                      const y = 105 + r * Math.sin(angle);
                      return (
                        <text
                          key={label}
                          x={x}
                          y={y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={colors.textDim}
                          fontSize="9"
                          fontFamily={fonts.mono}
                        >
                          {label}
                        </text>
                      );
                    })}
                  </svg>
                </div>
              </div>

              {/* Risk metrics grid */}
              <div
                style={{
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '14px 16px',
                  opacity: interpolate(frame, [80, 105], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Risk Metrics
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {riskMetrics.map((m, i) => {
                    const delay = 90 + i * 8;
                    const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    });
                    return (
                      <div key={m.label} style={{ opacity, padding: '6px 0' }}>
                        <div style={{ fontSize: 9, color: colors.textDim, fontFamily: fonts.sans }}>{m.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: m.color, fontFamily: fonts.mono }}>{m.value}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right column: Metric bars + rolling chart */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Metric bars */}
              <div
                style={{
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '16px 20px',
                  opacity: interpolate(frame, [30, 55], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                  Performance Metrics
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {quantMetrics.map((m, i) => {
                    const barDelay = 50 + i * 12;
                    const barProgress = interpolate(frame, [barDelay, barDelay + 40], [0, Math.abs(m.value) / m.max], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                      easing: Easing.out(Easing.cubic),
                    });
                    return (
                      <div key={m.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.sans }}>{m.label}</span>
                          <span style={{ fontSize: 13, color: m.color, fontFamily: fonts.mono, fontWeight: 700 }}>{m.value}</span>
                        </div>
                        <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2 }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(barProgress * 100, 100)}%`,
                              background: m.color,
                              borderRadius: 2,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rolling metrics chart */}
              <div
                style={{
                  flex: 1,
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: 8,
                  padding: '16px 20px',
                  opacity: interpolate(frame, [100, 125], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Rolling 90-Day Sharpe Ratio
                </div>

                <svg width="100%" height="160" viewBox="0 0 700 160" preserveAspectRatio="none">
                  {/* Grid */}
                  <line x1="0" y1="80" x2="700" y2="80" stroke="#1a1a1a" strokeWidth="1" />
                  <line x1="0" y1="40" x2="700" y2="40" stroke="#1a1a1a" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="0" y1="120" x2="700" y2="120" stroke="#1a1a1a" strokeWidth="1" strokeDasharray="4 4" />

                  {/* Rolling Sharpe line */}
                  {(() => {
                    const points = 30;
                    const data = Array.from({ length: points }, (_, i) => {
                      const base = 1.5 + Math.sin(i * 0.3) * 0.5 + Math.cos(i * 0.5) * 0.3;
                      return base;
                    });
                    const max = 3;
                    const min = 0;

                    const drawProgress = interpolate(frame, [110, 200], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                      easing: Easing.out(Easing.cubic),
                    });
                    const pointsToShow = Math.ceil(drawProgress * data.length);
                    const visible = data.slice(0, pointsToShow);

                    const polyPoints = visible.map((v, i) => {
                      const x = (i / (data.length - 1)) * 700;
                      const y = 160 - ((v - min) / (max - min)) * 160;
                      return `${x},${y}`;
                    }).join(' ');

                    return (
                      <polyline fill="none" stroke={colors.accent} strokeWidth="2" points={polyPoints} />
                    );
                  })()}

                  {/* Labels */}
                  <text x="4" y="38" fill={colors.textDim} fontSize="8" fontFamily={fonts.mono}>3.0</text>
                  <text x="4" y="78" fill={colors.textDim} fontSize="8" fontFamily={fonts.mono}>1.5</text>
                  <text x="4" y="118" fill={colors.textDim} fontSize="8" fontFamily={fonts.mono}>0.0</text>
                </svg>
              </div>
            </div>
          </div>
        </AppChrome>
      </AbsoluteFill>
    </SceneTransition>
  );
};
