/**
 * planner.ts — NÚCLEO PURO de planejamento de turma (sem React, sem DB, sem MCP).
 *
 * Porta fiel da lógica do wizard do app (js/schedule.js `_doInitPlan` + `savePlan`
 * + js/config.js `recalcTimes` + js/constants.js `sortModules`/`checkSlotConflictG`/
 * `isInstructorAbsent`/`isHoliday`/`skillMatchesModule`), com UMA regra a mais que o
 * app não tem nativamente: PRIORIDADE DE CONTRATO.
 *
 *   - Instrutores "CLT Offshore" são EXCLUÍDOS do pool (regra do operador).
 *   - "CLT" tem prioridade sobre "Freelancer" (Freelancer só entra quando esgotam os
 *     CLT qualificados e livres).
 *   - Dentro de uma mesma turma, varia o MÍNIMO de instrutor/local (continuidade via
 *     committedInstrs/preferredLocals — herdado do wizard).
 *
 * Mantém-se PURO de propósito (igual js/core.cjs): recebe só dados, devolve só a
 * decisão (rows prontas + lacunas). Quem executa efeitos (ler/gravar Supabase) é o
 * chamador (a tool MCP ou o runner de lote).
 */

// ── Tipos (subconjunto do que o planner precisa) ──────────────────────────────
export interface PlannerSkill {
  name?: string;
  canLead?: boolean;
  moduleId?: number | string;
  trainingId?: number | string;
  validUntil?: string;
}
export interface PlannerInstructor {
  id: number;
  name: string;
  contract: string;   // "CLT" | "CLT Offshore" | "Freelancer" | "PJ"
  base: string;
  status: string;     // "Ativo" | "Inativo"
  skills?: (PlannerSkill | string)[];
}
export interface PlannerModule {
  id: number | string;
  name: string;
  type?: string;       // "TEORIA" | "PRÁTICA"
  minutes?: number;
  instructorCount?: number;
  locals?: string[];
  priority?: number;
  isHuet?: boolean;
}
export interface PlannerTraining {
  id: number | string;
  gcc?: string;
  shortName?: string;
  area?: number;
  name: string;
  modules?: PlannerModule[];
  lunchSchedule?: { start?: number | string; end?: number | string } | null;
  defaultSchedule?: boolean;
  horarioFim?: string;
}
export interface PlannerAbsence {
  instructorId: number | string;
  category: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
}
export interface PlannerHoliday {
  date: string;
  name: string;
  scope?: string;   // "national" | "base"
  base?: string;
}
// Forma mínima de uma row de relyon_schedules necessária para detecção de conflito.
export interface ScheduleRowLike {
  className?: string;
  date: string;
  startTime: string;
  endTime: string;
  instructorId?: number | null;
  local?: string;
}
// Row completa pronta para inserir em relyon_schedules (shape de savePlan).
export interface NewScheduleRow {
  id: number;
  classId: string;
  trainingId: string;
  trainingName: string;
  className: string;
  date: string;
  startTime: string;
  endTime: string;
  local: string;
  instructorId: number | null;
  instructorName: string;
  module: string;
  moduleId: number | string;
  role: string;
  studentCount: string;
  observation: string;
  status: string;
  base: string | null;
  planningType: string;
  linkedClassNames?: string[];
}

// ── Constantes de jornada (espelho de config.js) ──────────────────────────────
const DEFAULT_DAY_END = 17 * 60;   // 17:00
const DEFAULT_DAY_START = 8 * 60;  // 08:00
const DEFAULT_LUNCH = { start: 12 * 60, end: 13 * 60 };

