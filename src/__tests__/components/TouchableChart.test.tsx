import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock useMediaQuery to control desktop vs mobile mode
vi.mock('../../shared/hooks/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/hooks/index')>();
  return { ...actual, useMediaQuery: vi.fn(() => false) }; // default: desktop
});

// Mock react-zoom-pan-pinch
vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="transform-wrapper">{children}</div>
  ),
  TransformComponent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="transform-component">{children}</div>
  ),
}));

// Mock recharts ResponsiveContainer (jsdom has no layout)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children, height }: { children: React.ReactNode; height: number }) => (
    <div data-testid="responsive-container" data-height={height}>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
}));

import { TouchableChart } from '../../components/TouchableChart';
import { useMediaQuery } from '../../shared/hooks/index';

describe('TouchableChart', () => {
  it('renders ResponsiveContainer with correct height on desktop', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
    render(
      <TouchableChart height={300}>
        <div data-testid="chart-child" />
      </TouchableChart>
    );
    const container = screen.getByTestId('responsive-container');
    expect(container).toBeInTheDocument();
    expect(container.getAttribute('data-height')).toBe('300');
    expect(screen.queryByTestId('transform-wrapper')).not.toBeInTheDocument();
  });

  it('renders TransformWrapper on mobile', () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    render(
      <TouchableChart height={200}>
        <div data-testid="chart-child" />
      </TouchableChart>
    );
    expect(screen.getByTestId('transform-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('transform-component')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('renders children in both modes', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
    render(
      <TouchableChart height={300}>
        <div data-testid="chart-child" />
      </TouchableChart>
    );
    expect(screen.getByTestId('chart-child')).toBeInTheDocument();
  });

  it('accepts optional className', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
    const { container } = render(
      <TouchableChart height={300} className="my-chart">
        <div />
      </TouchableChart>
    );
    expect(container.firstChild).toHaveClass('my-chart');
  });
});
