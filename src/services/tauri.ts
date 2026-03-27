import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

export const isTauriContext = (): boolean => {
  return typeof window !== 'undefined' && 
         '__TAURI_INTERNALS__' in window && 
         window.__TAURI_INTERNALS__ !== undefined;
};

/** Returns true when running on Android or iOS. */
export async function isMobile(): Promise<boolean> {
  if (!isTauriContext()) return false;
  try {
    const p = await platform();
    return p === 'android' || p === 'ios';
  } catch {
    return false;
  }
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriContext()) {
    throw new Error('This application must be run as a Tauri desktop app, not in a web browser. Please use `npm run dev` (or `npm run tauri dev`) to start the desktop application.');
  }
  return tauriInvoke<T>(cmd, args);
}
