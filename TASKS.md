# TASKS — RelyOn 360 Scheduler
> Backlog derivado da SPEC. Toda tarefa nova deve referenciar uma seção da SPEC.
> Última revisão: 2026-06-03 (LS leak — `.select('*')` contaminava LS com `created_at`/`updated_at`; fix com strip na fonte)

---

## Como usar
- **Novo item:** descreva o comportamento esperado (não a solução técnica)
- **Referência:** seção da SPEC que justifica o item
- **Status:** `[ ]` pendente · `[x]` concluído · `[~]` em progresso · `[!]` bloqueado

---

## ✅ Concluído (2026-06-03) — Fix LS leak: strip de `created_at`/`updated_at` no fetch e realtime (DESIGN §25)

Encerra o warning crônico `[_readLocalSchedules] N row(s) com campos não-coluna em LS — limpas (whitelist)` que disparava todo boot há meses. Causa raiz: `useSchedules` fazia `.select('*')` (que traz `created_at`/`updated_at`, fora do whitelist `_SCHEDULE_COLUMNS`) e escrevia direto no LS sem stripar. O `_readLocalSchedules` sanitizava no boot, mas a `useEffect` seguinte re-contaminava. As defesas em camadas (`_stripScheduleRow` em todo path pro SB) mantinham o banco limpo, então o bug era só ruído no console + ~50KB de lixo no LS por sessão. Arquivos: `js/config.js`, `index.html`.

- [x] **Strip no fetch paginado** (`config.js:975`): `all.concat(data.map(_stripScheduleRow))` antes de virar `cleanAll`/`merged`
- [x] **Strip no realtime handler** (`config.js:1068`): `nwClean = _stripScheduleRow(nw)` antes de usar nos branches INSERT/UPDATE
- [x] **`APP_VERSION` 2 → 3** + `?v=lsstrip1` no `index.html` (ritual de deploy §24.5)
- [x] **Verificação em produção**: pós-deploy, Ctrl+Shift+R, 5s de espera, snippet retorna 0 rows com `created_at`/`updated_at`. F5 normal subsequente sem warning no console

---

## ✅ Concluído (2026-06-02) — Portão de Versão (auto-atualização da frota) (DESIGN §24)

Encerra a classe de bug "aparelho/aba em código antigo reverte o trabalho da frota" — a peça que faltava sobre o fix server-authoritative. Cada cliente compara seu `APP_VERSION` com `app_state.app_version`; se estiver atrás, limpa o cache de código e recarrega sozinho. Arquivos: `js/config.js`, `js/app.js`, `index.html`.

- [x] **`APP_VERSION` + publicação max-vence** (`config.js`): row `app_version` semeada em `app_state` (fora de `_DB_KEYS`), publicada via `.update()` (UPDATE livre; INSERT restrito por RLS)
- [x] **Gate no boot** (`app.js` `AppLoader`): `checkVersionGate()` antes de ler/gravar dados; cliente velho limpa cache de código (preserva CDN + SW/push) e recarrega; guard anti-loop (2 tentativas → tela manual)
- [x] **Convergência de abas abertas**: re-checa a cada 2 min + focus/visibility; oculta recarrega na hora, visível mostra banner "Atualizar agora"
- [x] **Verificado em preview**: boot limpo sem reload falso · detecção stale (client 1 vs server 2) · ciclo reload+guard+recovery
- [x] **Ritual de deploy documentado** (CLAUDE.md + DESIGN §24): `APP_VERSION +1` junto com o `?v=` dos arquivos alterados

---

## ✅ Concluído (2026-05-29) — IA — Sugestão de Escala (criação de turmas em lote)

Feature de criação de escala em lote, atribuindo instrutores automaticamente (guloso + reinício aleatório keep-best, espelhando `Schedule._doInitPlan`). Acesso: `canPlan` (developer/admin/planejador). Arquivo: `js/ai.js`.

- [x] **Helpers puros de alocação** (`ai.js`): `aiPlanTurma` (mirror de `_doInitPlan`, recebe a ocupação por parâmetro), `aiBuildRows` (mirror do flatMap de `savePlan`), `aiRecalcTimes`/`aiGetLocalOpts`/`aiDayEndMin`/`aiOrderQualified`/`aiShuffle`
- [x] **Loop em lote `aiPlanBatch`** (Opção A, keep-best): ordena por data asc + escassez de instrutores; reinicia até 8× variando a escolha; mantém o arranjo com menos conflitos. Numeração via `nextClassNameG` (+1 por semana/GCC)
- [x] **Parser xlsx por POSIÇÃO** (`aiParseSheet`, SheetJS global): A=GCC · B=data · C=tradução (SIM/NÃO); cabeçalho na linha 1, dados a partir da linha 2
- [x] **Página `AiPage`**: upload .xlsx → pré-visualização (status por turma: pronta / conflito / sem instrutor / GCC inválido / sem data) → commit em lote. Guard de senha (`DateGuardModal`) quando há data no passado ou +30 dias
- [x] **Modal de criação manual** (`➕ Criar turma`): compõe a fila sem planilha — treinamento (SearchSel por nome/GCC) + data + flag tradução; adiciona várias rapidamente. Fila revisável (lista com remover/limpar) que alimenta o mesmo `aiPlanBatch`
- [x] **Fiação corrigida** (`app.js`): `AiPage` recebia só `schedules/setSchedules/trainings/instructors`; faltavam `absences/holidays/areas/user`. Sem `user`, `canPlan(undefined)` bloqueava a tela inteira ("sem permissão"). Corrigido
- [x] **Entrada formal na SPEC/DESIGN**: SPEC §5.13 reescrita pra refletir o lote real (fila xlsx + manual, prévia, commit); DESIGN documenta o hook em §2.1
- [x] **Testes Vitest dos helpers puros** — concluído 2026-06-07: 21 novos testes (AI01–AI30) cobrindo `aiShuffle`, `aiOrderQualified`, `aiDayEndMin`, `aiCellToISO`, `aiNormalizeYesNo`, `aiCellToStudents`, `aiResolveInstructorByName`. Total: 63/63 passando. `aiParseSheet`/`aiPlanTurma`/`aiPlanBatch` requerem XLSX CDN e globals de browser — fora do escopo do espelho de teste.

---

## ✅ Concluído (2026-05-29) — IA — LOG de pacotes (lotes) (SPEC §5.13.1 · DESIGN §23)

