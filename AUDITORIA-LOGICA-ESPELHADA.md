# Auditoria de Lógica Espelhada — RelyOn 360 Scheduler

Data: 2026-07-07
Escopo: auditoria de leitura (nenhum código foi alterado). Objetivo: para cada regra de
negócio implementada em 2+ lugares do código, comparar se as implementações fazem
exatamente a mesma coisa.

---

## 1. "Ausência de dia inteiro" (`computeCoverage` / `isFullDayAbsence`)

**Onde vive:**
- `js/core.cjs:128-137` — **fonte única** de `FULL_DAY_CATEGORIES` (7 categorias, incluindo
  `"Folga Banco de Horas"`) e `isFullDayAbsence(category)`.
- `js/core.cjs:170-182` — `isInstructorAbsent(...)`, usa `isFullDayAbsence(a.category) && !a.startTime`
  (linha 177).
- `js/constants.js:321-404` — `computeCoverage(instr, date, schedules, activities, absences, holidays)`,
  usa a mesma condição em `constants.js:352`: `isFullDayAbsence(a.category) && !a.startTime`.
- `js/dashboard.js:290` — mesma condição, mesma função global `isFullDayAbsence`.
- `js/reports.js:3578` — mesma condição, com fallback defensivo `(typeof isFullDayAbsence==="function" ? isFullDayAbsence(a.category) : true)`.
- Consumidores de `computeCoverage`: `js/coverage.js:157`, `js/dashboard.js:423`,
  `js/reports.js:199,831,2489` — todos chamam a **mesma** função global (não há cópia local
  com o mesmo nome em nenhum desses módulos).

**Veredito: OK, nenhuma ação necessária.**
Existe hoje uma única fonte real (`core.cjs`) para `FULL_DAY_CATEGORIES`/`isFullDayAbsence`,
e uma única função `computeCoverage` (constants.js) consumida por referência (não copiada)
em coverage.js/dashboard.js/reports.js. O comentário em `core.cjs:113-123` documenta que isso
foi consolidado depois de um incidente real (2026-06-12) em que `FULL_DAY_CATEGORIES` e
`isHoliday` **já haviam divergido em silêncio** entre config.js/constants.js e um espelho em
logic.js — a lição já foi aplicada aqui. O antigo bug histórico de `||` vs `&&` não foi
encontrado nas implementações atuais (todas usam `&&` de forma consistente); provavelmente
foi corrigido na mesma consolidação.

**Atenção correlata (achado na regra 3):** a MESMA lista `FULL_DAY_CATEGORIES` está
duplicada — e desatualizada — no MCP (`agents/mcp/src/planner.ts` e `agents/mcp/src/constants.ts`).
Ver regra 3 abaixo; o problema não está no app, está no espelho do agente.

---

## 2. Regra de bônus CLT (elegibilidade por tipo de atividade)

**Onde vive:**
- `js/constants.js:55-68` — fonte única: `BONUS_ELIGIBLE_ACTIVITY_TYPES` (todas as chaves de
  `ACTIVITY_TYPES` exceto `"free"`, `"embarque"`, `"holiday_work"`) e
  `isBonusEligibleActivity(a)`.
- `js/reports.js:238` (aba "Meu Histórico" do instrutor) — `myActivities.filter(a => isBonusEligibleActivity(a))`.
- `js/reports.js:3258` (aba "Financeiro → Bônus", visão do admin/planejador) —
  `(activities||[]).filter(... && isBonusEligibleActivity(a))`.
- Ambos os blocos em reports.js aplicam depois a **mesma** regra de qualificação de dia:
  `endsLate (endTime > 17h) || isHoliday(...) || isWeekend (dow 0 ou 6)` — comparar
  `reports.js:242-246` (Meu Histórico) com `reports.js:3267-3272` (Financeiro). As duas
  condições são idênticas termo a termo.
- `js/coverage.js` — **não** tem lógica própria de elegibilidade de bônus (a busca por
  `bonus|Bonus|Bônus` não retornou nenhuma ocorrência no arquivo).

**Veredito: OK, nenhuma ação necessária.**
Existe uma única função de elegibilidade (`isBonusEligibleActivity`, constants.js) chamada
por referência nos dois pontos de reports.js, e a regra complementar de "dia qualifica"
(noturno/feriado/fim de semana) foi reescrita duas vezes em reports.js mas de forma
idêntica, com comentários explícitos ("MESMA regra do relatório Financeiro → Bônus")
amarrando as duas cópias. Como é duplicação de uma expressão booleana simples (não uma
função chamada por nome), não há necessariamente risco de desvio silencioso hoje, mas é
candidato a extrair um helper único (`computeBonusQualifyingDays(...)`) se for tocado de
novo — reduziria a chance de as duas cópias divergirem em uma futura edição apressada.

