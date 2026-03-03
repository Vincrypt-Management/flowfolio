import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from 'remotion';
import { colors, fonts, radius } from '../styles';
import { SceneTransition } from '../components/SceneTransition';
import { PopWord } from '../components/PopWord';

const platforms = [
  {
    name: 'macOS',
    icon: (
      <svg width={32} height={32} viewBox="0 0 48 48" fill="none">
        <path
          d="M36 34c-1.2 2-2.5 3.8-4.3 3.8-1.9 0-2.5-1.1-4.7-1.1-2.2 0-2.9 1.1-4.7 1.1-1.8 0-3.2-2-4.4-3.9-2.5-3.8-2.8-8.3-1.2-10.7 1.1-1.7 2.9-2.7 4.6-2.7 1.9 0 3 1.1 4.6 1.1 1.5 0 2.4-1.1 4.6-1.1 1.5 0 3.1.8 4.2 2.2-3.7 2-3.1 7.3.3 9.2zM28.8 17.5c.9-1.2 1.6-2.8 1.4-4.5-1.5.1-3.2 1-4.2 2.2-.9 1.1-1.7 2.7-1.4 4.3 1.6.1 3.3-.9 4.2-2z"
          fill={colors.textDim}
        />
      </svg>
    ),
  },
  {
    name: 'Windows',
    icon: (
      <svg width={32} height={32} viewBox="0 0 48 48" fill="none">
        <path d="M10 12.6L22 10.8V23.2H10V12.6Z" fill={colors.textDim} />
        <path d="M24 10.5L38 8V23.2H24V10.5Z" fill={colors.textDim} />
        <path d="M10 25H22V37.4L10 35.6V25Z" fill={colors.textDim} />
        <path d="M24 25H38V40L24 37.7V25Z" fill={colors.textDim} />
      </svg>
    ),
  },
  {
    name: 'Linux',
    icon: (
      <svg width={32} height={32} viewBox="0 0 48 48" fill="none">
        <path
          d="M24 8c-5 0-8 4-8 10 0 4 1 7 2.5 10l-4 5c-1 1.2-.5 3 1 3.5l6 2c.5.3 1.2.5 2 .5h1c.8 0 1.5-.2 2-.5l6-2c1.5-.5 2-2.3 1-3.5l-4-5C30 31 31 28 31 24c0-6-3-10-7-16h0z"
          fill="none"
          stroke={colors.textDim}
          strokeWidth={2}
        />
        <circle cx={21} cy={20} r={1.5} fill={colors.textDim} />
        <circle cx={27} cy={20} r={1.5} fill={colors.textDim} />
      </svg>
    ),
  },
];

export const Platforms: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOp = interpolate(frame, [10, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });
  const titleY = interpolate(frame, [10, 50], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });

  return (
    <SceneTransition durationInFrames={260}>
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Title */}
        <div
          style={{
            opacity: titleOp,
            transform: `translateY(${titleY}px)`,
            marginBottom: 52,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: colors.text,
              fontFamily: fonts.sans,
              letterSpacing: '-0.03em',
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
            }}
          >
            <span>Available</span>
            <PopWord delay={36} effect="scale-pop" color={colors.primary}>
              everywhere
            </PopWord>
          </div>
        </div>

        {/* Platform icons — simple row */}
        <div style={{ display: 'flex', gap: 64, alignItems: 'center' }}>
          {platforms.map((p, i) => {
            const start = 60 + i * 36;
            const op = interpolate(frame, [start, start + 16], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
            });

            return (
              <div
                key={p.name}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  opacity: op,
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: radius.xl,
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${colors.glassBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {p.icon}
                </div>
                <span
                  style={{
                    fontSize: 13,
                    color: colors.textDim,
                    fontFamily: fonts.mono,
                    fontWeight: 400,
                  }}
                >
                  {p.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Features list */}
        <div
          style={{
            display: 'flex',
            gap: 40,
            marginTop: 56,
            opacity: interpolate(frame, [150, 180], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          {['Free & open source', 'Native performance', 'Auto-updates'].map((txt, i) => (
            <div
              key={txt}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                opacity: interpolate(frame, [75 + i * 14, 90 + i * 14], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                easing: Easing.out(Easing.cubic),
                }),
              }}
            >
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: colors.primary }} />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: colors.textMuted,
                  fontFamily: fonts.mono,
                }}
              >
                {txt}
              </span>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};
