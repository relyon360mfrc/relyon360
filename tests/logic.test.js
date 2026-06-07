import { describe, it, expect } from 'vitest';
import {
  timeToMins, minsToTime, addDays,
  recalcTimes, sortModules,
  isInstructorAbsent,
  isHoliday,
  hashPw, checkPw,
  aiShuffle, aiOrderQualified, aiDayEndMin,
  aiCellToISO, aiNormalizeYesNo, aiCellToStudents,
  aiResolveInstructorByName,
} from '../js/logic.js';

// Helper para criar um planItem simples
const item = (id, minutes) => ({ id, mod: { minutes }, slots: [] });

// ── recalcTimes ────────────────────────────────────────────────────────────────
describe('recalcTimes', () => {

  it('T01 — módulo 4h começa às 08:00, termina às 12:00 (sem quebra)', () => {
    const result = recalcTimes([item(1, 240)], '2026-01-01', 8 * 60);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: '2026-01-01', startTime: '08:00', endTime: '12:00' });
  });

  it('T02 — módulo 4h começa às 13:00, termina às 17:00 (sem quebra)', () => {
    const result = recalcTimes([item(1, 240)], '2026-01-01', 13 * 60);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: '2026-01-01', startTime: '13:00', endTime: '17:00' });
  });

  it('T03 — módulo 4h começa às 10:00, parte é cortada no almoço (dois chunks)', () => {
    const result = recalcTimes([item(1, 240)], '2026-01-01', 10 * 60);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ startTime: '10:00', endTime: '12:00' }); // 2h manhã
    expect(result[1]).toMatchObject({ startTime: '13:00', endTime: '15:00' }); // 2h tarde
  });

  it('T04 — módulo 8h começa às 08:00, ocupa manhã e tarde do mesmo dia (dois chunks)', () => {
    const result = recalcTimes([item(1, 480)], '2026-01-01', 8 * 60);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ date: '2026-01-01', startTime: '08:00', endTime: '12:00' });
    expect(result[1]).toMatchObject({ date: '2026-01-01', startTime: '13:00', endTime: '17:00' });
  });

  it('T05 — módulo 10h começa às 08:00, transborda para o dia seguinte', () => {
    const result = recalcTimes([item(1, 600)], '2026-01-01', 8 * 60);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ date: '2026-01-01', startTime: '08:00', endTime: '12:00' });
    expect(result[1]).toMatchObject({ date: '2026-01-01', startTime: '13:00', endTime: '17:00' });
    expect(result[2]).toMatchObject({ date: '2026-01-02', startTime: '08:00', endTime: '10:00' }); // 2h restantes
  });

  it('T06 — dois módulos de 4h sequenciais preenchem manhã e tarde', () => {
    const result = recalcTimes([item(1, 240), item(2, 240)], '2026-01-01', 8 * 60);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 1, startTime: '08:00', endTime: '12:00' });
    expect(result[1]).toMatchObject({ id: 2, startTime: '13:00', endTime: '17:00' });
  });

  it('T07 — módulo 2h começa às 11:00, atravessa o almoço (dois chunks)', () => {
    const result = recalcTimes([item(1, 120)], '2026-01-01', 11 * 60);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ startTime: '11:00', endTime: '12:00' }); // 1h manhã
    expect(result[1]).toMatchObject({ startTime: '13:00', endTime: '14:00' }); // 1h tarde
  });

  it('T08 — almoço customizado 11:30-12:30: módulo 4h às 10:00 quebra no novo horário', () => {
    const lunch = { start: 11 * 60 + 30, end: 12 * 60 + 30 };
    const result = recalcTimes([item(1, 240)], '2026-01-01', 10 * 60, 17 * 60, lunch);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ startTime: '10:00', endTime: '11:30' }); // 1h30 manhã
    expect(result[1]).toMatchObject({ startTime: '12:30', endTime: '15:00' }); // 2h30 tarde
  });

  it('T09 — almoço customizado preserva 12:00 quando lunch é 12:30-13:30', () => {
    const lunch = { start: 12 * 60 + 30, end: 13 * 60 + 30 };
    const result = recalcTimes([item(1, 240)], '2026-01-01', 8 * 60, 17 * 60, lunch);
    // 4h começando 08:00 termina exatamente 12:00 — fica antes do almoço, sem quebra.
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ startTime: '08:00', endTime: '12:00' });
  });

});

