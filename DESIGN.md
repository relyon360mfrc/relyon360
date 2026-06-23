# DESIGN — RelyOn 360 Scheduler
> Decisões técnicas de arquitetura. Explica o *como*, enquanto SPEC explica o *quê*.
> Última revisão: 2026-06-19 (§26–31 — build step esbuild, core.cjs single-source, MCP criar_turma, avaliação de segurança, detector de conflitos + remoção do sistema de ciência, modelo de acesso Fase A + bônus por atividade)

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

### 2.1 Hooks de Persistência em `App()`

O componente `App()` gerencia duas estratégias distintas:

```js
// Escalas — tabela própria + Realtime
const [schedules,   setSchedules]   = useSchedules();

// Demais entidades — app_state key-value
const [trainings,   setTrainings]   = usePersisted("relyon_trainings",   INITIAL_TRAININGS);
const [areas,       setAreas]       = usePersisted("relyon_areas",       INITIAL_AREAS);
const [instructors, setInstructors] = usePersisted("relyon_instructors", INSTRUCTORS);
const [users,       setUsers]       = usePersisted("relyon_users",       USERS);
const [absences,    setAbsences]    = usePersisted("relyon_absences",    INITIAL_ABSENCES);
const [locals,      setLocals]      = usePersisted("relyon_locals",      INITIAL_LOCALS);
const [aiPackages,  setAiPackages]  = usePersisted("relyon_ai_packages", []); // LOG de lotes da IA (§5.13.1)
```

### 2.2 Hook `usePersisted` (app_state key-value)

Combina `useState` + localStorage (fallback síncrono) + upsert assíncrono em `app_state`:

```js
const usePersisted = (key, initialValue) => {
  const [state, setState] = useState(() => {
    if (_initialData && _initialData[key] != null) return _initialData[key];
    try {
      const ls = localStorage.getItem(_LS_PREFIX + key);
      if (ls != null) return JSON.parse(ls);
    } catch {}
    return initialValue;
  });
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    try { localStorage.setItem(_LS_PREFIX + key, JSON.stringify(state)); } catch {}
    sb.from('app_state').upsert({ key, value: state }, { onConflict: 'key' })
      .then(({ error }) => {
        if (error) _emitSave({ ok: false, key, msg: error.message });
        else _emitSave({ ok: true, key });
      });
  }, [key, state]);
  return [state, setState];
};
```

**Por que `useRef(true)`?** Evita upsert desnecessário no primeiro render.

**Bootstrap:** `AppLoader` faz um único `select` em `app_state` preenchendo `_initialData`; todos os `useState(lazy)` consomem em uma passagem. localStorage é fallback offline.

### 2.3 Hook `useSchedules` (relyon_schedules — tabela real + Realtime)

Escalas vivem em tabela dedicada `relyon_schedules`, não em `app_state`. Isso permite diff granular (INSERT/UPDATE/DELETE por linha) e Realtime via canal Postgres.

**Leitura inicial:** `select('*').order('date')` no mount, paginado em chunks de 1000 (limite servidor PostgREST). **Todo row vindo do SB passa por `_stripScheduleRow` antes de entrar em state/LS** — `created_at` e `updated_at` são colunas reais do banco mas ficam **fora do whitelist `_SCHEDULE_COLUMNS`**, e sem o strip vazariam pro LS (ver §25).

**Realtime:** canal `postgres_changes` escuta INSERT/UPDATE/DELETE. IDs são normalizados com `String(r.id)` para evitar mismatch number vs string. O payload `nw` também passa por `_stripScheduleRow` antes de entrar em state/LS (mesma razão da leitura inicial).

**Escrita — `setSchedules(valOrFn)`:** chama `_persistSchedules(prev, next)` de forma não-bloqueante (diff-based):
- `toInsert` = linhas em `next` sem correspondência em `prev` → `INSERT`
- `toDelete` = linhas em `prev` ausentes em `next` → `DELETE`
- `toUpdate` = linhas com mesmo id mas JSON diferente → `UPDATE` por id

`setSchedules` **sempre** recebe função `prev =>` para evitar stale closure. Nunca passar array diretamente.

**Tratamento de erro:** desde 2026-05-20 cada bloco (insert/delete/update) tenta isoladamente e, em falha, enfileira na **outbox** em vez de abortar o resto do diff. Detalhes em §20.

### 2.4 Sessão

- `localStorage[rl360_session]` — JSON do usuário logado quando "Permanecer conectado neste dispositivo" está marcado (padrão: marcado). Permite sobreviver a fechamento do browser.
- `sessionStorage[relyon360_tabs]` / `sessionStorage[relyon360_activeTabId]` — estado das abas do wizard, sobrevive a F5 mas não ao fechamento.
- Logout limpa `rl360_session` e reseta `user` para `null`.

### 2.5 Reset
```js
window.__resetRelyOn360()
```
Apaga todas as chaves em `app_state` e a tabela `relyon_schedules`; recarrega.

### 2.6 Seeds e Bootstrap

`constants.js` declara as variáveis seed (`INITIAL_AREAS`, `INSTRUCTORS`, `LOCALS`, `INITIAL_TRAININGS`, `INITIAL_SCHEDULES`) como **arrays vazios**. Em produção, `_initialData` (preenchido pelo AppLoader a partir do Supabase) tem precedência sobre os seeds — os arrays vazios só são usados num fresh install onde o Supabase também está vazio.

`USERS` mantém um único registro de bootstrap:
```js
const USERS = [
  { id: 1, name: "Admin", username: "admin", password: "relyon360!", role: "developer", mustChangePass: true },
];
```

A senha plaintext é hasheada pelo AppLoader antes de persistir, e `mustChangePass: true` força troca no primeiro login. **Em fresh installs, este é o único caminho de acesso inicial — após criar usuários reais, este registro pode (e deve) ser excluído.**

**PII fora do código:** dados reais de instrutores, áreas, locais e treinamentos vivem **exclusivamente no Supabase**. Nunca commitar JSON exportado por `window.__exportBackup()` — `.gitignore` já bloqueia `relyon360_backup_*.json` e `backups/`.

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

### 10.4 Service Worker — arquitetura de bundle (sw.js, `relyon360-v6` desde 2026-06-23)

> **Histórico:** `v1` servia `index.html` do cache pra sempre (deploy não chegava); `v3`/`v5` passaram a network-first no shell + stale-while-revalidate em `/js/*`. Depois do build step (esbuild) `/js/*` deixou de existir em produção (virou 1 bundle `/app.[hash].js`), e o SW v5 ficou desalinhado — sua interceptação de navegação adicionava latência de partida ANTES do 1º paint, deixando a **tela preta** (`#050505` do body) aparecer no recarregamento do portão de versão (DESIGN §24).

`sw.js` reescrito (`CACHE_NAME = 'relyon360-v6'`) pra casar com o bundle:
- **Navegação** (`request.mode === 'navigate'`): **NÃO interceptada** — o SW dá `return` sem `respondWith`, o browser busca o `index.html` direto da rede (pequeno + `Cache-Control: must-revalidate`). É o que elimina a latência de partida do SW e a tela preta. Trade-off consciente: sem fallback de navegação offline (app é online-dependente do Supabase).
- **Bundle hasheado** (`/app.<hash>.js`, regex `^/app\.[A-Za-z0-9]+\.js$`): **cache-first imutável** — o hash de conteúdo troca a cada deploy → URL nova → cache miss → fetch fresco. Ao cachear um bundle novo, faz prune dos `app.<hash>.js` antigos (não acumula entre bumps de `CACHE_NAME`).
- **Ícones / manifest**: **cache-first** (precache no `install`).
- **CDN assets** (React, ReactDOM, Supabase, bcrypt, xlsx; babel mantido só pro caminho de rollback): **cache-first** — URLs versionadas, imutáveis. Ficam em `CDN_CACHE = 'relyon360-cdn-v1'` — **nome preservado de propósito**: `_applyUpdate` (config.js) limpa todo cache MENOS essa chave ao aplicar uma atualização.
- **Supabase** (`*.supabase.co`): bypass total.

**Anti-flash-preto (config.js + index.html), 2026-06-23:** além do SW, `_applyUpdate` injeta um overlay teal idêntico à boot screen (`_showUpdatingOverlay`) e espera ~300ms pro frame pintar antes do `location.reload()`; e o fallback do `body` em `index.html` passou de `#050505` (preto) pra `#011c22` (teal) — o `--rl-page-bg` só fica indefinido nos gaps de boot/reload, então o fallback teal mata o flash sem afetar o app carregado.

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

## 13. FASE 6 — Calendário de Feriados Regional (2026-04-30)

### 13.1 Por que feriado virou entidade global

A FASE 1 (2026-04-29) tinha colocado feriado como tipo de ausência (`type:"feriado"` em `ABSENCE_TYPES`), o que exigia criar um registro por instrutor por feriado. Isso era redundante (feriado é atributo do **dia**) e não suportava a realidade brasileira: feriados podem ser nacionais, estaduais ou municipais. Instrutor de SP não está de folga em aniversário de Macaé/RJ, mas estava sendo bloqueado se a ausência fosse criada para ele.

A FASE 6 reverte: feriado vira entidade `relyon_holidays` com `scope` regional. Cada instrutor ganha campos opcionais `state` e `city`. O helper `isHoliday(date, instr, holidays)` decide quem está afetado:

```js
export const isHoliday = (date, instr, holidays) => {
  if (!holidays || !holidays.length) return null;
  for (const h of holidays) {
    if (h.date !== date) continue;
    if (h.scope === "national") return h;
    if (!instr) continue;
    if (h.scope === "state" && instr.state && instr.state === h.state) return h;
    if (h.scope === "municipal" && instr.state && instr.city && instr.state === h.state && instr.city === h.city) return h;
  }
  return null;
};
```

**Decisão de regionalização:** modelo `state` (UF) + `city` (string livre) em vez de `country/state/region/city` por simplicidade — todos os instrutores hoje são brasileiros, então país é implícito. Cidade é string livre para evitar uma terceira tabela de municípios; aceita-se o risco de typo (mitigado pelo uso de form único por feriado, não por instrutor).

### 13.2 Migração one-shot do tipo `feriado`

`AppLoader` em `app.js` detecta absences com `type:"feriado"` e:
1. Para cada absence, expande o range `startDate..endDate` em datas individuais
2. Cria um `holiday` com `scope:"national"` (a versão antiga não distinguia escopo)
3. Deduplica por data (não cria 2 holidays na mesma data)
4. Remove os absences de feriado do array
5. Faz upsert atômico de `relyon_absences` e `relyon_holidays`

A migração é idempotente: se não houver absence com `type:"feriado"`, nada acontece. Os feriados migrados começam como nacionais — admin pode editá-los para regionais se aplicável.

### 13.3 Impactos transversais

| Local | Mudança |
|-------|---------|
| `Schedule.initPlan` | `qualified` filtra `!isHoliday(date, instr, holidays)` (lead, assistentes e tradutor) |
| `Schedule` Step 2 | `isUnavail(i)` consolida `isOcupado \|\| isInstructorAbsent \|\| isHoliday`; instrutor em feriado aparece como `🏖 {nome} · {feriado}` (cyan) |
| `WeeklyCalendarView` | Header do dia com feriado nacional fica cyan; legenda mostra nome do feriado; tooltip lista todos |
| `GroupCalendarView` | Chips cyan acima das colunas listando feriados do dia (nacional/estadual/municipal) |
| `ReportsPage` aba "Horas" | Calcula `holidayMins` por instrutor; coluna "🏖 Feriado" no PDF; tag no card individual |
| `RLS Supabase` | `app_state_insert` ganha `relyon_holidays` na lista de chaves permitidas (migration `rls_app_state_allow_relyon_holidays`) |
| `__resetRelyOn360` | Limpa também `relyon_holidays` (via `_DB_KEYS`) |

### 13.4 Casos limítrofes

- **Instrutor sem `state`/`city`:** afetado apenas por feriados **nacionais**. Não há erro, é o comportamento esperado para instrutores que ainda não tiveram a UF cadastrada.
- **Mesma data com feriado nacional + estadual:** `isHoliday` retorna o **primeiro match** na ordem do array. Os calendários ordenam por escopo (national → state → municipal) antes de exibir, então o nacional aparece primeiro.
- **Feriado em fim de semana:** sem tratamento especial — se cair em sábado/domingo, é exibido normalmente. Não há lógica de "antecipar para sexta" (decisão consciente: isso é regra de RH, não de scheduler).

---

## 11. Funcionalidades e Correções (2026-04-28)

### 11.1 `useSchedules` — Persistência de Escalas em Tabela Dedicada

Escalas migradas de `app_state` para tabela própria `relyon_schedules` com:
- **Diff-based persistence:** `_persistSchedules(prev, next)` calcula toInsert/toDelete/toUpdate e faz operações granulares (não substitui o array inteiro)
- **Realtime:** canal Supabase `postgres_changes` mantém estado sincronizado entre abas e com Fritz sem polling
- **Erro tratado:** cada operação verifica `{error}` e propaga via `_emitSave({ ok: false })`

