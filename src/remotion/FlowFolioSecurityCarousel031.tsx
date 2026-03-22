/**
 * FlowFolio v0.3.1 Security & Analysis Carousel (1080x1080, 8 slides)
 *
 * Educational carousel: why the v0.3.1 security & stability features matter.
 * Render each slide individually via the `slide` prop (0-indexed).
 *
 * Design: matches FlowFolio app branding — dark bg (#060608), emerald primary
 * (#00e599), indigo accent (#818cf8), Inter + JetBrains Mono typography,
 * glass-morphism cards with backdrop blur.
 */

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
  Img,
  staticFile,
} from 'remotion';
import { colors, fonts, radius, gradients } from './styles';

// ─── Shared Layout ──────────────────────────────────────────

const BG_STYLE: React.CSSProperties = {
  backgroundColor: colors.bg,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
};

/** Ambient background with subtle dot grid + drifting orbs */
const AmbientBg: React.FC = () => {
  const frame = useCurrentFrame();
  const angle = (frame / 600) * Math.PI * 2;
  const ox = 50 + Math.cos(angle) * 6;
  const oy = 48 + Math.sin(angle) * 5;

  return (
    <>
      <AbsoluteFill style={{ background: colors.bg }} />
      {/* Dot grid */}
      <AbsoluteFill style={{ opacity: 0.02 }}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="secDot" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
              <circle cx="24" cy="24" r="0.6" fill="#ffffff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#secDot)" />
        </svg>
      </AbsoluteFill>
      {/* Primary orb */}
      <div style={{
        position: 'absolute', left: `${ox}%`, top: `${oy}%`,
        width: 420, height: 420, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 229, 153, 0.045) 0%, transparent 70%)',
        transform: 'translate(-50%,-50%)', filter: 'blur(60px)',
      }} />
      {/* Accent orb */}
      <div style={{
        position: 'absolute', left: `${100 - ox}%`, top: `${100 - oy}%`,
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(129, 140, 248, 0.035) 0%, transparent 70%)',
        transform: 'translate(-50%,-50%)', filter: 'blur(60px)',
      }} />
      {/* Vignette */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.4) 100%)',
      }} />
    </>
  );
};

const Frame: React.FC<{ children: React.ReactNode; padX?: number }> = ({
  children,
  padX = 72,
}) => (
  <AbsoluteFill style={BG_STYLE}>
    <AmbientBg />
    <div style={{
      position: 'relative', zIndex: 1,
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      padding: `64px ${padX}px`,
    }}>
      {children}
    </div>
  </AbsoluteFill>
);

// ─── Brand Bar ──────────────────────────────────────────────

const BrandMark: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: op }}>
      <Img src={staticFile('logo.png')} style={{
        width: 32, height: 32, borderRadius: radius.md,
        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
      }} />
      <span style={{
        fontSize: 17, fontWeight: 600, color: colors.textMuted,
        fontFamily: fonts.sans, letterSpacing: '-0.02em',
      }}>
        FlowFolio
      </span>
    </div>
  );
};

const TOTAL = 8;

const Dots: React.FC<{ current: number }> = ({ current }) => (
  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
    {Array.from({ length: TOTAL }, (_, i) => (
      <div key={i} style={{
        width: i === current ? 24 : 6,
        height: 6,
        borderRadius: 3,
        background: i === current ? colors.primary : 'rgba(255,255,255,0.12)',
        transition: 'width 0.3s',
      }} />
    ))}
  </div>
);

const PageNum: React.FC<{ n: number }> = ({ n }) => (
  <span style={{
    fontSize: 13, color: colors.textDim, fontFamily: fonts.mono, opacity: 0.5,
  }}>
    {n + 1}/{TOTAL}
  </span>
);

const TopBar: React.FC<{ slide: number }> = ({ slide }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <BrandMark />
    <PageNum n={slide} />
  </div>
);

const BottomBar: React.FC<{ slide: number }> = ({ slide }) => (
  <div style={{ display: 'flex', justifyContent: 'center' }}>
    <Dots current={slide} />
  </div>
);

