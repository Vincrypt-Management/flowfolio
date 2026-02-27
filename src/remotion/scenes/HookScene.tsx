import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { colors, fonts, radius } from '../styles';
import { SceneTransition } from '../components/SceneTransition';
import type { HookVariant, PainPoint } from '../lib/contentPools';

// ─── SVG Icons ──────────────────────────────────────────────────

/** Scattered grid — represents disorganized spreadsheets */
const IconScattered: React.FC<{ color: string; size?: number }> = ({ color, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Main grid fragment */}
    <rect x="2" y="3" width="8" height="6" rx="1.5" stroke={color} strokeWidth="1.6" opacity="0.9" />
    <line x1="6" y1="3" x2="6" y2="9" stroke={color} strokeWidth="1.2" opacity="0.5" />
    <line x1="2" y1="6" x2="10" y2="6" stroke={color} strokeWidth="1.2" opacity="0.5" />
    {/* Scattered fragment — rotated, offset */}
    <rect x="13" y="1" width="7" height="5" rx="1" stroke={color} strokeWidth="1.4" opacity="0.5" transform="rotate(8 16.5 3.5)" />
    {/* Another fragment — lower, tilted other way */}
    <rect x="5" y="14" width="8" height="5" rx="1" stroke={color} strokeWidth="1.4" opacity="0.6" transform="rotate(-5 9 16.5)" />
    <line x1="9" y1="14" x2="9" y2="19" stroke={color} strokeWidth="1" opacity="0.3" transform="rotate(-5 9 16.5)" />
    {/* Loose cell — floating */}
    <rect x="17" y="11" width="5" height="5" rx="1" stroke={color} strokeWidth="1.2" opacity="0.35" transform="rotate(12 19.5 13.5)" />
    {/* Scatter dots to suggest mess */}
    <circle cx="15" cy="20" r="0.8" fill={color} opacity="0.3" />
    <circle cx="20" cy="8" r="0.8" fill={color} opacity="0.25" />
  </svg>
);

/** Cloud with warning — privacy concerns */
const IconCloudLock: React.FC<{ color: string; size?: number }> = ({ color, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Cloud shape */}
    <path
      d="M6.5 18C4 18 2 16.2 2 14c0-1.9 1.4-3.5 3.2-3.9C5.8 7.2 8.1 5 11 5c3.3 0 6 2.5 6.3 5.6C19.4 11 21 12.8 21 15c0 2.2-1.8 3-3.5 3"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      opacity="0.7"
    />
    {/* Lock body */}
    <rect x="9" y="13" width="6" height="5" rx="1.2" stroke={color} strokeWidth="1.5" />
    {/* Lock shackle */}
    <path d="M10.5 13V11.5a1.5 1.5 0 013 0V13" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    {/* Keyhole */}
    <circle cx="12" cy="15.8" r="0.8" fill={color} />
  </svg>
);

/** Chart with question mark — guessing */
const IconGuessing: React.FC<{ color: string; size?: number }> = ({ color, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* Chart bars */}
    <rect x="3" y="14" width="3" height="7" rx="0.8" fill={color} opacity="0.25" />
    <rect x="8" y="10" width="3" height="11" rx="0.8" fill={color} opacity="0.35" />
    <rect x="13" y="12" width="3" height="9" rx="0.8" fill={color} opacity="0.25" />
    <rect x="18" y="8" width="3" height="13" rx="0.8" fill={color} opacity="0.3" />
    {/* Question mark overlay */}
    <path
      d="M10 4.5C10 3.1 11.1 2 12.5 2S15 3.1 15 4.5c0 1-0.6 1.5-1.3 2-.5.3-.7.6-.7 1"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      opacity="0.9"
    />
    <circle cx="13" cy="9.5" r="0.8" fill={color} opacity="0.9" />
  </svg>
);

// ─── Pain Point Data ────────────────────────────────────────────

const defaultPainPoints = [
  {
    label: 'Scattered spreadsheets',
    desc: 'Data in ten places, insights in none',
    Icon: IconScattered,
    color: colors.rose,
    glowColor: colors.roseDim,
  },
  {
    label: 'Cloud privacy fears',
    desc: 'Your portfolio data on someone else\'s server',
    Icon: IconCloudLock,
    color: colors.amber,
    glowColor: colors.amberDim,
  },
  {
    label: 'Guessing without data',
    desc: 'Gut feelings where analysis should be',
    Icon: IconGuessing,
    color: colors.accent,
    glowColor: colors.accentDim,
  },
];

const colorMap = {
  rose: { color: colors.rose, glow: colors.roseDim },
  amber: { color: colors.amber, glow: colors.amberDim },
  accent: { color: colors.accent, glow: colors.accentDim },
} as const;

const iconOptions = [IconScattered, IconCloudLock, IconGuessing];

function buildPainPointCards(painPointsData?: PainPoint[]) {
  if (!painPointsData) return defaultPainPoints;
  return painPointsData.map((pp, i) => ({
    label: pp.label,
    desc: pp.desc,
    Icon: iconOptions[i % iconOptions.length],
    color: colorMap[pp.colorKey].color,
    glowColor: colorMap[pp.colorKey].glow,
  }));
}