Cada lote criado vira um **pacote** persistido e reversível. Entidade `relyon_ai_packages` em `app_state` (sincronizada). Arquivo: `js/ai.js`.

- [x] **Entidade `relyon_ai_packages`**: registrada em `_DB_KEYS` (`config.js`), hook `usePersisted` + default + prop pra `AiPage` (`app.js`), allowlist do `app_state_insert` (migration `add_relyon_ai_packages_to_app_state_insert_allowlist`)
- [x] **Gravação no commit**: `doCommit` monta o pacote (versão incremental, autor, data-hora, origem xlsx/manual/misto, snapshot leve das turmas por `classId`) e o prepende ao LOG
- [x] **Seção LOG**: cards do mais recente ao mais antigo — nome/versão, origem, data-hora (`fmtDateTimeBR`), autor, nº de turmas ativas/removidas, badge de conflitos. Clique expande a lista de turmas do pacote (status + tag `(removida)` quando o `classId` saiu de `schedules`)
- [x] **Editar pacote**: renome + nota + marcar turmas pra remover (apaga da Programação via `_deleteSchedulesByClassId`). Senha (`DeleteGuardModal`) só quando há remoções
- [x] **Excluir pacote**: desfaz o lote inteiro — remove do LOG e apaga da Programação todas as turmas criadas. Irreversível, exige senha (`DeleteGuardModal`)

---

## ✅ Concluído (2026-05-27) — sessão Equipe HUET

### Refatoração da equipe de módulos HUET (DESIGN §22)
- [x] **A1 — Toggle `isHuet` por disciplina** (`trainings.js`): flag no cadastro do módulo, default off, badge 🤿 HUET na listagem; desacoplado de `training.poolBatch` (que segue como filtro do Lote Piscina)
- [x] **A2 — `isHuetModule(mod)` substitui `isPoolTeamModule(training, mod)`** (`constants.js`): nova checagem por flag do módulo; compat shim mantido pra não quebrar legado
- [x] **A3 — Exclusão de papéis por turma**: chip do papel HUET vira removível (X) no wizard e na edição; `reassignInstructorsForEdit` respeita `slot.role` em vez de impor `mod.instructorCount`
- [x] **A4 — `isLeadRole` em `reports.js` exclui Scuba/Crane** (linhas 1152 e 1322): Carga por Instrutor e IP da Semana contam só Lead Instructor (apoio operacional não inflaciona contagem)

### Camadas de proteção contra perda de dados (DESIGN §22.B)
- [x] **B2 — Freeze técnico em `reassignInstructorsForEdit`**: slot com `instructorId` salvo é preservado mesmo se o instrutor não tiver a competência exigida; recálculo só preenche slots vazios
- [x] **B3 — Validação suave**: warning ⚠ "Sem {competência}" no slot HUET quando instrutor atribuído não tem a competência exigida (sem remover)
- [x] **B4 — Wizard de backfill de competências** (`trainings.js` admin one-shot): analisa skills existentes e sugere LEAD/ASSIST/SCUBA com base no histórico; CRANE_OPERATOR fica manual
- [~] **B5 — Dry-run ao ligar `isHuet`**: revertido. Tentativa inicial (modal interceptando o toggle) quebrava o flip do toggle; tentativa secundária (banner inline rodando `analyzeHuetImpact` em cada render) quebrava a visibilidade do toggle. Código do modal/helper permanece como dead code; ativação fica protegida apenas por B1 (default off) + B2 (freeze). Reintroduzir futuramente via página admin separada (não inline na edição do módulo)
- [x] **B6 — `EditGuardModal` com senha + resumo "*"** (`components.js`): turmas com `date < today` exigem senha pra mudar local/horário/data; modal lista o diff completo das mudanças

---

## ✅ Concluído

### Login e Autenticação
- [x] Tela de login com campos usuário + senha (SPEC §5.1)
- [x] Mensagem de erro em credencial inválida
- [x] Fluxo de troca de senha obrigatória `mustChangePass` (SPEC §5.2)
- [x] Logout limpa sessão e abas abertas
- [x] Hash de senhas com bcrypt (bcryptjs, cost 8) — helpers `hashPw` / `checkPw`
- [x] Migração automática de plaintext para hash no AppLoader

### Roles e Controle de Acesso
- [x] Roles de Usuário: `developer`, `admin`, `planejador`, `customer_service` (SPEC §2.1)
- [x] Role de Cliente: `instructor` com experiência separada (SPEC §2.2)
- [x] Permissões granulares (`PERMISSIONS_LIST`) e `hasPermission()` em runtime (SPEC §4.6)
- [x] Guard de senha em ações destrutivas (excluir, editar áreas, resetar)

### Programação (SchedulePage)
- [x] Listagem de turmas com busca por nome e GCC (SPEC §5.4 / Step 0)
- [x] Cards expansíveis com disciplinas por dia
- [x] Wizard de criação de turma — Step 1 (SPEC §5.4 / Step 1)
- [x] Planejamento automático — Step 2 com drag & drop (SPEC §5.4 / Step 2)
- [x] Edição de turma existente — Step 3 (SPEC §5.4 / Step 3)
- [x] Exclusão de turma com guard de senha (SPEC §4.6)
- [x] Fix: primeiro módulo inicia às 08:00 (SPEC §4.1)
- [x] Fix: `instructorCount > 1` gera N slots simultâneos por módulo (SPEC §4.3 / §3.3)
- [x] Fix: mesmo instrutor priorizado ao longo do treinamento (SPEC §4.3)
- [x] Fix: `preferredLocals` keyed por `mod.id` — respeita `mod.locals[]` (SPEC §4.4)
- [x] Sistema de abas (até 5) — sobrevivem a troca de página e a F5 (SPEC §5.4 / DESIGN §8.1)
- [x] Visão Semanal — calendário Seg–Dom com navegação entre semanas (SPEC §5.4 / DESIGN §7.1)
- [x] Mover módulo entre dias no Step 2 (SPEC §5.4)
- [x] Slot de Tradutor por módulo no Step 3 (SPEC §4.3)

