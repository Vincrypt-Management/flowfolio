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
import { hookVariants, pickIGFeatures, taglineVariants } from './lib/contentPools';

interface IGProps {
  seed?: number;
}

/**
 * Instagram Reel — 1080x1920 (9:16), 18s, 30fps
 * Story-driven: Hook (pain) → Logo → Story-framed features → CTA
 * Now seed-driven for unique content per render.
 */

// ─── Scene 1: Hook — Problem Statement ──────────────────────────
const IGHook: React.FC<{ line1: string; line2: string }> = ({ line1, line2 }) => {
  const frame = useCurrentFrame();

  const line1Op = interpolate(frame, [16, 52], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const line1Y = interpolate(frame, [16, 52], [14, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const line2Op = interpolate(frame, [56, 88], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const line2Y = interpolate(frame, [56, 88], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const fadeOut = interpolate(frame, [200, 236], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '0 48px' }}>
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: colors.text,
            fontFamily: fonts.sans,
            letterSpacing: '-0.04em',
            textAlign: 'center',
            lineHeight: 1.15,
            opacity: line1Op,
            transform: `translateY(${line1Y}px)`,
          }}
        >
          {line1}
        </div>
        <div
          style={{
            fontSize: 44,
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
          {line2}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 2: Logo Reveal ────────────────────────────────────────
const IGLogo: React.FC<{ tagline: string }> = ({ tagline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 0.8 },
  });
  const logoScale = interpolate(logoSpring, [0, 1], [0.8, 1]);
  const logoOp = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const wordOp = interpolate(frame, [50, 90], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const wordY = interpolate(frame, [50, 90], [8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const tagOp = interpolate(frame, [100, 136], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const fadeOut = interpolate(frame, [200, 236], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        <div style={{ transform: `scale(${logoScale})`, opacity: logoOp }}>
          <Img
            src={staticFile('logo.png')}
            style={{
              width: 140,
              height: 140,
              objectFit: 'contain',
              filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))',
            }}
          />
        </div>

        <div
          style={{
            opacity: wordOp,
            transform: `translateY(${wordY}px)`,
            display: 'flex',
            alignItems: 'baseline',
          }}
        >
          <span style={{ fontSize: 72, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>
            Flow
          </span>
          <span style={{ fontSize: 72, fontWeight: 700, color: colors.primary, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>
            Folio
          </span>
        </div>

        <span
          style={{
            fontSize: 18,
            color: colors.textMuted,
            fontFamily: fonts.mono,
            opacity: tagOp,
            letterSpacing: '0.02em',
          }}
        >
          {tagline}
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ─── SVG Icons for IG Features ──────────────────────────────────

/** Sliders icon — represents Vibe Studio strategy creation */
const IGIconSliders: React.FC<{ color: string }> = ({ color }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <line x1="4" y1="6" x2="20" y2="6" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
    <line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
    <line x1="4" y1="18" x2="20" y2="18" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
    <circle cx="8" cy="6" r="2.5" fill={color} />
    <circle cx="15" cy="12" r="2.5" fill={color} />
    <circle cx="10" cy="18" r="2.5" fill={color} />
  </svg>
);

/** Chart lines icon — represents Backtest */
const IGIconBacktest: React.FC<{ color: string }> = ({ color }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <polyline points="3,18 8,13 12,15 17,8 21,5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="3,20 9,16 13,18 18,12 21,10" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" strokeDasharray="3 3" />
    <circle cx="17" cy="8" r="2" fill={color} opacity="0.8" />
  </svg>
);

/** Sparkle/brain icon — represents AI Agent */
const IGIconAI: React.FC<{ color: string }> = ({ color }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <path d="M12 2L13.5 8.5L20 7L14.5 11L18 17L12 13.5L6 17L9.5 11L4 7L10.5 8.5L12 2Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.15" />
    <circle cx="12" cy="11" r="2" fill={color} opacity="0.7" />
  </svg>
);

const defaultStoryFeatures = [
  { beat: 'Define your edge', label: 'Vibe Studio', color: colors.primary, Icon: IGIconSliders },
  { beat: 'Prove it works', label: 'Backtest Engine', color: colors.cyan, Icon: IGIconBacktest },
  { beat: 'Let AI help', label: 'Portfolio Agent', color: colors.amber, Icon: IGIconAI },
];

const igColorMap = { primary: colors.primary, cyan: colors.cyan, amber: colors.amber } as const;
const igIcons = [IGIconSliders, IGIconBacktest, IGIconAI];

interface IGFeaturesProps {
  features?: Array<{ beat: string; label: string; color: string; Icon: React.FC<{ color: string }> }>;
}

const IGFeatures: React.FC<IGFeaturesProps> = ({ features }) => {
  const storyFeatures = features ?? defaultStoryFeatures;
  const frame = useCurrentFrame();

  const titleOp = interpolate(frame, [10, 44], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const fadeOut = interpolate(frame, [270, 304], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // Flow line grows as cards appear
  const flowProgress = interpolate(frame, [32, 200], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: colors.text,
          fontFamily: fonts.sans,
          letterSpacing: '-0.03em',
          opacity: titleOp,
          marginBottom: 44,
          textAlign: 'center',
        }}
      >
        Your investing journey
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, position: 'relative' }}>
        {/* Vertical flow line */}
        <div
          style={{
            position: 'absolute',
            left: 19,
            top: 0,
            width: 2,
            height: `${flowProgress * 100}%`,
            background: `linear-gradient(180deg, ${colors.primary}60, ${colors.cyan}60, ${colors.amber}60)`,
            borderRadius: 1,
            zIndex: 0,
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 640, position: 'relative', zIndex: 1 }}>
          {storyFeatures.map((f, i) => {
            const start = 36 + i * 40;
            const op = interpolate(frame, [start, start + 16], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.out(Easing.cubic),
            });
            const x = interpolate(frame, [start, start + 16], [16, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.out(Easing.cubic),
            });
            const dotOp = interpolate(frame, [start - 2, start + 8], [0, 1], {
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
                  gap: 14,
                  opacity: op,
                }}
              >
                {/* Flow dot */}
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: f.color,
                    boxShadow: `0 0 10px ${f.color}`,
                    opacity: dotOp,
                    flexShrink: 0,
                  }}
                />

                {/* Card */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '16px 20px',
                    borderRadius: radius.xl,
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid rgba(255,255,255,0.08)`,
                    borderLeft: `2px solid ${f.color}`,
                    transform: `translateX(${x}px)`,
                    flex: 1,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: radius.lg,
                      background: `${f.color}18`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <f.Icon color={f.color} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 13, color: colors.textMuted, fontFamily: fonts.mono, letterSpacing: '0.02em' }}>
                      {f.beat}
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 600, color: colors.text, fontFamily: fonts.sans }}>
                      {f.label}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 4: CTA ───────────────────────────────────────────────
const IGCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 0.8 },
  });
  const logoOp = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const ctaOp = interpolate(frame, [60, 96], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const ctaY = interpolate(frame, [60, 96], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const linkOp = interpolate(frame, [90, 120], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const platforms = ['macOS', 'Windows', 'Linux'];
  const platOp = interpolate(frame, [110, 144], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          opacity: logoOp,
          transform: `scale(${logoSpring})`,
        }}
      >
        <Img
          src={staticFile('logo.png')}
          style={{
            width: 112,
            height: 112,
            objectFit: 'contain',
            filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.4))',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: 56, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>
            Flow
          </span>
          <span style={{ fontSize: 56, fontWeight: 700, color: colors.primary, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>
            Folio
          </span>
        </div>
      </div>

      {/* CTA */}
      <div
        style={{
          marginTop: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          opacity: ctaOp,
          transform: `translateY(${ctaY}px)`,
        }}
      >
        <div
          style={{
            padding: '16px 52px',
            borderRadius: radius.lg,
            background: colors.primary,
            boxShadow: '0 8px 24px rgba(0, 229, 153, 0.2)',
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 600, color: colors.bg, fontFamily: fonts.sans }}>
            Start Your Story
          </span>
        </div>

        <span style={{ fontSize: 14, fontFamily: fonts.mono, color: colors.primary, opacity: linkOp }}>
          Free & open source
        </span>
      </div>

      {/* Platforms */}
      <div style={{ display: 'flex', gap: 20, marginTop: 32, opacity: platOp }}>
        {platforms.map((p) => (
          <span key={p} style={{ fontSize: 13, fontFamily: fonts.mono, color: colors.textDim }}>
            {p}
          </span>
        ))}
      </div>

      <span style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.mono, marginTop: 16, opacity: linkOp }}>
        github.com/vincrypt/flowfolio
      </span>
    </AbsoluteFill>
  );
};

// ─── Background ─────────────────────────────────────────────────
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
            <pattern id="igDot" x="0" y="0" width="44" height="44" patternUnits="userSpaceOnUse">
              <circle cx="22" cy="22" r="0.5" fill="#ffffff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#igDot)" />
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

// ─── Main Composition ───────────────────────────────────────────
export const FlowFolioIntroIG: React.FC<IGProps> = ({ seed }) => {
  const rng = useMemo(() => new VideoRNG(seed), [seed]);
  const hookVariant = useMemo(() => rng.pick(hookVariants), [rng]);
  const tagline = useMemo(() => rng.pick(taglineVariants), [rng]);

  // Seed-driven feature selection
  const igFeatures = useMemo(() => {
    const selected = pickIGFeatures(rng, 3);
    return selected.map((f, i) => ({
      beat: f.beat,
      label: f.label,
      color: igColorMap[f.colorKey] ?? colors.primary,
      Icon: igIcons[i % igIcons.length] ?? IGIconSliders,
    }));
  }, [rng]);

  return (
    <VideoSeedContext.Provider value={rng}>
      <AbsoluteFill style={{ backgroundColor: colors.bg, fontFamily: fonts.sans, overflow: 'hidden' }}>
        <IGBackground />
        {/* Hook — problem statement (0-5.5s) */}
        <Sequence from={0} durationInFrames={330}>
          <IGHook line1={hookVariant.line1} line2={hookVariant.line2} />
        </Sequence>

        {/* Logo (5.2-10.3s) */}
        <Sequence from={310} durationInFrames={310}>
          <IGLogo tagline={tagline} />
        </Sequence>

        {/* Story-framed features (10-16.3s) */}
        <Sequence from={600} durationInFrames={380}>
          <IGFeatures features={igFeatures} />
        </Sequence>

        {/* CTA (16-22s) */}
        <Sequence from={960} durationInFrames={360}>
          <IGCTA />
        </Sequence>
      </AbsoluteFill>
    </VideoSeedContext.Provider>
  );
};
