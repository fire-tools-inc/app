/**
 * Centralized structured logger.
 *
 * Format: `[YYYY-MM-DD HH:MM:SS] [section] [actor] [event]: message`
 * - The `[event]` segment is omitted when no event tag is supplied.
 *
 * Privacy model:
 * - Financial / portfolio data (tickers, quantities, account names, amounts,
 *   currency totals, etc.) is treated as PII and is NEVER included in log
 *   output unless `loggingPiiEnabled` is explicitly turned on in user
 *   settings. The flag defaults to `false`.
 * - PII payloads passed via `opts.pii` are silently dropped when the flag is
 *   off. Callers are expected to keep PII out of the free-text `message`
 *   field and place it in `opts.pii` instead.
 * - Logs are kept in-memory only and are never sent anywhere automatically.
 *   The user can choose to export them (sanitised) via the Settings page.
 */
import { loadSettings } from './cookieSettings';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogActor = 'user' | 'system';

export interface LogEntry {
  timestamp: string;
  section: string;
  actor: LogActor;
  event: string | null;
  level: LogLevel;
  message: string;
  /** Present only when PII logging is enabled. Never serialised otherwise. */
  pii?: unknown;
}

export interface LogOptions {
  level?: LogLevel;
  /** Optional PII payload — only retained when the PII flag is on. */
  pii?: unknown;
}

const MAX_BUFFER_SIZE = 1000;
const buffer: LogEntry[] = [];

/**
 * Lazily read the PII flag. Wrapped so a corrupt cookie can never throw
 * out of the logger itself — we fail closed (no PII) on any error.
 */
const isPiiLoggingEnabled = (): boolean => {
  try {
    return Boolean(loadSettings().loggingPiiEnabled);
  } catch {
    return false;
  }
};

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

const pushEntry = (entry: LogEntry): void => {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
  }
};

const mirrorToConsole = (entry: LogEntry): void => {
  const line = formatLogEntry(entry);
  switch (entry.level) {
    case 'error':
      console.error(line, entry.pii !== undefined ? entry.pii : '');
      break;
    case 'warn':
      console.warn(line, entry.pii !== undefined ? entry.pii : '');
      break;
    case 'debug':
      console.debug(line, entry.pii !== undefined ? entry.pii : '');
      break;
    case 'info':
    default:
      console.info(line, entry.pii !== undefined ? entry.pii : '');
      break;
  }
};

/**
 * Core log function. All convenience helpers funnel through here.
 *
 * @param section   App section / module (e.g. `'asset-allocation'`).
 * @param actor     `'user'` for actions driven by the user, `'system'` otherwise.
 * @param event     Short event tag (or null).
 * @param message   Human-readable message. MUST NOT contain PII — keep PII in `opts.pii`.
 * @param opts      Level + optional PII payload.
 */
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
  pushEntry(entry);
  mirrorToConsole(entry);
};

export const logger = {
  log,

  userAction: (section: string, event: string, message: string, opts?: LogOptions) =>
    log(section, 'user', event, message, opts),

  systemEvent: (section: string, event: string | null, message: string, opts?: LogOptions) =>
    log(section, 'system', event, message, opts),

  warn: (section: string, event: string | null, message: string, opts?: Omit<LogOptions, 'level'>) =>
    log(section, 'system', event, message, { ...opts, level: 'warn' }),

  error: (section: string, event: string | null, message: string, opts?: Omit<LogOptions, 'level'>) =>
    log(section, 'system', event, message, { ...opts, level: 'error' }),

  debug: (section: string, event: string | null, message: string, opts?: Omit<LogOptions, 'level'>) =>
    log(section, 'system', event, message, { ...opts, level: 'debug' }),
};

/** Return a shallow copy of the in-memory log buffer. */
export const getLogBuffer = (): LogEntry[] => buffer.slice();

/** Clear the in-memory log buffer. Used by tests and by the Settings page. */
export const clearLogBuffer = (): void => {
  buffer.length = 0;
};

/**
 * Render the buffer as a plain-text log suitable for attaching to a bug
 * report. The PII field is only included when PII logging was enabled at
 * the time the entry was recorded (i.e. when `entry.pii` is set).
 */
export const exportLogsAsText = (): string => {
  if (buffer.length === 0) {
    return '# fire-tools diagnostic log\n# (no entries)\n';
  }
  const header = [
    '# fire-tools diagnostic log',
    `# generated: ${formatTimestamp()}`,
    `# entries: ${buffer.length}`,
    '# Note: financial PII is excluded unless you enabled "PII logging" in Settings.',
    '',
  ].join('\n');
  const body = buffer
    .map((entry) => {
      const base = formatLogEntry(entry);
      if (entry.pii !== undefined) {
        try {
          return `${base}\n  pii: ${JSON.stringify(entry.pii)}`;
        } catch {
          return `${base}\n  pii: [unserialisable]`;
        }
      }
      return base;
    })
    .join('\n');
  return `${header}${body}\n`;
};

/**
 * Trigger a browser download of the diagnostic log as a `.txt` file.
 * Safe to call from a click handler.
 */
export const downloadLogs = (filename = 'fire-tools-logs.txt'): void => {
  const text = exportLogsAsText();
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
