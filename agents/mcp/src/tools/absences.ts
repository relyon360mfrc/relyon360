import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  fetchInstructors, fetchAbsences, saveAbsences,
  resolveInstructorsByName, fmtDateBR, todayISO,
} from '../services/supabase.js';
import { ABSENCE_CATEGORIES, ABSENCE_TYPE_BY_CATEGORY, FULL_DAY_ABSENCE_CATEGORIES } from '../constants.js';
import { resolveDate } from './instructors.js';
import type { Absence } from '../types.js';

export function registerAbsenceTools(server: McpServer): void {

  // ── rl360_listar_ausencias ─────────────────────────────────────────────────
  server.registerTool(
    'rl360_listar_ausencias',
    {
      title: 'Listar Ausências',
      description: `Lista as ausências (folgas, férias, atestados) em uma data ou período.
Útil para saber quem não estará disponível e planejar substituições.

Args:
  - data (string): Data no formato YYYY-MM-DD, "hoje" ou "amanhã" (ou data de início do período)
  - data_fim (string, opcional): Data fim para listar período. Se omitido, lista apenas o dia.

Returns:
  Lista de ausências com instrutor, tipo e data.`,
      inputSchema: z.object({
        data:     z.string().describe('Data YYYY-MM-DD, "hoje" ou "amanhã"'),
        data_fim: z.string().optional().describe('Data fim YYYY-MM-DD para período'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ data, data_fim }) => {
      try {
        const dateFrom = resolveDate(data);
        const dateTo   = data_fim ? resolveDate(data_fim) : dateFrom;

        const absences = await fetchAbsences();

        const inRange = absences.filter(a => {
          const start = a.startDate;
          const end   = a.endDate ?? a.startDate;
          // Ausência se sobrepõe ao período consultado
          return start <= dateTo && end >= dateFrom;
        });

        if (inRange.length === 0) {
          const label = dateFrom === dateTo ? fmtDateBR(dateFrom) : `${fmtDateBR(dateFrom)} a ${fmtDateBR(dateTo)}`;
          return {
            content: [{ type: 'text', text: `Nenhuma ausência registrada em ${label}.` }],
          };
        }

        const lines = [`# Ausências — ${fmtDateBR(dateFrom)}${dateFrom !== dateTo ? ` a ${fmtDateBR(dateTo)}` : ''}`, ''];
        for (const a of inRange) {
          const periodo = a.endDate && a.endDate !== a.startDate
            ? `${fmtDateBR(a.startDate)} a ${fmtDateBR(a.endDate)}`
            : fmtDateBR(a.startDate);
          lines.push(`- **${a.instructorName}** — ${a.category} (${periodo})`);
          if (a.obs) lines.push(`  _${a.obs}_`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: { count: inRange.length, absences: inRange },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // ── rl360_registrar_ausencia ───────────────────────────────────────────────
  server.registerTool(
    'rl360_registrar_ausencia',
    {
      title: 'Registrar Ausência',
      description: `Registra uma ausência (Férias, Folga, Atestado, etc.) para um instrutor.
Aceita nome parcial do instrutor (usa fuzzy matching).

IMPORTANTE: Para férias ou qualquer período multi-dia, use data_fim para indicar o período completo.
Para ausência de um único dia, data_fim pode ser omitido.

Nota: "Folga de aniversário" não é uma categoria própria do sistema — é registrada como
"Folga Banco de Horas" com a observação descrevendo o motivo (ex: "Folga de aniversário").

Args:
  - nome_instrutor (string): Nome (parcial ou completo) do instrutor
  - data (string): Data da ausência — YYYY-MM-DD, "hoje" ou "amanhã"
  - categoria (string): Categoria — "Atestado Médico" | "Licença Paternidade/Maternidade" |
    "Consultas e Exames (com declaração)" | "Falta" | "Atrasos e Saídas Antecipadas" |
    "Suspensão Disciplinar" | "Folga Banco de Horas" | "Folga Abonada" | "Férias" |
    "Embarque" | "Treinamento/Evento Externo"
  - data_fim (string, opcional): Fim do período (para férias/ausências multi-dia)
  - observacao (string, opcional): Nota adicional

Returns:
  Confirmação com nome do instrutor resolvido e data registrada.`,
      inputSchema: z.object({
        nome_instrutor: z.string().min(2).describe('Nome parcial ou completo do instrutor'),
        data:           z.string().describe('Data da ausência — YYYY-MM-DD, "hoje" ou "amanhã"'),
        categoria:      z.enum(ABSENCE_CATEGORIES).describe('Tipo de ausência'),
        data_fim:       z.string().optional().describe('Fim do período para férias multi-dia'),
        observacao:     z.string().optional().describe('Observação adicional'),
      }),
      annotations: {
        readOnlyHint:    false,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async ({ nome_instrutor, data, categoria, data_fim, observacao }) => {
      try {
        const instructors = await fetchInstructors();
        const matches = resolveInstructorsByName(nome_instrutor, instructors);

        if (matches.length === 0) {
          return {
            content: [{ type: 'text', text: `Instrutor "${nome_instrutor}" não encontrado. Use rl360_buscar_instrutor para verificar o nome correto.` }],
          };
        }
        if (matches.length > 1) {
          const names = matches.map(i => `"${i.name}" (id: ${i.id})`).join(', ');
          return {
            content: [{ type: 'text', text: `Nome ambíguo — ${matches.length} instrutores encontrados: ${names}. Seja mais específico.` }],
          };
        }

        const instr = matches[0];
        const resolvedDate = resolveDate(data);
        const resolvedDateFim = data_fim ? resolveDate(data_fim) : undefined;

        // Verifica duplicata
        const absences = await fetchAbsences();
        const duplicate = absences.find(a =>
          String(a.instructorId) === String(instr.id) &&
          a.startDate === resolvedDate &&
          a.category === categoria
        );
        if (duplicate) {
          return {
            content: [{ type: 'text', text: `Já existe uma ausência do tipo "${categoria}" para ${instr.name} em ${fmtDateBR(resolvedDate)}.` }],
          };
        }

        const fullDay = FULL_DAY_ABSENCE_CATEGORIES.includes(categoria);
        const newAbsence: Absence = {
          id: Date.now(),
          instructorId: instr.id,
          instructorName: instr.name,
          type: ABSENCE_TYPE_BY_CATEGORY[categoria] ?? 'planejada',
          category: categoria,
          startDate: resolvedDate,
          endDate: resolvedDateFim ?? resolvedDate,
          ...(fullDay ? {} : { startTime: '08:00', endTime: '17:00' }),
          ...(observacao ? { obs: observacao } : {}),
        };

        await saveAbsences([...absences, newAbsence]);

        const periodo = resolvedDateFim && resolvedDateFim !== resolvedDate
          ? `${fmtDateBR(resolvedDate)} a ${fmtDateBR(resolvedDateFim)}`
          : fmtDateBR(resolvedDate);

        return {
          content: [{
            type: 'text',
            text: `✅ Ausência registrada com sucesso!\n\n**Instrutor:** ${instr.name}\n**Tipo:** ${categoria}\n**Período:** ${periodo}${observacao ? `\n**Obs:** ${observacao}` : ''}`,
          }],
          structuredContent: { success: true, absence: newAbsence },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro ao registrar ausência: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // ── rl360_remover_ausencia ─────────────────────────────────────────────────
  server.registerTool(
    'rl360_remover_ausencia',
    {
      title: 'Remover Ausência',
      description: `Remove uma ausência previamente registrada.
Útil quando um instrutor que estava de folga confirma que vai trabalhar.

Args:
  - nome_instrutor (string): Nome do instrutor
  - data (string): Data da ausência a remover — YYYY-MM-DD, "hoje" ou "amanhã"
  - categoria (string, opcional): Tipo específico. Se omitido, remove a primeira ausência do dia.`,
      inputSchema: z.object({
        nome_instrutor: z.string().min(2).describe('Nome do instrutor'),
        data:           z.string().describe('Data da ausência — YYYY-MM-DD, "hoje" ou "amanhã"'),
        categoria:      z.enum(ABSENCE_CATEGORIES).optional().describe('Tipo de ausência (opcional)'),
      }),
      annotations: {
        readOnlyHint:    false,
        destructiveHint: true,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async ({ nome_instrutor, data, categoria }) => {
      try {
        const instructors = await fetchInstructors();
        const matches = resolveInstructorsByName(nome_instrutor, instructors);

        if (matches.length === 0) {
          return { content: [{ type: 'text', text: `Instrutor "${nome_instrutor}" não encontrado.` }] };
        }
        if (matches.length > 1) {
          const names = matches.map(i => `"${i.name}"`).join(', ');
          return { content: [{ type: 'text', text: `Nome ambíguo: ${names}. Seja mais específico.` }] };
        }

        const instr = matches[0];
        const resolvedDate = resolveDate(data);

        const absences = await fetchAbsences();
        const toRemove = absences.find(a => {
          if (String(a.instructorId) !== String(instr.id)) return false;
          if (categoria && a.category !== categoria) return false;
          const end = a.endDate ?? a.startDate;
          return a.startDate <= resolvedDate && resolvedDate <= end;
        });

        if (!toRemove) {
          return {
            content: [{ type: 'text', text: `Nenhuma ausência encontrada para ${instr.name} em ${fmtDateBR(resolvedDate)}${categoria ? ` do tipo "${categoria}"` : ''}.` }],
          };
        }

        await saveAbsences(absences.filter(a => a.id !== toRemove.id));

        return {
          content: [{
            type: 'text',
            text: `✅ Ausência removida!\n\n**Instrutor:** ${instr.name}\n**Tipo:** ${toRemove.category}\n**Data:** ${fmtDateBR(toRemove.startDate)}`,
          }],
          structuredContent: { success: true, removed: toRemove },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );
}
