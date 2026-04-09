# SPEC — RelyOn 360 Scheduler
> Fonte de verdade do sistema. Em caso de conflito entre código e spec, a spec vence.

---

## 1. Visão Geral

**Produto:** RelyOn 360 Scheduler
**Empresa:** RelyOn Nutec — Macaé/RJ
**Propósito:** Gerenciar a programação de turmas de treinamento (instrutores, salas, datas, módulos) de forma visual e persistente.
**Stack:** Single-file HTML · React 18 + Babel Standalone · LocalStorage (futuro: Supabase)
**Arquivo principal:** `RelyOn360_Scheduler.html`

---

## 2. Tipos de Acesso — Usuários e Clientes

O App tem um único frontend com **duas experiências distintas** baseadas em role.

### 2.1 Usuários (trabalham dentro do App)
Planejam, configuram e gerenciam o sistema.

| Role | Descrição |
|------|-----------|
| `developer` | Acesso total, incluindo configurações técnicas |
| `admin` | Acesso total operacional |
| `planner` | Cria e edita turmas, não gerencia usuários/áreas |

### 2.2 Clientes (acessam o App para consumir informações)
Visualizam e interagem com dados definidos pelos Usuários.

| Role | Descrição |
|------|-----------|
| `instructor` | Vê sua própria programação, confirma presença |
| `cs` | Customer Success — visão de turmas e status |
| `hr` | RH — visão de instrutores e presenças |

> **Regra:** Clientes não planejam, não configuram, não excluem. Apenas visualizam e executam ações limitadas (ex: confirmar presença).

---

## 3. Entidades e Modelo de Dados

### 3.1 Área (`areas`)
Quatro áreas operacionais na RelyOn:

| Área | Descrição |
|------|-----------|
| OPITO | Segurança de plataforma offshore |
| INCÊNDIO | Combate a incêndio (CBINC) |
| MARINHA | Embarcações de sobrevivência e salvamento |
| INDUSTRIAL | Trabalho em altura, espaço confinado, movimentação de cargas |

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| name | string | nome da área |
| leader | string | nome do líder |
| color | string | hex de cor para UI |

### 3.2 Treinamento (`trainings`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| gcc | string | código do treinamento (ex: "OBS308") |
| area | number | id da área |
| name | string | nome completo |
| totalMinutes | number | carga horária total em minutos |
| defaultSchedule | boolean | true = usa grade 08–12/13–17 |
| modules | Module[] | lista de disciplinas |

### 3.3 Módulo (dentro de Treinamento)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| name | string | nome da disciplina |
| type | "TEORIA" \| "PRÁTICA" | tipo da disciplina |
| locals | string[] | **lista de locais válidos para esta disciplina** (fonte de verdade) |
| priority | number | ordem de exibição |
| minutes | number | duração em minutos |
| instructorCount | number | número de instrutores necessários simultaneamente |
| sameDay | boolean | deve ocorrer no mesmo dia |

> **Sobre `instructorCount`:** quando > 1, significa que N instrutores atuam **juntos**, no mesmo local, no mesmo horário — não em locais ou horários diferentes. Exemplo: prática que exige supervisão dupla. Também se aplica quando há tradução simultânea (sempre +1).

> **Sobre `locals`:** os locais possíveis são definidos **no cadastro do módulo**. Durante a criação do planejamento, apenas esses locais são considerados. A lógica de preferência de local respeita os limites definidos por módulo — nunca reutiliza o local de outro módulo de mesmo tipo se não estiver na lista do módulo atual.

### 3.4 Locais (LOCALS)
Locais físicos disponíveis na unidade. Cada local tem:
- `env`: `"Teórico"` ou `"Prático"`
- `subtype`: `"incendio"` | `"piscina"` | `"industrial"` | `null`
- `type`: agrupamento por unidade (ex: "RelyOn Macaé")

Regra de filtro por módulo:
- TEORIA → locais com `env: "Teórico"`
- PRÁTICA → locais com `env: "Prático"` + filtro por subtype quando aplicável (ex: módulo CBINC → `subtype: "incendio"`)
- A lista final é restringida pelo campo `locals[]` do módulo no cadastro

> **Cenários cross-área:** um treinamento OPITO pode ter módulos que usam cenário de piscina E módulos que usam cenário de incêndio. O `locals[]` de cada módulo já define qual cenário é válido — o sistema não precisa inferir isso a partir da área.

