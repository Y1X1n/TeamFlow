import { getAccessToken, setAccessToken } from './token';
import { API_BASE } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Array<{ path: string; message: string }>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  auth?: boolean;
  retryAuth?: boolean;
}

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          setAccessToken(null);
          return null;
        }
        const data = (await response.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, auth = true, retryAuth = true } = options;
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (auth && token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  };

  let response = await doFetch();
  if (response.status === 401 && auth && retryAuth) {
    const token = await refreshAccessToken();
    if (token) response = await doFetch();
  }

  if (!response.ok) {
    let payload: {
      code?: string;
      detail?: string;
      title?: string;
      errors?: Array<{ path: string; message: string }>;
      requestId?: string;
    } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = {};
    }
    throw new ApiError(
      response.status,
      payload.code ?? 'INTERNAL_ERROR',
      payload.detail ?? payload.title ?? '请求失败',
      payload.errors,
      payload.requestId,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function loginRequest(email: string, password: string) {
  const session = await api<{
    user: import('./types').User;
    accessToken: string;
    expiresIn: number;
  }>('/auth/login', { method: 'POST', body: { email, password }, auth: false });
  setAccessToken(session.accessToken);
  return session;
}

export async function registerRequest(name: string, email: string, password: string) {
  const session = await api<{
    user: import('./types').User;
    accessToken: string;
    expiresIn: number;
  }>('/auth/register', { method: 'POST', body: { name, email, password }, auth: false });
  setAccessToken(session.accessToken);
  return session;
}