### 11.2 Fix: Trigger `trg_notify_instructor_push`

Trigger adicionado em 2026-04-26 para notificações push chamava `net.http_post()` com assinatura posicional errada → PostgreSQL error `42883` → rollback em **todos** os INSERTs → dados sumiam no F5.

Correção: DROP + recrear com `EXCEPTION WHEN OTHERS THEN NULL` envolvendo o `net.http_post`. Falha de push nunca mais aborta a transação de escala.

### 11.3 Fix: Stale Closures em `setSchedules`

Todos os call sites que usavam `setSchedules([...schedules, ...news])` foram convertidos para `setSchedules(prev => [...prev, ...news])`. Arquivos corrigidos: `schedule.js`, `ai.js`, `dashboard.js`, `instructor.js`.

### 11.4 Sessão Persistida (Keep Me Logged In)

`handleLogin(u, keep=true)` grava JSON do usuário em `localStorage[rl360_session]`. AppLoader lê no boot caso não exista sessão Supabase Auth. Logout limpa a chave. Checkbox "Permanecer conectado neste dispositivo" (padrão: marcado) controla o comportamento.

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
| Build step (Vite) | A avaliar | Babel standalone começa a ser custoso com o tamanho atual (~380KB de JS de negócio) |
| Split em múltiplos arquivos | ✅ Concluído 2026-04-17 | 14 arquivos em `relyon360/js/`; index.html é shell de 59 linhas |
| Testes automatizados | Não iniciado | `logic.js` é o ponto de entrada; prioridade: `recalcTimes`, `sortModules`, `isInstructorAbsent` |
| `MySchedule` removido | ✅ Resolvido 2026-04-11 | Fundido em `InstructorDashboard`; pendências com expansão clicável e mensagem "PARABÉNS" quando zeradas |
| `UsersPage` ReferenceError (`user` undefined) | ✅ Corrigido 2026-04-12 | `DeleteGuardModal` recebia `user={user}` → tela branca; corrigido para `user={currentUser}` |
| Typo `"RelyOn Macé"` em LocalsPage | ✅ Corrigido 2026-04-12 | Grupo "Teórico" ficava vazio; 8 ocorrências corrigidas para `"RelyOn Macaé"` |
| `alert()` em erro de persistência | ✅ Corrigido 2026-04-24 | `alert()` removido de `config.js`; erro de persistência é tratado apenas pelo toast do `SaveMonitor` |
| Download automático no `beforeunload` | ✅ Corrigido 2026-04-24 | Listener removido de `config.js`; `window.__exportBackup()` e botão manual na `SobrePage` ficam como alternativas |
| `__resetRelyOn360()` sem guard de senha | ✅ Corrigido 2026-04-24 | Função agora exige senha de qualquer usuário `developer` via `prompt()`; senha verificada via `checkPw()` contra `_liveData.relyon_users` |
| `LOCALS` mutada globalmente em `App()` | ✅ Corrigido 2026-04-28 | Guard `if (locals && locals.length) LOCALS = locals` em `app.js` — evita sobrescrever com array vazio durante carregamento assíncrono |
| Trigger `trg_notify_instructor_push` causando perda de dados | ✅ Corrigido 2026-04-28 | Trigger com `net.http_post()` assinatura errada causava rollback em todos os INSERTs em `relyon_schedules`; recriado com `EXCEPTION WHEN OTHERS THEN NULL` para isolar falha de push |
| `_persistSchedules` ignorava erros Supabase | ✅ Corrigido 2026-04-28 | Supabase resolve promises com `{data, error}` (nunca rejeita); `_persistSchedules` agora verifica `{error}` e faz `throw` para acionar `_emitSave({ ok: false })` |
| Stale closures em `setSchedules` | ✅ Corrigido 2026-04-28 | 7 call sites em 5 arquivos convertidos para forma funcional `setSchedules(prev => ...)` — evita deletar linhas inseridas por Fritz durante edição concorrente |
| Realtime ID type mismatch | ✅ Corrigido 2026-04-28 | Comparações `s.id === nw.id` convertidas para `String(r.id)` — Supabase pode retornar number ou string dependendo do path |
| Sessão persistida entre fechamentos | ✅ Corrigido 2026-04-28 | `handleLogin(u, keep=true)` grava `rl360_session` em `localStorage`; AppLoader lê no boot se não há dado de Supabase Auth |
| Supabase Auth / JWT real | 📋 Adiado indefinidamente | Login client-side é adequado para ferramenta interna; risco de migração supera benefício; chave anon é aceitável com RLS vigente |
| Build step (Vite) | 📋 Adiado indefinidamente | Babel Standalone processa ~380KB mas bootstrap é imperceptível na prática; migração adicionaria complexidade de CI/CD sem benefício proporcional |
| Testes automatizados | ✅ 32 testes | 32 testes via Vitest: 27 originais + H01-H05 de `isHoliday` (FASE 6) |
| Agente Scheduler (Fritz) | ✅ Concluído — MVP v1 + v1.5 | Fritz opera como planejador no sistema; MVP v1 (FASES 1-11) completo; v1.5 (Dev/Test/Guardian em modo análise) completo |
| Feriado como atributo do dia (regional) | ✅ FASE 6 — 2026-04-30 | `relyon_holidays` substitui o tipo `feriado` antigo; `isHoliday(date, instr, holidays)` aplica regra nacional/estadual/municipal; AppLoader migra dados antigos |
| `sortModules` duplicado em `logic.js` e `schedule.js` | ✅ Corrigido 2026-05-02 | Versão local de `schedule.js` (sem `isRevisao`) removida; `sortModules` canônico declarado em `constants.js` (global). `logic.js` mantém versão exportada para testes. As duas são idênticas. |
| **Programação não desaparece quando excluída** (crônico — 10+ tentativas) | ✅ Corrigido 2026-05-02 sessão 4 | **Causa raiz dupla:** (a) tabela `relyon_schedules` sem PRIMARY KEY; (b) coluna `id` era `double precision` e IDs gerados como `Date.now() + Math.random()` perdiam precisão no transit JS↔Postgres↔Realtime. `DELETE WHERE id IN (...)` retornava 0 rows silenciosamente. CBSP - 01 acumulou 46 rows zumbis em 3 saves. Fix: migração `relyon_schedules_id_bigint_with_pk` (id → bigint + PK), helper `newScheduleId()` (bigint-safe), helper `_deleteSchedulesByClassName()` (delete por className como defesa adicional). Ver §16. |

---

## 12. Funcionalidades e Correções (2026-04-29)

### 12.1 `sortModules` — REVISÃO na ordem correta

`isRevisao` adicionado em `logic.js`: `/REVIS[AÃ]O/i` detecta módulos com "REVISÃO" (inclusive nomes compostos como "CACI - REVISÃO") e os exclui do balde `regular`. Ordem final garantida: **regulares → revisão → prova → tempo reserva**.

### 12.2 Tradutor auto-atribuído no `initPlan`

`committedTrad[]` em `schedule.js`: antes o slot de tradutor era sempre criado com `instructorId: ""`. Agora filtra instrutores com `TRANSLATOR_SKILL` não ausentes, prioriza o mesmo tradutor ao longo do treinamento (mesma lógica de `committedInstrs`). Step 2: visual cyan + placeholder "🌐 Tradutor..." agora consistentes com Step 3.

### 12.3 Fix: autocomplete de senha no `DeleteGuardModal`

Campo oculto `<input type="text" autoComplete="username">` estava com `readOnly` e sem `value` — o Chrome não fechava o par de credenciais e vazava o username no próximo input editável. Corrigido em `components.js`: `value={user?.username || user?.name}` + `onChange={() => {}}`.

### 12.4 Feriado — ausência sem KPI (FASE 1)

Novo tipo `feriado` em `ABSENCE_TYPES` (`constants.js`):
- **Categorias:** Feriado Nacional, Feriado Estadual, Feriado Municipal
- **Sempre dia inteiro:** categorias adicionadas a `FULL_DAY_CATEGORIES` em `constants.js` e `logic.js`
- **Bloqueia agendamento:** `isInstructorAbsent` retorna `true` — instrutor não aparece em `disponiveis` no `initPlan` nem no Step 2
- **Não conta em KPI:** flag `noKpi: true` na definição do tipo — futuras métricas de absenteísmo filtram `ABSENCE_TYPES[a.type]?.noKpi`
- **Visual diferenciado no Step 2:** `getFeriadoLabel(instrId)` distingue feriado de conflito de agenda; aparece como "🏖 {nome} · {categoria}" (cyan) em vez de "⚠ Ocupado" (vermelho)

### 12.5 Horário Normal vs. Horário Livre (FASE 2)

Treinamentos têm flag `defaultSchedule: boolean` (já existia). Quando `false`:

**Step 2 (criação):**
- Display de horário fixo `{startTime}–{endTime}` é substituído por dois `<input type="time">` editáveis
- Seletor de dia (entre os já presentes no plano) é substituído por `<input type="date">` aberto a qualquer data
- Botão "↺ Recalcular" é escondido — `recalcTimes` não faz sentido sem grade
- Mensagem do header muda para "Horário personalizado · Não há quebra automática de almoço"
- Helper: `updatePlanItemField(uid, patch)` — edita `{ date, startTime, endTime }` por módulo

**Step 3 (edição):**
- Mesmo tratamento visual; helper `updateEditItemField(id, patch)`
- `applyDaySchedule` é pulado em `sortByDateTime`, `reorderEdit`, `moveToDay` quando o training do `editItems[0]` tem `defaultSchedule === false` — preserva horários manuais ao reordenar

### 12.6 Modos de Sequência (FASE 3)

Novo campo no `training`:
```js
modes: [
  { id: 1714400000001, label: "Modo 1", moduleOrder: [101, 102, 105, 108] },
  { id: 1714400000002, label: "Modo 2", moduleOrder: [102, 101, 108, 105] }
]
```

**TrainingsPage:**
- Card "Modos de Sequência" no detalhe do treinamento (quando tem módulos e `defaultSchedule !== false`)
- Adicionar Modo: cria com `moduleOrder` = ids ordenados via `sortModules(modules)`
- Cada modo: nome editável + lista de módulos com setas ↑↓ + botão remover

**Wizard Step 1:**
- Dropdown "Modo de Sequência" aparece quando `selTraining.modes.length > 0`
- Auto-detecção pelo final do `className`: regex `/(\d+)$/` extrai número; `Modo[turmaNum-1]` é pré-selecionado
- Badge "auto: {label}" indica quando a auto-detecção está ativa
- `wizForm.modeId` armazena escolha explícita (override do auto)

**`initPlan`:**
```js
let selectedMode = null;
if (wizForm.modeId) selectedMode = (selTraining.modes||[]).find(...);
else if (modes.length > 0 && useDefault) {
  const turmaNum = parseInt(className.match(/(\d+)$/)?.[1] || 0);
  if (turmaNum > 0 && turmaNum <= modes.length) selectedMode = modes[turmaNum-1];
}
const sorted = selectedMode
  ? selectedMode.moduleOrder.map(id => uniqueModules.find(m => m.id === id)).filter(Boolean)
  : sortModules(uniqueModules);
```

### 12.7 Turmas Fundidas (FASE 4)

Cada `schedule` row pode ter `linkedClassNames: string[]` — lista de outros `className` aos quais essa turma está vinculada. Replicado em todas as rows da turma ao salvar.

**Helpers:**
- `getLinkedClassNames(className)` — lê de `schedules.find(s => s.className === className && Array.isArray(s.linkedClassNames))?.linkedClassNames`

**Bypass de conflito:**
```js
checkSlotConflict(date, st, et, instrId, local, excludeClassName, linkedClassNames = []) {
  const ignoreNames = new Set([excludeClassName, ...linkedClassNames].filter(Boolean));
  const existing = schedules.filter(s => s.date === date && !ignoreNames.has(s.className));
  ...
}
detectConflicts(newRows, excludeClassName, linkedClassNames = []) { /* idem */ }
```

**UI Step 3:**
- Botão "🔗 Vincular" no toolbar — cor cyan quando há vínculos ativos
- Modal lista todas as outras turmas com checkbox; clique alterna o vínculo bidirecional (atualiza ambas as rows em uma única passagem por `setSchedules`)
- `saveEditItems` replica `linkedClassNames` em todas as rows novas antes de persistir

### 12.8 Grade Paralela (FASE 5)

Novo componente `GroupCalendarView` em `dashboard.js` (fora de `Schedule` — regra de estabilidade §4.2). Acionado pelo toggle "Grupo" na barra de modos do `Schedule`.

