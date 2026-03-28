import { renderHook } from '@testing-library/react';
import { useSwipeNav } from '../../hooks/useSwipeNav';

// Helper: fire a pointer swipe on an element
function fireSwipe(
  el: HTMLElement,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration = 200,
) {
  const downEvent = new PointerEvent('pointerdown', {
    clientX: startX,
    clientY: startY,
    bubbles: true,
  });
  Object.defineProperty(downEvent, 'timeStamp', { value: 0 });

  const upEvent = new PointerEvent('pointerup', {
    clientX: endX,
    clientY: endY,
    bubbles: true,
  });
  Object.defineProperty(upEvent, 'timeStamp', { value: duration });

  el.dispatchEvent(downEvent);
  el.dispatchEvent(upEvent);
}

describe('useSwipeNav', () => {
  it('calls onNavigate with the next tab on swipe left', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'dashboard', onNavigate, true));

    fireSwipe(div, 200, 100, 100, 100); // swipe left: deltaX = -100
    expect(onNavigate).toHaveBeenCalledWith('vibe-studio');

    document.body.removeChild(div);
  });

  it('calls onNavigate with the previous tab on swipe right', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'vibe-studio', onNavigate, true));

    fireSwipe(div, 100, 100, 200, 100); // swipe right: deltaX = +100
    expect(onNavigate).toHaveBeenCalledWith('dashboard');

    document.body.removeChild(div);
  });

  it('does NOT navigate when swipe is more vertical than horizontal', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'dashboard', onNavigate, true));

    fireSwipe(div, 100, 100, 130, 200); // deltaX=30, deltaY=100 → mostly vertical
    expect(onNavigate).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('does NOT navigate when swipe distance is below threshold (60px)', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'dashboard', onNavigate, true));

    fireSwipe(div, 100, 100, 145, 102); // deltaX=45 < 60px threshold
    expect(onNavigate).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('does NOT navigate when enabled is false', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'dashboard', onNavigate, false));

    fireSwipe(div, 200, 100, 100, 100);
    expect(onNavigate).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('clamps at the first tab — swipe right on dashboard does nothing', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'dashboard', onNavigate, true));

    fireSwipe(div, 100, 100, 200, 100); // swipe right — already at first tab
    expect(onNavigate).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('clamps at the last tab — swipe left on settings does nothing', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const ref = { current: div };
    const onNavigate = vi.fn();

    renderHook(() => useSwipeNav(ref, 'settings', onNavigate, true));

    fireSwipe(div, 200, 100, 100, 100); // swipe left — already at last tab
    expect(onNavigate).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });
});
