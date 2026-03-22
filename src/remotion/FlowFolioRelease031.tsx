import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';
import { colors, fonts, radius } from './styles';
import { VideoRNG, VideoSeedContext } from './lib/uniqueness';

interface ReleaseReelProps {
  seed?: number;
}

// ─── Constants ───────────────────────────────────────────
const FEATURES_BATCH1 = [
  {
    label: 'Stronghold Vault',
    desc: 'Encrypted key storage with Argon2 KDF',
    icon: '🔐',
    color: colors.primary,
  },
  {
    label: 'E2E Test Suite',
    desc: 'Playwright smoke tests with Tauri mock fixtures',
    icon: '🧪',
    color: colors.accent,
  },
  {
    label: 'Dynamic Plugins',
    desc: 'Web-safe Tauri imports — zero crash in browser mode',
    icon: '⚡',
    color: colors.blue,
  },
  {
    label: 'Local-First Pro',
    desc: 'All features unlocked — no cloud, no paywall',
    icon: '🏠',
    color: colors.amber,
  },
];

const FEATURES_BATCH2 = [
  {
    label: 'Mobile Pipeline',
    desc: 'iOS & Android build verification scripts',
    icon: '📱',
    color: colors.cyan,
  },
  {
    label: 'AI Streaming',
    desc: 'OpenRouter SSE streaming for portfolio agent',
    icon: '🤖',
    color: colors.rose,
  },
  {
    label: 'Integration Fixes',
    desc: 'DividendTracker, SQL ops, ExposureChart CSS',
    icon: '🔧',
    color: colors.primaryBright,
  },
  {
    label: 'Product Audit',
    desc: '24 gaps identified, roadmap to production-ready',
    icon: '📋',
    color: colors.accentBright,
  },
];

const STATS = [
  { value: '6', label: 'New Vault Commands' },
  { value: '5', label: 'Bugs Squashed' },
  { value: '24', label: 'Gaps Mapped' },
  { value: '100%', label: 'Local-First' },
];

// ─── Background ──────────────────────────────────────────
const IGBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const angle = (frame / 800) * Math.PI * 2;
  const x = 50 + Math.cos(angle) * 8;
  const y = 45 + Math.sin(angle) * 6;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: colors.bg }} />
      <AbsoluteFill style={{ opacity: 0.025 }}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="rel031Dot" x="0" y="0" width="44" height="44" patternUnits="userSpaceOnUse">
              <circle cx="22" cy="22" r="0.5" fill="#ffffff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#rel031Dot)" />
        </svg>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0, 229, 153, 0.06) 0%, transparent 70%)',
          transform: 'translate(-50%,-50%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${100 - x}%`,
          top: `${100 - y}%`,
          width: 350,
          height: 350,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(129, 140, 248, 0.04) 0%, transparent 70%)',
          transform: 'translate(-50%,-50%)',
          filter: 'blur(80px)',
        }}
      />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