// ─── Glass Card ─────────────────────────────────────────────

const Glass: React.FC<{
  children: React.ReactNode;
  delay?: number;
  accent?: string;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, accent, style }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame - delay, [0, 36], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const y = interpolate(frame - delay, [0, 36], [10, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{
      opacity: op,
      transform: `translateY(${y}px)`,
      background: 'rgba(12, 12, 16, 0.7)',
      backdropFilter: 'blur(16px)',
      border: `1px solid ${accent ? `${accent}20` : 'rgba(255,255,255,0.07)'}`,
      borderRadius: radius['2xl'],
      padding: 32,
      boxShadow: accent
        ? `0 4px 32px rgba(0,0,0,0.3), 0 0 0 1px ${accent}10`
        : '0 4px 32px rgba(0,0,0,0.3)',
      ...style,
    }}>
      {children}
    </div>
  );
};

// ─── Animated Text ──────────────────────────────────────────

const FadeText: React.FC<{
  text: string;
  size?: number;
  weight?: number;
  color?: string;
  font?: string;
  delay?: number;
  lineHeight?: number;
  letterSpacing?: string;
  style?: React.CSSProperties;
}> = ({
  text, size = 24, weight = 400, color: c = colors.text,
  font = fonts.sans, delay = 0, lineHeight = 1.5,
  letterSpacing = '-0.02em', style,
}) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame - delay, [0, 33], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const y = interpolate(frame - delay, [0, 33], [8, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{
      opacity: op, transform: `translateY(${y}px)`,
      fontSize: size, fontWeight: weight, color: c,
      fontFamily: font, lineHeight, letterSpacing,
      whiteSpace: 'pre-line',
      ...style,
    }}>
      {text}
    </div>
  );
};

// ─── SVG Icons ──────────────────────────────────────────────

const PATHS: Record<string, string> = {
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  lock: 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4',
  'alert-tri': 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01',
  'eye-off': 'M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22',
  check: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  cpu: 'M4 4h16v16H4zM9 1v3m6-3v3M9 20v3m6-3v3M20 9h3m-3 6h3M1 9h3m-3 6h3',
  clipboard: 'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 011 1v1a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z',
  database: 'M12 2C6.48 2 2 4.02 2 6.5v11C2 19.98 6.48 22 12 22s10-2.02 10-4.5v-11C22 4.02 17.52 2 12 2zM2 11.5c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5',
  'arrow-r': 'M5 12h14m-7-7l7 7-7 7',
};

const Icon: React.FC<{
  name: string; size?: number; color?: string; sw?: number;
}> = ({ name, size = 24, color = colors.text, sw = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke={color} strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round">
    <path d={PATHS[name] || PATHS.shield} />
  </svg>
);

// ─── Icon Badge ─────────────────────────────────────────────

const IconBadge: React.FC<{
  name: string; color: string; size?: number;
}> = ({ name, color, size = 56 }) => (
  <div style={{
    width: size, height: size, borderRadius: radius.xl,
    background: `${color}0c`,
    border: `1.5px solid ${color}20`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  }}>
    <Icon name={name} size={size * 0.5} color={color} sw={1.5} />
  </div>
);

// ─── Callout ────────────────────────────────────────────────

const Callout: React.FC<{
  text: string; icon: string; color: string; delay?: number;
}> = ({ text, icon, color, delay = 30 }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame - delay, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{
      opacity: op,
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 22px',
      background: `${color}06`,
      border: `1px solid ${color}18`,
      borderRadius: radius.xl,
    }}>
      <Icon name={icon} size={18} color={color} sw={2} />
      <span style={{
        fontSize: 18, fontWeight: 600, color, fontFamily: fonts.sans,
        letterSpacing: '-0.01em',
      }}>
        {text}
      </span>
    </div>
  );
};

// ─── Content Slide Template ─────────────────────────────────

interface ContentSlideProps {
  slide: number;
  icon: string;
  accent: string;
  title: string;
  body: string;
  callout: string;
  calloutIcon?: string;
}

