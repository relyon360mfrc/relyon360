import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../constants.js';
import type {
  Instructor, Absence, Activity, ScheduleRow, Training, Request, Holiday
} from '../types.js';

// ── CLIENTE ───────────────────────────────────────────────────────────────────
let _client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _client;
}

// ── HELPERS: app_state (JSON arrays) ─────────────────────────────────────────

/**
 * Lê um valor da tabela app_state pelo key.
 * Retorna o array parseado ou [] em caso de erro.
 */
async function readAppState<T>(key: string): Promise<T[]> {
  const sb = getClient();
  const { data, error } = await sb
    .from('app_state')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return [];
  const val = data.value;
  if (Array.isArray(val)) return val as T[];
  return [];
}

/**
 * Sobrescreve um valor na tabela app_state.
 * ATENÇÃO: usa UPDATE (INSERT é restrito por RLS).
 */
async function writeAppState<T>(key: string, value: T[]): Promise<void> {
  const sb = getClient();
  const { error } = await sb
    .from('app_state')
    .update({ value })
    .eq('key', key);

  if (error) throw new Error(`Erro ao gravar app_state[${key}]: ${error.message}`);
}

// ── INSTRUTORES ───────────────────────────────────────────────────────────────

export async function fetchInstructors(): Promise<Instructor[]> {
  return readAppState<Instructor>('relyon_instructors');
}

// ── AUSÊNCIAS ─────────────────────────────────────────────────────────────────

export async function fetchAbsences(): Promise<Absence[]> {
  return readAppState<Absence>('relyon_absences');
}

export async function saveAbsences(absences: Absence[]): Promise<void> {
  return writeAppState('relyon_absences', absences);
}

// ── ATIVIDADES (Linha do Tempo) ───────────────────────────────────────────────
// Programações internas do instrutor que não são turmas: manutenção, desenvolvimento,
// PDI, apoio CS/almoxarifado/cenário, treinamento obrigatório, livre, etc.

export async function fetchActivities(): Promise<Activity[]> {
  return readAppState<Activity>('relyon_activities');
}

// ── TREINAMENTOS ──────────────────────────────────────────────────────────────

export async function fetchTrainings(): Promise<Training[]> {
  return readAppState<Training>('relyon_trainings');
}

// ── FERIADOS ──────────────────────────────────────────────────────────────────

export async function fetchHolidays(): Promise<Holiday[]> {
  return readAppState<Holiday>('relyon_holidays');
}

// ── SOLICITAÇÕES ──────────────────────────────────────────────────────────────

export async function fetchRequests(): Promise<Request[]> {
  return readAppState<Request>('relyon_requests');
}

export async function saveRequests(requests: Request[]): Promise<void> {
  return writeAppState('relyon_requests', requests);
}

// ── PROGRAMAÇÃO (tabela dedicada) ─────────────────────────────────────────────

/**
 * Busca turmas para uma data específica.
 */
export async function fetchSchedulesByDate(date: string): Promise<ScheduleRow[]> {
  const sb = getClient();
  const { data, error } = await sb
    .from('relyon_schedules')
    .select('*')
    .eq('date', date)
    .neq('status', 'Rascunho')
    .order('startTime');

  if (error) throw new Error(`Erro ao buscar programação: ${error.message}`);
  return (data || []) as ScheduleRow[];
}

/**
 * Busca turmas de um instrutor em um período.
 */
export async function fetchSchedulesByInstructor(
  instructorId: number,
  dateFrom: string,
  dateTo: string
): Promise<ScheduleRow[]> {
  const sb = getClient();
  const { data, error } = await sb
    .from('relyon_schedules')
    .select('*')
    .eq('instructorId', instructorId)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .neq('status', 'Rascunho')
    .order('date')
    .order('startTime');

  if (error) throw new Error(`Erro ao buscar turmas do instrutor: ${error.message}`);
  return (data || []) as ScheduleRow[];
}

/**
 * Atualiza o instructorId de uma row de programação.
 */
export async function updateScheduleInstructor(
  rowId: number,
  newInstructorId: number,
  newInstructorName: string
): Promise<void> {
  const sb = getClient();
  const { error } = await sb
    .from('relyon_schedules')
    .update({
      instructorId: newInstructorId,
      instructorName: newInstructorName,
      status: 'Pendente',   // volta para Pendente após troca
      confirmedAt: null,
      confirmedBy: null,
    })
    .eq('id', rowId);

  if (error) throw new Error(`Erro ao trocar instrutor: ${error.message}`);
}

// ── UTILITÁRIOS ───────────────────────────────────────────────────────────────

/**
 * Normaliza string para comparação fuzzy: minúsculas, sem acentos.
 */
export function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Resolve nome parcial → instrutor(es) com fuzzy matching.
 * Prioriza: match exato > começa com > contém todos os tokens.
 */
export function resolveInstructorsByName(
  name: string,
  instructors: Instructor[]
): Instructor[] {
  const normQuery = normalizeStr(name);
  const tokens = normQuery.split(/\s+/).filter(Boolean);

  const active = instructors.filter(i => i.status === 'Ativo');

  // 1. Match exato
  const exact = active.filter(i => normalizeStr(i.name) === normQuery);
  if (exact.length > 0) return exact;

  // 2. Começa com
  const startsWith = active.filter(i => normalizeStr(i.name).startsWith(normQuery));
  if (startsWith.length > 0) return startsWith;

  // 3. Todos os tokens presentes no nome
  const allTokens = active.filter(i => {
    const normName = normalizeStr(i.name);
    return tokens.every(t => normName.includes(t));
  });
  if (allTokens.length > 0) return allTokens;

  // 4. Qualquer token presente
  return active.filter(i => {
    const normName = normalizeStr(i.name);
    return tokens.some(t => normName.includes(t));
  });
}

/**
 * Retorna a data de hoje no formato YYYY-MM-DD.
 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Formata data de YYYY-MM-DD para DD/MM/YYYY.
 */
export function fmtDateBR(date: string): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Verifica se um instrutor está ausente em uma data.
 */
export function isAbsentOn(
  instructorId: number,
  date: string,
  absences: Absence[]
): Absence | undefined {
  return absences.find(a => {
    if (String(a.instructorId) !== String(instructorId)) return false;
    const end = a.endDate ?? a.startDate;
    return date >= a.startDate && date <= end;
  });
}

/**
 * Verifica se um instrutor está escalado em uma data.
 */
export function getSchedulesForInstructor(
  instructorId: number,
  date: string,
  schedules: ScheduleRow[]
): ScheduleRow[] {
  return schedules.filter(
    s => String(s.instructorId) === String(instructorId) && s.date === date
  );
}

/**
 * Retorna as atividades (Linha do Tempo) de um instrutor em uma data.
 */
export function getActivitiesForInstructor(
  instructorId: number,
  date: string,
  activities: Activity[]
): Activity[] {
  return activities.filter(
    a => String(a.instructorId) === String(instructorId) && a.date === date
  );
}

/**
 * Deriva o status de uma solicitação a partir do issueLog.
 */
export function deriveRequestStatus(req: Request): string {
  if (!req.issueLog || req.issueLog.length === 0) return 'Pendente';
  const last = req.issueLog[req.issueLog.length - 1];
  switch (last.action) {
    case 'approved':  return 'Aprovado';
    case 'rejected':  return 'Rejeitado';
    case 'cancelled': return 'Cancelado';
    default:          return 'Pendente';
  }
}
