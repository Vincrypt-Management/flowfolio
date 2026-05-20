let activeStop: (() => void) | null = null;

export function claim(stop: () => void): void {
  if (activeStop && activeStop !== stop) activeStop();
  activeStop = stop;
}

export function release(stop: () => void): void {
  if (activeStop === stop) activeStop = null;
}

/** Test-only: reset module state between tests. Not exported from index. */
export function _resetForTests(): void {
  activeStop = null;
}
