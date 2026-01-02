/**
 * Professional Logger for FlowFolio Frontend
 * Structured logging with timestamps and log levels
 */

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}

interface LogConfig {
  minLevel: LogLevel;
  includeTimestamp: boolean;
  includeModule: boolean;
}

const config: LogConfig = {
  minLevel: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.INFO,
  includeTimestamp: true,
  includeModule: true,
};

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: string, module: string, message: string, _data?: unknown): string {
  const parts: string[] = [];
  
  if (config.includeTimestamp) {
    parts.push(`[${formatTimestamp()}]`);
  }
  
  parts.push(`[${level}]`);
  
  if (config.includeModule && module) {
    parts.push(`[${module}]`);
  }
  
  parts.push(message);
  
  return parts.join(' ');
}

class Logger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  trace(message: string, data?: unknown): void {
    if (config.minLevel <= LogLevel.TRACE) {
      console.debug(formatMessage('TRACE', this.module, message), data ?? '');
    }
  }

  debug(message: string, data?: unknown): void {
    if (config.minLevel <= LogLevel.DEBUG) {
      console.debug(formatMessage('DEBUG', this.module, message), data ?? '');
    }
  }

  info(message: string, data?: unknown): void {
    if (config.minLevel <= LogLevel.INFO) {
      console.info(formatMessage('INFO', this.module, message), data ?? '');
    }
  }

  warn(message: string, data?: unknown): void {
    if (config.minLevel <= LogLevel.WARN) {
      console.warn(formatMessage('WARN', this.module, message), data ?? '');
    }
  }

  error(message: string, data?: unknown): void {
    if (config.minLevel <= LogLevel.ERROR) {
      console.error(formatMessage('ERROR', this.module, message), data ?? '');
    }
  }
}

/**
 * Create a logger instance for a specific module
 * @param module - Module name for log context
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

/**
 * Set minimum log level
 */
export function setLogLevel(level: LogLevel): void {
  config.minLevel = level;
}

// Default logger for quick usage
export const logger = createLogger('app');

export default { createLogger, setLogLevel, LogLevel, logger };