const ContentSlide: React.FC<ContentSlideProps> = ({
  slide, icon, accent, title, body, callout, calloutIcon,
}) => (
  <Frame>
    <TopBar slide={slide} />

    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <IconBadge name={icon} color={accent} />
        <FadeText text={title} size={36} weight={700} delay={5}
          style={{ lineHeight: 1.15, letterSpacing: '-0.03em' }} />
      </div>

      {/* Accent line */}
      <div style={{ width: 48, height: 2.5, borderRadius: 2, background: accent, opacity: 0.5 }} />

      {/* Body */}
      <Glass delay={12} accent={accent}>
        <FadeText text={body} size={23} weight={400} color={colors.textSoft}
          delay={18} lineHeight={1.75} letterSpacing="-0.01em" />
      </Glass>

      {/* Callout */}
      <Callout text={callout} icon={calloutIcon || icon} color={accent} delay={28} />
    </div>

    <BottomBar slide={slide} />
  </Frame>
);

// ─── Slide 0: Cover ─────────────────────────────────────────

const CoverSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const iconScale = interpolate(frame, [0, 40], [0.5, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.4)),
  });
  const iconOp = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <Frame>
      <TopBar slide={0} />

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', gap: 36,
      }}>
        {/* Shield icon */}
        <div style={{ opacity: iconOp, transform: `scale(${iconScale})` }}>
          <div style={{
            width: 120, height: 120, borderRadius: radius.full,
            background: `${colors.primary}0a`,
            border: `2px solid ${colors.primary}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="shield" size={52} color={colors.primary} sw={1.5} />
          </div>
        </div>

        <FadeText
          text={'Why Security\n& Analysis Matter'}
          size={54} weight={800} delay={8}
          style={{
            textAlign: 'center', lineHeight: 1.1, letterSpacing: '-0.04em',
            background: `linear-gradient(135deg, ${colors.text} 30%, ${colors.primary})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        />

        <div style={{
          padding: '8px 24px', borderRadius: radius.full,
          background: `${colors.primary}0c`,
          border: `1px solid ${colors.primary}18`,
        }}>
          <FadeText text="v0.3.1 Update" size={16} weight={600}
            color={colors.primary} font={fonts.mono} delay={20}
            style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }} />
        </div>

        <FadeText text="Swipe to learn why this update matters for your portfolio"
          size={17} color={colors.textDim} delay={30}
          style={{ textAlign: 'center', maxWidth: 520 }} />
      </div>

      <BottomBar slide={0} />
    </Frame>
  );
};

// ─── Slide 7: CTA ───────────────────────────────────────────

const CtaSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const logoOp = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const btnScale = interpolate(frame, [25, 50], [0.9, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.3)),
  });

  return (
    <Frame>
      <TopBar slide={7} />

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', gap: 32,
      }}>
        {/* Logo */}
        <div style={{ opacity: logoOp }}>
          <Img src={staticFile('logo.png')} style={{
            width: 96, height: 96, borderRadius: radius.xl,
            filter: 'drop-shadow(0 12px 32px rgba(0,0,0,0.4))',
          }} />
        </div>

        {/* Brand name */}
        <div style={{ display: 'flex', alignItems: 'baseline', opacity: logoOp }}>
          <span style={{ fontSize: 48, fontWeight: 700, color: colors.text, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>Flow</span>
          <span style={{ fontSize: 48, fontWeight: 700, color: colors.primary, fontFamily: fonts.sans, letterSpacing: '-0.04em' }}>Folio</span>
        </div>

        <FadeText text="Security-First Investment Intelligence"
          size={20} color={colors.textMuted} font={fonts.mono} delay={12}
          style={{ textAlign: 'center', letterSpacing: '0.02em' }} />

        {/* CTA card */}
        <Glass delay={18} accent={colors.primary} style={{ maxWidth: 700, textAlign: 'center' }}>
          <FadeText
            text="Your keys encrypted. Your data local. Your analysis private. Take control of your portfolio security."
            size={22} color={colors.textSoft} delay={22}
            style={{ textAlign: 'center', lineHeight: 1.7 }}
          />
        </Glass>

        {/* Button */}
        <div style={{
          transform: `scale(${btnScale})`, opacity: logoOp,
          padding: '14px 44px',
          background: gradients.primaryToAccent,
          borderRadius: radius.full,
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 20px rgba(0, 229, 153, 0.15)',
        }}>
          <span style={{ fontSize: 19, fontWeight: 700, color: colors.bg, fontFamily: fonts.sans }}>
            Download Free
          </span>
          <Icon name="arrow-r" size={18} color={colors.bg} sw={2.5} />
        </div>

        <FadeText text="Vault-encrypted  |  100% offline  |  100% yours"
          size={15} color={colors.textDim} font={fonts.mono} delay={35}
          style={{ textAlign: 'center', letterSpacing: '0.02em' }} />
      </div>

      <BottomBar slide={7} />
    </Frame>
  );
};

