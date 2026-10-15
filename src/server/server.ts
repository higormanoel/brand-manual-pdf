import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ProjectRepository, RepositoryError, type RepositoryOptions } from '../storage/repository';
import { pdfBytes } from '../export/pdf';
import { exportPortable } from '../storage/portable';
import { MAX_ASSET_BYTES, MAX_PROJECT_BYTES } from '../storage/snapshot';
import { relativeAssetPathSchema } from '../core/assets';
import { originSchema } from '../core/nodes';
import { createLocalSession, SessionError } from './session';
export interface LocalServer { origin: string; url: string; repository: ProjectRepository; close(): Promise<void> }
export interface LocalServerOptions extends RepositoryOptions { folder: string; port?: number; staticDir?: string }
const assetInputSchema = z.object({ commandId: z.string().min(1).max(200), expectedRevision: z.number().int().nonnegative(), name: z.string().min(1), mimeType: z.string(), bytesBase64: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), origin: originSchema });
const contentTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon' };
function json(response: ServerResponse, status: number, body: unknown) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)); }
async function body(request: IncomingMessage, limit = MAX_PROJECT_BYTES): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new SessionError(415, 'JSON required');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw new SessionError(413, 'Request size limit exceeded'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function revision(url: URL) { const raw = url.searchParams.get('revision'); if (raw === null || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('A confirmed revision is required'); return Number(raw); }
async function staticFile(directory: string, relative: string): Promise<Uint8Array> {
  relativeAssetPathSchema.parse(relative); const root = await fs.realpath(directory); let target = root;
  for (const part of relative.split('/')) { target = path.join(target, part); if ((await fs.lstat(target)).isSymbolicLink()) throw new SessionError(403, 'Symlink forbidden'); }
  const stat = await fs.stat(target); if (!stat.isFile()) throw new SessionError(404, 'Not found'); return new Uint8Array(await fs.readFile(target));
}
/** Bind loopback only. The caller opens `url`; its fragment is never sent as a request URL. */
export async function startLocalServer(options: LocalServerOptions): Promise<LocalServer> {
  const repository = await ProjectRepository.open(options.folder, options); let session: ReturnType<typeof createLocalSession>;
  const staticDir = options.staticDir ?? path.resolve('dist/studio');
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'");
    void (async () => {
      session.validateBoundary(request);
      // Validate before URL normalization can hide traversal segments.
      const rawPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
      if (rawPath.includes('\\') || rawPath.split('/').some(part => part === '..' || part === '.')) throw new SessionError(403, 'Unsafe path');
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/session' && request.method === 'POST') { const input = z.object({ token: z.string() }).parse(await body(request)); session.exchange(input.token, response); json(response, 200, { authenticated: true }); return; }
      if (url.pathname.startsWith('/api/')) {
        session.requireSession(request);
        if (url.pathname === '/api/project' && request.method === 'GET') { json(response, 200, await repository.load()); return; }
        if (url.pathname === '/api/commands' && request.method === 'POST') { json(response, 200, await repository.commit(await body(request) as Parameters<ProjectRepository['commit']>[0])); return; }
        if (url.pathname === '/api/assets' && request.method === 'POST') {
          const input = assetInputSchema.parse(await body(request, Math.ceil(MAX_ASSET_BYTES * 4 / 3) + 1024 * 1024));
          const result = await repository.importAsset({ name: input.name, mimeType: input.mimeType, origin: input.origin, bytes: new Uint8Array(Buffer.from(input.bytesBase64, 'base64')) }, input);
          json(response, 200, result); return;
        }
        if (url.pathname.startsWith('/api/assets/') && request.method === 'GET') {
          const id = decodeURIComponent(url.pathname.slice('/api/assets/'.length));
          const project = await repository.load(); const asset = project.assets.find(a => a.id === id); if (!asset) throw new SessionError(404, 'Asset not found');
          const snapshot = await repository.snapshot(project.revision);
          // Assets are delivered as attachments where opening them could execute active markup.
          response.writeHead(200, { 'Content-Type': asset.mimeType, 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'; sandbox" }); response.end(snapshot.assets[asset.path]); return;
        }
        if (url.pathname === '/api/snapshot' && request.method === 'GET') {
          const snapshot = await repository.snapshot(revision(url)); const assets: Record<string, string> = Object.create(null);
          for (const [name, bytes] of Object.entries(snapshot.assets)) assets[name] = Buffer.from(bytes).toString('base64');
          json(response, 200, { revision: snapshot.revision, project: snapshot.project, assetsBase64: assets }); return;
        }
        if (url.pathname === '/api/pdf' && request.method === 'GET') { const result = await pdfBytes(await repository.snapshot(revision(url))); response.writeHead(200, { 'Content-Type': 'application/pdf', 'X-Marquio-Revision': String(result.report.revision), 'X-Marquio-Pages': String(result.report.pages) }); response.end(result.bytes); return; }
        if (url.pathname === '/api/portable' && request.method === 'GET') { const bytes = await exportPortable(await repository.snapshot(revision(url))); response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="project.marquio.zip"' }); response.end(bytes); return; }
        throw new SessionError(404, 'API route not found');
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new SessionError(405, 'Method not allowed');
      const relative = rawPath === '/' ? 'index.html' : rawPath.slice(1);
      try { const bytes = await staticFile(staticDir, relative); response.writeHead(200, { 'Content-Type': contentTypes[path.extname(relative)] ?? 'application/octet-stream' }); response.end(request.method === 'HEAD' ? undefined : bytes); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new SessionError(404, 'Studio build not found'); throw error; }
    })().catch(error => {
      if (response.headersSent) { response.destroy(); return; }
      if (error instanceof RepositoryError) { json(response, error.code === 'revision-conflict' || error.code === 'command-id-reused' ? 409 : error.code === 'revision-not-found' ? 404 : 423, { code: error.code, message: error.message, currentRevision: error.currentRevision }); return; }
      if (error instanceof SessionError) { json(response, error.status, { code: 'session-error', message: error.message }); return; }
      json(response, error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 422, { code: 'invalid-request', message: error instanceof Error ? error.message : 'Request failed' });
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No local server address');
  const origin = `http://127.0.0.1:${address.port}`; session = createLocalSession(origin);
  return { origin, url: `${origin}/#session=${session.bootstrapToken}`, repository, close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); }) };
}
