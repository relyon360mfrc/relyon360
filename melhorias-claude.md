# Melhorias no setup do Claude Code — Diagnóstico

**Data:** 2026-07-06
**Método:** 4 subagentes analisaram 116 sessões (2026-06-07 a 2026-07-06, ~97MB de transcrições) extraindo sinais brutos: correções do usuário, rituais repetidos, erros de ferramenta, contexto re-explicado, workflows automatizáveis e tempo desperdiçado. Os sinais foram agrupados entre sessões e cada grupo recebeu uma decisão: **skill nova**, **automação**, **correção** ou **nada**.
**Status (atualizado 2026-07-06):** #2 IMPLEMENTADO (dirty-retry de app_state, APP_VERSION 44, aguarda commit+push). Itens Sonnet-safe (#1, #3, #5, #6, #7, #9, #10, #11-auditoria) planejados em `PLANO-SONNET.md`. #4 aguarda sessão Fable dedicada.

---

## Resumo (ordenado por impacto)

| # | Candidato | Decisão | Impacto |
|---|-----------|---------|---------|
| 1 | Skill `/ship` — ritual de entrega completo | **Skill nova** | 🔴 Alto — presente em todas as 4 fatias |
| 2 | `app_state` sem fila de retry (perda silenciosa de escrita) | **Correção (app)** | 🔴 Alto — já causou 2 incidentes reais |
| 3 | Política de verificação: preview não alcança Supabase | **Correção (setup)** | 🔴 Alto — ~19 timeouts desperdiçados |
| 4 | Turmas vinculadas por nome → vincular por ID | **Correção (app)** | 🟠 Médio-alto — família de bugs recorrente |
| 5 | Checklist "novo tipo entra em N lugares" | **Correção (doc)** | 🟠 Médio-alto — entregas incompletas |
| 6 | Higiene da memória: índice quebrado + alinhamentos perdidos | **Automação + correção** | 🟠 Médio-alto — corrói confiança |
| 7 | Seção "Fricções Windows" no CLAUDE.md | **Correção (setup)** | 🟡 Médio — ~12 erros evitáveis |
| 8 | MCP RelyOn: economia de tokens + defaults de parâmetros | **Correção (MCP)** | 🟡 Médio — custo real em mobile |
| 9 | Scheduled task "aviso-dp" dispara sem trabalho novo | **Correção (automação)** | 🟢 Baixo — ruído + créditos |
| 10 | Parser xlsx padronizado pro lote periódico | **Automação** | 🟢 Baixo-médio — 1x/mês |
| 11 | Auditoria de lógica espelhada (core.cjs / logic.js / dashboard) | **Correção (app)** | 🟡 Médio — bug já mordeu 2x |
| 12 | Fricções sem ação recomendada | **Nada** | — |

---

## 1. Skill `/ship` — ritual de entrega completo → **SKILL NOVA**

**O padrão:** o mesmo ritual manual se repete no fim de quase toda sessão de código, nas 4 fatias:
`node build.mjs` → `npx vitest run` → decidir se sobe `APP_VERSION` → commit → push → esperar a Vercel → `curl` no bundle de produção conferindo o hash/`APP_VERSION`.

**Evidência:**
- Polling manual do hash com `sleep 90` + loop de curl em 3+ sessões de junho (c8123719, ca3c1aae, 25a31587)
- `node build.mjs` manual em 12 de 28 sessões da fatia 12–17/jun
- "Faz o commit e push e verifica" pedido explicitamente em 9 de 39 sessões de julho
- Confusão real do usuário: "tem que fazer commit e push?" após correção 100% via SQL (1024479a, 06/07) — o ritual não está claro nem pra quem opera
- Bump de `APP_VERSION` tratado como checklist mental em 8 sessões

**Proposta:** uma skill `/ship` que roda a sequência inteira, decide (e explica) se `APP_VERSION` precisa subir, faz commit+push, e verifica o deploy usando o **conector Vercel MCP** (hoje disponível — `get_deployment`, `get_deployment_build_logs`) em vez de curl com sleep. Também responde "não precisa de commit" quando a mudança foi só no banco.

---

## 2. `app_state` sem fila de retry → **CORREÇÃO (app)** 🚨 ✅ IMPLEMENTADO 2026-07-06

**O padrão:** `relyon_schedules` tem journal de uploads (retry), mas **as escritas em `app_state` não têm**. Quando a escrita falha silenciosamente, o estado local e o banco divergem sem ninguém perceber.

**Evidência:**
- Incidente "banco zerado": "estou desesperado. tinha sei lá, quase 5 mil linhas já" (abc1089d, 02/07) — cutover de RLS bloqueou escrita anônima; o dado não sumiu, mas o susto foi real
- Efeito colateral no dia seguinte: instrutor demitido Erik Lima "ressuscitou" porque a gravação de `relyon_instructors` caiu na janela do incidente e nunca foi reenviada (be27f0df + 6c229f37, 03/07) — **achado ainda sem correção**
- Já em 11/06 o mesmo tipo de susto: "Deu ruim, sumiram todos os dados" (c8123719)

