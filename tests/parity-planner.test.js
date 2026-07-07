// parity-planner.test.js — REDE ANTI-DIVERGÊNCIA do planner do MCP.
//
// O planner do servidor MCP (agents/mcp/src/planner.ts) é um PORT em TypeScript da
// lógica do wizard do app (config.js + constants.js). Port = cópia paralela = risco
// de divergir em silêncio quando o app muda. Esta suíte fecha essa brecha em duas
// camadas:
//
//   1. GOLDEN — trava as primitivas em valores verificados na produção
//      (config.js/constants.js). Se a fonte do app mudar, o espelho de teste (logic.js)
//      precisa acompanhar, senão o golden quebra. (Já caçou 2 divergências em 12/06/2026:
//      FULL_DAY_CATEGORIES e o modelo de feriado state/municipal → national/base.)
//
//   2. PARITY — roda os MESMOS cenários no port (planner.ts) E na fonte do app
//      (logic.js, ela própria golden-travada) e exige saída idêntica. Se o port
//      divergir do app, a CI quebra aqui.
//
// Transitivamente: planner.ts fica amarrado ao comportamento de produção.
// Resíduo conhecido (fecha na Fase 2): se alguém editar config.js/constants.js sem
// atualizar logic.js + estes golden, o golden é quem avisa. A cura final é o
// single-source via core.cjs (ver memória project-criar-turma-mcp / Fase 2).

import { describe, it, expect } from 'vitest';
import * as App from '../js/logic.js';
import * as Planner from '../agents/mcp/src/planner.ts';

const LUNCH = { start: 12 * 60, end: 13 * 60 };
const DAY_END = 17 * 60;

// Só os campos de TIMING importam para a paridade do recalcTimes — as duas
// implementações têm formatos de row diferentes (o app espalha o item inteiro;
// o port só guarda mod), mas a decisão de data/horário tem que ser idêntica.
const timing = (rows) => rows.map((r) => ({ date: r.date, startTime: r.startTime, endTime: r.endTime }));
const mod = (id, minutes, extra = {}) => ({ id, minutes, name: extra.name || `M${id}`, type: extra.type, priority: extra.priority });
const item = (id, minutes, extra) => ({ id, mod: mod(id, minutes, extra) });

const recalcApp = (items, date, startMins) => App.recalcTimes(items, date, startMins, DAY_END, LUNCH);
const recalcPlan = (items, date, startMins) => Planner.recalcTimes(items, date, startMins, DAY_END, LUNCH);

// ════════════════════════════════════════════════════════════════════════════
// CAMADA 1 — GOLDEN (trava o comportamento de produção)
// ════════════════════════════════════════════════════════════════════════════

describe('GOLDEN recalcTimes — valores verificados em config.js', () => {
  it('G01 — 4h às 08:00 → bloco único 08:00–12:00', () => {
    expect(timing(recalcPlan([item(1, 240)], '2026-06-15', 8 * 60))).toEqual([
      { date: '2026-06-15', startTime: '08:00', endTime: '12:00' },
    ]);
  });

  it('G02 — 4h às 10:00 → corta no almoço (10–12 + 13–15)', () => {
    expect(timing(recalcPlan([item(1, 240)], '2026-06-15', 10 * 60))).toEqual([
      { date: '2026-06-15', startTime: '10:00', endTime: '12:00' },
      { date: '2026-06-15', startTime: '13:00', endTime: '15:00' },
    ]);
  });

  it('G03 — 10h às 08:00 → transborda p/ o dia seguinte (3 blocos)', () => {
    expect(timing(recalcPlan([item(1, 600)], '2026-06-15', 8 * 60))).toEqual([
      { date: '2026-06-15', startTime: '08:00', endTime: '12:00' },
      { date: '2026-06-15', startTime: '13:00', endTime: '17:00' },
      { date: '2026-06-16', startTime: '08:00', endTime: '10:00' },
    ]);
  });

  it('G04 — recalcTimes NÃO pula fim de semana (sexta 19/06 transborda p/ sábado 20)', () => {
    // 2026-06-19 é sexta. Fiel ao app: o avanço é addDays(+1), sem checar dia da semana.
    expect(timing(recalcPlan([item(1, 600)], '2026-06-19', 8 * 60))).toEqual([
      { date: '2026-06-19', startTime: '08:00', endTime: '12:00' },
      { date: '2026-06-19', startTime: '13:00', endTime: '17:00' },
      { date: '2026-06-20', startTime: '08:00', endTime: '10:00' },
    ]);
  });

  it('G05 — 60min às 16:30 → 16:30–17:00 + dia seguinte 08:00–08:30', () => {
    expect(timing(recalcPlan([item(1, 60)], '2026-06-15', 16 * 60 + 30))).toEqual([
      { date: '2026-06-15', startTime: '16:30', endTime: '17:00' },
      { date: '2026-06-16', startTime: '08:00', endTime: '08:30' },
    ]);
  });
});

