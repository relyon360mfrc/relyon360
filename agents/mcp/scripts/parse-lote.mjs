/**
 * parse-lote.mjs — lê a planilha mensal "programacao periodica <MES>.xlsx" e emite
 * o array BATCH no formato que os runners `run-batch-*.mjs` consomem:
 *   [gcc, className, dataISO, opts?]   opts = { pin:[instructorId], linked:[], avoid:[] }
 *
 * Uso:  node scripts/parse-lote.mjs <caminho.xlsx> [--out=arquivo.json]
 * Sem --out, imprime o JSON no stdout.
 *
 * Mapeamento coluna → campo (planilha padrão, 1 coluna de preferência):
 *   Training                    → gcc (código do treinamento, casado por training.gcc case-insensitive)
 *   Date                        → dataISO (aceita serial Excel, "DD/MM/YYYY" ou "YYYY-MM-DD")
 *   Name                        → className
 *   PREFERÊNCIA DE INSTRUTOR    → opts.pin[0] (nome parcial resolvido pelo roster; ambíguo/sem match vira aviso)
 *
 * Variante observada (lote 29/06–03/07): sem coluna única "PREFERÊNCIA", vêm colunas
 * separadas Teoria / Lead / Equipe / Tradutor / OBS. Nesse caso só o PRIMÁRIO
 * (Teoria → fallback Lead) é pinado; Equipe/Tradutor/OBS saem como aviso no stderr
 * para o operador completar manualmente no runner (ver project_lote_periodico_planilha
 * na memória — resolução automática desses papéis não é confiável o bastante pra pinar sozinha).
 *
 * IMPORTANTE: isto é um script isolado em agents/mcp — não toca em js/* de produção.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { fetchInstructors } from '../dist/services/supabase.js';

const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const outArg = args.find(a => a.startsWith('--out='));
const outPath = outArg ? outArg.slice('--out='.length) : null;

if (!filePath) {
  console.error('Uso: node scripts/parse-lote.mjs <caminho.xlsx> [--out=arquivo.json]');
  process.exit(1);
}

function excelDateToISO(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    // serial Excel (dias desde 1899-12-30)
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`;
  return null;
}

function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().trim();
}

// Resolve nome (parcial, sem acento) → instructorId único. Ambíguo ou sem match = null + aviso.
function resolveInstructorId(rawName, roster, warnings, contextLabel) {
  const name = normName(rawName);
  if (!name) return null;
  const exact = roster.find(r => normName(r.name) === name);
  if (exact) return exact.id;
  const partial = roster.filter(r => normName(r.name).includes(name) || name.includes(normName(r.name)));
  if (partial.length === 1) return partial[0].id;
  if (partial.length > 1) {
    warnings.push(`Ambíguo "${rawName}" (${contextLabel}) — candidatos: ${partial.map(p => `${p.name}#${p.id}`).join(', ')}`);
    return null;
  }
  warnings.push(`Instrutor não encontrado no roster: "${rawName}" (${contextLabel})`);
  return null;
}

async function main() {
  const wb = XLSX.read(readFileSync(filePath));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rows.length) {
    console.error('Planilha vazia ou formato não reconhecido.');
    process.exit(1);
  }

  const cols = Object.keys(rows[0]);
  const findCol = (candidates) => cols.find(c => candidates.some(cand => normName(c) === normName(cand)));

  const colGcc = findCol(['Training']);
  const colDate = findCol(['Date']);
  const colName = findCol(['Name']);
  const colPref = findCol(['PREFERÊNCIA DE INSTRUTOR', 'PREFERENCIA DE INSTRUTOR']);
  const colTeoria = findCol(['Teoria']);
  const colLead = findCol(['Lead']);
  const colEquipe = findCol(['Equipe']);
  const colTradutor = findCol(['Tradutor']);
  const colObs = findCol(['OBS']);

  if (!colGcc || !colDate || !colName) {
    console.error(`Não achei as colunas obrigatórias (Training/Date/Name). Colunas encontradas: ${cols.join(', ')}`);
    process.exit(1);
  }

  const roster = await fetchInstructors();
  const warnings = [];
  const batch = [];

  for (const row of rows) {
    const gcc = String(row[colGcc] || '').trim();
    const className = String(row[colName] || '').trim();
    const dataISO = excelDateToISO(row[colDate]);
    if (!gcc || !className) continue; // linha em branco/separador
    if (!dataISO) {
      warnings.push(`Data não reconhecida para "${className}" (${gcc}): valor bruto "${row[colDate]}"`);
      continue;
    }

    const opts = {};
    const pin = [];

    if (colPref) {
      const id = resolveInstructorId(row[colPref], roster, warnings, `${className} PREFERÊNCIA`);
      if (id) pin.push(id);
    } else if (colTeoria || colLead) {
      const primary = row[colTeoria] || row[colLead];
      const id = resolveInstructorId(primary, roster, warnings, `${className} Teoria/Lead`);
      if (id) pin.push(id);
      if (colEquipe && row[colEquipe]) warnings.push(`Equipe não pinada automaticamente — completar no runner: "${className}" → "${row[colEquipe]}"`);
      if (colTradutor && row[colTradutor]) warnings.push(`Tradutor não pinado automaticamente — completar no runner: "${className}" → "${row[colTradutor]}"`);
      if (colObs && row[colObs]) warnings.push(`OBS da planilha (revisar): "${className}" → "${row[colObs]}"`);
    }

    if (pin.length) opts.pin = pin;
    batch.push(Object.keys(opts).length ? [gcc, className, dataISO, opts] : [gcc, className, dataISO]);
  }

  const json = JSON.stringify(batch, null, 2);
  if (outPath) {
    writeFileSync(outPath, json, 'utf8');
    console.error(`Gravado: ${outPath} (${batch.length} turmas)`);
  } else {
    console.log(json);
  }

  if (warnings.length) {
    console.error(`\n--- Avisos (${warnings.length}) — revisar antes de colar no runner ---`);
    for (const w of warnings) console.error(`- ${w}`);
  }
}

main().catch(err => { console.error('ERRO:', err); process.exit(1); });
