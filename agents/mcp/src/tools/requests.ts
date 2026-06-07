import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  fetchRequests, saveRequests, fmtDateBR, todayISO, deriveRequestStatus,
} from '../services/supabase.js';

export function registerRequestTools(server: McpServer): void {

  // ── rl360_listar_solicitacoes ──────────────────────────────────────────────
  server.registerTool(
    'rl360_listar_solicitacoes',
    {
      title: 'Listar Solicitações',
      description: `Lista as solicitações do canal Instrutor↔Planejador.
Por padrão mostra apenas pendentes, mas pode mostrar todas.

Args:
  - status (string): "pendente" (padrão) | "aprovado" | "rejeitado" | "todos"
  - limit (number): Máximo de resultados (padrão: 20)

Returns:
  Lista de solicitações com id, instrutor, tipo, data e status.`,
      inputSchema: z.object({
        status: z.enum(['pendente', 'aprovado', 'rejeitado', 'todos'])
          .default('pendente')
          .describe('Filtrar por status'),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      annotations: {
        readOnlyHint:    true,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async ({ status, limit }) => {
      try {
        const allRequests = await fetchRequests();

        let filtered = allRequests.filter(r => {
          const derived = deriveRequestStatus(r).toLowerCase();
          if (status === 'todos') return true;
          return derived === status;
        });

        filtered = filtered.slice(0, limit);

        if (filtered.length === 0) {
          return {
            content: [{ type: 'text', text: `Nenhuma solicitação encontrada com status "${status}".` }],
          };
        }

        const lines = [`# Solicitações (${filtered.length})`, ''];
        for (const r of filtered) {
          const derivedStatus = deriveRequestStatus(r);
          lines.push(`## [id: ${r.id}] ${r.type}`);
          lines.push(`- **Instrutor:** ${r.instructorName}`);
          lines.push(`- **Data:** ${fmtDateBR(r.date)}`);
          lines.push(`- **Status:** ${derivedStatus}`);
          if (r.description) lines.push(`- **Descrição:** ${r.description}`);
          if (r.priority) lines.push(`- **Prioridade:** ${r.priority}`);
          lines.push('');
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: {
            count: filtered.length,
            requests: filtered.map(r => ({
              id: r.id,
              type: r.type,
              instructorName: r.instructorName,
              date: r.date,
              status: deriveRequestStatus(r),
              description: r.description,
              priority: r.priority,
            })),
          },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // ── rl360_aprovar_solicitacao ──────────────────────────────────────────────
  server.registerTool(
    'rl360_aprovar_solicitacao',
    {
      title: 'Aprovar Solicitação',
      description: `Aprova uma solicitação pendente do canal de comunicação.
Registra a aprovação no issueLog com timestamp.

Args:
  - id (number): ID da solicitação (obtido via rl360_listar_solicitacoes)
  - nota (string, opcional): Nota ou comentário do planejador`,
      inputSchema: z.object({
        id:   z.number().int().describe('ID da solicitação'),
        nota: z.string().optional().describe('Nota ou comentário do planejador'),
      }),
      annotations: {
        readOnlyHint:    false,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async ({ id, nota }) => {
      try {
        const requests = await fetchRequests();
        const idx = requests.findIndex(r => r.id === id);

        if (idx === -1) {
          return { content: [{ type: 'text', text: `Solicitação id ${id} não encontrada.` }] };
        }

        const req = requests[idx];
        const currentStatus = deriveRequestStatus(req);

        if (currentStatus !== 'Pendente') {
          return {
            content: [{ type: 'text', text: `Solicitação ${id} já está com status "${currentStatus}". Só é possível aprovar solicitações Pendentes.` }],
          };
        }

        const logEntry = {
          ts:     new Date().toISOString(),
          by:     { id: null, name: 'Agente RelyOn', role: 'agent' },
          action: 'approved' as const,
          ...(nota ? { note: nota } : {}),
        };

        const updated = {
          ...req,
          issueLog: [...(req.issueLog || []), logEntry],
        };

        requests[idx] = updated;
        await saveRequests(requests);

        return {
          content: [{
            type: 'text',
            text: `✅ Solicitação aprovada!\n\n**ID:** ${id}\n**Instrutor:** ${req.instructorName}\n**Tipo:** ${req.type}\n**Data:** ${fmtDateBR(req.date)}${nota ? `\n**Nota:** ${nota}` : ''}`,
          }],
          structuredContent: { success: true, id, newStatus: 'Aprovado' },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // ── rl360_rejeitar_solicitacao ─────────────────────────────────────────────
  server.registerTool(
    'rl360_rejeitar_solicitacao',
    {
      title: 'Rejeitar Solicitação',
      description: `Rejeita uma solicitação pendente com um motivo obrigatório.

Args:
  - id (number): ID da solicitação
  - motivo (string): Motivo da rejeição (obrigatório)`,
      inputSchema: z.object({
        id:     z.number().int().describe('ID da solicitação'),
        motivo: z.string().min(5).describe('Motivo da rejeição (obrigatório)'),
      }),
      annotations: {
        readOnlyHint:    false,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async ({ id, motivo }) => {
      try {
        const requests = await fetchRequests();
        const idx = requests.findIndex(r => r.id === id);

        if (idx === -1) {
          return { content: [{ type: 'text', text: `Solicitação id ${id} não encontrada.` }] };
        }

        const req = requests[idx];
        const currentStatus = deriveRequestStatus(req);

        if (currentStatus !== 'Pendente') {
          return {
            content: [{ type: 'text', text: `Solicitação ${id} já está com status "${currentStatus}".` }],
          };
        }

        const logEntry = {
          ts:     new Date().toISOString(),
          by:     { id: null, name: 'Agente RelyOn', role: 'agent' },
          action: 'rejected' as const,
          note:   motivo,
        };

        requests[idx] = {
          ...req,
          issueLog: [...(req.issueLog || []), logEntry],
        };

        await saveRequests(requests);

        return {
          content: [{
            type: 'text',
            text: `❌ Solicitação rejeitada.\n\n**ID:** ${id}\n**Instrutor:** ${req.instructorName}\n**Motivo:** ${motivo}`,
          }],
          structuredContent: { success: true, id, newStatus: 'Rejeitado' },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );
}
