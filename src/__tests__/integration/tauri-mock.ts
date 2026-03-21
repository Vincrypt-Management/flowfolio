import { vi } from 'vitest';

// Map of command name to handler function
type CommandHandler = (args?: Record<string, unknown>) => unknown;
const commandHandlers = new Map<string, CommandHandler>();

export function mockTauriCommand(command: string, handler: CommandHandler) {
  commandHandlers.set(command, handler);
}

export function clearTauriMocks() {
  commandHandlers.clear();
}

// Setup: mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    const handler = commandHandlers.get(cmd);
    if (!handler) throw new Error(`Unmocked Tauri command: ${cmd}`);
    return handler(args);
  }),
}));
