# SPEC — RelyOn 360 Scheduler
> Fonte de verdade do sistema. Em caso de conflito entre código e spec, a spec vence.
> Última revisão: 2026-06-19 (papel `DP`, modelo de acesso por permissão default-deny, bônus por atividade — ver `ACESSO.md` e §4.9)

---

## 1. Visão Geral

**Produto:** RelyOn 360 Scheduler
**Empresa:** RelyOn Nutec — Macaé/RJ
**Propósito:** Gerenciar a programação de turmas de treinamento (instrutores, salas, datas, módulos) de forma visual e persistente.
**Stack:** Single-file HTML · React 18 + Babel Standalone · Supabase (tabela `app_state`)
**Arquivo principal:** `relyon360/index.html`
**URL de produção:** https://relyon360.vercel.app

---

## 2. Tipos de Acesso — Usuários e Clientes

O App tem um único frontend com **duas experiências distintas** baseadas em role.

### 2.1 Usuários (trabalham dentro do App)
Planejam, configuram e gerenciam o sistema.

| Role | Descrição |
|------|-----------|
| `developer` | Acesso total, incluindo configurações técnicas |
| `admin` | Acesso total operacional |
| `planejador` | Cria e edita turmas. Pode ter permissões granulares adicionais |
| `customer_service` | Acessa relatórios e visão de turmas via permissão (consultivo) |
| `DP` (Departamento Pessoal) | **Somente leitura**, dirigido por permissão; não cria/edita/exclui nada (folha é company-wide, sem seletor de base) |

> Nota: os três primeiros (developer, admin, planejador) trabalham ativamente no App; `customer_service` e `DP` são consultivos mas operam na visão de Usuário (não de Cliente).
>
> **Modelo de acesso completo** (matriz papel×tela, papel×dado, e o que falta para a Camada B/RLS): ver `ACESSO.md` — fonte de verdade do modelo de acesso, criado 2026-06-18 (Fase A implementada, APP_VERSION 31).

### 2.2 Clientes (acessam o App para consumir informações)
Visualizam e interagem com dados definidos pelos Usuários.

| Role | Descrição |
|------|-----------|
| `instructor` | Vê sua própria programação, confirma presença, altera senha |

> **Regras:**
> - Clientes não planejam, não configuram, não excluem. Apenas visualizam e executam ações limitadas (ex: confirmar presença).
> - Instrutores têm **login próprio** — a senha fica no registro do instrutor (não em `users`).
> - Após criar um instrutor novo, `mustChangePass = true` força troca de senha no primeiro login.

### 2.3 Permissões Granulares (`permissions[]`)

O sistema define uma lista de permissões finas (ver §4.6) atribuíveis aos papéis `planejador`, `customer_service` e `DP` (`PERMISSIONED_ROLES`, default-deny — `js/constants.js`). A função `hasPermission(user, permId)` valida em runtime: developer/admin passam sempre; os demais precisam ter o ID em `permissions[]`. A permissão legada `reports` foi dividida em `reports_operacional` (KPI/turmas) e `reports_financeiro` (folha/bônus) — gate por aba em `reports.js` (`REPORT_TAB_PERM`/`canSeeReportTab`) impede CS/DP de ver as abas de pagamento. O roteador (`canSeePage`) bloqueia a renderização da página por papel/permissão, não só o item do menu. Detalhe completo: `ACESSO.md §9`.

---

## 3. Entidades e Modelo de Dados

### 3.1 Área (`areas`)
Quatro áreas operacionais na RelyOn:

| Área | Descrição |
|------|-----------|
| OPITO | Segurança de plataforma offshore |
| MARINHA | Embarcações de sobrevivência e salvamento |
| COMBATE A INCÊNDIO | CBINC — combate a incêndio |
| INDUSTRIAL | Trabalho em altura, espaço confinado, movimentação de cargas |

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| name | string | nome da área |
| leader | string | nome do líder |
| leaderEmail | string | e-mail do líder |
| whatsapp | string | telefone WhatsApp do líder (formato +55 XX XXXXX-XXXX) — opcional |
| color | string | hex de cor para UI |

### 3.2 Treinamento (`trainings`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| gcc | string | código do treinamento (ex: "OBS308") |
| shortName | string | nome abreviado opcional (ex: "CBSP", máx. 10 car.) — usado como prefixo nos nomes de turma; fallback para `gcc` se vazio |
| area | number | id da área |
| name | string | nome completo |
| totalMinutes | number | carga horária total em minutos |
| defaultSchedule | boolean | `true` = usa grade 08–12/13–17 (Horário Normal); `false` = Horário Livre, cada disciplina tem data e hora editáveis manualmente no wizard |
| modules | Module[] | lista de disciplinas |
| modes | Mode[] | lista de modos de sequência pré-definidos — opcional (ver §3.3b) |

### 3.3 Módulo (dentro de Treinamento)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| name | string | nome da disciplina (ex: "CBSP - TSP/P - TEORIA") |
| type | "TEORIA" \| "PRÁTICA" | tipo da disciplina |
| locals | string[] | lista de locais válidos para esta disciplina |
| priority | number | ordem de execução dentro do treinamento |
| minutes | number | duração em minutos |
| instructorCount | number | número de instrutores necessários simultaneamente |
| sameDay | boolean | deve ocorrer no mesmo dia |
| isHuet | boolean | quando `true`, esta disciplina usa a sequência fixa de papéis HUET (Lead → Assistant → 2× Scuba → Crane), truncada por `instructorCount`. Independente de `training.poolBatch` |

### 3.3a Flag EAD
| Campo | Tipo | Descrição |
|-------|------|-----------|
| ead | boolean | `true` = turma ministrada remotamente; ativa locais online no `LocalsSelector` (ONLINE, MICROSOFT TEAMS, ZOOM) em vez dos locais físicos |

### 3.3b Modos de Sequência (`Mode[]` dentro de `Treinamento`)
Sequências pré-definidas dos módulos para diferentes turmas do mesmo treinamento. Útil quando CBSP - 01, CBSP - 02 e CBSP - 03 rodam disciplinas em ordens diferentes pela mesma estrutura de cadastro.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único do modo |
| label | string | nome exibido (ex: "Modo 1", "Turma Manhã") |
| moduleOrder | number[] | array de IDs dos módulos na ordem desejada |

**Auto-detecção pelo número da turma:** o wizard extrai o número final do `className` (regex `/(\d+)$/`); se o treinamento tem N modos, `Modo[turmaNum-1]` é pré-selecionado (CBSP - 02 → Modo 2). O usuário pode override pelo dropdown.

**Quando usar:** apenas quando `defaultSchedule !== false`. Treinamentos sem modos cadastrados usam a ordem padrão (`sortModules`: regulares → revisão → prova → reserva).

> **Sobre `instructorCount`:** quando > 1, significa que N instrutores atuam **juntos**, no mesmo local, no mesmo horário — não em locais ou horários diferentes. Exemplo: prática que exige supervisão dupla, ou presença de tradutor simultâneo (+1).

> **Sobre `locals`:** os locais possíveis são definidos **no cadastro do módulo**. O planejamento automático hoje ainda usa `getLocalOpts()` (filtro por env/subtype) em vez de `mod.locals[]` diretamente — ver TASKS.md para o fix pendente.

### 3.4 Locais (`LOCALS`)
Locais físicos disponíveis na unidade. Cada local tem:
- `env`: `"Teórico"` · `"Prático"` · `"—"`
- `subtype` (opcional): `"incendio"` · `"piscina"` · `"industrial"`
- `type`: agrupamento por unidade (`"RelyOn Macaé"`, `"Offshore"`, `"In Company"`, `"Online"`)
- `capacity` (opcional): capacidade de alunos em salas teóricas

