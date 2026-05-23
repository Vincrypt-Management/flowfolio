import { invokeWithResilience } from './apiClient';
import { DEFAULT_FREE_MODEL, isValidFreeModel } from '../constants/freeModels';

let cached: string | null = null;

export async function getSelectedModel(): Promise<string> {
  if (cached !== null) return cached;
  try {
    const stored = await invokeWithResilience<string | null>('load_setting', { key: 'ai_model' });
    cached = stored && isValidFreeModel(stored) ? stored : DEFAULT_FREE_MODEL;
  } catch {
    cached = DEFAULT_FREE_MODEL;
  }
  return cached;
}

export async function setSelectedModel(id: string): Promise<void> {
  await invokeWithResilience('save_setting', { key: 'ai_model', value: id });
  cached = id;
}

export function clearModelCache(): void {
  cached = null;
}