### Visão do Instrutor (Cliente)
- [x] `InstructorDashboard` — bloco Hoje, timeline visual, pendências (SPEC §5.5)
- [x] Botão "Confirmar Ciência" individual e "Confirmar tudo hoje" (SPEC §4.5)
- [x] Botão "Reportar Problema" com `issueLog[]` (SPEC §3.7)
- [x] `InstructorProfile` — dados pessoais, competências, troca de senha (SPEC §5.5)
- [x] `ReportsPage` modo instrutor — "Meu Histórico" com grid Manhã/Tarde/Noite (SPEC §5.5)
- [x] **Relatório CLT Noturno** — aba extra para `contract === "CLT"` listando aulas com `startTime >= 17:00` no período (SPEC §5.5) — tabela detalhada + total de dias + PDF estilo UTILIZATION
- [x] **Relatório Freelancer Dias Trabalhados** — aba extra para contratos Freelancer/Prestador/PJ listando dias com aula registrada + função exercida (Inst. Líder, Tradutor, Scuba Diver, etc.) + chips de frequência de funções + PDF estilo UTILIZATION (SPEC §5.5)

### Dashboard (Usuário)
- [x] StatCards: Hoje, Próximos, Confirmados, Pendentes, Treinamentos (SPEC §5.3)
- [x] Card "Salas Teóricas" com contagem de livres por turno (SPEC §5.3)
- [x] Seção "Problemas Reportados" com timeline e botão "Ciente" (SPEC §5.3)
- [x] `LocalsReportPage` — disponibilidade de locais por data e turno (SPEC §5.14)

### Treinamentos (TrainingsPage)
- [x] CRUD completo de treinamentos e módulos com drag-reorder (SPEC §5.6)
- [x] Flag EAD com `LocalsSelector` adaptado (SPEC §3.3a / DESIGN §10.1)
- [x] Campo `shortName` para prefixo de nome de turma (DESIGN §7.2)
- [x] "Quem faz o quê?" — drill-down instrutor por disciplina (DESIGN §10.2)
- [x] Busca unificada por GCC, shortName e nome (`SearchSel` + `keywords`) (DESIGN §8.4)

### Instrutores (InstructorsPage)
- [x] Lista em acordeão por área com filtros (SPEC §5.7)
- [x] Detalhe com dados pessoais e habilidades
- [x] Edição inline sem perda de foco (DESIGN §4.2)
- [x] Multi-seleção de competências no painel de adição (DESIGN §7.3)
- [x] Reset de senha de instrutor (volta para padrão + `mustChangePass: true`)

### Ausências (AbsenteismoPage)
- [x] CRUD de ausências com três tipos e categorias (SPEC §5.8 / §4.7)
- [x] Suporte a ausência parcial (hora) e dia inteiro
- [x] Integração com `initPlan` — instrutor ausente não é sugerido (SPEC §4.3)

### Usuários (UsersPage)
- [x] CRUD completo com senhas hasheadas (SPEC §5.9)
- [x] Validação de username único cruzando `users` + `instructors`
- [x] Reset de senha (`mustChangePass: true`)
- [x] Permissões granulares por checkboxes (quando role = `planejador`)
- [x] Dropdown "Instrutor Vinculado" (`linkedInstructorId`) (DESIGN §9)

### Áreas (SettingsPage)
- [x] CRUD completo de áreas com cor, líder, e-mail e WhatsApp (SPEC §5.10)
- [x] Guard de senha para salvar/deletar

### Locais (LocalsPage)
- [x] CRUD completo de locais com guard de senha (SPEC §5.11 / DESIGN §8.2)
- [x] 8 grupos de locais com filtro e busca

### Relatórios (ReportsPage)
- [x] Aba Utilização — matriz visual Instrutores × Períodos (SPEC §5.12)
- [x] Aba Carga Horária — grade de ocupação por instrutor (SPEC §5.12)
- [x] Aba Cursos — contagem de turmas por treinamento (SPEC §5.12)
- [x] Aba Salas — ocupação de salas por dia com exportação PDF (SPEC §5.12)
- [x] Aba Programação da Turma — linha do tempo com exportação PDF (SPEC §5.12)
- [x] Aba Horas por Instrutor — breakdown Teoria/Prática/Outras + exportação PDF (DESIGN §10.3)
- [x] Aba Class Planning — filtro de 1 dia → semana Seg-Dom, agrupamento por `classId`, coluna PERÍODO com início/término reais, header de PDF "SEMANA · DIA SELECIONADO" (SPEC §5.12 / DESIGN §19) — 2026-05-20

### Persistência e Infraestrutura
- [x] Migração para Supabase (tabela `app_state`, projeto `snpvqqsmwrlazawjknme`)
- [x] `usePersisted` com proteção de primeiro render e `SaveMonitor` com toast de erro
- [x] `window.__resetRelyOn360()` protegido com senha de developer (exige `checkPw` contra `_liveData.relyon_users`)
- [x] `alert()` removido do `usePersisted` — erro de persistência tratado apenas pelo toast do `SaveMonitor`
- [x] Download automático no `beforeunload` removido — `window.__exportBackup()` disponível para download manual
- [x] `window.__exportBackup()` para download manual do estado completo
- [x] Migrações automáticas no AppLoader (hash de senhas, renomear locais, normalizar skills)
- [x] RLS no Supabase — DELETE bloqueado, INSERT restrito às 7 chaves (DESIGN §10.6)
- [x] Service Worker network-first com cache de CDN (DESIGN §10.4)
- [x] Split em 14 arquivos JS — index.html como shell de 59 linhas (DESIGN)
- [x] Identidade visual / branding — anel dourado, ícones PWA, tela de loading (DESIGN §10.5)
- [x] **`useSchedules` — tabela dedicada `relyon_schedules` + Realtime + diff-based persistence** (DESIGN §11.1) — concluído 2026-04-28
- [x] **Fix trigger `trg_notify_instructor_push`** — perda de dados: trigger com `net.http_post` errado causava rollback em todos os INSERTs; recriado com `EXCEPTION WHEN OTHERS THEN NULL` (DESIGN §11.2) — concluído 2026-04-28
- [x] **Fix stale closures em `setSchedules`** — 7 call sites em 5 arquivos convertidos para `prev =>` (DESIGN §11.3) — concluído 2026-04-28
- [x] **Sessão persistida (Keep Me Logged In)** — `localStorage[rl360_session]` sobrevive a fechamento do browser (DESIGN §11.4) — concluído 2026-04-28
- [x] **Fix Realtime ID type mismatch** — `String(r.id)` normaliza number vs string no canal Supabase (DESIGN §2.3) — concluído 2026-04-28
- [x] **Testes automatizados — 24 testes via Vitest** — `logic.test.js` cobre todas as funções puras de `logic.js`; `npm test` passa em 100% — concluído 2026-04-28