Regra de filtro por módulo (`getLocalOpts`):
- TEORIA → locais com `env: "Teórico"`
- PRÁTICA → locais com `env: "Prático"`
- Se a área do treinamento for "COMBATE A INCÊNDIO" → só locais com `subtype: "incendio"`

> A tela `LocalsPage` mostra os locais organizados em 7 grupos (Teórico, Piscinas, CBINC, Industrial, Offshore, In Company, Online), com indicador visual de ocupação no dia.

### 3.5 Instrutor (`instructors`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| name | string | nome completo |
| phone | string | telefone |
| email | string | e-mail profissional |
| contract | string | tipo de contrato ("CLT", "PJ", "") |
| base | string | base de atuação (ex: "Unidade Macaé") |
| leader | string | nome do líder |
| status | string | "Ativo" · "Inativo" · "Afastado" |
| password | string | senha (bcrypt hash, cost 8 — migração automática de plaintext no AppLoader) |
| mustChangePass | boolean | força troca na primeira autenticação |
| avatar | string | iniciais para avatar — opcional |
| username | string | login — opcional, único dentro de `users` + `instructors` |
| skills | {name: string, canLead: boolean}[] | competências do instrutor — cada item tem o nome exato da disciplina (ou `"TRADUTOR"`) e se pode ocupar o Slot 0 (Lead) naquela disciplina |

### 3.6 Ausência (`absences`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| instructorId | number | referência ao instrutor |
| instructorName | string | nome (desnormalizado) |
| type | "involuntario" \| "voluntario" \| "planejada" | categoria macro |
| category | string | categoria específica (ver §4.7) |
| startDate | string | "YYYY-MM-DD" |
| endDate | string | "YYYY-MM-DD" |
| startTime | string | "HH:MM" — opcional para dia inteiro |
| endTime | string | "HH:MM" — opcional para dia inteiro |
| obs | string | observação livre |

### 3.7 Turma / Programação (`schedules`)
Cada registro = **uma linha** da grade: uma disciplina, **um instrutor**, um local, uma data.
Para módulos com `instructorCount: 2`, existem 2 registros com o mesmo horário, módulo e local — um por instrutor.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number\|string | identificador único |
| trainingId | number | referência ao treinamento |
| trainingName | string | código GCC (desnormalizado) |
| className | string | nome da turma (ex: "CBSP - 01") |
| date | string | "YYYY-MM-DD" |
| startTime | string | "HH:MM" |
| endTime | string | "HH:MM" |
| local | string | nome do local |
| instructorId | number\|null | referência ao instrutor |
| instructorName | string | nome (desnormalizado) |
| module | string | nome da disciplina |
| role | "Lead Instructor" \| "Theoretical Instructor" \| "Practical Instructor" \| "Support Instructor" \| "Assistant Instructor" \| "Translator" | papel do instrutor nessa linha (`"Assistant Instructor"` para slots > 0, `"Translator"` quando slot de tradução simultânea) |
| studentCount | string | número de alunos |
| status | "Programado" \| "Rascunho" | estado da turma — `Rascunho`=quarentena IA, `Programado`=ativa. (`Pendente`/`Confirmado` extintos em 2026-06-10 — ver DESIGN §18.3) |
| confirmedAt | string | ⚠️ legado/inerte desde 2026-06-10 (ex-ciência) — não é mais escrito/lido |
| confirmedBy | string | ⚠️ legado/inerte desde 2026-06-10 (ex-ciência) — não é mais escrito/lido |
| issueLog | {type, text, by, at}[] | histórico de reportes e reconhecimentos do instrutor — opcional |
| linkedClassNames | string[] | nomes de outras turmas vinculadas (turmas fundidas) — opcional; replicado em todas as rows da turma |

> **Sobre `issueLog`:** array de entradas `{ type: "report"|"ack", text: string, by: string, at: ISO }`. Instrutor reporta problema (type "report"), planner reconhece (type "ack"). Migração automática converte campo legado `issue` (string) para `issueLog[]`.

> **Sobre `linkedClassNames`:** turmas fundidas compartilham slots (mesmo instrutor, local, dia/horário) sem disparar conflito. Ex: turma de 40h e reciclagem de 16h que rodam juntas nos primeiros dias. Vínculo é bidirecional — atualizar via UI no Step 3 garante que ambas as turmas recebam a referência. `checkSlotConflict` e `detectConflicts` ignoram pares vinculados.

### 3.8 Usuário (`users`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| name | string | nome completo |
| email | string | e-mail |
| username | string | login (único entre `users` + `instructors`) |
| password | string | senha (bcrypt hash, cost 8) |
| role | "developer" \| "admin" \| "planejador" \| "customer_service" | ver §2.1 |
| avatar | string | iniciais |
| mustChangePass | boolean | força troca de senha no próximo login |
| permissions | string[] | permissões granulares (ver §4.6) — opcional |
| linkedInstructorId | number | vínculo com um registro de instructors, para que esse usuário acesse a visão do instrutor no ReportsPage — opcional |

### 3.9 Solicitação (`requests`)
Pedido de folga/férias/ausência feito pelo Instrutor e gerenciado pelo Planejador.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| instructorId | string | id do instrutor solicitante (sempre `String(instructor.id)`) |
| instructorName | string | nome (desnormalizado) |
| type | string | `folga_dia` \| `folga_dias` \| `ferias` \| `exame` \| `doenca` \| `outro` |
| startDate | string | "YYYY-MM-DD" — pode ser vazia em tipos `none` (definida na aprovação) |
| endDate | string | "YYYY-MM-DD" — igual a `startDate` para tipo `single` |
| fracaoDia | boolean | quando `true`, indica fração do dia com `startTime`/`endTime` — opcional |
| startTime | string | "HH:MM" — opcional, só quando `fracaoDia: true` |
| endTime | string | "HH:MM" — opcional, só quando `fracaoDia: true` |
| obs | string | observação livre |
| status | `pendente` \| `aprovada` \| `rejeitada` | estado atual |
| priority | boolean | quando `true`, sobe ao topo da lista "Aguardando" do Planejador — opcional |
| createdAt | string | ISO timestamp de criação |
| approvedAt | string | ISO timestamp da aprovação — opcional |
| approvedBy | string | nome do usuário que aprovou — opcional |
| approvalFeedback | string | mensagem opcional do Planejador ao Instrutor no momento da aprovação |
| rejectedAt | string | ISO timestamp da rejeição — opcional |
| rejectedBy | string | nome do usuário que rejeitou — opcional |
| rejectionReason | string | motivo da rejeição |
| absenceCreated | boolean | quando `true`, a ausência correspondente já foi criada (evita duplicar) — opcional |
| dpNotify | object | opcional — presente só para `ferias`/`abono_aniversario` aprovados que viraram ausência real (não Freelancer/PJ). Ver §21.1 |

**Tipos disponíveis** (constante `REQUEST_TYPES`):

| `type` | Label | Período | Vira ausência |
|--------|-------|---------|---------------|
| folga_dia  | Folga — 1 dia | single | planejada / Folga Banco de Horas |
| folga_dias | Folga — Mais dias | range | planejada / Folga Banco de Horas |
| ferias     | Férias | range | planejada / Férias |
| abono_aniversario | Folga — Abono Aniversário | single | planejada / Folga Abonada |
| exame      | Folga para Exame ou Consulta | single | involuntario / Consultas e Exames |
| doenca     | Estou doente | none (período definido pelo planejador) | involuntario / Atestado Médico — gera ausência imediata para o dia atual e fica aguardando confirmação |
| outro      | Outro motivo | none | involuntario / Falta |

