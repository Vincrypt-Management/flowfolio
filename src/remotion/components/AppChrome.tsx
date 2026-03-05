import React from 'react';
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  staticFile,
  Img,
} from 'remotion';
import { colors, fonts } from '../styles';

/**
 * Real app sidebar items matching FlowFolio's actual navigation.
 */
const sidebarItems = [
  { label: 'Dashboard' },
  { label: 'Vibe Studio' },
  { label: 'Saved Portfolios' },
  { label: 'Portfolio' },
  { label: 'Backtest' },
  { label: 'Rankings' },
  { label: 'Journal' },
  { label: 'Yearly Review' },
];

interface AppChromeProps {
  activeTab: string;
  children: React.ReactNode;
  /** Header title for the main content area */
  headerTitle?: string;
  headerSubtitle?: string;
}

/**
 * Mimics the real FlowFolio app shell: sidebar + main content area.
 * Uses the actual app's dark theme design tokens.
 */
export const AppChrome: React.FC<AppChromeProps> = ({
  activeTab,
  children,
  headerTitle,
  headerSubtitle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sidebarSlide = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 100, mass: 0.6 },
  });

  const activeIndex = sidebarItems.findIndex((i) => i.label === activeTab);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* Sidebar */}
      <div
        style={{
          width: 220,
          background: '#000000',
          borderRight: '1px solid #1a1a1a',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 0',
          transform: `translateX(${interpolate(sidebarSlide, [0, 1], [-220, 0])}px)`,
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '0 20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid #1a1a1a',
            marginBottom: 12,
          }}
        >
          <Img
            src={staticFile('logo.png')}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              objectFit: 'contain',
            }}
          />
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: colors.text,
              fontFamily: fonts.sans,
              letterSpacing: '-0.02em',
            }}
          >
            FlowFolio
          </span>
          <span
            style={{
              fontSize: 9,
              color: colors.textDim,
              fontFamily: fonts.mono,
              background: '#1a1a1a',
              padding: '2px 5px',
              borderRadius: 3,
            }}
          >
            v2.0
          </span>
        </div>

        {/* Nav items */}
        {sidebarItems.map((item, i) => {
          const isActive = i === activeIndex;
          const itemDelay = 8 + i * 4;
          const itemOpacity = interpolate(frame, [itemDelay, itemDelay + 20], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
          });

          return (
            <div
              key={item.label}
              style={{
                padding: '9px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                opacity: itemOpacity,
                background: isActive
                  ? 'rgba(0, 229, 153, 0.08)'
                  : 'transparent',
                borderLeft: isActive
                  ? `3px solid ${colors.primary}`
                  : '3px solid transparent',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isActive ? colors.primary : colors.textDim,
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontFamily: fonts.sans,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? colors.primary : colors.textMuted,
                }}
              >
                {item.label}
              </span>
            </div>
          );
        })}

        {/* Bottom section */}
        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #1a1a1a' }}>
          <div
            style={{
              fontSize: 10,
              fontFamily: fonts.mono,
              color: colors.textDim,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: colors.primary,
                boxShadow: `0 0 4px ${colors.primary}`,
              }}
            />
            All data stored locally
          </div>
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          background: '#050505',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header bar */}
        {headerTitle && (
          <div
            style={{
              padding: '20px 40px 16px',
              borderBottom: '1px solid #1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: colors.text,
                  fontFamily: fonts.sans,
                  letterSpacing: '-0.02em',
                  opacity: interpolate(frame, [12, 35], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                    easing: Easing.out(Easing.cubic),
                  }),
                }}
              >
                {headerTitle}
              </div>
              {headerSubtitle && (
                <div
                  style={{
                    fontSize: 12,
                    color: colors.textDim,
                    fontFamily: fonts.sans,
                    marginTop: 2,
                    opacity: interpolate(frame, [18, 40], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                      easing: Easing.out(Easing.cubic),
                    }),
                  }}
                >
                  {headerSubtitle}
                </div>
              )}
            </div>
            {/* Mode badge */}
            <div
              style={{
                fontSize: 10,
                fontFamily: fonts.mono,
                color: colors.accent,
                background: 'rgba(99, 102, 241, 0.1)',
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid rgba(99, 102, 241, 0.2)',
                opacity: interpolate(frame, [20, 45], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              }}
            >
              Advanced Mode
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, padding: '24px 40px', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
};
