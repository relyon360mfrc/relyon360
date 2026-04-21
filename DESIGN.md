# DESIGN — RelyOn 360 Scheduler
> Decisões técnicas de arquitetura. Explica o *como*, enquanto SPEC explica o *quê*.
> Última revisão: 2026-04-16

---

## 1. Arquitetura

```
relyon360/
├── index.html (~59 linhas — shell: CDN scripts + 14 script tags + SW)
├── js/
│   ├── config.js       (~54 ln)  Supabase, hashPw/checkPw, usePersisted, useIsMobile, utils
│   ├── constants.js    (~279 ln) LOCALS, INITIAL_*, USERS, INSTRUCTORS, PERMISSIONS_LIST, etc.
│   ├── components.js   (~233 ln) Icon, Input, Sel, SearchSel, Btn, Modal, DeleteGuardModal, etc.
│   ├── auth.js         (~214 ln) Login, ChangePasswordScreen, Sidebar
│   ├── dashboard.js    (~418 ln) LocalsReportPage, Dashboard, WeeklyCalendarView
│   ├── schedule.js     (~1265 ln) Schedule (wizard Step 1-3, initPlan, recalcTimes, savePlan)
│   ├── trainings.js    (~719 ln) TrainingsPage
│   ├── instructors.js  (~432 ln) InstructorsPage
│   ├── locals.js       (~153 ln) LocalsPage
│   ├── ai.js           (~72 ln)  AiPage
│   ├── instructor.js   (~501 ln) TruncText, InstructorScheduleCard, InstructorDashboard, InstructorProfile
│   ├── reports.js      (~729 ln) ReportsPage
│   ├── admin.js        (~459 ln) UsersPage, AbsenteismoPage, SettingsPage, SobrePage
│   └── app.js          (~232 ln) App(), AppLoader(), ReactDOM.render
└── sw.js, manifest.json, icon.svg, *.png
```

**Decisão:** Split em 14 arquivos JS carregados por `<script type="text/babel" src="js/xxx.js">` em ordem. Babel standalone 7.23.2 processa cada arquivo sequencialmente; variáveis declaradas em arquivos anteriores ficam disponíveis nos seguintes (escopo global compartilhado). Sem build step.

---

## 2. Estado Global e Persistência

### 2.1 Hook `usePersisted` (Supabase-backed)

Toda entidade persistida é gerenciada no componente `App()` via `usePersisted`, que combina `useState` + upsert na tabela `app_state`.

```js
const [schedules,   setSchedules]   = usePersisted("relyon_schedules",   INITIAL_SCHEDULES);
const [trainings,   setTrainings]   = usePersisted("relyon_trainings",   INITIAL_TRAININGS);
const [areas,       setAreas]       = usePersisted("relyon_areas",       INITIAL_AREAS);
const [instructors, setInstructors] = usePersisted("relyon_instructors", INSTRUCTORS);
const [users,       setUsers]       = usePersisted("relyon_users",       USERS);
const [absences,    setAbsences]    = usePersisted("relyon_absences",    INITIAL_ABSENCES);
```

### 2.2 Implementação

```js
const usePersisted = (key, initialValue) => {
  const [state, setState] = useState(() => {
    if (_initialData && _initialData[key] != null) return _initialData[key];
    return initialValue;
  });
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    sb.from('app_state')
      .upsert({ key, value: state }, { onConflict: 'key' })
      .then(({ error }) => {
        if (error) console.error('[RelyOn] Erro ao salvar "' + key + '":', error.message);
      });
  }, [key, state]);
  return [state, setState];
};
```

**Por que `useRef(true)`?** Para que o primeiro render não faça um upsert desnecessário por cima de dados que já estão no Supabase. Só gravamos em mudanças subsequentes.

**Bootstrap:** antes de renderizar `<App/>`, é feito um único `select` em `app_state` preenchendo `_initialData`, que alimenta todos os `useState(lazy)` em uma só passagem.

### 2.3 Sessão
- `sessionStorage[relyon360_user]` — JSON do usuário logado
- É limpa no logout