### Agente
- [x] `test_agent.py` — subagente de testes: roda Vitest, parseia resultado, reporta via Gemini Flash
- [x] **Implementar o Agente Scheduler (Fritz)** — backend orquestrador construído no repositório `Fritz/`

### Qualidade de Código / UX
- [x] **Remover stat cards do Meu Histórico do instrutor** (SPEC §5.5) — `ReportsPage` já renderiza apenas o grid visual

---

## 🔄 Em Progresso

### Sessão 2026-05-18 — UX Adaptativo do Dashboard do Instrutor (SPEC §5.5 / DESIGN §18)

- [x] **Frente 1 — Linha "agora" na timeline** (DESIGN §18.5)
  - Linha vermelha 1px + círculo na ponta esquerda; atualiza a cada 60s; só em dia=hoje
  - Scroll automático silencioso (`behavior:auto`) até a linha em mobile/iPad
- [x] **Frente 2 — Card de módulo com Ciente expansível** (SPEC §5.5.2 / DESIGN §18.3)
  - Compacto → expandido inline; botão "Confirmar ciência" dentro do expandido (força leitura)
  - Estados visuais: borda amarela pendente · neutro ciente · tag "atualizado" pós-mudança
  - Equipe completa no expandido (inclusive próprio instrutor)
- [x] **Frente 3 — Central de Notificações** (SPEC §5.5.1 / DESIGN §18.2)
  - Nova tabela `relyon_notifications` no Supabase
  - Sino com badge no topbar; painel desliza (desktop) / tela cheia (mobile)
  - Geração client-side em `savePlan`/`saveEditItems`/`deleteClass`
  - Tipos: new_module · module_changed · module_cancelled · broadcast
  - Aberta = lida (auto-marca `read_at`)
- [x] **Frente 4 — Toggle de semana + auto-foco** (DESIGN §18.4)
  - Controle `◀ Semana N · DD a DD ▶` no topo do dashboard
  - Navegação ilimitada futuro/passado; botão "Hoje" condicional
  - Auto-foco na próxima semana a partir de quinta-feira às 18:00
- [x] **Frente 5 — Tela "Minhas confirmações"** (SPEC §5.5 / DESIGN §18.6)
  - Nova entrada `my-confirmations` no sidebar do instrutor
  - Lista cronológica decrescente de schedules confirmados; filtro por mês

---

## ✅ Concluído (2026-05-22) — sessão Comunicação

### Feature: Canal de Requisições Instrutor ↔ Planejador (SPEC §3.9 / §5.15)

> Substitui a comunicação informal (WhatsApp, telefone) de folga/férias por fluxo rastreável com log de aprovação e geração automática de ausência.

- [x] **Bug crítico — `instructorId` corrompido como `"undefined"`** (SPEC §5.15.3 / DESIGN §21.1) — concluído 2026-05-22
  - Causa raiz: `auth.js:92` monta `user = {...instr, role:"instructor"}` (sem `instructorId`); `communication.js` lia `user.instructorId` (undefined) ao filtrar e ao salvar.
  - Sintoma: todo instrutor enxergava as requisições de todos os outros (todas batiam por `String(undefined) === String(undefined)`).
  - Fix: 4 ocorrências convertidas para `user.id` (filtro `myRequests`, criação normal e fluxo "Estou doente").

- [x] **Bug — Developer não enxergava aba "Gestão"** (SPEC §5.15 / DESIGN §21.2) — concluído 2026-05-22
  - Causa: `isAdm = user.role === "admin"` excluía `developer` do gate de Gestão.
  - Fix: substituído por `canPlan(user)` (developer | admin | planejador). Coerente com helpers já usados na Sidebar.

- [x] **UX — Aba "Requisição" exclusiva do Instrutor** (SPEC §5.15) — concluído 2026-05-22
  - Planejador/Admin/Developer entram direto em "Gestão"; não há mais a aba confusa "Todas as solicitações" sem botões.
  - Instrutor continua vendo apenas "Requisição" (formulário + histórico próprio).

- [x] **Log de decisão — aprovação e rejeição** (SPEC §3.9 / §5.15.2) — concluído 2026-05-22
  - Campos novos no objeto `request`: `approvedAt`, `approvedBy`, `approvalFeedback`, `rejectedAt`, `rejectedBy` (`rejectionReason` já existia).
  - Card mostra bloco colorido com "Aprovada/Rejeitada por <nome> · DD/MM/YYYY HH:MM" + feedback/motivo.

- [x] **Modal de aprovação com campo de feedback opcional** (SPEC §5.15.2) — concluído 2026-05-22
  - `ApproveModal` substitui o antigo `ApproveWithDateModal`. Sempre abre na aprovação (antes só abria para tipos `period === "none"`).
  - Pré-preenche período da requisição; só permite editar datas para tipos `none` ("Estou doente", "Outro motivo").
  - Campo "Feedback ao instrutor (opcional)" — Planejador pode confirmar sem digitar.

- [x] **Toggle de prioridade nas pendentes** (SPEC §3.9 / §5.15.2) — concluído 2026-05-22
  - Botão 📌 Priorizar / Despriorizar visível no card de cada requisição pendente (não aparece em aprovada/rejeitada).
  - Prioritárias sobem ao topo da lista "Aguardando" com borda laranja.

- [x] **3 seções na Gestão ordenadas por data de decisão** (SPEC §5.15.2) — concluído 2026-05-22
  - "Aguardando" ordena por `createdAt`; "Aprovada" por `approvedAt`; "Rejeitada" por `rejectedAt`.
  - Contador `(N)` em cada filtro.

- [x] **Migração automática de IDs legados** (SPEC §5.15.3 / DESIGN §21.3) — concluído 2026-05-22
  - `React.useEffect` na montagem da `ComunicacaoPage` detecta `instructorId` inválido (`""`, `"undefined"`, `"null"`, `"NaN"`, `null`) e procura o instrutor por `instructorName`.
  - Idempotente — guard `if (!needsFix)` evita loop; só dispara `setRequests` quando há mudança real.

- [x] **Cache-buster**: `communication.js?v=cov1` → `cov2`