> **Fluxo:** ao aprovar uma solicitação cujo `absenceCreated` é `false`, o sistema cria automaticamente um registro em `absences` com os tipos/categorias mapeados acima. Para `doenca`, a ausência já é criada no momento do envio (instrutor confirma que está doente hoje). Para `ferias`/`abono_aniversario`, ver também o aviso ao DP em §21.1.

---

## 4. Regras de Negócio

### 4.1 Grade de Horários
- **Manhã:** 08:00 → 12:00 (240 min úteis)
- **Almoço:** 12:00 → 13:00 (não conta como tempo de treinamento)
- **Tarde:** 13:00 → 17:00 (240 min úteis)
- **Dia útil total:** 480 min
- Um módulo pode cruzar o almoço — nesse caso, o bloco é "pausado" às 12:00 e retomado às 13:00 (o horário de término wall-clock reflete isso)
- Ao atingir 17:00, o restante do módulo (se houver) continua no dia seguinte às 08:00 — ou seja, `recalcTimes` **quebra módulos longos em múltiplos dias automaticamente**

### 4.2 Ordenação de Módulos (`sortModules`)
1. Módulos regulares (não PROVA, não TEMPO RESERVA):
   - Para módulos CBINC: TEORIA antes de PRÁTICA
   - Demais: ordenados por `priority`
2. PROVA: sempre ao final
3. TEMPO RESERVA: sempre após PROVA

### 4.3 Atribuição de Instrutores (`initPlan`)
1. **Score:** contar quantos módulos do treinamento cada instrutor está habilitado a ministrar
2. **Committed list:** ao escolher um instrutor, ele entra na lista de comprometidos (`committedInstrs`)
3. **Prioridade:** instrutor já comprometido > instrutor com maior score > qualquer habilitado disponível
4. **Slot 0 = Lead obrigatório:** o primeiro slot (`k=0`) só aceita instrutores com `canLead: true` para aquela disciplina. Se não houver nenhum disponível, o slot fica vazio — **sem fallback para não-Lead**
5. **Slots 1..N = Assistentes:** qualquer instrutor habilitado para a disciplina (sem exigência de `canLead`)
6. **Slot de Tradutor:** além dos N slots do `instructorCount`, pode haver um slot extra com `isTranslator: true`. Esse slot só aceita instrutores com a competência `"TRADUTOR"` marcada em seu perfil. Quando ativo, é **obrigatório** — impede o salvamento se estiver vazio
7. **Multi-instrutor:** quando `instructorCount > 1`, preencher N slots com instrutores diferentes (mesma disciplina, mesmo horário, **mesmo local** — N profissionais simultâneos). O contador de assistentes pode ser ajustado manualmente no Step 2 (+/−)

#### Disciplinas HUET (`module.isHuet === true`)
Quando o módulo tem a flag `isHuet`, substitui as regras 4–5 acima pela sequência fixa:

| Slot | Papel | Filtro |
|------|-------|--------|
| 0 | Lead Instructor | competência `LEAD_INSTRUCTOR` válida + skill da disciplina com `canLead: true` |
| 1 | Assistant Instructor | competência `ASSISTANT_INSTRUCTOR` válida + skill da disciplina |
| 2 | Scuba Diver | competência `SCUBA_DIVER` válida |
| 3 | Scuba Diver | competência `SCUBA_DIVER` válida |
| 4 | Crane Operator | competência `CRANE_OPERATOR` válida |

`instructorCount` trunca a sequência da direita: `count=3` → só Lead + Assist + Scuba#1. O planejador pode remover papéis específicos **por turma** clicando no X do chip (persiste em `slot.role`). Slots sem candidato com a competência exigida ficam vazios + ⚠ visual.

**Independência do Lote Piscina:** a flag `training.poolBatch` continua sendo só filtro de visibilidade no modal Lote Piscina. Ligar `isHuet` numa disciplina não a coloca no Lote Piscina, e vice-versa — são decisões ortogonais.

**Proteções no rollout** (ver DESIGN §22.B): toggle off por padrão; freeze técnico que preserva `instructorId` salvo mesmo se o instrutor não tiver a competência (recálculo só preenche slots vazios); validação suave (⚠ no slot sem remover); wizard de backfill que sugere competências baseado em histórico; `EditGuardModal` exige senha do usuário pra alterar local/horário/data de turmas com `date < today`. (Dry-run inline ao ligar `isHuet` foi tentado e revertido — DESIGN §22.B5.)
8. **REVISÃO / TEMPO RESERVA:** devem ter o mesmo instrutor da PROVA
9. **Checagem de ausência:** instrutor ausente no horário do slot não é sugerido (`isInstructorAbsent`)

### 4.4 Atribuição de Locais (`initPlan`)
- A filtragem base é feita por `getLocalOpts(mod, training)` — por `env` (Teórico/Prático) e subtype quando CBINC
- Para o mesmo treinamento, o local escolhido para um módulo é reutilizado em módulos futuros do **mesmo módulo** (`preferredLocals[mod.id]`)
- Todos os slots do mesmo módulo compartilham o **mesmo local** (um cenário para toda a equipe)

### 4.5 Fluxo de Confirmação de Presença — ❌ REMOVIDO (2026-06-10)

> Sistema de ciência arrancado em 2026-06-10. Turmas nascem `status: "Programado"`; não há mais
> confirmação do instrutor. **Gatilho de redesenho (com dicas) em DESIGN §18.3.** Fluxo histórico abaixo:
```
Usuário cria turma → status: "Pendente"
       ↓
Instrutor (Cliente) acessa App → vê sua programação no Dashboard / MySchedule
       ↓
Instrutor clica "Confirmar Ciência" (individual) ou "Confirmar tudo hoje"
       ↓
status: "Confirmado" · confirmedAt = now · confirmedBy = instrutor.name
       ↓
Dashboard do Admin: contador "Pendentes" diminui
Dashboard do Instrutor: alerta de pendência removido
```

### 4.6 Controle de Acesso

> **Matriz papel×tela e papel×dado atualizada (com `DP`, gate por aba de relatório e bloqueio no roteador) vive em `ACESSO.md §4/§5/§9`** — fonte de verdade desde 2026-06-18. A tabela abaixo é a versão original (2026-05-22) e está parcialmente defasada (não inclui `DP`, nem o split `reports_operacional`/`reports_financeiro`, nem `canSeePage`).

#### Por role
| Funcionalidade | developer | admin | planejador | customer_service | instructor |
|----------------|-----------|-------|-----------|------------------|------------|
| Dashboard de Usuário | ✓ | ✓ | ✓ | ✓ | — |
| Dashboard de Instrutor (`InstructorDashboard`) | — | — | — | — | ✓ |
| Criar/editar/excluir turma (Schedule) | ✓ | ✓ | ✓ | — | — |
| Ver programação completa (Schedule) | ✓ | ✓ | ✓ | ✓ | — |
| Gerenciar treinamentos (TrainingsPage) | ✓ | ✓ | ✓* | — | — |
| Gerenciar instrutores (InstructorsPage) | ✓ | ✓ | ✓* | — | — |
| Gerenciar ausências (AbsenteismoPage) | ✓ | ✓ | ✓* | — | — |
| Gerenciar usuários (UsersPage) | ✓ | ✓ | — | — | — |
| Gerenciar áreas (SettingsPage — guard de senha) | ✓ | ✓ | — | — | — |
| Relatórios (ReportsPage) — modo admin | ✓ | ✓ | ✓ | ✓ | — |
| Meu Histórico (ReportsPage) — modo instrutor | — | — | — | — | ✓ |
| Confirmar presença | — | — | — | — | ✓ |
| Comunicação — Fazer requisição | — | — | — | — | ✓ |
| Comunicação — Gerenciar (aprovar/rejeitar) | ✓ | ✓ | ✓ | — | — |
| Trocar própria senha | ✓ | ✓ | ✓ | ✓ | ✓ |

