/**
 * Backend API base URL (includes /api context path, no trailing slash).
 * Desktop Electron loads UI from http://localhost:8080/api — requests must use the
 * same origin, not http://127.0.0.1:8080, or the browser blocks them (Failed to fetch).
 */
export function getBackendUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const { origin, port } = window.location;
    // UI served by Spring Boot embedded static (desktop installer / prod jar)
    if (port === '8080') {
      return `${origin}/api`;
    }
  }

  const stored = localStorage.getItem('BACKEND_URL');
  if (stored?.trim()) {
    return stored.replace(/\/$/, '');
  }

  return 'http://localhost:8080/api';
}
