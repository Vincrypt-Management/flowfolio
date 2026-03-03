import { describe, it, expect } from 'vitest';
import { createLogger, setLogLevel, LogLevel } from '../../core/logger/index';

describe('Logger', () => {
  it('createLogger returns a logger object', () => {
    const logger = createLogger('test-module');
    expect(logger).toBeDefined();
    expect(typeof logger).toBe('object');
  });

  it('logger has trace, debug, info, warn, error methods', () => {
    const logger = createLogger('test-module');
    expect(typeof logger.trace).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('logger methods do not throw', () => {
    const logger = createLogger('test-module');
    expect(() => logger.trace('trace msg')).not.toThrow();
    expect(() => logger.debug('debug msg')).not.toThrow();
    expect(() => logger.info('info msg')).not.toThrow();
    expect(() => logger.warn('warn msg')).not.toThrow();
    expect(() => logger.error('error msg')).not.toThrow();
  });

  it('logger methods accept data argument', () => {
    const logger = createLogger('test-module');
    expect(() => logger.info('with data', { key: 'value' })).not.toThrow();
    expect(() => logger.error('with error', new Error('test'))).not.toThrow();
  });

  it('setLogLevel changes log level without throwing', () => {
    expect(() => setLogLevel(LogLevel.ERROR)).not.toThrow();
    expect(() => setLogLevel(LogLevel.TRACE)).not.toThrow();
  });

  it('LogLevel enum has expected values', () => {
    expect(LogLevel.TRACE).toBe(0);
    expect(LogLevel.DEBUG).toBe(1);
    expect(LogLevel.INFO).toBe(2);
    expect(LogLevel.WARN).toBe(3);
    expect(LogLevel.ERROR).toBe(4);
  });
});