### 3.5 Instrutor (`instructors`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| name | string | nome completo |
| area | string | área de atuação principal |
| skills | string[] | nomes das disciplinas que pode ministrar |
| email | string | e-mail profissional |
| phone | string | telefone |
| contract | string | tipo de contrato |
| avatar | string | iniciais para avatar |
| active | boolean | ativo/inativo |

### 3.6 Ausência (`absences`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| instructorId | number | referência ao instrutor |
| date | string | "YYYY-MM-DD" |
| category | string | tipo de ausência (ver §6.3) |
| startTime | string | "HH:MM" — opcional para dia inteiro |
| endTime | string | "HH:MM" — opcional para dia inteiro |
| note | string | observação livre |

### 3.7 Turma / Programação (`schedules`)
Cada registro = **uma linha** da grade: uma disciplina, **um instrutor**, um local, uma data.
Para módulos com `instructorCount: 2`, existem 2 registros com o mesmo horário e módulo — um por instrutor.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
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
| role | string | papel do instrutor nessa linha |
| studentCount | string | número de alunos |
| status | "Pendente" \| "Confirmado" | status de confirmação |
| confirmedAt | string | ISO timestamp da confirmação |
| confirmedBy | string | nome de quem confirmou |

### 3.8 Usuário (`users`)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | number | identificador único |
| name | string | nome completo |
| email | string | e-mail |
| username | string | login |
| password | string | senha (plaintext — migrar p/ hash) |
| role | string | ver §2.1 e §2.2 |
| avatar | string | iniciais |
| mustChangePass | boolean | força troca de senha no próximo login |

---

## 4. Regras de Negócio

### 4.1 Grade de Horários
- **Manhã:** 08:00 → 12:00 (240 min úteis)
- **Almoço:** 12:00 → 13:00 (não conta como tempo de treinamento)
- **Tarde:** 13:00 → 17:00 (240 min úteis)
- **Dia útil total:** 480 min
- Um módulo pode cruzar o almoço — nesse caso, 1h é adicionada ao horário de término (wall-clock)
- Ao atingir 17:00, o próximo módulo inicia no dia seguinte às 08:00

### 4.2 Ordenação de Módulos (sortModules)
1. Módulos CBINC: TEORIA antes de PRÁTICA
2. Módulos regulares: por campo `priority`
3. PROVA: sempre ao final
4. TEMPO RESERVA: sempre após PROVA

### 4.3 Atribuição de Instrutores (initPlan)
1. **Score:** contar quantos módulos do treinamento cada instrutor está habilitado a ministrar
2. **Committed list:** ao escolher um instrutor, ele entra na lista de comprometidos
3. **Prioridade:** instrutor já comprometido > instrutor com maior score > qualquer habilitado disponível
4. **Multi-instrutor:** quando `instructorCount > 1`, preencher N slots com instrutores diferentes (mesma disciplina, mesmo horário, mesmo local — N profissionais simultâneos)
5. **REVISÃO / TEMPO RESERVA:** devem ter o mesmo instrutor da PROVA
6. **Checagem de ausência:** instrutor ausente não pode ser sugerido

### 4.4 Atribuição de Locais (initPlan)
- A **fonte de verdade** é `mod.locals[]` definido no cadastro de cada módulo
- O local preferido é reutilizado para o mesmo módulo em execuções futuras (`preferredLocals[mod.id]`)
- Para `instructorCount > 1`, locais diferentes por slot quando disponíveis (local[0], local[1], ...)
- Se o local preferido não estiver na lista `mod.locals`, usa o primeiro disponível

### 4.5 Fluxo de Confirmação de Presença
```
Usuário cria turma → status: "Pendente"
       ↓
Instrutor (Cliente) acessa App → vê sua programação
       ↓
Instrutor clica "Confirmar Programação"
       ↓
status: "Confirmado" · confirmedAt = now · confirmedBy = instrutor
       ↓
Dashboard do App: contador de instrutores ainda não confirmados
Dashboard do Instrutor: notificação de pendência removida
```

### 4.6 Controle de Acesso
| Funcionalidade | developer | admin | planner | instructor | cs | hr |
|----------------|-----------|-------|---------|------------|----|----|
| Ver programação completa | ✓ | ✓ | ✓ | — | ✓ | — |
| Ver própria programação | ✓ | ✓ | ✓ | ✓ | — | — |
| Criar/editar/excluir turma | ✓ | ✓ | ✓ | — | — | — |
| Confirmar presença | — | — | — | ✓ | — | — |
| Gerenciar treinamentos | ✓ | ✓ | — | — | — | — |
| Gerenciar instrutores | ✓ | ✓ | — | — | — | — |
| Gerenciar ausências | ✓ | ✓ | ✓ | — | — | — |
| Gerenciar usuários | ✓ | ✓ | — | — | — | — |
| Gerenciar áreas | ✓ | ✓ | — | — | — | — |

