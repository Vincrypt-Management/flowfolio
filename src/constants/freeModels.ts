export interface FreeModel {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  recommended?: boolean;
}

export const FREE_MODELS: FreeModel[] = [
  {
    id: 'openrouter/owl-alpha',
    name: 'OWL Alpha',
    description: "OpenRouter's auto-routing model — picks the best available free provider for each request.",
    contextWindow: 131072,
    recommended: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B',
    description: "Meta's flagship open model. Best balance of quality and reliability.",
    contextWindow: 131072,
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash',
    description: "Google's fast model with a massive 1M token context.",
    contextWindow: 1048576,
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1',
    description: 'Strong chain-of-thought reasoning for complex analysis.',
    contextWindow: 163840,
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324:free',
    name: 'DeepSeek V3',
    description: 'Fast and capable instruction-following model.',
    contextWindow: 163840,
  },
  {
    id: 'mistralai/mistral-7b-instruct:free',
    name: 'Mistral 7B',
    description: 'Lightweight and fast. Good for quick analyses.',
    contextWindow: 32768,
  },
  {
    id: 'qwen/qwen3-8b:free',
    name: 'Qwen3 8B',
    description: "Alibaba's compact model with solid instruction following.",
    contextWindow: 131072,
  },
  {
    id: 'microsoft/phi-4-reasoning:free',
    name: 'Phi-4 Reasoning',
    description: "Microsoft's reasoning-focused small model.",
    contextWindow: 16384,
  },
  {
    id: 'google/gemma-3-27b-it:free',
    name: 'Gemma 3 27B',
    description: "Google's open-weights model, strong general performance.",
    contextWindow: 131072,
  },
];

export const DEFAULT_FREE_MODEL = 'openrouter/owl-alpha';

export function isValidFreeModel(id: string): boolean {
  return FREE_MODELS.some(m => m.id === id);
}
