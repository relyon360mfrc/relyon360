# Plano de Migração — Build Step (esbuild)

> **Status:** PROPOSTA — aguardando decisão do Matheus. Nada implementado.
> Documento de decisão; não é design firmado. Escrito em 2026-06-05.

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
- **Fase 1 — preview Vercel.** Configurar Build Command; deploy num **preview** (não produção); testar
  login / salvar / relatórios contra dados reais.
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
