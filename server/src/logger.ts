/**
 * Centralized structured logger for the backend.
 *
 * Mirrors the frontend logger shape:
 *   [YYYY-MM-DD HH:MM:SS] [section] [actor] [event]: message
 *
 * The PII flag is read from `FIRE_TOOLS_LOG_PII` (env). Anything other than
 * the literal string "1" / "true" disables PII logging. Defaults to off.
 *
 * Output goes to stderr so it never interferes with structured stdout (e.g.
 * when piped into another process).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogActor = 'user' | 'system';

export interface LogEntry {
  timestamp: string;
  section: string;
  actor: LogActor;
  event: string | null;
  level: LogLevel;
  message: string;
  pii?: unknown;
}

export interface LogOptions {
  level?: LogLevel;
  pii?: unknown;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

export const formatTimestamp = (date: Date = new Date()): string => {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

export const formatLogEntry = (entry: LogEntry): string => {
  const eventPart = entry.event ? ` [${entry.event}]` : '';
  return `[${entry.timestamp}] [${entry.section}] [${entry.actor}]${eventPart}: ${entry.message}`;
};

const isPiiLoggingEnabled = (): boolean => {
  const v = process.env.FIRE_TOOLS_LOG_PII;
  return v === '1' || v === 'true';
};

const writeLine = (level: LogLevel, line: string, pii?: unknown): void => {
  const suffix = pii !== undefined ? ` ${safeStringify(pii)}` : '';
  // Backend always uses stderr so structured stdout stays clean.
  const stream = process.stderr;
  stream.write(`${line}${suffix}\n`);
  // Silence unused-var lint when level isn't routed differently.
  void level;
};

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserialisable]';
  }
};

export const log = (
  section: string,
  actor: LogActor,
  event: string | null,
  message: string,
  opts: LogOptions = {},
): void => {
  const level: LogLevel = opts.level ?? 'info';
  const allowPii = isPiiLoggingEnabled();
  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    section,
    actor,
    event: event ?? null,
    level,
    message,
    ...(allowPii && opts.pii !== undefined ? { pii: opts.pii } : {}),
  };
  writeLine(level, formatLogEntry(entry), entry.pii);
};

export const logger = {
  log,
  systemEvent: (section: string, event: string | null, message: string, opts?: LogOptions) =>
    log(section, 'system', event, message, opts),
  warn: (section: string, event: string | null, message: string, opts?: Omit<LogOptions, 'level'>) =>
    log(section, 'system', event, message, { ...opts, level: 'warn' }),
  error: (section: string, event: string | null, message: string, opts?: Omit<LogOptions, 'level'>) =>
    log(section, 'system', event, message, { ...opts, level: 'error' }),
  debug: (section: string, event: string | null, message: string, opts?: Omit<LogOptions, 'level'>) =>
    log(section, 'system', event, message, { ...opts, level: 'debug' }),
};
