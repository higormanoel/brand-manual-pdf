import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
export class SessionError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
function equals(a: string, b: string): boolean { const aa = Buffer.from(a); const bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb); }
/** A per-process token is exchanged once; only the resulting HttpOnly cookie reaches subsequent APIs. */
export function createLocalSession(origin: string) {
  const bootstrapToken = randomBytes(32).toString('hex'); const secret = randomBytes(32).toString('hex');
  const cookieName = `marquio_${new URL(origin).port}`; let exchanged = false;
  function validateBoundary(request: IncomingMessage) {
    const expected = new URL(origin);
    if (request.headers.host !== expected.host) throw new SessionError(403, 'Invalid Host');
    const sentOrigin = request.headers.origin;
    if ((sentOrigin !== undefined && sentOrigin !== origin) || (!['GET', 'HEAD'].includes(request.method ?? '') && sentOrigin !== origin)) throw new SessionError(403, 'Invalid Origin');
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new SessionError(403, 'Cross-site requests are forbidden');
  }
  function requireSession(request: IncomingMessage) {
    validateBoundary(request);
    const cookies = (request.headers.cookie ?? '').split(';').map(part => part.trim());
    const cookie = cookies.find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!cookie || !equals(cookie, secret)) throw new SessionError(401, 'Local session required');
  }
  function exchange(token: unknown, response: ServerResponse) {
    if (exchanged || typeof token !== 'string' || !equals(token, bootstrapToken)) throw new SessionError(401, 'Invalid or already used session token');
    exchanged = true;
    response.setHeader('Set-Cookie', `${cookieName}=${secret}; HttpOnly; SameSite=Strict; Path=/`);
  }
  return { bootstrapToken, validateBoundary, requireSession, exchange };
}
