/**
 * Função serverless da Vercel — adapta o servidor MCP do RelyOn 360 ao runtime Node
 * da Vercel (que recebe req/res compatíveis com IncomingMessage/ServerResponse).
 *
 * Toda a lógica (auth, registro de tools, transporte) vive em ../src/mcpHandler —
 * este arquivo é só o ponto de entrada que a Vercel descobre automaticamente
 * (rota fica em /api/mcp; configuramos um rewrite em vercel.json pra expor em /mcp).
 *
 * Variável de ambiente obrigatória no projeto Vercel: MCP_AUTH_TOKEN
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMcpRequest } from '../src/mcpHandler.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleMcpRequest(req, res);
}
