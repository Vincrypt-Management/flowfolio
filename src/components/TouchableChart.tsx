import React from 'react';
import { ResponsiveContainer } from 'recharts';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useMediaQuery } from '../shared/hooks/index';

interface TouchableChartProps {
  height: number;
  className?: string;
  children: React.ReactNode;
}

function forwardTouchAsMouseMove(e: React.TouchEvent<HTMLDivElement>) {
  const touch = e.touches[0];
  if (!touch) return;
  const syntheticEvent = new MouseEvent('mousemove', {
    clientX: touch.clientX,
    clientY: touch.clientY,
    bubbles: true,
  });
  e.currentTarget.dispatchEvent(syntheticEvent);
}

export function TouchableChart({ height, className, children }: TouchableChartProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (!isMobile) {
    return (
      <div className={className}>
        <ResponsiveContainer width="100%" height={height}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className={className}>
      <TransformWrapper
        panning={{ disabled: false }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: true }}
        limitToBounds={false}
      >
        <TransformComponent>
          <div onTouchMove={forwardTouchAsMouseMove}>
            <ResponsiveContainer width="100%" height={height}>
              {children as React.ReactElement}
            </ResponsiveContainer>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