**Proposta:** estender o mecanismo de journal/outbox (que já existe pra `relyon_schedules`) para as escritas de `app_state`, ou no mínimo alertar o usuário na UI quando um save falhar. **Pré-requisito para qualquer nova tentativa de aperto de RLS** (SEGURANCA §8.6).

---

## 3. Preview não alcança o Supabase → **CORREÇÃO (setup)**

**O padrão:** `preview_screenshot`/`preview_eval`/`preview_snapshot` estouram timeout de 30s repetidamente. Causa dupla: (a) o sandbox do preview às vezes não alcança `*.supabase.co` ("todas as chamadas deram ERR_CONNECTION_TIMED_OUT" — 6c229f37); (b) no modo dev, o Babel-no-navegador trava a thread transpilando 1,3MB. O Claude tenta 3–4 vezes antes de desistir e validar estático.

**Evidência:** ~19 ocorrências — 9 em 7 sessões (fatia 12–17/jun), 4 (fatia 18–30/jun), 6 sessões (fatia julho).

**Proposta:** regra explícita no CLAUDE.md: *"Verificação de mudanças que dependem de dados do Supabase (login, listagens, dashboard): NÃO usar preview — validar com `node build.mjs` + `npx vitest run` + leitura de código. Preview só para mudanças de UI pura/CSS."* Uma linha de documentação elimina dezenas de tool-calls perdidos.

---

## 4. Turmas vinculadas por nome → **CORREÇÃO (app)**

**O padrão:** o vínculo entre turmas é feito por **nome**, que dessincroniza ao renomear — e cada sessão remenda um sintoma diferente da mesma raiz.

**Evidência (4+ sessões, mesma família):**
- "agora fiquei com medo... já tinhamos resolvido esse conflito. Lembra?" (e7db3f0b, 23/06) — falso conflito
- Detector bidirecional aplicado como patch (APP_VERSION 37, 23/06)
- "Vincular por semana" quebrado + disciplina cortada ao recriar turma vinculada (1024479a, 06/07)

**Proposta:** refatorar o vínculo para usar **ID de turma** em vez de nome (com migração dos vínculos existentes). Um redesenho pequeno encerra a família inteira de bugs em vez de remendar o próximo sintoma.

---

## 5. Checklist "novo tipo entra em N lugares" → **CORREÇÃO (doc)**

**O padrão:** toda vez que nasce um tipo/entidade novo (tipo de atividade, moderador EAD, competência), ele precisa aparecer em 5–6 lugares espalhados — e a primeira entrega sempre esquece algum.

**Evidência:**
- "NÃO FOI INCLUIDO A OPÇÃO EM LOCAIS" (06287d25, 15/06) — usuário apontando o gap após entrega "completa"
- Moderador EAD: 10 edits em schedule.js + reports.js numa sessão (98557917), 6 arquivos na anterior (2cc082a6)
- Tipo de atividade: constants.js + legenda coverage.js + dropdown coverage.js + constants.ts do MCP + INTERNAL_SECTOR_OPTS
- Correções de escopo parcial exigindo re-explicação com imagem (4a2a8feb, jun)

**Proposta:** seção no CLAUDE.md — *"Onde um novo tipo/entidade precisa aparecer"* — com a lista por categoria (tipo de atividade → X, Y, Z; papel de instrutor → ...). Barato e ataca a causa das entregas incompletas.

---

## 6. Higiene da memória → **AUTOMAÇÃO + CORREÇÃO**

**O padrão:** duas doenças relacionadas:
1. **Índice quebrado:** `MEMORY.md` e a skill `retomar-relyon-360` apontam para arquivos de memória que não existem mais — 4 sessões distintas tentaram `Read` em path morto (a0abc8a8, a6fe1eee, eca2e725 + skill)
2. **Alinhamentos de negócio se perdem:** "como ficou a questão do nosso alinhamento quanto o que significa a data de feriado em absenteísmo? eu te expliquei como deve ser?" → "Não tenho memória registrada de nenhum alinhamento específico" (8e3f1fa3, 17/06)

**Proposta:**
- **Correção pontual:** limpar as entradas mortas do índice e atualizar os paths da skill `retomar-relyon-360`
- **Automação:** rodar a skill existente `consolidate-memory` periodicamente (ex.: 1x/mês)
- **Hábito:** regra no CLAUDE.md — *"decisão de regra de negócio dita em conversa = gravar memória na hora, antes de codar"*

---

## 7. Fricções Windows → **CORREÇÃO (setup)**