### 2.4 Reset
```js
window.__resetRelyOn360()
```
Apaga todas as chaves em `app_state` e recarrega.

### 2.5 Password Hashing (bcryptjs)

Senhas são armazenadas como bcrypt hash (cost 8). Biblioteca: `bcryptjs` via CDN (`dcodeIO.bcrypt`).

```js
const _bc = dcodeIO.bcrypt;
const HASH_ROUNDS = 8;
const hashPw = (plain) => _bc.hashSync(plain, HASH_ROUNDS);
const checkPw = (plain, stored) => {
  if (!stored || !plain) return false;
  if (!stored.startsWith('$2')) return plain === stored; // legacy plaintext fallback
  return _bc.compareSync(plain, stored);
};
```

**Migração automática:** no `AppLoader`, antes de `setReady(true)`, todos os registros de `relyon_users` e `relyon_instructors` com senhas plaintext (que não começam com `$2`) são hasheados e persistidos no Supabase em uma única operação. Isso garante que dados legados sejam convertidos na primeira carga após o deploy.

**Pontos de uso:**
- **Login:** `checkPw(pass, user.password)` em vez de `===`
- **ChangePasswordScreen:** `hashPw(np)` antes de chamar `onDone`
- **Criar usuário/instrutor:** senha padrão ou do formulário é hasheada antes de persistir
- **Editar usuário/instrutor:** campo vazio = manter senha atual; preenchido = hash novo
- **DeleteGuardModal:** recebe prop `user` e verifica `checkPw(guard.pass, user.password)`
- **Settings guard:** mesma lógica de `checkPw` contra senha do usuário logado
- **Troca de senha (instrutor):** `checkPw` para validar senha atual, `hashPw` para nova

**Admin não pode mais ver senhas:** o botão "mostrar" foi substituído por "Resetar" (volta para senha padrão + `mustChangePass: true`).

---

## 3. Funções-chave de Agendamento

### 3.1 `recalcTimes(items, startDateStr, startMins)`
Distribui uma lista de `planItems` na grade horária 08–12 / 13–17. **Quebra módulos entre dias quando necessário.**

**Regras internas:**
```
LUNCH_S = 12*60    LUNCH_E = 13*60
DAY_START = 8*60   DAY_END = 17*60

Para cada item:
  remaining = item.mod.minutes
  while remaining > 0:
    - Se cur está no almoço → pular para 13:00
    - Se cur >= 17:00      → avançar para o próximo dia às 08:00
    - Calcular espaço até o fim do período atual (manhã ou tarde)
    - chunk = min(remaining, espaço disponível)
    - Criar row (primeira chunk usa o item original; subsequentes clonam com id sufixado)
    - remaining -= chunk
    - cur += chunk
```

Isso significa que um módulo de 8h iniciado às 08:00 termina às 17:00 do **mesmo dia**; um de 10h iniciado às 08:00 vira um bloco de 8h no dia 1 + 2h no dia 2.

### 3.2 `sortModules(mods)`
Ordena módulos para agendamento:
1. Regulares (não PROVA / não TEMPO RESERVA):
   - CBINC: TEORIA antes de PRÁTICA
   - Demais: por `priority` ascendente
2. PROVA ao final
3. TEMPO RESERVA após PROVA

### 3.3 `initPlan()`
Gerador do planejamento automático ao criar uma turma nova.

