import { useRef, useEffect } from 'react';

/**
 * Returns a ref that tracks whether the component is currently mounted.
 * Use to guard async state updates after unmount.
 */
export function useIsMounted() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}
