import { describe, it, expect } from 'vitest';
// core.cjs é a MESMA fonte que a produção usa (ver js/core.cjs). Não é espelho:
// importação CJS por default p/ interop robusta no vitest.
import core from '../js/core.cjs';
const { reconcileSchedules } = core;

// ── RECONCILIAÇÃO LS ↔ SUPABASE ───────────────────────────────────────────────
// Estes testes caracterizam a decisão server-authoritative de useSchedules
// (config.js ~1103-1133) via o espelho puro reconcileSchedules em logic.js.
//
// São a primeira rede de regressão para a CLASSE de bug "dado stale ressuscita"
// — a família NR-12 (tradutor errado volta), exclusão-volta-no-F5, órfã id-null.
//
// IMPORTANTE: reconcileSchedules é hoje um ESPELHO de config.js, não a fonte
// chamada em produção. O passo seguinte da fundação é religar o config.js para
// chamar esta função (mata o risco de o espelho divergir). Até lá, um teste verde
// aqui prova que a LÓGICA está correta — não que produção a executa.

// helper: cria uma row de schedule mínima (id + classId + slot identificável)
const row = (id, classId, extra = {}) => ({ id, classId, ...extra });

describe('reconcileSchedules — server é autoritativo para existência', () => {

  it('R01 — row que só existe no servidor entra no merged', () => {
    const r = reconcileSchedules([], [row(1, 'T1')], {});
    expect(r.merged).toHaveLength(1);
    expect(r.merged[0].id).toBe(1);
    expect(r.repush).toHaveLength(0);
    expect(r.dropped).toHaveLength(0);
  });

  it('R02 — row local-only SEM upload pendente é DESCARTADA (núcleo do fix 01/06)', () => {
    // O cliente tem uma row que o servidor não tem e que NÃO está no journal.
    // Interpretação server-authoritative: foi apagada em outra sessão. Descartar.
    // Este é o teste que garante que exclusões não voltam no F5.
    const local = [row(99, 'T1')];
    const r = reconcileSchedules(local, [], {} /* journal vazio */);
    expect(r.dropped.map(s => s.id)).toEqual([99]);
    expect(r.merged).toHaveLength(0);          // NÃO ressuscita
    expect(r.repush).toHaveLength(0);          // NÃO reempurra pro banco
  });

  it('R03 — row local-only COM upload pendente é preservada e reempurrada', () => {
    // Trabalho recém-criado neste cliente, ainda não confirmado no SB.
    // Tem que sobreviver ao F5 (senão o usuário perde o que acabou de planejar).
    const local = [row(99, 'T1')];
    const r = reconcileSchedules(local, [], { '99': Date.now() });
    expect(r.repush.map(s => s.id)).toEqual([99]);
    expect(r.merged.map(s => s.id)).toEqual([99]);
    expect(r.dropped).toHaveLength(0);
  });

  it('R04 — row presente em ambos é mantida uma vez e sai do journal', () => {
    const local = [row(1, 'T1')];
    const server = [row(1, 'T1')];
    const r = reconcileSchedules(local, server, { '1': Date.now() });
    expect(r.merged).toHaveLength(1);
    expect(r.clearPending).toEqual([1]);       // SB confirmou → remove do pending
    expect(r.repush).toHaveLength(0);
    expect(r.dropped).toHaveLength(0);
  });

});

describe('reconcileSchedules — tombstones (turma excluída)', () => {

  const deleted = new Set(['T_DEL']);
  const isDeleted = cid => deleted.has(cid);

  it('R05 — row do servidor com classId tombstoned vira ghost, fora do merged', () => {
    const server = [row(1, 'T_DEL'), row(2, 'T1')];
    const r = reconcileSchedules([], server, {}, isDeleted);
    expect(r.ghosts.map(s => s.id)).toEqual([1]);
    expect(r.merged.map(s => s.id)).toEqual([2]); // só a turma viva
  });

  it('R06 — tombstone vence o journal: row pendente de turma excluída NÃO volta', () => {
    // Mesmo marcada como upload pendente, se a turma foi excluída ela não pode
    // ressuscitar. A exclusão é autoritativa sobre o journal.
    const local = [row(50, 'T_DEL')];
    const r = reconcileSchedules(local, [], { '50': Date.now() }, isDeleted);
    expect(r.repush).toHaveLength(0);
    expect(r.merged).toHaveLength(0);
  });

});

describe('reconcileSchedules — defensivo', () => {

  it('R07 — rows com id null são ignoradas (não entram em repush/dropped)', () => {
    const local = [{ id: null, classId: 'T1' }, row(7, 'T1')];
    const r = reconcileSchedules(local, [], { '7': Date.now() });
    expect(r.repush.map(s => s.id)).toEqual([7]);
    expect(r.dropped).toHaveLength(0);
  });

});