// ── isInstructorAbsent ─────────────────────────────────────────────────────────
describe('isInstructorAbsent', () => {

  it('A01 — ausência Atestado (full-day) bloqueia o instrutor no mesmo dia', () => {
    const absences = [{ instructorId: '1', startDate: '2026-01-01', category: 'Atestado Médico' }];
    expect(isInstructorAbsent('1', '2026-01-01', 8 * 60, 12 * 60, absences)).toBe(true);
  });

  it('A02 — ausência Férias cobrindo intervalo de datas bloqueia corretamente', () => {
    const absences = [{ instructorId: '1', startDate: '2026-01-01', endDate: '2026-01-10', category: 'Férias' }];
    expect(isInstructorAbsent('1', '2026-01-05', 8 * 60, 12 * 60, absences)).toBe(true);
  });

  it('A03 — ausência parcial que sobrepõe o horário bloqueia', () => {
    const absences = [{ instructorId: '1', startDate: '2026-01-01', category: 'Voluntária', startTime: '09:00', endTime: '11:00' }];
    expect(isInstructorAbsent('1', '2026-01-01', 10 * 60, 12 * 60, absences)).toBe(true);
  });

  it('A04 — ausência parcial fora do horário da aula não bloqueia', () => {
    const absences = [{ instructorId: '1', startDate: '2026-01-01', category: 'Voluntária', startTime: '13:00', endTime: '17:00' }];
    expect(isInstructorAbsent('1', '2026-01-01', 8 * 60, 12 * 60, absences)).toBe(false);
  });

  it('A05 — ausência em data diferente não bloqueia', () => {
    const absences = [{ instructorId: '1', startDate: '2026-01-02', category: 'Atestado Médico' }];
    expect(isInstructorAbsent('1', '2026-01-01', 8 * 60, 12 * 60, absences)).toBe(false);
  });

  it('A06 — sem ausência cadastrada retorna livre', () => {
    expect(isInstructorAbsent('1', '2026-01-01', 8 * 60, 12 * 60, [])).toBe(false);
  });

});

// ── sortModules ────────────────────────────────────────────────────────────────
describe('sortModules', () => {

  it('S01 — CBINC: TEORIA antes de PRÁTICA independentemente da ordem original', () => {
    const mods = [
      { id: 1, name: 'CBINC COMBATE', type: 'PRÁTICA', priority: 1 },
      { id: 2, name: 'CBINC TEORIA',  type: 'TEORIA',  priority: 2 },
    ];
    const result = sortModules(mods);
    expect(result[0].type).toBe('TEORIA');
    expect(result[1].type).toBe('PRÁTICA');
  });

  it('S02 — módulos regulares ordenados por priority ascendente', () => {
    const mods = [
      { id: 1, name: 'Módulo C', type: 'TEORIA', priority: 3 },
      { id: 2, name: 'Módulo A', type: 'TEORIA', priority: 1 },
      { id: 3, name: 'Módulo B', type: 'TEORIA', priority: 2 },
    ];
    const result = sortModules(mods);
    expect(result.map(m => m.id)).toEqual([2, 3, 1]);
  });

  it('S03 — PROVA vai ao final depois dos módulos regulares', () => {
    const mods = [
      { id: 1, name: 'Módulo A',    type: 'TEORIA',  priority: 1 },
      { id: 2, name: 'PROVA FINAL', type: 'PROVA',   priority: 99 },
      { id: 3, name: 'Módulo B',    type: 'PRÁTICA', priority: 2 },
    ];
    const result = sortModules(mods);
    expect(result[result.length - 1].name).toBe('PROVA FINAL');
  });

  it('S04 — TEMPO RESERVA vem depois da PROVA', () => {
    const mods = [
      { id: 1, name: 'TEMPO RESERVA', type: 'RESERVA', priority: 99 },
      { id: 2, name: 'PROVA',         type: 'PROVA',   priority: 99 },
      { id: 3, name: 'Módulo A',      type: 'TEORIA',  priority: 1 },
    ];
    const result = sortModules(mods);
    const names = result.map(m => m.name);
    expect(names.indexOf('PROVA')).toBeLessThan(names.indexOf('TEMPO RESERVA'));
    expect(names[0]).toBe('Módulo A');
  });

  it('S05 — ordem completa: regulares → revisão → prova → tempo reserva', () => {
    const mods = [
      { id: 1, name: 'TEMPO RESERVA', type: 'RESERVA', priority: 99 },
      { id: 2, name: 'PROVA FINAL',   type: 'PROVA',   priority: 99 },
      { id: 3, name: 'REVISÃO',       type: 'TEORIA',  priority: 99 },
      { id: 4, name: 'Módulo A',      type: 'TEORIA',  priority: 1  },
    ];
    const result = sortModules(mods);
    const names = result.map(m => m.name);
    expect(names[0]).toBe('Módulo A');
    expect(names.indexOf('REVISÃO')).toBeLessThan(names.indexOf('PROVA FINAL'));
    expect(names.indexOf('PROVA FINAL')).toBeLessThan(names.indexOf('TEMPO RESERVA'));
  });

  it('S06 — nome composto "CACI - REVISÃO" é reconhecido como revisão', () => {
    const mods = [
      { id: 1, name: 'PROVA',          type: 'PROVA',  priority: 99 },
      { id: 2, name: 'CACI - REVISÃO', type: 'TEORIA', priority: 99 },
      { id: 3, name: 'Módulo A',       type: 'TEORIA', priority: 1  },
    ];
    const result = sortModules(mods);
    const names = result.map(m => m.name);
    expect(names.indexOf('CACI - REVISÃO')).toBeLessThan(names.indexOf('PROVA'));
    expect(names[0]).toBe('Módulo A');
  });

});

