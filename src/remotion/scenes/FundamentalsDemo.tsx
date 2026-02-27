import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from 'remotion';
import { colors, fonts, radius } from '../styles';
import { MockSidebar } from '../components/MockSidebar';
import { GlassCard } from '../components/GlassCard';
import { SceneTransition } from '../components/SceneTransition';
import { useSceneRNG } from '../lib/uniqueness';
import { generateFundamentalsData } from '../lib/sceneData';

interface FundRow {
  symbol: string;
  pe: number;
  pb: number;
  roe: number;
  margin: number;
  revGrowth: number;
  de: number;
  divYield: number;
  mktCap: string;
}

const mktCapOptions = ['$2.0T', '$2.1T', '$2.4T', '$2.8T', '$3.0T', '$3.2T', '$3.4T', '$1.8T', '$1.5T', '$0.8T'];

export const FundamentalsDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const rng = useSceneRNG('fundamentals');
  const data = generateFundamentalsData(rng);

  const fundamentals: FundRow[] = data.stocks.map((s) => ({
    symbol: s.symbol,
    pe: Math.round(s.pe * 10) / 10,
    pb: Math.round(s.pb * 10) / 10,
    roe: Math.round(s.roe * 10) / 10,
    margin: Math.round(s.margin * 10) / 10,
    revGrowth: Math.round(rng.vary(15, 0.8) * 10) / 10,
    de: Math.round(rng.vary(0.8, 0.5) * 10) / 10,
    divYield: Math.round(rng.vary(0.5, 0.8) * 100) / 100,
    mktCap: rng.pick(mktCapOptions),
  }));

const columns = ['P/E', 'P/B', 'ROE', 'Margin', 'Rev Gr.', 'D/E', 'Div %', 'Mkt Cap'];

// Color coding logic
function metricColor(col: string, val: number): string {
  switch (col) {
    case 'P/E':
      return val < 20 ? colors.primary : val < 30 ? colors.amber : colors.rose;
    case 'P/B':
      return val < 3 ? colors.primary : val < 10 ? colors.amber : colors.rose;
    case 'ROE':
      return val > 25 ? colors.primary : val > 15 ? colors.amber : colors.rose;
    case 'Margin':
      return val > 25 ? colors.primary : val > 15 ? colors.amber : colors.rose;
    case 'Rev Gr.':
      return val > 10 ? colors.primary : val > 5 ? colors.amber : colors.rose;
    case 'D/E':
      return val < 1 ? colors.primary : val < 2 ? colors.amber : colors.rose;
    case 'Div %':
      return colors.textMuted;
    default:
      return colors.textMuted;
  }
}

function getVal(row: FundRow, col: string): string {
  switch (col) {
    case 'P/E': return row.pe.toFixed(1);
    case 'P/B': return row.pb.toFixed(1);
    case 'ROE': return row.roe.toFixed(1) + '%';
    case 'Margin': return row.margin.toFixed(1) + '%';
    case 'Rev Gr.': return row.revGrowth.toFixed(1) + '%';
    case 'D/E': return row.de.toFixed(1);
    case 'Div %': return row.divYield.toFixed(2) + '%';
    case 'Mkt Cap': return row.mktCap;
    default: return '';
  }
}

