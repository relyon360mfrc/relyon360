# Plano de Migração — Build Step (esbuild)

> **Status (2026-06-05):** Fase 0 ✅ · Fase 1 enxuta (leitura vs banco real) ✅ · Fase 1 ESCRITA (lógica de SALVAR verificada via intercept harness) ✅ · Fase 2 (produção) pendente.
> Produção segue no babel-no-navegador (APP_VERSION 9). Ver §0 abaixo para retomar.

---

## 0. Estado atual e como retomar (2026-06-05)

**Fases:**
- **Fase 0** (prova de conceito local, backend neutralizado): ✅ VERDE
- **Fase 1 enxuta** (preview local contra banco REAL, modo leitura): ✅ VERDE
  - Automatizado: boot + carga dos dados reais (paginação 1000) + sync + tela de login, **0 erros no console, 0 escritas** (só GET/OPTIONS no log de rede).
  - Manual: Matheus logou e navegou todas as telas autenticadas → **"absolutamente normal"**.
- **Fase 1 ESCRITA** (lógica de SALVAR/excluir verificada sob o bundle, sem banco): ✅ VERDE — 2026-06-05
  - Modo novo `node build.mjs --verify`: aponta pro Supabase REAL em LEITURA, mas **intercepta** todo `sb.from(...).{insert,update,upsert,delete}` (registra `{table,op,args,filters}` em `window.__capturedWrites` e finge sucesso — NÃO vai à rede).
  - Exercitado via preview tools chamando o código de escrita REAL do bundle direto:
    - `_persistSchedules(prev,next)` com diff insert+delete+update+no-op → produziu **exatamente** 3 ops corretas: `insert` só da row nova (payload já stripado, só colunas reais); `delete().in('id',[A])` cirúrgico; `update(rest).eq('id',B)` (id no filtro, não no body, campos alterados certos); row inalterada → **0 op** (diff JSON pulou). `err:null`.
    - `_deleteSchedulesByClassId(cid)` → `upsert` do tombstone em `relyon_class_tombstones` **+** `delete().eq('classId',cid)`. `app_state` upsert com `{onConflict:'key'}` idem.
  - **Prova de segurança:** log de rede após as 6 ops = **só GET/OPTIONS, 0 POST/PATCH/DELETE**. Interceptação total, zero contato de escrita com produção.
  - **Por que isso basta:** o comportamento do SERVIDOR (constraints/RLS/triggers/UNIQUE) é invariante a babel-vs-bundle e já é provado pela produção há meses. A única variável nova do bundle é o **código do cliente** — e ele gera operações de banco idênticas. (Não exercitado: o clique-a-clique do wizard na UI; mas a camada de render/JSX já é provada na Fase 1 enxuta e a lógica de escrita aqui — o "meio de campo" onClick→setSchedules é JSX uniforme, risco residual desprezível.)
- **Fase 1 completa com banco de TESTE** (round-trip real contra Supabase): ⏳ NÃO feita — agora **opcional** (a lógica já foi blindada acima; só agregaria reprovar o servidor, que já é provado pela produção).
- **Fase 2** (Vercel / produção): ⏳ não iniciada.

**Provado:** o bundle esbuild é substituto FIEL do babel-no-navegador em **LEITURA** (boot, login, telas, sync, dados reais) **E** na **LÓGICA DE ESCRITA** (insert/update/delete/delete-by-class/tombstone/app_state-upsert/strip/no-op todos idênticos, verificados sob o bundle).
**Não exercitado (risco desprezível):** o caminho de clique na UI do wizard ponta-a-ponta — a glue React entre o handler e `setSchedules`. Não há banco de teste com round-trip real, mas o servidor é invariante e já provado pela produção.

**Produção hoje:** ainda é babel-no-navegador, `APP_VERSION 9` (deploy 2026-06-05, correção de absence propagada). A migração ainda **não** tocou produção.

**Como reproduzir o preview local (a qualquer momento):**
```
node build.mjs --preview                 # gera dist/preview: banco REAL, _publishVersion OFF, banner
node serve-smoke.mjs dist/preview 4179    # OU preview_start "preview" (launch.json, porta 4179)
# abrir http://localhost:4179 ; o banner laranja confirma que é o bundle
```
⚠️ NÃO rodar `build.mjs` enquanto o servidor estiver servindo dist/preview — o rebuild limpa `dist/` e troca o hash, quebrando a aba aberta.

