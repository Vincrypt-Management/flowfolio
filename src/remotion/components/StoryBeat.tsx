import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { colors, fonts } from '../styles';
import type { AnimationStyle } from '../lib/contentPools';

interface StoryBeatProps {
  line: string;
  subtitle?: string;
  accentColor?: string;
  /** Animation variant — each style reveals text differently */
  animStyle?: AnimationStyle;
  /** Accent decoration variant */
  accentVariant?: 'line' | 'dots' | 'glow' | 'gradient';
}

/**
 * Narrative bridge between scenes — a single sentence that frames
 * WHY the next feature matters, not WHAT it is.
 * ~70 frames (~2.3s): fade in → hold → fade out.
 * Now supports multiple animation styles for uniqueness.
 */
export const StoryBeat: React.FC<StoryBeatProps> = ({
  line,
  subtitle,
  accentColor = colors.primary,
  animStyle = 'fade-rise',
  accentVariant = 'line',
}) => {
  const frame = useCurrentFrame();
  const duration = 70;

  const fadeIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(frame, [duration - 18, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const containerOpacity = Math.min(fadeIn, fadeOut);

  const subtitleOp = subtitle
    ? interpolate(frame, [14, 30], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  // ─── Animation Style Rendering ────────────────────────────────
  const renderText = () => {
    const words = line.split(' ');

    switch (animStyle) {
      case 'word-reveal':
        return (
          <div
            style={{
              fontSize: 44,
              fontWeight: 600,
              color: colors.text,
              fontFamily: fonts.sans,
              letterSpacing: '-0.03em',
              textAlign: 'center',
              lineHeight: 1.2,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '0 10px',
            }}
          >
            {words.map((word, i) => {
              const wordStart = 4 + i * 4;
              const wordOp = interpolate(frame, [wordStart, wordStart + 8], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              const wordY = interpolate(frame, [wordStart, wordStart + 8], [8, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              return (
                <span
                  key={i}
                  style={{
                    opacity: wordOp,
                    transform: `translateY(${wordY}px)`,
                    display: 'inline-block',
                  }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        );

      case 'scale-in': {
        const scale = interpolate(frame, [0, 20], [0.85, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const scaleOp = interpolate(frame, [0, 14], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            style={{
              fontSize: 44,
              fontWeight: 600,
              color: colors.text,
              fontFamily: fonts.sans,
              letterSpacing: '-0.03em',
              textAlign: 'center',
              lineHeight: 1.2,
              transform: `scale(${scale})`,
              opacity: scaleOp,
            }}
          >
            {line}
          </div>
        );
      }

      case 'typewriter': {
        const charsVisible = Math.floor(
          interpolate(frame, [4, 4 + line.length * 1.2], [0, line.length], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        );
        const cursorOp = frame % 16 < 10 ? 1 : 0;
        return (
          <div
            style={{
              fontSize: 44,
              fontWeight: 600,
              color: colors.text,
              fontFamily: fonts.sans,
              letterSpacing: '-0.03em',
              textAlign: 'center',
              lineHeight: 1.2,
            }}
          >
            {line.slice(0, charsVisible)}
            <span style={{ opacity: charsVisible < line.length ? cursorOp : 0, color: accentColor }}>|</span>
          </div>
        );
      }

      case 'fade-rise':
      default: {
        const y = interpolate(frame, [0, 18], [12, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            style={{
              fontSize: 44,
              fontWeight: 600,
              color: colors.text,
              fontFamily: fonts.sans,
              letterSpacing: '-0.03em',
              textAlign: 'center',
              lineHeight: 1.2,
              transform: `translateY(${y}px)`,
            }}
          >
            {line}
          </div>
        );
      }
    }
  };

  // ─── Accent Decoration Variants ───────────────────────────────
  const renderAccent = () => {
    const progress = interpolate(frame, [6, 24], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

    switch (accentVariant) {
      case 'dots': {
        const dotCount = 3;
        return (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {Array.from({ length: dotCount }).map((_, i) => {
              const dotOp = interpolate(frame, [6 + i * 4, 14 + i * 4], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              return (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: accentColor,
                    boxShadow: `0 0 8px ${accentColor}`,
                    opacity: dotOp,
                  }}
                />
              );
            })}
          </div>
        );
      }

      case 'glow':
        return (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${accentColor}40, transparent)`,
              marginBottom: 4,
              opacity: progress,
              filter: 'blur(4px)',
            }}
          />
        );

      case 'gradient':
        return (
          <div
            style={{
              width: progress * 80,
              height: 3,
              background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
              borderRadius: 2,
              marginBottom: 8,
            }}
          />
        );

      case 'line':
      default:
        return (
          <div
            style={{
              width: progress * 60,
              height: 2,
              background: accentColor,
              borderRadius: 1,
              marginBottom: 8,
              boxShadow: `0 0 12px ${accentColor}`,
            }}
          />
        );
    }
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        opacity: containerOpacity,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          maxWidth: 900,
          padding: '0 60px',
        }}
      >
        {renderAccent()}
        {renderText()}

        {subtitle && (
          <div
            style={{
              fontSize: 18,
              color: colors.textMuted,
              fontFamily: fonts.mono,
              opacity: subtitleOp,
              letterSpacing: '0.01em',
              textAlign: 'center',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