\* Hoje o acesso do planejador é "tudo que não é de admin" — o ideal seria cruzar com `user.permissions[]`.

#### Permissões granulares disponíveis (`PERMISSIONS_LIST`)

| ID | Label | Grupo |
|----|-------|-------|
| plan_view | Visualizar Programação | Planejamento |
| plan_edit | Criar/Editar Programação | Planejamento |
| events_turmas | Criar Eventos — Turmas | Planejamento |
| events_manut | Criar Eventos — Manutenção | Planejamento |
| events_desenv | Criar Eventos — Desenvolvimento | Planejamento |
| skills_edit | Editar Competências | Configuração |
| locals_edit | Editar Locais | Configuração |
| train_edit | Editar Treinamentos | Configuração |
| instr_view | Consultar Instrutores | Configuração |
| reports_operacional | Relatórios — KPI/turmas | Relatórios |
| reports_financeiro | Relatórios — folha/bônus/pagamento | Relatórios |
| ai | IA — Sugerir Escala | Relatórios |

> **Implementação (atualizada 2026-06-18 — Fase A, `ACESSO.md §9`):** `hasPermission(user, permId)` verifica: developer/admin passam sempre; `planejador`/`customer_service`/`DP` (`PERMISSIONED_ROLES`) precisam ter o ID em `user.permissions[]` — **default-deny**. A permissão legada `reports` foi dividida em `reports_operacional` e `reports_financeiro` (migração automática no AppLoader: planejadores com `reports` ganham as duas; CS atuais ganham `reports_operacional`). `canSeeReportTab` gateia cada aba de `ReportsPage`; `canSeePage` (constants.js) bloqueia a página inteira no roteador, não só o item do menu. As funções `canAdmin()` e `canPlan()` (baseadas em `role`) continuam como gatekeepers de nível macro.

### 4.7 Ausências — Tipos e Categorias

| Tipo | Cor | Categorias |
|------|-----|------------|
| `involuntario` (Absenteísmo Involuntário) | vermelho | Atestado Médico · Licença Paternidade/Maternidade · Consultas e Exames (com declaração) |
| `voluntario` (Absenteísmo Voluntário) | laranja | Falta · Atrasos e Saídas Antecipadas · Suspensão Disciplinar |
| `planejada` (Ausência Planejada) | verde | Folga Banco de Horas · Férias · Treinamento/Evento Externo |

**Categorias de dia inteiro** (não exigem `startTime`/`endTime` e bloqueiam o instrutor no dia inteiro em `isInstructorAbsent`):
Atestado Médico · Férias · Licença Paternidade/Maternidade · Suspensão Disciplinar

> **Feriado deixou de ser tipo de ausência** (FASE 6 — 2026-04-30). Agora vive como entidade global em `relyon_holidays` com lógica regional (nacional/estadual/municipal). Ver §4.8.

### 4.8 Feriados — Calendário Regional

Feriado é atributo do **dia**, não do instrutor. Cada `holiday` tem:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | number | ID único |
| `date` | string `YYYY-MM-DD` | Data do feriado |
| `name` | string | Nome (Ex: "Tiradentes", "Aniversário de Macaé") |
| `scope` | `national \| state \| municipal` | Abrangência |
| `state` | string (UF) | Sigla do estado — obrigatório se `scope ∈ {state, municipal}` |
| `city` | string | Cidade — obrigatório se `scope = municipal` |

**Regra de aplicação (`isHoliday(date, instr, holidays)` — ver `js/logic.js`):**
- `scope: "national"` → afeta todos os instrutores
- `scope: "state"` → afeta apenas instrutores com `instr.state === holiday.state`
- `scope: "municipal"` → afeta apenas instrutores com `instr.state === holiday.state E instr.city === holiday.city`
- Instrutor **sem `state`/`city` cadastrados** é afetado apenas por feriados **nacionais**

**Impacto em cada parte do sistema:**
- **Disponibilidade no wizard:** instrutor em feriado regional não entra em `qualified` no `initPlan`; no Step 2 aparece em "Indisponíveis" como `🏖 {nome} · {feriado}` (cyan)
- **KPI de absenteísmo:** quem não trabalhou em feriado **não conta como falta** — o cálculo deve filtrar dias-feriado do denominador (a implementar nas métricas futuras)
- **Bonificação:** quem trabalhou em feriado tem `holidayWork: true` derivado (`schedule.date` em feriado aplicável ao instrutor) — exibido em "Horas por Instrutor" como coluna separada `🏖 Horas em Feriado` para futura bonificação
- **Visões calendário:** dia com feriado nacional ganha header cyan na Visão Semanal e badge "🏖 {nome}" na Grade Paralela; feriados regionais aparecem como tooltip/legenda

**Cadastro:** página `/holidays` (sidebar → Configurações → Feriados), acesso `developer`/`admin`, guard de senha em CRUD.

### 4.9 Remuneração — Freelancer (diárias) e CLT (bônus por atividade)

Dois modelos coexistem, conforme `instructor.contract` (SPEC §3 — entidade Instrutor):

- **Freelancer/PJ** — por **diárias**: 4 categorias de valor (incluindo `activityRate`, para atividades da Linha do Tempo). Aba "Freelancer a Receber" em Relatórios lista dias trabalhados + função exercida.
- **CLT (incl. CLT Offshore)** — **bônus fixo** `CLT_TURMA_BONUS` (R$60) por **dia** em que prestou serviço (turma OU atividade da Linha do Tempo — manutenção, desenvolvimento, treinamento obrigatório, apoios MKT/QSMS etc.), desde que o dia qualifique: terminou após 17h (motivo "Noturno"), **ou** Feriado, **ou** Final de semana. Um bônus por dia, independente de quantas turmas/atividades.
  - **Atividades elegíveis** (`BONUS_ELIGIBLE_ACTIVITY_TYPES`, `js/constants.js`): todos os tipos de `ACTIVITY_TYPES` **exceto** `free` (marcador de disponibilidade, não é trabalho), `embarque` (decisão de produto: ocupa a agenda mas não gera bônus) e `holiday_work` (marcador "Feriado" sozinho = **folga** no feriado, não trabalho — só gera bônus se houver turma/atividade real no dia junto).
  - Dia de feriado com trabalho real também gera **hora extra 100%** (lançamento manual em folha — não calculado pelo sistema).
  - Aba "Bônus" (Relatórios) lista por instrutor/dia com motivo (Noturno/Feriado/Final de semana); aba "Extrato por Instrutor" mostra o detalhamento individual.
  - Acesso às abas de pagamento (Freelancer a Receber, Bônus, Extrato por Instrutor) gated por `reports_financeiro` — CS/DP nunca veem (§2.3 / `ACESSO.md §9`).

---

## 5. Funcionalidades por Tela

### 5.1 Login
- Campos: usuário + senha
- Lookup cruzado: primeiro em `users`, depois em `instructors`
- Comparação de senha via `checkPw(plain, hash)` — suporta bcrypt hash e plaintext legado
- Erro visual em credencial inválida
- Se `mustChangePass: true` → redireciona para `ChangePasswordScreen`
- Opção "manter conectado" salva em `sessionStorage`

### 5.2 Troca de Senha (`ChangePasswordScreen`)
- Exige nova senha + confirmação (primeiro acesso) ou senha atual + nova + confirmação (troca voluntária)
- Nova senha é hasheada com `hashPw()` (bcrypt, cost 8) antes de persistir
- Atualiza `users` ou `instructors` (a depender da origem) e seta `mustChangePass: false`