// ── Utilidades de tempo/data ──────────────────────────────────────────────────
export function timeToMins(s?: string): number {
  if (!s) return 0;
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
export function minsToTime(m: number): string {
  const mm = Math.max(0, m);
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}
function addDays(ds: string, n: number): string {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
function lunchFromSchedule(sched?: { start?: number | string; end?: number | string } | null): { start: number; end: number } {
  if (!sched) return DEFAULT_LUNCH;
  const s = typeof sched.start === 'string' ? timeToMins(sched.start) : sched.start;
  const e = typeof sched.end === 'string' ? timeToMins(sched.end) : sched.end;
  if (!Number.isFinite(s as number) || !Number.isFinite(e as number) || (e as number) <= (s as number)) return DEFAULT_LUNCH;
  return { start: s as number, end: e as number };
}

// ── recalcTimes (porta fiel de config.js) ─────────────────────────────────────
interface TimedChunk { mod: PlannerModule; date: string; startTime: string; endTime: string; }
function recalcTimes(
  items: { mod: PlannerModule }[],
  startDateStr: string,
  startMins: number,
  dayEnd: number,
  lunch: { start: number; end: number },
): TimedChunk[] {
  const LUNCH_S = lunch.start, LUNCH_E = lunch.end;
  let curDate = startDateStr, cur = startMins;
  const result: TimedChunk[] = [];
  for (const item of items) {
    let remaining = item.mod?.minutes || 60;
    while (remaining > 0) {
      if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
      if (cur >= dayEnd) { curDate = addDays(curDate, 1); cur = DEFAULT_DAY_START; }
      let periodEnd = cur < LUNCH_S ? LUNCH_S : dayEnd;
      let available = periodEnd - cur;
      if (available <= 0) {
        if (cur < LUNCH_E) { cur = LUNCH_E; periodEnd = dayEnd; available = dayEnd - LUNCH_E; }
        else { curDate = addDays(curDate, 1); cur = DEFAULT_DAY_START; periodEnd = LUNCH_S; available = LUNCH_S - DEFAULT_DAY_START; }
      }
      const chunk = Math.min(remaining, available);
      const endM = cur + chunk;
      result.push({ mod: item.mod, date: curDate, startTime: minsToTime(cur), endTime: minsToTime(endM) });
      remaining -= chunk;
      cur = endM;
      if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
      if (cur >= dayEnd && remaining > 0) { curDate = addDays(curDate, 1); cur = DEFAULT_DAY_START; }
    }
  }
  return result;
}

// ── sortModules (espelho de constants.js) ─────────────────────────────────────
const isReservaName = (n: string) => /TEMPO\s*RESERVA/i.test(n);
const isProvaName = (n: string) => /\bPROVA\b/i.test(n) && !isReservaName(n);
const isRevisaoName = (n: string) => /REVIS[AÃ]O/i.test(n) && !isProvaName(n) && !isReservaName(n);

function sortModules(mods: PlannerModule[]): PlannerModule[] {
  if (!mods || !mods.length) return [];
  const regular = mods.filter(m => !isProvaName(m.name) && !isReservaName(m.name) && !isRevisaoName(m.name));
  regular.sort((a, b) => {
    const at = /CBINC/i.test(a.name), bt = /CBINC/i.test(b.name);
    if (at && bt) {
      if (a.type === 'TEORIA' && b.type === 'PRÁTICA') return -1;
      if (a.type === 'PRÁTICA' && b.type === 'TEORIA') return 1;
    }
    return (a.priority || 99) - (b.priority || 99);
  });
  return [...regular, ...mods.filter(m => isRevisaoName(m.name)), ...mods.filter(m => isProvaName(m.name)), ...mods.filter(m => isReservaName(m.name))];
}

// ── skill / ausência / feriado / conflito (espelho de config/constants) ───────
function skillMatchesModule(skill: PlannerSkill | string, mod: PlannerModule): boolean {
  if (!skill || !mod) return false;
  if (typeof skill !== 'string' && skill.moduleId != null) return String(skill.moduleId) === String(mod.id);
  const name = typeof skill === 'string' ? skill : skill.name;
  return name === mod.name;
}
function hasModuleSkill(instr: PlannerInstructor, mod: PlannerModule): boolean {
  return (instr.skills || []).some(s => skillMatchesModule(s, mod));
}
function canLeadModule(instr: PlannerInstructor, mod: PlannerModule): boolean {
  return (instr.skills || []).some(s => typeof s !== 'string' && skillMatchesModule(s, mod) && !!s.canLead);
}

const FULL_DAY_CATEGORIES = ['Atestado Médico', 'Férias', 'Folga Abonada', 'Embarque', 'Licença Paternidade/Maternidade', 'Suspensão Disciplinar'];
function isInstructorAbsent(instructorId: number, date: string, startMins: number, endMins: number, absences: PlannerAbsence[]): boolean {
  return (absences || []).some(a => {
    if (String(a.instructorId) !== String(instructorId)) return false;
    const aStart = a.startDate, aEnd = a.endDate || a.startDate;
    if (date < aStart || date > aEnd) return false;
    if (FULL_DAY_CATEGORIES.includes(a.category)) return true;
    if (!a.startTime || !a.endTime) return false;
    const absS = timeToMins(a.startTime), absE = timeToMins(a.endTime);
    return startMins < absE && endMins > absS;
  });
}
function isHoliday(date: string, instr: PlannerInstructor | null, holidays: PlannerHoliday[]): boolean {
  if (!holidays || !holidays.length) return false;
  for (const h of holidays) {
    if (h.date !== date) continue;
    if (h.scope === 'national') return true;
    if (!instr) continue;
    if (h.scope === 'base' && instr.base && instr.base === h.base) return true;
  }
  return false;
}
function checkSlotConflict(
  schedules: ScheduleRowLike[], date: string, startTime: string, endTime: string,
  instructorId: string | number | null, local: string | null, ignoreNames: Set<string>,
): { instrConflict: boolean; localConflict: boolean } {
  if (!date || !startTime || !endTime) return { instrConflict: false, localConflict: false };
  const nS = timeToMins(startTime), nE = timeToMins(endTime);
  let instrConflict = false, localConflict = false;
  for (const ex of schedules) {
    if (ex.date !== date) continue;
    if (ex.className && ignoreNames.has(ex.className)) continue;
    const eS = timeToMins(ex.startTime), eE = timeToMins(ex.endTime);
    if (!(nS < eE && eS < nE)) continue;
    if (instructorId != null && instructorId !== '' && ex.instructorId != null && +instructorId === +ex.instructorId) instrConflict = true;
    if (local && ex.local && local === ex.local) localConflict = true;
    if (instrConflict && localConflict) break;
  }
  return { instrConflict, localConflict };
}

// ── Prioridade de contrato ────────────────────────────────────────────────────
function contractRank(contract: string): number {
  if (contract === 'CLT') return 0;
  if (contract === 'Freelancer') return 1;
  return 2; // PJ / outros (CLT Offshore já foi excluído antes)
}

// ── Geração de id (espelho de config.js newScheduleId) ────────────────────────
let _idCounter = 0;
function nextScheduleId(): number {
  return Date.now() * 1000 + (_idCounter++ % 1000);
}
function newClassId(): string {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) return (crypto as any).randomUUID();
  return `cls-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Entrada/saída do planTurma ────────────────────────────────────────────────
export interface PlanTurmaInput {
  training: PlannerTraining;
  className: string;
  startDate: string;
  startTime?: string;             // default "08:00"
  studentCount?: string | number;
  observation?: string;
  base?: string | null;           // default "Macaé"
  planningType?: string;          // default "base"
  withTranslator?: boolean;
  excludeContracts?: string[];    // default ["CLT Offshore"]
  allowFreelancer?: boolean;      // default true
  // Turmas vinculadas: conflitos de instrutor/local com elas são IGNORADOS (compartilham
  // instrutor/sala — ex: andaime 16H que roda dentro das primeiras 16h do andaime 40H).
  linkedClassNames?: string[];
  // Instrutores a PRIORIZAR nesta turma (vão pro topo da fila de qualificados, antes da
  // regra de contrato). Use para reservar alguém escasso a uma turma específica.
  pinInstructorIds?: number[];
  // Instrutores a EVITAR nesta turma (realocação): force a turma a usar substitutos,
  // liberando o evitado para outra turma. Ignorado se deixar a turma sem ninguém.
  avoidInstructorIds?: number[];
  // Evitar um instrutor SÓ em datas específicas (realocação cirúrgica): { instrId: ["YYYY-MM-DD"] }.
  // Ex: liberar JUAN/GABRIEL do CBSP no dia 19 (mas mantê-los nos outros dias) para a OIMCE.
  avoidInstructorOnDates?: Record<string | number, string[]>;
}
export interface PlanContext {
  instructors: PlannerInstructor[];
  absences: PlannerAbsence[];
  holidays: PlannerHoliday[];
  externalSchedules: ScheduleRowLike[];   // rows já existentes (DB) + turmas anteriores do lote
}
export interface PlanGap {
  module: string;
  date: string;
  startTime: string;
  role: string;
  reason: string;
}
export interface PlanTurmaResult {
  classId: string;
  className: string;
  trainingGcc: string;
  rows: NewScheduleRow[];
  gaps: PlanGap[];           // vagas que ficaram sem instrutor
  warnings: string[];
  instructorNames: string[]; // distintos, para resumo
  span: { from: string; to: string };
}

/**
 * Planeja UMA turma: explode módulos, calcula horários, atribui instrutores
 * (CLT-first, sem CLT Offshore, continuidade) e locais, e devolve as rows prontas.
 */
export function planTurma(input: PlanTurmaInput, ctx: PlanContext): PlanTurmaResult {
  const {
    training, className, startDate,
    startTime = '08:00',
    studentCount = '', observation = '',
    base = 'Macaé', planningType = 'base',
    withTranslator = false,
    excludeContracts = ['CLT Offshore'],
    allowFreelancer = true,
    linkedClassNames = [],
    pinInstructorIds = [],
    avoidInstructorIds = [],
    avoidInstructorOnDates = {},
  } = input;
  const pinSet = new Set(pinInstructorIds);
  const avoidSet = new Set(avoidInstructorIds);
  const avoidDates = new Map<number, Set<string>>();
  for (const [k, v] of Object.entries(avoidInstructorOnDates)) avoidDates.set(Number(k), new Set(v));

  const warnings: string[] = [];
  const gaps: PlanGap[] = [];
  const classId = newClassId();
  const trainingName = training.gcc || training.shortName || String(training.id);

  const modules = sortModules(training.modules || []);
  if (modules.length === 0) {
    warnings.push(`Treinamento "${trainingName}" não tem módulos cadastrados.`);
    return { classId, className, trainingGcc: trainingName, rows: [], gaps, warnings, instructorNames: [], span: { from: startDate, to: startDate } };
  }

  const dayEnd = (!training || training.defaultSchedule !== false)
    ? DEFAULT_DAY_END
    : (training.horarioFim ? timeToMins(training.horarioFim) : 21 * 60);
  const lunch = lunchFromSchedule(training.lunchSchedule);
  const startMins = timeToMins(startTime || '08:00');

  // Pool elegível: ativos, base Macaé-compatível? — o app não filtra base aqui (todos
  // os instrutores são Macaé); mantemos genérico mas excluímos contratos vetados.
  // `avoidSet` (realocação) só é aplicado se sobrar alguém — nunca esvazia o pool.
  const eligibleAll = ctx.instructors.filter(i =>
    i.status === 'Ativo' &&
    !excludeContracts.includes(i.contract) &&
    (allowFreelancer || i.contract !== 'Freelancer'),
  );
  const eligibleAvoided = eligibleAll.filter(i => !avoidSet.has(i.id));
  const eligible = eligibleAvoided.length > 0 ? eligibleAvoided : eligibleAll;
  if (avoidSet.size > 0 && eligibleAvoided.length === 0) {
    warnings.push('avoidInstructorIds ignorado: deixaria a turma sem nenhum instrutor elegível.');
  }

  // Score: quantos módulos deste treinamento cada instrutor pode ministrar (ajuda
  // continuidade — preferir quem cobre mais do treinamento).
  const instrScore: Record<string, number> = {};
  modules.forEach(mod => {
    eligible.filter(i => hasModuleSkill(i, mod)).forEach(i => {
      instrScore[i.id] = (instrScore[i.id] || 0) + 1;
    });
  });

  // Ordenação de qualificados: PIN (reservados) → contrato (CLT antes de Freelancer)
  // → score desc → id.
  const orderQualified = (pool: PlannerInstructor[]): PlannerInstructor[] =>
    [...pool].sort((a, b) => {
      const ap = pinSet.has(a.id) ? 0 : 1, bp = pinSet.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const cr = contractRank(a.contract) - contractRank(b.contract);
      if (cr !== 0) return cr;
      const sc = (instrScore[b.id] || 0) - (instrScore[a.id] || 0);
      if (sc !== 0) return sc;
      return a.id - b.id;
    });

  const timed = recalcTimes(modules.map(mod => ({ mod })), startDate, startMins, dayEnd, lunch);

  const preferredLocals: Record<string, string> = {}; // mod.id → local
  const committedInstrs: number[] = [];                // continuidade ao longo da turma
  const committedTrad: number[] = [];
  // Nunca conflitar com a própria turma nem com as turmas vinculadas (compartilham instrutor/sala).
  const ignoreNames = new Set<string>([className, ...linkedClassNames]);

  const rows: NewScheduleRow[] = [];

  // Guarda o instrutor da PROVA para replicar em REVISÃO/RESERVA.
  let provaInstrId: number | null = null;

  for (const t of timed) {
    const mod = t.mod;
    const count = mod.instructorCount || 1;
    const estStart = timeToMins(t.startTime);
    const estEnd = timeToMins(t.endTime);

    if (mod.isHuet) {
      warnings.push(`Módulo "${mod.name}" é HUET (equipe pool) — a tool ainda não trata papéis especiais de pool; atribuído como instrução comum.`);
    }

    // Qualificados: têm a skill + não ausentes + não em feriado + sem conflito de instrutor.
    const qualifiedBase = eligible.filter(i =>
      hasModuleSkill(i, mod) &&
      !avoidDates.get(i.id)?.has(t.date) &&
      !isInstructorAbsent(i.id, t.date, estStart, estEnd, ctx.absences) &&
      !isHoliday(t.date, i, ctx.holidays) &&
      !checkSlotConflict(ctx.externalSchedules, t.date, t.startTime, t.endTime, String(i.id), null, ignoreNames).instrConflict,
    );
    const qualified = orderQualified(qualifiedBase);
    const leadPool = qualified.filter(q => canLeadModule(q, mod));

    // Atribuição slot a slot (continuidade via committedInstrs).
    const assignedIds: (number | null)[] = new Array(count).fill(null);
    for (let k = 0; k < count; k++) {
      const pool = k === 0 ? (leadPool.length > 0 ? leadPool : qualified) : qualified;
      const pick =
        pool.find(q => committedInstrs.includes(q.id) && !assignedIds.includes(q.id)) ||
        pool.find(q => !assignedIds.includes(q.id));
      if (pick) {
        assignedIds[k] = pick.id;
        if (!committedInstrs.includes(pick.id)) committedInstrs.push(pick.id);
      }
    }

    // Local único para a equipe do módulo (preferredLocals por mod.id).
    const localOpts = (mod.locals || []);
    const isLocalLivre = (name: string) =>
      !checkSlotConflict(ctx.externalSchedules, t.date, t.startTime, t.endTime, null, name, ignoreNames).localConflict;
    let sharedLocal = '';
    const prevLocal = preferredLocals[mod.id];
    if (prevLocal && localOpts.includes(prevLocal) && isLocalLivre(prevLocal)) {
      sharedLocal = prevLocal;
    } else {
      sharedLocal = localOpts.find(l => isLocalLivre(l)) || localOpts[0] || '';
      if (sharedLocal) preferredLocals[mod.id] = sharedLocal;
    }

    // Papel por slot (espelho de savePlan, caminho não-pool/não-tradutor).
    const roleFor = (ntIdx: number) =>
      ntIdx === 0 ? (mod.type === 'PRÁTICA' ? 'Practical Instructor' : 'Theoretical Instructor') : 'Assistant Instructor';

    for (let k = 0; k < count; k++) {
      const instr = assignedIds[k] != null ? ctx.instructors.find(i => i.id === assignedIds[k]) : undefined;
      const role = roleFor(k);
      const row: NewScheduleRow = {
        id: nextScheduleId(),
        classId,
        trainingId: String(training.id),
        trainingName,
        className,
        date: t.date,
        startTime: t.startTime,
        endTime: t.endTime,
        local: sharedLocal,
        instructorId: instr ? instr.id : null,
        instructorName: instr ? instr.name : '',
        module: mod.name,
        moduleId: mod.id,
        role,
        studentCount: String(studentCount ?? ''),
        observation: observation || '',
        status: 'Programado',
        base: base ?? null,
        planningType: planningType || 'base',
      };
      rows.push(row);
      if (!instr) {
        gaps.push({ module: mod.name, date: t.date, startTime: t.startTime, role, reason: 'sem instrutor CLT/Freelancer qualificado e livre' });
      }
    }

    // Tradutor (opcional) — um slot extra com role Translator.
    if (withTranslator) {
      const TRANSLATOR_SKILL = 'TRADUTOR';
      const tradBase = eligible.filter(i =>
        (i.skills || []).some(s => (typeof s === 'string' ? s : s.name) === TRANSLATOR_SKILL) &&
        !isInstructorAbsent(i.id, t.date, estStart, estEnd, ctx.absences) &&
        !isHoliday(t.date, i, ctx.holidays) &&
        !checkSlotConflict(ctx.externalSchedules, t.date, t.startTime, t.endTime, String(i.id), null, ignoreNames).instrConflict,
      );
      const tradPool = orderQualified(tradBase);
      const tradPick = tradPool.find(i => committedTrad.includes(i.id)) || tradPool[0] || null;
      if (tradPick && !committedTrad.includes(tradPick.id)) committedTrad.push(tradPick.id);
      rows.push({
        id: nextScheduleId(), classId, trainingId: String(training.id), trainingName, className,
        date: t.date, startTime: t.startTime, endTime: t.endTime, local: sharedLocal,
        instructorId: tradPick ? tradPick.id : null, instructorName: tradPick ? tradPick.name : '',
        module: mod.name, moduleId: mod.id, role: 'Translator',
        studentCount: String(studentCount ?? ''), observation: observation || '', status: 'Programado',
        base: base ?? null, planningType: planningType || 'base',
      });
      if (!tradPick) gaps.push({ module: mod.name, date: t.date, startTime: t.startTime, role: 'Translator', reason: 'sem tradutor livre' });
    }

    // Memoriza instrutor da PROVA (slot 0) para replicar na REVISÃO/RESERVA.
    if (isProvaName(mod.name) && assignedIds[0] != null) provaInstrId = assignedIds[0];
  }

  // Passo final: REVISÃO/RESERVA herdam o instrutor da PROVA (espelho do app).
  if (provaInstrId != null) {
    const provaInstr = ctx.instructors.find(i => i.id === provaInstrId);
    for (const r of rows) {
      if ((isRevisaoName(r.module) || isReservaName(r.module)) && r.role !== 'Translator') {
        r.instructorId = provaInstrId;
        r.instructorName = provaInstr ? provaInstr.name : r.instructorName;
      }
    }
  }

  // Carimba turmas vinculadas em todas as rows (espelho de savePlan).
  if (linkedClassNames.length > 0) {
    for (const r of rows) r.linkedClassNames = [...linkedClassNames];
  }

  const dates = rows.map(r => r.date).sort();
  const instructorNames = Array.from(new Set(rows.filter(r => r.instructorName).map(r => r.instructorName)));
  return {
    classId, className, trainingGcc: trainingName, rows, gaps, warnings, instructorNames,
    span: { from: dates[0] || startDate, to: dates[dates.length - 1] || startDate },
  };
}
