/**
 * refine-batch-2906.mjs — refino CIRÚRGICO do lote 29/06–03/07 já gravado.
 * NÃO recria nada. Três passes:
 *   1) Salas: espalha grupos que colidem para a próxima sala LIVRE da MESMA família
 *      (POOL / CBINC / SALA), usando o inventário real de relyon_locals.
 *   2) NR10 segunda: troca o assistente da prática CBINC (Glauco #27 → Thadeu #67).
 *   3) Tradutores: insere rows role=Translator nas turmas com tradutor na planilha
 *      (Lohana#78 EC 8h 01 · Fortini#83 ALPH 01 · NR12: Leo#40 seg / Coutinho#95 ter+).
 *
 * Preview (padrão):  node scripts/refine-batch-2906.mjs
 * Aplicar:           node scripts/refine-batch-2906.mjs --commit
 */
import { fetchSchedulesInRange, insertSchedules, fetchInstructors, getClient } from '../dist/services/supabase.js';

const COMMIT = process.argv.includes('--commit');
const FROM = '2026-06-29', TO = '2026-07-06';

const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const overlap = (s1, e1, s2, e2) => s1 < e2 && s2 < e1;

// Família de uma sala (p/ espalhar) + ordem de candidatas no inventário.
function familyOf(name) {
  if (!name) return null;
  if (/PISCINA/i.test(name)) return 'POOL';
  if (/^CBINC/i.test(name)) return 'CBINC';
  if (/^SALA\s+\d/i.test(name)) return 'SALA';
  return null; // cenários, pátios, etc. — não espalha
}

let _idc = 0;
const nextId = () => Date.now() * 1000 + (_idc++ % 1000);

