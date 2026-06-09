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

// ── ⚠️ SONDA NR-12: o buraco que o journal sozinho NÃO fecha ───────────────────
// Hipótese (a confirmar com dados reais) do vetor pelo qual o "Arilson tradutor"
// reaparece numa turma que AINDA EXISTE — onde tombstones não se aplicam:
//
//   1. Uma aba/sessão stale salvou o slot de tradutor com Arilson sob um id novo.
//      → setSchedules marca esse id como upload pendente (config.js:1248-1249).
//   2. Noutra sessão, o planejador corrige para Daniel — outro id, vai pro SB.
//   3. Neste cliente, a row pendente do Arilson continua no LS + journal.
//   4. Na reconciliação, a row do Arilson não está no SB MAS está no journal
//      → é reempurrada. Como o UNIQUE é por (classId+módulo+data+início+instrutor),
//        Arilson (instrutor diferente de Daniel) NÃO colide: vira um slot EXTRA.
//
// Este teste DOCUMENTA o comportamento atual (a row pendente é reempurrada mesmo
// quando o servidor já tem o slot daquele papel preenchido por outro instrutor).
// Se passar, confirma que o journal não desduplica por identidade-de-slot — é a
// próxima correção a desenhar (ex.: ao reconciliar, descartar pendente cujo
// classId+moduleId+date+startTime+role já está ocupado no servidor).
describe('reconcileSchedules — SONDA NR-12 (vetor de ressurreição de slot)', () => {

  it('R08 — row pendente "stale" é reempurrada mesmo com o papel já preenchido no SB', () => {
    const slot = { classId: 'NR12-01', moduleId: 'M5', date: '2026-06-09', startTime: '08:00', role: 'translator' };
    // Servidor já tem o tradutor correto (Daniel) sob outro id:
    const server = [{ id: 'sb-daniel', instructorId: 'daniel', ...slot }];
    // Cliente tem a row stale do Arilson, marcada como pendente:
    const local  = [{ id: 'ls-arilson', instructorId: 'arilson', ...slot }];
    const pending = { 'ls-arilson': Date.now() };

    const r = reconcileSchedules(local, server, pending);

    // Comportamento ATUAL: o journal autoriza o reempurrão → Arilson volta como extra.
    expect(r.repush.map(s => s.instructorId)).toContain('arilson');
    expect(r.merged.map(s => s.instructorId).sort()).toEqual(['arilson', 'daniel']);
    // ↑ É exatamente o sintoma: dois tradutores no mesmo slot, o stale ressuscitado.
    //   O fix futuro deve fazer este expect virar apenas ['daniel'].
  });

});
