# EXECUÇÃO — Refatoração `classId` + fix chunks da tarde

**Status:** Em execução. Permissão total concedida pelo Matheus.
**Data:** 2026-05-07
**Branch:** `claude/eager-einstein-86203e` (worktree)
**Repositório:** https://github.com/relyon360mfrc/relyon360
**Supabase project_id:** `snpvqqsmwrlazawjknme`

---

## SE A SESSÃO ANTERIOR FOI INTERROMPIDA — LEIA AQUI

1. Verifique status na seção [STATUS DE EXECUÇÃO](#status-de-execução) abaixo. Continue da fase pendente.
2. **Não pergunte permissão.** Matheus já autorizou tudo: "permissão concedida para tudo, faça tudo até o final sem parar e pedir permissão".
3. Não tem como testar UI daqui — Matheus testa no browser depois. Faça os commits limpos por fase pra rollback ser cirúrgico.
4. Cada fase em commit separado: `fix(schedule): <descrição>`. Co-author: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

---

## STATUS DE EXECUÇÃO

- [x] Fase 0 — investigação concluída, decisão tomada
- [x] Fase 1 — Migração Supabase: `classId` adicionada + backfill consolidou em 34 turmas (de 31 classNames)
- [x] Fase 2 — Refatorar código pra usar `classId` em config.js / schedule.js / dashboard.js
- [x] Fase 3 — Fix chunks da tarde (loadClassForEdit não descarta mais; cada chunk = item separado)
- [x] Commit
- [ ] Matheus testa no browser (fluxo: criar turma 8h → salvar → reabrir → conferir; criar 2 turmas mesmo nome → cada uma independente)

---

## DECISÕES TOMADAS

1. **`classId` UUID** por turma (Opção 1). `className` vira só rótulo display.
2. **Sem preocupação com dados existentes** — turmas em produção são teste, equipe sabe.
3. **Bugs laterais** (limite de exibição na lista, falta de deletar no week view) — DEFER pra próximo ciclo. Não bloqueiam.

---

## CONTEXTO RESUMIDO

### Bugs identificados

**H1 — chunks da tarde sumindo:** [`loadClassForEdit`](js/schedule.js:153) descarta rows com mesmo `module + date` mas `startTime` diferente (continuação pós-almoço). Quando módulo de 8h é split em manhã+tarde, a tarde é apagada da UI. Se usuário re-salva, é apagada do DB (`_deleteSchedulesByClassName` no [`saveEditItems`](js/schedule.js:298)).

**H_NEW — turmas fundidas:** `className` não é único entre semanas. `MCIA-01` da semana 19 e `MCIA-01` da semana 20 são lidas como 1 turma fundida (26 módulos) porque `loadClassForEdit` filtra `s.className === cls`. Salvar a tela fundida apaga AMBAS do DB e reescreve a Frankenstein.

### Funções críticas (em `js/schedule.js`)

| Função | Linha | Alteração |
|---|---|---|
| `recalcTimes` | 21-51 | nenhuma |
| `applyDaySchedule` | 118-149 | nenhuma |
| `loadClassForEdit` | 153-183 | **F2 + F3:** receber `classId`, mesclar chunks |
| `recalcEdit` | 185-192 | nenhuma |
| `saveEditItems` | 298-336 | **F2 + F3:** usar `classId`, re-emitir chunks |
| `initPlan` | 342-472 | nenhuma |
| `savePlan` | 559-599 | **F2:** gerar `classId` e replicar |
| `deleteClass` | 606-621 | **F2:** usar `classId` |
| `getLinkedClassNames` | 230-234 | **F2:** lookup por `classId` |
| `detectConflicts` | 241-263 | **F2:** `excludeClassId` |
| List view (linha ~720+) | | **F2:** group by `classId` |

### Funções em outros arquivos

- `WeeklyCalendarView` e `GroupCalendarView` (em `js/dashboard.js` ou `components.js` — checar) — passam `cls` (className) via `onClickClass`. Precisam passar `classId`.
- `_deleteSchedulesByClassName` em [`js/config.js:135`](js/config.js:135) — adicionar variante `_deleteSchedulesByClassId`.
- `usePersisted` / `useSchedules` — sem mudança, schemas geral.

---

## FASE 1 — MIGRAÇÃO SUPABASE

**Como executar:** via MCP Supabase. Carregar tools com `ToolSearch query: "select:mcp__286a00c6-ac5e-4a12-b772-447c144b271c__apply_migration,mcp__286a00c6-ac5e-4a12-b772-447c144b271c__execute_sql,mcp__286a00c6-ac5e-4a12-b772-447c144b271c__list_tables"`.

**Project ID:** `snpvqqsmwrlazawjknme`

### SQL da migração

```sql
-- Step 1: adicionar coluna classId (text)
ALTER TABLE relyon_schedules ADD COLUMN IF NOT EXISTS "classId" text;

-- Step 2: backfill
-- Cluster rows por (className) com gap > 7 dias = nova turma
-- Cada cluster recebe um UUID
WITH ordered AS (
  SELECT id, "className", date::date AS d,
    LAG(date::date) OVER (PARTITION BY "className" ORDER BY date::date, id) AS prev_d
  FROM relyon_schedules
),
clustered AS (
  SELECT id, "className", d,
    SUM(CASE WHEN prev_d IS NULL OR d - prev_d > 7 THEN 1 ELSE 0 END)
      OVER (PARTITION BY "className" ORDER BY d, id) AS cluster_id
  FROM ordered
),
uuids AS (
  SELECT DISTINCT "className", cluster_id, gen_random_uuid()::text AS class_uuid
  FROM clustered
)
UPDATE relyon_schedules s
SET "classId" = u.class_uuid
FROM clustered c
JOIN uuids u ON c."className" = u."className" AND c.cluster_id = u.cluster_id
WHERE s.id = c.id AND s."classId" IS NULL;

-- Step 3: índice
CREATE INDEX IF NOT EXISTS idx_relyon_schedules_classid ON relyon_schedules ("classId");
```

**Validação após migração:**

```sql
-- Todas as rows devem ter classId
SELECT COUNT(*) FROM relyon_schedules WHERE "classId" IS NULL;
-- Deve ser 0

-- Quantas turmas únicas por className?
SELECT "className", COUNT(DISTINCT "classId") AS num_turmas, COUNT(*) AS num_rows
FROM relyon_schedules
GROUP BY "className"
ORDER BY num_turmas DESC;
-- MCIA - 01 deve aparecer com num_turmas >= 2
```

---

## FASE 2 — REFATORAR CÓDIGO

### 2.1 — `js/config.js`: `_deleteSchedulesByClassId`

Adicionar irmão de `_deleteSchedulesByClassName` (linha 135), que deleta por `classId` em vez de `className`. Manter o antigo por compat (caller em `deleteClass` vai migrar).

```js
const _deleteSchedulesByClassId = (classId) => {
  _persistQueue = _persistQueue
    .then(async () => {
      const { error } = await sb.from('relyon_schedules').delete().eq('classId', classId);
      if (error) throw new Error(error.message);
    })
    .catch(err => _emitSave({ ok: false, key: 'relyon_schedules', msg: err.message }));
  return _persistQueue;
};
window.__deleteSchedulesByClassId = _deleteSchedulesByClassId;
```

### 2.2 — `js/schedule.js`: `savePlan` (linha 559)

```js
const savePlan = () => {
  const err = validateSlots(planItems);
  if (err) { alert(err); return; }
  const canonical = planItems.filter((item, idx) => planItems.findIndex(p => p.uid === item.uid) === idx);
  const classId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `cls-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  const newRows = canonical.flatMap(item => {
    // ... existing logic
    return slots.map((slot, slotIdx) => {
      // ... existing fields
      return {
        id: newScheduleId(),
        classId,                      // ← NOVO
        trainingId: selTraining.id,
        // ... resto igual
      };
    });
  });
  // ... resto igual
};
```

### 2.3 — `js/schedule.js`: `saveEditItems` (linha 298)

Preservar o `classId` da turma sendo editada (vem de `editClassId` armazenado no tab) e usar `_deleteSchedulesByClassId` em vez de `_deleteSchedulesByClassName`.

```js
const saveEditItems = () => {
  const err = validateSlots(editItems);
  if (err) { alert(err); return; }
  const classId = editClassId || schedules.find(s => s.className === editCls)?.classId;
  if (!classId) { alert('classId da turma não encontrado'); return; }
  // ... build rows, INCLUIR classId em cada row
  const rows = deChunkEdit(editItems).flatMap(({ _minutes, mod, slots, _chunkOf, ...item }) => {
    // ...
    return itemSlots.map((slot, si) => ({
      ...item,
      classId,                       // ← NOVO
      id: newScheduleId(),
      // ...
    }));
  });
  // ... resto
  _deleteSchedulesByClassId(classId).then(() => {  // ← era ByClassName(editCls)
    setSchedules(prev => [...prev.filter(s => s.classId !== classId), ...rows]);
    closeActiveTab();
  });
};
```

### 2.4 — `js/schedule.js`: `loadClassForEdit` (linha 153)

Mudar assinatura: aceitar `classId` em vez de `className`.

```js
const loadClassForEdit = (classId) => {
  const existingTab = scheduleTabs.find(t => t.editClassId === classId);
  if (existingTab) { setActiveTabId(existingTab.id); return; }
  if (scheduleTabs.length >= 5) { alert(...); return; }
  const rows = schedules.filter(s => s.classId === classId)    // ← era s.className === cls
    .slice().sort(...);
  if (!rows.length) return;
  const className = rows[0].className;
  // ... resto igual, mas guardar editClassId também
  setScheduleTabs(prev => [...prev, {
    id, title: className, step: 3,
    wizForm: BLANK_WIZ, planItems: [],
    editCls: className,
    editClassId: classId,           // ← NOVO
    editStudentCount: rows[0]?.studentCount || "",
    editObservation: rows[0]?.observation || "",
    editItems: enriched
  }]);
  setActiveTabId(id);
};
```

Adicionar `editClassId: ""` em `BLANK_WIZ` related state e desestruturação na linha 98:

```js
const { wizForm=BLANK_WIZ, planItems=[], editCls=null, editClassId=null, editStudentCount="", editObservation="", editItems=[] } = activeTab || {};
```

### 2.5 — `js/schedule.js`: `deleteClass` (linha 606)

```js
const deleteClass = (classId) => {
  const cls = schedules.find(s => s.classId === classId)?.className;
  const archived = isArchivedClassId(classId);    // helper novo
  askDelete(() => {
    setScheduleTabs(prev => {
      const hadActive = prev.some(t => t.id === activeTabId && t.editClassId === classId);
      if (hadActive) setActiveTabId(null);
      return prev.filter(t => t.editClassId !== classId);
    });
    _deleteSchedulesByClassId(classId);
    setSchedules(prev => prev.filter(s => s.classId !== classId));
  }, archived);
};

