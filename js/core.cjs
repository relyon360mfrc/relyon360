/* core.cjs — NÚCLEO PURO COMPARTILHADO (produção + testes, fonte única)
 *
 * Este arquivo roda em TRÊS ambientes, de propósito:
 *   1. Bundle de produção  — concatenado pelo build.mjs como script global.
 *   2. Rollback babel       — <script type="text/babel"> transpilado no navegador.
 *   3. Testes (vitest)      — importado como módulo CommonJS (.cjs).
 *
 * Por isso: SEM `import`, SEM `export` (quebrariam o script global), SEM deps de
 * node_modules. As funções viram globais no navegador; a guarda `module.exports`
 * no fim só dispara sob Node/vitest (onde `module` existe). É a ponte que permite
 * que a PRODUÇÃO e os TESTES usem A MESMA implementação — matando o risco de o
 * espelho divergir em silêncio (a doença do recalcTimes/logic.js).
 *
 * NÃO adicionar dependências aqui. Funções puras de decisão apenas.
 */

// ── RECONCILIAÇÃO LS ↔ SUPABASE ───────────────────────────────────────────────
// Decisão server-authoritative de useSchedules (config.js). Recebe SÓ dados,
// devolve SÓ a decisão — nenhum efeito (sem LS, sem rede, sem React). O config.js
// executa os efeitos (gravar LS, re-deletar ghosts, reempurrar repush).
//
// Entradas:
//   local    — rows que o cliente tem (prev de useSchedules / localStorage)
//   server   — rows lidas do Supabase (autoritativo para EXISTÊNCIA)
//   pending  — journal { String(id): timestamp } de uploads não confirmados
//   isClassDeleted(classId) — predicado de tombstone (turma excluída)
//
// Saídas:
//   merged       — estado reconciliado (vai pro LS e pro React)
//   repush       — rows local-only que DEVEM voltar pro SB (criadas aqui, pendentes)
//   dropped      — rows local-only DESCARTADAS (SB autoritativo: apagadas alhures)
//   ghosts       — rows do SB com classId tombstoned (fantasmas a re-deletar)
//   clearPending — ids que o SB já confirmou (saem do journal)
//
// INVARIANTE CENTRAL (correção 2026-06-01): a ÚNICA row local-only preservada é a
// que ESTE cliente criou e ainda não confirmou (está no journal `pending`). Todo o
// resto que só existe no local foi apagado no servidor → descartar. É isso que
// impede exclusões e órfãs de ressuscitarem a cada F5.
//
// ANTI-RESSURREIÇÃO DE SLOT SINGLETON (correção NR-12, 2026-06-09): alguns papéis só
// podem ter 1 instrutor por slot (lead/tradutor) — confirmado por Matheus + dados de
// produção (snpvqqsmwrlazawjknme). Se o SERVIDOR já tem esse slot preenchido, uma row
// local pendente do mesmo slot é uma versão STALE (ex: Arilson tradutor que outra
// sessão já corrigiu p/ Daniel) → NÃO reempurrar (senão volta como instrutor extra).
// Papéis MULTI-instrutor (Assistant Instructor até 6, Scuba Diver, Crane Operator)
// passam INTACTOS — deduplicá-los apagaria dados legítimos. Lista por INCLUSÃO: papel
// desconhecido = tratado como multi (lado seguro, nunca perde dado).
const RECONCILE_SINGLETON_ROLES = new Set([
  'Translator', 'Theoretical Instructor', 'Practical Instructor', 'Lead Instructor',
]);
const _reconcileSlotKey = (s) =>
  String(s.classId) + '|' + String(s.moduleId) + '|' + String(s.date) + '|' +
  String(s.startTime) + '|' + String(s.role);

const reconcileSchedules = (local, server, pending, isClassDeleted) => {
  const isDel = typeof isClassDeleted === 'function' ? isClassDeleted : function () { return false; };
  const prev = (local || []).filter(function (s) { return s && s.id != null; });
  const all  = server || [];
  const pend = pending || {};

  const ghosts   = all.filter(function (s) { return isDel(s.classId); });
  const cleanAll = all.filter(function (s) { return !isDel(s.classId); });
  const sbIds    = new Set(cleanAll.map(function (s) { return String(s.id); }));

  const clearPending = prev
    .filter(function (s) { return sbIds.has(String(s.id)); })
    .map(function (s) { return s.id; });

  // Candidatas a reempurrão: local-only, no journal de pendentes, turma viva.
  const repushRaw = prev.filter(function (s) {
    return !sbIds.has(String(s.id)) &&
           pend[String(s.id)] != null &&        // só uploads genuínos não confirmados
           !isDel(s.classId);
  });

  const dropped = prev.filter(function (s) {
    return !sbIds.has(String(s.id)) &&
           pend[String(s.id)] == null;          // local-only sem upload → apagada alhures
  });

  // Anti-ressurreição NR-12: para papéis singleton, descarta a candidata cujo slot
  // já está preenchido no servidor (versão stale) ou já foi mantida nesta mesma
  // reconciliação (dedup intra-lote). Papéis multi passam sem filtro.
  const serverSingletonSlots = new Set(
    cleanAll
      .filter(function (s) { return RECONCILE_SINGLETON_ROLES.has(s.role); })
      .map(_reconcileSlotKey)
  );
  const keptSingletonSlots = new Set();
  const repush = [];
  const superseded = [];
  for (var i = 0; i < repushRaw.length; i++) {
    var r = repushRaw[i];
    if (RECONCILE_SINGLETON_ROLES.has(r.role)) {
      var k = _reconcileSlotKey(r);
      if (serverSingletonSlots.has(k) || keptSingletonSlots.has(k)) {
        superseded.push(r);                     // slot singleton já preenchido → stale
        continue;
      }
      keptSingletonSlots.add(k);
    }
    repush.push(r);
  }

  const merged = repush.length > 0 ? cleanAll.concat(repush) : cleanAll;

  return {
    merged: merged, repush: repush, dropped: dropped,
    ghosts: ghosts, clearPending: clearPending, superseded: superseded,
  };
};