**Como reproduzir a verificação de ESCRITA (intercept harness):**
```
node build.mjs --verify                  # gera dist/verify: banco REAL em leitura, escritas INTERCEPTADAS
node serve-smoke.mjs dist/verify 4180     # OU preview_start "verify" (launch.json, porta 4180)
# no console da página (ou via preview_eval):
#   window.__clearWrites()                 -> zera o buffer
#   await _persistSchedules(prev, next)    -> gera o diff de escrita SOB O BUNDLE
#   window.__capturedWrites                -> {table, op, args, filters} de cada escrita (NÃO foi à rede)
#   window.__dumpWrites()                  -> idem, em JSON
# checar no log de rede: só GET/OPTIONS, 0 POST/PATCH/DELETE = interceptação OK
```

**Artefatos:**
- `build.mjs` — script de build (KEEPER). Modos: (nenhum)=produção→`dist/`; `--smoke`=Supabase neutralizado→`dist/smoke/`; `--preview`=banco real + publish OFF→`dist/preview/`; `--verify`=banco real em leitura + escritas interceptadas em `window.__capturedWrites`→`dist/verify/`. Deriva a ordem dos módulos do `index.html`. `minifyIdentifiers:false` (segurança).
- `serve-smoke.mjs` — servidor estático de teste (argv: pasta, porta). Descartável.
- `.claude/launch.json` — configs `smoke` (4178), `preview` (4179) e `verify` (4180). Gitignored.
- `dist/` — saída do build. Gitignored.

**Decisão pendente (próximo passo):** a lógica de SALVAR já foi blindada (Fase 1 ESCRITA acima), então a dúvida "preciso de banco de teste antes?" praticamente caiu. Próximo passo real = **Fase 2** (Vercel/produção, via branch — ver pré-requisitos abaixo). Opcional, se quiser cinto-e-suspensório extra: um round-trip real contra Supabase de teste/branch (custo/setup; não imprescindível porque o servidor já é provado pela produção).

**Pré-requisitos da Fase 2 (quando for):**
1. `build.mjs` precisa **copiar os assets estáticos** pra `dist/`: `manifest.json`, `icon.svg`, `icon-192.png`, `apple-touch-icon.png`, `sw.js` (hoje não copia — no preview deram 404 inofensivo).
2. Criar `vercel.json` (`buildCommand: "node build.mjs"`, `outputDirectory: "dist"`) **num BRANCH**, nunca direto na `main` (senão o próximo deploy de produção vira o bundle de uma vez).
3. Push do branch → preview deployment da Vercel. ⚠️ preview da Vercel bate no Supabase de produção → reaproveitar o `_publishVersion` OFF (truque do `--preview`) ou usar banco de teste, senão publica `APP_VERSION` e força reload da frota.
4. Testar o preview; se ok, merge na `main` = produção.
5. Pós-migração: o ritual `?v=` manual fica obsoleto (hash automático) — pode limpar os `?v=` do `index.html`.

---

## 1. Por que (o problema que resolve)

Hoje cada cliente baixa **~1,17MB de JSX cru** e o **transpila no próprio navegador** via
`babel-standalone` a cada cold load (inclusive iPad). Três dores concretas:

1. **Lentidão e fragilidade.** Transpilar 1,17MB no cliente é caro, e o `<head>` depende de
   **6 scripts de CDN externos** (React, ReactDOM, Babel, Supabase, bcrypt, xlsx).
2. **Ritual de cache manual e frágil.** A cada deploy você sobe à mão:
   - o `?v=` de **cada** arquivo alterado no `index.html` (hoje são 17 strings inventadas:
     `covfilter1`, `draft1`, `huet2`, `revoke1`…), **e**
   - o `APP_VERSION` em `config.js`.

   Sem isso, cliente fica com código velho. **É o ritual que mais gera o bug recorrente de
   "cache / dados revertidos".** São 2 passos manuais por deploy, sem nenhuma verificação.