// ── isHoliday ──────────────────────────────────────────────────────────────────
describe('isHoliday', () => {
  const nat = { id: 1, date: '2026-04-21', name: 'Tiradentes', scope: 'national', state: '', city: '' };
  const stRJ = { id: 2, date: '2026-04-23', name: 'São Jorge', scope: 'state', state: 'RJ', city: '' };
  const muMacae = { id: 3, date: '2026-07-29', name: 'Aniversário Macaé', scope: 'municipal', state: 'RJ', city: 'Macaé' };
  const all = [nat, stRJ, muMacae];

  it('H01 — feriado nacional aplica a qualquer instrutor (mesmo sem state/city)', () => {
    expect(isHoliday('2026-04-21', { id: 5 }, all)).toEqual(nat);
    expect(isHoliday('2026-04-21', { id: 5, state: 'SP', city: 'São Paulo' }, all)).toEqual(nat);
  });

  it('H02 — feriado estadual só aplica a instrutor com a mesma UF', () => {
    expect(isHoliday('2026-04-23', { id: 5, state: 'RJ', city: 'Niterói' }, all)).toEqual(stRJ);
    expect(isHoliday('2026-04-23', { id: 5, state: 'SP', city: 'São Paulo' }, all)).toBeNull();
    expect(isHoliday('2026-04-23', { id: 5 }, all)).toBeNull(); // instrutor sem state
  });

  it('H03 — feriado municipal exige UF E cidade exatas', () => {
    expect(isHoliday('2026-07-29', { id: 5, state: 'RJ', city: 'Macaé' }, all)).toEqual(muMacae);
    expect(isHoliday('2026-07-29', { id: 5, state: 'RJ', city: 'Niterói' }, all)).toBeNull();
    expect(isHoliday('2026-07-29', { id: 5, state: 'SP', city: 'Macaé' }, all)).toBeNull();
    expect(isHoliday('2026-07-29', { id: 5, state: 'RJ' }, all)).toBeNull(); // sem city
  });

  it('H04 — data sem feriado retorna null', () => {
    expect(isHoliday('2026-05-01', { id: 5 }, all)).toBeNull();
  });

  it('H05 — lista vazia ou null retorna null', () => {
    expect(isHoliday('2026-04-21', { id: 5 }, [])).toBeNull();
    expect(isHoliday('2026-04-21', { id: 5 }, null)).toBeNull();
  });
});

