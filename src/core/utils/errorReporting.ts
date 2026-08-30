/** Client-side error reporting — never log secrets or tokens. */

const MAX_RECENT = 50;
const recent: Array<{ at: string; message: string; module?: string }> = [];

function sanitizeMessage(msg: string): string {
  return msg
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/("pin"|"password")\s*:\s*"[^"]*"/gi, '$1:"[REDACTED]"');
}

export function reportClientError(
  error: unknown,
  context?: { module?: string; componentStack?: string }
) {
  const message =
    error instanceof Error ? sanitizeMessage(error.message) : sanitizeMessage(String(error));
  const entry = {
    at: new Date().toISOString(),
    message,
    module: context?.module,
  };
  recent.push(entry);
  if (recent.length > MAX_RECENT) recent.shift();

  console.error('[ERP Error]', context?.module ?? 'app', message, context?.componentStack ?? '');

  window.dispatchEvent(
    new CustomEvent('erp:error', { detail: { ...entry, stack: error instanceof Error ? error.stack : undefined } })
  );
}

export function getRecentClientErrors() {
  return [...recent];
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    reportClientError(event.error ?? event.message, { module: 'window' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, { module: 'promise' });
    event.preventDefault();
  });
}
