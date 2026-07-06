# Plano de execução para Sonnet — melhorias do setup Claude Code

**Contexto:** este plano deriva do diagnóstico em `melhorias-claude.md` (leia a tabela-resumo antes de começar). Os itens #2 e #4 (correções de app de alto risco) ficaram com o Fable — **NÃO os execute aqui**. Este plano cobre os itens seguros para Sonnet, em ordem de execução.

**Regras gerais (valem para todos os itens):**
- Leia o `CLAUDE.md` da raiz do workspace antes de qualquer edição (regras críticas do projeto).
- Um commit por item concluído, mensagem em português descrevendo o quê e por quê. NÃO faça push — o usuário pusha via GitHub Desktop.
- Nenhum item deste plano mexe em `js/*` de produção, exceto o #10 (script novo isolado). Nenhum exige bump de `APP_VERSION`.
- Se algo divergir do descrito aqui (arquivo não existe, estrutura diferente), pare o item, reporte e siga pro próximo — não improvise em cima de suposição.

---

## Item 1 — CLAUDE.md: regra "preview vs Supabase" (diagnóstico #3)

**Arquivo:** `CLAUDE.md` (raiz do workspace, um nível acima de `relyon360/`).
**Ação:** adicionar subseção em "Regras Críticas":

> ### Verificação de mudanças — preview tem limite
> - O sandbox do preview frequentemente NÃO alcança `*.supabase.co` (ERR_CONNECTION_TIMED_OUT) → qualquer tela que dependa de login/dados trava em timeout de 30s.
> - Mudou lógica/dados: validar com `node build.mjs` + `npx vitest run` + leitura de código. NÃO usar preview_*.
> - Mudou UI pura/CSS sem dependência de dados: preview_* é permitido, mas 1 timeout = desistir e validar estático (não insistir 3-4x).

**Verificação:** reler a seção; conferir que não duplicou regra existente.

## Item 2 — CLAUDE.md: seção "Ambiente Windows — armadilhas" (diagnóstico #7)

**Arquivo:** `CLAUDE.md` (raiz do workspace).
**Ação:** adicionar seção curta:

> ## Ambiente Windows — armadilhas
> - Sempre paths ABSOLUTOS em Grep/Read/Bash — path relativo com o cwd `...\relyon360` quebra (`Path does not exist: RELYON 360 - scheduler/relyon360/...`).
> - `cd` não persiste entre chamadas Bash — nunca dependa de `cd` anterior.
> - Python com acentos: prefixar `PYTHONIOENCODING=utf-8` (CP1252 quebra `print` com acento).
> - `.xlsx` é binário — nunca Read; usar script Node (ver `agents/mcp/scripts/parse-lote.mjs` após item 6) ou openpyxl.

## Item 3 — CLAUDE.md: checklist "novo tipo entra em N lugares" (diagnóstico #5)

**Arquivo:** `CLAUDE.md` (raiz do workspace).
**Ação:** ANTES de escrever, confirme cada local por grep (não confie de memória):
- Novo **tipo de atividade** (Linha do Tempo): `js/constants.js` (`ACTIVITY_TYPES` + paleta/labels), `js/coverage.js` (legenda E dropdown do modal), `agents/mcp/` (constants espelhados do MCP — grep por `ACTIVITY_TYPES`), possivelmente `js/reports.js` (regra de bônus: bônus CLT exceto free/embarque/holiday_work).
- Novo **papel/slot em turma** (ex.: moderador, tradutor): `js/schedule.js` (`initPlan`, `loadClassForEdit`, wizard UI, `validateSlots`), `js/reports.js`, `agents/mcp/core.cjs`.
- Novo **campo de instrutor**: `js/instructors.js` (form admin), `js/instructor.js` (visão própria), `js/reports.js` se afetar remuneração.
Grep cada lista, ajuste ao que encontrar de verdade, e escreva a seção "Onde um novo tipo/entidade precisa aparecer" com os paths confirmados.

**Verificação:** cada path citado na seção deve ter sido confirmado por grep na sessão.

## Item 4 — Higiene da memória (diagnóstico #6)

