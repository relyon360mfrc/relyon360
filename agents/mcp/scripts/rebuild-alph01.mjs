/**
 * rebuild-alph01.mjs — reconstrói SÓ a turma "MCIA - ALPH 01" (OBS322) com a
 * sequência do MODO 1 (primeiros socorros mais pro fim), instrutor João Moura #32
 * e tradutor Marco Antônio Fortini #83. Re-planeja contra o resto da semana já
 * gravado (não toca nas outras turmas) e espalha a sala se colidir.
 *
 * Modo 1 é forçado setando module.priority = índice no moduleOrder do modo → o
 * sortModules do planner reproduz a ordem (regulares por priority; prova/reserva no fim).
 *
 * Preview:  node scripts/rebuild-alph01.mjs
 * Gravar:   node scripts/rebuild-alph01.mjs --commit   (DELETA a ALPH 01 atual e re-insere)
 */
import {
  fetchSchedulesInRange, insertSchedules, fetchInstructors, fetchAbsences,
  fetchHolidays, fetchTrainings, getClient,
} from '../dist/services/supabase.js';
import { planTurma } from '../dist/planner.js';

const COMMIT = process.argv.includes('--commit');
const FROM = '2026-06-29', TO = '2026-07-06';
const CLASS = 'MCIA - ALPH 01';

const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const ovl = (s1, e1, s2, e2) => s1 < e2 && s2 < e1;
const familyOf = (n) => !n ? null : /PISCINA/i.test(n) ? 'POOL' : /^CBINC/i.test(n) ? 'CBINC' : /^SALA\s+\d/i.test(n) ? 'SALA' : null;

