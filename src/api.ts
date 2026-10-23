// Single place for the backend address and for talking to it.
// Override per environment with VITE_API_BASE (e.g. in Vercel); no trailing slash needed.
const DEFAULT_API_BASE = "https://a7fr36i094.execute-api.ap-southeast-2.amazonaws.com";

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || DEFAULT_API_BASE).replace(/\/$/, "");

export const api = (path: string) => `${API_BASE}${path}`;

/** The login token saved at sign-in, sent as a Bearer header. */
function authHeader(): Record<string, string> {
  try {
    const session = JSON.parse(localStorage.getItem("userSession") ?? "null");
    return session?.session_token ? { Authorization: `Bearer ${session.session_token}` } : {};
  } catch {
    return {};
  }
}

/** fetch() for our own API: adds the login token. Never use this for S3 uploads. */
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: { ...authHeader(), ...(init.headers as Record<string, string> | undefined) },
  });
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const SESSION_EXPIRED_EVENT = "lumico:session-expired";

/** JSON request that throws ApiError with the server's plain-language message. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(api(path), init);
  } catch {
    throw new ApiError(0, "No connection. Check your signal and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(res.status, data?.error ?? "Something went wrong. Try again.");
  }
  return data as T;
}
