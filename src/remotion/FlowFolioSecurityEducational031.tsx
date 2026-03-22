/**
 * FlowFolio v0.3.1 Security Educational Reel (1080x1920, ~43s)
 *
 * Narrated educational video with voiceover + ambient synth music.
 * 6 scenes: Hook → Vault → Testing → Architecture → Local-First → CTA
 */

import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  Img,
  staticFile,
} from 'remotion';
import { Audio } from '@remotion/media';
import { colors, fonts, radius, gradients } from './styles';
import { AudioTrack } from './audio/AudioTrack';
import { buildIntroAudio } from './audio/SynthEngine';
import { VideoRNG, VideoSeedContext } from './lib/uniqueness';

// ─── Constants ──────────────────────────────────────────────

const VO_SEGMENTS = [
  { id: 'hook',         startFrame: 0,    durationInFrames: 360 },
  { id: 'vault',        startFrame: 380,  durationInFrames: 480 },
  { id: 'testing',      startFrame: 880,  durationInFrames: 420 },
  { id: 'architecture', startFrame: 1320, durationInFrames: 380 },
  { id: 'local',        startFrame: 1720, durationInFrames: 440 },
  { id: 'cta',          startFrame: 2180, durationInFrames: 380 },
];

// ─── Background ─────────────────────────────────────────────

const AmbientBg: React.FC = () => {
  const frame = useCurrentFrame();
  const angle = (frame / 800) * Math.PI * 2;
  const ox = 50 + Math.cos(angle) * 8;
  const oy = 45 + Math.sin(angle) * 6;

  return (
    <>
      <AbsoluteFill style={{ background: colors.bg }} />
      <AbsoluteFill style={{ opacity: 0.02 }}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="secEdDot" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
              <circle cx="24" cy="24" r="0.6" fill="#ffffff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#secEdDot)" />
        </svg>
      </AbsoluteFill>
      <div style={{
        position: 'absolute', left: `${ox}%`, top: `${oy}%`,
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,229,153,0.05) 0%, transparent 70%)',
        transform: 'translate(-50%,-50%)', filter: 'blur(80px)',
      }} />
      <div style={{
        position: 'absolute', left: `${100 - ox}%`, top: `${100 - oy}%`,
        width: 350, height: 350, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(129,140,248,0.04) 0%, transparent 70%)',
        transform: 'translate(-50%,-50%)', filter: 'blur(80px)',
      }} />
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.4) 100%)',
      }} />
    </>
  );
};

// ─── SVG Icons ──────────────────────────────────────────────

const PATHS: Record<string, string> = {
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  lock: 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4',
  'alert-tri': 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01',
  check: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8',
  database: 'M12 2C6.48 2 2 4.02 2 6.5v11C2 19.98 6.48 22 12 22s10-2.02 10-4.5v-11C22 4.02 17.52 2 12 2zM2 11.5c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
};