3. **`babel-standalone` não é pra produção** — o próprio projeto Babel avisa isso.

### O que NÃO é o problema (pra não exagerar o diagnóstico)
- O **portão de versão** (`APP_VERSION`) é bom e **fica**.
- O `CACHE_NAME` do SW (`relyon360-v5`) **não** precisa subir a cada deploy — o `_applyUpdate`
  do gate já limpa o cache de código no upgrade. Ou seja, hoje são **2** passos manuais por
  deploy, não 3. (Na minha 1ª análise eu disse "3 contadores que divergem" — corrigindo: são
  3 contadores independentes, mas só 2 são por-deploy; o do SW diverge **de propósito**.)

---

## 2. O insight que torna a migração SEGURA

Os 18 módulos **compartilham um único escopo global** — são `<script>` clássicos, **não** ES
modules. Verificado:
- só `config.js:1` faz `const { useState, useEffect, useRef } = React;`; os outros 16 de
  produção **usam** o que já está no escopo (não redeclaram);
- `import`/`export` só existe no `logic.js` (arquivo de **teste**, não carregado em produção).

Logo, o que o `babel-standalone` faz hoje é **equivalente a concatenar os arquivos na ordem
do `index.html` e transpilar uma vez**.

➡️ A migração certa é **concatenar na ordem → transpilar JSX → minificar → 1 bundle com hash**.
**Zero refatoração** dos 18 arquivos.

> ⚠️ **Por que NÃO usar `vite build` / bundler ESM "normal":** um bundler trataria cada arquivo
> como módulo com escopo próprio — e as referências cruzadas (`recalcTimes`, `useState`,
> `hashPw` usadas em arquivos que não as declaram) virariam `undefined`. O app quebraria.
> É **concatenação**, não *bundling* de módulos.

---

## 3. Proposta (Opção A — recomendada: build mínimo com esbuild)

Um script Node (~30 linhas) que:

1. Lê os 18 `js/*.js` **na ordem exata declarada no `index.html`** (fonte única da ordem —
   não hardcodar a lista) e concatena.
2. Roda `esbuild.transform(concat, { loader: 'jsx', minify: true })`.
3. Escreve `dist/app.[hash].js` (hash do conteúdo).
4. Gera `dist/index.html` apontando para **1 tag** com o bundle hasheado (em vez de 18) e
   **sem** o `babel.min.js` no `<head>` (não precisa mais).
5. React / ReactDOM / Supabase / bcrypt / xlsx **continuam como globais de CDN** (não bundlar
   libs nesta fase — mantém simples e o diff pequeno).

Na Vercel, esse script vira o **Build Command**; publica a pasta `dist/`.

### O que isso elimina
- ✅ Os **17 `?v=` manuais** → somem. Vira **1 nome com hash automático**: mudou o código →
  muda o hash → cache invalida sozinho. **Fim do ritual.**
- ✅ **Babel no navegador** → some (transpila no build).
- ✅ **1,17MB → bundle minificado** (estimativa 40–60% menor) e **1 request** em vez de 18.

### O que continua / precisa de atenção
- `APP_VERSION` **continua** (cinto-e-suspensório do gate). O `+1` por deploy pode ser
  automatizado depois (derivar do hash); numa 1ª fase mantém manual — mas aí é **1 passo**, não 2.
- `sw.js` deve cachear o novo nome hasheado. Como o nome muda sozinho, a estratégia ideal é
  "network-first pro HTML + cache pros assets com hash" (já é mais ou menos isso). Ajuste pequeno.
- **Fluxo de dev muda um pouco.** Hoje você abre o `index.html` e funciona. Pós-build, pra
  testar local você roda o script (ou `esbuild --watch`).

---

## 4. Trade-offs honestos

**Ganha:** velocidade, fim do ritual `?v=`, sem CDN do Babel, bundle menor, muito menos bug de cache.

**Perde:** "o que eu vejo é o que roda" — o que roda passa a ser o bundle minificado
(debug via source map). E adiciona um passo de build que **pode falhar** — mitigável: build
local rápido + a Vercel mostra erro de build **antes** de publicar (não derruba produção).

---

## 5. Opções comparadas