// ─── Main Composition ───────────────────────────────────────

export const SECURITY_CAROUSEL_SLIDES = 8;

export const SecurityCarousel031: React.FC<{ slide?: number }> = ({ slide = 0 }) => {
  const slides: React.ReactNode[] = [
    // 0: Cover
    <CoverSlide key={0} />,

    // 1: The Problem
    <ContentSlide key={1} slide={1}
      icon="alert-tri" accent={colors.rose}
      title="The Hidden Cost of Free Tools"
      body={'Most portfolio trackers store your data on their servers. Your holdings, trades, and watchlists get sold to hedge funds who trade against retail investors.\n\nPlain-text API keys in config files are one data breach away from exposing your accounts.'}
      callout="Your portfolio data is worth more than you think"
      calloutIcon="eye-off"
    />,

    // 2: Stronghold Vault
    <ContentSlide key={2} slide={2}
      icon="lock" accent={colors.primary}
      title="Stronghold Vault"
      body={'Your API keys are now encrypted with IOTA Stronghold — the same vault technology used in blockchain infrastructure.\n\nArgon2 key derivation makes brute-force attacks impractical. Keys never exist in plain text on disk.'}
      callout="Military-grade encryption for your market data keys"
      calloutIcon="shield"
    />,

    // 3: E2E Testing
    <ContentSlide key={3} slide={3}
      icon="activity" accent={colors.accent}
      title="Battle-Tested Reliability"
      body={'New Playwright E2E test suite validates every critical user flow before release.\n\nMock Tauri fixtures simulate the full desktop environment in CI. Every commit tested on Linux, macOS, and Windows.'}
      callout="Automated testing catches bugs before you do"
      calloutIcon="check"
    />,

    // 4: Zero-Crash Architecture
    <ContentSlide key={4} slide={4}
      icon="zap" accent={colors.blue}
      title="Zero-Crash Architecture"
      body={'Dynamic plugin loading ensures the app never crashes from missing native modules.\n\nAll Tauri plugins load on demand — the UI stays responsive even when native features are unavailable. 5 critical integration bugs fixed.'}
      callout="Resilient design means your data is always accessible"
    />,

    // 5: Local-First Analysis
    <ContentSlide key={5} slide={5}
      icon="database" accent={colors.cyan}
      title="100% Local Analysis"
      body={'All features unlocked in local-first Pro mode — no cloud account, no paywall.\n\n30+ quant metrics computed on your machine. 8 market data providers with automatic failover. AI portfolio agent runs via your own API key.'}
      callout="Your analysis never leaves your machine"
      calloutIcon="cpu"
    />,

    // 6: Roadmap
    <ContentSlide key={6} slide={6}
      icon="clipboard" accent={colors.amber}
      title="24 Gaps Mapped"
      body={'A comprehensive product audit identified 24 gaps across 7 categories:\n\nCommand palette & keyboard shortcuts\nMulti-currency & tax lot tracking\nDividend tracking & benchmark comparison\nWhat-if scenarios & portfolio simulation\nMobile builds for iOS & Android'}
      callout="Every gap has a plan — production-ready is the goal"
      calloutIcon="arrow-r"
    />,

    // 7: CTA
    <CtaSlide key={7} />,
  ];

  return <>{slides[slide] ?? slides[0]}</>;
};