**Diretório:** `C:\Users\mcarvalho\.claude\projects\C--Users-mcarvalho-OneDrive---RelyOn-RelyOn-360-Scheduler-RELYON-360---scheduler-relyon360\memory\`
**Ações:**
1. Para cada linha do `MEMORY.md`, confira se o arquivo `.md` apontado existe no diretório. Remover só as linhas cujo arquivo NÃO existe (não apague arquivos).
2. Abrir a skill `retomar-relyon-360` (procure em `.claude/skills/` do projeto e do usuário) e conferir se os arquivos que ela manda ler existem; corrigir paths mortos.
3. Adicionar ao `CLAUDE.md` (raiz do workspace), na seção de regras: *"Alinhamento de regra de negócio dito em conversa = gravar arquivo de memória NA HORA, antes de codar (evita perder decisões como 'data de feriado em absenteísmo')."*

## Item 5 — Task agendado "aviso-dp" com early-exit (diagnóstico #9)

**Ação:** usar as tools `mcp__scheduled-tasks__list_scheduled_tasks` → localizar o task "aviso-dp-rascunho-outlook" → `update_scheduled_task` acrescentando ao INÍCIO do prompt:
> "PRIMEIRO PASSO: verifique se existe solicitação de Férias/Abono APROVADA nova desde a última execução. Se não houver, responda 'sem trabalho novo' e encerre imediatamente, sem nenhuma outra tool call."
Não mude horário/frequência sem confirmar com o usuário.

## Item 6 — Parser xlsx padronizado (diagnóstico #10)

**Arquivo novo:** `agents/mcp/scripts/parse-lote.mjs`
**Ação:** antes de escrever, leia 1-2 scripts `run-batch-*.mjs` existentes em `agents/mcp/scripts/` para copiar o formato JSON que o runner consome. O script: recebe path de `.xlsx` (planilha do lote mensal), lê com a lib que já estiver disponível no `package.json` de `agents/mcp` (se não houver, use `xlsx` — adicionar dep), e emite o JSON no formato do runner em stdout ou arquivo. Documente no topo do script o mapeamento coluna→campo. Teste com uma planilha antiga se houver alguma no repo.

## Item 7 — Skill `/ship` (diagnóstico #1)

**Arquivo novo:** `.claude/skills/ship/SKILL.md` (dentro de `relyon360/`).
**Comportamento da skill (spec):**
1. `git status` — se não há mudança em arquivos rastreados: responder "nada a shipar — mudanças só no banco não precisam de commit" e encerrar (resolve a dúvida recorrente do usuário).
2. `node build.mjs` — build tem que passar.
3. `npx vitest run` — testes têm que passar. Falhou qualquer um dos dois: PARAR e reportar, não commitar.
4. Decidir `APP_VERSION` e explicar a decisão em 1 linha: bump (+1 em `js/config.js`) SÓ se a mudança for de login/auth, dinheiro (bônus/remuneração), correção de bug que corrompe dado, ou o usuário pedir reload imediato da frota. Caso contrário, não bumpa (bundle hasheado já invalida cache — CLAUDE.md §Deploy).
5. Commit com mensagem em português (o quê + por quê). Push SÓ se o usuário pedir explicitamente ("e já pusha").
6. Se pushou: verificar deploy pela Vercel MCP (`list_deployments`/`get_deployment` do conector Vercel) até estado READY; erro de build → `get_deployment_build_logs` e reportar. NÃO usar curl+sleep.

**Frontmatter da skill:** description disparando em "ship", "sobe isso", "commita e verifica", "faz o deploy".

## Item 8 — Auditoria de lógica espelhada (diagnóstico #11) — SÓ RELATÓRIO

**Ação:** mapear toda regra de negócio que existe em 2+ módulos e comparar as implementações:
- "ausência dia inteiro" (`js/constants.js` / `js/dashboard.js` / `computeCoverage`) — histórico: `||` vs `&&` divergiram
- regra de bônus CLT (`js/reports.js` vs `js/coverage.js`/constants)
- `recalcTimes`/`applyDaySchedule` (`js/config.js`) vs espelho `js/logic.js` vs `agents/mcp/core.cjs`
- detector de conflitos (`js/dashboard.js` vs `js/schedule.js` vs MCP)
**Entregável:** `AUDITORIA-LOGICA-ESPELHADA.md` na raiz de `relyon360/` listando: regra, onde vive, se as implementações batem, e recomendação. **NÃO consolidar código nesta sessão** — divergência achada = reportar para o Fable corrigir.

---

## Checklist final da sessão Sonnet
- [ ] 1 commit por item concluído (sem push)
- [ ] Nenhuma edição em `js/*` além do escopo (item 6 é script novo em `agents/`, não `js/`)
- [ ] `APP_VERSION` intocado
- [ ] Reportar ao usuário: itens feitos, itens pulados e por quê
