# DESIGN — RelyOn 360 Scheduler
> Decisões técnicas de arquitetura. Explica o *como*, enquanto SPEC explica o *quê*.

---

## 1. Arquitetura

```
RelyOn360_Scheduler.html
├── <style>          CSS inline (dark theme)
├── <script>         Babel Standalone (transpila JSX no browser)
└── <script type="text/babel">
    ├── Constantes   LOCALS, INITIAL_TRAININGS, USERS, INITIAL_SCHEDULES, ...
    ├── Utilitários  minsToTime(), timeToMins(), fmtDate(), addDays(), ...
    ├── Hooks        usePersisted()
    ├── Componentes  Icon, Btn, Input, SearchSel, DeleteGuardModal,
    │                InstructorAcc, ...
    └── Pages        SchedulePage, TrainingsPage, InstructorsPage,
                     AbsencesPage, UsersPage, AreasPage
    └── App()        roteador principal (estado de navegação via useState)
```

**Decisão:** Single-file para simplicidade de deploy e distribuição. Sem build step.

---

## 2. Estado Global

Todo estado é gerenciado no componente `App()` com o hook `usePersisted`, que combina `useState` + `localStorage`.

```js
const [schedules,   setSchedules]   = usePersisted("relyon_schedules",   INITIAL_SCHEDULES);
const [trainings,   setTrainings]   = usePersisted("relyon_trainings",   INITIAL_TRAININGS);
const [areas,       setAreas]       = usePersisted("relyon_areas",       INITIAL_AREAS);
const [instructors, setInstructors] = usePersisted("relyon_instructors", INSTRUCTORS);
const [users,       setUsers]       = usePersisted("relyon_users",       USERS);
const [absences,    setAbsences]    = usePersisted("relyon_absences",    INITIAL_ABSENCES);
```

### Hook `usePersisted`
```js
const usePersisted = (key, initialValue) => {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initialValue;
      return JSON.parse(raw);
    } catch { return initialValue; }
  });
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, state]);
  return [state, setState];
};
```

**Por quê o `useRef(true)`?** Sem ele, o primeiro render salvaria os valores iniciais por cima dos dados existentes no localStorage. O ref garante que o primeiro render é ignorado.

---

## 3. Funções-chave de Agendamento

### `recalcTimes(items, startDateStr, startMins)`
Distribui uma lista de módulos na grade horária 08–12/13–17.

**Regras:**
- Se `cur` estiver no almoço (≥ 12:00 e < 13:00) → pula para 13:00
- Se o módulo cruzar o almoço → adiciona 60 min ao `endM` (wall-clock)
- Se `endM ≥ 17:00` → próximo módulo começa no dia seguinte às 08:00

```
┌─────────────────────────────────────────────────────┐
│  cur >= LUNCH_S && cur < LUNCH_E  →  cur = LUNCH_E  │  pula almoço no INÍCIO
│  endM = cur + dur                                    │  calcula fim bruto
│  cur < LUNCH_S && endM > LUNCH_S  →  endM += 60     │  compensa almoço no FIM
│  cur >= DAY_END                   →  próximo dia     │
└─────────────────────────────────────────────────────┘
```

### `sortModules(mods)`
Ordena módulos para agendamento:
1. CBINC: TEORIA → PRÁTICA
2. Regulares por `priority`
3. PROVA ao fim
4. TEMPO RESERVA após PROVA

### `initPlan()`
Gerador do planejamento automático ao criar uma turma nova.

**Fluxo:**
```
1. sortModules()
2. Score de instrutores (count de módulos que cada um pode ensinar)
3. recalcTimes() com 1 item por módulo → obtém datas/horários
4. Para cada módulo:
   a. Filtra instrutores qualificados + disponíveis, ordena por score
   b. Preenche slots (instructorCount): prioriza committedInstrs, depois score
   c. Preenche locais: reutiliza preferredLocals[mod.type][k]
5. Pass 2: REVISÃO / TEMPO RESERVA → mesmo instrutor da PROVA
6. setPlanItems(raw)
```