**Layout:**
- Header: setas ◀ / ▶ + botão "Hoje" para navegação por dia (estado `dateOffset`)
- Data formatada por extenso ("quinta-feira, 30 de abril de 2026")
- Colunas horizontais lado a lado, cada uma uma turma do dia
- Cabeçalho da coluna: `shortName` do training (fallback: `className.replace(/\s+/g,'').slice(0,10)`)
- Indicador de vínculo: "🔗N" no canto direito do header quando `linkedClassNames.length > 0`
- Cells: bloco horário + módulo + instrutor + local

**Detecção de conflitos:**
```js
for cada par (a, b) de schedule rows do dia:
  if a.className === b.className: skip
  if a.linkedClassNames.includes(b.className): skip
  if intervalos sobrepoem:
    if instrutor igual: marca a e b com `${id}|instr`
    if local igual:    marca a e b com `${id}|local`
```

Cells com flags `instr` ou `local` ficam com borda vermelha + ícone "⚠" no campo correspondente (instrutor ou local).

**`colWidth`:** ajustado entre 180 e 280px baseado em `1100 / columns.length`.

**Click no cabeçalho:** chama `onClickClass(cls)` → `loadClassForEdit(cls)` → abre Step 3 (mesma lógica do `WeeklyCalendarView`).

---

## 15. Correções (2026-05-02) — sessão 2

### 15.1 Numeração de turmas — `trainingId` type mismatch

**Problema:** o Step 1 do wizard calculava `turmasSemana` (turmas da mesma semana para o mesmo treinamento) usando comparação estrita `s.trainingId !== selTraining.id`. `s.trainingId` retornado pelo Supabase é **string**; `selTraining.id` é **number** (encontrado via `trainings.find(t => t.id === +wizForm.trainingId)`). O `!==` nunca igualava → `turmasSemana` sempre vazio → `proximo` sempre 1 → nome sempre "MCIA - 01" independente de turmas existentes na semana.

**Diagnóstico:** a função `outrasturmas` (linha logo abaixo) já usava `String()` corretamente — inconsistência clara.

**Correção (`schedule.js`):** duas ocorrências substituídas:
```js
// antes
if (s.trainingId !== selTraining.id) return false;
// depois
if (String(s.trainingId) !== String(selTraining.id)) return false;
```

### 15.2 `initPlan` — não sugerir instrutores ocupados em outra turma

**Problema:** o filtro `qualified` em `initPlan` verificava ausência (`isInstructorAbsent`) e feriado (`isHoliday`), mas **não verificava conflito de agenda** (`checkSlotConflict`). Um instrutor já alocado em outra turma no mesmo horário era candidato válido para a seleção automática — aparecia pré-selecionado no Step 2 com "⚠ Ocupado".

**Correção (`schedule.js`):**
- Filtro `qualified`: adicionado `!checkSlotConflict(timedItem.date, timedItem.startTime, timedItem.endTime, String(i.id), null, null).instrConflict`
- Filtro `tradPool`: mesma adição
- Step 2: quando o slot fica com `instructorId: ""` e `disponiveis.length === 0`, exibe tag `⚠ Indisponível` em vermelho junto ao select — distingue de slot propositalmente vazio

### 15.3 Legibilidade de nomes no dropdown de instrutor

**Problema:** `<select>` usa `color: #475569` quando nenhum instrutor está selecionado (placeholder). Os `<option>` sem `color` explícito herdam essa cor no dropdown nativo do SO (Windows/Chrome) — texto cinza claro sobre fundo branco, praticamente ilegível.

**Correção (`schedule.js`):** adicionado `style={{color:"#111"}}` nos `<option>` dos instrutores disponíveis no Step 2 e no Step 3. Options "Indisponível" já tinham cores explícitas (`#ef4444`, `#06b6d4`).

### 15.4 Step 3 — dropdown disponível/indisponível (sessão 3)

**Problema:** o Step 3 (edição de turma existente) ainda usava um dropdown flat de instrutor e tradutor sem agrupamento, enquanto o Step 2 já exibia split "disponíveis / indisponíveis" com nome da turma conflitante e cores por tipo de indisponibilidade.

**Correção (`schedule.js`):** dentro do `.map()` de `dayItems` no Step 3, são calculados por item:
- `_isUnavailEdit(i)` — verifica `checkSlotConflict` (excluindo `editCls` e turmas vinculadas), `isInstructorAbsent` e `isHoliday`
- `_disponiveisEdit` / `_ocupadosEdit` e variantes Trad — split de `_habEdit` e `_habEditTrad`
- `_getOcupacaoLabelEdit(instrId)` — busca em `schedules` a turma conflitante (excluindo `editCls`)
- `_getFeriadoLabelEdit(instrId)` — retorna nome do feriado via `isHoliday`

**Dropdown instrutor/tradutor (Step 3):**
- Separador `— N disponível(eis) —` antes dos livres
- Separador `─── Indisponíveis ───` antes dos ocupados
- Cores: verde implícito para disponíveis, `#ef4444` para ocupados, `#06b6d4` para feriados
- Tag "⚠ Ocupado · NOME-TURMA" abaixo do select quando slot atual tem conflito

**Local dropdown (Step 3):** replicado o mesmo split livres/ocupados com nome da turma conflitante via `_getLocalCflEdit`.

---

## 14. Correções (2026-05-02)

### 14.1 `sortModules` — unificação em `constants.js`

**Problema:** existiam duas implementações de `sortModules`:
- `logic.js` (exportada para testes) — correta, com `isRevisao`
- `schedule.js` (local ao componente `Schedule`) — desatualizada, sem `isRevisao`; REVISÃO caía no balde `regular`

`trainings.js` chamava `sortModules` como global em `addMode()`, mas a função não era global — causava `ReferenceError` silencioso e o botão "Adicionar Modo" não fazia nada.

**Correção:**
- `sortModules` canônico (com `isRevisao`) declarado em `constants.js` como global (mesmo padrão de `isHoliday`)
- Versão local de `schedule.js` removida — runtime passa a usar o global
- `logic.js` mantém sua versão exportada para os testes (idêntica ao global)

Ordem garantida em runtime: **regulares → revisão → prova → tempo reserva**

### 14.2 `addMode` — duplica Modo 1 ao invés da ordem padrão

**Problema:** `addMode` sempre gerava a ordem via `sortModules(editing.modules)`, ignorando modos já cadastrados. Como `sortModules` não era global, o botão lançava `ReferenceError` e não criava nada.

**Correção (`trainings.js`):**
```js
const baseOrder = modes.length > 0
  ? [...modes[0].moduleOrder]   // duplica Modo 1 existente
  : sortModules(editing.modules || []).map(m => m.id);  // ordem padrão no primeiro modo
```

O usuário parte do Modo 1 e reordena com ↑↓ para criar variações. A persistência é automática via `setTrainings`.

---

## 16. Bug Crônico — Programação não desaparece quando excluída (2026-05-02 sessão 4)

### 16.1 Sintomas observados

Usuário relatou ter tentado excluir a turma **CBSP - 01 / 2026-04-29** umas 10 vezes ao longo de várias sessões. A cada exclusão:
1. A turma sumia da listagem (UI atualizava)
2. No próximo F5, ela voltava intacta
3. Todas as tentativas anteriores de "consertar" falharam porque atacavam apenas o sintoma

Diagnóstico final encontrou **46 rows** persistidas para a CBSP - 01, distribuídas em **3 batches de save consecutivos** (`created_at`: 2026-04-29 00:03, 12:48, 19:58) — cada save gerou uma "geração" nova, e nenhuma das anteriores havia sido deletada. A estrutura de duplicatas parciais, com módulos repetidos em horários iguais com instrutores diferentes, comprova que o `saveEditItems` foi acionado 3 vezes e o DELETE silencioso falhou em todas.

### 16.2 Causa raiz

**Defeito #1 — `relyon_schedules` sem PRIMARY KEY.**

Inspeção via `information_schema.tables` mostrou `primary_keys: <vazio>` — desde que a tabela foi criada (DESIGN §11.1), nenhuma PK foi adicionada. Sem PK:
- Postgres não rejeita INSERTs com id duplicado
- `DELETE WHERE id = X` não tem garantia de hit
- Realtime replica identity é `default` → sem identidade confiável de linha

**Defeito #2 — id em `double precision` gerado com `Date.now() + Math.random()`.**

```js
// schedule.js (5 sites: linhas 41, 136, 309, 575 + ai.js linha 26)
id: Date.now() + Math.random()
```

Isso produz floats como `1777421019062.0837463`. JS `Number` tem 15–17 dígitos de precisão. Postgres `double precision` (float8) também. **Cada conversão JS→JSON→REST→Postgres→Realtime→JS pode perder o último dígito significativo**. Resultado:
- Front grava row com id `1777421019062.0837463`
- Postgres armazena algo levemente diferente, ex: `1777421019062.0838`
- Realtime envia a row de volta com o id armazenado
- Front guarda no `prev` o id do realtime
- Quando usuário deleta, `_persistSchedules` calcula `toDelete = prev.filter(...)` — pega o id "do realtime"
- `delete().in('id', toDelete)` envia o id como string ou número de novo, e a comparação `=` em float pode não bater
- DELETE retorna 0 rows, sem erro
- F5 traz a row de volta porque ela nunca foi deletada de fato

### 16.3 Por que as 10+ tentativas anteriores falharam

Cada tentativa anterior tentou consertar uma camada diferente (stale closures, fila serial, normalização de id no realtime, tratamento de erro no `_persistSchedules`) — todas válidas e mantidas. Mas nenhuma atacava as duas causas raiz **simultaneamente**: a coluna float-sem-PK e a geração de id no front. Por isso o sintoma persistia sob condições específicas (re-edição múltipla da mesma turma, transit float em ambos sentidos).

### 16.4 Correção definitiva — três camadas

**Camada A — Limpeza de dados.**
```sql
-- Backup
CREATE TABLE relyon_schedules_backup_20260502 AS SELECT * FROM relyon_schedules;
-- Limpa zumbis
DELETE FROM relyon_schedules WHERE "className" = 'CBSP - 01';
DELETE FROM app_state WHERE key = 'relyon_schedules';  -- chave zumbi pré-migração
```

**Camada B — Migração de schema (`relyon_schedules_id_bigint_with_pk`).**
1. `ADD COLUMN id_new bigint`
2. Mapeia cada row para um id bigint único derivado de `created_at + row_number()`
3. `DROP COLUMN id` e renomeia `id_new → id`
4. `ALTER COLUMN id SET NOT NULL` + `ADD PRIMARY KEY (id)`

Bigint (`int8`) tem range até `9.2e18`; ids no formato `Date.now() * 1000 + counter` ficam abaixo de `1.8e15`, dentro de `Number.MAX_SAFE_INTEGER` (`9.0e15`) e dentro do range bigint.

**Camada C — Helpers em `config.js`.**

```js
// 1) Geração de id bigint-safe (substitui Date.now() + Math.random())
let _scheduleIdCounter = 0;
const newScheduleId = () => Date.now() * 1000 + ((_scheduleIdCounter++) % 1000);
```

Wraparound do counter a cada 1000 chamadas dentro do mesmo ms é suficiente porque o Date.now() avança a cada ms e nunca emitimos > 1000 ids no mesmo ms.

```js
// 2) Delete defensivo por className (bypassa o diff)
const _deleteSchedulesByClassName = (cls) => {
  _persistQueue = _persistQueue
    .then(async () => {
      const { error } = await sb.from('relyon_schedules').delete().eq('className', cls);
      if (error) throw new Error(error.message);
    })
    .catch(err => _emitSave({ ok: false, key: 'relyon_schedules', msg: err.message }));
  return _persistQueue;
};
```

**Por que `eq('className', cls)` é seguro:** `className` é texto, sem perda de precisão; o filtro pega TODAS as rows daquela turma de uma vez, independentemente de quantos batches zumbis estejam acumulados. Funciona como rede de segurança caso o diff por id falhe por qualquer outro motivo no futuro.

**Camada C — Pontos de uso (`schedule.js`).**

| Função | Mudança |
|--------|---------|
| `recalcTimes` linha 41 | `id: item.id + '_' + curDate` → `id: newScheduleId()` (string composta era incompatível com bigint) |
| `applyDaySchedule` linha 136 | mesmo |
| `saveEditItems` linha 309 | `Date.now() + Math.random()` → `newScheduleId()` |
| `saveEditItems` linha 326 | DELETE explícito por className **antes** do INSERT (defesa) |
| `savePlan` linha 575 | `Date.now() + Math.random()` → `newScheduleId()` |
| `deleteClass` linha 617 | DELETE explícito por className + filter local (sem confiar no diff) |
| `ai.js` linha 26 | `Date.now() + Math.random()` → `newScheduleId()` |

### 16.5 Garantias pós-fix

- **Banco:** `ADD PRIMARY KEY (id)` faz postgres rejeitar duplicatas; `DELETE WHERE id = X` agora é determinístico (bigint não tem perda de precisão)
- **Front:** `newScheduleId()` produz inteiros puros que round-trip sem perda
- **Defesa em profundidade:** `deleteClass` e `saveEditItems` usam DELETE por `className` antes do diff — mesmo se algum bug futuro reintroduzir uma incompatibilidade de id, o cleanup por nome continua funcionando
- **Backup:** `relyon_schedules_backup_20260502` preserva os 192 rows pré-cleanup para auditoria; pode ser dropada após verificação manual

