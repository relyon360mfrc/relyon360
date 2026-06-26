/**
 * run-batch-2906.mjs — gera (preview) ou cria (--commit) o lote de turmas
 * 29/06–03/07/2026 (programação periódica 29062026.xlsx) usando o MESMO planner
 * puro da tool MCP (dist/planner.js).
 *
 * Preview (padrão):   node scripts/run-batch-2906.mjs
 * Gravar de verdade:  node scripts/run-batch-2906.mjs --commit
 *
 * v1: pin = instrutor PRIMÁRIO da planilha (col. Teoria; fallback Lead). Equipe,
 * tradutor, sala e OBS condicionais vêm como ANOTAÇÃO no relatório (resolver no app),
 * NÃO são alimentados no planner — mesma disciplina do lote 2226.
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

// Cada turma: { gcc, name, date, time?, pin?[ids], students?, room?, team?, trad?, obs? }
//   pin   = preferência de instrutor da planilha (col. Teoria; fallback Lead).
//   room/team/trad/obs = anotação da planilha p/ completar no app (não vai pro planner).
// Ordem = ordem da planilha (auditável 1:1). Datas: 29/06 seg → 03/07 sex.
const BATCH = [
  // ── 29/06 (segunda) ───────────────────────────────────────────────────────
  { gcc:'LSP351',    name:'NR 10 40H 01',        date:'2026-06-29', pin:[84], offshoreOk:true, students:4, room:'23',
    obs:'ALOYSIO (84) é CLT Offshore — FORÇADO neste lote a pedido (excludeContracts:[] + pin). Seg: GLAUCO teoria CBINC + THADEU assistente; tarde RENILDA primeiros socorros.' },
  { gcc:'MBSBLE301', name:'CBSP 01 (PRÁTICAS)',  date:'2026-06-29', pin:[71], students:10, room:'5',
    team:'LUIZ CARLOS BANDEIRA(46), BISMARCK QUEIROZ(7)[piscina] / CBINC: PEDRO SOUZA(56), GLAUCO(27), LUIS ANTÔNIO MARIGO(45)', trad:'DANIEL QUEIROZ [não cadastrado]' },
  { gcc:'OBS308',    name:'CBSP 01',             date:'2026-06-29', pin:[75], students:24, room:'11' },
  { gcc:'OBS322',    name:'MCIA - ALPH 01',      date:'2026-06-29', pin:[9], avoid:[49], students:27, room:'20', trad:'MARCO ANTÔNIO [83 ou 96?]' },
  { gcc:'OBS322',    name:'MCIA - ALPH 02',      date:'2026-06-29', pin:[9], avoid:[49], students:16, room:'20',
    obs:'CARIVALDO(9) também na ALPH 01 mesmo dia — checar dupla escala. MARCOS PINTO(49) mantido FORA da ALPH (avoid) p/ liberar a CACI quarta à tarde.' },
  { gcc:'OBS327',    name:'NR 12 16 H 01',       date:'2026-06-29', pin:[17], students:2,  room:'22',
    trad:'LEONARDO PAIXÃO(40)', obs:'Na TERÇA trocar tradutor LEO PAIXÃO por LEONARDO COUTINHO(95).' },
  { gcc:'OFI3035',   name:'CACI 01',             date:'2026-06-29', pin:[49],            room:'16' },
  { gcc:'OSC302',    name:'EMPILHADEIRA 16 H 01',date:'2026-06-29', pin:[36], students:14, room:'17', team:'ALEX COSTA(1)' },
  { gcc:'OSE314',    name:'CESS 01',             date:'2026-06-29', pin:[10], students:13, room:'15' },
  { gcc:'OSE315',    name:'CERR 01',             date:'2026-06-29', pin:[55], students:6,  room:'14' },
  { gcc:'OSE319',    name:'T-HUET 01',           date:'2026-06-29', pin:[50],            room:'3',
    obs:'MARCUS é crane operator do OSE328 (THUET+CAEBS 01) também.' },
  { gcc:'OSE319',    name:'T-HUET 02',           date:'2026-06-29', pin:[43],            room:'4', team:'agente escolhe' },
  { gcc:'OSE319',    name:'T-HUET 03',           date:'2026-06-29', time:'10:00', pin:[20], room:'5', team:'agente escolhe' },
  { gcc:'OSE325',    name:'CA EBS 01',           date:'2026-06-29', pin:[12], students:16, room:'10',
    obs:'CLOVIS é crane operator do T-HUET 03 também.' },
  { gcc:'OSE328',    name:'THUET + CAEBS 01',    date:'2026-06-29', pin:[2],             room:'2' },
  { gcc:'OSP312',    name:'EC 8h 01',            date:'2026-06-29', pin:[69], students:16, room:'18', team:'BISMARCK QUEIROZ(7)', trad:'LOHANA(78)' },
  { gcc:'OTC348',    name:'EMER E SALV 01',      date:'2026-06-29', pin:[60], students:3,  room:'19', team:'lead WAGNER RAMOS(69); EVERTON RIBEIRO(20)' },
  // ── 30/06 (terça) ─────────────────────────────────────────────────────────
  { gcc:'OBS308',    name:'CBSP 02',             date:'2026-06-30', pin:[75],            room:'12',
    obs:'Modo 1 de seleção: prática CBINC sexta à tarde + sábado SPR de manhã. WILSON(75) também na CBSP 01 (multi-dia) — checar dupla escala.' },
  { gcc:'OSC304',    name:'ALTURA 8h 01',        date:'2026-06-30', pin:[40],            room:'18' },
  { gcc:'OSE319',    name:'T-HUET 04',           date:'2026-06-30',                      room:'2', obs:'Sem instrutor na planilha.' },
  { gcc:'OSE319',    name:'T-HUET 05',           date:'2026-06-30',                      room:'3', obs:'Sem instrutor na planilha.' },
  { gcc:'OSE319',    name:'T-HUET 06',           date:'2026-06-30', time:'10:00',        room:'4', obs:'Sem instrutor na planilha.' },
  { gcc:'OSE319',    name:'T-HUET 07 (NOTURNO)', date:'2026-06-30', time:'17:00', eveningNextDay:true, room:'2',
    obs:'NOTURNO. Teoria 30/06 à noite + prática 01/07 também à noite (17:00, deslocada da manhã). Sem instrutor na planilha (pool).' },
  { gcc:'OTC350',    name:'EMERG E SALV COORD',  date:'2026-06-30', pin:[69],            room:'19' },
  // ── 01/07 (quarta) ────────────────────────────────────────────────────────
  { gcc:'OSE319',    name:'T-HUET 08',           date:'2026-07-01',                      room:'3', obs:'Sem instrutor na planilha.' },
  { gcc:'OSE319',    name:'T-HUET 09',           date:'2026-07-01',                      room:'4', obs:'Sem instrutor na planilha.' },
  { gcc:'OSE319',    name:'T-HUET 10',           date:'2026-07-01', time:'10:00',        room:'5', obs:'Sem instrutor na planilha.' },
  { gcc:'OSE326',    name:'TICB 01',             date:'2026-07-01', pin:[10],            room:'10' },
  { gcc:'OSE328',    name:'THUET + CAEBS 02',    date:'2026-07-01',                      room:'SALA 02', obs:'AGENTE ESCOLHE (sem pin).' },
  { gcc:'OSP312',    name:'EC 8h 02',            date:'2026-07-01', pin:[95],            room:'sala 18' },
  { gcc:'OSP331',    name:'ESTANQUEIDADE 01',    date:'2026-07-01', pin:[6],             room:'SALA 24' },
  { gcc:'OTC348',    name:'EMER E SALV 02',      date:'2026-07-01', pin:[40],            room:'SALA 19',
    obs:'⚠️ RENOMEADO de "EMER E SALV 01" (colidia com a turma de seg 29/06; a app vincula por nome).' },
  // ── 02/07 (quinta) ────────────────────────────────────────────────────────
  { gcc:'MBSBLE301', name:'CBSP 02 (PRÁTICAS)',  date:'2026-07-02', pin:[71],            room:'SALA 05' },
  { gcc:'OER309',    name:'OIMCE 01',            date:'2026-07-02', pin:[11],            room:'MOME' },
  { gcc:'OSC304',    name:'ALTURA 8h 02',        date:'2026-07-02', pin:[95],            room:'SALA 18' },
  // ── 03/07 (sexta) ─────────────────────────────────────────────────────────
  { gcc:'OSE326',    name:'TICB 02',             date:'2026-07-03', pin:[43],            room:'SALA 15' },
  { gcc:'OSP312',    name:'EC 8h 03',            date:'2026-07-03', pin:[95],            room:'SALA 18' },
];

const fmtBR = (d) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };

// Desloca as rows de dias POSTERIORES ao 1º para a noite (1ª row do dia N começa em
// eveningStart). Usado p/ turma noturna multi-dia (T-HUET 07): teoria noite 1 + prática
// noite 2 às 17:00 em vez de manhã. Aplica ANTES de acumular (downstream vê os horários certos).
function shiftLaterDaysToEvening(rows, startDate, eveningStart, dayEndStr, warnings) {
  const M = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const T = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const later = rows.filter(r => r.date > startDate);
  if (!later.length) return;
  const delta = M(eveningStart) - Math.min(...later.map(r => M(r.startTime)));
  if (delta === 0) return;
  const endCap = M(dayEndStr);
  for (const r of later) {
    const ns = M(r.startTime) + delta, ne = M(r.endTime) + delta;
    if (ne > endCap) warnings.push(`⚠️ noturno: ${r.module} ${T(ns)}-${T(ne)} passa de ${dayEndStr}.`);
    r.startTime = T(ns); r.endTime = T(ne);
  }
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
  const existing = await fetchSchedulesInRange('2026-06-29', '2026-07-06');

  console.log(`Carregado: ${instructors.length} instrutores, ${absences.length} ausencias, ${holidays.length} feriados, ${trainings.length} treinamentos.`);
  console.log(`Programacao existente 29/06-06/07 no banco: ${existing.length} rows.`);
  console.log(`Modo: ${COMMIT ? 'COMMIT (vai gravar!)' : 'PREVIEW (nao grava)'}`);
  console.log('');

  const accumulated = [...existing];
  const allRows = [];
  const report = [];
  const summary = [];
  let totalSlots = 0, totalGaps = 0;

  report.push(`# Lote de turmas 29/06-03/07/2026 — ${COMMIT ? 'GRAVADO' : 'PREVIEW'}`);
  report.push(`Gerado em ${new Date().toISOString()}`);
  report.push('');

  const idToName = new Map(instructors.map(i => [i.id, i.name]));

  for (const t of BATCH) {
    const { gcc, name: className, date: dateISO } = t;
    const training = trainings.find(x => (x.gcc || '').toLowerCase() === gcc.toLowerCase());
    if (!training) {
      summary.push(`X  ${gcc.padEnd(10)} ${className.padEnd(24)} — TREINAMENTO NAO ENCONTRADO`);
      report.push(`## ❌ ${className} (${gcc}) — treinamento não encontrado\n`);
      continue;
    }
    const res = planTurma(
      {
        training, className, startDate: dateISO,
        startTime: t.time || '08:00',
        studentCount: t.students != null ? String(t.students) : undefined,
        base: 'Macaé', planningType: 'base',
        pinInstructorIds: t.pin || [],
        avoidInstructorIds: t.avoid || [],
        ...(t.offshoreOk ? { excludeContracts: [] } : {}),
      },
      { instructors, absences, holidays, externalSchedules: accumulated },
    );
    if (t.eveningNextDay) shiftLaterDaysToEvening(res.rows, dateISO, t.time || '17:00', training.horarioFim || '21:00', res.warnings);
    accumulated.push(...res.rows);
    allRows.push(...res.rows);
    totalSlots += res.rows.length;
    totalGaps += res.gaps.length;

    const pinNames = (t.pin || []).map(id => idToName.get(id) || `#${id}`).join(',');
    const spanStr = res.span.from === res.span.to ? fmtBR(res.span.from) : `${fmtBR(res.span.from)}->${fmtBR(res.span.to)}`;
    summary.push(`${res.gaps.length ? '!' : 'ok'} ${gcc.padEnd(10)} ${className.padEnd(24)} ${spanStr.padEnd(22)} ${String(res.rows.length).padStart(3)} slots ${String(res.instructorNames.length).padStart(2)}i ${res.gaps.length}lac  pin:${pinNames || '—'}`);

    report.push(`## ${className} — ${training.name} (${gcc})`);
    report.push(`Span: ${spanStr} · ${res.rows.length} slots · ${t.students != null ? t.students + ' alunos · ' : ''}pin: ${pinNames || '—'} · Instrutores (planner): ${res.instructorNames.join(', ') || '—'}`);
    // Anotações da planilha (resolver no app)
    const sheet = [];
    if (t.room) sheet.push(`Sala: ${t.room}`);
    if (t.team) sheet.push(`Equipe: ${t.team}`);
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

  writeFileSync(join(__dirname, '_batch_preview_2906.md'), report.join('\n'), 'utf8');

  console.log(summary.join('\n'));
  console.log('');
  console.log(`TOTAL: ${BATCH.length} turmas, ${totalSlots} slots, ${totalGaps} lacunas.`);
  console.log(`Conflitos de dupla escala de instrutor: ${dblBookings.length}${dblBookings.length ? ' (ver relatorio)' : ' OK'}`);
  console.log(`Conflitos de sala (dupla ocupacao): ${roomClashes.length}${roomClashes.length ? ' (ver relatorio)' : ' OK'}`);
  console.log(`Relatorio completo: agents/mcp/scripts/_batch_preview_2906.md`);

  if (COMMIT) {
    console.log('\n>>> GRAVANDO no Supabase...');
    const inserted = await insertSchedules(allRows);
    console.log(`>>> ${inserted?.length ?? allRows.length} rows inseridas.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