- [x] **Documentação**: SPEC §3.9 (entidade), §4.6 (controle de acesso), §5.15 (tela + sub-seções), §6 (chave `relyon_requests`); DESIGN §21 (novo)

---

## ✅ Concluído (2026-05-20) — sessão offline-first

### Resiliência de `relyon_schedules` (DESIGN §20)

> Motivado pelo incidente 2026-05-20: Matheus perdeu uma programação do dia após Ctrl+Shift+R. Causa-raiz exata não identificada; o sistema antes era estruturalmente frágil.

- [x] **Rede de segurança de id em `setSchedules`** (DESIGN §20.2)
  - Toda row sem id ganha id via `newScheduleId()` antes da persistência, com `console.warn`. Cobre o caso "null value in column id".
- [x] **Fase 1 — Espelho em localStorage** (DESIGN §20.2)
  - `localStorage[rl360_relyon_schedules]` gravado sincronamente antes de cada upsert
  - Boot lê LS primeiro (paint imediato); fetch paginado faz reconciliação e reempurra rows que estavam só em LS
  - Realtime channel também grava LS após aplicar INSERT/UPDATE/DELETE remoto
- [x] **Fase 2 — Outbox com retry e backoff exponencial** (DESIGN §20.3)
  - `localStorage[rl360_schedules_outbox]` persistente
  - Ops: `insert`, `update`, `delete`, `delete-by-class`
  - Backoff: 2s → 8s → 30s → 2min → 10min → 30min (clamp)
  - `_persistSchedules` refatorado: cada bloco tenta isoladamente, falhas viram ops na outbox em vez de abortar o diff
  - `_deleteSchedulesByClassId` também enfileira em erro
  - Detecção de RLS / auth → status `failed-rls`, sem retry automático
  - LWW como trade-off explícito (DESIGN §20.4): `insert` vira `upsert`, `update/delete` em row inexistente = no-op silencioso
  - Triggers de flush: boot+3s, `online`, `focus`, sucesso de outra escrita, timer de backoff, manual via badge
  - APIs globais: `__outboxStats`, `__outboxList`, `__outboxFlush`, `__outboxClear`
- [x] **Fase 3 — Badge persistente + beforeunload** (DESIGN §20.5, §20.6)
  - `SaveMonitor` reescrito com 5 estados: `offline`, `failed-rls`, `pending`, `saving`, `synced`
  - Click no badge abre painel com top-8 ops (tipo · idade · tentativas · permissão) + botão "Sincronizar agora"
  - Polling 2s + reação a `onSaveEvent` + listeners `online`/`offline`
  - `beforeunload` guard só dispara prompt quando há pendências reais — zero atrito em uso normal
- [x] **Cache-buster**: `config.js?v=cov13`, `app.js?v=cov7`
- [x] **Documentação**: DESIGN.md §20 (completo), §2.3 (cross-ref), datas dos cabeçalhos

**Limites conhecidos (DESIGN §20.9):**
- Causa-raiz da falha original não foi investigada — o sistema protege contra perda, não diagnostica.
- Sem cap explícito na fila: console.error a partir de 50 ops, mas continua aceitando.
- Realtime channel não tem fallback (subscription cair = updates de outros clientes perdidos até refresh).

---

## ✅ Concluído (2026-05-02) — sessão 4

### Bug crônico — Programação não desaparece quando excluída
- [x] **Causa raiz: `relyon_schedules` sem PRIMARY KEY + id float8** (DESIGN §16) — concluído 2026-05-02
  - Sintoma: usuário exclui turma, dado some da UI, mas no F5 volta. Tentativa repetida (10+ vezes) não resolvia.
  - Diagnóstico: coluna `id` era `double precision` sem PK; IDs gerados como `Date.now() + Math.random()` perdiam precisão no transit JS↔Postgres↔Realtime; `DELETE WHERE id IN (...)` retornava 0 rows silenciosamente; INSERTs subsequentes acumulavam batches zumbis (CBSP - 01 tinha 46 rows distribuídas em 3 saves consecutivos).
- [x] **Limpeza de dados zumbis** — concluído 2026-05-02
  - Backup completo da tabela em `relyon_schedules_backup_20260502` (192 rows)
  - DELETE de todas as 46 rows da CBSP - 01
  - DELETE da chave zumbi `app_state['relyon_schedules']` (sobra de migração antiga)
- [x] **Migração de schema `relyon_schedules_id_bigint_with_pk`** (DESIGN §16) — concluído 2026-05-02
  - Coluna `id` migrada de `double precision` → `bigint NOT NULL`
  - Adicionado `PRIMARY KEY (id)` — postgres agora rejeita duplicatas e DELETE/UPDATE por id são confiáveis
  - 146 rows pós-limpeza migradas com IDs sequenciais derivados de `created_at`
- [x] **Helper `newScheduleId()` em config.js** (DESIGN §16) — concluído 2026-05-02
  - Substitui `Date.now() + Math.random()` (float) por `Date.now() * 1000 + (counter % 1000)` (bigint-safe)
  - Aplicado em 5 sites: `schedule.js` linhas 41, 136, 309, 575 e `ai.js` linha 26
- [x] **Helper `_deleteSchedulesByClassName(cls)` em config.js** (DESIGN §16) — concluído 2026-05-02
  - Faz DELETE explícito por `className` no Supabase (bypassa o diff por id)
  - Usado em `deleteClass` (defesa garantida) e `saveEditItems` (limpa rows velhas antes do INSERT)
  - Enfileirado na mesma `_persistQueue` para evitar race com outras mutações

---

## ✅ Concluído (2026-05-02)

### Qualidade / Correções
- [x] **Fix numeração de turmas — `trainingId` type mismatch** (DESIGN §15.1) — concluído 2026-05-02
  - `turmasSemana` usava `!==` direto entre `s.trainingId` (string vinda do Supabase) e `selTraining.id` (number) → sempre vazio → contador sempre reiniciava em 01
  - Corrigido para `String()` em ambas as ocorrências; `outrasturmas` já usava `String()` corretamente
- [x] **Fix `initPlan` — não sugerir instrutores ocupados em outra turma** (SPEC §4.3 / DESIGN §15.2) — concluído 2026-05-02
  - Filtro `qualified` e `tradPool` agora incluem `!checkSlotConflict(...).instrConflict` — instrutor com conflito de agenda é excluído antes da seleção automática
  - Step 2: tag "⚠ Indisponível" em vermelho quando o slot ficou vazio por falta de instrutor disponível
