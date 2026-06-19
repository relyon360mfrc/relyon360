/**
 * run-batch-2226.mjs — gera (preview) ou cria (--commit) o lote de turmas
 * 22–26/06/2026 (programação periódica JUNHO2206.xlsx) usando o MESMO planner
 * puro da tool MCP (dist/planner.js).
 *
 * Preview (padrão):   node scripts/run-batch-2226.mjs
 * Gravar de verdade:  node scripts/run-batch-2226.mjs --commit
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { planTurma } from '../dist/planner.js';
import {
  fetchInstructors, fetchAbsences, fetchHolidays, fetchTrainings,
  fetchSchedulesInRange, insertSchedules,
} from '../dist/services/supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

// Entrada: [gcc, className, dataISO, opts?]
//   opts = { pin:[ids], avoid:[ids], avoidOnDates:{id:[datas]}, linked:[nomes], startTime:"HH:MM" }
// pin = preferência de instrutor da planilha (topo da fila, antes da regra de contrato).
// Ordem: cursos longos/restritivos primeiro no dia 22 (seguram salas a semana toda).
const BATCH = [
  // ── 22/06 (segunda) ──────────────────────────────────────────────────────
  ['OBS308',    'CBSP 01',            '2026-06-22', { pin: [17] }], // ELCIO LEITE
  ['OBS322',    'MCIA - ALPH 01',     '2026-06-22', { pin: [32] }], // JOÃO MOURA
  ['OBS322',    'MCIA - ALPH 02',     '2026-06-22', { pin: [9]  }], // CARIVALDO PINHEIRO
  ['OFI3035',   'CACI 01',            '2026-06-22', { pin: [75] }], // WILSON SANTOS
  ['OSE314',    'CESS 01',            '2026-06-22', { pin: [55] }], // PAULO DE ALBUQUERQUE
  ['OSE315',    'CERR 01',            '2026-06-22', { pin: [10] }], // CARLOS ALBERTO (Freelancer)
  ['LSP351',    'NR 10 40H 01',       '2026-06-22', { pin: [96] }], // MASSANEIRO (Freelancer)
  ['LSP359',    'NR 13 40 H 01',      '2026-06-22', { pin: [6]  }], // AVELINO (Freelancer)
  ['OSP303',    'EC40H 01',           '2026-06-22', { pin: [69] }], // WAGNER RAMOS
  ['OFA304',    'CPSO 01',            '2026-06-22', { pin: [94] }], // RODRIGO BRAGANÇA (Freelancer)
  ['MBSBLE301', 'CBSP 01 (PRÁTICAS)', '2026-06-22', { pin: [71] }], // WAGNER CASTRO
  ['OSP331',    'ESTANQUEIDADE 01',   '2026-06-22', { pin: [2]  }], // APRÍGIO BARRETO
  ['OTC348',    'EMERG SALV 01',      '2026-06-22', { pin: [73] }], // WALLACE PONTES
  ['OSP302',    'EC16H 01',           '2026-06-22', { pin: [78] }], // LOHANA (Freelancer)
  ['OSC304',    'ALTURA 8h 01',       '2026-06-22', { pin: [95] }], // LEONARDO COUTINHO (Freelancer)
  ['NCS303',    'PREST.SERVIÇO NOBLE',     '2026-06-22', { pin: [3]  }], // ARILSON FERNANDES (North Noble)
  ['NCS303',    'BRIGADA DE INCÊNDIO 16H', '2026-06-22', { pin: [27] }], // GLAUCO GUEDES (corrigido: nome veio na coluna Name)
  // ── 23/06 (terça) ────────────────────────────────────────────────────────
  ['OSP312',    'EC 8h 01',           '2026-06-23', { pin: [95] }], // LEONARDO COUTINHO
  // ── 24/06 (quarta) ───────────────────────────────────────────────────────
  ['OSC304',    'ALTURA 8h 02',       '2026-06-24', { pin: [78] }], // LOHANA
  ['OSE326',    'TICB 01',            '2026-06-24', { pin: [43] }], // LUCAS RABELLO
  // ── 25/06 (quinta) ───────────────────────────────────────────────────────
  ['MBSBLE301', 'CBSP 02 (PRÁTICAS)', '2026-06-25', { pin: [71] }], // WAGNER CASTRO
  ['OBS327',    'NR 12 16 H 01',      '2026-06-25', { pin: [25] }], // GABRIEL MORAES
  ['OSE325',    'CAEBS (NOTURNO)',    '2026-06-25', { pin: [50], startTime: '17:00', eveningEnd: '20:00' }], // MARCUS — noturno 17:00-19:30
  ['OSP312',    'EC 8h 02',           '2026-06-25', { pin: [78] }], // LOHANA
  ['OSP374',    'GUINDASTE III',      '2026-06-25', { pin: [57] }], // RAMON BENEVIDES
  // ── 26/06 (sexta) ────────────────────────────────────────────────────────
  ['OSC304',    'ALTURA 8h 03',       '2026-06-26', { pin: [78] }], // LOHANA
  ['OSE326',    'TICB 02',            '2026-06-26', { pin: [43] }], // LUCAS RABELLO
];

const fmtBR = (d) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
const ROLE_PT = {
  'Lead Instructor': 'Inst. Líder', 'Theoretical Instructor': 'Inst. Teórico',
  'Practical Instructor': 'Inst. Prático', 'Support Instructor': 'Inst. Apoio',
  'Translator': 'Tradutor', 'Assistant Instructor': 'Assist.',
  'Scuba Diver': 'Scuba Diver', 'Crane Operator': 'Crane Operator',
};

async function main() {
  const [instructors, absences, holidays, trainings] = await Promise.all([
    fetchInstructors(), fetchAbsences(), fetchHolidays(), fetchTrainings(),
  ]);
  const existing = await fetchSchedulesInRange('2026-06-22', '2026-06-30');

  console.log(`Carregado: ${instructors.length} instrutores, ${absences.length} ausencias, ${holidays.length} feriados, ${trainings.length} treinamentos.`);
  console.log(`Programacao existente 22-30/06 no banco: ${existing.length} rows.`);
  console.log(`Modo: ${COMMIT ? 'COMMIT (vai gravar!)' : 'PREVIEW (nao grava)'}`);
  console.log('');

  const accumulated = [...existing];
  const allRows = [];
  const report = [];
  const summary = [];
  let totalSlots = 0, totalGaps = 0;

  report.push(`# Lote de turmas 22-26/06/2026 — ${COMMIT ? 'GRAVADO' : 'PREVIEW'}`);
  report.push(`Gerado em ${new Date().toISOString()}`);
  report.push('');

  const idToName = new Map(instructors.map(i => [i.id, i.name]));

  for (const [gcc, className, dateISO, opts = {}] of BATCH) {
    const training = trainings.find(t => (t.gcc || '').toLowerCase() === gcc.toLowerCase());
    if (!training) {
      summary.push(`X  ${gcc.padEnd(10)} ${className.padEnd(22)} — TREINAMENTO NAO ENCONTRADO`);
      report.push(`## ❌ ${className} (${gcc}) — treinamento não encontrado\n`);
      continue;
    }
    // Turma noturna: libera o fim-de-dia (planner capa em 17:00 p/ defaultSchedule).
    const trainingToUse = opts.eveningEnd
      ? { ...training, defaultSchedule: false, horarioFim: opts.eveningEnd }
      : training;
    const res = planTurma(
      {
        training: trainingToUse, className, startDate: dateISO,
        startTime: opts.startTime || '08:00',
        base: 'Macaé', planningType: 'base',
        linkedClassNames: opts.linked || [],
        pinInstructorIds: opts.pin || [],
        avoidInstructorIds: opts.avoid || [],
        avoidInstructorOnDates: opts.avoidOnDates || {},
      },
      { instructors, absences, holidays, externalSchedules: accumulated },
    );
    accumulated.push(...res.rows);
    allRows.push(...res.rows);
    totalSlots += res.rows.length;
    totalGaps += res.gaps.length;

    const pinNames = (opts.pin || []).map(id => idToName.get(id) || `#${id}`).join(',');
    const spanStr = res.span.from === res.span.to ? fmtBR(res.span.from) : `${fmtBR(res.span.from)}->${fmtBR(res.span.to)}`;
    summary.push(`${res.gaps.length ? '!' : 'ok'} ${gcc.padEnd(10)} ${className.padEnd(22)} ${spanStr.padEnd(22)} ${String(res.rows.length).padStart(3)} slots ${String(res.instructorNames.length).padStart(2)}i ${res.gaps.length}lac  pin:${pinNames}`);

    report.push(`## ${className} — ${training.name} (${gcc})`);
    report.push(`Span: ${spanStr} · ${res.rows.length} slots · pin: ${pinNames || '—'} · Instrutores: ${res.instructorNames.join(', ') || '—'}`);
    report.push('');
    const byDate = new Map();
    for (const r of res.rows) { const a = byDate.get(r.date) ?? []; a.push(r); byDate.set(r.date, a); }
    for (const [date, rs] of [...byDate.entries()].sort()) {
      report.push(`### ${fmtBR(date)}`);
      for (const r of rs) {
        report.push(`- ${r.startTime}–${r.endTime} | ${r.module} | ${ROLE_PT[r.role] ?? r.role} | ${r.instructorName || '❌ SEM INSTRUTOR'} | ${r.local || '—'}`);
      }
    }
    if (res.gaps.length) {
      report.push(`\n**Lacunas (${res.gaps.length}):**`);
      for (const g of res.gaps) report.push(`- ${fmtBR(g.date)} ${g.startTime} | ${g.module} | ${ROLE_PT[g.role] ?? g.role} — ${g.reason}`);
    }
    if (res.warnings.length) { report.push(`\n**Avisos:** ${res.warnings.join(' / ')}`); }
    report.push('\n---\n');
  }

  // Carga por instrutor
  const loadByInstr = new Map();
  for (const r of allRows) { if (!r.instructorName) continue; loadByInstr.set(r.instructorName, (loadByInstr.get(r.instructorName) ?? 0) + 1); }
  const contractByName = new Map(instructors.map(i => [i.name, i.contract]));
  report.push(`# Carga por instrutor (slots no lote)`);
  for (const [name, n] of [...loadByInstr.entries()].sort((a, b) => b[1] - a[1])) {
    report.push(`- ${name} (${contractByName.get(name) ?? '?'}) — ${n} slots`);
  }

  // Conflitos de instrutor (dupla escala)
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const dblBookings = [];
  const byInstrDate = new Map();
  for (const r of allRows) {
    if (!r.instructorId) continue;
    const k = `${r.instructorId}|${r.date}`;
    if (!byInstrDate.has(k)) byInstrDate.set(k, []);
    byInstrDate.get(k).push(r);
  }
  for (const rs of byInstrDate.values()) {
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (!(toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime))) continue;
      const linked = (a.linkedClassNames || []).includes(b.className) || (b.linkedClassNames || []).includes(a.className);
      if (linked) continue;
      dblBookings.push(`${a.instructorName} | ${a.date} | ${a.startTime}-${a.endTime} "${a.className}" X ${b.startTime}-${b.endTime} "${b.className}"`);
    }
  }
  if (dblBookings.length) { report.push('\n# ⛔ CONFLITOS DE INSTRUTOR (dupla escala!)'); for (const c of dblBookings) report.push(`- ${c}`); }

  // Conflitos de sala
  const roomClashes = [];
  const byRoomDate = new Map();
  for (const r of allRows) {
    if (!r.local) continue;
    const k = `${r.local}|${r.date}`;
    if (!byRoomDate.has(k)) byRoomDate.set(k, []);
    byRoomDate.get(k).push(r);
  }
  for (const rs of byRoomDate.values()) {
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (!(toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime))) continue;
      if (a.classId === b.classId && a.moduleId === b.moduleId && a.startTime === b.startTime) continue;
      const linked = (a.linkedClassNames || []).includes(b.className) || (b.linkedClassNames || []).includes(a.className);
      if (linked) continue;
      roomClashes.push(`${a.local} | ${a.date} | ${a.startTime}-${a.endTime} "${a.className}" X ${b.startTime}-${b.endTime} "${b.className}"`);
    }
  }
  if (roomClashes.length) { report.push('\n# ⛔ CONFLITOS DE SALA (dupla ocupação!)'); for (const c of roomClashes) report.push(`- ${c}`); }

  writeFileSync(join(__dirname, '_batch_preview_2226.md'), report.join('\n'), 'utf8');

  console.log(summary.join('\n'));
  console.log('');
  console.log(`TOTAL: ${BATCH.length} turmas, ${totalSlots} slots, ${totalGaps} lacunas.`);
  console.log(`Conflitos de dupla escala de instrutor: ${dblBookings.length}${dblBookings.length ? ' (ver relatorio)' : ' OK'}`);
  console.log(`Conflitos de sala (dupla ocupacao): ${roomClashes.length}${roomClashes.length ? ' (ver relatorio)' : ' OK'}`);
  console.log(`Relatorio completo: agents/mcp/scripts/_batch_preview_2226.md`);

  if (COMMIT) {
    console.log('\n>>> GRAVANDO no Supabase...');
    const inserted = await insertSchedules(allRows);
    console.log(`>>> ${inserted?.length ?? allRows.length} rows inseridas.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
