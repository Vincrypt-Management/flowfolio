import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig , Easing } from 'remotion';
import { colors } from '../styles';

type PopEffect = 'scale-pop' | 'glow-pulse' | 'color-surge' | 'lift-drop' | 'elastic';

interface PopWordProps {
  children: string;
  /** Frame at which the pop triggers */
  delay: number;
  /** Pop animation type */
  effect?: PopEffect;
  /** Accent color for glow/color effects */
  color?: string;
  /** Base font styles inherited from parent */
  style?: React.CSSProperties;
}

/**
 * Dopamine-hit word animation — makes key words visually POP
 * at a specific frame with spring physics and glow effects.
 */
export const PopWord: React.FC<PopWordProps> = ({
  children,
  delay,
  effect = 'scale-pop',
  color = colors.primary,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsed = Math.max(0, frame - delay);
  const active = frame >= delay;

  const baseOpacity = interpolate(frame, [delay - 8, delay + 12], [0.6, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
  });

  const getEffectStyle = (): React.CSSProperties => {
    switch (effect) {
      case 'scale-pop': {
        const s = active
          ? spring({ frame: elapsed, fps, config: { damping: 8, stiffness: 220, mass: 0.3 } })
          : 0;
        const scale = interpolate(s, [0, 1], [0.7, 1]);
        const overshoot = active && elapsed < 12
          ? interpolate(s, [0, 0.5, 1], [0, 0.15, 0])
          : 0;
        return {
          transform: `scale(${scale + overshoot})`,
          textShadow: active ? `0 0 ${12 + overshoot * 40}px ${color}50` : 'none',
          color: active ? color : undefined,
        };
      }

      case 'glow-pulse': {
        const glowIn = interpolate(elapsed, [0, 8], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
        });
        const pulse = active && elapsed > 8
          ? interpolate(Math.sin((elapsed - 8) / 8 * Math.PI * 2), [-1, 1], [0.4, 1])
          : glowIn;
        const glowRadius = 8 + pulse * 18;
        return {
          textShadow: active
            ? `0 0 ${glowRadius}px ${color}, 0 0 ${glowRadius * 2}px ${color}30`
            : 'none',
          color: active ? color : undefined,
        };
      }

      case 'color-surge': {
        const surge = interpolate(elapsed, [0, 6, 20], [0, 1, 0.85], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
        });
        const brightness = 1 + surge * 0.3;
        return {
          color: active ? color : undefined,
          filter: active ? `brightness(${brightness})` : undefined,
          textShadow: active ? `0 0 ${surge * 20}px ${color}60` : 'none',
        };
      }

      case 'lift-drop': {
        const s = active
          ? spring({ frame: elapsed, fps, config: { damping: 10, stiffness: 180, mass: 0.4 } })
          : 0;
        const lift = interpolate(s, [0, 0.5, 1], [0, -8, 0]);
        return {
          transform: `translateY(${lift}px)`,
          color: active ? color : undefined,
          textShadow: active ? `0 ${-lift * 0.5}px ${8 + Math.abs(lift)}px ${color}40` : 'none',
        };
      }

      case 'elastic': {
        const s = active
          ? spring({ frame: elapsed, fps, config: { damping: 6, stiffness: 260, mass: 0.25 } })
          : 0;
        const scaleX = interpolate(s, [0, 0.4, 0.7, 1], [0.5, 1.15, 0.95, 1]);
        const scaleY = interpolate(s, [0, 0.4, 0.7, 1], [1.3, 0.9, 1.05, 1]);
        return {
          transform: `scale(${scaleX}, ${scaleY})`,
          color: active ? color : undefined,
          textShadow: active ? `0 0 14px ${color}40` : 'none',
        };
      }

      default:
        return {};
    }
  };

  return (
    <span
      style={{
        display: 'inline-block',
        opacity: baseOpacity,
        transition: 'none',
        ...style,
        ...getEffectStyle(),
      }}
    >
      {children}
    </span>
  );
};