// ── FIX NR-12: anti-ressurreição de slot singleton ────────────────────────────
// Papéis singleton (Translator, Theoretical/Practical/Lead Instructor) têm no máx.
// 1 instrutor por slot (confirmado por Matheus + dados de produção 2026-06-09).
// Se o servidor já tem o slot preenchido, a row local pendente é stale → descartada
// (superseded), NÃO reempurrada. Papéis multi (Assistant/Scuba/Crane) passam intactos.
describe('reconcileSchedules — FIX NR-12 (anti-ressurreição de slot singleton)', () => {

  const slot = (role, extra) => ({
    classId: 'NR12-01', moduleId: 'M5', date: '2026-06-09', startTime: '08:00', role, ...extra,
  });

  it('R08 — tradutor stale NÃO ressuscita: servidor preenchido vence (vira superseded)', () => {
    // O caso exato do Arilson: servidor tem Daniel (tradutor correto, outro id);
    // cliente tem Arilson stale marcado como pendente.
    const server  = [{ id: 'sb-daniel', instructorId: 'daniel', ...slot('Translator') }];
    const local   = [{ id: 'ls-arilson', instructorId: 'arilson', ...slot('Translator') }];
    const pending = { 'ls-arilson': Date.now() };

    const r = reconcileSchedules(local, server, pending);

    expect(r.superseded.map(s => s.instructorId)).toEqual(['arilson']); // detectado como stale
    expect(r.repush).toHaveLength(0);                                   // NÃO reempurrado
    expect(r.merged.map(s => s.instructorId)).toEqual(['daniel']);      // só o correto sobra
  });

  it('R09 — lead duplo stale NÃO ressuscita (Theoretical Instructor)', () => {
    const server  = [{ id: 'sb-paulo', instructorId: 'paulo', ...slot('Theoretical Instructor') }];
    const local   = [{ id: 'ls-gabriel', instructorId: 'gabriel', ...slot('Theoretical Instructor') }];
    const r = reconcileSchedules(local, server, { 'ls-gabriel': Date.now() });
    expect(r.merged.map(s => s.instructorId)).toEqual(['paulo']);
    expect(r.superseded.map(s => s.id)).toEqual(['ls-gabriel']);
  });

  it('R10 — papel MULTI (Assistant Instructor) NÃO é deduplicado: 2 assistentes coexistem', () => {
    // CRÍTICO: não pode derrubar assistente legítimo (mergulho tem até 6).
    const server  = [{ id: 'sb-a1', instructorId: 'assist1', ...slot('Assistant Instructor') }];
    const local   = [{ id: 'ls-a2', instructorId: 'assist2', ...slot('Assistant Instructor') }];
    const r = reconcileSchedules(local, server, { 'ls-a2': Date.now() });
    expect(r.repush.map(s => s.instructorId)).toEqual(['assist2']);     // preservado
    expect(r.superseded).toHaveLength(0);
    expect(r.merged.map(s => s.instructorId).sort()).toEqual(['assist1', 'assist2']);
  });

  it('R11 — papel singleton com slot LIVRE no servidor é preservado (lead novo legítimo)', () => {
    // Servidor não tem esse slot ainda → a pendente é trabalho novo de verdade.
    const local   = [{ id: 'ls-novo', instructorId: 'novolead', ...slot('Practical Instructor') }];
    const r = reconcileSchedules(local, [], { 'ls-novo': Date.now() });
    expect(r.repush.map(s => s.instructorId)).toEqual(['novolead']);
    expect(r.superseded).toHaveLength(0);
  });

  it('R12 — dedup intra-lote: 2 pendentes singleton no mesmo slot → só 1 sobra', () => {
    // Nenhum no servidor; duas versões pendentes do mesmo slot de tradutor.
    const local = [
      { id: 'ls-x', instructorId: 'x', ...slot('Translator') },
      { id: 'ls-y', instructorId: 'y', ...slot('Translator') },
    ];
    const r = reconcileSchedules(local, [], { 'ls-x': Date.now(), 'ls-y': Date.now() });
    expect(r.repush).toHaveLength(1);          // mantém a primeira
    expect(r.superseded).toHaveLength(1);      // descarta a segunda
    expect(r.merged).toHaveLength(1);
  });

  it('R13 — Crane Operator (fora da lista singleton) NÃO é deduplicado, por precaução', () => {
    const server = [{ id: 'sb-c1', instructorId: 'crane1', ...slot('Crane Operator') }];
    const local  = [{ id: 'ls-c2', instructorId: 'crane2', ...slot('Crane Operator') }];
    const r = reconcileSchedules(local, server, { 'ls-c2': Date.now() });
    expect(r.repush.map(s => s.instructorId)).toEqual(['crane2']);
    expect(r.superseded).toHaveLength(0);
  });

});