const isArchivedClassId = (classId) => {
  const dates = schedules.filter(s => s.classId === classId).map(s => s.date);
  return dates.length > 0 && dates.every(d => d < todayStr);
};
```

### 2.6 — `js/schedule.js`: `getLinkedClassNames`, `detectConflicts`, list view

`getLinkedClassNames` mantém usando `className` (vínculo é semântico, não estrutural). Não muda.

`detectConflicts(newRows, excludeClassName, linkedClassNames)`: trocar para `excludeClassId`. Quem chama é `savePlan` (passa `null` — ok) e `saveEditItems` (passa `editCls` — trocar pra `editClassId`).

**List view** (linha ~624 e adiante): trocar
```js
const allClasses = [...new Set(schedules.map(s => s.className))];
```
por agrupamento por classId:
```js
const allClasses = [...new Map(schedules.map(s => [s.classId, s])).values()]
  .map(s => ({ classId: s.classId, className: s.className }));
```

E em todos os `cls => loadClassForEdit(cls)`, `deleteClass(cls)` etc., passar `classId` em vez de `className`.

### 2.7 — `WeeklyCalendarView` / `GroupCalendarView`

Buscar onde estão (provavelmente `js/dashboard.js` ou `js/components.js`). Trocar:
- agrupamento: `groupBy s.className` → `groupBy s.classId`
- callback: `onClickClass(className)` → `onClickClass(classId)`
- callers (linha 701, 715): repassam o classId

### 2.8 — Wizard: bloquear duplicado por nome NA MESMA SEMANA

Não é estritamente necessário (classId já evita confusão técnica), mas pode adicionar warning no `initPlan` se já existe `className` igual em rows próximas (gap < 7 dias). DEFER pra próximo ciclo.

---

## FASE 3 — FIX CHUNKS DA TARDE (H1)

### 3.1 — `loadClassForEdit`: mesclar chunks em vez de descartar

Trocar bloco linha 162-172 por:

```js
rows.forEach(r => {
  const existing = grouped.find(g => g.module === r.module && g.date === r.date);
  if (existing) {
    if (existing.startTime === r.startTime && existing.endTime === r.endTime) {
      // Multi-instrutor: mescla slots
      existing.slots = [...existing.slots,
        { instructorId: String(r.instructorId||""), local: r.local||"", ...(r.role === "Translator" ? { isTranslator: true } : {}) }];
    } else {
      // Continuação pós-almoço: registra chunk extra (não descarta)
      // O endTime do mestre passa a refletir o último chunk; _minutes acumulado será
      // recalculado no enriched abaixo via mod.minutes (autoritativo).
      existing._continuationChunks = existing._continuationChunks || [];
      existing._continuationChunks.push({
        startTime: r.startTime, endTime: r.endTime,
        instructorId: String(r.instructorId||""), local: r.local||""
      });
    }
  } else {
    grouped.push({ ...r, slots: [{ instructorId: String(r.instructorId||""), local: r.local||"" }] });
  }
});
```

`_continuationChunks` é só metadata pra ajudar o save reconstruir os chunks. O `_minutes` no `enriched` já tem `mod.minutes` (duração total) — autoritativo.

### 3.2 — `loadClassForEdit`: aplicar chunking visual

Após enriched, aplicar `applyDaySchedule` se defaultSchedule:

```js
const _editTrn = trainings.find(t => String(t.id) === String(trainingId));
const finalItems = _editTrn?.defaultSchedule === false ? enriched : applyDaySchedule(enriched);
// ...
editItems: finalItems
```

Isso garante que edit view mostra os chunks como o wizard mostra.

### 3.3 — `saveEditItems`: re-emitir chunks corretos

Antes de fazer flatMap, aplicar `applyDaySchedule`:

```js
const saveEditItems = () => {
  const err = validateSlots(editItems);
  if (err) { alert(err); return; }
  const classId = editClassId || schedules.find(s => s.className === editCls)?.classId;
  if (!classId) { alert('classId da turma não encontrado'); return; }
  const _editTrn = trainings.find(t => String(t.id) === String(deChunkEdit(editItems)[0]?.trainingId));
  const items = _editTrn?.defaultSchedule === false
    ? deChunkEdit(editItems)
    : applyDaySchedule(deChunkEdit(editItems));
  const rows = items.flatMap(({ _minutes, mod, slots, _chunkOf, _continuationChunks, ...item }) => {
    // ...
  });
  // ...
};
```

Cada item produzido por `applyDaySchedule` tem startTime/endTime do chunk. flatMap escreve uma row por chunk × slot. DB salva chunks corretamente.

### 3.4 — Importante: garantir que `mod` é preservado nos chunks

`applyDaySchedule` usa `...item` no spread (linha 138-141), o que preserva `mod`. Mas o `enriched` em `loadClassForEdit` precisa garantir que `mod` está populado mesmo se o lookup falhar (já tem fallback na linha 178). OK.

---

## CHECKLIST DE TESTE MANUAL (Matheus testa no browser)

Após cada fase, testar e reportar resultado.

### Pós-Fase 1 (migração)
- [ ] App carrega normal — turmas existentes aparecem na lista.
- [ ] Console não mostra erro relacionado a `classId`.
- [ ] (Opcional) Validar no Supabase que `MCIA - 01` agora tem 2 classIds distintos.

### Pós-Fase 2 (refatoração)
- [ ] Criar nova turma via wizard → salva → aparece na lista com nome correto.
- [ ] Abrir turma existente pelo modo Lista → carrega normal.
- [ ] Abrir turma existente pelo modo Semana (clicando no card) → carrega normal.
- [ ] Criar 2 turmas com mesmo nome em semanas diferentes → ambas aparecem distintas.
- [ ] Deletar uma turma → só ela é deletada, a outra com mesmo nome permanece.

### Pós-Fase 3 (chunks)
- [ ] Criar turma com módulo de 8h (NORMAM 223) → preview mostra manhã+tarde como hoje.
- [ ] Salvar → reabrir → manhã + tarde aparecem corretamente (não só manhã).
- [ ] Editar e salvar sem mudanças → módulos preservados, nada apagado.
- [ ] Recalcular horários → re-aplica chunks corretamente.

---

## REGRAS

- **React:** hooks antes de qualquer return condicional. Estado imutável (`{...obj}`, `[...arr]`).
- **Edits grandes (>20 linhas):** Edit tool com cuidado pra `old_string` único, ou Write se for criar.
- **Commits:** um por fase, mensagem `fix(schedule): <descrição clara>`. Co-author Claude Opus 4.7.
- **Não dar push** — Matheus faz pelo GitHub Desktop.
- **Não criar arquivos extras** além deste — sem CHANGELOG.md, sem TASKS.md, sem README.

---

## INPUTS RECEBIDOS DO USUÁRIO (HISTÓRICO)

### Round 1 — 3 screenshots

- Screenshot 1: Wizard step 1 funciona perfeito.
- Screenshot 2: Preview MCIA-02. Mostra `MCIA - NORMAM 223 - TEORIA 08:00-12:00` E `13:00-17:00` na seg 11/05 (chunks de 8h).
- Screenshot 3: Após salvo, NORMAM 223 só aparece manhã. **Confirma H1 visualmente.**
- Histórico: "tenho a impressão que sempre foi assim, mas só percebi quando o app entrou em produção." Bug é antigo.

### Round 2 — H_NEW descoberta

- Screenshot: `MCIA - 01` com `26 módulos · 10 dia(s)` (treinamento OBS322 só tem 13). Datas seg 04/05 e seg 11/05 ambos com NORMAM 223. **Duas turmas fundidas pelo `className`.**

### Round 3 — Decisões finais

- "cada turma é única, cada registro de turma é único" → Opção 1 (classId).
- "não se preocupe com os dados que tenho aqui... está em produção, mas a equipe sabe que os dados são para testes."
- "faça como deve ser, robusto e confiável."
- "permissão concedida para tudo... faça tudo até o final sem parar e pedir permissão."

### Bugs laterais reportados (DEFER)

- Modo lista parece ter limite de exibição (turmas novas não aparecem).
- Modo semana não tem opção de deletar turma.
