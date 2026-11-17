/**
 * Error monitoring (Sentry) for the ERP web app (Railway) and the desktop build (served from localhost).
 * The DSN is a public, write-only key; VITE_SENTRY_DSN overrides it at build time (empty string disables).
 * Errors reach Sentry through reportClientError() (errorReporting.ts), which already owns the
 * window "error" / "unhandledrejection" listeners, so Sentry's own global handlers are turned off.
 */
import * as Sentry from '@sentry/react';

const env = import.meta.env as Record<string, string | boolean | undefined>;
const DSN =
  (env.VITE_SENTRY_DSN as string | undefined) ??
  'https://fb9f72682a0a2662884abb34b9f0772f@o4512447745818624.ingest.de.sentry.io/4512447896813648';

const isLocalHost = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export const sentryEnabled = Boolean(import.meta.env.PROD && DSN);

/** Same redaction rules as the in-app error log: never send tokens, PINs or passwords. */
export function scrub(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/("pin"|"password"|"newPin"|"currentPin")\s*:\s*"[^"]*"/gi, '$1:"[REDACTED]"');
}

if (sentryEnabled) {
  Sentry.init({
    dsn: DSN,
    // The desktop app loads the UI from its bundled local backend (http://localhost:8080).
    environment: (env.VITE_SENTRY_ENVIRONMENT as string | undefined) || (isLocalHost ? 'desktop' : 'production'),
    integrations: (defaults) => defaults.filter((i) => i.name !== 'GlobalHandlers'),
    tracesSampleRate: 0,
    initialScope: { tags: { app: 'animasys-web' } },
    ignoreErrors: ['ResizeObserver loop', /^Load failed$/, /Failed to fetch dynamically imported module/],
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-web-extension:\/\//],
    beforeSend(event) {
      for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = scrub(ex.value);
      }
      if (event.message) event.message = scrub(event.message);
      return event;
    },
    beforeBreadcrumb(crumb) {
      if (crumb.message) crumb.message = scrub(crumb.message);
      return crumb;
    },
  });
}

export { Sentry };