### 5.3 Dashboard — Visão Usuário (admin/planejador/customer_service)
- StatCards: Hoje · Próximos · Confirmados · Pendentes · Treinamentos
- **Card "Salas Teóricas":** mostra total de locais teóricos e quantos estão livres no turno Manhã e Tarde (sempre referente a hoje); badge verde = todos livres, amarelo = algum ocupado; clique abre `LocalsReportPage` (§5.14)
- Seção "Problemas Reportados" com timeline de `issueLog[]` e botão "Ciente" (planner ack)
- Lista das próximas 6 programações com data, horário, local, status
- Leitura apenas (ações ficam em Schedule)

### 5.4 Programação (`Schedule`) — Visão Usuário

**Sistema de abas (browser-style)**
- Até 5 abas abertas simultaneamente — cada aba representa uma turma em criação (Steps 1–2) ou edição (Step 3)
- Barra de abas visível no topo: ícone por passo (📝 Step 1, 📋 Step 2, ✏ Step 3), botão × por aba, botão + para nova aba
- Botão "≡ Lista" retorna à listagem sem fechar as abas — estado preservado ao navegar para outras páginas do app e ao pressionar F5 (persistido em `sessionStorage`)
- `loadClassForEdit` detecta se a turma já está aberta em outra aba e a reativa em vez de duplicar

**Step 0 — Lista de Turmas / Semana**
- Toggle "Lista / Semana" (visível para admin, planejador, developer)
- **Visão Lista:** busca por nome de turma ou GCC; cards expansíveis com disciplinas por dia; cada linha: horário, módulo, local, instrutor, status; ações: Editar (abre aba), Excluir (com guard de senha)
- **Visão Semana:** calendário Seg–Dom; navegação entre semanas (← Anterior · Hoje · Próxima →); cards de turma por coluna de dia com nome, GCC, horário e módulos; clicar numa turma abre o Step 3 numa aba

**Step 1 — Nova Turma**
- Campos: treinamento (busca por GCC, nome abreviado ou nome completo — campo único), data, nome de turma, horário de início
- Nome da turma gerado automaticamente usando `shortName` do treinamento (ou `gcc` como fallback)
- Botão "Próximo" → Step 2; "Fechar aba" descarta a aba

**Step 2 — Planejamento Automático**
- Grade gerada por `initPlan` + `recalcTimes`
- Módulos com `instructorCount > 1` exibem N sub-linhas de instrutor (mesmo local)
- Drag & drop para reordenar módulos; seletor de data para mover módulo entre dias
- Dropdowns de local e instrutor editáveis inline — local reflete em tempo real mudanças feitas em Treinamentos/Locais sem recarregar
- Botão "Confirmar" → chama `savePlan` e fecha a aba; "Cancelar" fecha a aba sem salvar

**Step 3 — Editar Turma Existente**
- Carrega turma existente numa aba
- Mesma interface do Step 2
- Suporte a slot de tradutor por módulo (botão "🌐 + Tradutor" / "🌐 Remover tradutor")
- Ações: reordenar, editar horário/instrutor/local, recalcular, salvar (fecha aba) ou cancelar (fecha aba)

### 5.5 Visão do Instrutor

Quatro telas compõem a experiência do instrutor:

**`InstructorDashboard` (tela inicial após login)**
- **Barra de semana** (topo): `◀ Semana N · DD a DD ▶` com botão "Hoje" condicional; navegação ilimitada futuro/passado; auto-foco na próxima semana a partir de quinta 18h — princípio adaptativo: dar controle do tempo desde segunda, antecipando a ansiedade típica de sex/sáb/dom
- **Sino de Notificações** (topbar): badge numérico de não-lidas; painel desliza (desktop) ou tela cheia (mobile) com lista; aberta=lida; histórico persiste; ver §5.5.1
- **Bloco "Hoje"** — timeline visual 08–17h com **linha "agora"** (vermelha, atualiza a cada 60s, com círculo na ponta esquerda) só visível em dia=hoje; scroll automático silencioso até a linha em mobile/iPad
- **Card de módulo** — visual compacto + botão "Ciente ▾"; ao clicar expande inline com detalhes completos (treinamento sem abreviação, turma, local, equipe completa incluindo o próprio instrutor) e fonte ligeiramente maior; botão **"Confirmar ciência"** vive **dentro** do expandido (força leitura antes do aceite); ver §5.5.2
- **Estados visuais** sutis: borda fina amarela à esquerda=pendente · neutro=ciente · tag "atualizado" + borda amarela=mudou após ciente
- **Consultar outra data** mantém-se igual
- **Botão "Reportar Problema"** com modal → grava em `issueLog[]`

**`InstructorProfile` — Meu Perfil**
- Dados pessoais (read-only)
- Competências agrupadas por treinamento (read-only)
- Troca de senha (validação: senha atual via bcrypt compare, nova ≥ 6 chars, confirmação)

**`ReportsPage` — Meu Histórico**

Organizada em **abas**, com filtro de período (DE/ATÉ) compartilhado entre todas:

- **📊 Histórico** (sempre disponível)
  - Grid visual MANHÃ / TARDE / NOITE (mesmo formato do relatório admin de Utilização Diária)
  - Datas nas linhas (badge com dia, mês abreviado e dia da semana)
  - Períodos nas colunas: MANHÃ (08-12), TARDE (13-17), NOITE (17-21)
  - **Bolinhas globais** (ver §5.5.3) — cobrem treinamento, ausências aprovadas (folga, férias, atestado…), atividades internas, feriados e estado "Livre" do freelancer com cores distintas
  - A grade lista TODA data com cobertura no período (não só dias com aula) — folgas e férias aprovadas viram linhas próprias
  - Stat cards com totais (Aulas, Ausências, Dias) e legenda completa da paleta

- **🌙 Noturno** (apenas `contract === "CLT"` estrito — não inclui CLT OFFSHORE)
  - Listagem detalhada de aulas com `startTime >= 17:00` no período (alinhado com o slot NOITE)
  - Colunas: DATA · DIA · TREINAMENTO · TURMA · MÓDULO · HORÁRIO · PAPEL · LOCAL
  - Stats no topo: dias com trabalho noturno · registros de aula
  - **Botão PDF** — gera relatório no padrão visual UTILIZATION (cabeçalho `#01323d` + brand `#ffa619`, rodapé com TOTAL)
  - Justificativa de negócio: CLT recebe adicional noturno por dia trabalhado nesse turno

- **💼 Dias Trabalhados** (apenas contratos `Freelancer`/`Prestador`/`PJ`)
  - Lista dias do período com trabalho registrado (apenas dias com aula — sem linhas vazias)
  - Múltiplas aulas no mesmo dia: agrupadas com `rowSpan` na coluna DATA
  - Colunas: DATA · DIA · TREINAMENTO · TURMA · MÓDULO · HORÁRIO · **FUNÇÃO** (Inst. Líder, Inst. Teórico, Inst. Prático, Tradutor, Assist. Instrução, Scuba Diver, Crane Operator…) · LOCAL
  - **Chips de funções** no topo: contagem de quantas vezes o freelancer atuou em cada função
  - **Botão PDF** — mesmo padrão visual UTILIZATION
  - Justificativa de negócio: freelancer precisa visualizar dias trabalhados e em qual função para conferência de pagamento por diária

**Regras gerais da visão de instrutor:**
- Vê os próprios `schedules` (`instructorId === user.id`, ou `linkedInstructorId` se admin estiver visualizando como instrutor) **e** suas ausências/atividades/feriados aplicáveis
- Acesso somente leitura a agendas; só pode confirmar presença e trocar própria senha

#### 5.5.1 Central de Notificações (Instrutor)

Substitui modais efêmeros por persistência consultável. Quatro tipos de evento geram notificação automaticamente quando afetam um schedule do instrutor:

