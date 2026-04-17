// logic.js — Funções puras extraídas para testes automatizados
// Sem React, sem JSX, sem dependências de browser.
// Importado pelo app via global scope; importado pelos testes via ES module.

import bcrypt from 'bcryptjs';

// ── TEMPO ──────────────────────────────────────────────────────────────────────
export const timeToMins = t => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const minsToTime = m => {
  const mm = Math.max(0, m);
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
};

export const addDays = (ds, n) => {
  const d = new Date(ds + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
};

// ── ORDENAÇÃO DE MÓDULOS ───────────────────────────────────────────────────────
export const sortModules = mods => {
  if (!mods || !mods.length) return [];
  const isReserva = m => /TEMPO\s*RESERVA/i.test(m.name);
  const isProva   = m => /\bPROVA\b/i.test(m.name) && !isReserva(m);
  const regular = mods.filter(m => !isProva(m) && !isReserva(m));
  regular.sort((a, b) => {
    const at = /CBINC/i.test(a.name), bt = /CBINC/i.test(b.name);
    if (at && bt) {
      if (a.type === "TEORIA"  && b.type === "PRÁTICA") return -1;
      if (a.type === "PRÁTICA" && b.type === "TEORIA")  return  1;
    }
    return (a.priority || 99) - (b.priority || 99);
  });
  return [...regular, ...mods.filter(isProva), ...mods.filter(isReserva)];
};

// ── GRADE HORÁRIA ──────────────────────────────────────────────────────────────
export const recalcTimes = (items, startDateStr, startMins) => {
  const LUNCH_S = 12 * 60, LUNCH_E = 13 * 60, DAY_END = 17 * 60, DAY_START = 8 * 60;
  let curDate = startDateStr, cur = startMins;
  const result = [];
  for (const item of items) {
    let remaining = item.mod?.minutes || 60;
    let isFirst = true;
    while (remaining > 0) {
      if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
      if (cur >= DAY_END) { curDate = addDays(curDate, 1); cur = DAY_START; }
      let periodEnd = cur < LUNCH_S ? LUNCH_S : DAY_END;
      let available = periodEnd - cur;
      if (available <= 0) {
        if (cur < LUNCH_E) { cur = LUNCH_E; periodEnd = DAY_END; available = DAY_END - LUNCH_E; }
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
      if (cur >= DAY_END && remaining > 0) { curDate = addDays(curDate, 1); cur = DAY_START; }
    }
  }
  return result;
};

// ── AUSÊNCIAS ─────────────────────────────────────────────────────────────────
const FULL_DAY_CATEGORIES = [
  "Atestado Médico",
  "Férias",
  "Licença Paternidade/Maternidade",
  "Suspensão Disciplinar"
];
const isFullDayAbsence = category => FULL_DAY_CATEGORIES.includes(category);

export const isInstructorAbsent = (instructorId, date, startMins, endMins, absences) => {
  return absences.some(a => {
    if (String(a.instructorId) !== String(instructorId)) return false;
    const aStart = a.startDate, aEnd = a.endDate || a.startDate;
    if (date < aStart || date > aEnd) return false;
    if (isFullDayAbsence(a.category)) return true;
    if (!a.startTime || !a.endTime) return false;
    const absS = timeToMins(a.startTime), absE = timeToMins(a.endTime);
    return startMins < absE && endMins > absS;
  });
};

// ── SENHAS ────────────────────────────────────────────────────────────────────
const HASH_ROUNDS = 8;

export const hashPw = plain => bcrypt.hashSync(plain, HASH_ROUNDS);

export const checkPw = (plain, stored) => {
  if (!stored || !plain) return false;
  if (!stored.startsWith('$2')) return plain === stored;
  return bcrypt.compareSync(plain, stored);
};