describe('GOLDEN isHoliday — modelo multibase (national/base) de constants.js', () => {
  const nat = { date: '2026-04-21', scope: 'national' };
  const macae = { date: '2026-07-29', scope: 'base', base: 'Macaé' };
  const all = [nat, macae];

  it('G06 — nacional aplica a qualquer base', () => {
    expect(!!Planner.isHoliday('2026-04-21', { id: 1, base: 'Offshore' }, all)).toBe(true);
    expect(!!App.isHoliday('2026-04-21', { id: 1, base: 'Offshore' }, all)).toBe(true);
  });

  it('G07 — base só aplica à mesma base', () => {
    expect(!!Planner.isHoliday('2026-07-29', { id: 1, base: 'Macaé' }, all)).toBe(true);
    expect(!!Planner.isHoliday('2026-07-29', { id: 1, base: 'Bangu' }, all)).toBe(false);
  });
});

describe('GOLDEN FULL_DAY_CATEGORIES — lista exata de produção', () => {
  it('G08 — port expõe exatamente as 7 categorias de produção (com Folga Banco de Horas)', () => {
    // Golden hardcoded E paridade com a fonte real (core.cjs via logic.js). O golden
    // antigo travava 6 categorias — foi escrito contra lista já desatualizada e deixou
    // "Folga Banco de Horas" de fora por 1 mês (auditoria 2026-07-07). A linha de
    // paridade garante que uma futura divergência port↔app quebre aqui.
    expect(Planner.FULL_DAY_CATEGORIES).toEqual([
      'Atestado Médico', 'Férias', 'Folga Abonada', 'Folga Banco de Horas', 'Embarque',
      'Licença Paternidade/Maternidade', 'Suspensão Disciplinar',
    ]);
    expect(Planner.FULL_DAY_CATEGORIES).toEqual(App.FULL_DAY_CATEGORIES);
  });

  it('G09 — cada categoria de dia inteiro marca ausência (port E app)', () => {
    for (const cat of Planner.FULL_DAY_CATEGORIES) {
      const abs = [{ instructorId: 1, category: cat, startDate: '2026-06-15' }];
      expect(Planner.isInstructorAbsent(1, '2026-06-15', 8 * 60, 12 * 60, abs)).toBe(true);
      expect(App.isInstructorAbsent(1, '2026-06-15', 8 * 60, 12 * 60, abs)).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CAMADA 2 — PARITY (port vs app, mesmos cenários → saída idêntica)
// ════════════════════════════════════════════════════════════════════════════

describe('PARITY recalcTimes — port == app em toda a bateria', () => {
  const durations = [30, 60, 90, 120, 150, 180, 210, 240, 300, 360, 420, 480, 540, 600, 660, 720, 1000];
  const starts = [8 * 60, 9 * 60, 10 * 60, 11 * 60, 11 * 60 + 30, 12 * 60, 12 * 60 + 30, 13 * 60, 14 * 60, 16 * 60, 16 * 60 + 30];

  it('P01 — módulo único: toda duração × todo horário de início', () => {
    for (const d of durations) {
      for (const s of starts) {
        const its = [item(1, d)];
        const a = timing(recalcApp(its, '2026-06-15', s));
        const p = timing(recalcPlan(its, '2026-06-15', s));
        expect(p, `dur=${d} start=${s}`).toEqual(a);
      }
    }
  });

  it('P02 — sequências de múltiplos módulos', () => {
    const seqs = [
      [item(1, 240), item(2, 240)],
      [item(1, 120), item(2, 120), item(3, 120), item(4, 120)],
      [item(1, 480), item(2, 480)],
      [item(1, 90), item(2, 210), item(3, 300)],
      [item(1, 600), item(2, 240), item(3, 360)],
      [item(1, 60), item(2, 60), item(3, 60), item(4, 60), item(5, 60)],
    ];
    for (const seq of seqs) {
      for (const s of [8 * 60, 10 * 60, 13 * 60]) {
        const a = timing(recalcApp(seq, '2026-06-15', s));
        const p = timing(recalcPlan(seq, '2026-06-15', s));
        expect(p, `seq len=${seq.length} start=${s}`).toEqual(a);
      }
    }
  });
});

describe('PARITY sortModules — port == app', () => {
  const cases = [
    [mod(1, 60, { name: 'NR10 PROVA', priority: 5 }), mod(2, 60, { name: 'NR10 REVISÃO', priority: 3 }), mod(3, 60, { name: 'TEORIA', priority: 1 }), mod(4, 60, { name: 'TEMPO RESERVA', priority: 9 })],
    [mod(1, 60, { name: 'CBINC', type: 'PRÁTICA', priority: 2 }), mod(2, 60, { name: 'CBINC', type: 'TEORIA', priority: 2 })],
    [mod(1, 60, { name: 'B', priority: 3 }), mod(2, 60, { name: 'A', priority: 1 }), mod(3, 60, { name: 'C', priority: 2 })],
    [mod(1, 60, { name: 'Módulo sem prioridade' }), mod(2, 60, { name: 'PROVA FINAL', priority: 1 })],
    [],
  ];
  it('S01 — ordem de nomes idêntica em todos os casos', () => {
    cases.forEach((mods, i) => {
      const a = App.sortModules(mods).map((m) => m.name);
      const p = Planner.sortModules(mods).map((m) => m.name);
      expect(p, `caso ${i}`).toEqual(a);
    });
  });
});

describe('PARITY isInstructorAbsent — port == app', () => {
  const absences = [
    { instructorId: 1, category: 'Férias', startDate: '2026-06-10', endDate: '2026-06-20' },
    { instructorId: 2, category: 'Folga Abonada', startDate: '2026-06-15' },
    { instructorId: 3, category: 'Embarque', startDate: '2026-06-15', endDate: '2026-06-18' },
    { instructorId: 4, category: 'Compromisso Parcial', startDate: '2026-06-15', startTime: '14:00', endTime: '16:00' },
    { instructorId: 5, category: 'Atestado Médico', startDate: '2026-06-15' },
  ];
  it('A01 — combinação de instrutor × data × janela horária', () => {
    for (const id of [1, 2, 3, 4, 5, 99]) {
      for (const date of ['2026-06-14', '2026-06-15', '2026-06-19', '2026-06-21']) {
        for (const [s, e] of [[8 * 60, 12 * 60], [13 * 60, 17 * 60], [14 * 60, 15 * 60], [15 * 60, 16 * 60 + 30]]) {
          const a = App.isInstructorAbsent(id, date, s, e, absences);
          const p = Planner.isInstructorAbsent(id, date, s, e, absences);
          expect(p, `id=${id} date=${date} ${s}-${e}`).toBe(a);
        }
      }
    }
  });
});

describe('PARITY isHoliday — port == app (truthiness)', () => {
  const holidays = [
    { date: '2026-04-21', scope: 'national' },
    { date: '2026-07-29', scope: 'base', base: 'Macaé' },
    { date: '2026-05-10', scope: 'base', base: 'Bangu' },
  ];
  it('H-P01 — toda data × toda base', () => {
    for (const date of ['2026-04-21', '2026-07-29', '2026-05-10', '2026-06-01']) {
      for (const base of ['Macaé', 'Bangu', 'Offshore', undefined]) {
        const instr = base ? { id: 1, base } : { id: 1 };
        const a = !!App.isHoliday(date, instr, holidays);
        const p = !!Planner.isHoliday(date, instr, holidays);
        expect(p, `date=${date} base=${base}`).toBe(a);
      }
    }
  });
});

describe('PARITY skillMatchesModule — port == app', () => {
  const m = mod(42, 60, { name: 'NR-35 Teórico' });
  const skills = [
    { moduleId: 42, trainingId: 7 },
    { moduleId: 99, trainingId: 7 },
    { name: 'NR-35 Teórico' },
    { name: 'Outro Módulo' },
    'NR-35 Teórico',
    'TRADUTOR',
  ];
  it('SK01 — todo tipo de skill (moduleId / name / string)', () => {
    skills.forEach((sk, i) => {
      const a = App.skillMatchesModule(sk, m);
      const p = Planner.skillMatchesModule(sk, m);
      expect(p, `skill ${i}`).toBe(a);
    });
  });
});

describe('PARITY checkSlotConflict — port == app', () => {
  const schedules = [
    { className: 'CBSP 01', date: '2026-06-15', startTime: '08:00', endTime: '12:00', instructorId: 5, local: 'SALA 09' },
    { className: 'CBSP 02', date: '2026-06-15', startTime: '13:00', endTime: '17:00', instructorId: 7, local: 'CBINC 01' },
    { className: 'EC 8h 01', date: '2026-06-15', startTime: '10:00', endTime: '11:00', instructorId: 5, local: 'PISCINA' },
  ];
  it('C01 — instrutor/local × janelas × turmas ignoradas', () => {
    const cases = [
      { st: '08:00', et: '12:00', instr: 5, local: 'SALA 09', exclude: null, linked: [] },   // conflito instr+local
      { st: '08:00', et: '09:00', instr: 7, local: 'SALA 09', exclude: null, linked: [] },   // conflito só local
      { st: '08:00', et: '09:00', instr: 5, local: 'OUTRA', exclude: null, linked: [] },     // conflito só instr
      { st: '13:00', et: '14:00', instr: 5, local: 'SALA 09', exclude: null, linked: [] },   // sem overlap → sem conflito
      { st: '08:00', et: '12:00', instr: 5, local: 'SALA 09', exclude: 'CBSP 01', linked: [] }, // própria turma ignorada
      { st: '08:00', et: '12:00', instr: 5, local: 'SALA 09', exclude: null, linked: ['CBSP 01'] }, // vinculada ignorada
      { st: '10:30', et: '11:30', instr: 5, local: 'PISCINA', exclude: null, linked: [] },   // overlap parcial
    ];
    cases.forEach((c, i) => {
      const a = App.checkSlotConflict(schedules, '2026-06-15', c.st, c.et, c.instr, c.local, c.exclude, c.linked);
      const ignore = new Set([c.exclude, ...c.linked].filter(Boolean));
      const p = Planner.checkSlotConflict(schedules, '2026-06-15', c.st, c.et, c.instr, c.local, ignore);
      expect(p, `caso ${i}`).toEqual(a);
    });
  });
});