- [x] **Fix legibilidade de opções no dropdown de instrutor** (DESIGN §15.3) — concluído 2026-05-02
  - `<option>` disponíveis não tinham `color` explícito → herdavam `#475569` do `<select>` → ilegível no dropdown nativo do SO
  - Corrigido com `style={{color:"#111"}}` nos options disponíveis do Step 2 e Step 3
- [x] **Step 3 — dropdown de instrutor/tradutor com agrupamento disponível/indisponível** (SPEC §4.3 / DESIGN §15.4) — concluído 2026-05-02
  - Replicado o mesmo padrão do Step 2: pool livre + seção "─── Indisponíveis ───" com cores vermelha/azul
  - Feriados mostram 🏖 em ciano; ocupados mostram ⚠ nome · `className` em vermelho
  - "⚠ Ocupado" tag abaixo do select passa a incluir o nome da turma conflitante
  - Local dropdown do Step 3 também ganhou split livre/ocupado com nome da turma conflitante
  - Implementado via helpers `_isUnavailEdit`, `_getOcupacaoLabelEdit`, `_getFeriadoLabelEdit` dentro do `.map()` de `dayItems`
- [x] **Fix `sortModules` runtime — REVISÃO na ordem correta** (SPEC §4 / DESIGN §14.1) — concluído 2026-05-02
  - `sortModules` local de `schedule.js` (sem `isRevisao`) removido; versão canônica declarada em `constants.js` (global, igual ao padrão de `isHoliday`)
  - Ordem garantida: regulares → REVISÃO → PROVA → TEMPO RESERVA
  - `logic.js` mantém sua própria versão exportada para os testes (as duas agora são idênticas)
  - Afeta apenas turmas sem Modo de Sequência (FASE 3) — com modo, `selectedMode.moduleOrder` é usado diretamente
- [x] **Fix `addMode` — botão "Adicionar Modo" não fazia nada** (DESIGN §14.2) — concluído 2026-05-02
  - Causa raiz: `sortModules` não era global → `ReferenceError` silencioso em `trainings.js`
  - Corrigido junto com §14.1; comportamento novo: duplica ordem do Modo 1 existente (ou usa `sortModules` padrão no primeiro modo)

---

## ✅ Concluído (2026-04-30)

### FASE 6 — Calendário de Feriados Regional
- [x] **Entidade global `relyon_holidays`** (SPEC §4.8) — concluído 2026-04-30
  - Tabela `app_state` ganha 7ª chave; RLS `app_state_insert` atualizada via migration `rls_app_state_allow_relyon_holidays`
  - `_DB_KEYS` em `config.js` inclui `relyon_holidays`; `_SYNC_LABELS` em `admin.js` também
  - `__resetRelyOn360` (config.js) limpa a chave junto com as outras

- [x] **Helper `isHoliday(date, instr, holidays)`** (DESIGN §11.5) — concluído 2026-04-30
  - Regra: nacional aplica a todos; estadual exige `instr.state`; municipal exige `instr.state E instr.city`
  - Instrutor sem state/city é afetado apenas por feriados nacionais
  - Exportado em `logic.js` (testes) e declarado em `constants.js` (runtime)
  - 5 novos testes (H01-H05) em `logic.test.js` — `npm test` passa em 32 testes

- [x] **Migração one-shot do tipo `feriado`** (FASE 1 → FASE 6) — concluído 2026-04-30
  - AppLoader detecta absences com `type:"feriado"` e converte para `holidays` (scope:"national", deduplicado por data)
  - Tipo `feriado` removido de `ABSENCE_TYPES`; categorias removidas de `FULL_DAY_CATEGORIES`
  - Idempotente — roda só se houver absences a migrar

- [x] **Campos `state` e `city` no instrutor** (SPEC §4.8) — concluído 2026-04-30
  - Adicionados ao `newForm` e `pForm` em `InstructorsPage` (criar e editar)
  - `BR_STATES` em `constants.js` para o select de UF
  - Texto explicativo: "UF e cidade definem quais feriados regionais afetam este instrutor"

- [x] **Página `HolidaysPage` (CRUD)** (SPEC §4.8) — concluído 2026-04-30
  - Acessada por developer/admin via Sidebar → Configurações → Feriados
  - Filtro por ano; lista ordenada por data
  - Form pede data, nome, scope; campos `state`/`city` aparecem condicionalmente
  - Guard de senha para criar/editar/excluir (mesma lógica de SettingsPage)
  - Bandeira informativa explicando como cada scope afeta os instrutores

- [x] **Integração com `initPlan` e Step 2** (SPEC §4.8) — concluído 2026-04-30
  - `qualified` em `initPlan` filtra também por `!isHoliday(...)` (lead, assistentes e tradutor)
  - `getFeriadoLabel` no Step 2 reescrito: usa `isHoliday(item.date, instr, holidays)` e mostra `🏖 {nome}`
  - Helper `isUnavail(i)` consolida `isOcupado || isInstructorAbsent || isHoliday`

- [x] **Banner de feriado nas visões calendário** (DESIGN §11.5) — concluído 2026-04-30
  - `WeeklyCalendarView`: header do dia com feriado nacional fica cyan; legenda no rodapé do header com nome do feriado; tooltip lista todos os feriados aplicáveis
  - `GroupCalendarView`: chips cyan acima das colunas listando todos os feriados do dia (nacional/estadual/municipal)

- [x] **Coluna "Horas em Feriado" em Reports** (DESIGN §11.5) — concluído 2026-04-30
  - `ReportsPage` recebe prop `holidays`; aba "Horas por Instrutor" calcula `holidayMins` por schedule cuja data é feriado aplicável ao instrutor
  - UI mostra `🏖 Xh em feriado` no header e como tag no card individual quando > 0
  - Exportação PDF ganha coluna "🏖 Feriado" e linha de subtotal

---

## ✅ Concluído (2026-04-29)

### Qualidade / Correções
- [x] **`sortModules` — REVISÃO respeita ordem** — concluído 2026-04-29
  - `isRevisao` adicionado: módulos com "REVISÃO" (inclusive nomes compostos como "CACI - REVISÃO") vão entre regulares e PROVA
  - Ordem final: regulares → revisão → prova → tempo reserva
  - 2 novos testes S05/S06 em `logic.test.js`