**Fluxo:**
```
1. sortModules()
2. Calcular instrScore (quantos módulos do treinamento cada instrutor pode ministrar)
3. recalcTimes() com 1 item por módulo → obter datas/horários
4. Para cada módulo (em ordem):
   a. Filtrar instrutores qualificados: skills.some(s => s.name === mod.name) E !isInstructorAbsent
   b. Ordenar por score desc
   c. leadPool = qualificados com canLead:true para esta disciplina
   d. Preencher N slots (instructorCount):
      - Slot 0 (Lead):  pool = leadPool  → committed primeiro, depois maior score
                        se leadPool vazio → slot fica vazio (sem fallback)
      - Slot 1..N (Assistentes): pool = qualified → mesma lógica committed/score
      - Ao escolher qualquer instrutor novo → adicioná-lo a committedInstrs
   e. Slot de Tradutor (se wizForm.withTranslator):
      - Sempre criado vazio ({ instructorId: "", local: sharedLocal, isTranslator: true })
      - Instrutor deve ser selecionado manualmente no Step 2
   f. Escolher local compartilhado para o módulo:
      - Se houver preferência registrada em preferredLocals[mod.id] → reusar se válido
      - Senão, primeiro local de getLocalOpts(mod, training)
      - Gravar em preferredLocals[mod.id]
   g. Criar slots[] com { instructorId, local } (todos com o mesmo local)
5. Pass 2: REVISÃO e TEMPO RESERVA → reatribuir para o mesmo instrutor da PROVA
6. setPlanItems(raw); setStep(2)
```

**Estrutura de um planItem:**
```js
{
  uid: "pi-0-101",              // string única: `pi-${idx}-${mod.id}`
  mod: { id, name, type, minutes, instructorCount, ... },
  date: "2026-04-09",
  startTime: "08:00",
  endTime: "13:00",             // reflete wall-clock, inclusive almoço
  hasTranslator: true,          // presente quando slot de tradução está ativo
  slots: [
    { instructorId: "5", local: "SALA 09" },               // Slot 0 — Lead
    { instructorId: "7", local: "SALA 09" },               // Slot 1 — Assistente
    { instructorId: "9", local: "SALA 09", isTranslator: true }  // Slot extra — Tradutor
  ]
}
```

### 3.4 `savePlan()`
Expande `planItems` em linhas de `schedules` via `flatMap` nos `slots`:
- 1 módulo com `instructorCount: 2` → 2 linhas em `schedules`, mesmo horário, mesmo local, instrutores diferentes.
- Fallback para dados antigos: `item.slots || [{ instructorId: item.instructorId || "", local: item.local || "" }]`.
- **Role assignment:** Slot 0 = Lead (tipo depende de PRÁTICA/TEORIA); Slots 1+ = "Assistant Instructor"; isTranslator = "Translator"
- **issueLog:** cada schedule pode ter `issueLog[]` — array de `{ type: "report"|"ack", text, by, at }` para rastreamento de problemas reportados por instrutores e reconhecidos por planners

### 3.5 `applyDaySchedule(items)`
Recalcula horários para itens em modo de edição (Step 3) sem perder os instrutores/locais já atribuídos. Usa a mesma lógica de almoço que `recalcTimes`.

### 3.6 `getLocalOpts(mod, training)`
Filtra `LOCALS` pelo tipo do módulo e pela área do treinamento:
- TEORIA → locais com `env: "Teórico"`
- PRÁTICA → locais com `env: "Prático"`
- Se `training.area` é COMBATE A INCÊNDIO → restringe a `subtype: "incendio"`

### 3.7 `isInstructorAbsent(instrId, date, startMins, endMins, absences)`
Verifica se um instrutor está ausente num intervalo:
1. Filtra ausências do instrutor na data
2. Se `category` é full-day (Atestado/Férias/Licença/Suspensão) → bloqueia o dia inteiro
3. Caso contrário, verifica sobreposição de horário (`startTime`/`endTime`)

---

## 4. Regras de Componentes React

### 4.1 Rules of Hooks
Todos os hooks (`useState`, `useEffect`, `useRef`) devem aparecer **antes de qualquer `return` condicional** num componente. Violação causa erros silenciosos ou tela em branco.

```js
// ✅ CORRETO
const MyPage = () => {
  const [filter, setFilter] = useState("");  // hook ANTES do early return
  if (loading) return <Spinner />;
  return <div>{filter}</div>;
};

// ❌ ERRADO
const MyPage = () => {
  if (loading) return <Spinner />;
  const [filter, setFilter] = useState("");  // quebra as Rules of Hooks
};
```

