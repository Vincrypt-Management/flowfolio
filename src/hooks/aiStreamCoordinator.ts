let activeStop: (() => void) | null = null;

export function claim(stop: () => void): void {
  const prior = activeStop;
  activeStop = stop;
  if (prior && prior !== stop) prior();
}

export function release(stop: () => void): void {
  if (activeStop === stop) activeStop = null;
}

/** Test-only: reset module state between tests. Not exported from index. */
export function _resetForTests(): void {
  activeStop = null;
}