| Tipo | Quando dispara |
|------|----------------|
| `new_module` | Schedule novo atribuído ao instrutor |
| `module_changed` | Mudança em schedule já confirmado (horário, local, instrutor parceiro) |
| `module_cancelled` | DELETE de schedule do instrutor |
| `broadcast` | Aviso geral criado por admin/planejador (fora deste escopo de UI, mas tabela já comporta) |

- Cada notificação: `id`, `instructorId`, `type`, `title`, `body`, `linkClassId` (UUID da turma) | `linkScheduleId` (id de schedule), `createdAt`, `readAt`
- Aberta no painel = `readAt` preenchido (auto-lida)
- Histórico permanece visível indefinidamente — instrutor pode reler avisos antigos
- Filtros: "Não lidas" / "Todas"
- Tabela dedicada `relyon_notifications` no Supabase (não vive em `app_state` — ver §6)

#### 5.5.2 Card de Módulo — Ciente Expansível — ❌ REMOVIDO (2026-06-10)

> Card virou somente-leitura (expand de detalhes/equipe, sem botão de confirmar). Sem ciência.
> **Gatilho de redesenho em DESIGN §18.3.** Descrição histórica abaixo:

Substitui o modal vermelho legado. UX adaptativo (minimalismo + densidade sob demanda):

**Compacto (padrão):**
- Horário · módulo abreviado · turma · local · botão `Ciente ▾` (ou selo `✓ Ciente · DD/MM` quando confirmado)
- Borda fina amarela à esquerda quando pendente; neutro quando ciente

**Expandido (após clique no botão):**
- Treinamento por extenso (nome completo, sem abreviações), turma com cliente quando disponível, local, fonte ligeiramente maior (~1.05–1.10x)
- Equipe **completa** (todos os instrutores do módulo, inclusive o próprio usuário logado)
- Botão `Confirmar ciência` no final do bloco expandido — **só visível dentro do expandido** (força leitura antes do aceite)
- Após confirmar: card colapsa automaticamente e mostra `✓ Ciente · DD/MM`

**Mudanças após ciência:**
- Se um campo crítico (horário/local/instrutor parceiro) muda depois do ciente, o card volta a "pendente" com tag pequena `atualizado` e exige novo aceite

#### 5.5.3 Bolinhas Globais — paleta consolidada (Utilização Diária + Meu Histórico)

Princípio: o tempo de cada colaborador deve ser justificado em 100% — toda hora ocupada por **qualquer** evento aparece colorida na grade, não só treinamento. Implementado via `computeCoverage` + `paletteForBlock` + `getSlotPrimaryBlock` em [constants.js](relyon360/js/constants.js).

**Prioridade do bloco no slot:** `holiday > absence > training > maintenance/development > free`. O slot pinta a cor do bloco de maior prioridade que o cobre.

**Paleta** (decisão de 2026-05-22 com o Matheus):

| Tipo / Categoria | Cor | Padrão |
|---|---|---|
| Treinamento | verde brilhante `#16a34a` | sólido |
| Folga Banco de Horas | amarelo `#f59e0b` | sólido |
| Férias | amarelo + verde | hachura 45° `#f59e0b`/`#16a34a` |
| Atestado Médico | vermelho `#ef4444` | sólido |
| Consultas e Exames (com declaração) | vermelho `#ef4444` | sólido |
| Licença Paternidade/Maternidade | cyan claro | hachura `#06b6d4`/`#7dd3fc` |
| Falta | laranja `#f97316` | sólido |
| Atrasos e Saídas Antecipadas | laranja `#f97316` | sólido |
| Suspensão Disciplinar | marrom `#7c2d12` | sólido |
| Treinamento/Evento Externo | lilás `#a855f7` | sólido |
| Manutenção (atividade interna) | azul `#3b82f6` | sólido |
| Desenvolvimento (atividade interna) | roxo `#8b5cf6` | sólido |
| Livre (freelancer avaliado) | cinza `#94a3b8` | hachura cinza/escuro |
| Feriado regional | cyan `#06b6d4` | sólido |
| Sem justificativa | grafite `#1e3a42` | sólido |

A constante `PALETTE_LEGEND` (mesmo arquivo) lista todos os itens para uso em legendas — alterações na paleta devem ser feitas só ali, e propagam para tooltips, legendas e exports PDF/Excel.

### 5.6 Treinamentos (`TrainingsPage`)
- Busca + filtro por área
- Lista de treinamentos em acordeão agrupado por área
- Expand treinamento → lista de módulos com drag-reorder
- CRUD completo de treinamentos e módulos
- `LocalsSelector` filtra automaticamente por CBINC quando a área é de Incêndio
- Substituição em lote de local padrão em todos os módulos selecionados
- Delete com guard de senha
- **Flag EAD:** checkbox no modal "Novo Treinamento" e na edição inline; badge "EAD" exibido no card; `LocalsSelector` com prop `isEad` exibe ONLINE / MICROSOFT TEAMS / ZOOM quando ativado
- **"Quem faz o quê?":** botão na barra de ações; abre modal com busca por GCC ou nome — exibe acordeão treinamento → disciplina → instrutores habilitados; badge "LÍDER" para `canLead: true`

### 5.7 Instrutores (`InstructorsPage`)
- Busca + filtros por líder e área
- Lista em acordeão por área
- Detalhe com dados pessoais, habilidades, contrato e status (Ativo/Inativo/Afastado)
- Edição inline preservando foco dos inputs
- CRUD completo com guard de senha na exclusão
- Criação de instrutor já seta `mustChangePass: true` com senha padrão hasheada
- Admin pode resetar senha do instrutor (volta para padrão + `mustChangePass: true`)
- Admin não pode mais visualizar senha — apenas resetar (senhas são hash bcrypt)
- **Adicionar competência:** painel multi-seleção agrupado por treinamento — clicar para marcar/desmarcar várias disciplinas de uma vez; botões "Todas" / "Nenhuma"; campo de busca; confirma com "Adicionar (N)"

### 5.8 Ausências (`AbsenteismoPage`)
- CRUD de ausências com três tipos (ver §4.7)
- Suporte a ausência parcial e dia inteiro
- Intervalo `startDate`/`endDate`
- Filtros por tipo e por instrutor
- StatCards por tipo
- Integração com `initPlan` para não sugerir instrutor ausente

### 5.9 Usuários (`UsersPage`) — developer/admin
- CRUD de usuários com senhas hasheadas (bcrypt)
- Ao editar, campo de senha vazio mantém a senha atual; se preenchido, nova senha é hasheada
- Validação de username único (cruza `users` + `instructors`)
- Reset de senha (`mustChangePass: true`)
- Dropdown "Instrutor Vinculado" para associar a um registro de `instructors` (usado no Meu Histórico)
- Checkboxes de permissões granulares (quando role = `planejador`)
- Auto-gera avatar a partir das iniciais

### 5.10 Áreas (`SettingsPage`) — developer/admin
- CRUD de áreas com cor (paleta de 12 cores), líder, e-mail e WhatsApp
- Guard de senha para salvar/deletar (verifica contra senha do usuário logado via bcrypt)

### 5.11 Locais (`LocalsPage`)
- 8 grupos: Teórico, Piscinas, Combate a Incêndio, Industrial/Rigger, Manobras, Offshore, In Company, Online
- Filtro por grupo + busca por nome
- Card por local com nome, capacidade e status (livre/ocupado hoje)
- **CRUD completo** (developer/admin): criar, editar e excluir locais com guard de senha
- Campos editáveis: nome, tipo/grupo, ambiente (Teórico/Prático), subtipo, capacidade