### 4.2 Estabilidade de Componentes
Componentes **nunca** devem ser definidos dentro de outros componentes (especialmente não dentro de condicionais ou renders). Isso causa remount a cada render e perde estado (ex: foco de input).

Exemplo real no projeto: `InstructorScheduleCard` é definido **fora** de `InstructorDashboard` justamente para não remontar a cada render do dashboard. Há comentário inline sinalizando isso.

```js
// ✅ CORRETO — definir fora
const InstructorScheduleCard = (props) => ( ... );
const InstructorDashboard = () => { ... usar <InstructorScheduleCard /> ... };

// ❌ ERRADO — definir dentro
const InstructorDashboard = () => {
  const Card = (props) => ( ... );   // nova referência a cada render!
  return <Card />;
};
```

### 4.3 Imutabilidade de estado
Nunca mutar arrays/objetos diretamente. Sempre derivar novo estado:
```js
setFoo(prev => [...prev, novo]);
setFoo(prev => prev.map(x => x.id === id ? { ...x, campo: valor } : x));
setFoo(prev => prev.filter(x => x.id !== id));
```

---

## 5. Controle de Acesso

```js
const canAdmin = u => u && (u.role === "developer" || u.role === "admin");
const canPlan  = u => canAdmin(u) || (u && u.role === "planejador");
```

### Roteamento por role
Em `App()`, a página inicial é definida assim:
```js
setActive(
  u.role === "instructor"
    ? "dashboard"   // → InstructorDashboard
    : (["developer","admin","planejador","customer_service"].includes(u.role)
        ? "dashboard"   // → Dashboard (admin)
        : "my-schedule")
);
```

### Permissões granulares
`PERMISSIONS_LIST` define permissões finas (plan_view, plan_edit, train_edit, etc.) armazenadas em `user.permissions[]`. A função `hasPermission(user, permId)` valida em runtime: developer/admin passam sempre; planejador precisa ter o ID em `permissions[]`. Aplicado em: `plan_edit` (criar/editar/excluir turma), `train_edit` (treinamentos e módulos), `skills_edit` (competências de instrutor), `ai` (IA no menu).

---

## 6. Padrões de Código

| Padrão | Regra |
|--------|-------|
| Datas | string `"YYYY-MM-DD"` — nunca objeto Date cru |
| Horários | string `"HH:MM"` — `timeToMins()` e `minsToTime()` para converter |
| IDs de entidade | `number` |
| `instructorId` em planItems/slots | `string` (por design — vem de `<select>`) |
| Imutabilidade | sempre `[...arr]` ou `{...obj}` — nunca mutação direta |
| Edição de estado | `setFoo(prev => [...prev, novo])` |
| Nomes de role (usuário) | `developer`, `admin`, `planejador`, `customer_service`, `instructor` (sem abreviações) |
| Nomes de role (instrutor) | `Lead Instructor`, `Theoretical Instructor`, `Practical Instructor`, `Support Instructor`, `Assistant Instructor`, `Translator` |
| Labels PT (`ROLE_PT`) | `Inst. Líder`, `Inst. Teórico`, `Inst. Prático`, `Inst. Apoio`, `Assist. Instrução`, `Tradutor` |
| Senha comparação | Sempre `checkPw(plain, hash)` — **nunca** `===` |
| Nomes de áreas | exatos como em `INITIAL_AREAS` — checagens regex usam casos `CBINC|INCÊNDIO|INCENDIO` |
| Módulo `type` | `"TEORIA"` ou `"PRÁTICA"` (MAIÚSCULA + acento) |
| Local `env` | `"Teórico"` ou `"Prático"` (capitalizado, não igual ao type do módulo) |

---

## 7. Ferramentas de Desenvolvimento

### 7.1 Edições pequenas (1–5 linhas)
Ferramenta `Edit` do Claude com indentação exata.

### 7.2 Edições grandes (> ~20 linhas)
Preferir um **script Python** via Bash, que lê/edita/grava o arquivo com `str.replace()`:

