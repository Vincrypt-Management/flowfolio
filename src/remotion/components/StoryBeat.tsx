import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame , Easing } from 'remotion';
import { colors, fonts } from '../styles';
import type { AnimationStyle } from '../lib/contentPools';
import { PopWord } from './PopWord';

/**
 * Map of scene-specific "pop words" — key phrases that get a dopamine-hit animation.
 * Matches are case-insensitive substring checks against the beat line.
 */
const POP_WORD_MAP: { match: string; words: string[]; effect: 'scale-pop' | 'glow-pulse' | 'color-surge' | 'lift-drop' | 'elastic' }[] = [
  { match: 'bigger picture', words: ['bigger', 'picture'], effect: 'scale-pop' },
  { match: 'matters', words: ['matters'], effect: 'glow-pulse' },
  { match: 'philosophy', words: ['philosophy'], effect: 'color-surge' },
  { match: 'thesis', words: ['thesis'], effect: 'lift-drop' },
  { match: 'convictions', words: ['convictions,'], effect: 'elastic' },
  { match: 'come alive', words: ['alive.'], effect: 'scale-pop' },
  { match: 'seconds', words: ['seconds.'], effect: 'elastic' },
  { match: 'at a glance', words: ['glance.'], effect: 'glow-pulse' },
  { match: "don't guess", words: ['guess.'], effect: 'scale-pop' },
  { match: 'prove it', words: ['Prove', 'it.'], effect: 'elastic' },
  { match: 'laboratory', words: ['laboratory.'], effect: 'glow-pulse' },
  { match: 'find out', words: ['Find', 'out.'], effect: 'scale-pop' },
  { match: 'every number', words: ['every', 'number.'], effect: 'lift-drop' },
  { match: 'quantify', words: ['Quantify'], effect: 'elastic' },
  { match: "don't lie", words: ["don't", 'lie.'], effect: 'scale-pop' },
  { match: 'clear picture', words: ['clear', 'picture.'], effect: 'glow-pulse' },
  { match: 'sharpen', words: ['sharpen'], effect: 'lift-drop' },
  { match: 'without overthinking', words: ['overthinking.'], effect: 'color-surge' },
  { match: 'instantly', words: ['instantly.'], effect: 'elastic' },
  { match: 'intelligence', words: ['intelligence.'], effect: 'glow-pulse' },
  { match: 'every decision', words: ['every', 'decision.'], effect: 'scale-pop' },
  { match: 'why,', words: ['why,'], effect: 'lift-drop' },
  { match: 'every trade', words: ['every', 'trade.'], effect: 'glow-pulse' },
  { match: 'ask anything', words: ['anything.'], effect: 'scale-pop' },
  { match: 'on demand', words: ['demand.'], effect: 'elastic' },
  { match: 'compound', words: ['compound.'], effect: 'glow-pulse' },
  { match: 'knows your', words: ['knows'], effect: 'color-surge' },
];

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

  const fadeIn = interpolate(frame, [0, 36], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(frame, [duration - 18, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });
  const containerOpacity = Math.min(fadeIn, fadeOut);

  const subtitleOp = subtitle
    ? interpolate(frame, [28, 60], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
      })
    : 0;

  // ─── Animation Style Rendering ────────────────────────────────
  // Find matching pop-word config for this line
  const lineLower = line.toLowerCase();
  const popConfig = POP_WORD_MAP.find((p) => lineLower.includes(p.match));

  /** Wrap a word with PopWord if it matches, otherwise return plain span */
  const renderWord = (word: string, baseDelay: number, _wordStyle?: React.CSSProperties) => {
    if (popConfig && popConfig.words.some((pw) => word.toLowerCase() === pw.toLowerCase() || word === pw)) {
      return (
        <PopWord delay={baseDelay + 6} effect={popConfig.effect} color={accentColor}>
          {word}
        </PopWord>
      );
    }
    return <>{word}</>;
  };

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
              const wordStart = 15 + i * 8;
              const wordOp = interpolate(frame, [wordStart, wordStart + 8], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              easing: Easing.out(Easing.cubic),
              });
              const wordY = interpolate(frame, [wordStart, wordStart + 8], [8, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              easing: Easing.out(Easing.cubic),
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
                  {renderWord(word, wordStart)}
                </span>
              );
            })}
          </div>
        );

      case 'scale-in': {
        const scale = interpolate(frame, [0, 40], [0.85, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
        });
        const scaleOp = interpolate(frame, [0, 39], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
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
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '0 10px',
            }}
          >
            {words.map((word, i) => (
              <span key={i} style={{ display: 'inline-block' }}>
                {renderWord(word, 10 + i * 8)}
              </span>
            ))}
          </div>
        );
      }

      case 'typewriter': {
        const charsVisible = Math.floor(
          interpolate(frame, [4, 4 + line.length * 1.2], [0, line.length], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          easing: Easing.out(Easing.cubic),
          })
        );
        const cursorOp = frame % 32 < 10 ? 1 : 0;
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
        const y = interpolate(frame, [0, 36], [12, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
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
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '0 10px',
            }}
          >
            {words.map((word, i) => (
              <span key={i} style={{ display: 'inline-block' }}>
                {renderWord(word, 12 + i * 8)}
              </span>
            ))}
          </div>
        );
      }
    }
  };

  // ─── Accent Decoration Variants ───────────────────────────────
  const renderAccent = () => {
    const progress = interpolate(frame, [12, 48], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
    });

    switch (accentVariant) {
      case 'dots': {
        const dotCount = 3;
        return (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {Array.from({ length: dotCount }).map((_, i) => {
              const dotOp = interpolate(frame, [6 + i * 8, 14 + i * 8], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              easing: Easing.out(Easing.cubic),
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
