import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./tokenStore";
import type { ApiErrorBody, LoginResponse } from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.status = status;
    this.details = body.details;
  }
}

let onPasswordChangeRequired: (() => void) | null = null;

/** Registers the callback run when the server answers 403 PASSWORD_CHANGE_REQUIRED. */
export function setPasswordChangeRequiredHandler(handler: (() => void) | null): void {
  onPasswordChangeRequired = handler;
}

function toApiError(status: number, body: ApiErrorBody): ApiError {
  if (body.code === "PASSWORD_CHANGE_REQUIRED") onPasswordChangeRequired?.();
  return new ApiError(status, body);
}

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const json = (await res.json()) as { data: LoginResponse };
    setTokens(json.data.access_token, json.data.refresh_token);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  auth?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

async function rawRequest(path: string, opts: RequestOptions, retry: boolean): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && opts.auth !== false && retry) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      return rawRequest(path, opts, false);
    }
  }

  return res;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(path, opts, true);

  if (res.status === 204) {
    return undefined as T;
  }

  let json: { data?: T; error?: ApiErrorBody } | undefined;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const body = json?.error ?? { code: "INTERNAL", message: res.statusText || "Request failed" };
    throw toApiError(res.status, body);
  }

  return json?.data as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) =>
    apiRequest<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  del: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

export async function downloadCsv(path: string, query: Record<string, string>): Promise<void> {
  const res = await rawRequest(path, { method: "GET", query }, true);
  if (!res.ok) {
    let body: ApiErrorBody = { code: "INTERNAL", message: "Download failed" };
    try {
      const json = await res.json();
      if (json?.error) body = json.error;
    } catch {
      // ignore
    }
    throw toApiError(res.status, body);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? "attendance.csv";

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export function wsUrl(path: string): string {
  const token = getAccessToken();
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = BASE_URL
    ? BASE_URL.replace(/^http/, "ws")
    : `${protocol}//${window.location.host}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${base}${path}${sep}access_token=${encodeURIComponent(token ?? "")}`;
}
