const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const configured = (process.env.LOG_LEVEL as Level | undefined) ?? 'info';
const threshold = LEVELS[configured] ?? LEVELS.info;

function log(level: Level, message: string, meta?: unknown): void {
  if (LEVELS[level] < threshold) return;
  const line = { level, time: new Date().toISOString(), message };
  const payload = meta === undefined ? line : { ...line, meta };
  console[level === 'debug' ? 'log' : level](JSON.stringify(payload));
}

export const logger = {
  debug: (message: string, meta?: unknown) => log('debug', message, meta),
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta),
};
