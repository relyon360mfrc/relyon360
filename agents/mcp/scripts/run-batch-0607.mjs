/**
 * run-batch-0607.mjs — gera (preview) ou cria (--commit) o lote de turmas
 * 06/07–10/07/2026 (programação periódica 06072026.xlsx) usando o MESMO planner
 * puro da tool MCP (dist/planner.js).
 *
 * Preview (padrão):   node scripts/run-batch-0607.mjs
 * Gravar de verdade:  node scripts/run-batch-0607.mjs --commit
 *
 * Formato da planilha (diferente dos lotes anteriores): colunas Training, data de
 * início, MODO DE CRIAÇÃO, horário de início, nome da turma, quantidade de alunos,
 * SALA, INSTRUTOR, TRADUTOR — uma única col. INSTRUTOR (não Teoria/Lead/Equipe
 * separados). pin = o(s) nome(s) da col. INSTRUTOR; SALA/TRADUTOR viram ANOTAÇÃO
 * no relatório (não vão pro planner), mesma disciplina dos lotes anteriores.
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

// OBS308 "MODO 2" (planilha) = override de moduleOrder cadastrado como label "Modo 2"
// no training (id 1779497277242). "MODO 1" da planilha = ordem padrão (fallback, sem
// override) — mesmo padrão observado no OBS322 (lote 2906).
const OBS308_MODO2_ORDER = [105, 106, 107, 101, 104, 103, 102, 108, 109];

// Cada turma: { gcc, name, date, time?, pin?[ids], students?, room?, trad?, offshoreOk?, obs? }
const BATCH = [
  // ── 06/07 (segunda) ──────────────────────────────────────────────────────
  { gcc:'MBSBLE301', name:'CBSP 01 (PRÁTICAS)', date:'2026-07-06', pin:[43], students:12, room:'5',
    trad:'DANIEL MARTINS(76)' },
  { gcc:'OBS308',    name:'CBSP 01',            date:'2026-07-06', pin:[75], students:30, room:'11',
    trad:'VINÍCIUS SANTHIAGO(86)', obs:'MODO 1 (planilha) = ordem padrão, sem override.' },
  { gcc:'OBS308',    name:'CBSP 02',            date:'2026-07-06', pin:[49], students:20, room:null,
    modo2:true, obs:'MODO 2 (planilha) — moduleOrder forçado via module.priority.' },
  { gcc:'OBS322',    name:'MCIA - ALPH 01',     date:'2026-07-06', pin:[32], students:29, room:'21',
    trad:'LOHANA(78) segunda-feira; MAX LOPES(92) demais dias', obs:'MODO 1 (planilha) = ordem padrão, sem override.' },
  { gcc:'OER308',    name:'MEMIR 01',           date:'2026-07-06', pin:[11,63], students:5, room:'MOME',
    avoidOnDates: { 11:['2026-07-07','2026-07-08','2026-07-09'], 63:['2026-07-07','2026-07-08','2026-07-09'] },
    obs:'Confirmado c/ o usuário: CHARLIE(11)+RÔMULO(63) só na segunda 06/07; terça a quinta a dupla vira LOHANA(78)+DANIEL MARTINS(76) — via avoidInstructorOnDates.' },
  { gcc:'OFI3035',   name:'CACI 01',            date:'2026-07-06', pin:[17], students:12, room:'16' },
  { gcc:'OSC302',    name:'EMPILHADEIRA 16 H 01', date:'2026-07-06', pin:[1], students:2, room:'SALA DE IÇAMENTO', forceLocal:'SALA DE IÇAMENTO' },
  { gcc:'OSC304',    name:'ALTURA 8h 01',       date:'2026-07-06', pin:[40], students:9, room:'18',
    trad:'LEONARDO TERRA(41)' },
  { gcc:'OSC317',    name:'GUINDASTE N II 01',  date:'2026-07-06', pin:[47], students:4, room:'17' },
  { gcc:'OSE314',    name:'CESS 01',            date:'2026-07-06', pin:[55], students:12, room:null },
  { gcc:'OSE315',    name:'CERR 01',            date:'2026-07-06', pin:[55], students:11, room:'14',
    obs:'PAULO ALBUQUERQUE(55) tem a competência de CERR (confirmado), mas está pinado na CESS 01 no mesmo dia/horário — o planner evita dupla escala (via externalSchedules) e realoca sozinho para outro qualificado.' },
  { gcc:'OSE325',    name:'CA EBS 01',          date:'2026-07-06', pin:[12], students:11, room:'10' },
  { gcc:'OSP302',    name:'EC 16H 01',          date:'2026-07-06', pin:[26], offshoreOk:true, students:4, room:'19',
    obs:'GIOVANI ATAÍDE = GEOVANI DE ATAÍDE SOUSA(26), CLT Offshore — FORÇADO (excludeContracts:[]+pin) a pedido da planilha.' },
  { gcc:'OSP303',    name:'EC 40H 01',          date:'2026-07-06', pin:[73], students:6, room:'13' },
  { gcc:'OSP331',    name:'ESTANQUEIDADE 01',   date:'2026-07-06', pin:[72], offshoreOk:true, students:2, room:'24',
    obs:'WAGNER GOMES = WAGNER RIBEIRO GOMES(72), CLT Offshore — FORÇADO a pedido da planilha.' },
  { gcc:'OTC348',    name:'EMER E SALV 01',     date:'2026-07-06', pin:[69], students:8, room:'10' },
  // ── 07/07 (terça) ─────────────────────────────────────────────────────────
  { gcc:'OSC322',    name:'AVALIADOR',          date:'2026-07-07', pin:[52], offshoreOk:true, students:1, room:'SALA REUNIÃO ADM',
    obs:'MAX ESTEVES(52), CLT Offshore — FORÇADO a pedido da planilha.' },
  { gcc:'OSP312',    name:'EC 8h 01',           date:'2026-07-07', pin:[41], students:16, room:'18',
    trad:'ALINE OLIVEIRA CAMELIER(91)' },
  // ── 08/07 (quarta) ────────────────────────────────────────────────────────
  { gcc:'OSC304',    name:'ALTURA 08H 02',      date:'2026-07-08', students:15, room:'18',
    obs:'Sem instrutor na planilha (pool decide).' },
  { gcc:'OSE326',    name:'TICB 01',            date:'2026-07-08', students:15, room:'14',
    trad:'ALINE OLIVEIRA CAMELIER(91)', obs:'Sem instrutor principal na planilha (pool decide).' },
  // ── 09/07 (quinta) ────────────────────────────────────────────────────────
  { gcc:'MBSBLE301', name:'CBSP 02 (PRÁTICAS)', date:'2026-07-09', pin:[43], students:13, room:'5',
    trad:'VINÍCIUS SANTHIAGO(86)' },
  { gcc:'OBS327',    name:'NR 12 16 H 01',      date:'2026-07-09', pin:[72], offshoreOk:true, students:10, room:'22',
    obs:'WAGNER GOMES(72), CLT Offshore — FORÇADO a pedido da planilha.' },
  { gcc:'OSE325',    name:'CA EBS 02  (NOTURNO)', date:'2026-07-09', time:'17:00', pin:[32], students:8, room:'13',
    obs:'Training já tem defaultSchedule:false + horarioFim 21:00 cadastrado — não precisa clonar p/ o truque noturno.' },
  { gcc:'OSP312',    name:'EC 8h 02',           date:'2026-07-09', pin:[41], students:20, room:'18' },
  // ── 10/07 (sexta) ─────────────────────────────────────────────────────────
  { gcc:'OSC304',    name:'ALTURA 8h 03',       date:'2026-07-10', pin:[41], students:6, room:'18' },
  { gcc:'OSE326',    name:'TICB 02',            date:'2026-07-10', pin:[43], students:15, room:'14',
    trad:'DANIEL MARTINS(76)' },
];

const fmtBR = (d) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };

function applyModo2(training) {
  const modules = training.modules.map((m) => {
    const idx = OBS308_MODO2_ORDER.indexOf(m.id);
    return idx === -1 ? m : { ...m, priority: idx + 1 };
  });
  return { ...training, modules };
}

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
  const existing = await fetchSchedulesInRange('2026-07-06', '2026-07-13');

  console.log(`Carregado: ${instructors.length} instrutores, ${absences.length} ausencias, ${holidays.length} feriados, ${trainings.length} treinamentos.`);
  console.log(`Programacao existente 06/07-13/07 no banco: ${existing.length} rows.`);
  console.log(`Modo: ${COMMIT ? 'COMMIT (vai gravar!)' : 'PREVIEW (nao grava)'}`);
  console.log('');

  const accumulated = [...existing];
  const allRows = [];
  const report = [];
  const summary = [];
  let totalSlots = 0, totalGaps = 0;

  report.push(`# Lote de turmas 06/07-10/07/2026 — ${COMMIT ? 'GRAVADO' : 'PREVIEW'}`);
  report.push(`Gerado em ${new Date().toISOString()}`);
  report.push('');

  const idToName = new Map(instructors.map(i => [i.id, i.name]));

  for (const t of BATCH) {
    const { gcc, name: className, date: dateISO } = t;
    let training = trainings.find(x => (x.gcc || '').toLowerCase() === gcc.toLowerCase());
    if (!training) {
      summary.push(`X  ${gcc.padEnd(10)} ${className.padEnd(24)} — TREINAMENTO NAO ENCONTRADO`);
      report.push(`## ❌ ${className} (${gcc}) — treinamento não encontrado\n`);
      continue;
    }
    if (t.modo2) training = applyModo2(training);

    const res = planTurma(
      {
        training, className, startDate: dateISO,
        startTime: t.time || '08:00',
        studentCount: t.students != null ? String(t.students) : undefined,
        base: 'Macaé', planningType: 'base',
        pinInstructorIds: t.pin || [],
        avoidInstructorIds: t.avoid || [],
        ...(t.avoidOnDates ? { avoidInstructorOnDates: t.avoidOnDates } : {}),
        ...(t.offshoreOk ? { excludeContracts: [] } : {}),
      },
      { instructors, absences, holidays, externalSchedules: accumulated },
    );
    if (t.forceLocal) {
      for (const r of res.rows) { if (r.local && r.local.toUpperCase().includes('SALA 17')) r.local = t.forceLocal; }
    }
    accumulated.push(...res.rows);
    allRows.push(...res.rows);
    totalSlots += res.rows.length;
    totalGaps += res.gaps.length;

    const pinNames = (t.pin || []).map(id => idToName.get(id) || `#${id}`).join(',');
    const spanStr = res.span.from === res.span.to ? fmtBR(res.span.from) : `${fmtBR(res.span.from)}->${fmtBR(res.span.to)}`;
    summary.push(`${res.gaps.length ? '!' : 'ok'} ${gcc.padEnd(10)} ${className.padEnd(24)} ${spanStr.padEnd(22)} ${String(res.rows.length).padStart(3)} slots ${String(res.instructorNames.length).padStart(2)}i ${res.gaps.length}lac  pin:${pinNames || '—'}`);

    report.push(`## ${className} — ${training.name} (${gcc})`);
    report.push(`Span: ${spanStr} · ${res.rows.length} slots · ${t.students != null ? t.students + ' alunos · ' : ''}pin: ${pinNames || '—'} · Instrutores (planner): ${res.instructorNames.join(', ') || '—'}`);
    const sheet = [];
    if (t.room) sheet.push(`Sala: ${t.room}`);
    if (t.trad) sheet.push(`Tradutor: ${t.trad}`);
    if (t.obs)  sheet.push(`OBS: ${t.obs}`);
    if (sheet.length) report.push(`📋 Planilha (resolver no app): ${sheet.join(' · ')}`);
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

  writeFileSync(join(__dirname, '_batch_preview_0607.md'), report.join('\n'), 'utf8');

  console.log(summary.join('\n'));
  console.log('');
  console.log(`TOTAL: ${BATCH.length} turmas, ${totalSlots} slots, ${totalGaps} lacunas.`);
  console.log(`Conflitos de dupla escala de instrutor: ${dblBookings.length}${dblBookings.length ? ' (ver relatorio)' : ' OK'}`);
  console.log(`Conflitos de sala (dupla ocupacao): ${roomClashes.length}${roomClashes.length ? ' (ver relatorio)' : ' OK'}`);
  console.log(`Relatorio completo: agents/mcp/scripts/_batch_preview_0607.md`);

  if (COMMIT) {
    console.log('\n>>> GRAVANDO no Supabase...');
    const inserted = await insertSchedules(allRows);
    console.log(`>>> ${inserted?.length ?? allRows.length} rows inseridas.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
