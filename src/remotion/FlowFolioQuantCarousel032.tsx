/**
 * FlowFolio Quant Metrics Carousel (1080x1080, 8 slides)
 *
 * Educational carousel: 5 quant metrics every investor should understand.
 * Design: editorial / typographic — no glass cards, generous whitespace,
 * inline icons only, strong type hierarchy.
 *
 * Render each slide via the `slide` prop (0-indexed).
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
import { colors, fonts, radius } from './styles';

// ─── Animation Helpers ──────────────────────────────────────

function fadeUp(frame: number, delay = 0, duration = 30) {
  const f = frame - delay;
  const op = interpolate(f, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const y = interpolate(f, [0, duration], [14, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return { opacity: op, transform: `translateY(${y}px)` };
}

function fadeIn(frame: number, delay = 0, duration = 24) {
  const f = frame - delay;
  const op = interpolate(f, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return { opacity: op };
}

function scaleIn(frame: number, delay = 0) {
  const f = frame - delay;
  const s = interpolate(f, [0, 36], [0.88, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.5)),
  });
  const op = interpolate(f, [0, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return { opacity: op, transform: `scale(${s})` };
}

// ─── Inline SVG Icons ───────────────────────────────────────

const PATHS: Record<string, string> = {
  trending:
    'M22 7l-8.5 8.5-5-5L2 17M22 7h-6m6 0v6',
  shield:
    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  activity:
    'M22 12h-4l-3 9L9 3l-3 9H2',
  'arrow-down':
    'M12 5v14m7-7-7 7-7-7',
  bar:
    'M18 20V10M12 20V4M6 20v-6',
  'percent':
    'M19 5L5 19M9 5a4 4 0 110 8 4 4 0 010-8zm10 6a4 4 0 110 8 4 4 0 010-8z',
  target:
    'M12 22a10 10 0 100-20 10 10 0 000 20zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z',
  'arrow-r':
    'M5 12h14m-7-7 7 7-7 7',
  lock:
    'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4',
  'chevron-r':
    'M9 18l6-6-6-6',
};

const Icon: React.FC<{
  name: string;
  size?: number;
  color?: string;
  sw?: number;
}> = ({ name, size = 20, color = colors.text, sw = 1.8 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={PATHS[name] || PATHS.trending} />
  </svg>
);

// ─── Layout Shell ───────────────────────────────────────────

const TOTAL = 8;
const PAD = 80;

const Dots: React.FC<{ current: number }> = ({ current }) => (
  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
    {Array.from({ length: TOTAL }, (_, i) => (
      <div
        key={i}
        style={{
          width: i === current ? 28 : 7,
          height: 7,
          borderRadius: 4,
          background:
            i === current ? colors.primary : 'rgba(255,255,255,0.1)',
        }}
      />
    ))}
  </div>
);

const BrandBar: React.FC<{ slide: number }> = ({ slide }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        ...fadeIn(frame, 0, 20),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Img
          src={staticFile('logo.png')}
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.md,
          }}
        />
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: colors.textDim,
            fontFamily: fonts.sans,
            letterSpacing: '-0.01em',
          }}
        >
          FlowFolio
        </span>
      </div>
      <span
        style={{
          fontSize: 13,
          color: colors.textDim,
          fontFamily: fonts.mono,
          opacity: 0.5,
        }}
      >
        {slide + 1}/{TOTAL}
      </span>
    </div>
  );
};

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      backgroundColor: colors.bg,
      display: 'flex',
      flexDirection: 'column',
      padding: `${PAD}px`,
    }}
  >
    {children}
  </AbsoluteFill>
);

// ─── Slide 0: Cover ─────────────────────────────────────────

const CoverSlide: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Frame>
      <BrandBar slide={0} />

      {/* Main content centered */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 0,
        }}
      >
        {/* Tag line */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 28,
            ...fadeIn(frame, 4, 24),
          }}
        >
          <Icon name="bar" size={16} color={colors.primary} sw={2} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: colors.primary,
              fontFamily: fonts.mono,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Quant Fundamentals
          </span>
        </div>

        {/* Headline */}
        <div style={{ marginBottom: 40, ...fadeUp(frame, 10, 34) }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: colors.text,
              fontFamily: fonts.sans,
              lineHeight: 1.0,
              letterSpacing: '-0.05em',
            }}
          >
            5 Metrics
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              fontFamily: fonts.sans,
              lineHeight: 1.0,
              letterSpacing: '-0.05em',
              color: colors.primary,
            }}
          >
            That Protect
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: colors.text,
              fontFamily: fonts.sans,
              lineHeight: 1.0,
              letterSpacing: '-0.05em',
            }}
          >
            Your Portfolio
          </div>
        </div>

        {/* Horizontal rule */}
        <div
          style={{
            width: 56,
            height: 3,
            borderRadius: 2,
            background: colors.primary,
            marginBottom: 40,
            ...fadeIn(frame, 24, 20),
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            fontSize: 22,
            color: colors.textMuted,
            fontFamily: fonts.sans,
            lineHeight: 1.6,
            letterSpacing: '-0.01em',
            maxWidth: 680,
            ...fadeUp(frame, 28, 30),
          }}
        >
          Most investors watch price. Smart investors watch risk.
          Swipe to learn the numbers that actually matter.
        </div>
      </div>

      {/* Bottom */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          ...fadeIn(frame, 32, 20),
        }}
      >
        <Dots current={0} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: colors.textDim,
              fontFamily: fonts.mono,
              letterSpacing: '0.04em',
            }}
          >
            swipe
          </span>
          <Icon name="chevron-r" size={13} color={colors.textDim} sw={2} />
        </div>
      </div>
    </Frame>
  );
};