**O padrão:** erros evitáveis do ambiente Windows/Git Bash se repetem em todas as fatias (~12 ocorrências):
- Paths POSIX vs Windows: `FileNotFoundError: '/c/Users/...'` em scripts Python (3 sessões de junho)
- Path relativo duplicado: `Path does not exist: RELYON 360 - scheduler/relyon360/js/...` quando o cwd já é essa pasta (5+ sessões)
- `cd` que não persiste entre chamadas de Bash
- `UnicodeEncodeError` por CP1252 em script Python com acentos (e2b0260f)
- `.xlsx` binário tentado via Read

**Proposta:** seção "Ambiente Windows — armadilhas" no CLAUDE.md: sempre paths absolutos; nunca path relativo em Grep/Read; `PYTHONIOENCODING=utf-8` em qualquer Python com acento; xlsx só via script Node/openpyxl.

---

## 8. MCP RelyOn: economia de tokens + defaults → **CORREÇÃO (MCP)**

**O padrão:** custo e fricção reais no uso mobile/voz:
- Consulta simples ("programação do Glauco amanhã") custou ~79KB usando a tool errada em vez de ~900 chars com a certa (99aba623) — usuário reclamou explicitamente
- `rl360_consultar_disponibilidade` estourando 63KB mesmo filtrada (1797b68c)
- `MCP error -32602` por parâmetro obrigatório faltando (`data`, `nome_instrutor`) em 2 sessões
- Connector instável: 12 timeouts seguidos numa sessão (1024479a)

**Proposta:** no servidor MCP — (a) descrições das tools orientando qual usar pra consulta pontual vs dump; (b) defaults sensatos (ex.: `data` = hoje); (c) respostas paginadas/resumidas por padrão com opção `detalhado`.

---

## 9. Scheduled task "aviso-dp" roda sem trabalho novo → **CORREÇÃO (automação)**

**Evidência:** 4 sessões idênticas em julho (362205e1, 42754d36, 4beffd4c, 55044484) do task agendado "aviso-dp-rascunho-outlook" sem nenhuma aprovação nova de Férias/Abono pra processar — ruído + consumo de créditos.

**Proposta:** adicionar early-exit barato no prompt do task ("se não houver solicitação aprovada nova desde a última execução, encerre em 1 tool call") ou reduzir a frequência do agendamento.

---

## 10. Parser xlsx padronizado pro lote periódico → **AUTOMAÇÃO**

**O padrão:** o lote mensal via planilha já tem skill (`criar-turma`) e runner (`run-batch-NNNN.mjs`), mas a leitura da planilha é re-improvisada toda vez (Read falha em binário → script ad-hoc), e os ajustes pós-gravação (trocar instrutor, tradutor, modo) geram scripts descartáveis (`refine-batch`, `rebuild-alph01`, `swap-alph02` — todos na mesma sessão 9f250863).

**Proposta:** script fixo `parse-lote.mjs` (xlsx → JSON no formato do runner) + incorporar à skill os ajustes pós-gravação mais comuns como operações nomeadas.

---

## 11. Lógica espelhada divergindo → **CORREÇÃO (app)**

**O padrão:** a mesma regra de negócio vive em 2+ lugares e diverge silenciosamente:
- `dashboard.js` usava `||` onde `constants.js`/`computeCoverage` usava `&&` na regra de "ausência dia inteiro" (421f5919, 17/06)
- Antes disso, `logic.js` (espelho de teste) já tinha divergido do app real — motivo da migração pra `core.cjs` como fonte única
- Bônus fantasma de feriado pago a 4 instrutores que não trabalharam (2b50adc5, 18/06) — "impacto muito grande" (financeiro)

**Proposta:** auditoria única mapeando toda regra que existe em 2+ módulos (ausência, bônus, conflito, competência) e consolidando em fonte única — o padrão `core.cjs` já provou que funciona.

---

## 12. Fricções observadas SEM ação recomendada → **NADA**

| Fricção | Por que "nada" |
|---------|----------------|
| `Edit: File has not been read yet` (~20 ocorrências) | Comportamento do harness; auto-corrige em 1 turno; custo unitário baixo |
| `ToolSearch` repetido pro Supabase MCP (21 de 39 sessões) | Design intencional de deferred tools; sem alavanca do lado do usuário |
| Interrupções de billing/limite no meio de operação (3 sessões) | Fora do controle do setup; mitigação já existe (journal em schedules) |
| computer-use travado em tier read/click (Chrome, DevTools) | Limitação de segurança intencional da plataforma |
| `sleep` bloqueado pelo harness (2 sessões) | O harness já aponta a alternativa (Monitor); aprendizado pontual |

---

## Próximo passo sugerido (aguardando sua aprovação)

Nenhuma dessas melhorias foi executada. Sugestão de sequência, se aprovar:
1. **Rápidos e baratos (1 sessão):** #3 + #5 + #7 (três seções no CLAUDE.md) + #6-correção (limpar índice de memória) + #9 (early-exit no task)
2. **Skill `/ship` (#1)** — maior retorno recorrente
3. **Correções de app (#2, #4, #11)** — cada uma numa sessão dedicada, com teste
4. **#8 e #10** — quando tocar no MCP/lote de novo