```python
path = r"C:\Users\mcarvalho\OneDrive - RelyOn\RelyOn 360 Scheduler\RELYON 360 - scheduler\relyon360\index.html"
with open(path, "r", encoding="utf-8") as f:
    html = f.read()

assert OLD in html, "trecho não encontrado — verifique indentação"
html = html.replace(OLD, NEW, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(html)
```

Nunca pular o `assert` — se o trecho não existir, **pare e investigue**.

### 7.3 Deploy
Usuário (Matheus) faz manualmente: **GitHub Desktop → Commit → Push → Vercel republica automaticamente**. Claude não executa push nem interage com Vercel.

---

## 7. Funcionalidades Recentes (2026-04-11)

### 7.1 Visão Semanal na Programação (`WeeklyCalendarView`)

Componente `WeeklyCalendarView` definido **fora** de `Schedule` (regra de estabilidade de componentes — §4.2).

**Estados adicionados em `Schedule`:**
- `viewMode` — `"list"` | `"week"`, padrão `"list"`
- `weekOffset` — inteiro de deslocamento em semanas relativo à semana atual, padrão `0`

**Lógica de semana:** calcula a segunda-feira da semana corrente ajustando pelo dia da semana (`getDay()`), depois aplica `weekOffset * 7` dias. Usa `setHours(12,0,0,0)` para evitar bugs de fuso.

**Acesso:** toggle "Lista / Semana" visível apenas para `canPlan(user)` (developer, admin, planejador). `customer_service` e `instructor` não veem o toggle.

**Clique em turma:** chama `loadClassForEdit(cls)` — abre Step 3 (edição) diretamente da visão semanal.

---

### 7.2 Campo `shortName` em Treinamentos

Campo opcional `shortName` (string, máx. 10 caracteres) adicionado à entidade `training` (SPEC §3.2).

**Uso:** prefixo do nome de turma gerado automaticamente em Schedule Step 1:
```js
const gcc = selTraining.shortName || selTraining.gcc;
const proximoNome = `${gcc} - ${String(proximo).padStart(2, "0")}`;
```
Fallback para `gcc` quando `shortName` está vazio — retrocompatível com todos os treinamentos existentes.

**Persistido:** via `setTrainings` → `usePersisted` → Supabase `relyon_trainings`.

---

### 7.3 Multi-seleção de Competências em Instrutores

**Estado substituído:**
- `newSkillVal: string` → `newSkillVals: Set<string>` (nomes de módulos selecionados)
- Adicionado `newSkillSearch: string` (busca dentro do painel de adição)

**Painel de adição:** lista de módulos disponíveis (não já atribuídos) agrupada por treinamento. Busca filtra por nome do módulo ou GCC do treinamento. Confirmar adiciona todos os selecionados de uma vez:
```js
const toAdd = [...newSkillVals].map(name => ({ name, canLead: false }));
updateInstr(detail.id, { skills: [...(detail.skills||[]), ...toAdd] });
```
`canLead` começa como `false` — usuário pode marcar individualmente após adicionar.

---

## 8. Funcionalidades Recentes (2026-04-12)

### 8.1 Sistema de Abas na Programação

O estado de wizard/edição de turmas foi elevado de `Schedule` para `App`, permitindo que as abas sobrevivam ao unmount do componente ao navegar entre páginas.

**Estado em `App()` — inicializado a partir de `sessionStorage` para sobreviver a F5:**
```js
const [scheduleTabs, setScheduleTabs] = useState(() => {
  try { const s = sessionStorage.getItem('relyon360_tabs'); return s ? JSON.parse(s) : []; } catch { return []; }
});
const [activeTabId, setActiveTabId] = useState(() => {
  try { const s = sessionStorage.getItem('relyon360_activeTabId'); return s ? JSON.parse(s) : null; } catch { return null; }
});
// Persistência reativa
React.useEffect(() => { sessionStorage.setItem('relyon360_tabs', JSON.stringify(scheduleTabs)); }, [scheduleTabs]);
React.useEffect(() => { sessionStorage.setItem('relyon360_activeTabId', JSON.stringify(activeTabId)); }, [activeTabId]);
```