---

## 17. Lote Piscina — Planejamento Paralelo de Eventos (2026-05-03)

### 17.1 Motivação

Para treinamentos de **THUET, THUET com CAEBS e CAEBS Shallow Water** o planejamento manual usava uma planilha externa (`PROGRAMAÇÃO PARA ENVIO`) que mostrava todas as turmas do dia lado a lado num grid de turnos de 2h. O valor da visão é diagnóstico: quem usa qual local prático (M1, M2, etc.) em qual turno, evitando dois grupos disputarem a mesma piscina.

A `GroupCalendarView` já oferecia visão paralela de turmas, mas era somente leitura. O Lote Piscina é o equivalente **editável** especializado em treinamentos de piscina, com criação rápida, drag-and-drop nos turnos e detecção visual de conflito de local.

### 17.2 Modelo de dados

Sem nova entidade. Aproveita `relyon_trainings` e `relyon_schedules` existentes.

**Único campo novo:** `training.poolBatch: boolean` (default `false`). Marca um treinamento como elegível para o Lote Piscina. Persiste via `setTrainings` → `relyon_trainings`. Admin marca a flag em **THUET**, **THUET com CAEBS** e **CAEBS Shallow Water** no cadastro.

### 17.3 Helpers globais extraídos de `Schedule`

`recalcTimes`, `getLocalOpts` e `checkSlotConflict` deixam de ser locais ao componente `Schedule` e passam a ser globais (em `constants.js`/`schedule.js`), permitindo reutilização pela `PoolBatchPage` sem duplicar lógica:

```js
// constants.js (globais puros)
const recalcTimes = (items, startDateStr, startMins) => { /* ... */ };

// schedule.js (lê schedules, locals, areas via parâmetros)
const getLocalOpts = (mod, training, allLocals) => { /* ... */ };
const checkSlotConflict = (schedules, date, startTime, endTime, instructorId, local, excludeClassName, linkedClassNames) => { /* ... */ };
```

`Schedule` continua chamando os helpers (sem perda de comportamento — função pura, mesma assinatura quando vista de dentro do componente). Adaptação: `Schedule` injeta `schedules`/`locals` como argumentos onde antes o closure capturava direto.

### 17.4 Componente `PoolBatchPage`

Novo arquivo `js/poolbatch.js`. Componente top-level com props `{ schedules, setSchedules, trainings, instructors, areas, holidays, absences, locals, user, setActive, setScheduleTabs, setActiveTabId }`.

**Estado interno:**
- `date: "YYYY-MM-DD"` — dia exibido (default: hoje)
- `showAdd: boolean` — abre/fecha modal de criação
- `addForm: { trainingId, startTime, studentCount, withTranslator }`
- `dragState: { kind: 'class'|'module', className, moduleId, originSlotIdx } | null`

**Computações reativas:**
```js
const poolTrainings = trainings.filter(t => t.poolBatch);
const dayRows = schedules.filter(s => s.date === date && poolTrainings.some(t => String(t.id) === String(s.trainingId)));
const classNames = [...new Set(dayRows.map(r => r.className))];
const SLOTS = [
  {label:'08:00 — 10:00', start:480,  end:600},
  {label:'10:00 — 12:00', start:600,  end:720},
  {label:'13:00 — 15:00', start:780,  end:900},
  {label:'15:00 — 17:00', start:900,  end:1020},
  {label:'17:00 — 19:00', start:1020, end:1140},
  {label:'19:00 — 21:00', start:1140, end:1260},
];
```

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│ 📅 [30/04/2026 ▾]   [+ Nova turma]                    │
├──────────┬──────────────┬──────────────┬──────────────┤
│ TURNO    │ T-HUET 11    │ T-HUET 12    │ CBSP 03      │
│          │ (THUET)      │ (THUET+CAE)  │ (CAEBS SW)   │
│          │ 12 alunos    │ 10 alunos    │ 8 alunos     │
├──────────┼──────────────┼──────────────┼──────────────┤
│ 08-10    │ TEORIA       │ TEORIA       │ TEORIA       │
│          │ Sala 04      │ Sala 05      │ Sala 06      │
│          │ J. Moura     │ C. Loureiro  │ L. Rabello   │
├──────────┼──────────────┼──────────────┼──────────────┤
│ 10-12    │ ESCAPE       │ SOBREVIV.    │ —            │
│          │ Mód.1-Pisc2  │ Mód.2-Pisc2  │              │
│ ...
```

Cada **célula** lista os módulos da turma cujo intervalo `[startTime, endTime]` se sobrepõe ao slot de 2h. A célula mostra:
- Nome do módulo (negrito)
- Local (chip com cor)
- Quantos instrutores estão alocados (`👥 3`)

**Conflito de local:** ao computar células, se duas turmas distintas (não vinculadas via `linkedClassNames`) têm o mesmo `local` no mesmo slot, a célula ganha **borda vermelha** + ícone ⚠ + tooltip com nomes das turmas conflitantes.

### 17.5 Criação de turma — botão "+"

Modal com 4 campos:
1. **Treinamento** (`<select>` filtrado por `t.poolBatch`)
2. **Horário de início** (`<input type="time">`, default `08:00`)
3. **Número de alunos** (`<input type="number">`)
4. Checkbox "Com tradutor"

`className` é gerado automaticamente pela mesma regra do wizard (próximo número da semana baseado em `turmasSemana`).

Ao confirmar, o handler `createPoolClass()` reusa a lógica de `initPlan + savePlan`. Como toda a inteligência de seleção de instrutor/local mora dentro do componente `Schedule`, a abordagem mais segura é:

- `PoolBatchPage` cria uma **wizard tab pré-preenchida** (via `setScheduleTabs`/`setActiveTabId` injetados como props) com `step:1` e os campos do form
- `setActive("schedule")` redireciona para a `Schedule`, onde o usuário avança Step 1 → Step 2 → Salvar normalmente
- Ao salvar, `closeActiveTab` deixa o `scheduleTabs` vazio; o usuário volta para `pool-batch` manualmente (ou auto-redirect via `lastPoolBatchDate` no estado de `App`)

Decisão deliberada: **não duplicar `initPlan`**. O fluxo "+" funciona como atalho que carrega o wizard com os dados certos. O ganho do Lote vem do **grid + drag**, não da criação acelerada.

### 17.6 Drag-and-drop

**Drag de coluna inteira (header da turma):**
- `onDragStart` no header marca `{ kind:'class', className }`
- `onDrop` em outro header → calcula `delta = newIdx - oldIdx` e reposiciona as colunas. Não altera schedules, só a ordem visual da grid (estado local `columnOrder`).

**Drag de módulo (célula da turma):**
- `onDragStart` numa célula marca `{ kind:'module', className, moduleName, originSlotIdx }`
- `onDrop` em célula vazia da MESMA turma:
  - Calcula `deltaMin = SLOTS[targetIdx].start - SLOTS[originIdx].start`
  - `setSchedules(prev => prev.map(s => {
      if (s.className !== className || s.module !== moduleName || s.date !== date) return s;
      const ns = timeToMins(s.startTime) + deltaMin;
      const ne = timeToMins(s.endTime) + deltaMin;
      return { ...s, startTime: minsToTime(ns), endTime: minsToTime(ne) };
    }))`
  - Detecta conflito pós-mudança via `checkSlotConflict` e mostra confirm com `confirmConflicts` (ou apenas pinta vermelho)

**Drag entre turmas (mover módulo de uma turma para outra):** não suportado no MVP — exigiria mexer em `instructorId` e `local`, que são responsabilidade do Step 3 da `Schedule`.

### 17.7 Roteamento e navegação

- Item **"Lote Piscina"** na sidebar dentro de `Acc("Planejamento")`, visível para `canPlan(user)`
- `setActive("pool-batch")` rende `<PoolBatchPage />`
- A página é stateless quanto a abas — sempre mostra o dia escolhido
- Default de `date` lê de `sessionStorage[rl360_pool_batch_date]` para sobreviver a navegação intra-sessão

### 17.8 Conflito com `GroupCalendarView`

Por que não estender `GroupCalendarView` em vez de criar uma página nova?
- `GroupCalendarView` mostra **qualquer turma** do dia (sem filtro). Lote é específico de pool trainings.
- `GroupCalendarView` não tem grid de slots fixos de 2h — as colunas aparecem com a duração real do módulo.
- `GroupCalendarView` é leitura. Lote tem drag editável e botão "+".

São paradigmas distintos. Conviverão.

### 17.9 Casos limítrofes

- **Módulo > 2h:** ocupa múltiplos slots verticalmente. A célula do slot inicial mostra "(continua →)" e os slots intermediários mostram "↓ continuação".
- **Módulo < 2h:** ocupa só o slot que cobre seu `startTime`. Não há sub-divisão de slot.
- **Almoço (12:00–13:00):** sem slot dedicado. Schedules com horário cruzando o almoço aparecem normalmente; o slot 10-12 e 13-15 ficam ambos com a célula visualmente preenchida.
- **Dia sem turmas pool:** mostra mensagem "Nenhuma turma de piscina neste dia" + botão "+".

---

## 18. UX Adaptativo do Dashboard do Instrutor — sessão 2026-05-18

> Refator do `InstructorDashboard` para resolver três problemas relatados pelos instrutores:
> (1) ansiedade de ver a próxima semana antes de a atual virar; (2) modal vermelho de aceite que sumia sem deixar histórico; (3) timeline sem indicador de "agora".

### 18.1 Princípios de design

- **Quieto por padrão, denso sob demanda** — card resumido até expandido pelo usuário
- **Estado por cor sutil, não por badge gritante** — borda fina à esquerda > selo grande
- **Movimento silencioso** — scroll automático sem animação chamativa
- **Densidade adaptativa por device** — mesma informação, menos elementos em tela menor
- **Persistência > efêmero** — modais que somem viram entidades persistentes (notificações, ciência registrada)

### 18.2 Estrutura da entidade `relyon_notifications`

Tabela dedicada no Supabase. Não vive em `app_state` porque (a) volume cresce indefinidamente, (b) precisa de `readAt` granular por linha, (c) idealmente Realtime para refletir aviso recém-criado pelo planner.

```sql
CREATE TABLE relyon_notifications (
  id           bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  instructor_id text NOT NULL,           -- string para compatibilidade com user.id (number ou string)
  type         text NOT NULL,            -- new_module | module_changed | module_cancelled | broadcast
  title        text NOT NULL,
  body         text,
  link_class_id    text,                  -- UUID da turma (relyon_schedules.classId)
  link_schedule_id bigint,                -- id de schedule específico (opcional)
  created_at   timestamptz DEFAULT now(),
  read_at      timestamptz                -- null = não lida
);
CREATE INDEX idx_notifications_instructor ON relyon_notifications(instructor_id, created_at DESC);
```

**Geração:** o client cria a notificação após `savePlan`, `saveEditItems` e `deleteClass` no `schedule.js`, comparando `prevSchedules` vs `nextSchedules` para detectar `new_module` / `module_changed` / `module_cancelled` por instructorId. Decisão pragmática: começar client-side; migrar para trigger Postgres se necessário (modelo já validado em `trg_notify_instructor_push`).

**RLS:** INSERT/UPDATE/DELETE/SELECT liberado para anon role (mesmo modelo das outras tabelas — risco residual aceito conforme §10.6 anterior).

### 18.3 Estado "ciente" em schedules — ❌ REMOVIDO (2026-06-10) + 🔮 GATILHO DE REDESENHO

> **REMOVIDO em 2026-06-10.** O sistema de CIÊNCIA (confirmação de programação pelo instrutor)
> foi arrancado pela raiz — criava desgaste e não funcionava bem. O campo `status` colapsou:
> `Pendente`/`Confirmado` → **`"Programado"`** (só `Rascunho` segue distinto). `confirmedAt` /
> `confirmedBy` continuam no banco, **inertes**. Ver memória `project_remove_ciencia_instrutor`.

#### 🔮 GATILHO — repensar do zero (rodar no Fable 5)

> **Quando retomar este tópico:** desenhar uma alternativa à confirmação do instrutor.
> **NÃO** ressuscitar o modelo antigo. Pergunta de partida: *qual o mínimo de ação que o
> instrutor precisa fazer para o planejador ter segurança de que a escala foi vista?*

**Por que o antigo falhou (não repetir):**
1. **Atrito por aula** — cada módulo exigia um aceite próprio → dezenas de toques.
2. **Invalidação agressiva** — qualquer mudança em campo crítico (`date`/`startTime`/`endTime`/`local`)
   resetava o aceite → instrutor re-cobrado em loop.
3. **Banner vermelho alarmista** — *"X aguardam confirmação!"* persistente e ansiogênico.
4. **Ônus no caso normal** — confirmar era a expectativa-padrão; o instrutor pagava o custo
   mesmo quando estava tudo certo.

**Princípios para a alternativa:**
- Default = **nenhuma ação necessária**; ação só para a **exceção** (algo errado / algo mudou).
- Nunca invalidar/resetar de um jeito que re-cobre o instrutor em silêncio.
- Visibilidade pro planejador **sem** transferir o ônus pro instrutor.
- Sem banners alarmistas persistentes.

**Menu de ideias (escolher/combinar):**
- **A. Exceção (opt-out):** assume ciência; a única ação é **Relatar Problema** (fluxo já existe,
  `issueLog`). Planejador vê "nenhum problema sinalizado" = OK implícito.
- **B. Recibo de leitura passivo:** marca "visto" automaticamente quando o instrutor abre a
  própria agenda (timestamp). Reaproveita `confirmedAt` (já no banco, inerte) sem migração.
  Planejador vê "visto / não visto" — informativo, não trava nada. Zero toque.
- **C. Só deltas:** designação inicial não pede nada; só uma **mudança** numa aula já vista
  dispara um aceite leve, do item mudado, e só no curto prazo.
- **D. Um toque por dia:** um único *"tudo certo p/ amanhã?"* por dia (não por aula), só nas
  próximas 24–48h.
- **E. Ack no push:** o aceite vive na própria notificação push (tocar = ciente), sem
  banner/tela separada. Infra de push (`relyon_notifications`, `push_subscriptions`) já existe.
- **F. Visibilidade suave:** trocar o gate "confirmado/pendente" por *"última visualização:
  DD/MM HH:MM"* no painel do planejador.

**Âncoras técnicas já no lugar (reaproveitar):**
- `status: "Programado"` = estado committed único; `isDraftRow` = `status === "Rascunho"`.
- Colunas `confirmedAt` / `confirmedBy` existem e estão **livres** (sem migração para reusar).
- `STATUS_COLOR` e `_busyStatuses` (locals.js) já tratam `Programado` como committed.
- Ritual de deploy: `APP_VERSION + 1` em `config.js` + commit/push (build esbuild).

### 18.4 Navegação por semana — toggle `weekOffset`

Estado `weekOffset` (number) em `InstructorDashboard`. `0` = semana atual; `+1` = próxima; `-1` = anterior. Auto-cálculo de segunda-base via `getMonday(today, offset)`.

**Auto-foco:** ao montar, se `today.getDay() >= 4 && today.getHours() >= 18` (quinta a partir das 18h), `weekOffset` inicia em `1`. Decisão de produto: a ansiedade de antecipação começa por volta de quinta à noite — calibrável.

**Botão "Hoje":** só renderiza quando `weekOffset !== 0`.

### 18.5 Linha "agora"

Implementada como `<div>` absoluto dentro do bloco timeline. `setInterval(60000)` força re-render via `useState(Date.now())`. Posicionamento via `top = ((nowHours + nowMins/60) - START_HOUR) / totalH * (totalH * SLOT_H)`.

**Scroll automático:** em mobile (`useIsMobile()`), `useEffect` no mount usa `scrollIntoView({ block: 'center', behavior: 'auto' })` na linha. `behavior: 'auto'` (não `smooth`) cumpre o princípio do "movimento silencioso".

### 18.6 Tela "Minhas Confirmações" — ❌ REMOVIDA (2026-06-10)

> Removida junto com o sistema de ciência. Componente `MyConfirmations` deletado de
> `instructor.js`; rota `my-confirmations` e item de menu retirados. **Gatilho de redesenho em §18.3.**

### 18.7 Push notifications — fora deste escopo

Web Push real (Service Worker + VAPID + iOS PWA install) **continua existindo** no toolbar do dashboard como toggle do usuário (já presente). A Central de Notificações (§18.2) é **camada paralela**, não substitui. Smartwatch recebe push do celular nativamente — fora de escopo permanente.
- **Treinamento sem flag `poolBatch`:** turma daquela manhã não aparece na grade. É filtrada por design.

---

## 19. Class Planning — Visão Semanal a Partir de Um Dia (2026-05-20)

> Refator da aba **Class Planning** em `ReportsPage` para resolver dois bugs e uma confusão semântica.

### 19.1 Problemas resolvidos

1. **Bug crônico de período mesclado:** turmas distintas com mesmo `className` (ex.: "CACI - 01" em maio e em julho) apareciam fundidas, com PERÍODO mostrando um range gigantesco (maio → julho). Causa: o agrupamento usava `s.className`, mas o identificador canônico de turma é `s.classId` (UUID) — ver §17.5 e o comentário em `schedule.js:921-922`.

2. **Filtro DE/ATÉ que fingia ser semanal:** os defaults já apontavam para Seg-Dom da semana atual, mas a UI deixava o usuário escolher dois dias arbitrários, contradizendo o conceito ("Class Planning = um dia específico", segundo o usuário).

3. **Coluna PERÍODO removida em iteração anterior:** alterações não comitadas no worktree tinham apagado a coluna inteira — usuário não tinha como ver início/término real da turma.

### 19.2 Nova semântica

- **Input único `clpDate`** (default: hoje) substitui o par `clpFrom`/`clpTo`
- Helper `getWeekRange(dateStr)` resolve `{weekStart, weekEnd}` = Seg→Dom da semana que contém o dia
- `allItems = schedules.filter(s => s.date >= weekStart && s.date <= weekEnd)`
- Agrupamento por `keyOf(s) = s.classId || \`name:${s.className}\`` (fallback para dados legados sem `classId`)
- Coluna **PERÍODO** varre **todos** os `schedules` (não só os da semana filtrada) para o `classId` da linha → mostra início → término REAIS da turma, mesmo que estourem a semana selecionada
- Header do PDF: `SEMANA: 18/05 → 24/05 · DIA SELECIONADO: 20/05` (em vez de "PERÍODO: DE - ATÉ")

