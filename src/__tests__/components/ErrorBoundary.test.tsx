import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../components/ErrorBoundary';

function GoodChild() {
  return React.createElement('div', null, 'All good');
}

function BadChild(): React.ReactElement {
  throw new Error('Test explosion');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error', () => {
    render(
      React.createElement(ErrorBoundary, null,
        React.createElement(GoodChild)
      )
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('catches errors and shows error UI', () => {
    render(
      React.createElement(ErrorBoundary, null,
        React.createElement(BadChild)
      )
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test explosion')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    const fallback = React.createElement('div', null, 'Custom fallback');
    render(
      React.createElement(ErrorBoundary, { fallback },
        React.createElement(BadChild)
      )
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
  });

  it('Try Again button resets error state', () => {
    let shouldThrow = true;

    function ConditionalChild(): React.ReactElement {
      if (shouldThrow) throw new Error('Boom');
      return React.createElement('div', null, 'Recovered');
    }

    render(
      React.createElement(ErrorBoundary, null,
        React.createElement(ConditionalChild)
      )
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText('Try Again'));

    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});