- [x] **Tradutor auto-atribuído no `initPlan`** — concluído 2026-04-29
  - `committedTrad[]` prioriza o mesmo tradutor ao longo do treinamento
  - Slot de tradutor no Step 2 ganhou visual cyan + placeholder "🌐 Tradutor..." (igual ao Step 3)
- [x] **Bug autocomplete de senha no `DeleteGuardModal`** — concluído 2026-04-29
  - Campo oculto `autoComplete="username"` recebia `readOnly` sem `value` — browser vazava username no próximo input
  - Corrigido: `value={user?.username || user?.name}` + `onChange={() => {}}` fecha o par corretamente

### Absenteísmo
- [x] **Feriado — tipo de ausência sem impacto em KPI** (FASE 1) — concluído 2026-04-29 · **superado pela FASE 6 em 2026-04-30**
  - Tipo `feriado` em `ABSENCE_TYPES` foi a primeira tentativa; tratava feriado como ausência por instrutor.
  - **Migrado para entidade global** `relyon_holidays` (FASE 6) com lógica regional. AppLoader faz a migração one-shot dos registros antigos.

### Programação — Wizard
- [x] **Horário Normal vs. Horário Livre** (FASE 2) — concluído 2026-04-29
  - Já existia `defaultSchedule: boolean` no cadastro do treinamento; comportamento agora é completo
  - Step 2: quando `defaultSchedule = false`, cada disciplina ganha `<input type="date">` e dois `<input type="time">` editáveis (start/end)
  - `applyDaySchedule` é pulado em `sortByDateTime`/`reorderEdit`/`moveToDay` quando treinamento é horário livre — preserva horários manuais
  - Botão "↺ Recalcular" escondido nos modos livres (Step 2 e Step 3)
  - Mensagem de orientação adaptada: "Horário personalizado · Não há quebra automática de almoço"

- [x] **Modos de Sequência por número da turma** (FASE 3) — concluído 2026-04-29
  - Novo campo `modes: [{ id, label, moduleOrder: [moduleId...] }]` no treinamento
  - UI no detalhe do treinamento: card "Modos de Sequência" com adicionar/remover/renomear modos e setas ↑↓ para reordenar módulos
  - Apenas treinamentos com `defaultSchedule !== false` e que têm módulos exibem a seção
  - Ao adicionar modo novo, ordem inicial = `sortModules(modules)` (regulares → revisão → prova → reserva)
  - Wizard Step 1: dropdown "Modo de Sequência" aparece quando `selTraining.modes.length > 0`
  - Auto-detecção: número final da turma (CBSP - 02 → Modo 2) seleciona automaticamente; usuário pode override manualmente
  - `initPlan` usa `selectedMode.moduleOrder` em vez de `sortModules` quando modo escolhido (explícito ou auto)

- [x] **Turmas Fundidas — vínculo entre turmas** (FASE 4) — concluído 2026-04-29
  - Cada `schedule` row pode ter `linkedClassNames: string[]` — replicado em todas as rows da turma ao salvar
  - Helper `getLinkedClassNames(className)` lê o vínculo da primeira row daquela turma
  - `checkSlotConflict` e `detectConflicts` aceitam parâmetro `linkedClassNames` — turmas vinculadas não disparam conflito de instrutor/local
  - Step 3: botão "🔗 Vincular" abre modal com lista de outras turmas (checkbox); vínculo é bidirecional (A↔B atualizado em ambos os lados)
  - Visual cyan no botão quando há vínculos ativos

- [x] **Grade Paralela — visualização multi-turma em colunas** (FASE 5) — concluído 2026-04-29
  - Novo componente `GroupCalendarView` em `dashboard.js` (fora de `Schedule` — regra de estabilidade §4.2)
  - Toggle "Grupo" na barra de modos (ao lado de Lista / Semana)
  - Navegação por dia com setas ◀ / ▶ e botão Hoje
  - Para cada dia, colunas = turmas com aulas naquele dia; cabeçalho usa `shortName` do treinamento (fallback: primeiros 10 chars do `className`)
  - Linhas dentro da coluna = blocos de horário com módulo + instrutor + local
  - Conflitos visuais: instrutor ou local repetido em duas colunas não-vinculadas no mesmo intervalo → célula com borda vermelha + "⚠"
  - Indicador de vínculo no header da coluna: "🔗N" quando a turma tem N vínculos
  - Click no header abre Step 3 (mesma lógica de `WeeklyCalendarView`)

---

## ✅ Concluído (2026-05-15) — sessão 6

### Lote Piscina — Planejamento Paralelo de Eventos
- [x] **Flag `poolBatch` no cadastro do treinamento** (DESIGN §17.2) — concluído 2026-05-15
- [x] **Componente `PoolBatchPage` em `js/poolbatch.js`** (DESIGN §17.4) — concluído 2026-05-15
  - Grid turnos 2h, conflito de local, módulos multi-slot
- [x] **Drag-and-drop** (DESIGN §17.6) — concluído 2026-05-15
  - Drag de coluna reordena visualmente; drag de módulo atualiza `startTime`/`endTime` via `setSchedules`
- [x] **Roteamento e sidebar** (DESIGN §17.7) — concluído 2026-05-15
  - `pool-batch` em `app.js`; item "Lote Piscina" na sidebar; `sessionStorage[rl360_pool_batch_date]`

---

## ✅ Concluído (2026-05-04) — sessão 5

### Relatórios — Class Planning (Fase 2)
- [x] **Remover coluna TREINAMENTO** (`reports.js` — aba `classplanning`) — concluído 2026-05-04
- [x] **Fix PERÍODO — exibe datas reais da turma** (`reports.js`) — concluído 2026-05-04
  - `allClassDates` calculado de todos os `schedules` (sem filtro de data); o filtro de período só afeta MANHÃ/TARDE/NOITE
- [x] **MANHÃ/TARDE/NOITE — mostrar só instrutor líder** (`reports.js`) — concluído 2026-05-04
  - `isLeadRole` filtra `"Assistant Instructor"` e `"Translator"` em `getPeriodGroups`
- [x] **Class Planning cabe em A4 paisagem** (`reports.js` — só `printClp`) — concluído 2026-05-04
  - `@page{size:A4 landscape;margin:10mm}`, `table-layout:fixed`, `<colgroup>` com larguras mm, fonte 9px, chips viram texto inline

---

## 📋 Backlog — Alta Prioridade (sessão 5 — 2026-05-02)

