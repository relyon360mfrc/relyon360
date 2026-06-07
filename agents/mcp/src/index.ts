#!/usr/bin/env node
/**
 * RelyOn 360 MCP Server
 *
 * Agente operacional para o RelyOn 360 Scheduler.
 * Permite operar o sistema por linguagem natural: registrar ausências,
 * consultar disponibilidade, trocar instrutores, buscar substitutos, etc.
 *
 * Transporte: stdio (integração com Claude Code / Claude Desktop)
 *
 * Configuração no claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "relyon360": {
 *       "command": "node",
 *       "args": ["<caminho>/agents/mcp/dist/index.js"]
 *     }
 *   }
 * }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerInstructorTools } from './tools/instructors.js';
import { registerAbsenceTools }    from './tools/absences.js';
import { registerScheduleTools }   from './tools/schedules.js';
import { registerRequestTools }    from './tools/requests.js';

// ── SERVIDOR ──────────────────────────────────────────────────────────────────
const server = new McpServer({
  name:    'relyon360-mcp-server',
  version: '1.0.0',
});

// ── REGISTRAR TODAS AS TOOLS ──────────────────────────────────────────────────
registerInstructorTools(server);
registerAbsenceTools(server);
registerScheduleTools(server);
registerRequestTools(server);

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[RelyOn 360 MCP] Servidor iniciado via stdio');
}

main().catch((err: unknown) => {
  console.error('[RelyOn 360 MCP] Erro fatal:', err);
  process.exit(1);
});
