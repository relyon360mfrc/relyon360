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

import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transform } from 'esbuild';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SMOKE = process.argv.includes('--smoke');
const PREVIEW = process.argv.includes('--preview');
const VERIFY = process.argv.includes('--verify');
const kb = n => (n / 1024).toFixed(0) + ' KB';

// Assets estáticos referenciados por index.html / manifest.json / sw.js. Copiados
// pra cada pasta de saída pra que dist/ seja AUTO-CONTIDO (a Vercel publica só
// dist/). Sem isso, manifest/ícones/sw dariam 404 na produção do bundle.
const STATIC_ASSETS = ['manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'sw.js'];

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

  // Copia os assets estáticos pra pasta de saída ser auto-contida.
  let assetsCopied = 0;
  for (const asset of STATIC_ASSETS) {
    const src = join(ROOT, asset);
    if (existsSync(src)) { copyFileSync(src, join(dir, asset)); assetsCopied++; }
    else console.log(`   ⚠️  asset estático ausente (ignorado): ${asset}`);
  }
  return { bundleName, hash, assetsCopied };
}

// limpa dist/ antes de gerar
try { rmSync(join(ROOT, 'dist'), { recursive: true, force: true }); } catch {}

const real = emit(join(ROOT, 'dist'), bundle);
console.log(`\n✅ Bundle de produção: dist/${real.bundleName}`);
console.log(`   Fonte concatenada : ${kb(Buffer.byteLength(concatenated))} (soma dos ${files.length} módulos: ${kb(srcTotal)})`);
console.log(`   Bundle (esbuild)  : ${kb(Buffer.byteLength(bundle))}`);
  console.log(`   Assets copiados   : ${real.assetsCopied}/${STATIC_ASSETS.length} (${STATIC_ASSETS.join(', ')})`);

if (PREVIEW) {
  // Variante de PREVIEW: aponta pro Supabase REAL (NÃO neutraliza), mas DESLIGA o
  // _publishVersion (não publica versão → não mexe no portão da frota) e injeta um
  // banner "somente leitura". Pra validar o app autenticado contra dados reais SEM
  // efeito colateral. Protocolo de uso: navegar e ver, NÃO salvar/excluir.
  const guard = "\n;(function(){"
    + "try{_publishVersion=async function(){};}catch(e){}"
    + "try{var b=document.createElement('div');"
    + "b.textContent='⚠ PREVIEW (bundle esbuild) — somente leitura — NÃO salve';"
    + "b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#ffa619;color:#01323d;font-weight:600;font-size:12px;padding:4px 8px;text-align:center;font-family:sans-serif';"
    + "document.body.appendChild(b);}catch(e){}})();\n";
  const pv = emit(join(ROOT, 'dist', 'preview'), bundle + guard);
  console.log(`\n🔎 Preview build (Supabase REAL, _publishVersion OFF): dist/preview/${pv.bundleName}`);
}

if (VERIFY) {
  // Variante de VERIFY-WRITES (Fase 1 completa — blindar o SALVAR): aponta pro
  // Supabase REAL em LEITURA (boot/dados/sync de verdade), mas INTERCEPTA toda
  // escrita (insert/update/upsert/delete) de `sb.from(...)`: em vez de mandar pra
  // rede, registra { table, op, args, filters } em window.__capturedWrites e finge
  // sucesso ({data:[{}], error:null}). Assim dá pra exercitar criar/editar/excluir
  // turma sob o BUNDLE e conferir que ele monta as MESMAS operações de banco que o
  // babel-no-navegador — SEM tocar em nenhum banco. (O comportamento do servidor —
  // constraints/RLS/triggers — é invariante a babel-vs-bundle e já é provado pela
  // produção; a única variável nova é o código do cliente, que é o que isto testa.)
  const vguard = `
;(function(){
  try {
    window.__capturedWrites = [];
    window.__clearWrites = function(){ window.__capturedWrites = []; return 'cleared'; };
    window.__dumpWrites = function(){ return JSON.stringify(window.__capturedWrites, null, 2); };
    if (typeof sb === 'undefined' || !sb || !sb.from) { console.error('[verify] sb nao encontrado — interceptor NAO ativado'); return; }
    var WRITE = { insert:1, update:1, upsert:1, delete:1 };
    var realFrom = sb.from.bind(sb);
    function clone(a){ try { return JSON.parse(JSON.stringify(a)); } catch(e){ return '<unserializable>'; } }
    function captureWrite(table, op, callArgs){
      var entry = { table: table, op: op, args: clone(Array.prototype.slice.call(callArgs)), filters: [], at: new Date().toISOString() };
      window.__capturedWrites.push(entry);
      var res = { data: [{}], error: null, count: 1, status: 200, statusText: 'OK' };
      var p = Promise.resolve(res);
      var fake = {
        then: function(a,b){ return p.then(a,b); },
        catch: function(a){ return p.catch(a); },
        finally: function(a){ return p.finally(a); }
      };
      ['eq','neq','in','gt','gte','lt','lte','match','is','not','filter','contains','like','ilike'].forEach(function(m){
        fake[m] = function(){ entry.filters.push({ m: m, args: clone(Array.prototype.slice.call(arguments)) }); return fake; };
      });
      ['select','single','maybeSingle','order','limit','range','csv','throwOnError'].forEach(function(m){ fake[m] = function(){ return fake; }; });
      return fake;
    }
    sb.from = function(table){
      var rb = realFrom(table);
      return new Proxy(rb, {
        get: function(target, prop){
          if (WRITE[prop] === 1) { return function(){ return captureWrite(table, prop, arguments); }; }
          var v = target[prop];
          return (typeof v === 'function') ? v.bind(target) : v;
        }
      });
    };
    var b = document.createElement('div');
    b.textContent = '\\uD83E\\uDDEA VERIFY-WRITES (bundle esbuild) \\u2014 escritas INTERCEPTADAS (nao vao ao banco) \\u2014 ver window.__capturedWrites';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#16a34a;color:#fff;font-weight:600;font-size:12px;padding:4px 8px;text-align:center;font-family:sans-serif';
    (document.body || document.documentElement).appendChild(b);
    console.log('[verify] interceptor de escrita ATIVO — sb.from(...).{insert,update,upsert,delete} capturados, sucesso fingido');
  } catch(e){ console.error('[verify] guard falhou', e); }
})();
`;
  const vv = emit(join(ROOT, 'dist', 'verify'), bundle + vguard);
  console.log(`\n🧪 Verify-writes build (Supabase REAL em leitura, escritas interceptadas): dist/verify/${vv.bundleName}`);
}

if (SMOKE) {
  const smokeCode = bundle.replace(/snpvqqsmwrlazawjknme\.supabase\.co/g, 'disabled.invalid');
  const neutralized = smokeCode !== bundle;
  const smoke = emit(join(ROOT, 'dist', 'smoke'), smokeCode);
  console.log(`\n🧪 Smoke build: dist/smoke/${smoke.bundleName}  (Supabase neutralizado: ${neutralized})`);
  if (!neutralized) console.log('   ⚠️  ATENÇÃO: não achei o host do Supabase pra neutralizar — NÃO abrir no navegador.');
}
