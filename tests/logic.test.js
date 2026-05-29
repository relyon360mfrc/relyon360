import { describe, it, expect } from 'vitest';
import {
  timeToMins, minsToTime, addDays,
  recalcTimes, sortModules,
  isInstructorAbsent,
  isHoliday,
  hashPw, checkPw
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
