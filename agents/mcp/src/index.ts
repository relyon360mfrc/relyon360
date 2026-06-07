#!/usr/bin/env node
/**
 * RelyOn 360 MCP Server — entrada standalone (servidor HTTP via node:http)
 *
 * Agente operacional para o RelyOn 360 Scheduler.
 * Permite operar o sistema por linguagem natural: registrar ausências,
 * consultar disponibilidade, trocar instrutores, buscar substitutos, etc.
 *
 * Use esta entrada para rodar localmente, numa VPS, Railway, Fly.io etc.
 * (qualquer host que execute `node dist/index.js` como processo de longa duração).
 * Para deploy na Vercel (funções serverless), veja api/mcp.ts — ambas reaproveitam
 * a mesma lógica em src/mcpHandler.ts.
 *
 * Transporte: Streamable HTTP (acesso remoto — Claude.ai web/mobile via connector)
 * Endpoint MCP: POST em /mcp, protegido por Bearer token (env var MCP_AUTH_TOKEN)
 *
 * Variáveis de ambiente:
 *   MCP_AUTH_TOKEN  (obrigatória) — segredo do Bearer token; gere algo longo e
 *                    aleatório, ex.: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
 *   PORT            (opcional, padrão 3000) — porta HTTP
 *
 * Configuração como connector remoto:
 *   - Claude Code / Claude Desktop (suportam header customizado):
 *       URL: https://<seu-dominio>/mcp
 *       Header: Authorization: Bearer <valor de MCP_AUTH_TOKEN>
 *   - Claude.ai custom connector (a UI só aceita URL + OAuth, sem header customizado —
 *     ver nota em mcpHandler.ts sobre por que evitamos o fluxo OAuth):
 *       URL: https://<seu-dominio>/mcp?token=<valor de MCP_AUTH_TOKEN>
 */

import { createServer } from 'node:http';
import { handleMcpRequest } from './mcpHandler.js';

const port = Number(process.env.PORT ?? 3000);

const httpServer = createServer((req, res) => {
  // Comparar só o pathname — req.url pode trazer querystring (?token=...)
  const { pathname } = new URL(req.url ?? '', 'http://localhost');
  if (pathname !== '/mcp') {
    res.writeHead(404).end();
    return;
  }

  handleMcpRequest(req, res);
});

httpServer.listen(port, () => {
  console.error(`[RelyOn 360 MCP] Servidor HTTP rodando na porta ${port} — endpoint POST em /mcp`);
});