**Estrutura de uma aba:**
```js
{
  id: 1713000000000,        // Date.now() — chave única
  title: "GCC - 01",       // nome da turma (atualizado ao concluir Step 1)
  step: 1,                  // 1 = wizard, 2 = planejamento, 3 = edição
  wizForm: { ... },         // estado do Step 1
  planItems: [],            // estado do Step 2
  editCls: null,            // turma carregada para edição (Step 3)
  editStudentCount: "",     // campos de edição
  editObservation: "",
  editItems: []
}
```

**Setters derivados em `Schedule`:** em vez de `useState` independentes, todos os setters de estado de wizard/edição são wrappers que gravam dentro da aba ativa via `updTab(patch)`:
```js
const updTab = patch => setScheduleTabs(prev =>
  prev.map(t => t.id === activeTabId ? { ...t, ...patch } : t)
);
const setWizForm   = v => updTab({ wizForm:   typeof v==='function' ? v(wizForm)   : v });
const setPlanItems = v => updTab({ planItems: typeof v==='function' ? v(planItems) : v });
// ... etc.
```

**Barra de abas:** renderizada em todos os 4 steps (0–3) como `tabBarEl`. Fica oculta quando não há abas abertas. Contém: botão "≡ Lista" (volta ao Step 0 sem fechar abas), uma entrada por aba (ícone + título + botão ×) e botão "+" (desabilitado quando há 5 abas).

**`loadClassForEdit`:** antes de criar nova aba, verifica se já existe uma com `editCls.id` igual — se sim, apenas ativa aquela aba (evita duplicata). Caso contrário, cria nova aba com `step: 3`.

**Fechamento de aba:** `closeActiveTab()` remove a aba do array e seta `activeTabId = null` (retorna à lista). Chamado em: "Fechar aba" no Step 1, "Cancelar" no Step 2, `savePlan` no Step 2 (após salvar), `saveEditItems` no Step 3 (após salvar).

---

### 8.3 Disponibilidade de Locais (`LocalsReportPage`)

Componente de leitura (sem edição) criado para dar visibilidade rápida sobre quais locais estão livres ou ocupados em um dado dia.

**Acesso:** card "Salas Teóricas" no Dashboard (`setActive("locals-report")`). Não aparece na sidebar.

**Lógica de ocupação por turno:**
```js
const M_END   = 12 * 60;  // 12:00
const A_START = 13 * 60;  // 13:00
const isMOcc = name => schedules.filter(s => s.local === name && s.date === date).some(s => timeToMins(s.startTime) < M_END);
const isAOcc = name => schedules.filter(s => s.local === name && s.date === date).some(s => timeToMins(s.endTime)   > A_START);
```
- **Manhã ocupada:** qualquer aula que começa antes das 12:00
- **Tarde ocupada:** qualquer aula que termina após as 13:00 (cobre aulas que atravessam o almoço)

**Agrupamento de sessões por local:** linhas de `schedules` com mesmo `(className, module, startTime, endTime)` são fundidas em uma sessão única — instrutores são agregados em `instrs[]`.

**Estados de filtro rápido:** `showOnlyFree` e `showOnlyOcc` são mutuamente exclusivos — ativar um desativa o outro.

**Card no Dashboard:** usa IIFE (`{(() => { ... })()}`) para computar os contadores de livres por turno sem poluir o escopo do componente Dashboard.

---

### 8.2 CRUD de Locais

`LocalsPage` ganhou edição/criação/exclusão inline. Antes era somente leitura.

**Guard de senha:** salvar e deletar exigem senha via `DeleteGuardModal` (mesmo padrão de `SettingsPage` e `UsersPage`).

