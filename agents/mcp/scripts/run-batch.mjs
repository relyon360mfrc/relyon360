/**
 * run-batch.mjs — gera (preview) ou cria (--commit) o lote de turmas 15–19/06/2026
 * usando o MESMO planner puro da tool MCP (dist/planner.js).
 *
 * Preview (padrão):   node scripts/run-batch.mjs
 * Gravar de verdade:  node scripts/run-batch.mjs --commit
 *
 * Escreve relatório completo (UTF-8) em scripts/_batch_preview.md e imprime um
 * resumo compacto (ASCII) no stdout.
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

// ids úteis: APRÍGIO=2, WAGNER DA SILVA RAMOS=69
// Entrada: [gcc, className, dataISO, opts?]  opts = { linked:[], pin:[], avoid:[] }
// - linked: turmas vinculadas (compartilham instrutor/sala; conflito ignorado)
// - pin:    instrutores a reservar (topo da fila)
// - avoid:  instrutores a evitar (realocação — força substituto)
const BATCH = [
  ['MBSBLE301', 'CBSP 01 (PRÁTICAS)', '2026-06-15'],
  // libera JUAN(38)+GABRIEL(25) do CBSP no dia 19 (backfill CBINC/Prova com o pool farto) p/ atender a OIMCE
  ['OBS308',    'CBSP 01',            '2026-06-15', { avoidOnDates: { 25: ['2026-06-19'], 38: ['2026-06-19'] } }],
  ['OBS322',    'MCIA - ALPH 01',     '2026-06-15'],
  ['OBS327',    'NR 12 16 H 01',      '2026-06-15'],
  ['OER308',    'MEMIR 01',           '2026-06-15'],
  ['OFA316',    'ANDAIME 01',         '2026-06-15', { linked: ['ANDAIMES 16 H 01'] }],
  ['OFI3035',   'CACI 01',            '2026-06-15'],
  ['OSC317',    'GUINDASTE N II 01',  '2026-06-15'],
  ['OSE314',    'CESS 01',            '2026-06-15'],
  ['OSE315',    'CERR 01',            '2026-06-15'],
  ['OSP312',    'EC 8h 01',           '2026-06-15'],
  ['OTC344',    'ANDAIMES 16 H 01',   '2026-06-15', { linked: ['ANDAIME 01'], pin: [69] }], // roda dentro das 1as 16h do andaime 40H; WAGNER
  ['OBS308',    'CBSP 03',            '2026-06-16', { avoidOnDates: { 25: ['2026-06-19'], 38: ['2026-06-19'] } }], // não re-prender GABRIEL no dia 19
  ['OSC304',    'ALTURA 8h 01',       '2026-06-16'],
  ['OTC348',    'EMERG SALV 01',      '2026-06-16'],
  ['OSP331',    'ESTANQUEIDADE 01',   '2026-06-17'],                            // AVELINO (freelancer certificado; libera APRÍGIO p/ CACI/CESS/CBSP)
  ['OSE326',    'TICB 01',            '2026-06-17'],
  ['OSP312',    'EC 8h 02',           '2026-06-17'],
  ['MBSBLE301', 'CBSP 02 (PRÁTICAS)', '2026-06-18'],
  ['OSC304',    'ALTURA 8h 02',       '2026-06-18'],
  ['OSP302',    'EC16H 01',           '2026-06-18'],
  ['OER309',    'OIMCE 01',           '2026-06-19'],
  ['OSE326',    'TICB 02',            '2026-06-19'],
  ['OSP312',    'EC 8h 03',           '2026-06-19'],
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
  const existing = await fetchSchedulesInRange('2026-06-15', '2026-06-30');

  console.log(`Carregado: ${instructors.length} instrutores, ${absences.length} ausências, ${holidays.length} feriados, ${trainings.length} treinamentos.`);
  console.log(`Programação existente 15–30/06 no banco: ${existing.length} rows.`);
  console.log(`Modo: ${COMMIT ? 'COMMIT (vai gravar!)' : 'PREVIEW (não grava)'}`);
  console.log('');

  const accumulated = [...existing];   // alimenta conflito cross-turma
  const allRows = [];
  const report = [];
  const summary = [];
  let totalSlots = 0, totalGaps = 0;

  report.push(`# Lote de turmas 15–19/06/2026 — ${COMMIT ? 'GRAVADO' : 'PREVIEW'}`);
  report.push(`Gerado em ${new Date().toISOString()}`);
  report.push('');

  for (const [gcc, className, dateISO, opts = {}] of BATCH) {
    const training = trainings.find(t => (t.gcc || '').toLowerCase() === gcc.toLowerCase());
    if (!training) {
      summary.push(`X  ${gcc.padEnd(10)} ${className.padEnd(20)} — TREINAMENTO NAO ENCONTRADO`);
      report.push(`## ❌ ${className} (${gcc}) — treinamento não encontrado\n`);
      continue;
    }
    const res = planTurma(
      {
        training, className, startDate: dateISO, base: 'Macaé', planningType: 'base',
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

    const spanStr = res.span.from === res.span.to ? fmtBR(res.span.from) : `${fmtBR(res.span.from)}->${fmtBR(res.span.to)}`;
    summary.push(`${res.gaps.length ? '!' : 'ok'} ${gcc.padEnd(10)} ${className.padEnd(20)} ${spanStr.padEnd(22)} ${String(res.rows.length).padStart(3)} slots  ${String(res.instructorNames.length).padStart(2)} instr  ${res.gaps.length} lacuna(s)`);

    // Detalhe no relatório
    report.push(`## ${className} — ${training.name} (${gcc})`);
    report.push(`Span: ${spanStr} · ${res.rows.length} slots · Instrutores: ${res.instructorNames.join(', ') || '—'}`);
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

  // Carga por instrutor (para checar distribuição e prioridade de contrato)
  const loadByInstr = new Map();
  for (const r of allRows) {
    if (!r.instructorName) continue;
    loadByInstr.set(r.instructorName, (loadByInstr.get(r.instructorName) ?? 0) + 1);
  }
  const contractByName = new Map(instructors.map(i => [i.name, i.contract]));
  report.push(`# Carga por instrutor (slots no lote)`);
  for (const [name, n] of [...loadByInstr.entries()].sort((a, b) => b[1] - a[1])) {
    report.push(`- ${name} (${contractByName.get(name) ?? '?'}) — ${n} slots`);
  }

  // ── VERIFICAÇÃO: nenhum instrutor escalado em dois lugares ao mesmo tempo ──────
  // (turmas vinculadas compartilham instrutor de propósito → não contam como conflito)
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
  if (dblBookings.length) {
    report.push('\n# ⛔ CONFLITOS DE INSTRUTOR (dupla escala!)');
    for (const c of dblBookings) report.push(`- ${c}`);
  }

  // ── VERIFICAÇÃO: nenhuma sala usada por duas turmas ao mesmo tempo ─────────────
  // (multi-instrutor no mesmo módulo compartilha a sala de propósito; turmas vinculadas também)
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
      if (a.classId === b.classId && a.moduleId === b.moduleId && a.startTime === b.startTime) continue; // mesma sessão multi-instr
      const linked = (a.linkedClassNames || []).includes(b.className) || (b.linkedClassNames || []).includes(a.className);
      if (linked) continue;
      roomClashes.push(`${a.local} | ${a.date} | ${a.startTime}-${a.endTime} "${a.className}" X ${b.startTime}-${b.endTime} "${b.className}"`);
    }
  }
  if (roomClashes.length) {
    report.push('\n# ⛔ CONFLITOS DE SALA (dupla ocupação!)');
    for (const c of roomClashes) report.push(`- ${c}`);
  }

  writeFileSync(join(__dirname, '_batch_preview.md'), report.join('\n'), 'utf8');

  console.log(summary.join('\n'));
  console.log('');
  console.log(`TOTAL: ${BATCH.length} turmas, ${totalSlots} slots, ${totalGaps} lacunas.`);
  console.log(`Conflitos de dupla escala de instrutor: ${dblBookings.length}${dblBookings.length ? ' ⛔ (ver relatório)' : ' ✅'}`);
  console.log(`Conflitos de sala (dupla ocupação): ${roomClashes.length}${roomClashes.length ? ' ⛔ (ver relatório)' : ' ✅'}`);
  console.log(`Relatório completo: agents/mcp/scripts/_batch_preview.md`);

  // Contagem de contratos usados
  const usedContracts = {};
  for (const r of allRows) {
    if (!r.instructorName) continue;
    const c = contractByName.get(r.instructorName) ?? '?';
    usedContracts[c] = (usedContracts[c] ?? 0) + 1;
  }
  console.log('Slots por contrato: ' + JSON.stringify(usedContracts));

  if (COMMIT) {
    console.log('\nGravando...');
    const n = await insertSchedules(allRows);
    console.log(`GRAVADO: ${n} rows inseridas em relyon_schedules.`);
  } else {
    console.log('\n(PREVIEW — nada gravado. Rode com --commit para efetivar.)');
  }
}

main().catch(err => { console.error('ERRO:', err); process.exit(1); });
