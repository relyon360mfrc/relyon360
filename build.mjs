// build.mjs — Fase 0 da migração pro build step (ver MIGRACAO_BUILD_STEP.md)
//
// O QUE FAZ: lê a ORDEM dos módulos direto do index.html (fonte única da verdade),
// concatena os js/*.js nessa ordem, transpila o JSX e minifica com esbuild, e gera
// UM único bundle com hash de conteúdo em dist/.
//
// POR QUE CONCATENAR (e não "bundlar"): os 17 módulos de produção são <script>
// clássicos que compartilham UM ÚNICO escopo global (só config.js declara
// `const {useState}=React`; o resto usa o que já está no escopo). Um bundler ESM
// daria escopo de módulo a cada arquivo e quebraria as referências cruzadas
// (recalcTimes, useState, hashPw virariam undefined). Concatenar na ordem do
// index.html é EQUIVALENTE ao que o babel-standalone faz hoje em runtime.
//
// USO:
//   node build.mjs           -> gera dist/ (bundle de produção)
//   node build.mjs --smoke   -> também gera dist/smoke/ com o Supabase NEUTRALIZADO
//                               (host .invalid, que nunca resolve) pra abrir no
//                               navegador SEM tocar em produção: as chamadas falham,
//                               o app cai no fail-open e o portão de versão NÃO
//                               publica nada nem grava dados. (ver config.js:82-85)

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transform } from 'esbuild';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SMOKE = process.argv.includes('--smoke');
const kb = n => (n / 1024).toFixed(0) + ' KB';

const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');

// 1) ORDEM dos módulos = ordem das tags <script type="text/babel" src="js/..."> no
//    index.html. Não hardcodar a lista aqui — o index.html manda.
const scriptRe = /<script\s+type="text\/babel"\s+src="(js\/[^"?]+)(?:\?[^"]*)?"><\/script>/g;
const files = [...indexHtml.matchAll(scriptRe)].map(m => m[1]);
if (files.length === 0) throw new Error('Nenhum <script type="text/babel" src="js/..."> encontrado no index.html');
console.log(`Módulos (${files.length}) na ordem do index.html:`);
files.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}. ${f}`));

// 2) Concatena na ordem. Separador `;\n` evita surpresa de ASI ao juntar arquivos
//    que antes eram <script>s parseados independentemente.
let srcTotal = 0;
const concatenated = files.map(rel => {
  const code = readFileSync(join(ROOT, rel), 'utf8');
  srcTotal += Buffer.byteLength(code);
  return `/* ==== ${rel} ==== */\n${code}\n`;
}).join(';\n');

// 3) Transpila JSX + minifica.
//    minifyIdentifiers FICA DESLIGADO de propósito nesta fase: renomear símbolos de
//    TOPO num script (escopo global) é o único ponto que poderia quebrar referência
//    cruzada — mantemos os nomes pra um bundle 100% confiável sem depender de browser.
//    (Fase 1 reavalia ligar, com teste em navegador.) jsxFactory padrão do esbuild =
//    React.createElement, que casa com o React global do CDN.
const out = await transform(concatenated, {
  loader: 'jsx',
  jsx: 'transform',            // clássico (React.createElement), NÃO automatic
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,    // <- segurança: não renomeia símbolos de topo
  legalComments: 'none',
  target: 'es2019',            // compat ampla (Safari/iPad mais antigos)
  charset: 'utf8',
});
if (out.warnings.length) {
  console.log(`\n⚠️  ${out.warnings.length} warning(s) do esbuild:`);
  out.warnings.forEach(w => console.log('   -', w.text, w.location ? `(linha ${w.location.line})` : ''));
}
const bundle = out.code;

// Gera uma pasta de saída: escreve app.<hash>.js e reescreve o index.html pra
// apontar pra UMA tag em vez de 17 (e remove o CDN do babel-standalone).
function emit(dir, bundleCode) {
  mkdirSync(dir, { recursive: true });
  const hash = createHash('sha256').update(bundleCode).digest('hex').slice(0, 8);
  const bundleName = `app.${hash}.js`;
  writeFileSync(join(dir, bundleName), bundleCode);

  const html = indexHtml
    // remove a tag do babel-standalone (não precisa mais)
    .replace(/[ \t]*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/babel-standalone\/[^"]+"><\/script>[ \t]*\r?\n/, '')
    // troca o bloco das 17 tags text/babel por UMA tag de bundle (script clássico)
    .replace(/(?:[ \t]*<script\s+type="text\/babel"\s+src="js\/[^"]+"><\/script>[ \t]*\r?\n)+/,
             `  <script src="${bundleName}"></script>\n`);
  writeFileSync(join(dir, 'index.html'), html);
  return { bundleName, hash };
}

// limpa dist/ antes de gerar
try { rmSync(join(ROOT, 'dist'), { recursive: true, force: true }); } catch {}

const real = emit(join(ROOT, 'dist'), bundle);
console.log(`\n✅ Bundle de produção: dist/${real.bundleName}`);
console.log(`   Fonte concatenada : ${kb(Buffer.byteLength(concatenated))} (soma dos ${files.length} módulos: ${kb(srcTotal)})`);
console.log(`   Bundle (esbuild)  : ${kb(Buffer.byteLength(bundle))}`);

if (SMOKE) {
  const smokeCode = bundle.replace(/snpvqqsmwrlazawjknme\.supabase\.co/g, 'disabled.invalid');
  const neutralized = smokeCode !== bundle;
  const smoke = emit(join(ROOT, 'dist', 'smoke'), smokeCode);
  console.log(`\n🧪 Smoke build: dist/smoke/${smoke.bundleName}  (Supabase neutralizado: ${neutralized})`);
  if (!neutralized) console.log('   ⚠️  ATENÇÃO: não achei o host do Supabase pra neutralizar — NÃO abrir no navegador.');
}
