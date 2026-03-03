import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { ToastProvider, useToast } from '../../components/Toast';

function toastWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ToastProvider, null, children);
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('addToast renders a toast message', () => {
    const { result } = renderHook(() => useToast(), { wrapper: toastWrapper });

    act(() => { result.current.addToast('Hello', 'success', 0); });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Hello');
    expect(result.current.toasts[0].type).toBe('success');
  });

  it('toast auto-dismisses after duration', () => {
    const { result } = renderHook(() => useToast(), { wrapper: toastWrapper });

    act(() => { result.current.addToast('Temp', 'info', 3000); });
    expect(result.current.toasts).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('multiple toasts can stack', () => {
    const { result } = renderHook(() => useToast(), { wrapper: toastWrapper });

    act(() => {
      result.current.addToast('First', 'success', 0);
      result.current.addToast('Second', 'error', 0);
      result.current.addToast('Third', 'warning', 0);
    });

    expect(result.current.toasts).toHaveLength(3);
  });

  it('removeToast removes a specific toast', () => {
    const { result } = renderHook(() => useToast(), { wrapper: toastWrapper });

    act(() => { result.current.addToast('Remove me', 'info', 0); });
    const id = result.current.toasts[0].id;

    act(() => { result.current.removeToast(id); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('different types render with correct class', () => {
    const { container } = render(
      React.createElement(ToastProvider, null,
        React.createElement(ToastConsumer)
      )
    );

    expect(container.querySelector('.toast-success')).toBeInTheDocument();
    expect(container.querySelector('.toast-error')).toBeInTheDocument();
  });

  it('close button dismisses toast', () => {
    render(
      React.createElement(ToastProvider, null,
        React.createElement(ToastConsumer)
      )
    );

    const closeButtons = screen.getAllByLabelText('Dismiss notification');
    expect(closeButtons.length).toBeGreaterThan(0);

    fireEvent.click(closeButtons[0]);
    // One toast should be removed
    const remaining = screen.getAllByRole('alert');
    expect(remaining.length).toBeLessThan(closeButtons.length);
  });
});

// Helper component that adds toasts on mount
function ToastConsumer() {
  const { addToast } = useToast();
  React.useEffect(() => {
    addToast('Success msg', 'success', 0);
    addToast('Error msg', 'error', 0);
  }, []);
  return null;
}
