// logic.js — Funções puras extraídas para testes automatizados
// Sem React, sem JSX, sem dependências de browser.
// Importado pelo app via global scope; importado pelos testes via ES module.

import bcrypt from 'bcryptjs';
import core from './core.cjs';

// ── FONTE ÚNICA (core.cjs) ──────────────────────────────────────────────────────
// As primitivas puras de planejamento moram em js/core.cjs (mesma fonte que a produção
// usa). logic.js as RE-EXPORTA para os testes não mudarem de import — não redefinir aqui.
export const {
  timeToMins, sortModules, isInstructorAbsent, isHoliday,
  skillMatchesModule, skillMatchesModuleName, checkSlotConflict,
} = core;

// ── TEMPO (locais — minsToTime/addDays alimentam o recalcTimes-espelho abaixo) ──
export const minsToTime = m => {
  const mm = Math.max(0, m);
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
};

export const addDays = (ds, n) => {
  const d = new Date(ds + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
};

// sortModules → core.cjs (re-exportado no topo).

// ── GRADE HORÁRIA ──────────────────────────────────────────────────────────────
// Espelho do recalcTimes em config.js (runtime). Manter os dois em sync.
// lunch: { start, end } em minutos. Default 12:00–13:00.
export const DEFAULT_LUNCH = { start: 12 * 60, end: 13 * 60 };

export const recalcTimes = (items, startDateStr, startMins, dayEnd = 17 * 60, lunch = DEFAULT_LUNCH) => {
  const LUNCH_S = lunch.start, LUNCH_E = lunch.end, DAY_START = 8 * 60;
  let curDate = startDateStr, cur = startMins;
  const result = [];
  for (const item of items) {
    let remaining = item.mod?.minutes || 60;
    let isFirst = true;
    while (remaining > 0) {
      if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
      if (cur >= dayEnd) { curDate = addDays(curDate, 1); cur = DAY_START; }
      let periodEnd = cur < LUNCH_S ? LUNCH_S : dayEnd;
      let available = periodEnd - cur;
      if (available <= 0) {
        if (cur < LUNCH_E) { cur = LUNCH_E; periodEnd = dayEnd; available = dayEnd - LUNCH_E; }
        else { curDate = addDays(curDate, 1); cur = DAY_START; periodEnd = LUNCH_S; available = LUNCH_S - DAY_START; }
      }
      const chunk = Math.min(remaining, available);
      const endM = cur + chunk;
      if (isFirst) {
        result.push({ ...item, date: curDate, startTime: minsToTime(cur), endTime: minsToTime(endM) });
        isFirst = false;
      } else {
        result.push({ ...item, id: item.id + '_' + curDate, date: curDate, startTime: minsToTime(cur), endTime: minsToTime(endM) });
      }
      remaining -= chunk;
      cur = endM;
      if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
      if (cur >= dayEnd && remaining > 0) { curDate = addDays(curDate, 1); cur = DAY_START; }
    }
  }
  return result;
};

// ── NOMEAÇÃO DE TURMAS ──────────────────────────────────────────────────────────
// Sugere o próximo nome de turma para um treinamento numa dada semana:
// "{shortName||gcc} - NN", onde NN = (maior número de turma já existente na mesma
// semana+ano, mesmo trainingId) + 1. Conta turmas persistidas E linhas extras
// passadas em occupancyRows — é assim que o import em lote numera turmas que ele
// mesmo acabou de criar mas que ainda não estão salvas.
export const nextClassName = (training, date, occupancyRows) => {
  if (!training || !date) return "";
  const label = training.shortName || training.gcc || "";
  const weekOf = ds => {
    const d = new Date(ds + "T12:00:00");
    const soy = new Date(d.getFullYear(), 0, 1);
    return { wk: Math.ceil(((d - soy) / 86400000 + soy.getDay() + 1) / 7), year: d.getFullYear() };
  };
  const target = weekOf(date);
  const startByClass = {};
  (occupancyRows || []).forEach(s => {
    if (String(s.trainingId) !== String(training.id)) return;
    if (!s.className) return;
    if (!startByClass[s.className] || s.date < startByClass[s.className]) startByClass[s.className] = s.date;
  });
  const sameWeek = Object.entries(startByClass).filter(([, startDate]) => {
    const w = weekOf(startDate);
    return w.wk === target.wk && w.year === target.year;
  }).map(([name]) => name);
  const nums = sameWeek.map(n => { const m = n.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${label} - ${String(next).padStart(2, "0")}`;
};

// ── AUSÊNCIAS / FERIADOS ─────────────────────────────────────────────────────
// isInstructorAbsent, FULL_DAY_CATEGORIES, isFullDayAbsence e isHoliday → core.cjs
// (fonte única; re-exportados no topo). Modelo de feriado: national/base (multibase).

// ── SENHAS ────────────────────────────────────────────────────────────────────
const HASH_ROUNDS = 8;

export const hashPw = plain => bcrypt.hashSync(plain, HASH_ROUNDS);

export const checkPw = (plain, stored) => {
  if (!stored || !plain) return false;
  if (!stored.startsWith('$2')) return plain === stored;
  return bcrypt.compareSync(plain, stored);
};

// ── SKILLS / CONFLITO DE SLOT ─────────────────────────────────────────────────
// skillMatchesModule, skillMatchesModuleName e checkSlotConflict → core.cjs
// (fonte única; re-exportados no topo).

// ── AI HELPERS (espelho puro de ai.js para testes) ────────────────────────────

export const aiShuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const aiOrderQualified = (pool, scoreMap, previousIds) => {
  const byScore = (a, b) => (scoreMap[b.id] || 0) - (scoreMap[a.id] || 0);
  if (!previousIds || previousIds.size === 0) return [...pool].sort(byScore);
  const arr = aiShuffle(pool);
  arr.sort((a, b) => {
    const ap = previousIds.has(String(a.id)) ? 1 : 0;
    const bp = previousIds.has(String(b.id)) ? 1 : 0;
    if (ap !== bp) return ap - bp;
    return byScore(a, b);
  });
  return arr;
};

// Teto do dia em minutos: treinamento normal=17h; horário livre sem fim definido=21h.
export const aiDayEndMin = (training) => {
  if (!training || training.defaultSchedule !== false) return 17 * 60;
  return training.horarioFim ? timeToMins(training.horarioFim) : 21 * 60;
};

// Converte célula de data do Excel → string YYYY-MM-DD. Suporta Date, serial numérico e string DD/MM/AAAA.
export const aiCellToISO = (v) => {
  if (v == null || v === "") return "";
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return "";
};

// Normaliza "SIM" / "S" / "YES" / "1" → true; qualquer outro → false.
export const aiNormalizeYesNo = (v) => {
  if (v == null) return false;
  const s = String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
  if (!s) return false;
  return s === "SIM" || s === "S" || s === "YES" || s === "Y" || s === "TRUE" || s === "1";
};

// Converte célula → quantidade de alunos (inteiro >=0). Vazio/inválido → "".
export const aiCellToStudents = (v) => {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? String(n) : "";
};

const _aiNorm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Resolve nome de instrutor por nome cheio, primeiro+último ou substring.
export const aiResolveInstructorByName = (raw, instructors) => {
  if (!raw || !instructors || !instructors.length) return { instructor: null, ambiguous: false };
  const q = _aiNorm(raw);
  if (!q) return { instructor: null, ambiguous: false };
  const candidates = instructors.filter(i => i && i.status !== "Inativo");
  const exact = candidates.filter(i => _aiNorm(i.name) === q);
  if (exact.length === 1) return { instructor: exact[0], ambiguous: false };
  if (exact.length > 1) return { instructor: null, ambiguous: true };
  const parts = q.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0], last = parts[parts.length - 1];
    const fl = candidates.filter(i => {
      const p = _aiNorm(i.name).split(/\s+/);
      return p.length > 0 && p[0] === first && p[p.length - 1] === last;
    });
    if (fl.length === 1) return { instructor: fl[0], ambiguous: false };
    if (fl.length > 1) return { instructor: null, ambiguous: true };
  }
  const contains = candidates.filter(i => _aiNorm(i.name).includes(q));
  if (contains.length === 1) return { instructor: contains[0], ambiguous: false };
  if (contains.length > 1) return { instructor: null, ambiguous: true };
  return { instructor: null, ambiguous: false };
};