// ─── Scene: Hook ─────────────────────────────────────────
const HookScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Shield icon animation
  const shieldOp = interpolate(frame, [5, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const shieldScale = interpolate(frame, [5, 40], [0.5, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(2)) });
  const line1Op = interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const line1Y = interpolate(frame, [40, 70], [12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const line2Op = interpolate(frame, [70, 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const line2Y = interpolate(frame, [70, 100], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const line3Op = interpolate(frame, [100, 130], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const line3Y = interpolate(frame, [100, 130], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(frame, [230, 270], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '0 48px' }}>
        <div style={{ fontSize: 80, opacity: shieldOp, transform: `scale(${shieldScale})` }}>
          🔐
        </div>
        <div style={{ fontSize: 38, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, letterSpacing: '-0.04em', textAlign: 'center', lineHeight: 1.15, opacity: line1Op, transform: `translateY(${line1Y}px)` }}>
          Your keys are now
        </div>
        <div style={{ fontSize: 44, fontWeight: 800, fontFamily: fonts.sans, letterSpacing: '-0.04em', textAlign: 'center', lineHeight: 1.15, opacity: line2Op, transform: `translateY(${line2Y}px)`, background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          vault-encrypted
        </div>
        <div style={{ fontSize: 18, fontWeight: 500, color: colors.textMuted, fontFamily: fonts.mono, textAlign: 'center', opacity: line3Op, transform: `translateY(${line3Y}px)` }}>
          v0.3.1 — the security &amp; stability update
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: Logo + Version ───────────────────────────────
const LogoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 20, stiffness: 80, mass: 0.8 } });
  const logoScale = interpolate(logoSpring, [0, 1], [0.8, 1]);
  const logoOp = interpolate(frame, [0, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const wordOp = interpolate(frame, [50, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const wordY = interpolate(frame, [50, 90], [8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const tagOp = interpolate(frame, [100, 136], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const badgeOp = interpolate(frame, [130, 160], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const badgeY = interpolate(frame, [130, 160], [8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(frame, [230, 270], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <div style={{ transform: `scale(${logoScale})`, opacity: logoOp }}>
          <Img src={staticFile('logo.png')} style={{ width: 140, height: 140, objectFit: 'contain', filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))' }} />
        </div>
        <div style={{ opacity: wordOp, transform: `translateY(${wordY}px)`, display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: 72, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>Flow</span>
          <span style={{ fontSize: 72, fontWeight: 700, color: colors.primary, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>Folio</span>
        </div>
        <span style={{ fontSize: 18, color: colors.textMuted, fontFamily: fonts.mono, opacity: tagOp, letterSpacing: '0.02em' }}>
          AI-powered vibe-based investing
        </span>
        <div style={{ opacity: badgeOp, transform: `translateY(${badgeY}px)`, padding: '10px 28px', borderRadius: radius.xl, background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: colors.bg, fontFamily: fonts.mono }}>v0.3.1</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: Feature Cards (scrolling list) ───────────────
const FeatureListScene: React.FC<{ features: typeof FEATURES_BATCH1; batch: number }> = ({ features, batch }) => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [340, 380], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: colors.primary, fontFamily: fonts.mono, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 28, opacity: interpolate(frame, [10, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        {batch === 0 ? 'New in v0.3.1' : 'And more...'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 700, position: 'relative', zIndex: 1 }}>
        <div style={{
          position: 'absolute',
          left: 19,
          top: 0,
          width: 2,
          height: `${interpolate(frame, [30, 250], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })}%`,
          background: `linear-gradient(180deg, ${features[0]?.color ?? colors.primary}60, ${features[features.length - 1]?.color ?? colors.accent}60)`,
          borderRadius: 1,
        }} />

        {features.map((f, i) => {
          const start = 40 + i * 50;
          const op = interpolate(frame, [start, start + 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
          const x = interpolate(frame, [start, start + 30], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
          const dotOp = interpolate(frame, [start - 5, start + 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

          return (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: op }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: f.color, boxShadow: `0 0 10px ${f.color}`, opacity: dotOp, flexShrink: 0 }} />
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: radius.xl,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderLeft: `2px solid ${f.color}`, transform: `translateX(${x}px)`, flex: 1,
                boxShadow: '0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}>
                <div style={{ width: 44, height: 44, borderRadius: radius.lg, background: `${f.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>
                  {f.icon}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: colors.text, fontFamily: fonts.sans }}>{f.label}</div>
                  <div style={{ fontSize: 13, color: colors.textMuted, fontFamily: fonts.mono, letterSpacing: '0.01em' }}>{f.desc}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: Stats ────────────────────────────────────────
const StatsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [250, 290], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: colors.accent, fontFamily: fonts.mono, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 36, opacity: interpolate(frame, [10, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        By the numbers
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, width: 600 }}>
        {STATS.map((s, i) => {
          const start = 30 + i * 30;
          const op = interpolate(frame, [start, start + 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
          const scale = interpolate(frame, [start, start + 30], [0.9, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

          return (
            <div key={s.label} style={{
              opacity: op, transform: `scale(${scale})`, background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: radius['2xl'],
              padding: '32px 24px', textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: 48, fontWeight: 700, color: i % 2 === 0 ? colors.primary : colors.accent, fontFamily: fonts.mono, marginBottom: 8 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 15, color: colors.textMuted, fontFamily: fonts.sans }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene: CTA ──────────────────────────────────────────
const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 20, stiffness: 80, mass: 0.8 } });
  const logoOp = interpolate(frame, [0, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const ctaOp = interpolate(frame, [60, 96], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const ctaY = interpolate(frame, [60, 96], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const linkOp = interpolate(frame, [90, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const platOp = interpolate(frame, [110, 144], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

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
        <div style={{ padding: '16px 52px', borderRadius: radius.lg, background: colors.primary, boxShadow: '0 8px 24px rgba(0, 229, 153, 0.2)' }}>
          <span style={{ fontSize: 20, fontWeight: 600, color: colors.bg, fontFamily: fonts.sans }}>Locked down. Powered up.</span>
        </div>
        <span style={{ fontSize: 14, fontFamily: fonts.mono, color: colors.primary, opacity: linkOp }}>Privacy-first · Vault-encrypted · Free</span>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 32, opacity: platOp }}>
        {['macOS', 'Windows', 'Linux'].map((p) => (
          <span key={p} style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.textDim }}>{p}</span>
        ))}
      </div>

      <span style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.mono, marginTop: 16, opacity: linkOp }}>
        github.com/vincrypt/flowfolio
      </span>
    </AbsoluteFill>
  );
};

// ─── Main Composition ────────────────────────────────────
// Timeline (60fps):
//   Hook:     0-300    (5s)
//   Logo:     280-580  (5s)
//   Batch 1:  560-960  (6.7s) — 4 features
//   Batch 2:  940-1340 (6.7s) — 4 features
//   Stats:    1320-1620 (5s)
//   CTA:      1600-1960 (6s)
// Total: ~32.7s

export const FlowFolioRelease031: React.FC<ReleaseReelProps> = ({ seed }) => {
  const rng = useMemo(() => new VideoRNG(seed), [seed]);

  return (
    <VideoSeedContext.Provider value={rng}>
      <AbsoluteFill style={{ backgroundColor: colors.bg, fontFamily: fonts.sans, overflow: 'hidden' }}>
        <IGBackground />

        {/* Hook — vault-encrypted (0-5s) */}
        <Sequence from={0} durationInFrames={300}>
          <HookScene />
        </Sequence>

        {/* Logo + version badge (4.7s-9.7s) */}
        <Sequence from={280} durationInFrames={300}>
          <LogoScene />
        </Sequence>

        {/* Features batch 1: Vault, E2E, Plugins, Pro Mode (9.3s-16s) */}
        <Sequence from={560} durationInFrames={400}>
          <FeatureListScene features={FEATURES_BATCH1} batch={0} />
        </Sequence>

        {/* Features batch 2: Mobile, AI, Fixes, Audit (15.7s-22.3s) */}
        <Sequence from={940} durationInFrames={400}>
          <FeatureListScene features={FEATURES_BATCH2} batch={1} />
        </Sequence>

        {/* Stats (22s-27s) */}
        <Sequence from={1320} durationInFrames={300}>
          <StatsScene />
        </Sequence>

        {/* CTA (26.7s-32.7s) */}
        <Sequence from={1600} durationInFrames={360}>
          <CTAScene />
        </Sequence>
      </AbsoluteFill>
    </VideoSeedContext.Provider>
  );
};
