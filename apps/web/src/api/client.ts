export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

/** Fired on any apiFetch 401. App.tsx listens and — only when the user was
 * currently authenticated — clears auth state and shows a toast. A 401 from
 * a pre-login check (e.g. the boot-time /profile/me probe) also dispatches
 * this, which is harmless: the listener is a no-op when there's no active
 * session to expire. */
export const AUTH_EXPIRED_EVENT = "auth:expired";

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init
  }).then((response) => {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    return response;
  });
}
