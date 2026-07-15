const rawApiBaseUrl = (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || '';
const normalizedApiBaseUrl = rawApiBaseUrl.trim().replace(/\/$/, '');

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  if (!normalizedApiBaseUrl) {
    return path;
  }

  return `${normalizedApiBaseUrl}${path}`;
}
