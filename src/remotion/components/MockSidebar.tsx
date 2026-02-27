import React from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts, radius } from '../styles';

// ─── SVG Icons for Sidebar Nav ──────────────────────────────────

/** Sliders — Vibe Studio */
const IconVibeStudio: React.FC<{ color: string }> = ({ color }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <line x1="4" y1="6" x2="20" y2="6" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
    <line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
    <line x1="4" y1="18" x2="20" y2="18" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
    <circle cx="8" cy="6" r="2.2" fill={color} />
    <circle cx="15" cy="12" r="2.2" fill={color} />
    <circle cx="10" cy="18" r="2.2" fill={color} />
  </svg>
);

/** Pie chart — Portfolio */
const IconPortfolio: React.FC<{ color: string }> = ({ color }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" opacity="0.35" />
    <path d="M12 3a9 9 0 0 1 9 9h-9V3z" fill={color} fillOpacity="0.6" />
    <path d="M12 12l6.36 6.36A9 9 0 0 1 12 21V12z" fill={color} fillOpacity="0.3" />
  </svg>
);

/** Chart line — Backtest */
const IconBacktest: React.FC<{ color: string }> = ({ color }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <polyline points="3,17 8,12 12,14 17,7 21,5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="17,7 21,5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="17" cy="7" r="1.8" fill={color} opacity="0.6" />
    <line x1="3" y1="20" x2="21" y2="20" stroke={color} strokeWidth="1.2" opacity="0.2" />
  </svg>
);

/** Bar chart — Analysis */
const IconAnalysis: React.FC<{ color: string }> = ({ color }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="14" width="4" height="7" rx="1" fill={color} fillOpacity="0.3" />
    <rect x="10" y="8" width="4" height="13" rx="1" fill={color} fillOpacity="0.5" />
    <rect x="17" y="3" width="4" height="18" rx="1" fill={color} fillOpacity="0.7" />
  </svg>
);

/** Pen/book — Journal */
const IconJournal: React.FC<{ color: string }> = ({ color }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <rect x="5" y="3" width="14" height="18" rx="2" stroke={color} strokeWidth="1.6" opacity="0.4" />
    <line x1="9" y1="8" x2="15" y2="8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <line x1="9" y1="12" x2="15" y2="12" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    <line x1="9" y1="16" x2="13" y2="16" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
    <line x1="5" y1="3" x2="5" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

interface SidebarItem {
  Icon: React.FC<{ color: string }>;
  label: string;
}

const items: SidebarItem[] = [
  { Icon: IconVibeStudio, label: 'Vibe Studio' },
  { Icon: IconPortfolio, label: 'Portfolio' },
  { Icon: IconBacktest, label: 'Backtest' },
  { Icon: IconAnalysis, label: 'Analysis' },
  { Icon: IconJournal, label: 'Journal' },
];

interface MockSidebarProps {
  activeIndex?: number;
  delay?: number;
}

export const MockSidebar: React.FC<MockSidebarProps> = ({
  activeIndex = 0,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 100, mass: 0.5 },
  });
  const translateX = interpolate(slideIn, [0, 1], [-240, 0]);

  return (
    <div
      style={{
        width: 220,
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderRight: `1px solid ${colors.glassBorder}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 12px',
        gap: 2,
        transform: `translateX(${translateX}px)`,
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          marginBottom: 28,
        }}
      >
        <Img
          src={staticFile('icon-only.png')}
          style={{
            width: 24,
            height: 24,
            objectFit: 'contain',
          }}
        />
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: colors.text,
            fontFamily: fonts.sans,
            letterSpacing: '-0.02em',
          }}
        >
          FlowFolio
        </span>
      </div>

      {/* Nav items */}
      {items.map((item, i) => {
        const isActive = i === activeIndex;
        const itemDelay = delay + 5 + i * 3;
        const itemOpacity = interpolate(frame - itemDelay, [0, 12], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <div
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: radius.md,
              backgroundColor: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: isActive ? colors.text : colors.textDim,
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              fontFamily: fonts.sans,
              opacity: itemOpacity,
              position: 'relative',
            }}
          >
            {/* Active indicator bar */}
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '15%',
                  width: 3,
                  height: '70%',
                  borderRadius: '0 2px 2px 0',
                  background: colors.primary,
                  boxShadow: `0 0 12px ${colors.primaryGlow}`,
                  opacity: itemOpacity,
                }}
              />
            )}
            <div style={{
              width: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${interpolate(frame - itemDelay, [0, 15], [0.7, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
            }}>
              <item.Icon color={isActive ? colors.primary : colors.textDim} />
            </div>
            {item.label}
          </div>
        );
      })}
    </div>
  );
};