function getNumVal(row: FundRow, col: string): number {
  switch (col) {
    case 'P/E': return row.pe;
    case 'P/B': return row.pb;
    case 'ROE': return row.roe;
    case 'Margin': return row.margin;
    case 'Rev Gr.': return row.revGrowth;
    case 'D/E': return row.de;
    case 'Div %': return row.divYield;
    default: return 0;
  }
}

  const radarLabels = ['Value', 'Quality', 'Growth', 'Momentum', 'Sentiment'];
  const radarScores = [rng.int(50, 95), rng.int(60, 98), rng.int(45, 90), rng.int(55, 92), rng.int(50, 88)];

  return (
    <SceneTransition durationInFrames={200}>
      <AbsoluteFill>
        <div style={{ display: 'flex', height: '100%' }}>
          <MockSidebar activeIndex={3} />

          <div
            style={{
              flex: 1,
              padding: '44px 48px',
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
            }}
          >
            {/* Header */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: fonts.mono,
                  color: colors.accent,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  marginBottom: 8,
                  opacity: interpolate(frame, [10, 25], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                Fundamentals
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: colors.text,
                  fontFamily: fonts.sans,
                  letterSpacing: '-0.02em',
                  opacity: interpolate(frame, [15, 30], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                Fundamental Analysis
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: colors.textMuted,
                  fontFamily: fonts.sans,
                  marginTop: 4,
                  opacity: interpolate(frame, [20, 35], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                P/E, ROE, margins, and health scores — color-coded for instant clarity
              </div>
            </div>

            <div style={{ display: 'flex', gap: 22, flex: 1 }}>
              {/* Main table */}
              <GlassCard delay={15} style={{ flex: 2, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                {/* Table header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr repeat(8, 0.8fr)',
                    padding: '14px 24px',
                    borderBottom: `1px solid ${colors.glassBorder}`,
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Symbol
                  </div>
                  {columns.map((col) => (
                    <div
                      key={col}
                      style={{
                        fontSize: 10,
                        fontFamily: fonts.mono,
                        color: colors.textDim,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        textAlign: 'right',
                      }}
                    >
                      {col}
                    </div>
                  ))}
                </div>

                {/* Table rows */}
                {fundamentals.map((row, i) => {
                  const rowDelay = 30 + i * 14;
                  const rowOpacity = interpolate(frame - rowDelay, [0, 14], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  const rowX = interpolate(frame - rowDelay, [0, 14], [15, 0], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });

                  return (
                    <div
                      key={row.symbol}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr repeat(8, 0.8fr)',
                        padding: '12px 24px',
                        borderBottom: `1px solid rgba(255,255,255,0.03)`,
                        opacity: rowOpacity,
                        transform: `translateX(${rowX}px)`,
                        alignItems: 'center',
                        background: i === 0 ? `linear-gradient(90deg, ${colors.primaryDim}, transparent)` : 'transparent',
                      }}
                    >
                      <div style={{ fontSize: 14, fontFamily: fonts.mono, color: colors.text, fontWeight: 700 }}>
                        {row.symbol}
                      </div>
                      {columns.map((col) => (
                        <div
                          key={col}
                          style={{
                            fontSize: 13,
                            fontFamily: fonts.mono,
                            color: col === 'Mkt Cap' ? colors.textMuted : metricColor(col, getNumVal(row, col)),
                            textAlign: 'right',
                            fontWeight: 500,
                            textShadow: col !== 'Mkt Cap' && col !== 'Div %'
                              ? `0 0 8px ${metricColor(col, getNumVal(row, col))}25`
                              : 'none',
                          }}
                        >
                          {getVal(row, col)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </GlassCard>

              {/* Featured ticker detail */}
              <GlassCard delay={50} style={{ flex: 0.9, display: 'flex', flexDirection: 'column', alignItems: 'center' }} glowColor={colors.primaryDim20}>
                {/* Score badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, alignSelf: 'stretch', marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontFamily: fonts.mono,
                      color: colors.text,
                      fontWeight: 700,
                    }}
                  >
                    {data.featuredTicker}
                  </div>
                  <div style={{ flex: 1 }} />
                  <div
                    style={{
                      padding: '4px 12px',
                      borderRadius: radius.full,
                      background: `linear-gradient(135deg, ${colors.primaryDim20}, ${colors.primaryDim})`,
                      border: `1px solid ${colors.primaryDim40}`,
                      fontSize: 13,
                      fontFamily: fonts.mono,
                      fontWeight: 700,
                      color: colors.primary,
                    }}
                  >
                    Score: 82
                  </div>
                  <div
                    style={{
                      padding: '4px 12px',
                      borderRadius: radius.full,
                      background: `linear-gradient(135deg, ${colors.primaryDim20}, ${colors.primaryDim})`,
                      fontSize: 12,
                      fontFamily: fonts.mono,
                      fontWeight: 600,
                      color: colors.primary,
                    }}
                  >
                    Strong Buy
                  </div>
                </div>

                {/* Mini radar chart */}
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <MiniRadar
                    labels={radarLabels}
                    values={radarScores}
                    size={200}
                    frame={frame}
                    delay={60}
                  />
                </div>

                {/* Key metrics */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  {[
                    { label: 'Free Cash Flow', value: '$110.5B', color: colors.primary },
                    { label: 'Altman Z-Score', value: '8.2', color: colors.primary },
                    { label: 'Piotroski F', value: '8/9', color: colors.primary },
                    { label: 'Current Ratio', value: '1.5', color: colors.amber },
                  ].map((m, i) => {
                    const mDelay = 80 + i * 10;
                    const mOp = interpolate(frame - mDelay, [0, 12], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    });
                    return (
                      <div
                        key={m.label}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '6px 0',
                          borderBottom: `1px solid rgba(255,255,255,0.04)`,
                          opacity: mOp,
                        }}
                      >
                        <span style={{ fontSize: 12, fontFamily: fonts.mono, color: colors.textDim }}>
                          {m.label}
                        </span>
                        <span style={{ fontSize: 12, fontFamily: fonts.mono, color: m.color, fontWeight: 600 }}>
                          {m.value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};

// Compact radar for the detail panel
const MiniRadar: React.FC<{
  labels: string[];
  values: number[];
  size: number;
  frame: number;
  delay: number;
}> = ({ labels, values, size, frame, delay }) => {
  const progress = interpolate(frame - delay, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(frame - delay, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 30;
  const n = labels.length;
  const step = (2 * Math.PI) / n;

  const pts = values.map((v, i) => {
    const angle = step * i - Math.PI / 2;
    const r = maxR * (v / 100) * progress;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  return (
    <svg width={size} height={size} style={{ opacity }}>
      <defs>
        <radialGradient id="miniRadFill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={colors.primary} stopOpacity={0.3} />
          <stop offset="100%" stopColor={colors.primary} stopOpacity={0.05} />
        </radialGradient>
      </defs>
      {/* Rings */}
      {[0.33, 0.66, 1].map((r) => {
        const ring = Array.from({ length: n }, (_, i) => {
          const a = step * i - Math.PI / 2;
          return `${cx + maxR * r * Math.cos(a)},${cy + maxR * r * Math.sin(a)}`;
        }).join(' ');
        return <polygon key={r} points={ring} fill="none" stroke={colors.border} strokeWidth={0.7} opacity={0.5} />;
      })}
      {/* Axes */}
      {labels.map((_, i) => {
        const a = step * i - Math.PI / 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + maxR * Math.cos(a)} y2={cy + maxR * Math.sin(a)} stroke={colors.border} strokeWidth={0.7} opacity={0.4} />;
      })}
      {/* Data */}
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="url(#miniRadFill)" stroke={colors.primary} strokeWidth={1.5} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={colors.primary} />
      ))}
      {/* Labels */}
      {labels.map((label, i) => {
        const a = step * i - Math.PI / 2;
        const lr = maxR + 20;
        return (
          <text key={label} x={cx + lr * Math.cos(a)} y={cy + lr * Math.sin(a)} textAnchor="middle" dominantBaseline="middle" fill={colors.textMuted} fontSize={9} fontFamily={fonts.mono}>
            {label}
          </text>
        );
      })}
    </svg>
  );
};
