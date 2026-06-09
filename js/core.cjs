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

  const repush = prev.filter(function (s) {
    return !sbIds.has(String(s.id)) &&
           pend[String(s.id)] != null &&        // só uploads genuínos não confirmados
           !isDel(s.classId);
  });

  const dropped = prev.filter(function (s) {
    return !sbIds.has(String(s.id)) &&
           pend[String(s.id)] == null;          // local-only sem upload → apagada alhures
  });

  const merged = repush.length > 0 ? cleanAll.concat(repush) : cleanAll;

  return { merged: merged, repush: repush, dropped: dropped, ghosts: ghosts, clearPending: clearPending };
};

// ── Ponte para testes (Node/vitest) — no-op no navegador ──────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { reconcileSchedules: reconcileSchedules };
}
