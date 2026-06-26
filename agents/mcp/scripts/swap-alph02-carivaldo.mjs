/**
 * swap-alph02-carivaldo.mjs — MCIA - ALPH 02: troca o líder de teoria
 * CLOVIS #12 → CARIVALDO #9 (mantém primeiros-socorros com Erik/Marigo/Elcio/Gabriel).
 * Sequência fica a ordem padrão (= "Modo 2"), sem mudança. Libera o Carivaldo dos
 * slots dele (em outras turmas) que colidem com a ALPH 02 → viram lacunas.
 *
 * Preview:  node scripts/swap-alph02-carivaldo.mjs
 * Gravar:   node scripts/swap-alph02-carivaldo.mjs --commit
 */
import { fetchSchedulesInRange, fetchInstructors, getClient } from '../dist/services/supabase.js';

const COMMIT = process.argv.includes('--commit');
const FROM = '2026-06-29', TO = '2026-07-06', CLASS = 'MCIA - ALPH 02';
const CLOVIS = 12, CARIVALDO = 9;
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const ovl = (s1, e1, s2, e2) => s1 < e2 && s2 < e1;

async function main() {
  const sb = getClient();
  const [rows, instructors] = await Promise.all([fetchSchedulesInRange(FROM, TO), fetchInstructors()]);
  const carName = instructors.find(i => i.id === CARIVALDO)?.name;

  const a2 = rows.filter(r => r.className === CLASS);
  const clovisRows = a2.filter(r => +r.instructorId === CLOVIS);
  const a2Intervals = a2.map(r => ({ date: r.date, s: toMin(r.startTime), e: toMin(r.endTime) }));
  // Slots do Carivaldo em OUTRAS turmas que colidem com a ALPH 02 → liberar.
  const carConflicts = rows.filter(r => +r.instructorId === CARIVALDO && r.className !== CLASS &&
    a2Intervals.some(a => a.date === r.date && ovl(a.s, a.e, toMin(r.startTime), toMin(r.endTime))));

  console.log(`ALPH 02: ${a2.length} rows. Clovis lidera ${clovisRows.length} → vira Carivaldo (${carName}).`);
  for (const r of clovisRows) console.log(`  ${r.date} ${r.startTime}-${r.endTime} | ${r.module}`);
  console.log(`\nCarivaldo liberado de ${carConflicts.length} slot(s) (vira SEM INSTRUTOR):`);
  for (const r of carConflicts) console.log(`  ${r.date} ${r.startTime}-${r.endTime} | "${r.className}" | ${r.module} | ${r.role}`);

  if (!COMMIT) { console.log('\nPREVIEW — nada gravado.'); return; }
  console.log('\n>>> APLICANDO...');
  for (const r of clovisRows) {
    const u = await sb.from('relyon_schedules').update({ instructorId: CARIVALDO, instructorName: carName }).eq('id', r.id);
    if (u.error) throw new Error(`swap id=${r.id}: ${u.error.message}`);
  }
  for (const r of carConflicts) {
    const u = await sb.from('relyon_schedules').update({ instructorId: null, instructorName: '' }).eq('id', r.id);
    if (u.error) throw new Error(`null car id=${r.id}: ${u.error.message}`);
  }
  console.log(`>>> ${clovisRows.length} rows → Carivaldo · ${carConflicts.length} slot(s) liberado(s).`);
}

main().catch(e => { console.error(e); process.exit(1); });
