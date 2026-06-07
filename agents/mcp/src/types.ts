// ── COMPETÊNCIA (skill) ───────────────────────────────────────────────────────
// Forma real em relyon_instructors (NÃO é string[] — ver js/instructors.js linha ~156):
//   - competência "especial" (Tradutor, Lead Instructor, etc.): { name: "TRADUTOR", canLead }
//   - competência ligada a módulo de treinamento: { moduleId, trainingId, canLead } (sem name —
//     o nome de exibição vem do módulo correspondente em relyon_trainings)
//   - legado: string pura
// Usar sempre `resolveSkillName(skill, trainings)` para obter o nome de exibição —
// nunca `.join()`/`.toUpperCase()` direto no objeto (gera "[object Object]"/TypeError).
export interface Skill {
  name?: string;
  canLead?: boolean;
  moduleId?: number;
  trainingId?: number;
}

// ── INSTRUTOR ─────────────────────────────────────────────────────────────────
export interface Instructor {
  id: number;
  name: string;
  contract: string;   // "CLT" | "CLT Offshore" | "Freelancer" | "PJ"
  base: string;       // "Macaé" | "Bangu" | "Offshore"
  status: string;     // "Ativo" | "Inativo"
  skills: (Skill | string)[];
  phone?: string;
  email?: string;
  username?: string;
  leader?: string;
  hireDate?: string;
  contractStartedAt?: string;
  contractEndDate?: string;
  contractHistory?: unknown[];
  history?: unknown[];
}

// ── AUSÊNCIA ──────────────────────────────────────────────────────────────────
// Shape real em relyon_absences (ver constants.js ABSENCE_TYPES): startDate/endDate, não date/dateEnd.
export interface Absence {
  id: number;
  instructorId: number;
  instructorName: string;
  type: string;        // "involuntario" | "voluntario" | "planejada"
  category: string;    // "Férias" | "Atestado Médico" | "Folga Banco de Horas" | "Folga Abonada" | etc.
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD (igual a startDate quando é um único dia)
  startTime?: string;  // ausente quando categoria é dia inteiro (FULL_DAY_CATEGORIES)
  endTime?: string;
  obs?: string;
}

// ── ATIVIDADE (Linha do Tempo) ────────────────────────────────────────────────
// relyon_activities — programações internas que não são turmas (manutenção, PDI, etc.)
export interface Activity {
  id: number;
  instructorId: number;
  instructorName: string;
  date: string;        // YYYY-MM-DD
  type: string;        // ver ACTIVITY_TYPES — "maintenance" | "development" | "free" | etc.
  startTime?: string;  // ausente em atividades "free" (dia inteiro)
  endTime?: string;
  local?: string;
  obs?: string;
}

// ── ROW DE PROGRAMAÇÃO ────────────────────────────────────────────────────────
export interface ScheduleRow {
  id: number;
  classId: string;
  moduleId: number;
  moduleName?: string;
  trainingName?: string;
  date: string;
  startTime: string;
  endTime: string;
  instructorId: number | null;
  instructorName?: string;
  local: string;
  role: string;
  status: string;     // "Confirmado" | "Pendente" | "Rascunho"
  studentCount?: number;
  observation?: string;
  planningType?: string;
  base?: string;
  lunchSchedule?: unknown;
}

// ── TREINAMENTO / MÓDULO ──────────────────────────────────────────────────────
export interface TrainingModule {
  id: number;
  name: string;
  type?: string;
  minutes?: number;
  instructorCount?: number;
  skills?: string[];
  locals?: string[];
}

export interface Training {
  id: number;
  name: string;
  type?: string;
  modules?: TrainingModule[];
  lunchSchedule?: unknown;
}

// ── SOLICITAÇÃO ───────────────────────────────────────────────────────────────
export interface IssueLogEntry {
  ts: string;
  by?: { id: unknown; name: string; role: string };
  action: string;   // "created" | "approved" | "rejected" | "comment" | "cancelled"
  note?: string;
}

export interface Request {
  id: number;
  type: string;
  instructorId: number;
  instructorName: string;
  date: string;
  description: string;
  issueLog: IssueLogEntry[];
  priority?: string;
  absenceId?: number;
  base?: string;
}

// ── FERIADO ───────────────────────────────────────────────────────────────────
export interface Holiday {
  id: number;
  date: string;
  name: string;
  base?: string;
}
