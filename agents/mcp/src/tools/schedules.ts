import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  fetchInstructors, fetchAbsences, fetchActivities, fetchSchedulesByDate,
  fetchSchedulesByInstructor, fetchTrainings, fetchHolidays,
  updateScheduleInstructor, resolveInstructorsByName,
  isAbsentOn, getSchedulesForInstructor, fmtDateBR, todayISO,
} from '../services/supabase.js';
import { ROLE_PT, ACTIVITY_TYPES } from '../constants.js';
import { resolveDate } from './instructors.js';
import type { ScheduleRow, Activity, Absence, Instructor } from '../types.js';

// Item unificado da "programação" de um instrutor num dia: turma, atividade interna ou ausência.
interface ProgramItem {
  date: string;
  startTime: string;  // "00:00" para itens de dia inteiro (ordenação)
  endTime: string;
  kind: 'turma' | 'atividade' | 'ausencia';
  label: string;       // ex: "Turma", "Manutenção", "Férias"
  detail: string;      // descrição da linha
  fullDay: boolean;
  ref: ScheduleRow | Activity | Absence;
}

function buildProgramItems(
  date: string,
  schedules: ScheduleRow[],
  activities: Activity[],
  absences: Absence[],
): ProgramItem[] {
  const items: ProgramItem[] = [];

  for (const r of schedules) {
    const role = r.role ? (ROLE_PT[r.role] ?? r.role) : '';
    items.push({
      date,
      startTime: r.startTime,
      endTime: r.endTime,
      kind: 'turma',
      label: 'Turma',
      detail: `${r.classId} | ${r.moduleName ?? ''} | ${role} | ${r.local}`,
      fullDay: false,
      ref: r,
    });
  }

  for (const a of activities.filter(x => x.date === date)) {
    const label = ACTIVITY_TYPES[a.type] ?? a.type;
    const fullDay = !a.startTime;
    items.push({
      date,
      startTime: fullDay ? '00:00' : (a.startTime as string),
      endTime: fullDay ? '23:59' : (a.endTime ?? a.startTime as string),
      kind: 'atividade',
      label,
      detail: [a.local, a.obs].filter(Boolean).join(' — '),
      fullDay,
      ref: a,
    });
  }

  for (const ab of absences) {
    const start = ab.startDate, end = ab.endDate ?? ab.startDate;
    if (!(start <= date && date <= end)) continue;
    const fullDay = !ab.startTime;
    items.push({
      date,
      startTime: fullDay ? '00:00' : (ab.startTime as string),
      endTime: fullDay ? '23:59' : (ab.endTime ?? ab.startTime as string),
      kind: 'ausencia',
      label: ab.category,
      detail: ab.obs ?? '',
      fullDay,
      ref: ab,
    });
  }

  items.sort((a, b) => a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date));
  return items;
}