const Icon: React.FC<{ name: string; size?: number; color?: string }> = ({
  name, size = 24, color = colors.text,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke={color} strokeWidth={1.5}
    strokeLinecap="round" strokeLinejoin="round">
    <path d={PATHS[name] || PATHS.shield} />
  </svg>
);

// ─── Glass Card ─────────────────────────────────────────────

const Glass: React.FC<{
  children: React.ReactNode; accent?: string; delay?: number;
}> = ({ children, accent, delay = 0 }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame - delay, [0, 36], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const y = interpolate(frame - delay, [0, 36], [12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  return (
    <div style={{
      opacity: op, transform: `translateY(${y}px)`,
      background: 'rgba(12,12,16,0.7)', backdropFilter: 'blur(16px)',
      border: `1px solid ${accent ? `${accent}20` : 'rgba(255,255,255,0.07)'}`,
      borderRadius: radius['2xl'], padding: '28px 32px',
      boxShadow: '0 4px 32px rgba(0,0,0,0.3)',
    }}>
      {children}
    </div>
  );
};

// ─── Scene: Hook ────────────────────────────────────────────

const HookScene: React.FC = () => {
  const frame = useCurrentFrame();

  const iconOp = interpolate(frame, [5, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const iconScale = interpolate(frame, [5, 45], [0.5, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.5)) });
  const t1Op = interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const t1Y = interpolate(frame, [40, 70], [12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const t2Op = interpolate(frame, [80, 110], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const t2Y = interpolate(frame, [80, 110], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const cardOp = interpolate(frame, [130, 170], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [310, 350], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 64px', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        <div style={{ opacity: iconOp, transform: `scale(${iconScale})` }}>
          <div style={{
            width: 110, height: 110, borderRadius: radius.full,
            background: `${colors.rose}0c`, border: `2px solid ${colors.rose}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="alert-tri" size={48} color={colors.rose} />
          </div>
        </div>

        <div style={{ opacity: t1Op, transform: `translateY(${t1Y}px)`, fontSize: 40, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, textAlign: 'center', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
          Is your portfolio tracker
        </div>
        <div style={{ opacity: t2Op, transform: `translateY(${t2Y}px)`, fontSize: 44, fontWeight: 800, fontFamily: fonts.sans, textAlign: 'center', letterSpacing: '-0.03em', lineHeight: 1.15, background: `linear-gradient(135deg, ${colors.rose}, ${colors.amber})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          selling your data?
        </div>

        <div style={{ opacity: cardOp, marginTop: 16 }}>
          <Glass accent={colors.rose} delay={130}>
            <div style={{ fontSize: 20, color: colors.textMuted, fontFamily: fonts.sans, textAlign: 'center', lineHeight: 1.7 }}>
              Your holdings, trades, and API keys stored on someone else's servers
            </div>
          </Glass>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: Vault ───────────────────────────────────────────

const VaultScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lockSpring = spring({ frame, fps, config: { damping: 18, stiffness: 100, mass: 0.7 } });
  const titleOp = interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [30, 60], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const cardOp = interpolate(frame, [80, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const badge1Op = interpolate(frame, [160, 190], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const badge2Op = interpolate(frame, [200, 230], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const badge3Op = interpolate(frame, [240, 270], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [430, 470], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const badges = [
    { label: 'IOTA Stronghold', op: badge1Op },
    { label: 'Argon2 KDF', op: badge2Op },
    { label: 'Zero Plain Text', op: badge3Op },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 64px', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        <div style={{ transform: `scale(${lockSpring})` }}>
          <div style={{
            width: 110, height: 110, borderRadius: radius.full,
            background: `${colors.primary}0c`, border: `2px solid ${colors.primary}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="lock" size={48} color={colors.primary} />
          </div>
        </div>

        <div style={{ opacity: titleOp, transform: `translateY(${titleY}px)`, fontSize: 42, fontWeight: 800, fontFamily: fonts.sans, textAlign: 'center', letterSpacing: '-0.03em', background: `linear-gradient(135deg, ${colors.text} 30%, ${colors.primary})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Stronghold Vault
        </div>

        <div style={{ opacity: cardOp }}>
          <Glass accent={colors.primary} delay={80}>
            <div style={{ fontSize: 22, color: colors.textSoft, fontFamily: fonts.sans, textAlign: 'center', lineHeight: 1.7 }}>
              Your API keys are now encrypted with military-grade vault technology. Keys never exist in plain text on disk.
            </div>
          </Glass>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          {badges.map((b) => (
            <div key={b.label} style={{
              opacity: b.op, padding: '10px 22px', borderRadius: radius.full,
              background: `${colors.primary}0a`, border: `1px solid ${colors.primary}18`,
              fontSize: 15, fontWeight: 600, color: colors.primary,
              fontFamily: fonts.mono, letterSpacing: '0.03em',
            }}>
              {b.label}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: Testing ─────────────────────────────────────────

const TestingScene: React.FC = () => {
  const frame = useCurrentFrame();

  const iconOp = interpolate(frame, [5, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleOp = interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [30, 60], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(frame, [370, 410], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const platforms = ['Linux', 'macOS', 'Windows'];

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 64px', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        <div style={{ opacity: iconOp }}>
          <div style={{
            width: 110, height: 110, borderRadius: radius.full,
            background: `${colors.accent}0c`, border: `2px solid ${colors.accent}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="activity" size={48} color={colors.accent} />
          </div>
        </div>

        <div style={{ opacity: titleOp, transform: `translateY(${titleY}px)`, fontSize: 42, fontWeight: 800, fontFamily: fonts.sans, textAlign: 'center', letterSpacing: '-0.03em', background: `linear-gradient(135deg, ${colors.text} 30%, ${colors.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Battle-Tested
        </div>

        <Glass accent={colors.accent} delay={60}>
          <div style={{ fontSize: 22, color: colors.textSoft, fontFamily: fonts.sans, textAlign: 'center', lineHeight: 1.7 }}>
            Playwright E2E tests validate every critical flow. Every commit tested across three platforms before release.
          </div>
        </Glass>

        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          {platforms.map((p, i) => {
            const pOp = interpolate(frame, [160 + i * 30, 190 + i * 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <div key={p} style={{
                opacity: pOp, display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: radius.full,
                background: `${colors.accent}0a`, border: `1px solid ${colors.accent}18`,
              }}>
                <Icon name="check" size={16} color={colors.accent} />
                <span style={{ fontSize: 15, fontWeight: 600, color: colors.accent, fontFamily: fonts.mono }}>{p}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: Architecture ────────────────────────────────────

const ArchScene: React.FC = () => {
  const frame = useCurrentFrame();

  const iconOp = interpolate(frame, [5, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleOp = interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [30, 60], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(frame, [330, 370], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const stats = [
    { value: '5', label: 'Bugs Fixed', color: colors.blue },
    { value: '0', label: 'Crashes', color: colors.primary },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 64px', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        <div style={{ opacity: iconOp }}>
          <div style={{
            width: 110, height: 110, borderRadius: radius.full,
            background: `${colors.blue}0c`, border: `2px solid ${colors.blue}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="zap" size={48} color={colors.blue} />
          </div>
        </div>

        <div style={{ opacity: titleOp, transform: `translateY(${titleY}px)`, fontSize: 42, fontWeight: 800, fontFamily: fonts.sans, textAlign: 'center', letterSpacing: '-0.03em', background: `linear-gradient(135deg, ${colors.text} 30%, ${colors.blue})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Zero-Crash Design
        </div>

        <Glass accent={colors.blue} delay={60}>
          <div style={{ fontSize: 22, color: colors.textSoft, fontFamily: fonts.sans, textAlign: 'center', lineHeight: 1.7 }}>
            Dynamic plugin loading ensures the app stays responsive. No missing modules. No unexpected shutdowns.
          </div>
        </Glass>

        <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
          {stats.map((s, i) => {
            const sOp = interpolate(frame, [180 + i * 30, 210 + i * 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <div key={s.label} style={{
                opacity: sOp, textAlign: 'center', padding: '20px 36px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: radius['2xl'],
              }}>
                <div style={{ fontSize: 40, fontWeight: 700, color: s.color, fontFamily: fonts.mono }}>{s.value}</div>
                <div style={{ fontSize: 14, color: colors.textMuted, fontFamily: fonts.sans, marginTop: 4 }}>{s.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: Local-First ─────────────────────────────────────

const LocalScene: React.FC = () => {
  const frame = useCurrentFrame();

  const iconOp = interpolate(frame, [5, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleOp = interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [30, 60], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(frame, [390, 430], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const features = [
    { label: '30+ Quant Metrics', delay: 160 },
    { label: '8 Data Providers', delay: 190 },
    { label: 'AI Portfolio Agent', delay: 220 },
    { label: 'No Cloud Required', delay: 250 },
  ];

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 64px', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        <div style={{ opacity: iconOp }}>
          <div style={{
            width: 110, height: 110, borderRadius: radius.full,
            background: `${colors.cyan}0c`, border: `2px solid ${colors.cyan}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="database" size={48} color={colors.cyan} />
          </div>
        </div>

        <div style={{ opacity: titleOp, transform: `translateY(${titleY}px)`, fontSize: 42, fontWeight: 800, fontFamily: fonts.sans, textAlign: 'center', letterSpacing: '-0.03em', background: `linear-gradient(135deg, ${colors.text} 30%, ${colors.cyan})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          100% Local-First
        </div>

        <Glass accent={colors.cyan} delay={60}>
          <div style={{ fontSize: 22, color: colors.textSoft, fontFamily: fonts.sans, textAlign: 'center', lineHeight: 1.7 }}>
            All Pro features unlocked. Everything runs on your hardware. No accounts. No paywalls.
          </div>
        </Glass>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {features.map((f) => {
            const fOp = interpolate(frame, [f.delay, f.delay + 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const fX = interpolate(frame, [f.delay, f.delay + 30], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
            return (
              <div key={f.label} style={{
                opacity: fOp, transform: `translateX(${fX}px)`,
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 24px', borderRadius: radius.xl,
                background: `${colors.cyan}06`, border: `1px solid ${colors.cyan}15`,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.cyan, boxShadow: `0 0 8px ${colors.cyan}` }} />
                <span style={{ fontSize: 18, fontWeight: 600, color: colors.textSoft, fontFamily: fonts.sans }}>{f.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: CTA ─────────────────────────────────────────────

const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 20, stiffness: 80, mass: 0.8 } });
  const logoOp = interpolate(frame, [0, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ctaOp = interpolate(frame, [60, 96], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ctaY = interpolate(frame, [60, 96], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const linkOp = interpolate(frame, [100, 130], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, opacity: logoOp, transform: `scale(${logoSpring})` }}>
        <Img src={staticFile('logo.png')} style={{ width: 112, height: 112, objectFit: 'contain', filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))' }} />
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: 56, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>Flow</span>
          <span style={{ fontSize: 56, fontWeight: 700, color: colors.primary, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>Folio</span>
        </div>
      </div>

      <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, opacity: ctaOp, transform: `translateY(${ctaY}px)` }}>
        <div style={{
          padding: '16px 52px', borderRadius: radius.lg,
          background: colors.primary, boxShadow: '0 8px 24px rgba(0,229,153,0.2)',
        }}>
          <span style={{ fontSize: 20, fontWeight: 600, color: colors.bg, fontFamily: fonts.sans }}>Locked Down. Powered Up.</span>
        </div>
        <span style={{ fontSize: 14, fontFamily: fonts.mono, color: colors.primary, opacity: linkOp }}>
          Vault-encrypted | 100% offline | Free
        </span>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 32, opacity: linkOp }}>
        {['macOS', 'Windows', 'Linux'].map((p) => (
          <span key={p} style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.textDim }}>{p}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ─── Main Composition ───────────────────────────────────────
// Timeline (60fps):
//   Hook:          0-360    (6s)
//   Vault:         380-860  (8s)
//   Testing:       880-1300 (7s)
//   Architecture: 1320-1700 (6.3s)
//   Local-First:  1720-2160 (7.3s)
//   CTA:          2180-2560 (6.3s)
// Total: ~42.7s (2560 frames)

export const SecurityEducational031: React.FC<{ seed?: number }> = ({ seed }) => {
  const rng = useMemo(() => new VideoRNG(seed), [seed]);
  const audioGen = useMemo(
    () => (dur: number) => buildIntroAudio(dur, seed ?? 42),
    [seed],
  );

  return (
    <VideoSeedContext.Provider value={rng}>
      <AbsoluteFill style={{ backgroundColor: colors.bg, fontFamily: fonts.sans, overflow: 'hidden' }}>
        <AmbientBg />

        {/* ── Voiceover audio ── */}
        {VO_SEGMENTS.map((seg) => (
          <Sequence key={seg.id} from={seg.startFrame} durationInFrames={seg.durationInFrames}>
            <Audio
              src={staticFile(`audio/vo/security031/${seg.id}.wav`)}
              volume={(f) => {
                const fadeIn = interpolate(f, [0, 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                const fadeOut = interpolate(f, [seg.durationInFrames - 8, seg.durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                return 0.9 * Math.min(fadeIn, fadeOut);
              }}
            />
          </Sequence>
        ))}

        {/* ── Ambient synth music (ducked under VO) ── */}
        <AudioTrack generator={audioGen} volume={0.15} fadeInFrames={60} fadeOutFrames={60} />

        {/* ── Visual scenes ── */}
        <Sequence from={0} durationInFrames={370}>
          <HookScene />
        </Sequence>

        <Sequence from={380} durationInFrames={490}>
          <VaultScene />
        </Sequence>

        <Sequence from={880} durationInFrames={430}>
          <TestingScene />
        </Sequence>

        <Sequence from={1320} durationInFrames={390}>
          <ArchScene />
        </Sequence>

        <Sequence from={1720} durationInFrames={450}>
          <LocalScene />
        </Sequence>

        <Sequence from={2180} durationInFrames={380}>
          <CTAScene />
        </Sequence>
      </AbsoluteFill>
    </VideoSeedContext.Provider>
  );
};
