/**
 * Backend API base URL (includes /api context path, no trailing slash).
 * The SPA is always built into the Spring Boot jar's static resources (see vite.config.ts
 * outDir) and served same-origin as the API — true for the desktop installer (localhost:8080),
 * a production deploy behind a PaaS domain on 443 (e.g. Railway), or any reverse proxy. Only
 * the Vite dev server (default port 5173) runs the UI on a different origin than the backend.
 */
export function getBackendUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    // import.meta.env.DEV is a Vite build-time constant: true only for `npm run dev`.
    if (!import.meta.env.DEV) {
      return `${window.location.origin}/api`;
    }
  }

  const stored = localStorage.getItem('BACKEND_URL');
  if (stored?.trim()) {
    return stored.replace(/\/$/, '');
  }

  return 'http://localhost:8080/api';
}