### 5.14 Disponibilidade de Locais (`LocalsReportPage`)
- Acessível pelo card "Salas Teóricas" no Dashboard — não aparece na sidebar
- **Navegação por data:** botões Anterior / Hoje / Próximo + campo de data livre para qualquer dia
- Mesmos filtros de grupo da LocalsPage + busca por nome de local
- Botões de filtro rápido mutuamente exclusivos: **"Só livres"** e **"Só ocupados"**
- Card por local com:
  - Badge geral LIVRE / EM USO
  - Badge por turno: **Manhã LIVRE/OCUPADA** · **Tarde LIVRE/OCUPADA**
  - Se ocupado: lista de sessões (turma, módulo, horário, instrutores com seu papel)
- Leitura apenas — sem edição

### 5.12 Relatórios (`ReportsPage`)
**Modo Admin — abas:**
- **Utilização Diária:** datepicker; matriz Instrutores × Períodos (MANHÃ / TARDE / NOITE); cada slot vira **bolinha global** (ver §5.5.3) — cobre treinamento, ausências aprovadas (folga/férias/atestado), atividades internas, feriados e estado LIVRE de freelancer. Tooltip detalha o bloco; legenda completa abaixo da tabela. Exports Excel/PDF refletem as ausências (não apenas treinamentos)
- **Carga Horária:** datepicker; grade de ocupação por instrutor (células com disciplina, turma e horário)
- **Cursos:** filtros; lista de treinamentos com contagem de turmas
- **Salas:** visão de ocupação de salas num dia específico; exportação PDF
- **Programação da Turma:** filtros de período + treinamento + turma; linha do tempo por disciplina; exportação PDF
- **Class Planning:** seletor de **UM dia**; resolve internamente a **semana Segunda→Domingo** que contém o dia; lista turmas com atividade na semana; colunas: TURMA, PERÍODO (início → término reais da turma), ALUNOS, MANHÃ, TARDE, NOITE; agrupamento por `classId` (não por `className` — turmas com mesmo nome em semanas diferentes são entidades distintas); exportação PDF
- **Horas por Instrutor:** seletor de mês; breakdown por Teoria / Prática / Outras; barra proporcional; tags de treinamentos entregues; exportação PDF via impressão

**Modo Instrutor:**
- Ver §5.5 — Meu Histórico

### 5.13 IA — Sugestão de Escala (`AiPage`)

Criação de turmas **em lote**. Restrita a planejadores/admins (`canPlan`).

- **Fila de turmas** — montada a partir de uma planilha `.xlsx` (coluna A = GCC, data, tradução) e/ou de linhas adicionadas manualmente (botão "➕ Criar turma")
- **"Gerar Sugestão com IA"** — heurística (não IA real): para cada linha resolve o treinamento pelo GCC, atribui instrutores qualificados/disponíveis, detecta conflitos e slots sem instrutor; tenta múltiplos restarts para minimizar conflitos
- Exibe prévia em tabela com status por turma (`✅ Pronta` / `⚠ Com conflito` / `⚠ Sem instrutor` / erros)
- **"Criar X turma(s)"** → grava todas as rows em `schedules`. Datas no passado ou a >30 dias exigem senha (`DateGuardModal`)

#### 5.13.1 Histórico de pacotes (LOG)

Cada lote criado é registrado como um **pacote** persistido (`relyon_ai_packages`, sincronizado no banco). O LOG fica abaixo da prévia e lista os pacotes do mais recente ao mais antigo.

- **Cartão do pacote** mostra: nome (ou `Pacote #version`), versão (`v1`, `v2`...), origem (📂 Planilha / ✍️ Manual / misto), data-hora (`fmtDateTimeBR`), autor (`createdBy`), nº de turmas ativas, nº de turmas já removidas e badge de conflitos
- **Clique no cartão** expande a lista de todas as turmas lançadas no pacote (nome da turma, treinamento/GCC, data, tradutor, status). Turmas já apagadas da Programação aparecem esmaecidas com a tag `(removida)`
- **Editar** (`✏️`) — renomeia o pacote, adiciona uma nota e permite **marcar turmas para remover**. Remover uma turma apaga a turma correspondente da Programação (via `_deleteSchedulesByClassId`). Se houver remoções, exige senha (`DeleteGuardModal`)
- **Excluir** (`🗑️`) — **desfaz o lote inteiro**: remove o pacote do LOG e apaga da Programação todas as turmas que ele criou. Ação irreversível, exige senha (`DeleteGuardModal`)

### 5.15 Comunicação (`ComunicacaoPage`)

Canal de solicitações entre Instrutor e Planejador. Substitui a comunicação informal (WhatsApp, telefone) por um fluxo rastreável com log de aprovação e geração automática de ausência.

**Acesso por role:**
- **Instrutor** → vê apenas a aba "Requisição" com formulário + histórico próprio
- **Planejador / Admin / Developer** → vê apenas a aba "Gestão" com todas as solicitações de todos os instrutores
- **Customer Service** → sem acesso

> **Importante:** a página é única (`ComunicacaoPage`) mas se comporta como duas telas distintas a depender do role. Não há vazamento entre instrutores — o filtro `myRequests` usa `String(r.instructorId) === String(user.id)`.

#### 5.15.1 Aba Requisição (Instrutor)

- **Botão "+ Nova Solicitação"** abre formulário em etapas:
  1. **Seleção de tipo** — lista os 6 tipos da §3.9 (`REQUEST_TYPES`)
  2. **Preenchimento** — varia por `period`:
     - `single` → 1 data + checkbox "FRAÇÃO DO DIA" (com `startTime`/`endTime` opcionais)
     - `range` → De / Até
     - `none` (Outro motivo) → apenas observações; período definido pelo Planejador na aprovação
  3. **"Estou doente"** tem fluxo especial: pergunta "vai faltar hoje?" → se SIM, registra ausência imediata para hoje e envia solicitação `absenceCreated: true`; se NÃO, instrui a procurar a Enfermaria ao chegar
- **Histórico "Minhas solicitações"** — todas as próprias requisições com status (Aguardando / Aprovada / Rejeitada), datas, observação e — quando decidida — log de quem aprovou/rejeitou e feedback do Planejador

#### 5.15.1.1 Reivindicar Programação (instrutor autora, planejador aprova) — 2026-06-30

Cenário: o instrutor foi orientado verbalmente ("pelos corredores") a ocupar/atuar numa programação e o sistema não foi atualizado. A reivindicação é uma **mudança encenada que o próprio instrutor autora**; o planejador é só o **aprovador**. Ao aprovar, a programação é **lançada de fato** no store correto.

Wizard "por perguntas" (`ClaimWizard`, em `communication.js`): **dia → razão**.
- **INSTRUÇÃO** → lista as **turmas daquele dia** (de `relyon_schedules`); o instrutor escolhe a turma → vê as disciplinas/slots do dia → faz **uma** de duas ações:
  - **Assumir vaga** — troca o instrutor da row pelo próprio (substituição). Quem sai simplesmente fica sem aquela vaga (sem notificação; se isso desfaz um conflito do deslocado, melhor).
  - **Entrar na equipe** — adiciona-se como slot extra na disciplina, com função escolhida (`CLAIM_ROLE_OPTS`).
- **APOIO** → escolhe um tipo da Linha do Tempo (`CLAIM_APOIO_TYPES` — subconjunto "apoio interno" de `ACTIVITY_TYPES`: manutenção, desenvolvimento, CS, almoxarifado, cenário, marketing, QSMS, PDI) + horário. Lança uma atividade (`relyon_activities`).

O payload fica em `req.claim` (nada toca a programação ainda). No `TicketModal`/`ApprovePanel` o planejador vê um **antes → depois** (`ClaimSummary`). Ao confirmar (`doApprove` → `materializeClaim`): aplica em `setSchedules`/`setActivities`, **revalida a row alvo** (se a turma mudou desde o pedido, aborta com aviso em vez de aplicar às cegas), avisa-e-confirma conflito de horário do reivindicante (`scheduleSlotConflict`, helper global em `config.js`), grava antes/depois no LOG e guarda `req.claimResult` para permitir **desfazer** se a solicitação for excluída.

