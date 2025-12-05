/**
 * Logging infrastructure.
 * Uses Winston on Node.js, console on Cloudflare Workers.
 */

// Detect Cloudflare Workers runtime (no process.versions.node, has caches global)
const isCloudflare = typeof process === 'undefined' ||
  (typeof globalThis !== 'undefined' && 'caches' in globalThis && !process?.versions?.node);

// Determine environment
const isProduction = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
const isTest = typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || process.env?.VITEST === 'true');
const logLevel = (typeof process !== 'undefined' && process.env?.LOG_LEVEL) || (isProduction ? 'info' : 'debug');

// Simple logger interface
interface SimpleLogger {
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
  child(meta: Record<string, unknown>): SimpleLogger;
}

// Create a simple console-based logger for Cloudflare
function createSimpleLogger(): SimpleLogger {
  const formatMeta = (meta?: Record<string, unknown>) =>
    meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';

  return {
    error: (msg, meta) => console.error(`[ERROR] ${msg}${formatMeta(meta)}`),
    warn: (msg, meta) => console.warn(`[WARN] ${msg}${formatMeta(meta)}`),
    info: (msg, meta) => console.info(`[INFO] ${msg}${formatMeta(meta)}`),
    debug: (msg, meta) => logLevel === 'debug' && console.debug(`[DEBUG] ${msg}${formatMeta(meta)}`),
    log: (level, msg, meta) => console.log(`[${level.toUpperCase()}] ${msg}${formatMeta(meta)}`),
    child: () => createSimpleLogger(),
  };
}

// Create logger based on environment
let logger: SimpleLogger;

if (isCloudflare) {
  // Use simple console logger on Cloudflare Workers
  logger = createSimpleLogger();
} else {
  // Use Winston on Node.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const winston = require('winston');
  const { combine, timestamp, printf, colorize, json, errors } = winston.format;

  // Custom format for development (colorized, human-readable)
  const devFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ level, message, timestamp, ...meta }: { level: string; message: string; timestamp: string; [key: string]: unknown }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level}]: ${message}${metaStr}`;
    })
  );

  // JSON format for production (structured, machine-parseable)
  const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
  );

  // Create transports based on environment
  const transports: unknown[] = [];

  if (!isTest) {
    // Console transport (always, except in tests)
    transports.push(
      new winston.transports.Console({
        format: isProduction ? prodFormat : devFormat,
        level: logLevel,
      })
    );

    // File transports for production (Node.js only, not Cloudflare)
    if (isProduction && !isCloudflare) {
      // Error log (errors only)
      transports.push(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: prodFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        })
      );

      // Combined log (all levels)
      transports.push(
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: prodFormat,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        })
      );
    }
  } else {
    // Silent transport for tests (can be enabled via LOG_LEVEL=debug)
    transports.push(
      new winston.transports.Console({
        silent: process.env.LOG_LEVEL !== 'debug',
        format: devFormat,
      })
    );
  }

  // Create the winston logger instance
  logger = winston.createLogger({
    level: logLevel,
    defaultMeta: { service: 'cardshub' },
    transports,
    exitOnError: false,
  });
}

// Export the logger
export default logger;

// Named exports for convenience
export const log = logger;

/**
 * Create a child logger with additional context.
 * Useful for adding request ID, user ID, etc.
 */
export function createChildLogger(meta: Record<string, unknown>): SimpleLogger {
  return logger.child(meta);
}

/**
 * Log levels reference:
 * - error: Error conditions (500 errors, exceptions)
 * - warn: Warning conditions (rate limits, deprecations)
 * - info: Informational messages (request completed, user action)
 * - http: HTTP request logging
 * - verbose: Verbose informational messages
 * - debug: Debug-level messages (detailed flow)
 * - silly: Extremely detailed debugging
 */

// Convenience functions with request context
export interface RequestContext {
  requestId?: string;
  userId?: string;
  ip?: string;
  method?: string;
  path?: string;
}

export function logRequest(ctx: RequestContext, message: string, meta?: Record<string, unknown>): void {
  logger.info(message, { ...ctx, ...meta });
}

export function logError(ctx: RequestContext, error: Error | string, meta?: Record<string, unknown>): void {
  if (error instanceof Error) {
    logger.error(error.message, { ...ctx, ...meta, stack: error.stack });
  } else {
    logger.error(error, { ...ctx, ...meta });
  }
}

export function logWarn(ctx: RequestContext, message: string, meta?: Record<string, unknown>): void {
  logger.warn(message, { ...ctx, ...meta });
}

export function logDebug(ctx: RequestContext, message: string, meta?: Record<string, unknown>): void {
  logger.debug(message, { ...ctx, ...meta });
}

// API request logging helper
export function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  meta?: Record<string, unknown>
): void {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  logger.log(level, `${method} ${path} ${statusCode} ${durationMs}ms`, {
    method,
    path,
    statusCode,
    durationMs,
    ...meta,
  });
}

// Auth event logging
export function logAuthEvent(
  event: 'login' | 'logout' | 'register' | 'login_failed' | 'password_reset',
  userId?: string,
  meta?: Record<string, unknown>
): void {
  const level = event === 'login_failed' ? 'warn' : 'info';
  logger.log(level, `Auth event: ${event}`, { event, userId, ...meta });
}

// Rate limit logging
export function logRateLimit(
  clientId: string,
  endpoint: string,
  allowed: boolean,
  remaining: number
): void {
  if (!allowed) {
    logger.warn('Rate limit exceeded', { clientId, endpoint, remaining });
  } else if (remaining <= 5) {
    logger.debug('Rate limit approaching', { clientId, endpoint, remaining });
  }
}
