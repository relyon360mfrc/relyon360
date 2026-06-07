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
 * Autenticação: Bearer token fixo comparado em tempo constante (timingSafeEqual)
 * contra o header "Authorization: Bearer <token>" — env var MCP_AUTH_TOKEN.
 * Suficiente para uma equipe pequena com um único agente confiável; OAuth completo
 * exigiria construir um servidor de autorização à parte, esforço desproporcional
 * ao tamanho do problema aqui. O processo recusa subir sem MCP_AUTH_TOKEN definido
 * (fail-closed: melhor não iniciar do que iniciar desprotegido).
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

function isAuthorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return false;

  const expected = Buffer.from(AUTH_TOKEN as string);
  const received = Buffer.from(token);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

function unauthorized(res: ServerResponse): void {
  res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' }).end(JSON.stringify({
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