#### 5.15.2 Aba Gestão (Planejador) — ciclo de vida em 4 estágios

**Reescrito em 2026-06-01** (ver DESIGN §22 "Ciclo de vida de solicitações"). O status bruto (`pendente`/`aprovada`/`rejeitada`/`excluida`) não é o que aparece na UI — a tela deriva um **estágio de ciclo de vida** (`lifecycleStage`, função pura em `communication.js`) a partir do status + `cienteAt` + datas:

| Estágio | Quando | Cor |
|---|---|---|
| **Em aberto** | pendente, sem "ciente" ainda | laranja |
| **Em andamento** | pendente, planejador já deu "Ciente" | azul |
| **Fechado** | aprovada, ainda dentro do período (`endDate`/`startDate` ≥ hoje) | verde |
| **Finalizado** | aprovada e já passou o período **ou** rejeitada (rejeição finaliza na hora) | cinza |
| **Excluída** | soft-delete — preserva todo o LOG de chat/decisão | vermelho |

- **5 filtros** na `GestaoTab` (contadores entre parênteses), um por estágio acima.
- Cada solicitação tem um **protocolo** (`genProtocol`, formato `DDMMAAAA-HHmm-seq`) atribuído na criação — aparece no card e no `TicketModal`.
- **Card de solicitação**: protocolo, nome do instrutor, tipo, período, badge de exclusão pendente (se houver), badge de prioridade (📌, borda laranja, sobe ao topo em "Em aberto").
- **`TicketModal`** (abre ao clicar no card) é onde acontecem as ações, condicionadas ao estágio e ao papel (`rel.owner` = dono da solicitação, `rel.approver` = quem pode decidir):
  - **Dar Ciente** (estágio *aberto*, aprovador) — sinaliza que o planejador já viu, mensagem some da fila "nova"; move para *andamento*.
  - **Aprovar / Rejeitar** (`ApprovePanel`, estágio *andamento*, aprovador) — aprovar cria a ausência (se `absenceCreated` ainda for `false`) e, para `ferias`/`abono_aniversario`, enfileira o aviso ao DP (§5.15.2.1); rejeitar grava `rejectionReason`. Ambos disparam notificação ao instrutor e um registro imutável no chat-LOG (`mkMsg(..., "decision")`).
  - **Chat** — thread de mensagens por solicitação (`req.messages`, append-only), visível a dono e aprovador.
  - **Exclusão governada** — dono **solicita** exclusão (`deleteStatus: "pending"`); aprovador **aprova** (`doApproveDeletion` → soft-delete, `status: "excluida"`) ou **recusa** (`refuseDeletion`). Planejador também pode excluir **direto** (`deleteDirect`), sem passar pela solicitação do dono — usado para remover lançamentos errados.
- Todas as transições gravam entrada no LOG (`req.messages`, tipo `"decision"`/`"delete"`/`"ciente"`/`"edit"`) — histórico nunca é sobrescrito, só anexado.

#### 5.15.2.1 Aviso ao DP (Férias / Abono Aniversário) — 2026-07-01

Ao **aprovar** uma solicitação `ferias` ou `abono_aniversario` que efetivamente virou ausência real (Freelancer/PJ não — para eles vira "Livre", não é benefício trabalhista, ver `CLT_ONLY_ABS_CATEGORIES`/`treatAsFree`), o sistema anexa `req.dpNotify = { status: "pending", queuedAt, to, subject, body }` — um e-mail já pronto para o DP, com colaborador/tipo/período/aprovador.

**Por quê um e-mail pronto em vez de envio automático:** o tenant Microsoft 365 da empresa não libera consent no Entra ID (Azure AD) para uma integração via Microsoft Graph. Sem API, o envio de fato é feito por **cowork** (Claude operando o navegador do planejador, já logado no Outlook Web) — não por um serviço de backend.

- **`DpNotifyPanel`** (topo da aba Gestão, só para quem tem `canPlan`) — lista os `dpNotify.status === "pending"`, com 3 ações por item:
  - **Abrir no Outlook** — deeplink `outlook.office.com/mail/deeplink/compose?to&subject&body` (preenche, não envia — usuário confere e envia manualmente).
  - **Copiar** — copia o e-mail formatado para a área de transferência.
  - **Marcar enviado** — seta `dpNotify.status: "sent"` + `sentAt`/`sentBy`. Usado tanto pelo planejador quanto pelo fluxo cowork (que clica o mesmo botão via automação de navegador, nunca escrevendo direto no Supabase — ver EXECUTE.md).
- Testado fim a fim em produção em 2026-07-01 (aprovação real → fila → cowork compôs, planejador revisou/ajustou texto e destinatários, cowork enviou pelo Outlook do planejador → cowork marcou enviado no painel). Ponto de restauração no git: tag `feature/dp-notify-ferias-abono`.

#### 5.15.3 Migração de IDs legados

A versão inicial salvava `instructorId: String(user.instructorId)` — campo inexistente no objeto `user` de instrutor, resultando em `"undefined"` para todas as solicitações.

**Correção 2026-05-22:** uso de `user.id`. Para requisições já gravadas com ID inválido, há uma migração automática em `React.useEffect` na montagem da `ComunicacaoPage`: busca o instrutor por `instructorName` e reatribui o ID correto. Roda uma vez, idempotente.

#### 5.15.4 Integração com Notificações

Aprovação e rejeição disparam `createNotification` (§5.5.1) com `type: "request_update"` para o instrutor. Aparece no sino do `InstructorDashboard` com título e corpo descritivos.

---

## 6. Persistência

### Tecnologia
**Supabase** — tabela `app_state` (key, value).
Projeto: `snpvqqsmwrlazawjknme`.

### Chaves em `app_state`
- `relyon_schedules` *(legado — hoje vive em tabela dedicada)*
- `relyon_trainings`
- `relyon_areas`
- `relyon_instructors`
- `relyon_users`
- `relyon_absences`
- `relyon_locals`
- `relyon_holidays`
- `relyon_activities`
- `relyon_requests`

### Tabelas dedicadas (fora de `app_state`)
- `relyon_schedules` — escalas com Realtime (ver §3.7 / DESIGN §2.3)
- `relyon_notifications` — central de notificações do instrutor (ver §5.5.1)
- `push_subscriptions` — subscriptions Web Push do instrutor (push real, projeto separado em fase 2)

### Sessão
- Chave `relyon360_user` em `sessionStorage` mantém o usuário logado entre reloads
- Chaves `relyon360_tabs` e `relyon360_activeTabId` em `sessionStorage` mantêm as abas de programação abertas entre reloads (limpas no logout)

### Reset
No console do navegador:
```js
window.__resetRelyOn360()
```
Apaga todas as chaves e recarrega o app com os dados iniciais.

### Dívidas técnicas
- ~~Senhas em plain text~~ → **Corrigido 2026-04-10:** bcrypt hash (bcryptjs, cost 8) com migração automática
- ~~Chave `anon` exposta sem RLS~~ → **Corrigido 2026-04-16:** RLS configurado em `app_state`; DELETE bloqueado para anon; INSERT restrito às 7 chaves conhecidas; 6 funções com `search_path` corrigidas. Risco residual: anon ainda pode ler e sobrescrever valores (inevitável sem Supabase Auth)

---

## 7. Fora do Escopo (por ora)
- Backend / API REST própria (Supabase é o backend)
- Autenticação real (Supabase Auth / JWT) — senhas já são bcrypt hash, mas auth ainda é client-side
- Envio de e-mail ou WhatsApp automático (os campos em `areas` existem, mas não há integração)
- App mobile nativo
- Integração com ERP / RH