**Migração de dados (AppLoader):** executa uma única vez na carga para:
1. Renomear registros no Supabase (`relyon_locals`): CBINC 05 → CBINC 05(AVANÇADO), COXSWAIN BALEEIRA → COXSWAIN - BALEEIRA.
2. Inserir local ausente: BALEEIRA 01 (TURCO) com `type: "RelyOn Macaé"`, `env: "Prático"`, `subtype: "manobra"`.

---

### 8.4 Busca Unificada de Treinamento (`SearchSel` + `keywords`)

`SearchSel` aceita campo opcional `keywords` nas opts. Quando presente, o filtro usa `keywords` em vez de `l` (label visível):

```js
const filtered = query
  ? opts.filter(o => (o.keywords || o.l).toLowerCase().includes(query.toLowerCase()))
  : opts;
```

Treinamentos passam `keywords: gcc + " " + shortName + " " + name` — qualquer um dos três campos funciona como chave de busca no mesmo input. Aplicado em: Schedule Step 1, TrainingsPage, InstructorsPage (painel de competências).

---

## 10. Funcionalidades Recentes (2026-04-15 / 2026-04-16)

### 10.1 Flag EAD em Treinamentos

Campo `ead: boolean` adicionado ao objeto `training`. Quando `true`:
- `LocalsSelector` recebe prop `isEad={training.ead}` e exibe somente os locais online (ONLINE, MICROSOFT TEAMS, ZOOM) em vez dos locais físicos normais
- Badge "EAD" exibido no card do treinamento na `TrainingsPage`
- Campo persiste via `setTrainings` → `usePersisted` → `relyon_trainings`

### 10.2 "Quem faz o quê?" — Drill-down de Instrutores por Disciplina

Botão na barra de ações de `TrainingsPage` (visível para todos). Abre `Modal` com:
- Busca por GCC, nome abreviado ou nome completo do treinamento (filtra em tempo real)
- Acordeão de treinamentos → ao expandir: lista de disciplinas
- Ao expandir disciplina: lista de instrutores com a skill correspondente (match exato por `m.name`)
- Badge "LÍDER" para instrutores com `canLead: true` naquela disciplina
- `getInstructorsForSkill(skillName)` — helper local na IIFE que cruza `instructors[].skills` (suporta `string | {name, canLead}`)

**Estado:** `showQfq`, `qfqSearch`, `qfqOpen` (Set de IDs de treinamento), `qfqModOpen` (Set de IDs de módulo) — todos no topo de `TrainingsPage`.

### 10.3 Aba "Horas por Instrutor" em ReportsPage

Nova aba `"horas"` em `ReportsPage` (modo admin). Estado: `horasMonth` (string `"YYYY-MM"`, iniciado no mês atual).

**Lógica:**
```js
const toMinsH = t => { const [h,mn] = t.split(":").map(Number); return h*60+(mn||0); };
const fmtHM = mins => { const h = Math.floor(mins/60); const m = mins%60; return h+"h"+(m?String(m).padStart(2,"0")+"min":""); };
// Filtra schedules no mês → agrupa por instrutor → calcula totalMins, teoriaMins, praticaMins, outrasMins
```

Cards por instrutor com barra proporcional ao maior total do mês (teoria=amarelo, prática=verde, outras=cinza). Exporta via `printHoras()` — abre janela com tabela HTML + botão imprimir/PDF.

### 10.4 Service Worker — Network-First (sw.js)

`sw.js` reescrito com `CACHE_NAME = 'relyon360-v3'` e estratégia:
- **App shell** (`/`, `/index.html`, `/manifest.json`, `/icon.svg`): **network-first** — busca sempre da rede; usa cache só se offline
- **CDN assets** (React, Babel, Supabase, bcrypt): **cache-first** — URLs versionadas, imutáveis
- **Supabase** (`*.supabase.co`): bypass total

Motivação: versão anterior (`v1`) servia `index.html` do cache indefinidamente, impedindo que novos deploys chegassem ao usuário.

### 10.5 Identidade Visual / Branding

**Conceito:** o "O" de RelyOn é um anel dourado fechado (gradiente `#ffd066 → #e8920a`), sem abertura.