async function main() {
  const sb = getClient();
  const [rows, instructors, localsRes] = await Promise.all([
    fetchSchedulesInRange(FROM, TO),
    fetchInstructors(),
    sb.from('app_state').select('value').eq('key', 'relyon_locals').single(),
  ]);
  const idToName = new Map(instructors.map(i => [i.id, i.name]));
  const allLocals = (localsRes.data?.value || []).map(l => l.name);
  const familyLocals = (fam) => allLocals.filter(n => familyOf(n) === fam);

  console.log(`Rows no banco (${FROM}..${TO}): ${rows.length} · Modo: ${COMMIT ? 'COMMIT' : 'PREVIEW'}\n`);

  // ── Pass 1: espalhar salas ────────────────────────────────────────────────
  // Grupo = mesma turma+módulo+início (co-instrutores dividem a mesma sala).
  const groups = new Map(); // key -> { rows, date, s, e, local, className, module }
  for (const r of rows) {
    const key = `${r.classId}|${r.moduleId}|${r.date}|${r.startTime}`;
    if (!groups.has(key)) groups.set(key, { rows: [], date: r.date, s: toMin(r.startTime), e: toMin(r.endTime), local: r.local, className: r.className, module: r.module });
    groups.get(key).rows.push(r);
  }
  const groupList = [...groups.values()].sort((a, b) =>
    a.date.localeCompare(b.date) || a.s - b.s || a.className.localeCompare(b.className) || a.module.localeCompare(b.module));

  const occ = new Map(); // `${date}|${local}` -> [[s,e],...]
  const isFree = (date, local, s, e) => !(occ.get(`${date}|${local}`) || []).some(([os, oe]) => overlap(s, e, os, oe));
  const mark = (date, local, s, e) => { const k = `${date}|${local}`; if (!occ.has(k)) occ.set(k, []); occ.get(k).push([s, e]); };

  const roomChanges = []; // { group, from, to }
  const roomUnresolved = [];
  for (const g of groupList) {
    const fam = familyOf(g.local);
    if (!fam) { mark(g.date, g.local, g.s, g.e); continue; }
    const cands = [g.local, ...familyLocals(fam).filter(n => n !== g.local)];
    const pick = cands.find(c => isFree(g.date, c, g.s, g.e));
    if (pick) {
      if (pick !== g.local) roomChanges.push({ g, from: g.local, to: pick });
      mark(g.date, pick, g.s, g.e);
      g.finalLocal = pick;
    } else {
      roomUnresolved.push(g);
      mark(g.date, g.local, g.s, g.e);
      g.finalLocal = g.local;
    }
  }

  // ── Pass 2: NR10 segunda — Glauco(27) → Thadeu(67) na prática CBINC ────────
  const nr10Swap = rows.filter(r =>
    r.className === 'NR 10 40H 01' && r.date === '2026-06-29' &&
    /CBINC - PRÁTICA/i.test(r.module) && r.instructorId === 27);

  // ── Pass 3: tradutores ────────────────────────────────────────────────────
  const tradFor = (className, date) => {
    if (className === 'EC 8h 01') return 78;            // Lohana
    if (className === 'MCIA - ALPH 01') return 83;       // Marco Antônio Fortini
    if (className === 'NR 12 16 H 01') return date === '2026-06-29' ? 40 : 95; // Leo Paixão seg / Coutinho ter+
    return null;
  };
  const tradRows = [];
  for (const g of groupList) {
    const tid = tradFor(g.className, g.date);
    if (!tid) continue;
    const base = g.rows[0];
    tradRows.push({
      id: nextId(), classId: base.classId, trainingId: base.trainingId, trainingName: base.trainingName,
      className: base.className, date: g.date, startTime: base.startTime, endTime: base.endTime,
      local: g.finalLocal || base.local, instructorId: tid, instructorName: idToName.get(tid) || `#${tid}`,
      module: base.module, moduleId: base.moduleId, role: 'Translator',
      studentCount: base.studentCount ?? '', observation: base.observation || '', status: 'Programado',
      base: base.base ?? null, planningType: base.planningType || 'base',
    });
  }

  // ── Relatório ──────────────────────────────────────────────────────────────
  console.log(`== Pass 1: SALAS — ${roomChanges.length} grupos realocados, ${roomUnresolved.length} sem opção livre`);
  const byFam = {};
  for (const c of roomChanges) { const f = familyOf(c.from); (byFam[f] ||= []).push(c); }
  for (const f of Object.keys(byFam)) {
    console.log(`  [${f}] ${byFam[f].length}:`);
    for (const c of byFam[f].slice(0, 40)) console.log(`    ${c.g.date} ${c.g.rows[0].startTime} "${c.g.className}" ${c.from} → ${c.to}`);
  }
  if (roomUnresolved.length) for (const g of roomUnresolved) console.log(`  ⚠️ SEM OPÇÃO: ${g.date} ${g.rows[0].startTime} "${g.className}" fica em ${g.local}`);

  console.log(`\n== Pass 2: NR10 segunda — ${nr10Swap.length} row(s) Glauco→Thadeu`);
  for (const r of nr10Swap) console.log(`  id=${r.id} ${r.startTime}-${r.endTime} ${r.module} (${r.role})`);

  console.log(`\n== Pass 3: TRADUTORES — ${tradRows.length} rows a inserir`);
  const byTurma = {};
  for (const t of tradRows) (byTurma[t.className] ||= []).push(t);
  for (const cn of Object.keys(byTurma)) {
    const ts = byTurma[cn];
    const names = [...new Set(ts.map(t => t.instructorName))].join(', ');
    console.log(`  "${cn}": ${ts.length} rows — ${names}`);
  }
  console.log('  (CBSP 01 (PRÁTICAS): "Daniel Queiroz" NÃO cadastrado — não alocado, flag)');

  // ── Aplicar ──────────────────────────────────────────────────────────────
  if (!COMMIT) {
    console.log('\nPREVIEW — nada gravado. Rode com --commit para aplicar.');
    return;
  }
  console.log('\n>>> APLICANDO...');
  let nLoc = 0;
  for (const c of roomChanges) {
    for (const r of c.g.rows) {
      const { error } = await sb.from('relyon_schedules').update({ local: c.to }).eq('id', r.id);
      if (error) throw new Error(`update local id=${r.id}: ${error.message}`);
      nLoc++;
    }
  }
  console.log(`  salas: ${nLoc} rows atualizadas`);
  for (const r of nr10Swap) {
    const { error } = await sb.from('relyon_schedules').update({ instructorId: 67, instructorName: idToName.get(67) }).eq('id', r.id);
    if (error) throw new Error(`update NR10 id=${r.id}: ${error.message}`);
  }
  console.log(`  NR10: ${nr10Swap.length} row(s) trocada(s)`);
  const ins = await insertSchedules(tradRows);
  console.log(`  tradutores: ${ins} rows inseridas`);
  console.log('>>> OK');
}

main().catch(e => { console.error(e); process.exit(1); });