### 19.3 Regra de agrupamento canônica para relatórios

> **Toda agregação por turma em relatórios deve usar `classId` como chave.** `className` é texto livre, opcionalmente sequencial, com colisões esperadas entre cohortes — só serve para exibição.

Onde isso já estava implementado e podemos consultar como referência:
- `schedule.js:921-930` — `allClasses` (Map keyed por `classId`)
- `schedule.js:1026` — `seen` Map para dropdown de edição (idem)

Onde estava errado e foi corrigido:
- `reports.js:537` — `byClass[s.className]` → `byClass[keyOf(s)]`

### 19.4 Helper `getWeekRange`

```js
const getWeekRange = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0=Dom..6=Sab
  const offsetToMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d); mon.setDate(d.getDate() - offsetToMon);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = x => x.toISOString().split("T")[0];
  return { weekStart: fmt(mon), weekEnd: fmt(sun) };
};
```

Local (escopo do bloco `tab === "classplanning"`). Não foi promovido a util compartilhada porque (a) é único call site hoje e (b) o resto do app já usa cálculos semelhantes inline com convenção Seg-Dom — ver `WeeklyCalendarView` e o pool batch picker. Promoção a util faz sentido se aparecer um terceiro consumidor.

---

## 20. Arquitetura Offline-First de `relyon_schedules` (2026-05-20)

> Refator preventivo após o bug 2026-05-20: Matheus perdeu uma programação do dia após Ctrl+Shift+R. A causa-raiz exata não foi identificada (possivelmente RLS transitória, possivelmente payload inválido sem id), mas o sistema antes deste refator era estruturalmente frágil — uma única falha de escrita no Supabase levava a perda silenciosa.

### 20.1 Camadas

A persistência de `relyon_schedules` agora tem três camadas em série:

```
React state (RAM)  ──► localStorage (espelho síncrono)  ──► Supabase (autoritativo)
                                    │
                                    └──► outbox em LS (retry para escritas que falharem)
```

**Invariantes:**

1. Toda mutação grava em LS **antes** do upsert Supabase. Hard refresh sempre encontra o último state em RAM persistido.
2. Boot lê LS primeiro (paint imediato, sem flash de tela vazia), depois fetch paginado do Supabase faz reconciliação.
3. Falha de escrita não descarta — enfileira na outbox para retry automático com backoff.
4. UI sempre reflete o estado real da fila (badge persistente), nunca toast efêmero.

### 20.2 Fase 1 — Espelho em localStorage

Chave: `localStorage[rl360_relyon_schedules]` (JSON array do state atual).

Pontos de escrita (`config.js`):
- `useSchedules` init lazy: lê LS antes de qualquer fetch
- `setSchedules` callback: grava LS sincronamente antes de `_enqueuePersist`
- Handler do realtime channel: grava LS após aplicar INSERT/UPDATE/DELETE remoto
- Reconciliação pós-fetch: grava LS após merge

**Reconciliação no boot:**

```
sbIds        = Set(rows do Supabase)
pendingLocal = rows do LS cujos ids não estão no Supabase
merged       = [...sbRows, ...pendingLocal]

se pendingLocal.length > 0:
  console.warn(...)
  _enqueuePersist(sbRows, merged)   // reempurra
```

Isso cobre o cenário do bug original: row foi a LS mas o INSERT no Supabase falhou; no próximo refresh ela ressurge e é reempurrada.

### 20.3 Fase 2 — Outbox com retry e backoff

Chave: `localStorage[rl360_schedules_outbox]` no formato `{ ops: [...] }`.

**Anatomia de uma op:**

```js
{
  id: "obx-<ts>-<rand>",     // identificador único pra dedupe
  op: "insert" | "update" | "delete" | "delete-by-class",
  rows: [...] | null,         // insert
  ids: [...] | null,          // delete
  row: {...} | null,          // update (uma row)
  classId: "..." | null,      // delete-by-class
  attempts: number,
  queuedAt: timestamp,
  lastAttemptAt: timestamp | null,
  lastError: string | null,
  status: "pending" | "failed-rls"
}
```

**Backoff exponencial (em ms, clamp na última posição):**

```js
[2000, 8000, 30000, 120000, 600000, 1800000]  // 2s · 8s · 30s · 2min · 10min · 30min
```

**Triggers de flush:**

| Trigger | Quando |
|---------|--------|
| Boot delay 3s | Cobertura inicial após reconciliação |
| `window.online` | Conexão voltou |
| `window.focus` | Usuário voltou pra aba (potencialmente após sleep) |
| Sucesso de outra escrita | Janela quente — aproveita conexão verificada |
| Timer próprio | Backoff scheduling |
| Manual via badge | Usuário clicou "Sincronizar agora" |

**Detecção de RLS / Auth (sem retry automático):**

```js
const _isRlsError = (err) => {
  const msg = (err.message || '').toLowerCase();
  return msg.includes('row-level security') || msg.includes('row level security') ||
         msg.includes('permission denied') || msg.includes('not authorized') ||
         msg.includes('jwt') || msg.includes('rls');
};
```

Ops com status `failed-rls` continuam na fila mas não disparam retry — provavelmente exigem investigação manual de policy. O badge mostra alerta vermelho permanente.

### 20.4 Trade-off explícito: Last-Write-Wins (LWW)

Quando uma op fica enfileirada e é executada minutos depois, outro usuário pode ter editado a mesma row. A outbox **não detecta nem reconcilia esse conflito** — a versão dela é a que prevalece:

| Op da outbox | Estado no banco | Resultado |
|--------------|-----------------|-----------|
| `insert` | row já existe (mesmo id) | `.upsert()` sobrescreve → LWW |
| `update` | row foi alterada por outro | overwrite silencioso → LWW |
| `update` | row foi deletada por outro | `.eq('id', ...)` afeta 0 rows → no-op |
| `delete` | row já apagada | `.in('id', [...])` afeta 0 rows → no-op |

**Por que LWW e não merge:**
- O app é majoritariamente single-writer (1 planejador por janela de tempo)
- Detectar conflito exigiria coluna `updated_at` + CAS + UI de resolução — complexidade desproporcional ao risco real
- Em multi-writer eventual, a edição perdida ainda fica visível via realtime para o autor original e o erro humano é detectável

**Quando isso vai morder:** dois admins editando a mesma turma offline na mesma janela. Risco aceitável até prova em contrário.

### 20.5 Fase 3 — Badge persistente (`SaveMonitor`)

Substitui o antigo toast que sumia em 10s. Posição: canto inferior direito (`position: fixed`).

**5 estados em ordem de prioridade visual:**

| Modo | Cor | Trigger | Texto |
|------|-----|---------|-------|
| `offline` | Cinza | `!navigator.onLine` + `pending > 0` | "Offline · N pendentes" |
| `failed-rls` | Vermelho forte | `failedRls > 0` | "N falha(s) de permissão — clique" |
| `pending` | Vermelho discreto | `pending > 0` (e online) | "N alteração(ões) pendente(s) · sincronizar" |
| `saving` | Amarelo + spinner | `inflight > 0` | "Salvando…" / "Salvando N…" |
| `synced` | Verde discreto | tudo zero | "Sincronizado · há Xs" |