---

## 3. `recalcTimes` / `applyDaySchedule` (grade horária/almoço) — DIVERGÊNCIA ENCONTRADA

**Onde vive:**
- `js/config.js:1750-1779` — `recalcTimes` (runtime real, usado por Schedule/ai.js).
- `js/config.js:1783-1813` — `applyDaySchedule` (variante de edição, ancora no `startTime`
  do primeiro item).
- `js/logic.js:35-66` — espelho de teste de `recalcTimes` (vitest). **Comparado linha a
  linha com config.js: logicamente idêntico** (mesma sequência de checagem de almoço,
  mesmo cálculo de `periodEnd`/`available`/`chunk`, mesmo avanço de dia). Não há
  divergência entre config.js e logic.js.
- `agents/mcp/src/planner.ts:139-170` — porta de `recalcTimes` para o agente MCP.
  **Comparado com config.js/logic.js: lógica de horário/almoço idêntica.**

**Onde a divergência REAL está — não em `recalcTimes`, mas em `FULL_DAY_CATEGORIES`, que
vive no mesmo bloco de "primitivas de planejamento" espelhadas para o MCP:**

- `js/core.cjs:128-136` (fonte única real, usada por `isInstructorAbsent`/`computeCoverage`
  no app em produção) tem **7 categorias**:
  ```
  "Atestado Médico", "Férias", "Folga Abonada", "Folga Banco de Horas",
  "Embarque", "Licença Paternidade/Maternidade", "Suspensão Disciplinar"
  ```
- `agents/mcp/src/planner.ts:233` tem **6 categorias** — falta `"Folga Banco de Horas"`:
  ```ts
  export const FULL_DAY_CATEGORIES = ['Atestado Médico', 'Férias', 'Folga Abonada', 'Embarque',
    'Licença Paternidade/Maternidade', 'Suspensão Disciplinar'];
  ```
- `agents/mcp/src/constants.ts:63-70` tem a **mesma lista incompleta** (6 categorias, sem
  "Folga Banco de Horas"), com o comentário `// espelho de FULL_DAY_CATEGORIES em js/constants.js`
  — mas `js/constants.js` não define mais essa lista há tempos (ela foi movida para
  `core.cjs` no incidente de 2026-06-12); o comentário aponta para uma fonte que não existe
  mais no arquivo citado.
