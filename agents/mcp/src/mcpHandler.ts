/**
 * Núcleo do servidor MCP do RelyOn 360 — agnóstico de host HTTP.
 *
 * Exporta `handleMcpRequest`, que recebe uma requisição HTTP crua (compatível com
 * IncomingMessage/ServerResponse — tanto o `node:http` puro quanto as funções
 * serverless da Vercel usam essa mesma forma) e devolve a resposta MCP.
 *
 * Reaproveitado por dois pontos de entrada:
 *   - src/index.ts → servidor HTTP standalone (uso local / VPS / Railway / Fly)
 *   - api/mcp.ts   → função serverless da Vercel
 *
 * Autenticação: token fixo comparado em tempo constante (timingSafeEqual) — env var
 * MCP_AUTH_TOKEN. Aceito de duas formas:
 *   1. Header  "Authorization: Bearer <token>"        (Claude Code / Claude Desktop,
 *                                                       qualquer cliente que suporte headers)
 *   2. Query   "?token=<token>" na própria URL         (Claude.ai custom connector —
 *                                                       a UI não expõe campo de header
 *                                                       customizado, só URL + OAuth)
 * IMPORTANTE: a resposta 401 NÃO envia "WWW-Authenticate: Bearer" de propósito — esse
 * header sinaliza "use OAuth" e faz o Claude.ai tentar Dynamic Client Registration
 * contra um servidor de autorização que não existe (erro "couldn't register with
 * sign-in service"). Token fixo é suficiente pra uma equipe pequena com um único
 * agente confiável; OAuth completo exigiria construir um servidor de autorização à
 * parte — esforço desproporcional ao tamanho do problema aqui. O processo recusa
 * subir sem MCP_AUTH_TOKEN definido (fail-closed: melhor não iniciar do que iniciar
 * desprotegido).
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { registerInstructorTools } from './tools/instructors.js';
import { registerAbsenceTools }    from './tools/absences.js';
import { registerScheduleTools }   from './tools/schedules.js';
import { registerRequestTools }    from './tools/requests.js';

// ── AUTENTICAÇÃO ──────────────────────────────────────────────────────────────
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('[RelyOn 360 MCP] MCP_AUTH_TOKEN não definido — recusando iniciar (servidor remoto não pode subir sem autenticação).');
  process.exit(1);
}

function constantTimeMatch(received: string): boolean {
  const expected = Buffer.from(AUTH_TOKEN as string);
  const candidate = Buffer.from(received);
  if (expected.length !== candidate.length) return false;
  return timingSafeEqual(expected, candidate);
}

function tokenFromHeader(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  return (scheme === 'Bearer' && token) ? token : undefined;
}

function tokenFromQuery(req: IncomingMessage): string | undefined {
  const url = new URL(req.url ?? '', 'http://localhost');
  return url.searchParams.get('token') ?? undefined;
}

function isAuthorized(req: IncomingMessage): boolean {
  const token = tokenFromHeader(req) ?? tokenFromQuery(req);
  return !!token && constantTimeMatch(token);
}

function unauthorized(res: ServerResponse): void {
  // Sem WWW-Authenticate de propósito — ver nota no topo do arquivo sobre o
  // gatilho de descoberta OAuth no Claude.ai.
  res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Unauthorized' },
    id: null,
  }));
}

function methodNotAllowed(res: ServerResponse): void {
  res.writeHead(405, { 'Content-Type': 'application/json' }).end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  }));
}

// ── FÁBRICA DO SERVIDOR ───────────────────────────────────────────────────────
// Modo stateless: cada requisição HTTP recebe seu próprio par server+transport
// (é o padrão recomendado pelo SDK para StreamableHTTP sem sessão — reaproveitar
// uma única instância entre requisições quebra a máquina de estados do transporte;
// também é o único modelo compatível com funções serverless, que não mantêm estado
// entre invocações).
function buildServer(): McpServer {
  const server = new McpServer({
    name:    'relyon360-mcp-server',
    version: '1.0.0',
  });

  registerInstructorTools(server);
  registerAbsenceTools(server);
  registerScheduleTools(server);
  registerRequestTools(server);

  return server;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve(undefined);
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

/**
 * Ponto de entrada único do servidor MCP — chamado tanto pelo servidor HTTP
 * standalone quanto pela função serverless da Vercel.
 */
export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthorized(req)) {
    unauthorized(res);
    return;
  }

  if (req.method !== 'POST') {
    // Modo stateless não tem sessão — GET (stream) e DELETE (encerramento) não se aplicam
    methodNotAllowed(res);
    return;
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    const body = await readJsonBody(req);
    await transport.handleRequest(req, res, body);
  } catch (err: unknown) {
    console.error('[RelyOn 360 MCP] Erro ao processar requisição:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      }));
    }
  }
}
