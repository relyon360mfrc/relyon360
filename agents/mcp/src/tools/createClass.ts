import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  fetchInstructors, fetchAbsences, fetchHolidays, fetchTrainings,
  fetchSchedulesInRange, insertSchedules, fmtDateBR, fetchEadConfig,
} from '../services/supabase.js';
import { ROLE_PT } from '../constants.js';
import { resolveDate } from './instructors.js';
import { planTurma, PlannerTraining, PlannerInstructor, PlannerAbsence, PlannerHoliday, ScheduleRowLike } from '../planner.js';

// Quantos dias à frente buscar programação existente para detectar conflitos.
// Um CBSP (40h) ocupa ~5 dias; 21 dá folga para qualquer curso longo.
const CONFLICT_WINDOW_DAYS = 21;

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function registerCreateClassTools(server: McpServer): void {

  server.registerTool(
    'rl360_criar_turma',
    {
      title: 'Criar Turma',
      description: `Cria uma turma nova na programação (relyon_schedules), replicando a lógica do
wizard do app: explode o treinamento nos seus módulos, calcula os horários (com almoço e
quebra entre dias), atribui instrutores e locais, e detecta conflitos.

REGRA DE ALOCAÇÃO:
  - Instrutores "CLT Offshore" são EXCLUÍDOS por padrão.
  - "CLT" tem prioridade; "Freelancer" só entra quando esgotam os CLT qualificados e livres.
  - Dentro da turma, varia o mínimo de instrutor/local (continuidade).

SEGURANÇA: por padrão é um PREVIEW (dry-run) — NÃO grava nada. Revise o resultado e
chame de novo com confirmar=true para efetivar a inserção.

Args:
  - treinamento (string): GCC (ex: "OBS308"), nome ou shortName do treinamento (ex: "CBSP")
  - nome_turma (string): Nome/identificador da turma (ex: "CBSP 01", "EC 8h 02")
  - data (string): Data de início — YYYY-MM-DD, "hoje" ou "amanhã"
  - hora_inicio (string, opcional): Horário de início (padrão "08:00")
  - alunos (string|number, opcional): Quantidade de alunos
  - observacao (string, opcional): Observação da turma
  - com_tradutor (boolean, opcional): Adiciona slot de tradutor em cada módulo
  - permitir_freelancer (boolean, opcional): default true; se false, só CLT
  - planning_type (string, opcional): "base" (padrão), "incompany", "ead", "offshore"
  - base (string, opcional): base da turma (padrão "Macaé")
  - confirmar (boolean, opcional): default false (preview). true = grava no banco.

Returns:
  Preview detalhado (módulos, datas/horários, instrutores, lacunas) ou confirmação da gravação.`,
      inputSchema: z.object({
        treinamento:         z.string().min(2).describe('GCC, nome ou shortName do treinamento'),
        nome_turma:          z.string().min(1).describe('Nome/identificador da turma'),
        data:                z.string().describe('Data de início — YYYY-MM-DD, "hoje" ou "amanhã"'),
        hora_inicio:         z.string().optional().describe('Horário de início (padrão 08:00)'),
        alunos:              z.union([z.string(), z.number()]).optional().describe('Quantidade de alunos'),
        observacao:          z.string().optional().describe('Observação da turma'),
        com_tradutor:        z.boolean().optional().describe('Adiciona slot de tradutor'),
        permitir_freelancer: z.boolean().optional().describe('default true; false = só CLT'),
        planning_type:       z.string().optional().describe('base | incompany | ead | offshore'),
        base:                z.string().optional().describe('Base da turma (padrão Macaé)'),
        confirmar:           z.boolean().optional().describe('default false (preview). true grava.'),
      }),
      annotations: {
        readOnlyHint:    false,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   false,
      },
    },
    async (args) => {
      try {
        const {
          treinamento, nome_turma, data,
          hora_inicio = '08:00', alunos, observacao,
          com_tradutor = false, permitir_freelancer = true,
          planning_type = 'base', base = 'Macaé', confirmar = false,
        } = args;

        // Validação contra listas canônicas (multi-base): base/planning_type viram
        // colunas FILTRÁVEIS no app — valor desconhecido gravaria lixo invisível.
        const VALID_BASES = ['Macaé', 'Bangu', 'Offshore'];
        const VALID_PLANNING_TYPES = ['base', 'incompany', 'ead', 'offshore'];
        if (!VALID_BASES.includes(base)) {
          return { content: [{ type: 'text' as const, text: `Base inválida: "${base}". Use uma de: ${VALID_BASES.join(', ')}.` }] };
        }
        if (!VALID_PLANNING_TYPES.includes(planning_type)) {
          return { content: [{ type: 'text' as const, text: `planning_type inválido: "${planning_type}". Use um de: ${VALID_PLANNING_TYPES.join(', ')}.` }] };
        }

        const startDate = resolveDate(data);

        const [instructorsRaw, absencesRaw, holidaysRaw, trainingsRaw, eadConfig] = await Promise.all([
          fetchInstructors(),
          fetchAbsences(),
          fetchHolidays(),
          fetchTrainings(),
          fetchEadConfig(),
        ]);

        // Resolver treinamento por GCC > shortName > nome (case-insensitive).
        const q = treinamento.trim().toLowerCase();
        const trainings = trainingsRaw as unknown as PlannerTraining[];
        const training =
          trainings.find(t => (t.gcc || '').toLowerCase() === q) ||
          trainings.find(t => (t.shortName || '').toLowerCase() === q) ||
          trainings.find(t => (t.name || '').toLowerCase() === q) ||
          trainings.find(t => (t.name || '').toLowerCase().includes(q));

        if (!training) {
          return { content: [{ type: 'text', text: `Treinamento "${treinamento}" não encontrado (tente o GCC, ex: OBS308, ou o shortName, ex: CBSP).` }] };
        }

        const externalSchedules = (await fetchSchedulesInRange(
          startDate, addDaysISO(startDate, CONFLICT_WINDOW_DAYS),
        )) as unknown as ScheduleRowLike[];

        const result = planTurma(
          {
            training,
            className: nome_turma,
            startDate,
            startTime: hora_inicio,
            studentCount: alunos,
            observation: observacao,
            base,
            planningType: planning_type,
            withTranslator: com_tradutor,
            allowFreelancer: permitir_freelancer,
          },
          {
            instructors: instructorsRaw as unknown as PlannerInstructor[],
            absences: absencesRaw as unknown as PlannerAbsence[],
            holidays: holidaysRaw as unknown as PlannerHoliday[],
            externalSchedules,
            activeModeratorId: eadConfig.activeModeratorId ?? null,
          },
        );

        // Monta o resumo legível (agrupado por data → módulo).
        const lines: string[] = [];
        lines.push(`# ${confirmar ? '✅ Turma criada' : '👁️ Preview de turma (NÃO gravado)'} — ${result.className}`);
        lines.push(`Treinamento: **${training.name}** (${result.trainingGcc}) · ${result.rows.length} slots · ${result.span.from === result.span.to ? fmtDateBR(result.span.from) : `${fmtDateBR(result.span.from)} → ${fmtDateBR(result.span.to)}`}`);
        if (result.instructorNames.length) lines.push(`Instrutores: ${result.instructorNames.join(', ')}`);
        lines.push('');

        const byDate = new Map<string, typeof result.rows>();
        for (const r of result.rows) {
          const arr = byDate.get(r.date) ?? [];
          arr.push(r);
          byDate.set(r.date, arr);
        }
        for (const [date, rs] of [...byDate.entries()].sort()) {
          lines.push(`## ${fmtDateBR(date)}`);
          for (const r of rs) {
            const role = ROLE_PT[r.role] ?? r.role;
            const who = r.instructorName || '❌ SEM INSTRUTOR';
            lines.push(`- ${r.startTime}–${r.endTime} | ${r.module} | ${role} | **${who}** | ${r.local || '—'}`);
          }
          lines.push('');
        }

        if (result.gaps.length) {
          lines.push(`## ⚠️ Lacunas sem instrutor (${result.gaps.length})`);
          for (const g of result.gaps) {
            lines.push(`- ${fmtDateBR(g.date)} ${g.startTime} | ${g.module} | ${ROLE_PT[g.role] ?? g.role} — ${g.reason}`);
          }
          lines.push('');
        }
        if (result.warnings.length) {
          lines.push(`## Avisos`);
          for (const w of result.warnings) lines.push(`- ${w}`);
          lines.push('');
        }

        let inserted = 0;
        if (confirmar) {
          inserted = await insertSchedules(result.rows as unknown as Record<string, unknown>[]);
          lines.push(`---`);
          lines.push(`**${inserted} slots gravados** em relyon_schedules. classId: \`${result.classId}\``);
        } else {
          lines.push(`---`);
          lines.push(`_Preview apenas. Para gravar, chame de novo com **confirmar=true**._`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: {
            confirmed: confirmar,
            inserted,
            classId: result.classId,
            className: result.className,
            trainingGcc: result.trainingGcc,
            slots: result.rows.length,
            span: result.span,
            instructors: result.instructorNames,
            gaps: result.gaps,
            warnings: result.warnings,
          },
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Erro ao criar turma: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    },
  );
}