**Fontes de atualização:**
- `onSaveEvent` (existente desde antes do refator): reage imediato a sucesso/erro
- `window.addEventListener('online'/'offline')`: muda modo offline
- Polling 2s: capta avanços do backoff que não passaram por save event (ex: attempts incrementou)

**Painel expandido (click no badge quando há ops na fila):**
- Lista top-8 ops com tipo, contagem/turma, idade, número de tentativas, flag de permissão
- Último erro registrado
- Botão "Sincronizar agora" → `window.__outboxFlush()`

### 20.6 Guard de `beforeunload`

```js
window.addEventListener('beforeunload', (e) => {
  if (_outboxStats().pending > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});
```

Só dispara prompt nativo quando há pendências reais. Em uso normal (outbox vazia), zero atrito.

**Limitação:** Chrome ignora mensagem customizada desde 2017; o prompt é genérico do browser ("Deixar este site? Pode haver alterações não salvas").

### 20.7 APIs globais para debug

Expostas em `window.__*` (acessíveis pelo console em produção):

| API | Uso |
|-----|-----|
| `__outboxStats()` | `{ total, pending, failedRls, oldestQueuedAt }` |
| `__outboxList()` | Array completo das ops |
| `__outboxFlush()` | Força tentativa imediata (ignora backoff) |
| `__outboxClear()` | Esvazia a fila (cuidado — perde ops pendentes!) |
| `__newScheduleId()` | Gera id bigint-safe (debug de reentrada) |
| `__deleteSchedulesByClassId(uuid)` | Defensive delete (também enfileira em falha) |
| `__resetRelyOn360()` | Reset total — apaga tudo no banco + reload |

### 20.8 Cenário de validação

Para confirmar o end-to-end localmente:

1. Abrir o app → badge mostra "Sincronizado · há Xs" verde
2. DevTools → Network → "Offline"
3. Criar uma turma → badge fica vermelho "1 alteração pendente · sincronizar"
4. Click no badge → painel mostra a op (`Criar 1 turma(s) · há 3s · 0 tentativas`)
5. Tentar fechar a aba → prompt nativo de unload
6. Ctrl+Shift+R com Network ainda Offline → turma reaparece (vinda do LS)
7. Network → "Online" → console loga `[outbox] online detectado — flushing`, badge volta a verde em ~2s
8. `__outboxStats()` → `{ pending: 0, ... }`

### 20.9 Limites conhecidos / não cobertos

- **Causa-raiz da falha original não investigada.** A outbox protege contra perda mas não diagnostica. Se as ops começarem a ficar `failed-rls` ou a falhar consistentemente, investigar é prioridade — o sistema não vai consertar sozinho.
- **Sem cap explícito na fila.** Acima de 50 ops sai um `console.error`, mas a fila continua aceitando. Em catástrofe (Supabase down por horas) o LS cresce indefinidamente.
- **Realtime channel não tem fallback.** Se a subscription cair, atualizações de outros clientes são perdidas. Polling de fallback seria nova feature, fora do escopo deste refator.
- **LWW** já documentado em §20.4.

### 20.10 Arquivos tocados

- `js/config.js` — outbox completa (`_outboxRead/Write/Enqueue/Flush`, `_executeOutboxOp`, `_isRlsError`, `_scheduleOutboxFlush`, `_backoffMs`, listeners), refator de `_persistSchedules` e `_deleteSchedulesByClassId`, espelho LS de `useSchedules`, beforeunload guard
- `js/app.js` — `SaveMonitor` reescrito com 5 estados + painel expandido + helpers `_opLabel`, `_fmtAgo`
- `index.html` — cache-busters `config.js?v=cov13`, `app.js?v=cov7`

---

## 21. Comunicação — Canal de Requisições (2026-05-22)

Substitui WhatsApp/telefone informal por canal rastreável dentro do app: Instrutor pede, Planejador decide, ausência é gerada automaticamente. Implementado em `js/communication.js` (~470 LOC).

### 21.1 Bug raiz — `instructorId` salvo como `"undefined"`

Durante o desenvolvimento inicial da feature, todas as requisições eram salvas com `instructorId: "undefined"` (string literal) e todos os instrutores enxergavam tudo. Investigação:

```js
// auth.js:92 — montagem do user de instrutor
const fullInstr = { ...instr, role: "instructor", avatar: av };
// user.id existe (vem do spread de instr); user.instructorId NÃO existe.
```

```js
// communication.js (versão antiga)
instructorId: isInstr ? String(user.instructorId) : "",  // ← String(undefined) === "undefined"
// filtro
allRequests.filter(r => String(r.instructorId) === String(user.instructorId))
// "undefined" === "undefined" → TRUE para todas as rows → vazamento horizontal
```

**Fix:** trocar `user.instructorId` por `user.id` em todas as 4 ocorrências (filtro `myRequests`, criação via `handleSubmit`, criação via `handleSickYes`, lookup do instrutor no `instructors[]`).

**Lição:** ao spread um objeto para criar um "user", não inventar campo derivado — usar o `id` do próprio objeto-fonte. O mesmo padrão existe em `linkedInstructorId` (em `users`, vincula um Admin a um Instructor para a visão "Meu Histórico") — mas naquele caso o campo está explicitamente no schema do `users`.

### 21.2 Gate de acesso — `canPlan(user)` em vez de `user.role === "admin"`

A versão inicial só mostrava a aba "Gestão" para `admin` e `planejador`, excluindo `developer`. A Sidebar já usava `canAdmin(user)` (= developer | admin) consistentemente — o gate da Comunicação era inconsistente.

**Fix:** `const canManage = canPlan(user)` — abrange `developer | admin | planejador`. O helper já existe em `js/constants.js:141`.

### 21.3 Migração automática de IDs legados

Para não perder as 3 requisições já gravadas com `instructorId: "undefined"`, há uma migração one-shot na montagem:

```js
React.useEffect(() => {
  if (!requests?.length || !instructors?.length) return;
  const needsFix = requests.some(r => _isInvalidInstructorId(r.instructorId) && r.instructorName);
  if (!needsFix) return;
  const fixed = requests.map(r => {
    if (!_isInvalidInstructorId(r.instructorId)) return r;
    const match = instructors.find(i => i.name === r.instructorName);
    return match ? { ...r, instructorId: String(match.id) } : r;
  });
  const changed = fixed.some((r, i) => r.instructorId !== requests[i].instructorId);
  if (changed) setRequests(fixed);
}, [requests, instructors, setRequests]);
```

**Idempotência:** o guard `if (!needsFix)` e a comparação `changed` garantem que `setRequests` só é chamado quando há mudança real. Sem loop infinito mesmo se algum `instructorName` não bater (a request fica como está — não vira `instructorId: undefined` de novo).

**Helper:** `_isInvalidInstructorId(id)` cobre `null`, `undefined`, `""`, `"undefined"`, `"null"`, `"NaN"`.

### 21.4 Modal de aprovação — feedback como cidadão de primeira classe

Antes: `ApproveWithDateModal` só abria quando `req.type === "doenca" || "outro"` (period `none`). Para os demais tipos, a aprovação era direta — sem feedback.

Agora: `ApproveModal` substitui o antigo e sempre abre. Comportamento:

- **Tipos com data definida** (`single`, `range`): exibe "Período solicitado: X" em read-only; campo "Feedback ao instrutor (opcional)".
- **Tipos sem data** (`none`): exibe `De` / `Até` editáveis (default = hoje); mesmo campo de feedback.

A confirmação chama `doApprove(req, startDate, endDate, feedback)` que persiste `approvedAt`, `approvedBy`, `approvalFeedback` no objeto request e dispara `createNotification` com corpo enriquecido pelo feedback (se houver).

### 21.5 Priorização — toggle no card pendente

Campo opcional `priority: boolean` no objeto request. Visível apenas no Planejador na aba "Aguardando":

- Botão "📌 Priorizar" / "📌 Priorizada" (toggle visual: outline vs preenchido)
- Card com `priority: true` ganha `border: 1px solid #ffa619` (laranja) — destaque sutil
- Ordenação: prioritárias primeiro, depois `createdAt` desc

Em "Aprovada" e "Rejeitada" o flag não é exibido nem manipulável — é apenas um marcador temporal de "urgência de decisão".

### 21.6 Log de decisão — campos persistidos

Adicionados ao objeto request (ver SPEC §3.9):

| Campo | Quando preenchido |
|-------|-------------------|
| `approvedAt` (ISO) | no momento da aprovação |
| `approvedBy` (string) | `user.name` do Planejador |
| `approvalFeedback` (string) | mensagem opcional, pode ser `""` |
| `rejectedAt` (ISO) | no momento da rejeição |
| `rejectedBy` (string) | `user.name` do Planejador |
| `rejectionReason` (string) | obrigatório no `rejectModal` |

O `RequestCard` mostra um bloco com borda colorida (verde/vermelha) listando "Aprovada/Rejeitada por <X> · DD/MM/YYYY HH:MM" + feedback/motivo. Visível para o Instrutor (no histórico próprio) e para o Planejador (em aba Aprovada/Rejeitada).

### 21.7 Geração automática de ausência

A aprovação cria automaticamente um registro em `absences` (via `setAbsences(prev => [...prev, absence])`), exceto quando `req.absenceCreated === true` (caso "Estou doente — sim, vou faltar hoje", onde a ausência já é criada no envio).

Mapeamento `type → absType / absCat` definido em `REQUEST_TYPES` (ver SPEC §3.9). Exemplo: aprovação de "Folga — 1 dia" cria ausência `type: "planejada", category: "Folga Banco de Horas"` com `startDate === endDate`.

### 21.8 Casos limítrofes

- **Instrutor renomeado:** a migração de IDs (§21.3) usa `name` como chave. Se um instrutor foi renomeado depois de criar a request, o lookup falha silenciosamente e a request fica órfã. Aceitável: cenário raro e a request continua visível na lista do Planejador (apenas sem botão de Aprovar funcionar 100% porque a ausência usaria `NaN` como `instructorId`). Solução futura: migração manual via UI.
- **Aprovar request sem data (tipo "Outro motivo"):** modal força preenchimento de `De`/`Até`. Caso o Planejador escolha datas no passado, a ausência é criada mesmo assim — comportamento intencional (regularização retroativa).
- **Rejeitar request sem motivo:** o `rejectModal` aceita motivo vazio (`""`), mas a notificação fica "Sem motivo informado." — não bloqueia.
- **Notificação assíncrona:** `createNotification` é fire-and-forget; falha de rede gera `console.error` mas não bloqueia a aprovação. A request muda de status mesmo se a notificação não chegar.

### 21.9 Arquivos tocados

- `js/communication.js` — refator completo: gate `canPlan`, `user.id` em vez de `user.instructorId`, `ApproveModal` substitui `ApproveWithDateModal`, migração de IDs, toggle de prioridade, log de decisão, ordenação por data de decisão por filtro
- `index.html` — cache-buster `communication.js?v=cov2`
- `SPEC.md` — §3.9 (entidade `requests`), §4.6 (linhas de Comunicação), §5.15 (tela completa), §6 (chave `relyon_requests`)


## 22. Equipe HUET — Sequência Fixa de Papéis por Disciplina (2026-05-27)

### 22.1 Motivação

Disciplinas práticas de **HUET (Helicopter Underwater Escape Training)** exigem uma equipe de até 5 pessoas com 4 funções distintas: 1 Lead Instructor + 1 Assistant Instructor + 2 Scuba Divers + 1 Crane Operator. Antes, o sistema usava lógica genérica (Slot 0 = Lead, demais = Assistentes) baseada na flag `training.poolBatch`. Isso acoplava regras de equipe com filtro de UI (Lote Piscina), gerava confusão e impedia disciplinas individuais de adotarem a sequência.

### 22.2 Modelo de dados

**Único campo novo:** `module.isHuet: boolean` (default `false`). Flag por disciplina (não por treinamento). Persiste via `setTrainings` dentro de `module` no array `training.modules[]`.

- `training.poolBatch` continua independente — segue sendo só filtro de elegibilidade do modal `PoolBatchPage` (não dita regra de equipe).
- `slot.role` (já existente, antes só para Translator) agora também armazena papéis HUET (`"Lead Instructor"`, `"Assistant Instructor"`, `"Scuba Diver"`, `"Crane Operator"`) — permite remoção individual por turma sem perda do papel ao recalcular.

### 22.3 Sequência de papéis e truncamento

`POOL_TEAM_ROLES` em `constants.js` define a ordem fixa:

```
slot 0 → Lead Instructor    (competência LEAD_INSTRUCTOR + canLead na disciplina)
slot 1 → Assistant Instructor (skill da disciplina; ASSISTANT_INSTRUCTOR é a competência associada)
slot 2 → Scuba Diver        (competência SCUBA_DIVER)
slot 3 → Scuba Diver        (competência SCUBA_DIVER)
slot 4 → Crane Operator     (competência CRANE_OPERATOR)
```