**Estrutura de um planItem:**
```js
{
  uid: "pi-0-101",
  mod: { id, name, type, minutes, instructorCount, ... },
  date: "2026-04-07",
  startTime: "08:00",
  endTime: "13:00",
  slots: [
    { instructorId: "5", local: "SALA 09" },
    { instructorId: "7", local: "SALA 11" }   // quando instructorCount = 2
  ]
}
```

### `savePlan()`
Expande `planItems` em linhas de `schedules` via `flatMap` nos slots:
- 1 módulo com `instructorCount: 2` → 2 linhas em `schedules`, mesmo horário, instrutores diferentes

### `getLocalOpts(mod, training)`
Filtra `LOCALS` pelo tipo do módulo e pela área do treinamento:
- TEORIA → locais com `env: "Teórico"`
- PRÁTICA → locais com `env: "Prático"` (+ filtro por subtype para CBINC)

### `isInstructorAbsent(instrId, date, startMins, endMins, absences)`
Verifica se um instrutor está ausente numa data/horário. Considera:
- Ausências de dia inteiro (FULL_DAY_CATEGORIES)
- Ausências com intervalo de hora (sobreposição)

---

## 4. Regras de Componentes React

### 4.1 Rules of Hooks
Todos os hooks (`useState`, `useEffect`, `useRef`, etc.) devem aparecer **antes de qualquer `return` condicional** em um componente. Violação causa erros silenciosos ou tela em branco.

```js
// ✅ CORRETO
const MyPage = () => {
  const [filter, setFilter] = useState("");  // hook ANTES do early return
  if (loading) return <Spinner />;
  return <div>{filter}</div>;
};

// ❌ ERRADO — hook depois do early return
const MyPage = () => {
  if (loading) return <Spinner />;
  const [filter, setFilter] = useState("");  // quebra as Rules of Hooks
};
```

### 4.2 Estabilidade de Componentes
Componentes **nunca** devem ser definidos dentro de outros componentes (especialmente não dentro de condicionais ou renders). Isso causa remount a cada render e perde estado (ex: foco de input).

```js
// ✅ CORRETO — definir fora
const InstructorAcc = ({ open, onToggle, ... }) => ( ... );
const InstructorsPage = () => { ... use InstructorAcc here ... };

// ❌ ERRADO — definir dentro
const InstructorsPage = () => {
  const Acc = ({ ... }) => ( ... );  // nova referência a cada render!
  return <Acc />;
};
```

---

## 5. Permissões

```js
const canAdmin = (u) => u.role === "developer" || u.role === "admin";
```

Páginas restritas verificam `canAdmin(user)` antes de renderizar ações destrutivas ou de criação.

---

## 6. Padrões de Código

| Padrão | Regra |
|--------|-------|
| Datas | string `"YYYY-MM-DD"` — nunca objeto Date |
| Horários | string `"HH:MM"` — `timeToMins()` e `minsToTime()` para converter |
| IDs | number nas entidades, string em `instructorId` nos planItems (by design) |
| Imutabilidade | sempre `[...arr]` ou `{...obj}` — nunca mutação direta |
| Edição de estado | `setFoo(prev => [...prev, novo])` ou `setFoo([...arr])` |

---

## 7. Ferramenta de Desenvolvimento

**Edições grandes (> 30 linhas):** usar script Python com `str.replace()` direto no arquivo.
**Edições pequenas:** usar a ferramenta `Edit` do Claude.

```python
with open(path, "r", encoding="utf-8") as f: html = f.read()
assert OLD in html, "trecho não encontrado"
html = html.replace(OLD, NEW, 1)
with open(path, "w", encoding="utf-8") as f: f.write(html)
```

**Sync:** após cada alteração, copiar para Desktop:
```bash
cp "RelyOn360_Scheduler.html" "/mnt/Desktop/RelyOn360_Scheduler.html"
```

---

## 8. Decisões Pendentes / Dívida Técnica

| Item | Status | Nota |
|------|--------|------|
| Supabase migration | Planejado | substituir localStorage por banco real |
| Hash de senhas | Planejado | hoje passwords são plaintext |
| Build step (Vite/Next) | A avaliar | hoje Babel in-browser; com Supabase pode fazer sentido |
| Testes automatizados | Não iniciado | SDD exige spec antes de escrever testes |
| Split em múltiplos arquivos | A avaliar | hoje single-file facilita distribuição |
