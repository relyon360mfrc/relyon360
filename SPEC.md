# SPEC — RelyOn 360 Scheduler
> Fonte de verdade do sistema. Em caso de conflito entre código e spec, a spec vence.
> Última revisão: 2026-04-16

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
| `customer_service` | Acessa relatórios e visão completa de turmas (consultivo) |

> Nota: os três primeiros (developer, admin, planejador) trabalham ativamente no App; `customer_service` é consultivo mas opera na visão de Usuário (não de Cliente).

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

O sistema define uma lista de permissões finas (ver §4.6) atribuíveis ao usuário `planejador`. A função `hasPermission(user, permId)` valida em runtime: developer/admin passam sempre; planejador precisa ter o ID em `permissions[]`. Aplicado em: `plan_edit`, `train_edit`, `skills_edit`, `ai`.

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
| defaultSchedule | boolean | true = usa grade 08–12/13–17 |
| modules | Module[] | lista de disciplinas |

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

### 3.3a Flag EAD
| Campo | Tipo | Descrição |
|-------|------|-----------|
| ead | boolean | `true` = turma ministrada remotamente; ativa locais online no `LocalsSelector` (ONLINE, MICROSOFT TEAMS, ZOOM) em vez dos locais físicos |

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
| status | "Pendente" \| "Confirmado" \| "Cancelado" | status de confirmação |
| confirmedAt | string | ISO timestamp da confirmação — opcional |
| confirmedBy | string | nome de quem confirmou — opcional |
| issueLog | {type, text, by, at}[] | histórico de reportes e reconhecimentos do instrutor — opcional |

> **Sobre `issueLog`:** array de entradas `{ type: "report"|"ack", text: string, by: string, at: ISO }`. Instrutor reporta problema (type "report"), planner reconhece (type "ack"). Migração automática converte campo legado `issue` (string) para `issueLog[]`.

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
8. **REVISÃO / TEMPO RESERVA:** devem ter o mesmo instrutor da PROVA
9. **Checagem de ausência:** instrutor ausente no horário do slot não é sugerido (`isInstructorAbsent`)

### 4.4 Atribuição de Locais (`initPlan`)
- A filtragem base é feita por `getLocalOpts(mod, training)` — por `env` (Teórico/Prático) e subtype quando CBINC
- Para o mesmo treinamento, o local escolhido para um módulo é reutilizado em módulos futuros do **mesmo módulo** (`preferredLocals[mod.id]`)
- Todos os slots do mesmo módulo compartilham o **mesmo local** (um cenário para toda a equipe)

### 4.5 Fluxo de Confirmação de Presença
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
| reports | Acessar Relatórios | Relatórios |
| ai | IA — Sugerir Escala | Relatórios |

> **Implementação:** `hasPermission(user, permId)` verifica: developer/admin passam sempre; planejador precisa ter o ID em `user.permissions[]`. Hoje aplicado em `plan_edit`, `train_edit`, `skills_edit` e `ai`. As funções `canAdmin()` e `canPlan()` (baseadas em `role`) continuam como gatekeepers de nível macro.

### 4.7 Ausências — Tipos e Categorias

| Tipo | Cor | Categorias |
|------|-----|------------|
| `involuntario` (Absenteísmo Involuntário) | vermelho | Atestado Médico · Licença Paternidade/Maternidade · Consultas e Exames (com declaração) |
| `voluntario` (Absenteísmo Voluntário) | laranja | Falta · Atrasos e Saídas Antecipadas · Suspensão Disciplinar |
| `planejada` (Ausência Planejada) | verde | Folga Banco de Horas · Férias · Treinamento/Evento Externo |

**Categorias de dia inteiro** (não exigem `startTime`/`endTime` e bloqueiam o instrutor no dia inteiro em `isInstructorAbsent`):
Atestado · Férias · Licença · Suspensão

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
- Bloco "Hoje" — aulas do dia com destaque visual (cards com className, módulo, role, colegas)
- Pendências filtradas para hoje + amanhã apenas
- Timeline visual horizontal por período (MANHÃ / TARDE / NOITE)
- Ações condicionais por dia: passado=nenhuma, hoje/amanhã=confirmar, futuro=apenas reportar
- Confirmar individual + "Confirmar tudo hoje"
- Botão "Reportar Problema" com modal de texto → grava em `issueLog[]`

**`InstructorProfile` — Meu Perfil**
- Dados pessoais (read-only)
- Competências agrupadas por treinamento (read-only)
- Troca de senha (validação: senha atual via bcrypt compare, nova ≥ 6 chars, confirmação)

**`ReportsPage` — Meu Histórico**
- Grid visual MANHÃ / TARDE / NOITE (mesmo formato do relatório admin de Utilização Diária)
- Datas nas linhas (badge com dia, mês abreviado e dia da semana)
- Períodos nas colunas: MANHÃ (08-12), TARDE (13-17), NOITE (17-21)
- Bolinhas verdes (ocupado) e cinzas (livre) com tooltip detalhado ao hover
- Stat cards com totais (Aulas, Horas, Confirmadas, Dias)
- Filtros de período (De/Até) e legenda

**Regras gerais da visão de instrutor:**
- Vê **apenas** registros de `schedules` onde `instructorId === user.id` (ou `linkedInstructorId` se admin estiver visualizando como instrutor)
- Acesso somente leitura a agendas; só pode confirmar presença e trocar própria senha

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
**Modo Admin — 5 abas:**
- **Utilização:** datepicker; matriz visual Instrutores × Períodos (MANHÃ / TARDE / NOITE); células mostram salas/horários
- **Carga Horária:** datepicker; grade de ocupação por instrutor (células com disciplina, turma e horário)
- **Cursos:** filtros; lista de treinamentos com contagem de turmas
- **Salas:** visão de ocupação de salas num dia específico; exportação PDF
- **Programação da Turma:** filtros de período + treinamento + turma; linha do tempo por disciplina; exportação PDF
- **Horas por Instrutor:** seletor de mês; breakdown por Teoria / Prática / Outras; barra proporcional; tags de treinamentos entregues; exportação PDF via impressão

**Modo Instrutor:**
- Ver §5.5 — Meu Histórico

### 5.13 IA — Sugestão de Escala (`AiPage`)
- Seleção de treinamento, data e local
- "Gerar Sugestão com IA" — heurística (não IA real): filtra instrutores qualificados e disponíveis, detecta conflitos
- Exibe sugestão por módulo + status
- Ação "Aplicar Escala" → cria rows em `schedules`

---

## 6. Persistência

### Tecnologia
**Supabase** — tabela `app_state` (key, value).
Projeto: `snpvqqsmwrlazawjknme`.

### Chaves em `app_state`
- `relyon_schedules`
- `relyon_trainings`
- `relyon_areas`
- `relyon_instructors`
- `relyon_users`
- `relyon_absences`
- `relyon_locals`

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
