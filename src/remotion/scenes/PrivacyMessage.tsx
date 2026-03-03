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

// ─── SVG Icons ──────────────────────────────────────────────────

/** Padlock — local storage */
const IconLock: React.FC<{ color: string }> = ({ color }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth="1.8" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="16" r="1.5" fill={color} />
  </svg>
);

/** Shield with checkmark — encrypted vault */
const IconShield: React.FC<{ color: string }> = ({ color }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    <polyline points="9,12 11,14 15,10" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Eye with slash — no telemetry */
const IconNoTracking: React.FC<{ color: string }> = ({ color }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke={color} strokeWidth="1.6" opacity="0.4" />
    <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.6" />
    <line x1="4" y1="20" x2="20" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const lines: { words: { text: string; pop?: boolean; effect?: 'scale-pop' | 'glow-pulse' | 'elastic' | 'lift-drop'; popColor?: string }[] }[] = [
  { words: [
    { text: 'Your' }, { text: 'data.', pop: true, effect: 'glow-pulse', popColor: colors.primary },
  ] },
  { words: [
    { text: 'Your' }, { text: 'rules.', pop: true, effect: 'lift-drop', popColor: colors.primary },
  ] },
  { words: [
    { text: 'Zero', pop: true, effect: 'scale-pop', popColor: colors.primary },
    { text: 'cloud.', pop: true, effect: 'elastic', popColor: colors.primary },
  ] },
];

const features: { Icon: React.FC<{ color: string }>; iconColor: string; label: string; desc: string }[] = [
  { Icon: IconLock, iconColor: colors.primary, label: 'Local SQLite storage', desc: 'Everything stays on your machine' },
  { Icon: IconShield, iconColor: colors.cyan, label: 'Encrypted vault', desc: 'API keys in Tauri Stronghold' },
  { Icon: IconNoTracking, iconColor: colors.rose, label: 'No telemetry', desc: 'Zero data leaves your device' },
];

export const PrivacyMessage: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneTransition durationInFrames={260}>
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Main text stack */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}
        >
          {lines.map((line, i) => {
            const start = 20 + i * 44;
            const op = interpolate(frame, [start, start + 18], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
            });
            const y = interpolate(frame, [start, start + 18], [12, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
            });
            const isLast = i === lines.length - 1;

            return (
              <div
                key={i}
                style={{
                  fontSize: 52,
                  fontWeight: 700,
                  color: isLast ? colors.primary : colors.text,
                  fontFamily: fonts.sans,
                  opacity: op,
                  transform: `translateY(${y}px)`,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.2,
                  display: 'flex',
                  gap: 14,
                }}
              >
                {line.words.map((w, wi) =>
                  w.pop ? (
                    <PopWord key={wi} delay={start + 10 + wi * 8} effect={w.effect ?? 'scale-pop'} color={w.popColor ?? colors.primary}>
                      {w.text}
                    </PopWord>
                  ) : (
                    <span key={wi}>{w.text}</span>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Feature cards */}
        <div
          style={{
            display: 'flex',
            gap: 20,
            marginTop: 60,
          }}
        >
          {features.map((f, i) => {
            const start = 160 + i * 36;
            const op = interpolate(frame, [start, start + 16], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
            });
            const y = interpolate(frame, [start, start + 16], [8, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
            });

            return (
              <div
                key={f.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 18px',
                  borderRadius: radius.xl,
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${colors.glassBorder}`,
                  opacity: op,
                  transform: `translateY(${y}px)`,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radius.lg,
                    background: `${f.iconColor}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <f.Icon color={f.iconColor} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontFamily: fonts.sans,
                      color: colors.textSoft,
                      fontWeight: 600,
                    }}
                  >
                    {f.label}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: fonts.mono,
                      color: colors.textDim,
                    }}
                  >
                    {f.desc}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </SceneTransition>
  );
};