// ── checkPw / hashPw ───────────────────────────────────────────────────────────
describe('checkPw / hashPw', () => {

  it('P01 — hash de uma senha e verificação com a mesma retorna true', () => {
    const hash = hashPw('minhaSenha123');
    expect(checkPw('minhaSenha123', hash)).toBe(true);
  });

  it('P02 — verificação com senha errada retorna false', () => {
    const hash = hashPw('minhaSenha123');
    expect(checkPw('senhaErrada', hash)).toBe(false);
  });

  it('P03 — senha plaintext legada (sem $2) usa fallback de comparação direta', () => {
    expect(checkPw('admin123', 'admin123')).toBe(true);
    expect(checkPw('admin123', 'outra')).toBe(false);
  });

});

// ── aiShuffle ──────────────────────────────────────────────────────────────────
describe('aiShuffle', () => {

  it('AI01 — retorna array com os mesmos elementos (permutação)', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = aiShuffle(arr);
    expect(result).toHaveLength(arr.length);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('AI02 — não modifica o array original', () => {
    const arr = [1, 2, 3];
    const copy = [...arr];
    aiShuffle(arr);
    expect(arr).toEqual(copy);
  });

  it('AI03 — array vazio retorna array vazio', () => {
    expect(aiShuffle([])).toEqual([]);
  });

  it('AI04 — array de 1 elemento retorna o mesmo', () => {
    expect(aiShuffle([42])).toEqual([42]);
  });

});

// ── aiOrderQualified ───────────────────────────────────────────────────────────
describe('aiOrderQualified', () => {
  const pool = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const scores = { 1: 10, 2: 30, 3: 20 };

  it('AI05 — sem previousIds ordena por score desc', () => {
    const result = aiOrderQualified(pool, scores, new Set());
    expect(result[0].id).toBe(2); // score 30
    expect(result[1].id).toBe(3); // score 20
    expect(result[2].id).toBe(1); // score 10
  });

  it('AI06 — com previousIds, não-anteriores sobem à frente', () => {
    // id 2 estava no arranjo anterior → deve cair; ids 1 e 3 sobem
    const prev = new Set(['2']);
    const result = aiOrderQualified(pool, scores, prev);
    expect(result.map(r => r.id)).not.toContain(undefined);
    expect(result.find(r => r.id === 2)).toBeDefined(); // ainda está, mas não first
    const idx2 = result.findIndex(r => r.id === 2);
    expect(idx2).toBeGreaterThan(0);
  });

  it('AI07 — pool vazio retorna array vazio', () => {
    expect(aiOrderQualified([], scores, new Set())).toEqual([]);
  });

});

// ── aiDayEndMin ────────────────────────────────────────────────────────────────
describe('aiDayEndMin', () => {

  it('AI08 — treinamento normal (defaultSchedule=undefined) → 17h', () => {
    expect(aiDayEndMin({})).toBe(17 * 60);
    expect(aiDayEndMin(null)).toBe(17 * 60);
  });

  it('AI09 — treinamento normal (defaultSchedule=true) → 17h', () => {
    expect(aiDayEndMin({ defaultSchedule: true })).toBe(17 * 60);
  });

  it('AI10 — horário livre sem horarioFim → 21h (fallback)', () => {
    expect(aiDayEndMin({ defaultSchedule: false })).toBe(21 * 60);
  });

  it('AI11 — horário livre com horarioFim definido → usa horarioFim', () => {
    expect(aiDayEndMin({ defaultSchedule: false, horarioFim: '19:30' })).toBe(19 * 60 + 30);
  });

});

// ── aiCellToISO ────────────────────────────────────────────────────────────────
describe('aiCellToISO', () => {

  it('AI12 — null / string vazia → ""', () => {
    expect(aiCellToISO(null)).toBe('');
    expect(aiCellToISO('')).toBe('');
  });

  it('AI13 — objeto Date válido → YYYY-MM-DD', () => {
    const d = new Date(2026, 3, 15); // 15 abr 2026
    expect(aiCellToISO(d)).toBe('2026-04-15');
  });

  it('AI14 — serial numérico do Excel (46126 = 2026-04-14)', () => {
    // Verifica que o caminho numérico produz uma data ISO válida
    expect(aiCellToISO(46126)).toBe('2026-04-14');
  });

  it('AI15 — string DD/MM/AAAA → YYYY-MM-DD', () => {
    expect(aiCellToISO('15/04/2026')).toBe('2026-04-15');
    expect(aiCellToISO('5/4/2026')).toBe('2026-04-05');
  });

  it('AI16 — string YYYY-MM-DD → normalizada com zero-padding', () => {
    expect(aiCellToISO('2026-4-5')).toBe('2026-04-05');
  });

  it('AI17 — string inválida → ""', () => {
    expect(aiCellToISO('abc')).toBe('');
  });

});

// ── aiNormalizeYesNo ───────────────────────────────────────────────────────────
describe('aiNormalizeYesNo', () => {

  it('AI18 — "SIM" / "S" / "YES" / "Y" / "1" / "TRUE" → true', () => {
    for (const v of ['SIM', 'sim', 'Sim', 'S', 's', 'YES', 'yes', 'Y', 'y', '1', 'TRUE', 'true']) {
      expect(aiNormalizeYesNo(v)).toBe(true);
    }
  });

  it('AI19 — "NÃO" / "N" / "NO" / "0" / "" → false', () => {
    for (const v of ['NÃO', 'não', 'N', 'n', 'NO', 'no', '0', '', 'false']) {
      expect(aiNormalizeYesNo(v)).toBe(false);
    }
  });

  it('AI20 — null → false', () => {
    expect(aiNormalizeYesNo(null)).toBe(false);
    expect(aiNormalizeYesNo(undefined)).toBe(false);
  });

});

// ── aiCellToStudents ───────────────────────────────────────────────────────────
describe('aiCellToStudents', () => {

  it('AI21 — número inteiro → string do número', () => {
    expect(aiCellToStudents(12)).toBe('12');
    expect(aiCellToStudents(0)).toBe('0');
  });

  it('AI22 — string com número → string do número', () => {
    expect(aiCellToStudents('15 alunos')).toBe('15');
    expect(aiCellToStudents('8')).toBe('8');
  });

  it('AI23 — null / "" / inválido → ""', () => {
    expect(aiCellToStudents(null)).toBe('');
    expect(aiCellToStudents('')).toBe('');
    expect(aiCellToStudents('abc')).toBe('');
  });

  it('AI24 — número negativo → ""', () => {
    expect(aiCellToStudents(-5)).toBe('');
  });

});

// ── aiResolveInstructorByName ──────────────────────────────────────────────────
describe('aiResolveInstructorByName', () => {
  const instructors = [
    { id: 1, name: 'João Carlos da Silva', status: 'Ativo' },
    { id: 2, name: 'Maria Oliveira',        status: 'Ativo' },
    { id: 3, name: 'Pedro Santos',          status: 'Ativo' },
    { id: 4, name: 'Pedro Lima',            status: 'Ativo' },
    { id: 5, name: 'Carlos Afastado',       status: 'Inativo' },
  ];

  it('AI25 — match exato por nome completo', () => {
    const { instructor, ambiguous } = aiResolveInstructorByName('Maria Oliveira', instructors);
    expect(instructor?.id).toBe(2);
    expect(ambiguous).toBe(false);
  });

  it('AI26 — match por primeiro + último nome', () => {
    const { instructor } = aiResolveInstructorByName('João Silva', instructors);
    expect(instructor?.id).toBe(1);
  });

  it('AI27 — ambiguidade quando dois instrutores batem', () => {
    const { instructor, ambiguous } = aiResolveInstructorByName('Pedro', instructors);
    expect(instructor).toBeNull();
    expect(ambiguous).toBe(true);
  });

  it('AI28 — instrutor inativo não é retornado', () => {
    const { instructor } = aiResolveInstructorByName('Carlos Afastado', instructors);
    expect(instructor).toBeNull();
  });

  it('AI29 — nome não encontrado retorna null sem ambiguidade', () => {
    const { instructor, ambiguous } = aiResolveInstructorByName('Fulano de Tal', instructors);
    expect(instructor).toBeNull();
    expect(ambiguous).toBe(false);
  });

  it('AI30 — ignora acentos na busca', () => {
    const { instructor } = aiResolveInstructorByName('Joao Carlos da Silva', instructors);
    expect(instructor?.id).toBe(1);
  });

});