- **O teste de paridade "trava" o bug como comportamento esperado**:
  `tests/parity-planner.test.js:98-104` (describe "GOLDEN FULL_DAY_CATEGORIES — lista exata
  de produção") afirma explicitamente:
  ```js
  it('G08 — port expõe exatamente as 6 categorias de produção (com Folga Abonada + Embarque)', () => {
    expect(Planner.FULL_DAY_CATEGORIES).toEqual([
      'Atestado Médico', 'Férias', 'Folga Abonada', 'Embarque',
      'Licença Paternidade/Maternidade', 'Suspensão Disciplinar',
    ]);
  });
  ```
  Isso significa que o teste de paridade não vai detectar a divergência — ele foi escrito
  contra a lista desatualizada e passa mesmo com o bug presente.

**Impacto prático:** um instrutor com uma ausência de dia inteiro na categoria "Folga Banco
de Horas" (sem `startTime`, i.e. o dia inteiro) é corretamente tratado como ausente no app
real (`core.cjs` via `isInstructorAbsent`/`computeCoverage`), mas o agente MCP
(`rl360_criar_turma`, via `planTurma` em `planner.ts`) **não o reconhece como ausente** nesse
cenário e pode escalá-lo para uma turma no mesmo dia — uma dupla-marcação silenciosa gerada
pelo próprio agente.

**Recomendação:** corrigir `FULL_DAY_CATEGORIES` em `agents/mcp/src/planner.ts:233` e em
`agents/mcp/src/constants.ts:63-70` para incluir `"Folga Banco de Horas"` (igualando a
`core.cjs:128-136`), e atualizar o teste golden `tests/parity-planner.test.js:98-104` para
esperar as 7 categorias reais — hoje o teste teria impedido exatamente essa correção
("trava" a lista errada). Idealmente, o ideal de longo prazo seria o MCP importar
`FULL_DAY_CATEGORIES` de `core.cjs` diretamente (é `.cjs`, importável por um build Node/TS),
eliminando a terceira cópia manual.

---

## 4. Detector de conflito de instrutor (dupla escala no mesmo horário)

**Onde vive:**
- `js/core.cjs:206-224` — `checkSlotConflictG(schedules, date, startTime, endTime,
  instructorId, local, excludeClassName, linkedClassNames)`. Exclui por **nome de turma**
  (`className`) via `ignoreNames`. Overlap: `nS < eE && eS < nE`.
- `js/schedule.js:526-545` — uma **segunda implementação**, `checkSlotConflict` (local ao
  componente, não chama `checkSlotConflictG`). Mesma condição de overlap
  (`nS < eE && eS < nE`) e mesmos testes de instrutor/local, mas exclui por
  **`classId`** (`excludeKey`, linha 532) em vez de nome — e trata `linkedClassNames` com a
  mesma semântica (ignora turmas vinculadas por nome). É chamada extensivamente em
  schedule.js (linhas 294, 305, 389, 805, 826, 862, 885, 1532, 1603, 1616, 1617, 1684, 2167,
  2177, 2256, 2257, 2335).
- `js/dashboard.js:1333-1355` (dentro de `GroupCalendarView`) — uma **terceira
  implementação inline**, sem chamar nenhuma das duas funções acima. Mesma condição de
  overlap (`aS < bE && bS < aE`), mesmo par instrutor/local, exclusão por `classId` (linha
  1340) e vínculo bidirecional por nome (linha 1342-1344, checa os dois sentidos do array
  `linkedClassNames`).
- `agents/mcp/src/planner.ts:255-272` — `checkSlotConflict` (porta para o agente). Mesma
  condição de overlap, exclusão por `Set<string>` de nomes passado pelo caller
  (`ignoreNames`), equivalente a `checkSlotConflictG`.

**Comparação lógica:** as quatro implementações concordam no núcleo (mesma fórmula de
overlap de intervalo, mesmo par instrutor+local, tratamento de turmas vinculadas por
nome). A única diferença sistemática é o **critério de exclusão da própria turma**:
`core.cjs`/`planner.ts` excluem por `className`, enquanto `schedule.js`/`dashboard.js`
excluem por `classId`. Excluir por `classId` é estritamente mais correto (nomes de turma
podem colidir entre turmas diferentes — cenário aliás mencionado em vários memos do
projeto sobre `className` vs `classId`), então não há bug — mas a função "fonte única" do
core.cjs está, na prática, **desatualizada em relação ao critério que schedule.js já usa**.

**Veredito: divergência de implementação, não de comportamento observável no fluxo atual**
(schedule.js e dashboard.js não usam `checkSlotConflictG`, então o critério mais fraco do
core.cjs nunca é exercitado nesses fluxos — só é usado onde for chamado diretamente, e a
busca não encontrou chamadas de `checkSlotConflictG` fora de core.cjs/testes). Ainda assim,
são **3 cópias de lógica idêntica** mantidas manualmente em paralelo (core.cjs, schedule.js,
dashboard.js) mais uma quarta no MCP (planner.ts).

**Recomendação:** consolidar `schedule.js:526` e a detecção inline de `dashboard.js:1333`
para chamarem `checkSlotConflictG` de `core.cjs`, migrando a assinatura da função fonte de
`excludeClassName` para `excludeClassId` (o critério mais correto, já usado pelos dois
consumidores). Isso reduz de 3 implementações de app + 1 do MCP para 1 implementação de app
(chamada por 2 módulos) + 1 porta MCP com teste de paridade — mais fácil de manter em sync.
Nenhuma ação urgente: não há evidência de comportamento divergente hoje, é risco latente de
manutenção.

---

## Resumo executivo

| Regra | Status | Ação recomendada |
|---|---|---|
| 1. Ausência dia inteiro / computeCoverage | OK | Nenhuma |
| 2. Elegibilidade de bônus CLT | OK (duplicação idêntica documentada) | Opcional: extrair helper único de "dia qualifica" |
| 3. recalcTimes/applyDaySchedule | **DIVERGÊNCIA REAL** — `FULL_DAY_CATEGORIES` no MCP (planner.ts + constants.ts) falta "Folga Banco de Horas"; teste golden trava o bug | Corrigir as 2 listas no MCP + atualizar teste `parity-planner.test.js:98-104` |
| 4. Detector de conflito de instrutor | Lógica equivalente, critério de exclusão diverge (className vs classId) entre 4 cópias | Consolidar schedule.js/dashboard.js para chamar core.cjs, migrando para exclusão por classId |