async function main() {
  const sb = getClient();
  const [all, instructors, absences, holidays, trainings, localsRes] = await Promise.all([
    fetchSchedulesInRange(FROM, TO), fetchInstructors(), fetchAbsences(),
    fetchHolidays(), fetchTrainings(),
    sb.from('app_state').select('value').eq('key', 'relyon_locals').single(),
  ]);
  const allLocals = (localsRes.data?.value || []).map(l => l.name);
  const idToName = new Map(instructors.map(i => [i.id, i.name]));
  const others = all.filter(r => r.className !== CLASS);
  const oldAlph = all.filter(r => r.className === CLASS);
  // João Moura #32 vai liderar a ALPH 01 → libera ele no planejamento (mantém os
  // outros instrutores das turmas alheias). Os slots dele que colidirem viram lacunas.
  const JM = 32;
  const othersForPlan = others.map(r => (+r.instructorId === JM ? { ...r, instructorId: null, instructorName: '' } : r));

  const training = trainings.find(t => (t.gcc || '').toUpperCase() === 'OBS322');
  const modo = (training.modes || [])[0];
  const order = (modo?.moduleOrder || []).map(String);
  console.log(`OBS322 modo "${modo?.id}" com ${order.length} módulos. ALPH 01 atual: ${oldAlph.length} rows (será deletada). Resto da semana: ${others.length} rows.`);

  // Força MODO 1 via priority = posição no moduleOrder.
  const trainingModo1 = {
    ...training,
    modules: (training.modules || []).map(m => {
      const idx = order.indexOf(String(m.id));
      return { ...m, priority: idx >= 0 ? idx + 1 : 99 };
    }),
  };

  const res = planTurma(
    {
      training: trainingModo1, className: CLASS, startDate: '2026-06-29', startTime: '08:00',
      studentCount: '27', base: 'Macaé', planningType: 'base',
      withTranslator: true, pinInstructorIds: [32, 83],
    },
    { instructors, absences, holidays, externalSchedules: othersForPlan },
  );

  // Espalha salas das novas rows contra a ocupação do resto da semana.
  const occ = new Map();
  for (const r of others) { if (!r.local) continue; const k = `${r.date}|${r.local}`; (occ.get(k) || occ.set(k, []).get(k)).push([toMin(r.startTime), toMin(r.endTime)]); }
  const free = (d, l, s, e) => !(occ.get(`${d}|${l}`) || []).some(([os, oe]) => ovl(s, e, os, oe));
  const mark = (d, l, s, e) => { const k = `${d}|${l}`; (occ.get(k) || occ.set(k, []).get(k)).push([s, e]); };
  const groups = new Map();
  for (const r of res.rows) { const k = `${r.moduleId}|${r.date}|${r.startTime}`; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  for (const [, rs] of groups) {
    const r0 = rs[0]; const s = toMin(r0.startTime), e = toMin(r0.endTime); const fam = familyOf(r0.local);
    let pick = r0.local;
    if (fam && !free(r0.date, r0.local, s, e)) {
      pick = [r0.local, ...allLocals.filter(n => familyOf(n) === fam && n !== r0.local)].find(c => free(r0.date, c, s, e)) || r0.local;
    }
    mark(r0.date, pick, s, e);
    for (const r of rs) r.local = pick;
  }

  // Relatório
  const fmtBR = (d) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}`; };
  console.log(`\n== ALPH 01 NOVA (Modo 1) — ${res.rows.length} slots · pin: ${[32, 83].map(i => idToName.get(i)).join(', ')}`);
  const byDate = new Map();
  for (const r of res.rows) (byDate.get(r.date) || byDate.set(r.date, []).get(r.date)).push(r);
  for (const [d, rs] of [...byDate.entries()].sort()) {
    console.log(` ${fmtBR(d)}:`);
    for (const r of rs) console.log(`   ${r.startTime}-${r.endTime} | ${r.module} | ${r.role} | ${r.instructorName || '❌'} | ${r.local}`);
  }
  if (res.gaps.length) { console.log(`\n LACUNAS (${res.gaps.length}):`); for (const g of res.gaps) console.log(`   ${fmtBR(g.date)} ${g.startTime} ${g.module} ${g.role} — ${g.reason}`); }

  // Conflitos das novas rows contra o resto (instrutor + sala)
  let cI = 0, cL = 0;
  for (const r of res.rows) {
    if (!r.instructorId) continue;
    for (const o of others) {
      if (o.date !== r.date) continue;
      if (!ovl(toMin(r.startTime), toMin(r.endTime), toMin(o.startTime), toMin(o.endTime))) continue;
      if (o.instructorId && +o.instructorId === +r.instructorId) { cI++; console.log(`   ⛔ instrutor ${r.instructorName} ${r.date} ${r.startTime} x "${o.className}"`); }
      if (o.local && r.local && o.local === r.local) cL++;
    }
  }
  console.log(`\n Conflitos vs resto: instrutor=${cI}, sala=${cL}`);

  // Slots do João Moura (em outras turmas) que colidem com a nova ALPH 01 → viram lacunas.
  const jmFreed = others.filter(r => +r.instructorId === JM &&
    res.rows.some(a => a.date === r.date && ovl(toMin(a.startTime), toMin(a.endTime), toMin(r.startTime), toMin(r.endTime))));
  console.log(`\n== João Moura liberado de ${jmFreed.length} slot(s) (viram SEM INSTRUTOR p/ backfill):`);
  for (const r of jmFreed) console.log(`   ${fmtBR(r.date)} ${r.startTime}-${r.endTime} | "${r.className}" | ${r.module} | ${r.role}`);
  const jmKept = others.filter(r => +r.instructorId === JM && !jmFreed.includes(r));
  if (jmKept.length) { console.log(` (mantidos, não colidem:)`); for (const r of jmKept) console.log(`   ${fmtBR(r.date)} ${r.startTime}-${r.endTime} | "${r.className}"`); }

  if (!COMMIT) { console.log('\nPREVIEW — nada gravado.'); return; }
  console.log('\n>>> DELETANDO ALPH 01 atual e inserindo a nova...');
  const del = await sb.from('relyon_schedules').delete().eq('className', CLASS).gte('date', FROM).lte('date', TO);
  if (del.error) throw new Error(`delete: ${del.error.message}`);
  const n = await insertSchedules(res.rows);
  console.log(`>>> deletadas ${oldAlph.length}, inseridas ${n}.`);
  for (const r of jmFreed) {
    const u = await sb.from('relyon_schedules').update({ instructorId: null, instructorName: '' }).eq('id', r.id);
    if (u.error) throw new Error(`null JM id=${r.id}: ${u.error.message}`);
  }
  console.log(`>>> ${jmFreed.length} slot(s) do João Moura esvaziados (lacunas p/ backfill).`);
}

main().catch(e => { console.error(e); process.exit(1); });