### 4.7 Ausências — Categorias de Dia Inteiro
Férias, Licença Médica, Licença Maternidade/Paternidade, Afastamento, Falta Justificada, Falta Não Justificada, Suspensão

---

## 5. Funcionalidades por Tela

### 5.1 Login
- Campos: usuário + senha
- Erro visual em credencial inválida
- Se `mustChangePass: true` → redireciona para ChangePasswordScreen

### 5.2 Troca de Senha
- Exige senha atual + nova + confirmação
- Atualiza `users` e seta `mustChangePass: false`

### 5.3 Dashboard
**Visão Usuário:**
- Resumo de turmas ativas
- Contador de confirmações pendentes por instrutor

**Visão Cliente/Instrutor:**
- Próximas disciplinas do instrutor logado
- Notificação de confirmações pendentes

### 5.4 Programação (SchedulePage) — Visão Usuário

**Step 0 — Lista de Turmas**
- Busca por nome de turma ou GCC
- Cards expansíveis com disciplinas por dia
- Cada linha: horário, módulo, local, instrutor, status
- Ações: Editar, Excluir (com guard de senha)

**Step 1 — Nova Turma**
- Selecionar treinamento, nome, data de início

**Step 2 — Planejamento Automático**
- Grade gerada por `initPlan` + `recalcTimes`
- Módulos com `instructorCount > 1` mostram N sub-linhas de instrutor/local
- Drag & drop para reordenar módulos
- Dropdowns de local e instrutor editáveis inline
- Botão Recalcular / Confirmar Planejamento

**Step 3 — Editar Turma Existente**
- Mesma interface do Step 2, carregada de `schedules`

### 5.5 Visão do Instrutor (InstructorView)

Tela única com duas seções: Dashboard e Consulta.

**Dashboard (tela inicial após login):**
- Bloco em destaque: **Hoje** — todas as disciplinas do instrutor no dia atual (horário, turma, módulo, local)
- Bloco secundário: **Amanhã** — prévia rápida do próximo dia útil
- Se não houver nada hoje/amanhã: mensagem "Sem programação para este dia"
- Contador de confirmações pendentes no topo

**Consulta por data:**
- Seletor de data (calendário) para consultar qualquer dia — passado, presente ou futuro
- Exibe todas as disciplinas do instrutor naquela data
- Agrupado por turma quando há mais de uma no mesmo dia

**Regras:**
- Instrutor vê **apenas** os registros de `schedules` onde `instructorId === currentUser.linkedInstructorId`
- Acesso somente leitura — sem criar, editar ou excluir
- Botão "Confirmar" disponível para disciplinas com `status: "Pendente"`
- Ao confirmar: `status → "Confirmado"`, `confirmedAt = now()`, `confirmedBy = instrutor.name`

**Vínculo instrutor ↔ usuário:**
- Campo `linkedInstructorId` no registro de usuário com role `instructor`
- Aponta para o `id` do registro em `instructors[]`

### 5.6 Treinamentos (TrainingsPage)
- CRUD de treinamentos
- CRUD de módulos dentro de cada treinamento

### 5.7 Instrutores (InstructorsPage)
- Lista em acordeão por área
- Filtros por líder e área
- Detalhe com dados pessoais, habilidades, contrato
- Edição inline

### 5.8 Ausências (AbsencesPage)
- CRUD de ausências
- Suporte a ausência parcial e dia inteiro
- Visualização por instrutor e por data

### 5.9 Usuários (UsersPage) — developer/admin
- CRUD de usuários
- Reset de senha (`mustChangePass: true`)

### 5.10 Áreas (AreasPage) — developer/admin
- CRUD de áreas com cor e líder

---

## 6. Persistência
- **Atual:** LocalStorage — chaves: `relyon_schedules`, `relyon_trainings`, `relyon_areas`, `relyon_instructors`, `relyon_users`, `relyon_absences`
- **Reset:** `window.__resetRelyOn360()` no console do navegador
- **Futuro:** Supabase (PostgreSQL) com autenticação real e hash de senha

---

## 7. Fora do Escopo (por ora)
- Backend / API REST própria
- Hash de senhas (dívida técnica conhecida)
- Envio de e-mail automático
- Relatórios / exportação PDF
- App mobile nativo
- Integração com ERP / RH