// ─── Component ──────────────────────────────────────────────────

interface HookSceneProps {
  durationInFrames?: number;
  compact?: boolean;
  /** Dynamic hook lines — if not provided, uses default */
  hookVariant?: HookVariant;
  /** Dynamic pain points — if not provided, uses default */
  painPointsData?: PainPoint[];
}

/**
 * Opening "problem" scene — sets up the conflict that FlowFolio resolves.
 * Full mode: hook text + 3 pain point cards with SVG icons and connecting flow line.
 * Compact mode: hook text only.
 */
export const HookScene: React.FC<HookSceneProps> = ({
  durationInFrames = 150,
  compact = false,
  hookVariant,
  painPointsData,
}) => {
  const frame = useCurrentFrame();
  const line1Text = hookVariant?.line1 ?? 'You have a strategy.';
  const line2Text = hookVariant?.line2 ?? "Your tools don't.";
  const painPoints = buildPainPointCards(painPointsData);

  // Main hook line
  const hookOp = interpolate(frame, [8, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const hookY = interpolate(frame, [8, 28], [16, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Second line reveal
  const line2Op = interpolate(frame, [30, 48], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const line2Y = interpolate(frame, [30, 48], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Connecting flow line (grows downward as cards appear)
  const flowLineHeight = !compact
    ? interpolate(frame, [56, 110], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  return (
    <SceneTransition
      durationInFrames={durationInFrames}
      fadeInDuration={12}
      fadeOutDuration={18}
    >
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: compact ? 12 : 16,
            maxWidth: 1100,
            padding: '0 60px',
          }}
        >
          {/* ─── Hook Text ─── */}
          <div
            style={{
              fontSize: compact ? 46 : 56,
              fontWeight: 700,
              color: colors.text,
              fontFamily: fonts.sans,
              letterSpacing: '-0.04em',
              textAlign: 'center',
              lineHeight: 1.15,
              opacity: hookOp,
              transform: `translateY(${hookY}px)`,
            }}
          >
            {line1Text}
          </div>

          <div
            style={{
              fontSize: compact ? 46 : 56,
              fontWeight: 700,
              color: colors.textMuted,
              fontFamily: fonts.sans,
              letterSpacing: '-0.04em',
              textAlign: 'center',
              lineHeight: 1.15,
              opacity: line2Op,
              transform: `translateY(${line2Y}px)`,
            }}
          >
            {line2Text}
          </div>

          {/* ─── Pain Point Cards with Flow Line ─── */}
          {!compact && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0,
                marginTop: 40,
                position: 'relative',
              }}
            >
              {/* Vertical flow line — animated gradient glow */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  width: 2,
                  height: `${flowLineHeight * 100}%`,
                  background: `linear-gradient(180deg, ${colors.rose}60 0%, ${colors.amber}60 50%, ${colors.accent}60 100%)`,
                  transform: 'translateX(-1px)',
                  zIndex: 0,
                  boxShadow: `0 0 12px ${colors.rose}30, 0 0 24px ${colors.accent}20`,
                  borderRadius: 2,
                }}
              />

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {painPoints.map((point, i) => {
                  const start = 56 + i * 18;
                  const cardOp = interpolate(frame, [start, start + 18], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  const cardX = interpolate(frame, [start, start + 18], [-20, 0], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  const cardScale = interpolate(frame, [start, start + 14], [0.96, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });

                  // Flow dot — pulsing glow
                  const dotOp = interpolate(frame, [start - 4, start + 6], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  const dotPulse = dotOp > 0
                    ? interpolate(Math.sin((frame - start) / 10 * Math.PI * 2), [-1, 1], [0.6, 1],
                        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
                    : 0;

                  return (
                    <div
                      key={point.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        opacity: cardOp,
                      }}
                    >
                      {/* Flow indicator dot — pulsing */}
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: point.color,
                          boxShadow: `0 0 ${10 + dotPulse * 8}px ${point.color}, 0 0 ${20 + dotPulse * 12}px ${point.glowColor}`,
                          opacity: dotOp,
                          flexShrink: 0,
                          transform: `scale(${0.8 + dotPulse * 0.2})`,
                        }}
                      />

                      {/* Glass card */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 16,
                          padding: '14px 22px',
                          borderRadius: radius.xl,
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: `1px solid rgba(255, 255, 255, 0.08)`,
                          borderLeft: `2px solid ${point.color}`,
                          backdropFilter: 'blur(8px)',
                          transform: `translateX(${cardX}px) scale(${cardScale})`,
                          minWidth: 380,
                          boxShadow: `0 4px 24px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.04)`,
                        }}
                      >
                        {/* Icon container */}
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: radius.lg,
                            background: point.glowColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <point.Icon color={point.color} size={24} />
                        </div>

                        {/* Text */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span
                            style={{
                              fontSize: 15,
                              fontWeight: 600,
                              color: colors.text,
                              fontFamily: fonts.sans,
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {point.label}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: colors.textDim,
                              fontFamily: fonts.mono,
                              letterSpacing: '0.01em',
                            }}
                          >
                            {point.desc}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};
