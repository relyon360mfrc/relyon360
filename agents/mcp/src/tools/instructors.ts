import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  fetchInstructors, fetchAbsences, fetchSchedulesByDate,
  resolveInstructorsByName, isAbsentOn, getSchedulesForInstructor,
  fmtDateBR, todayISO,
} from '../services/supabase.js';
import { ROLE_PT } from '../constants.js';

export function registerInstructorTools(server: McpServer): void {

  // ── rl360_buscar_instrutor ─────────────────────────────────────────────────
  server.registerTool(
    'rl360_buscar_instrutor',
    {
      title: 'Buscar Instrutor',
      description: `Busca um ou mais instrutores pelo nome (fuzzy matching — aceita nome parcial, sem acentos, etc.).
Retorna id, nome, contrato, base, status e competências (skills) dos matches.
Usar este tool PRIMEIRO sempre que precisar do id de um instrutor para outras operações.

Args:
  - nome (string): Nome parcial ou completo do instrutor

Returns:
  Lista de instrutores que correspondem ao nome buscado.

Exemplos:
  - "Fernando" → encontra "FERNANDO GUESSER", "FERNANDO LIMA"
  - "guesser" → encontra "FERNANDO GUESSER"
  - "daniel q" → encontra "DANIEL QUEIROZ"`,
      inputSchema: z.object({
        nome: z.string().min(2).describe('Nome parcial ou completo do instrutor'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ nome }) => {
      try {
        const instructors = await fetchInstructors();
        const matches = resolveInstructorsByName(nome, instructors);

        if (matches.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `Nenhum instrutor ativo encontrado com o nome "${nome}". Verifique a grafia ou tente um nome mais curto.`,
            }],
          };
        }

        const lines = [`# Instrutores encontrados para "${nome}"`, ''];
        for (const i of matches) {
          lines.push(`## ${i.name} (id: ${i.id})`);
          lines.push(`- **Contrato:** ${i.contract}`);
          lines.push(`- **Base:** ${i.base}`);
          lines.push(`- **Status:** ${i.status}`);
          if (i.skills?.length) {
            lines.push(`- **Competências:** ${i.skills.join(', ')}`);
          }
          if (i.contractEndDate) {
            lines.push(`- **Fim de contrato:** ${fmtDateBR(i.contractEndDate)}`);
          }
          lines.push('');
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: { count: matches.length, instructors: matches.map(i => ({
            id: i.id, name: i.name, contract: i.contract, base: i.base,
            status: i.status, skills: i.skills || [],
          })) },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro ao buscar instrutor: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // ── rl360_listar_instrutores ───────────────────────────────────────────────
  server.registerTool(
    'rl360_listar_instrutores',
    {
      title: 'Listar Instrutores',
      description: `Lista todos os instrutores ativos, com filtros opcionais por base e/ou competência.
Útil para descobrir quem existe no sistema antes de buscar um nome específico.

Args:
  - base (string, opcional): Filtrar por base — "Macaé", "Bangu" ou "Offshore"
  - skill (string, opcional): Filtrar por competência (ex: "NR-35", "TRADUTOR")
  - status (string, opcional): "Ativo" (padrão) | "Inativo" | "todos"
  - limit (number): Máximo de resultados (padrão: 50)`,
      inputSchema: z.object({
        base:   z.string().optional().describe('Filtrar por base: Macaé, Bangu ou Offshore'),
        skill:  z.string().optional().describe('Filtrar por competência (ex: NR-35, TRADUTOR)'),
        status: z.enum(['Ativo', 'Inativo', 'todos']).default('Ativo').describe('Status dos instrutores'),
        limit:  z.number().int().min(1).max(200).default(50),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ base, skill, status, limit }) => {
      try {
        let instructors = await fetchInstructors();

        if (status !== 'todos') {
          instructors = instructors.filter(i => i.status === status);
        }
        if (base) {
          instructors = instructors.filter(i =>
            i.base?.toLowerCase().includes(base.toLowerCase())
          );
        }
        if (skill) {
          const normSkill = skill.toUpperCase();
          instructors = instructors.filter(i =>
            (i.skills || []).some(s => s.toUpperCase().includes(normSkill))
          );
        }

        instructors = instructors.slice(0, limit);

        if (instructors.length === 0) {
          return {
            content: [{ type: 'text', text: 'Nenhum instrutor encontrado com os filtros informados.' }],
          };
        }

        const lines = [`# Instrutores (${instructors.length})`, ''];
        for (const i of instructors) {
          lines.push(`- **${i.name}** (id: ${i.id}) — ${i.contract} | ${i.base}`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: { count: instructors.length, instructors: instructors.map(i => ({
            id: i.id, name: i.name, contract: i.contract, base: i.base,
            status: i.status, skills: i.skills || [],
          })) },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // ── rl360_consultar_disponibilidade ───────────────────────────────────────
  server.registerTool(
    'rl360_consultar_disponibilidade',
    {
      title: 'Consultar Disponibilidade',
      description: `Mostra quais instrutores estão DISPONÍVEIS em uma data (não ausentes e sem turma no horário).
Pode filtrar por base e/ou competência para encontrar substitutos qualificados.

Args:
  - data (string): Data no formato YYYY-MM-DD (ou "hoje", "amanhã")
  - base (string, opcional): Filtrar por base — "Macaé", "Bangu" ou "Offshore"
  - skill (string, opcional): Filtrar por competência necessária (ex: "TRADUTOR", "NR-35")

Returns:
  Lista de instrutores disponíveis com suas competências e carga do dia.`,
      inputSchema: z.object({
        data:  z.string().describe('Data no formato YYYY-MM-DD, "hoje" ou "amanhã"'),
        base:  z.string().optional().describe('Filtrar por base: Macaé, Bangu ou Offshore'),
        skill: z.string().optional().describe('Filtrar por competência necessária'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ data, base, skill }) => {
      try {
        // Resolver data relativa
        const resolvedDate = resolveDate(data);

        const [instructors, absences, schedules] = await Promise.all([
          fetchInstructors(),
          fetchAbsences(),
          fetchSchedulesByDate(resolvedDate),
        ]);

        // Apenas ativos da base correta
        let candidates = instructors.filter(i => i.status === 'Ativo');
        if (base) {
          candidates = candidates.filter(i =>
            i.base?.toLowerCase().includes(base.toLowerCase())
          );
        }
        if (skill) {
          const normSkill = skill.toUpperCase();
          candidates = candidates.filter(i =>
            (i.skills || []).some(s => s.toUpperCase().includes(normSkill))
          );
        }

        const available: Array<{
          id: number; name: string; base: string; contract: string;
          skills: string[]; turmasDoDia: number;
        }> = [];
        const busy: Array<{ id: number; name: string; reason: string }> = [];

        for (const instr of candidates) {
          const absence = isAbsentOn(instr.id, resolvedDate, absences);
          if (absence) {
            busy.push({ id: instr.id, name: instr.name, reason: absence.category });
            continue;
          }

          const instrSchedules = getSchedulesForInstructor(instr.id, resolvedDate, schedules);
          available.push({
            id: instr.id,
            name: instr.name,
            base: instr.base,
            contract: instr.contract,
            skills: instr.skills || [],
            turmasDoDia: instrSchedules.length,
          });
        }

        const lines = [
          `# Disponibilidade em ${fmtDateBR(resolvedDate)}`,
          base ? `Filtro de base: **${base}**` : '',
          skill ? `Filtro de skill: **${skill}**` : '',
          '',
          `## Disponíveis (${available.length})`,
        ].filter(Boolean);

        for (const a of available) {
          const carga = a.turmasDoDia > 0 ? ` *(${a.turmasDoDia} turma(s) no dia)*` : '';
          lines.push(`- **${a.name}** (id: ${a.id}) — ${a.base}${carga}`);
          if (a.skills?.length) lines.push(`  Skills: ${a.skills.slice(0, 5).join(', ')}`);
        }

        if (busy.length > 0) {
          lines.push('', `## Ausentes (${busy.length})`);
          for (const b of busy) {
            lines.push(`- ${b.name} — ${b.reason}`);
          }
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: {
            date: resolvedDate,
            available,
            busy,
            totalAvailable: available.length,
          },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // ── rl360_consultar_contratos_vencendo ────────────────────────────────────
  server.registerTool(
    'rl360_consultar_contratos_vencendo',
    {
      title: 'Consultar Contratos Vencendo',
      description: `Lista instrutores Freelancer/PJ com contratos prestes a vencer ou já vencidos.
Útil para alerta proativo de renovações necessárias.

Args:
  - dias (number): Alertar contratos vencendo em até N dias (padrão: 30)`,
      inputSchema: z.object({
        dias: z.number().int().min(0).max(365).default(30)
          .describe('Alertar contratos vencendo em até N dias'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ dias }) => {
      try {
        const instructors = await fetchInstructors();
        const today = todayISO();
        const limitDate = addDays(today, dias);

        const expiring = instructors
          .filter(i =>
            i.status === 'Ativo' &&
            (i.contract === 'Freelancer' || i.contract === 'PJ') &&
            i.contractEndDate &&
            i.contractEndDate <= limitDate
          )
          .sort((a, b) => (a.contractEndDate ?? '').localeCompare(b.contractEndDate ?? ''));

        if (expiring.length === 0) {
          return {
            content: [{ type: 'text', text: `Nenhum contrato vencendo nos próximos ${dias} dias. ✅` }],
          };
        }

        const lines = [`# Contratos vencendo em até ${dias} dias`, ''];
        for (const i of expiring) {
          const status = i.contractEndDate! < today ? '🔴 VENCIDO' : '🟡 A vencer';
          lines.push(`- **${i.name}** — ${status} em ${fmtDateBR(i.contractEndDate!)} (${i.contract}, ${i.base})`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: {
            count: expiring.length,
            contracts: expiring.map(i => ({
              id: i.id, name: i.name, contract: i.contract,
              base: i.base, contractEndDate: i.contractEndDate,
              expired: (i.contractEndDate ?? '') < today,
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
}

// ── UTILITÁRIOS LOCAIS ────────────────────────────────────────────────────────

function resolveDate(input: string): string {
  const norm = input.toLowerCase().trim();
  const today = new Date();

  if (norm === 'hoje') {
    return today.toISOString().slice(0, 10);
  }
  if (norm === 'amanhã' || norm === 'amanha') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  }
  if (norm === 'ontem') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().slice(0, 10);
  }
  // Assume YYYY-MM-DD
  return input.trim();
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export { resolveDate };