// ─── Content Slide Template ──────────────────────────────────

interface MetricSlideProps {
  slide: number;
  num: string;       // e.g. "01"
  tag: string;       // e.g. "Risk-Adjusted Return"
  icon: string;
  accent: string;
  title: string;     // metric name
  formula?: string;  // short formula or definition
  body: string;
  stat: string;      // e.g. "> 1.0"
  statLabel: string; // e.g. "Good Sharpe"
}

const MetricSlide: React.FC<MetricSlideProps> = ({
  slide, num, tag, icon, accent, title, formula, body, stat, statLabel,
}) => {
  const frame = useCurrentFrame();

  return (
    <Frame>
      <BrandBar slide={slide} />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingTop: 20,
          paddingBottom: 20,
        }}
      >
        {/* Slide number + tag */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 36,
            ...fadeIn(frame, 0, 20),
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: accent,
              fontFamily: fonts.mono,
              letterSpacing: '0.08em',
              opacity: 0.8,
            }}
          >
            {num}
          </span>
          <div
            style={{
              width: 1,
              height: 14,
              background: 'rgba(255,255,255,0.12)',
            }}
          />
          <span
            style={{
              fontSize: 13,
              color: colors.textDim,
              fontFamily: fonts.mono,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {tag}
          </span>
        </div>

        {/* Icon + Title row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 20,
            ...fadeUp(frame, 6, 30),
          }}
        >
          <Icon name={icon} size={32} color={accent} sw={1.8} />
          <span
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: colors.text,
              fontFamily: fonts.sans,
              letterSpacing: '-0.04em',
              lineHeight: 1.0,
            }}
          >
            {title}
          </span>
        </div>

        {/* Formula / definition pill */}
        {formula && (
          <div
            style={{
              marginBottom: 32,
              ...fadeIn(frame, 14, 22),
            }}
          >
            <span
              style={{
                fontSize: 15,
                color: accent,
                fontFamily: fonts.mono,
                letterSpacing: '0.01em',
                opacity: 0.85,
              }}
            >
              {formula}
            </span>
          </div>
        )}

        {/* Horizontal rule */}
        <div
          style={{
            width: 48,
            height: 2.5,
            borderRadius: 2,
            background: accent,
            marginBottom: 32,
            opacity: interpolate(frame - 18, [0, 18], [0, 0.6], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        />

        {/* Body */}
        <div
          style={{
            fontSize: 24,
            color: colors.textSoft,
            fontFamily: fonts.sans,
            lineHeight: 1.75,
            letterSpacing: '-0.01em',
            marginBottom: 44,
            maxWidth: 840,
            whiteSpace: 'pre-line',
            ...fadeUp(frame, 20, 32),
          }}
        >
          {body}
        </div>

        {/* Stat row — no card, just text + icon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            ...fadeUp(frame, 30, 28),
          }}
        >
          <div
            style={{
              width: 4,
              height: 40,
              borderRadius: 2,
              background: accent,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontSize: 11,
                color: colors.textDim,
                fontFamily: fonts.mono,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {statLabel}
            </span>
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: accent,
                fontFamily: fonts.mono,
                letterSpacing: '-0.02em',
              }}
            >
              {stat}
            </span>
          </div>
        </div>
      </div>

      <Dots current={slide} />
    </Frame>
  );
};

// ─── Slide 7: CTA ───────────────────────────────────────────

const CtaSlide: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Frame>
      <BrandBar slide={7} />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 0,
        }}
      >
        {/* Logo */}
        <div
          style={{
            marginBottom: 36,
            ...scaleIn(frame, 0),
          }}
        >
          <Img
            src={staticFile('logo.png')}
            style={{
              width: 72,
              height: 72,
              borderRadius: radius.xl,
            }}
          />
        </div>

        {/* Brand name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 0,
            marginBottom: 32,
            ...fadeUp(frame, 8, 28),
          }}
        >
          <span
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: colors.text,
              fontFamily: fonts.sans,
              letterSpacing: '-0.05em',
              lineHeight: 1.0,
            }}
          >
            Flow
          </span>
          <span
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: colors.primary,
              fontFamily: fonts.sans,
              letterSpacing: '-0.05em',
              lineHeight: 1.0,
            }}
          >
            Folio
          </span>
        </div>

        {/* Rule */}
        <div
          style={{
            width: 48,
            height: 2.5,
            borderRadius: 2,
            background: colors.primary,
            marginBottom: 32,
            ...fadeIn(frame, 16, 18),
          }}
        />

        {/* Message */}
        <div
          style={{
            fontSize: 26,
            color: colors.textSoft,
            fontFamily: fonts.sans,
            lineHeight: 1.7,
            letterSpacing: '-0.01em',
            maxWidth: 820,
            marginBottom: 52,
            ...fadeUp(frame, 18, 32),
          }}
        >
          FlowFolio calculates all 5 of these metrics
          automatically — for every strategy you test,
          every backtest you run, every portfolio you build.
        </div>

        {/* Feature list — inline, no cards */}
        {[
          { icon: 'trending', text: 'Sharpe, Sortino & Calmar ratios' },
          { icon: 'activity', text: 'Max drawdown & beta analysis' },
          { icon: 'lock',     text: '100% offline — your data stays yours' },
        ].map(({ icon, text }, i) => (
          <div
            key={text}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 18,
              ...fadeUp(frame, 24 + i * 8, 26),
            }}
          >
            <Icon name={icon} size={18} color={colors.primary} sw={1.8} />
            <span
              style={{
                fontSize: 19,
                color: colors.textMuted,
                fontFamily: fonts.sans,
                letterSpacing: '-0.01em',
              }}
            >
              {text}
            </span>
          </div>
        ))}

        {/* CTA label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 12,
            ...fadeIn(frame, 48, 24),
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: colors.primary,
              fontFamily: fonts.sans,
              letterSpacing: '-0.01em',
            }}
          >
            Download free
          </span>
          <Icon name="arrow-r" size={15} color={colors.primary} sw={2.2} />
        </div>
      </div>

      <Dots current={7} />
    </Frame>
  );
};

// ─── Main Composition ────────────────────────────────────────

export const QUANT_CAROUSEL_SLIDES = 8;

export const QuantCarousel032: React.FC<{ slide?: number }> = ({
  slide = 0,
}) => {
  const slides: React.ReactNode[] = [
    // 0: Cover
    <CoverSlide key={0} />,

    // 1: Sharpe Ratio
    <MetricSlide
      key={1}
      slide={1}
      num="01"
      tag="Risk-Adjusted Return"
      icon="trending"
      accent={colors.primary}
      title="Sharpe Ratio"
      formula="(Return − Risk-Free Rate) ÷ Std Deviation"
      body={
        'Measures how much return you earn per unit of risk taken.\n\n' +
        'A ratio of 1.0 means you earn one dollar of return for every dollar of risk. ' +
        'Below 1.0? You are being underpaid for the volatility you are absorbing.'
      }
      stat="> 1.0"
      statLabel="Target Sharpe"
    />,

    // 2: Max Drawdown
    <MetricSlide
      key={2}
      slide={2}
      num="02"
      tag="Downside Risk"
      icon="arrow-down"
      accent={colors.rose}
      title="Max Drawdown"
      formula="(Trough Value − Peak Value) ÷ Peak Value"
      body={
        'The largest peak-to-trough decline in your portfolio value.\n\n' +
        'A strategy with 40% max drawdown requires a 67% gain just to break even. ' +
        'Knowing this number before investing changes everything.'
      }
      stat="< 20%"
      statLabel="Manageable Drawdown"
    />,

    // 3: Sortino Ratio
    <MetricSlide
      key={3}
      slide={3}
      num="03"
      tag="Downside Volatility"
      icon="shield"
      accent={colors.accent}
      title="Sortino Ratio"
      formula="(Return − Risk-Free Rate) ÷ Downside Deviation"
      body={
        'Like Sharpe, but only penalizes bad volatility — the kind that loses you money.\n\n' +
        'Upside surprises should not count against a strategy. ' +
        'Sortino separates harmful risk from beneficial momentum.'
      }
      stat="> 1.5"
      statLabel="Strong Sortino"
    />,

    // 4: Beta
    <MetricSlide
      key={4}
      slide={4}
      num="04"
      tag="Market Sensitivity"
      icon="activity"
      accent={colors.blue}
      title="Beta"
      formula="Covariance(Asset, Market) ÷ Variance(Market)"
      body={
        'How much your portfolio moves relative to the broader market.\n\n' +
        'Beta of 1.2 means you ride 20% amplified market swings — both up and down. ' +
        'Low-beta portfolios absorb less shock during corrections.'
      }
      stat="< 0.9"
      statLabel="Low-Beta Target"
    />,

    // 5: Win Rate vs Profit Factor
    <MetricSlide
      key={5}
      slide={5}
      num="05"
      tag="Strategy Consistency"
      icon="percent"
      accent={colors.amber}
      title="Profit Factor"
      formula="Gross Profit ÷ Gross Loss"
      body={
        'Win rate alone is misleading — a strategy can win 80% of trades and still lose money.\n\n' +
        'Profit Factor above 1.5 means your winners are large enough to cover your losers with room to spare.'
      }
      stat="> 1.5"
      statLabel="Target Profit Factor"
    />,

    // 6: Calmar Ratio
    <MetricSlide
      key={6}
      slide={6}
      num="Bonus"
      tag="Return Per Unit of Pain"
      icon="target"
      accent={colors.cyan}
      title="Calmar Ratio"
      formula="Annualized Return ÷ Max Drawdown"
      body={
        'Tells you how much return you generated per unit of maximum drawdown endured.\n\n' +
        'Hedge funds use this to compare strategies with different risk profiles. ' +
        'Higher is always better — aim for above 0.5 over a 3-year window.'
      }
      stat="> 0.5"
      statLabel="3-Year Calmar"
    />,

    // 7: CTA
    <CtaSlide key={7} />,
  ];

  return <>{slides[slide] ?? slides[0]}</>;
};