---

### Relatórios — Planejamento de Turmas MARINHA (nova aba)

- [x] **Front implementado** — UI, navegação por semana e PDF existem (`reports.js`) — concluído antes de 2026-05-15
- [x] **Bug fix: filtro não retornava dados** (`reports.js` + `app.js`) — concluído 2026-05-15
  - Causa: `t.area` é `areaId` numérico; `/marinha/i.test(t.area)` nunca batia
  - Fix: resolver nome via `(areas||[]).find(a => a.id === t.area)?.name`
  - `areas` adicionada como prop em `ReportsPage` (ambos `app.js` e `reports.js`)

---

## 📋 Backlog — Alta Prioridade

- [x] **Convergência multi-dispositivo suave — Opção 2: auto-revalidação no foco** (DESIGN §24/§25) — concluído 2026-06-07
  - Ao recuperar foco / `visibilitychange` → visível após ≥ 5 min oculto, `app.js` chama `__revalidateFromSupabase()` que re-fetcha todos os `_DB_KEYS` do Supabase e emite evento `rl360_revalidate`.
  - `usePersisted` escuta o evento: compara via `JSON.stringify`; se o dado mudou, atualiza LS + React state sem reload forçado.
  - Re-hidrata tombstones no mesmo ciclo → turmas excluídas em outro device não ressuscitam na reconciliação local.
  - Schedules continuam cobertos pelo canal Realtime (reconecta automaticamente).
  - Revogar sessões continua disponível como recurso de emergência; para uso normal (troca de device) não é mais necessário.
  - Arquivos: `config.js` (`_revalidateFromSupabase`, evento `rl360_revalidate`, listener em `usePersisted`), `app.js` (tracking de `hiddenAt`, threshold 5 min)

- [x] **Build step (esbuild) — fim do ritual `?v=` manual** — concluído 2026-06-05 (PR #16)
  - esbuild concatena + transpila os 18 módulos → 1 bundle hasheado `app.[hash].js` em `dist/`. Hash muda automaticamente com o código → cache invalida sozinho. Babel saiu do navegador. `APP_VERSION`/portão ficam como rede de segurança.

- [x] **Justificativa obrigatória ao excluir turma** (SPEC §4.6 / §5.4) — concluído 2026-06-07
  - `DeleteGuardModal` ganhou picker de radio com 3 opções (`ALUNO NÃO VEIO`, `TURMA CANCELADA PELO SOLICITANTE`, `CANCELAMENTO NA CRIAÇÃO (SEM IMPACTO)`). Botão Confirmar desabilitado até escolher motivo.
  - Motivo persistido no tombstone (`relyon_class_tombstones`) como `{ts, reason, className, deletedBy}` — disponível globalmente por 7 dias (Supabase) e 4h localmente. Viewer na tela Sobre → "Log de Exclusões de Turmas" (`DeletionLogPanel`).
  - Arquivos alterados: `components.js`, `schedule.js`, `config.js`, `admin.js`

- [x] **Locais internos — ALMOXARIFADO e OFICINA DE MERGULHO** — concluído 2026-06-07
  - Diagnóstico: ambos existiam apenas no localStorage do dispositivo do usuário (não estavam no Supabase). ALMOXARIFADO aparecia localmente; OFICINA DE MERGULHO não aparecia em nenhum lugar.
  - Fix: adicionados diretamente via SQL ao array `relyon_locals` no Supabase (id 70 = OFICINA DE MERGULHO, id 71 = ALMOXARIFADO, type "Interno", env "—"). Disponíveis globalmente após próximo reload.
  - Comportamento esperado: locais Internos aparecem SOMENTE na Cobertura Diária (por design — o LocalsSelector de módulos de treinamento os exclui explicitamente).

---

## 📋 Backlog — Média Prioridade

- [x] **Step 3 — Drag-and-drop duplica disciplinas** — resolvido 2026-05-15
- [x] **Wizard Step 1 — Nome da Turma editável (número livre)** — resolvido 2026-05-15

- [x] **Detecção de conflitos (Instrutor e Local) no Wizard** (SPEC §4.3 / §4.4) — concluído 2026-04-24
  - `checkSlotConflict` varre `schedules` em tempo real; borda vermelha + "⚠ Ocupado" no select de local (Steps 2 e 3) e no select de instrutor (Steps 2 e 3) quando há sobreposição com turmas já salvas.

---

## 📋 Backlog — Baixa Prioridade / Futuro

- [~] **Supabase Auth / JWT real** (DESIGN §9) — **adiado indefinidamente**
  - Avaliado em 2026-04-28: login client-side é adequado para ferramenta interna
  - RLS vigente limita dano caso chave anon seja comprometida
  - Risco de migração supera benefício; retomar somente se houver requisito de segurança externo

- [~] **Avaliar migração para Vite** (DESIGN §9) — **adiado indefinidamente**
  - Avaliado em 2026-04-28: bootstrap com Babel Standalone é imperceptível na prática
  - Migração adicionaria CI/CD, package.json, e risco de regressão sem benefício proporcional
  - Retomar somente se o volume de JS crescer além de 600KB ou se o tempo de load virar problema relatado

- [x] **Guard na mutação global de `LOCALS`** (DESIGN §9 — dívida técnica) — concluído 2026-04-28
  - `if (locals && locals.length) LOCALS = locals` evita sobrescrever com array vazio durante carregamento assíncrono
  - Refatoração completa (contexto React) continua no backlog como melhoria opcional

- [x] **Testes automatizados — cobertura das funções críticas** (DESIGN §9) — concluído 2026-04-28
  - 24 testes em `logic.test.js`: `recalcTimes`, `sortModules`, `isInstructorAbsent`, `hashPw`, `checkPw`, utils
  - Executar: `npm test` (Vitest 2.0.0)

---

## 🚫 Fora do Escopo

- Backend / API REST própria (Supabase é o backend)
- App mobile nativo
- Integração com ERP ou sistemas de RH
- Envio automático de e-mail / WhatsApp para os líderes
- Web Push real (notificação fora do app) — central in-app já existe (§5.5.1); push externo via `push_subscriptions` está em fase 2 e segue como projeto separado

---

## Como adicionar um item novo

```
- [ ] **Nome da funcionalidade** (SPEC §X.Y)
  - Descrição do comportamento esperado
  - Critério de aceite: o que precisa ser verdade para o item ser [x]
```