// ── PRIMITIVAS DE PLANEJAMENTO (fonte única — antes duplicadas em config/constants) ──
// FONTE ÚNICA das primitivas puras que decidem horário/ausência/feriado/skill/conflito.
// Antes viviam inline em config.js e constants.js (e num espelho em logic.js) — três
// cópias que JÁ divergiram em silêncio (FULL_DAY_CATEGORIES e isHoliday, incidente
// 2026-06-12). Agora moram AQUI: core.cjs carrega ANTES de config.js/constants.js no
// index.html, então estes viram globais disponíveis pros demais módulos; logic.js
// re-exporta daqui (testes) e o port do MCP (planner.ts) é amarrado por parity-planner.test.js.
// NÃO recriar estas const em config.js/constants.js (colisão de `const` no bundle).
// NOTA: recalcTimes/applyDaySchedule FICARAM em config.js de propósito (emaranhadas com
// chunkFactory + marcadas como críticas no CLAUDE.md); a divergência delas é coberta
// pelos testes de paridade/golden, não por single-source.

const timeToMins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

// Categorias de ausência que cobrem o dia inteiro (sem campo de horário).
const FULL_DAY_CATEGORIES = [
  "Atestado Médico",
  "Férias",
  "Folga Abonada",
  "Folga Banco de Horas",
  "Embarque",
  "Licença Paternidade/Maternidade",
  "Suspensão Disciplinar"
];
const isFullDayAbsence = (category) => FULL_DAY_CATEGORIES.includes(category);

// Feriado regional. scope="national" aplica a todos; "base" exige instr.base === h.base.
const isHoliday = (date, instr, holidays) => {
  if (!holidays || !holidays.length) return null;
  for (const h of holidays) {
    if (h.date !== date) continue;
    if (h.scope === "national") return h;
    if (!instr) continue;
    if (h.scope === "base" && instr.base && instr.base === h.base) return h;
  }
  return null;
};

// Ordena módulos: regulares (por prioridade; CBINC teoria antes de prática) → revisão → prova → tempo reserva.
const sortModules = mods => {
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

// Instrutor ausente em um dia/janela: dia inteiro (categoria) ou sobreposição de horário.
const isInstructorAbsent = (instructorId, date, startMins, endMins, absences) => {
  return absences.some(a => {
    if (String(a.instructorId) !== String(instructorId)) return false;
    const aStart = a.startDate, aEnd = a.endDate || a.startDate;
    if (date < aStart || date > aEnd) return false;
    // Full-day: categoria full-day SEM horário explícito (ex: Férias, Atestado).
    // Categoria full-day COM horário (ex: Folga BH só de manhã) → verifica overlap.
    if (isFullDayAbsence(a.category) && !a.startTime) return true;
    if (!a.startTime || !a.endTime) return false;
    const absS = timeToMins(a.startTime), absE = timeToMins(a.endTime);
    return startMins < absE && endMins > absS;
  });
};

// Resolve se uma skill cobre um módulo: por moduleId (formato novo) ou por nome (legado/órfã).
const skillMatchesModule = (skill, mod) => {
  if (!skill || !mod) return false;
  if (skill.moduleId != null) return String(skill.moduleId) === String(mod.id);
  const name = typeof skill === 'string' ? skill : skill.name;
  return name === mod.name;
};

// Variante para schedule rows históricos (só o nome do módulo como string); lookup no catálogo.
const skillMatchesModuleName = (skill, moduleName, trainings) => {
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

// Conflito de slot: sobreposição de horário na mesma data, por instrutor e/ou local,
// ignorando a própria turma e as turmas vinculadas. (Nome `checkSlotConflictG` mantido —
// é o que os módulos de produção chamam; os testes importam como `checkSlotConflict`.)
const checkSlotConflictG = (schedules, date, startTime, endTime, instructorId, local, excludeClassName, linkedClassNames) => {
  if (!date || !startTime || !endTime) return { instrConflict: false, localConflict: false };
  const linked = linkedClassNames || [];
  const nS = timeToMins(startTime), nE = timeToMins(endTime);
  const ignoreNames = new Set([excludeClassName, ...linked].filter(Boolean));
  const existing = schedules.filter(s => s.date === date && !ignoreNames.has(s.className));
  let instrConflict = false, localConflict = false;
  for (const ex of existing) {
    const eS = timeToMins(ex.startTime), eE = timeToMins(ex.endTime);
    if (!(nS < eE && eS < nE)) continue;
    if (instructorId && ex.instructorId && +instructorId === +ex.instructorId) instrConflict = true;
    if (local && ex.local && local === ex.local) localConflict = true;
    if (instrConflict && localConflict) break;
  }
  return { instrConflict, localConflict };
};

// ── Ponte para testes (Node/vitest) — no-op no navegador ──────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    reconcileSchedules: reconcileSchedules,
    timeToMins: timeToMins,
    FULL_DAY_CATEGORIES: FULL_DAY_CATEGORIES,
    isFullDayAbsence: isFullDayAbsence,
    isHoliday: isHoliday,
    sortModules: sortModules,
    isInstructorAbsent: isInstructorAbsent,
    skillMatchesModule: skillMatchesModule,
    skillMatchesModuleName: skillMatchesModuleName,
    checkSlotConflict: checkSlotConflictG,
    checkSlotConflictG: checkSlotConflictG,
  };
}
