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
  const isRevisao = m => /REVIS[AÃ]O/i.test(m.name) && !isProva(m) && !isReserva(m);
  const regular = mods.filter(m => !isProva(m) && !isReserva(m) && !isRevisao(m));
  regular.sort((a, b) => {
    const at = /CBINC/i.test(a.name), bt = /CBINC/i.test(b.name);
    if (at && bt) {
      if (a.type === "TEORIA"  && b.type === "PRÁTICA") return -1;
      if (a.type === "PRÁTICA" && b.type === "TEORIA")  return  1;
    }
    return (a.priority || 99) - (b.priority || 99);
  });
  return [...regular, ...mods.filter(isRevisao), ...mods.filter(isProva), ...mods.filter(isReserva)];
};

// ── GRADE HORÁRIA ──────────────────────────────────────────────────────────────
export const recalcTimes = (items, startDateStr, startMins, dayEnd = 17 * 60) => {
  const LUNCH_S = 12 * 60, LUNCH_E = 13 * 60, DAY_START = 8 * 60;
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

// ── FERIADOS ──────────────────────────────────────────────────────────────────
// Retorna o holiday aplicável ao instrutor naquela data, ou null.
// scope="national" aplica a todos; "state" exige instr.state===holiday.state;
// "municipal" exige ambos (state E city) iguais.
// Instrutor sem state/city declarado é afetado apenas por feriados nacionais.
export const isHoliday = (date, instr, holidays) => {
  if (!holidays || !holidays.length) return null;
  for (const h of holidays) {
    if (h.date !== date) continue;
    if (h.scope === "national") return h;
    if (!instr) continue;
    if (h.scope === "state" && instr.state && instr.state === h.state) return h;
    if (h.scope === "municipal" && instr.state && instr.city && instr.state === h.state && instr.city === h.city) return h;
  }
  return null;
};

// ── SENHAS ────────────────────────────────────────────────────────────────────
const HASH_ROUNDS = 8;

export const hashPw = plain => bcrypt.hashSync(plain, HASH_ROUNDS);

export const checkPw = (plain, stored) => {
  if (!stored || !plain) return false;
  if (!stored.startsWith('$2')) return plain === stored;
  return bcrypt.compareSync(plain, stored);
};

// ── SKILLS ────────────────────────────────────────────────────────────────────
// Após a migração, skills de módulo têm { moduleId, trainingId, canLead }.
// TRANSLATOR_SKILL e skills órfãs legadas mantêm { name, canLead }.
// Estas funções suportam ambos os formatos para compatibilidade retroativa.

export const skillMatchesModule = (skill, mod) => {
  if (!skill || !mod) return false;
  if (skill.moduleId != null) return String(skill.moduleId) === String(mod.id);
  const name = typeof skill === 'string' ? skill : skill.name;
  return name === mod.name;
};

// Versão para schedule rows históricos onde só temos o nome do módulo como string.
// Usa item.moduleId se disponível, senão faz lookup por nome no catálogo.
export const skillMatchesModuleName = (skill, moduleName, trainings) => {
  if (!skill || !moduleName) return false;
  if (skill.moduleId != null) {
    for (const t of trainings) {
      const m = (t.modules || []).find(m => String(m.id) === String(skill.moduleId));
      if (m) return m.name === moduleName;
    }
    return false;
  }
  const name = typeof skill === 'string' ? skill : skill.name;
  return name === moduleName;
};
