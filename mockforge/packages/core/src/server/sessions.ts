import type { FastifyRequest } from "fastify";
import { newSessionId, sanitizeSessionId } from "../state/store.js";

export interface SessionIdentity {
  id: string;
  /** true when the server must issue an mf_session cookie for this request. */
  issueCookie: boolean;
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.trim().indexOf("=");
    if (separator === -1) continue;
    const key = part.trim().slice(0, separator);
    if (key !== name) continue;
    const value = part.trim().slice(separator + 1);
    if (value.length === 0) continue;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/** B2 session resolution: X-Session-Id header, then the mf_session cookie,
 *  then a fresh random session (with a cookie issued back). */
export function resolveSessionIdentity(request: FastifyRequest): SessionIdentity {
  const header = request.headers["x-session-id"];
  if (typeof header === "string" && header.trim().length > 0) {
    return { id: sanitizeSessionId(header), issueCookie: false };
  }
  const cookie = readCookie(request.headers.cookie, "mf_session");
  if (cookie) {
    return { id: sanitizeSessionId(cookie), issueCookie: false };
  }
  return { id: newSessionId(), issueCookie: true };
}
