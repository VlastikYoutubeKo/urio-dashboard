const CSRF_TOKEN_KEY = 'urio_csrf_token';
let inMemoryCsrfToken = null;

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

function getCsrfToken() {
  try {
    return sessionStorage.getItem(CSRF_TOKEN_KEY) || inMemoryCsrfToken;
  } catch {
    return inMemoryCsrfToken;
  }
}

export function rememberCsrfToken(token) {
  if (!token) return;
  inMemoryCsrfToken = token;
  try {
    sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  } catch {
    // Private browsing can deny storage. Keep the token in memory so requests
    // in this tab remain usable until the next bootstrap status response.
  }
}

function notifyUnauthorized() {
  window.dispatchEvent(new CustomEvent('urio:unauthorized'));
}

export async function apiFetch(path, options = {}) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    throw new TypeError('apiFetch only accepts relative /api/ paths.');
  }
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  const token = getCsrfToken();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && token) {
    headers.set('X-CSRF-Token', token);
  }

  const response = await fetch(path, {
    ...options,
    method,
    headers,
    // Keep cookies constrained even if a future caller supplies fetch options.
    credentials: 'same-origin',
  });
  rememberCsrfToken(response.headers.get('X-CSRF-Token'));
  if (response.status === 401) notifyUnauthorized();
  return response;
}

export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);
  let data = null;
  try {
    data = await response.json();
  } catch {
    // A proxy or server failure may not have a JSON body.
  }
  if (data?.csrf_token) rememberCsrfToken(data.csrf_token);
  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status}).`, response.status, data);
  }
  return data;
}

export function errorMessage(error, fallback = 'Something went wrong.') {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