| Local | Mudança |
|-------|---------|
| `icon.svg` | Redesenhado: anel dourado grande + "360" branco centrado + "RELYON" dourado abaixo |
| `icon-192.png` / `icon-512.png` | Gerados via Python (Pillow) com mesmo design |
| `apple-touch-icon.png` | 180×180, mesmo design, para iOS |
| `manifest.json` | `background_color` e `theme_color` → `#011c22`; icons separados em `purpose: "any"` e `"maskable"` |
| AppLoader | Spinner CSS substituído por arco SVG animado (gradiente, 270°) + wordmark "RelyOn 360" |
| Login | Redesenhado: fundo `#011c22`, arco ~90° decorativo no canto superior direito do card, rodapé "Development by Fritz" |
| Sidebar | `strokeDasharray` removido → anel fechado |
| SobrePage | Ícone "R" substituído por SVG miniatura do anel + "360" |

### 10.6 RLS — Refinamento de Políticas

Migração `rls_app_state_restrict_anon` aplicada em `snpvqqsmwrlazawjknme`:
- Removida: `allow_all_anon` (ALL/anon/true) — qualquer pessoa podia deletar todos os dados
- Criadas:
  - `app_state_select`: SELECT para anon, `USING (true)`
  - `app_state_update`: UPDATE para anon, `USING (true) WITH CHECK (true)`
  - `app_state_insert`: INSERT para anon, `WITH CHECK (key = ANY(ARRAY['relyon_schedules', 'relyon_trainings', 'relyon_areas', 'relyon_instructors', 'relyon_users', 'relyon_absences', 'relyon_locals']))`
  - DELETE: sem policy para anon → bloqueado por RLS

Migração `fix_function_search_path`: 6 funções corrigidas com `SET search_path = ''` (previne path hijacking em funções `SECURITY DEFINER`).

---

## 9. Decisões Pendentes / Dívida Técnica

| Item | Status | Nota |
|------|--------|------|
| `preferredLocals[mod.type]` → `mod.id` | ✅ Corrigido | Cada módulo mantém sua própria preferência de local |
| `linkedInstructorId` não era gravado | ✅ Corrigido | UsersPage tem dropdown "Instrutor Vinculado" no modal criar/editar |
| Validar `permissions[]` no runtime | ✅ Corrigido | `hasPermission()` implementado para plan_edit, train_edit, skills_edit, ai |
| Hash de senhas | ✅ Corrigido | bcryptjs (cost 8) com migração automática de plaintext |
| `status: "Cancelado"` | ✅ Resolvido | Removido do STATUS_COLOR; fallback `#64748b` cobre status desconhecidos |
| RLS no Supabase | ✅ Parcialmente corrigido | `allow_all_anon` removida; DELETE bloqueado; INSERT restrito às 7 chaves; 6 funções com `search_path` corrigidas. Risco residual: anon ainda pode ler/UPDATE |
| Supabase Auth / JWT | Planejado | Substituiria o login atual (senhas já são bcrypt hash) |
| Build step (Vite) | A avaliar | Babel standalone começa a ser custoso com o tamanho atual |
| Split em múltiplos arquivos | ✅ Concluído 2026-04-17 | 14 arquivos em `relyon360/js/`; index.html é shell de 59 linhas |
| Testes automatizados | Não iniciado | Playwright (e2e) ou Vitest (unidades) |
| `MySchedule` removido | ✅ Resolvido 2026-04-11 | Fundido em `InstructorDashboard`; pendências com expansão clicável e mensagem "PARABÉNS" quando zeradas |
| `UsersPage` ReferenceError (`user` undefined) | ✅ Corrigido 2026-04-12 | `DeleteGuardModal` recebia `user={user}` → tela branca; corrigido para `user={currentUser}` |
| Typo `"RelyOn Macé"` em LocalsPage | ✅ Corrigido 2026-04-12 | Grupo "Teórico" ficava vazio; 8 ocorrências corrigidas para `"RelyOn Macaé"` |
