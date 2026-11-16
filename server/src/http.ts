import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { NextFunction, Request, Response } from 'express';
import { createXmanmobiServer } from './server.js';

type AuthenticatedRequest = Request & { auth?: AuthInfo };
const host = process.env.MCP_HOST || '127.0.0.1';
const port = parsePort(process.env.MCP_PORT);
const allowedHosts = splitCsv(process.env.MCP_ALLOWED_HOSTS);
const app = createMcpExpressApp({ host, ...(allowedHosts.length ? { allowedHosts } : {}) });
const protectedResource = {
  resource: 'https://ai.xmanmobi.com/mcp',
  authorization_servers: ['https://bis.joinaws.xyz'],
  bearer_methods_supported: ['header'],
  scopes_supported: ['ad_diagnosis:read', 'ad_management:write'],
};

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'xmanmobi-mcp', version: '1.1.0' }));
app.get('/.well-known/oauth-protected-resource', (_req, res) => res.json(protectedResource));
app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => res.json(protectedResource));
app.use('/mcp', bearerAuth);

app.post('/mcp', async (req: AuthenticatedRequest, res: Response) => {
  const server = createXmanmobiServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request failed:', error);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
  } finally {
    res.on('close', () => { void transport.close(); void server.close(); });
  }
});

app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);
app.listen(port, host, (error?: Error) => {
  if (error) { console.error('Failed to start Xmanmobi MCP HTTP server:', error); process.exit(1); }
  console.log(`Xmanmobi MCP HTTP server listening on http://${host}:${port}/mcp`);
});

function bearerAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const match = (req.header('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    res.setHeader(
      'WWW-Authenticate',
      'Bearer realm="Xmanmobi MCP", resource_metadata="https://ai.xmanmobi.com/.well-known/oauth-protected-resource/mcp", scope="ad_diagnosis:read ad_management:write"',
    );
    res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Bearer token required' }, id: null });
    return;
  }
  req.auth = { token, clientId: 'xmanmobi-user', scopes: tokenScopes(token) };
  next();
}

function tokenScopes(token: string): string[] {
  try {
    const payload = token.split('.')[1];
    if (!payload) return [];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { scope?: unknown };
    return typeof decoded.scope === 'string' ? decoded.scope.split(/\s+/).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function methodNotAllowed(_req: Request, res: Response) {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
}

function parsePort(value?: string) {
  const parsed = Number(value || 3100);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) throw new Error('MCP_PORT must be an integer between 1 and 65535.');
  return parsed;
}

function splitCsv(value?: string) {
  return (value || '').split(',').map((item) => item.trim()).filter(Boolean);
}