| Opção | O que é | Esforço | Recomendação |
|-------|---------|---------|--------------|
| **A** | esbuild: concatena + transpila + minifica → 1 bundle com hash | ~1 dia, reversível | ✅ **Recomendada** |
| **B** | Refatorar os 18 arquivos pra ESM (import/export) + vite | Grande e arriscado | ❌ Não agora |
| **C** | Não migrar; manter ritual `?v=` manual | Zero | ⚠️ Aceitável se a dor de cache não justificar mudar o fluxo — mas a dor é recorrente |

---

## 6. Plano de execução (incremental e reversível)

- **Fase 0 — provar o conceito (sem tocar em produção). ✅ EXECUTADA em 2026-06-05.** Script
  `build.mjs` criado (deriva a ordem do `index.html`, concatena, `esbuild.transform` com JSX +
  minify de whitespace/sintaxe, hash de conteúdo, reescreve o index pra 1 tag). Resultados:
  - **esbuild transpilou os 17 módulos com ZERO erro/warning** → sintaxe/JSX 100% compatível (risco nº1 aposentado).
  - Bundle passa no parse como *classic script* (`vm.Script`) — contexto idêntico ao do navegador.
  - **Tamanho: 1117 KB → 799 KB** (com `minifyIdentifiers` DESLIGADO por segurança; gzip/brotli da Vercel reduz muito mais).
  - **Smoke no navegador** (`dist/smoke/`, Supabase neutralizado em `disabled.invalid`): React montou, rodou o fluxo de boot real (query do version gate + load de `_DB_KEYS`), **console sem nenhum erro**, e ao falhar a conexão (de propósito) renderizou o componente de erro estilizado "Não foi possível conectar ao banco de dados". **Zero contato com produção** confirmado no log de rede.
  - **Conclusão:** o mecanismo de build funciona e é seguro. Falta só validar a interação completa contra um banco VIVO (login / salvar / relatórios) — ver Fase 1.
- **Fase 1 — validar contra backend real.**
  - **(enxuta, local) ✅ EXECUTADA e VERDE 2026-06-05:** `node build.mjs --preview` (banco REAL, `_publishVersion` OFF, banner) em localhost:4179. Automatizado: boot + dados reais + sync + login, **0 erros, 0 escritas**. Matheus navegou logado em todas as telas → "absolutamente normal". Cobre LEITURA do app inteiro.
  - **(Vercel / fluxo de salvar) pendente.** Configurar Build Command; deploy num **preview**; testar salvar/relatórios contra dados reais.
  - ⚠️ **Achado da Fase 0 (importante):** qualquer ambiente rodando um `APP_VERSION` mais NOVO contra
    o Supabase de PRODUÇÃO **publica** essa versão (`checkVersionGate` → `_publishVersion`) e dispara
    reload em TODA a frota — mesmo sendo "só um preview". Então a Fase 1 precisa de **um dos dois**:
    (a) um **projeto Supabase de teste** dedicado pro preview (recomendado — resolve isso e ainda
    permite testar o salvar sem risco), ou (b) desligar o `_publishVersion` em builds de preview.
- **Fase 2 — produção.** Promover; observar 1–2 dias. Manter o `index.html` antigo (sem build)
  num branch como **rollback** imediato.
- **Fase 3 (opcional).** Automatizar `APP_VERSION` a partir do hash; ajustar `sw.js`.

---

## 7. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Ordem de concatenação errada → app quebra (escopo global) | Derivar a ordem **do próprio `index.html`** (fonte única), não hardcodar |
| Colisão de `const` no topo entre arquivos | Já não existe hoje (senão o babel-standalone já quebraria) → concatenar é seguro |
| JSX/edge cases: esbuild ≠ babel | Cobrir na **Fase 0** testando o app inteiro antes de qualquer deploy |
| SW servir bundle velho | network-first pro HTML; o gate de versão continua como rede de segurança |

---

## 8. Decisão pendente (preciso de você)

1. **Topa incluir um Build Command na Vercel** no fluxo de deploy? (É o único custo real de fluxo.)
2. Quer que eu faça a **Fase 0** (script + teste local, **sem** tocar em produção) numa próxima
   sessão, pra você ver funcionando antes de bater o martelo?