`mod.instructorCount` trunca da direita: `count=3` → só Lead + Assist + Scuba#1 são gerados pelo wizard.

Cada papel define no `POOL_TEAM_ROLES`:
- `requiresCompetency` — código da `SPECIAL_COMPETENCIES` exigida (validada via `hasValidCompetency`)
- `requiresDisciplineSkill` — se também precisa ter a skill da disciplina (true pra Lead/Assist; false pra Scuba/Crane)

### 22.4 Detecção e helpers

- `isHuetModule(mod)` em `constants.js` substitui `isPoolTeamModule(training, mod)`. Compat shim mantido pra não quebrar call-sites legados.
- `getSlotChip(slot, ntIdx, mod, training)` em `constants.js`: quando `isHuetModule(mod)`, retorna o label longo do papel (`Lead Instructor`, `Scuba Diver`, etc.) em vez do "Instr./Assist." genérico.

### 22.5 Alocação automática

`reassignInstructorsForEdit` (`schedule.js:278`) e `_doInitPlan` (`schedule.js:603`) usam o mesmo padrão:

```
isPoolTeam = isHuetModule(mod)
count = isPoolTeam && existingSlots.length > 0 ? existingSlots.length : mod.instructorCount
para cada slot k:
  roleParaSlot = slot.role salvo OU POOL_TEAM_ROLES[k] (fallback posicional)
  pool = instrutores com hasValidCompetency(roleParaSlot.requiresCompetency)
         + (se requiresDisciplineSkill, skill da disciplina)
         + (se Lead Instructor, canLead na skill)
```

Quando `count` vem do `existingSlots.length`, garante que **remover papel via chip X persiste**: o recálculo respeita a configuração da turma, não impõe `mod.instructorCount` por cima.

### 22.B Camadas de proteção contra perda de dados

Histórico: ao introduzir competências HUET, uma rodada de recálculo automático zerou slots de turmas existentes porque nenhum instrutor tinha as competências exigidas ainda. Esta arquitetura tem 5 camadas redundantes ativas (B5 foi planejada mas revertida durante a sessão — ver §22.B5):

#### B1 — Toggle off por padrão
`module.isHuet` nasce `false` em todo módulo legado. Lógica nova só ativa quando o admin liga manualmente disciplina por disciplina.

#### B2 — Freeze técnico (`schedule.js:317`)
Em `reassignInstructorsForEdit`, quando `isHuetModule(mod)` e o slot já tem `instructorId` salvo:
- O instrutor é preservado **mesmo se não tiver a competência exigida pela regra nova**
- Recálculo só preenche slots vazios
- Sem `useEffect` automático em `schedule.js` — recálculo só dispara em clique explícito ("↺ Recalcular" ou criação de turma nova)

#### B3 — Validação suave (`schedule.js:1995, 1437`)
Quando o slot HUET tem instrutor sem a competência exigida, exibe ⚠ ao lado do nome com tooltip explicativo. Não bloqueia, não remove — só sinaliza pro planejador.

#### B4 — Wizard de backfill de competências (`trainings.js`, admin)
Botão "🤿 Sugerir Competências HUET" no header da listagem de Treinamentos (admin only). Heurística:
- Para cada instrutor que tem skill numa disciplina marcada `isHuet` (ou legado `poolBatch + PRÁTICA`):
  - Se a skill tem `canLead=true` → sugere `LEAD_INSTRUCTOR`
  - Senão → sugere `ASSISTANT_INSTRUCTOR`
  - Sempre sugere `SCUBA_DIVER` (pré-requisito)
- `CRANE_OPERATOR` **não é inferido** — cadastro manual no perfil do instrutor

Admin revisa em modal com checkboxes (selecione todas/nenhuma) e aplica em lote. `acquiredAt` é setado pra hoje, `validUntil` fica vazio (sem expiração).

#### B5 — Dry-run ao ligar `isHuet` (REVERTIDA)
**Status: revertida.** Implementação inicial usava um interceptor no toggle (`interceptHuetToggle`) que abria modal antes do flip; em produção o toggle parou de responder ao clique (provável bug no chain de state-set). Segunda tentativa foi banner inline rodando `analyzeHuetImpact` a cada render — fez o toggle desaparecer (suspeita: erro silencioso em `analyzeHuetImpact` quebrando o subtree do React).

Estado atual:
- Toggle do `isHuet` é flip direto (sem interceptor)
- Salvar é direto (sem dry-run no caminho)
- Código-morto deixado intencionalmente em `trainings.js`: state `huetDryRun`, helper `analyzeHuetImpact`, e o `<Modal>` HUET dry-run no fim do componente — todos sem call-site ativo

Próxima tentativa deve ser **assíncrona** (ex: página admin separada "Auditar Impacto HUET") em vez de inline no formulário de edição, pra desacoplar do ciclo de render do toggle. A ativação `isHuet` segue protegida por B1 (default off) + B2 (freeze) — sem perda de dados, só sem preview do impacto.

#### B6 — EditGuardModal (`components.js`)
Componente novo, baseado em `DeleteGuardModal`. Aplicado em `saveEditItems` (`schedule.js:543`):
- Detecta mudanças em `local / startTime / endTime / date` de módulos cuja `date < today`
- Quando há mudanças no passado, abre modal com:
  - Header laranja avisando que é registro histórico
  - Lista de mudanças (cada linha precedida de `*`) — o "resumo" pedido na spec
  - Campo de senha (valida via `checkPw(input, user.password)` — mesmo padrão do DeleteGuard)
- Sem senha correta → save não acontece
- Mudanças em turmas futuras (date >= today) seguem direto sem guard

### 22.6 Reports

`reports.js:1152` e `1322` — `isLeadRole` antes era `!["Assistant Instructor","Translator"].includes(s.role)`. Agora exclui também `"Scuba Diver"` e `"Crane Operator"`, garantindo que nos relatórios de "Carga por Instrutor" e "IP da Semana" só o Lead Instructor verdadeiro conte como lead (apoio operacional fica fora da estatística).

### 22.7 Arquivos tocados

- `js/constants.js` — `isHuetModule`, `getSlotChip` HUET-aware, `POOL_TEAM_ROLES` (já existia)
- `js/schedule.js` — freeze em `reassignInstructorsForEdit`, validação suave nos slots, `EditGuardModal` em `saveEditItems`, `isHuetModule` substitui `isPoolTeamModule`, chip removível por turma
- `js/trainings.js` — toggle `isHuet` (novo módulo + edição inline), badge 🤿 HUET na listagem, botão "Sugerir Competências HUET" + modal de backfill, `interceptHuetToggle` + modal de dry-run
- `js/components.js` — `EditGuardModal` novo
- `js/reports.js` — `isLeadRole` exclui Scuba/Crane
- `js/app.js` — `schedules` prop passada para `TrainingsPage`

---

## 23. IA — LOG de Pacotes (Lotes) (2026-05-29)

### 23.1 Motivação

A tela `AiPage` cria turmas em lote, mas não havia rastro do que cada lote produziu. Sem isso, desfazer uma criação errada exigia caçar turma por turma na Programação. O LOG transforma cada clique em "Criar X turma(s)" num **pacote auditável e reversível**.

### 23.2 Modelo de dados — `relyon_ai_packages`

Vive em `app_state` (key-value, via `usePersisted`), sincronizado entre dispositivos. Cada pacote:

```js
{
  id, version,            // version = max(version)+1 no momento do commit
  createdAt, createdBy, createdById,
  name, note,             // editáveis
  source,                 // "xlsx" | "manual" | "mixed"
  fileName,
  totalCreated, totalConflicts, totalUnstaffed,
  classes: [ { classId, className, trainingId, trainingName, gcc, date, status, rowCount, conflicts, unstaffed, withTranslator } ]
}
```

- O pacote guarda só **metadados** das turmas (snapshot leve), não as rows de `schedules`. A fonte de verdade das turmas continua sendo `relyon_schedules`, ligada por `classId`.
- "Turma ainda existe?" é derivado em runtime: `existingClassIds = new Set(schedules.map(s => s.classId))`. Turma cujo `classId` saiu de `schedules` é marcada `(removida)` — sem mutar o pacote.

### 23.3 Reuso da deleção de turmas

Excluir pacote (desfazer lote) e remover turmas no editar usam o mesmo caminho já consolidado no §16: `_deleteSchedulesByClassId(classId)` (tombstone + DELETE) seguido de `setSchedules(prev => prev.filter(...))`. Nada de lógica de deleção nova — só orquestração por `classId`.

### 23.4 Senha em ações destrutivas

- **Excluir pacote** e **Editar com turmas marcadas para remover** → `DeleteGuardModal` (verifica `checkPw` contra a senha do usuário logado).
- Editar **sem** remoções (só renome/nota) não pede senha.
- O fluxo de edição com guard captura o estado do render via closure (`applyEdit`), estável enquanto o modal de edição segue montado sob o `DeleteGuardModal`.

### 23.5 Arquivos tocados

- `js/config.js` — `relyon_ai_packages` em `_DB_KEYS` (sync + reset)
- `js/app.js` — hook `usePersisted("relyon_ai_packages", [])`, prop para `AiPage`, default no `AppLoader`
- `js/ai.js` — registro do pacote em `doCommit`; estado/handlers de editar/excluir; seção LOG (cards expansíveis); modal de edição; `DeleteGuardModal`; helpers `fmtDateTimeBR` e `AI_PKG_SOURCE_LABEL`
- `RLS Supabase` — `app_state_insert` ganha `relyon_ai_packages` na lista de chaves permitidas (migration `add_relyon_ai_packages_to_app_state_insert_allowlist`)

---

## 24. Portão de Versão — Auto-atualização da Frota (2026-06-02)

### 24.1 Motivação

A arquitetura offline-first (§20) e o fix server-authoritative (Supabase autoritativo + journal de uploads pendentes em `config.js`) só protegem o cliente **que roda esse código**. Bastava UM cliente em código ANTIGO conectado — uma aba esquecida aberta, um aparelho que ao ligar só dá reload do cache (no incidente que originou a feature, uma senha emprestada rodando em outra casa) — para reempurrar seu snapshot stale e reverter o trabalho de toda a frota.

O Service Worker (§10.4) é network-first no `index.html`, mas `/js/*` é **stale-while-revalidate**: serve o cache na hora e só atualiza em background. Combinado com clientes que ficam dias sem fechar a aba, versões antigas viviam indefinidamente. O `?v=covN` (cache-buster) entrega o código novo, mas dependia de cada aparelho recarregar — o "caçar dispositivo na mão" que se queria eliminar.

### 24.2 Como funciona

`APP_VERSION` (inteiro monotônico) em `config.js` carimba o código. A versão publicada vive em `app_state.app_version = { build: N }`:

- **Publicação (max-vence):** no boot, se `APP_VERSION > server`, o cliente publica seu número. Só sobe — o 1º cliente que carrega código novo eleva o servidor; ninguém regride.
- **Detecção:** `checkVersionGate()` roda no início do `AppLoader`, **ANTES de ler/gravar dados** (senão o cliente velho reempurraria o cache stale antes de recarregar). `APP_VERSION < server` → velho → upgrade. `>=` → segue.
- **Upgrade (`_applyUpdate`):** limpa só o cache de código (`relyon360-v5` = index.html + /js/*), **preserva** o cache de CDN (imutável) e **NÃO desregistra o SW** (manteria as push subscriptions), e dá `location.reload()`. Com o cache de código vazio, o reload busca tudo fresco da rede.
- **Guard anti-loop:** `sessionStorage['rl360_vgate']` conta tentativas por versão-alvo. Após 2 reloads ainda velho (ex: Vercel propagando), desiste do auto-reload e mostra tela manual ("Ctrl+Shift+R"), evitando loop infinito.

### 24.3 Abas já abertas

Um segundo efeito no `AppLoader` re-checa a cada 2 min + nos eventos `focus`/`visibilitychange`:
- Aba **oculta** e velha → recarrega na hora (usuário não está olhando — convergência silenciosa; cobre o aparelho que dorme/acorda).
- Aba **visível** e velha → banner não-intrusivo "🔄 Nova versão disponível · Atualizar agora" (não interrompe quem digita; aplica no clique ou quando a aba for ocultada).

### 24.4 Por que `.update()` e não `upsert`

A row `app_version` fica **fora de `_DB_KEYS`** (não passa por `usePersisted`, reconciliação nem `__resetRelyOn360`). A RLS de `app_state` (§10.6) tem INSERT restrito a uma allowlist de chaves — `app_version` não está nela — mas UPDATE é livre (`USING true WITH CHECK true`). Por isso a row é **semeada uma vez via SQL** e o cliente só faz `.update({ value: { build } }).eq('key','app_version')`. Não se tocou na policy de INSERT (blast radius mínimo).

### 24.5 Ritual de deploy (obrigatório)

A cada deploy que toque em qualquer `js/*`, **os dois passos juntos**:
1. `APP_VERSION + 1` no topo de `config.js`.
2. Subir o `?v=` dos arquivos alterados no `index.html`.

O `?v=` **entrega** o código novo (ao menos a um cliente); o portão **garante a convergência** de todos os demais. Sem o passo 1, ninguém publica versão nova e a frota não converge.

### 24.6 Arquivos tocados

- `js/config.js` — `APP_VERSION`, `checkVersionGate`, `serverVersionAhead`, `_applyUpdate`, `_readServerVersion`, `_publishVersion`; exports em `window.__appVersion`/`__checkVersionGate`/`__serverVersionAhead`/`__applyUpdate`
- `js/app.js` — gate no início do `AppLoader` (antes do fetch); efeito de re-checagem (interval + focus/visibility); telas "Atualizando…"/manual; banner de atualização
- `index.html` — `?v=vgate1` em `config.js` e `app.js`
- `Supabase` — row `app_state.app_version = {build:1}` semeada via SQL (fora de `_DB_KEYS`; sobrevive ao `__resetRelyOn360`)

### 24.7 Verificação (preview, 2026-06-02)

Testado ponta a ponta servindo os arquivos localmente: (1) boot limpo, gate retorna `current`, sem reload falso, zero erro no console; (2) detecção stale com servidor forçado a build 2 vs cliente build 1 (`isStale: true`); (3) ciclo completo `_applyUpdate` → limpa cache → reload → recupera para `current` e **limpa o guard** sozinho.

---

## 25. Strip de Colunas Não-Whitelist em Leituras do Supabase (2026-06-03)

### 25.1 Motivação

O cliente mantinha um warning crônico no console todo boot:

```
[_readLocalSchedules] N row(s) com campos não-coluna em LS — limpas (whitelist)
```

Com N ≈ total de schedules no banco (~2400). A defesa em `_readLocalSchedules` (§20) sanitizava e fazia writeback, mas a `useEffect` seguinte re-contaminava o LS. O ciclo se repetia indefinidamente.

**Causa raiz:** a tabela `relyon_schedules` no Supabase tem **`created_at`** e **`updated_at`** (auto-managed pelo Postgres). Essas colunas **não estão em `_SCHEDULE_COLUMNS`** (whitelist client-side, ver `config.js:551`) porque o cliente não as usa em nenhuma renderização ou cálculo — o comentário em `_persistSchedules:794` explicitamente cita que elas são ignoradas no diff de UPDATE para evitar UPDATEs espúrios.

O leak vinha de **2 caminhos que escrevem direto no LS sem passar pelo gate de `setSchedules`** (que strippa em `config.js:1109`):

1. **Reconciliação de boot** (`config.js:967-1021`): `sb.from('relyon_schedules').select('*')` traz todas as colunas, incluindo timestamps. `cleanAll = all.filter(...)` preserva os campos, `merged = [...cleanAll, ...pendingLocal]` propaga, e `_writeLocalSchedules(merged)` escreve no LS contaminado.
2. **Handler Realtime** (`config.js:1066-1086`): o payload `nw` vem do canal `postgres_changes` com todas as colunas. `next = [...prev, nw]` (INSERT) e `next = prev.map(s => sid(s) === sid(nw) ? nw : s)` (UPDATE) entram no state com extras; `_writeLocalSchedules(next)` propaga pro LS.

Próximo boot: `_readLocalSchedules` lê e detecta os extras → warning fira → sanitiza in-memory → writeback limpo → mas `useEffect` re-contamina logo em seguida. Loop perpétuo.

### 25.2 Por que ficou invisível por meses

As defesas em camadas mascararam o leak:
- `_stripScheduleRow` em **todos** os caminhos de INSERT/UPDATE pro SB (`_persistSchedules`, `_executeOutboxOp`, `_enqueuePersist`) garantia que o Supabase **nunca** recebesse os campos extras → banco permanecia limpo.
- `_readLocalSchedules` sanitizava antes de devolver pro state → React state ficava limpo dentro do ciclo de vida do componente.
- O `setSchedules` gate também sanitizava → escritas explícitas (savePlan, deleteClass, ack/resolve etc.) escreviam LS limpo.

O LS engordava ~50KB de timestamps inúteis por sessão, mas como ele era sempre sanitizado na leitura e o banco nunca via o lixo, **funcionava** — só com ruído.

### 25.3 Fix

Strip na fonte, antes que o dado entre em state ou LS:

```js
// config.js:967 — reconciliação após .select('*')
all = all.concat(data.map(_stripScheduleRow));

// config.js:1068 — handler realtime
const nwClean = nw ? _stripScheduleRow(nw) : nw;
// ...usa nwClean em vez de nw nos branches INSERT/UPDATE
```

Não trocou `.select('*')` por `.select('id,classId,...')` explícito porque a lista mudaria a cada coluna adicionada no schema (mais frágil). O strip no client é a fronteira correta.

### 25.4 Regra para o futuro

**Qualquer leitura do Supabase que materialize dados pra state ou LS precisa passar por `_stripScheduleRow`.** O whitelist `_SCHEDULE_COLUMNS` é a fonte de verdade sobre o que o cliente conhece da tabela — schema do SB pode ter mais colunas (metadata Postgres, system fields) e isso está OK desde que o strip aconteça antes do dado entrar no domínio do cliente. Ver [[feedback-select-star-ls-leak]].

### 25.5 Arquivos tocados

- `js/config.js` — strip em `data.map(_stripScheduleRow)` na linha 975 (fetch paginado); `nwClean = _stripScheduleRow(nw)` na linha 1068 (realtime handler)
- `js/config.js` — `APP_VERSION` 2 → 3 (ritual de deploy §24.5)
- `index.html` — `?v=lsstrip1` em `config.js`

### 25.6 Verificação (produção, 2026-06-03)

Pós-deploy + Ctrl+Shift+R + 5s de espera (para `useEffect` async terminar):
```js
JSON.parse(localStorage.getItem('rl360_relyon_schedules')||'[]')
  .filter(r=>'created_at' in r || 'updated_at' in r).length
// → 0
```

F5 normal subsequente: console limpo, sem `[_readLocalSchedules]` warning. Bug morto.

---

## 26. Build Step (esbuild) — Fim do Babel-no-Navegador (2026-06-05)

**Cutover feito** — produção (relyon360.vercel.app) serve um bundle hasheado `app.[hash].js` em `dist/`, gerado por `node build.mjs` (chamado pela Vercel via `vercel.json`). O build concatena os 18 módulos `js/*` na ordem do `index.html`, transpila o JSX com esbuild e publica 1 tag de script (não mais 18). Hash muda automaticamente quando o código muda → invalidação de cache automática. Babel-standalone saiu do caminho de produção (segue só como fallback de rollback).

- **Ritual `?v=` morreu**: não é mais necessário bumpar query string por arquivo alterado em produção.
- **`APP_VERSION`/portão de versão (§24) ficam** como rede de segurança opcional — útil só para forçar reload imediato da frota.
- **Rollback**: reverter `vercel.json` na `main` faz a Vercel voltar a servir o repo estático (babel-no-navegador) e ressuscita o ritual `?v=` antigo. Runbook completo em `MIGRACAO_BUILD_STEP.md`.
- PR mergeado: ver histórico do repositório (`MIGRACAO_BUILD_STEP.md §0` tem o detalhe das fases 0/1/2).

## 27. Helpers Puros Single-Sourced em `core.cjs` (2026-06-12)

9 primitivas (`recalcTimes` excluído — fica em `config.js` por depender de runtime) movidas para `core.cjs`, fonte única consumida tanto por produção quanto pelos testes. Antes havia 2 cópias (`logic.js` espelho de teste vs. runtime em `config.js`/`constants.js`) que podiam divergir silenciosamente — foi exatamente o que aconteceu com `FULL_DAY_CATEGORIES` e `isHoliday` (nacional/base), descoberto ao escrever `tests/parity-planner.test.js` (golden + paridade, 88 testes verdes) para fechar a brecha entre o planner do MCP (`agents/mcp`) e o app.

- Refactor puro — sem `APP_VERSION` bump.
- Build esbuild + 88 testes + smoke no navegador verificados pós-merge.
- Ver também §28 (ferramenta MCP `criar_turma` que motivou a descoberta da brecha).

## 28. Ferramenta MCP `rl360_criar_turma` (2026-06-12)

Servidor MCP (`agents/mcp`) ganhou um planner puro que replica o wizard de criação de turma (sem suporte a CLT Offshore; aloca CLT antes de Freelancer) e a tool `rl360_criar_turma`, permitindo criar turmas por linguagem natural via agente. Lote de 24 turmas (15–19/06) criado e verificado como prova de conceito. A skill `.claude/skills/criar-turma` documenta o fluxo para uso recorrente. Ver §27 para a unificação de helpers que fechou a divergência planner↔app.

## 29. Avaliação de Segurança e Marco 1 — Login Server-Side (2026-06-11)

Avaliação executada contra `SEGURANCA.md` (checklist RLS/anon, auth, CDN/SRI, LGPD) — status 🟠, 2 achados 🔴 **abertos**: leitura e escrita anônima de PII e hashes de senha (RLS de `app_state`/tabelas dedicadas ainda libera `anon`), causa-raiz é o login client-side (sem Supabase Auth, sessão não carrega JWT real).

- **Fase 1 aplicada** (sem regressão): backup de PII removido do bucket S3 (S3), `search_path`/revoke em RPC de push (S8), endurecimento de XSS em PDF (S4), SRI + pin de versão de CDN (S5), headers de segurança na Vercel (S6). `APP_VERSION` 18.
- **S7 (HIBP)** — toggle manual, não automatizado.
- **Fase 2 (Marco 2 — apertar RLS por papel) planejada, NÃO executada** — risco de apertar errado é alto (app em branco para todos); requer staging dedicado. Runbook em `SEGURANCA.md §7/§8`. Esta é a Camada B descrita em `ACESSO.md §1` — continua aberta.

## 30. Detector de Conflitos Estendido + Remoção do Sistema de Ciência (2026-06-10)

Duas mudanças no mesmo dia, arquivos sobrepostos (`dashboard.js`):

- **Detector de conflitos do Dashboard estendido**: além de instrutor/local/vaga, agora cobre ausência, atividade da Linha do Tempo e competência faltante. IIFE `conflictInfo` + modal de detalhe.
- **Sistema de "Confirmar Ciência" removido** (botão individual + "Confirmar tudo hoje" + tela "Minhas confirmações", todos previamente em DESIGN §18). Status binário Pendente/Confirmado virou um único estado "Programado". Motivo: o modelo de confirmação não escalava bem com o volume de turmas; substituto ainda **não definido** — ver TASKS.md "🔮 FUTURO — repensar confirmação do instrutor" (DESIGN §18.3 tem o contexto do que falhou e o menu de ideias para a próxima tentativa).
- `APP_VERSION` 17; migração one-shot de ~3020 rows (Pendente/Confirmado → Programado) já executada.

## 31. Modelo de Acesso — Fase A e Bônus por Atividade (2026-06-15 a 2026-06-18)

Duas entregas sequenciais que tocam `constants.js`/`reports.js`/`coverage.js`:

- **Bônus por atividade + Extrato por Instrutor (2026-06-15 a 17)**: modelo de remuneração formalizado — Freelancer por diárias vs. CLT bônus fixo `CLT_TURMA_BONUS` por dia qualificado (Noturno/Feriado/Final de semana). Ver SPEC §4.9 para a regra completa, incluindo o fix de 2026-06-18 que excluiu `holiday_work` (marcador "Feriado" sozinho = folga) de `BONUS_ELIGIBLE_ACTIVITY_TYPES` — corrigia bônus sendo pago a quem não trabalhou no feriado.
- **Modelo de Acesso Fase A (2026-06-18, `APP_VERSION` 31)**: papel `DP` novo (somente leitura), `customer_service`/`DP` migrados para permissão default-deny (`PERMISSIONED_ROLES`), split `reports`→`reports_operacional`+`reports_financeiro` com gate por aba, bloqueio de página no roteador (`canSeePage`), botões de escrita de `instructors.js` (Excluir/Novo) agora exigem `canPlan`. **Fase A é só Camada A (UI) — não fecha S1/S2 (RLS aberta)**, que continuam como Camada B pendente (§29). Detalhe completo, matrizes e decisões em aberto: `ACESSO.md` (documento novo, fonte de verdade do modelo de acesso).
- **2026-06-19 (não versionado)**: ajustes incrementais em `coverage.js` (tipos `marketing`/`qsms`/`embarque` adicionados à lista de atividades clicáveis/editáveis na Linha do Tempo — estavam cadastrados em `ACTIVITY_TYPES` mas não no guard de edição) e `reports.js` (CSS de tabela em PDF — `white-space:nowrap` substitui `width:100%` para evitar quebra de coluna). Sem bump de `APP_VERSION` (ajustes visuais/cosméticos).