export function registerScheduleTools(server: McpServer): void {

  // ── rl360_resumo_do_dia ────────────────────────────────────────────────────
  server.registerTool(
    'rl360_resumo_do_dia',
    {
      title: 'Resumo do Dia',
      description: `Retorna um snapshot completo de uma data: turmas programadas, instrutores escalados,
ausências registradas e conflitos detectados (vagas sem instrutor, ausentes escalados).
É o ponto de partida ideal antes de tomar qualquer decisão operacional.

Args:
  - data (string): Data no formato YYYY-MM-DD, "hoje" ou "amanhã"

Returns:
  Resumo completo com turmas, ausências e conflitos do dia.`,
      inputSchema: z.object({
        data: z.string().describe('Data — YYYY-MM-DD, "hoje" ou "amanhã"'),
      }),
      annotations: {
        readOnlyHint:    true,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async ({ data }) => {
      try {
        const resolvedDate = resolveDate(data);

        const [schedules, absences, holidays] = await Promise.all([
          fetchSchedulesByDate(resolvedDate),
          fetchAbsences(),
          fetchHolidays(),
        ]);

        const holiday = holidays.find(h => h.date === resolvedDate);
        const absencesDodia = absences.filter(a => {
          const end = a.endDate ?? a.startDate;
          return a.startDate <= resolvedDate && resolvedDate <= end;
        });

        // Agrupar por turma (classId)
        const classMap = new Map<string, ScheduleRow[]>();
        for (const row of schedules) {
          const arr = classMap.get(row.classId) ?? [];
          arr.push(row);
          classMap.set(row.classId, arr);
        }

        // Detectar conflitos
        const conflicts: string[] = [];
        const absentInstructorIds = new Set(absencesDodia.map(a => String(a.instructorId)));

        for (const [classId, rows] of classMap) {
          for (const row of rows) {
            if (!row.instructorId) {
              conflicts.push(`⚠️ Vaga sem instrutor: ${classId} — ${row.moduleName ?? 'módulo'} (${row.role ? (ROLE_PT[row.role] ?? row.role) : '?'}) às ${row.startTime}`);
            } else if (absentInstructorIds.has(String(row.instructorId))) {
              const abs = absencesDodia.find(a => String(a.instructorId) === String(row.instructorId));
              conflicts.push(`🚨 Instrutor ausente escalado: ${row.instructorName ?? row.instructorId} em ${classId} (${abs?.category}) às ${row.startTime}`);
            }
          }
        }

        const lines: string[] = [
          `# Resumo do dia — ${fmtDateBR(resolvedDate)}`,
          holiday ? `🎉 **Feriado:** ${holiday.name}` : '',
          '',
          `## Turmas programadas (${classMap.size} turmas, ${schedules.length} slots)`,
        ].filter(s => s !== null);

        for (const [classId, rows] of classMap) {
          const firstRow = rows[0];
          lines.push(`\n### ${classId}`);
          lines.push(`Status: ${firstRow.status} | ${rows.length} módulo(s)`);
          for (const r of rows) {
            const instrName = r.instructorName ?? (r.instructorId ? `ID ${r.instructorId}` : '❌ SEM INSTRUTOR');
            const role = r.role ? (ROLE_PT[r.role] ?? r.role) : '';
            lines.push(`- ${r.startTime}–${r.endTime} | ${r.moduleName ?? 'módulo'} | ${role} | **${instrName}** | ${r.local}`);
          }
        }

        if (absencesDodia.length > 0) {
          lines.push('', `## Ausências (${absencesDodia.length})`);
          for (const a of absencesDodia) {
            lines.push(`- **${a.instructorName}** — ${a.category}`);
          }
        }

        if (conflicts.length > 0) {
          lines.push('', `## ⚠️ Conflitos detectados (${conflicts.length})`);
          lines.push(...conflicts);
        } else {
          lines.push('', '## ✅ Nenhum conflito detectado');
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: {
            date: resolvedDate,
            holiday: holiday ?? null,
            totalClasses: classMap.size,
            totalSlots: schedules.length,
            absences: absencesDodia,
            conflicts,
            hasConflicts: conflicts.length > 0,
          },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // ── rl360_consultar_programacao ────────────────────────────────────────────
  server.registerTool(
    'rl360_consultar_programacao',
    {
      title: 'Consultar Programação',
      description: `Lista todas as turmas programadas para uma data específica.
Pode filtrar por base ou por tipo de programação.

Args:
  - data (string): Data — YYYY-MM-DD, "hoje" ou "amanhã"
  - base (string, opcional): Filtrar por base — "Macaé", "Bangu", "Offshore"
  - classId (string, opcional): Filtrar por ID de turma específica`,
      inputSchema: z.object({
        data:    z.string().describe('Data — YYYY-MM-DD, "hoje" ou "amanhã"'),
        base:    z.string().optional().describe('Filtrar por base'),
        classId: z.string().optional().describe('ID da turma específica'),
      }),
      annotations: {
        readOnlyHint:    true,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async ({ data, base, classId }) => {
      try {
        const resolvedDate = resolveDate(data);
        let schedules = await fetchSchedulesByDate(resolvedDate);

        if (base) {
          schedules = schedules.filter(r =>
            r.base?.toLowerCase().includes(base.toLowerCase())
          );
        }
        if (classId) {
          schedules = schedules.filter(r => r.classId === classId);
        }

        if (schedules.length === 0) {
          return {
            content: [{ type: 'text', text: `Nenhuma turma programada para ${fmtDateBR(resolvedDate)}${base ? ` na base ${base}` : ''}.` }],
          };
        }

        // Agrupar por classId
        const classMap = new Map<string, ScheduleRow[]>();
        for (const row of schedules) {
          const arr = classMap.get(row.classId) ?? [];
          arr.push(row);
          classMap.set(row.classId, arr);
        }

        const lines = [`# Programação — ${fmtDateBR(resolvedDate)}`, ''];
        for (const [cls, rows] of classMap) {
          lines.push(`## ${cls} (${rows[0].status})`);
          for (const r of rows) {
            const instrName = r.instructorName ?? (r.instructorId ? `ID ${r.instructorId}` : '— SEM INSTRUTOR');
            const role = r.role ? (ROLE_PT[r.role] ?? r.role) : '';
            lines.push(`- ${r.startTime}–${r.endTime} | ${r.moduleName ?? ''} | ${role} | ${instrName} | ${r.local}`);
          }
          lines.push('');
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: {
            date: resolvedDate,
            classes: Array.from(classMap.entries()).map(([cls, rows]) => ({ classId: cls, rows })),
          },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // ── rl360_consultar_turmas_instrutor ───────────────────────────────────────
  server.registerTool(
    'rl360_consultar_turmas_instrutor',
    {
      title: 'Consultar Programação do Instrutor',
      description: `Lista a programação completa de um instrutor em um período — não apenas turmas.
Inclui: turmas/treinamentos, atividades internas (Manutenção, Desenvolvimento/PDI,
Apoio CS/Almoxarifado/Cenário, Treinamento Obrigatório, Livre, etc. — "Linha do Tempo")
e ausências (Férias, Folga, Folga Banco de Horas, Atestado, etc.).
Tudo é tratado como "programação do dia" do instrutor — é assim que o app organiza a agenda.

Args:
  - nome_instrutor (string): Nome do instrutor
  - data_inicio (string): Data início — YYYY-MM-DD, "hoje" ou "amanhã"
  - data_fim (string, opcional): Data fim (padrão: mesma que data_inicio)`,
      inputSchema: z.object({
        nome_instrutor: z.string().min(2).describe('Nome do instrutor'),
        data_inicio:    z.string().describe('Data início — YYYY-MM-DD, "hoje" ou "amanhã"'),
        data_fim:       z.string().optional().describe('Data fim (padrão: data_inicio)'),
      }),
      annotations: {
        readOnlyHint:    true,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async ({ nome_instrutor, data_inicio, data_fim }) => {
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
        const from = resolveDate(data_inicio);
        const to   = data_fim ? resolveDate(data_fim) : from;

        const [scheduleRows, allActivities, allAbsences] = await Promise.all([
          fetchSchedulesByInstructor(instr.id, from, to),
          fetchActivities(),
          fetchAbsences(),
        ]);

        const instrActivities = allActivities.filter(a => String(a.instructorId) === String(instr.id) && a.date >= from && a.date <= to);
        const instrAbsences   = allAbsences.filter(a => {
          if (String(a.instructorId) !== String(instr.id)) return false;
          const end = a.endDate ?? a.startDate;
          return a.startDate <= to && end >= from;
        });

        // Monta a lista de dias do período e agrega item-a-item
        const days: string[] = [];
        for (let d = from; d <= to; ) {
          days.push(d);
          const [y, m, dd] = d.split('-').map(Number);
          const next = new Date(Date.UTC(y, m - 1, dd + 1));
          d = next.toISOString().slice(0, 10);
        }

        const byDay = new Map<string, ProgramItem[]>();
        for (const day of days) {
          const dayScheduleRows = scheduleRows.filter(r => r.date === day);
          const items = buildProgramItems(day, dayScheduleRows, instrActivities, instrAbsences);
          if (items.length > 0) byDay.set(day, items);
        }

        if (byDay.size === 0) {
          return {
            content: [{ type: 'text', text: `${instr.name} não tem programação registrada de ${fmtDateBR(from)} a ${fmtDateBR(to)}.` }],
          };
        }

        const KIND_ICON: Record<string, string> = { turma: '🎓', atividade: '🔧', ausencia: '🌴' };

        const lines = [`# Programação de ${instr.name}`, `Período: ${fmtDateBR(from)} a ${fmtDateBR(to)}`, ''];
        for (const [day, items] of byDay) {
          lines.push(`## ${fmtDateBR(day)}`);
          for (const it of items) {
            const icon = KIND_ICON[it.kind];
            const horario = it.fullDay ? 'Dia inteiro' : `${it.startTime}–${it.endTime}`;
            const detail = it.detail ? ` — ${it.detail}` : '';
            lines.push(`- ${icon} **${horario}** | ${it.label}${detail}`);
          }
          lines.push('');
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: {
            instructor: { id: instr.id, name: instr.name },
            days: Array.from(byDay.entries()).map(([date, items]) => ({
              date,
              items: items.map(it => ({
                kind: it.kind,
                label: it.label,
                startTime: it.startTime,
                endTime: it.endTime,
                fullDay: it.fullDay,
                detail: it.detail,
              })),
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

  // ── rl360_buscar_substituto ────────────────────────────────────────────────
  server.registerTool(
    'rl360_buscar_substituto',
    {
      title: 'Buscar Substituto',
      description: `Sugere instrutores disponíveis para substituir alguém em uma turma específica.
Considera: disponibilidade no dia, mesma base, competências compatíveis com o papel.

Args:
  - classId (string): ID da turma (ex: "CBSP 1")
  - data (string): Data da turma — YYYY-MM-DD, "hoje" ou "amanhã"
  - role (string, opcional): Papel necessário — ex: "Translator", "Lead Instructor", "Practical Instructor"
  - nome_ausente (string, opcional): Nome do instrutor que está faltando (para contexto)

Returns:
  Lista rankeada de substitutos disponíveis com competências e carga do dia.`,
      inputSchema: z.object({
        classId:      z.string().describe('ID da turma (ex: "CBSP 1", "NR35 01")'),
        data:         z.string().describe('Data da turma — YYYY-MM-DD, "hoje" ou "amanhã"'),
        role:         z.string().optional().describe('Papel necessário (ex: Translator, Lead Instructor)'),
        nome_ausente: z.string().optional().describe('Nome do instrutor ausente (para contexto)'),
      }),
      annotations: {
        readOnlyHint:    true,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async ({ classId, data, role, nome_ausente }) => {
      try {
        const resolvedDate = resolveDate(data);

        const [instructors, absences, schedules] = await Promise.all([
          fetchInstructors(),
          fetchAbsences(),
          fetchSchedulesByDate(resolvedDate),
        ]);

        // Descobrir base da turma e role necessário
        const turmaRows = schedules.filter(r => r.classId === classId);
        const targetRow = turmaRows.find(r => !role || r.role === role);

        let requiredRole = role ?? targetRow?.role;
        let turmaBase    = targetRow?.base;

        // Instrutor ausente (para não sugerir ele mesmo)
        let absenteId: number | null = null;
        if (nome_ausente) {
          const absenteMatches = resolveInstructorsByName(nome_ausente, instructors);
          if (absenteMatches.length === 1) absenteId = absenteMatches[0].id;
        }

        // Candidatos ativos, mesma base (se conhecida)
        let candidates = instructors.filter(i => {
          if (i.status !== 'Ativo') return false;
          if (absenteId && i.id === absenteId) return false;
          if (turmaBase && i.base !== turmaBase) return false;
          return true;
        });

        // Filtrar por skill se o role exige competência especial
        if (requiredRole === 'Translator') {
          candidates = candidates.filter(i =>
            (i.skills || []).some(s => s.toUpperCase().includes('TRADUTOR'))
          );
        } else if (requiredRole === 'Scuba Diver') {
          candidates = candidates.filter(i =>
            (i.skills || []).some(s => s.toUpperCase().includes('SCUBA_DIVER'))
          );
        } else if (requiredRole === 'Crane Operator') {
          candidates = candidates.filter(i =>
            (i.skills || []).some(s => s.toUpperCase().includes('CRANE_OPERATOR'))
          );
        }

        // Score: disponível e carga do dia
        const ranked: Array<{
          instructor: Instructor;
          available: boolean;
          absenceReason?: string;
          turmasDoDia: number;
          score: number;
        }> = [];

        for (const instr of candidates) {
          const absence = isAbsentOn(instr.id, resolvedDate, absences);
          const instrSchedules = getSchedulesForInstructor(instr.id, resolvedDate, schedules);
          const turmasDoDia = instrSchedules.length;

          const available = !absence;
          const score = available ? (10 - Math.min(turmasDoDia, 9)) : 0;

          ranked.push({
            instructor: instr,
            available,
            absenceReason: absence?.category,
            turmasDoDia,
            score,
          });
        }

        ranked.sort((a, b) => b.score - a.score);

        const available = ranked.filter(r => r.available);
        const unavailable = ranked.filter(r => !r.available);

        if (available.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `Nenhum substituto disponível para ${classId} em ${fmtDateBR(resolvedDate)}${requiredRole ? ` (${ROLE_PT[requiredRole] ?? requiredRole})` : ''}.\n\nIndisponíveis: ${unavailable.map(r => r.instructor.name).join(', ') || '—'}`,
            }],
          };
        }

        const lines = [
          `# Substitutos para ${classId} — ${fmtDateBR(resolvedDate)}`,
          requiredRole ? `Papel necessário: **${ROLE_PT[requiredRole] ?? requiredRole}**` : '',
          nome_ausente ? `Substituindo: **${nome_ausente}**` : '',
          '',
          `## Disponíveis (${available.length})`,
        ].filter(Boolean);

        for (const r of available) {
          const carga = r.turmasDoDia > 0 ? ` *(já tem ${r.turmasDoDia} turma(s) hoje)*` : '';
          lines.push(`- **${r.instructor.name}** (id: ${r.instructor.id}) — ${r.instructor.base}${carga}`);
          if (r.instructor.skills?.length) {
            lines.push(`  Skills: ${r.instructor.skills.slice(0, 5).join(', ')}`);
          }
        }

        if (unavailable.length > 0) {
          lines.push('', `## Indisponíveis (${unavailable.length})`);
          for (const r of unavailable) {
            lines.push(`- ${r.instructor.name} — ${r.absenceReason}`);
          }
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: {
            classId,
            date: resolvedDate,
            requiredRole,
            available: available.map(r => ({
              id: r.instructor.id,
              name: r.instructor.name,
              base: r.instructor.base,
              turmasDoDia: r.turmasDoDia,
              skills: r.instructor.skills ?? [],
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

  // ── rl360_trocar_instrutor ─────────────────────────────────────────────────
  server.registerTool(
    'rl360_trocar_instrutor',
    {
      title: 'Trocar Instrutor em Turma',
      description: `Substitui um instrutor por outro em uma turma específica.
Atualiza o banco de dados (relyon_schedules) e marca o slot como Pendente.

ATENÇÃO: Esta ação é IRREVERSÍVEL pela API. Para desfazer, execute novamente com os instrutores invertidos.

Args:
  - classId (string): ID da turma (ex: "CBSP 1")
  - data (string): Data da turma — YYYY-MM-DD, "hoje" ou "amanhã"
  - nome_atual (string): Nome do instrutor atual (quem vai sair)
  - nome_novo (string): Nome do novo instrutor (quem vai entrar)
  - role (string, opcional): Filtrar slot pelo papel específico (ex: "Translator")

Returns:
  Confirmação da troca com detalhes do slot atualizado.`,
      inputSchema: z.object({
        classId:    z.string().describe('ID da turma'),
        data:       z.string().describe('Data da turma — YYYY-MM-DD, "hoje" ou "amanhã"'),
        nome_atual: z.string().describe('Nome do instrutor atual (quem vai sair)'),
        nome_novo:  z.string().describe('Nome do novo instrutor (quem vai entrar)'),
        role:       z.string().optional().describe('Papel específico do slot (ex: Translator)'),
      }),
      annotations: {
        readOnlyHint:    false,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async ({ classId, data, nome_atual, nome_novo, role }) => {
      try {
        const resolvedDate = resolveDate(data);
        const instructors = await fetchInstructors();

        // Resolver instrutor atual
        const atualMatches = resolveInstructorsByName(nome_atual, instructors);
        if (atualMatches.length === 0) {
          return { content: [{ type: 'text', text: `Instrutor "${nome_atual}" não encontrado.` }] };
        }
        if (atualMatches.length > 1) {
          return { content: [{ type: 'text', text: `Nome ambíguo: "${nome_atual}" — ${atualMatches.map(i => i.name).join(', ')}. Seja mais específico.` }] };
        }

        // Resolver novo instrutor
        const novoMatches = resolveInstructorsByName(nome_novo, instructors);
        if (novoMatches.length === 0) {
          return { content: [{ type: 'text', text: `Instrutor "${nome_novo}" não encontrado.` }] };
        }
        if (novoMatches.length > 1) {
          return { content: [{ type: 'text', text: `Nome ambíguo: "${nome_novo}" — ${novoMatches.map(i => i.name).join(', ')}. Seja mais específico.` }] };
        }

        const instrAtual = atualMatches[0];
        const instrNovo  = novoMatches[0];

        // Buscar o slot na programação
        const schedules = await fetchSchedulesByDate(resolvedDate);
        const slot = schedules.find(r => {
          if (r.classId !== classId) return false;
          if (String(r.instructorId) !== String(instrAtual.id)) return false;
          if (role && r.role !== role) return false;
          return true;
        });

        if (!slot) {
          return {
            content: [{
              type: 'text',
              text: `Slot não encontrado: turma "${classId}" com ${instrAtual.name} em ${fmtDateBR(resolvedDate)}${role ? ` (${ROLE_PT[role] ?? role})` : ''}.`,
            }],
          };
        }

        // Executar a troca
        await updateScheduleInstructor(slot.id, instrNovo.id, instrNovo.name);

        const roleLabel = slot.role ? (ROLE_PT[slot.role] ?? slot.role) : '';

        return {
          content: [{
            type: 'text',
            text: [
              `✅ Troca realizada com sucesso!`,
              ``,
              `**Turma:** ${classId} — ${fmtDateBR(resolvedDate)}`,
              `**Módulo:** ${slot.moduleName ?? ''} (${slot.startTime}–${slot.endTime})`,
              `**Papel:** ${roleLabel}`,
              `**Local:** ${slot.local}`,
              ``,
              `**De:** ${instrAtual.name}`,
              `**Para:** ${instrNovo.name}`,
              ``,
              `_Status do slot definido como "Pendente" — confirmar se necessário._`,
            ].join('\n'),
          }],
          structuredContent: {
            success: true,
            slotId: slot.id,
            classId,
            date: resolvedDate,
            from: { id: instrAtual.id, name: instrAtual.name },
            to:   { id: instrNovo.id,  name: instrNovo.name  },
          },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro ao trocar instrutor: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  // ── rl360_consultar_conflitos ──────────────────────────────────────────────
  server.registerTool(
    'rl360_consultar_conflitos',
    {
      title: 'Consultar Conflitos',
      description: `Detecta problemas na programação de uma data: vagas sem instrutor, instrutores ausentes escalados, etc.

Args:
  - data (string): Data — YYYY-MM-DD, "hoje" ou "amanhã"`,
      inputSchema: z.object({
        data: z.string().describe('Data — YYYY-MM-DD, "hoje" ou "amanhã"'),
      }),
      annotations: {
        readOnlyHint:    true,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async ({ data }) => {
      try {
        const resolvedDate = resolveDate(data);
        const [schedules, absences] = await Promise.all([
          fetchSchedulesByDate(resolvedDate),
          fetchAbsences(),
        ]);

        const absencesDodia = absences.filter(a => {
          const end = a.endDate ?? a.startDate;
          return a.startDate <= resolvedDate && resolvedDate <= end;
        });
        const absentIds = new Set(absencesDodia.map(a => String(a.instructorId)));

        const conflicts: Array<{ type: string; classId: string; detail: string }> = [];

        for (const row of schedules) {
          if (!row.instructorId) {
            conflicts.push({
              type: 'sem_instrutor',
              classId: row.classId,
              detail: `${row.classId} — ${row.moduleName ?? 'módulo'} (${ROLE_PT[row.role ?? ''] ?? row.role}) às ${row.startTime}`,
            });
          } else if (absentIds.has(String(row.instructorId))) {
            const abs = absencesDodia.find(a => String(a.instructorId) === String(row.instructorId));
            conflicts.push({
              type: 'ausente_escalado',
              classId: row.classId,
              detail: `${row.instructorName ?? row.instructorId} ausente (${abs?.category}) escalado em ${row.classId} às ${row.startTime}`,
            });
          }
        }

        if (conflicts.length === 0) {
          return {
            content: [{ type: 'text', text: `✅ Nenhum conflito detectado em ${fmtDateBR(resolvedDate)}.` }],
            structuredContent: { date: resolvedDate, conflicts: [], hasConflicts: false },
          };
        }

        const lines = [`# Conflitos — ${fmtDateBR(resolvedDate)}`, ''];
        for (const c of conflicts) {
          const icon = c.type === 'ausente_escalado' ? '🚨' : '⚠️';
          lines.push(`${icon} ${c.detail}`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: { date: resolvedDate, conflicts, hasConflicts: true },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );
}
