# Refatoração `classId` + Fix chunks da tarde — HANDOFF

**Status:** ✅ **RESOLVIDO** em produção (2026-05-08). Matheus criou CBSP - 01 e confirmou que chunks Mon 13–14 + Thu 13–17 persistem após save+reload.
**Commit:** `16b89b5` no branch `claude/eager-einstein-86203e` (worktree)
**Main atual em produção:** `eb829a9` (UI dropdown fix only — sem o fix de classId/chunks)
**Push:** Matheus faz pelo GitHub Desktop
**Data:** 2026-05-07 (commit) · 2026-05-08 (revisão)
**Sessão:** Opus 4.7 com Matheus

---

## SESSÃO 2026-05-08 — VERIFICAÇÃO

Matheus reportou que o bug persistia. Investigação revelou:

1. **Fix nunca chegou em produção:** `main` está em `eb829a9`. Branch `claude/eager-einstein-86203e` com commit `16b89b5` está local mas não foi pushed/merged.
2. **Turma CBSP - 01 criada hoje (2026-05-08) com código antigo:**
   - 14 rows com `classId = NULL` (savePlan da produção não gera classId)
   - 2 chunks de continuação pós-almoço perdidos no DB:
     - TSP/P TEORIA (5h cadastrado) — Mon 13:00–14:00 sumiu
     - PSE/P TEORIA (6h cadastrado) — Thu 13:00–17:00 sumiu
   - Padrão: módulo split em manhã+tarde **no mesmo dia** perde a tarde. Split em dias diferentes (SPR/P 8h Tue PM + Wed AM, PCI/P 6h Wed PM + Thu AM) funciona.
3. **Limpeza aplicada:** `DELETE FROM relyon_schedules WHERE className='CBSP - 01' AND classId IS NULL` removeu as 14 linhas quebradas. DB agora com 0 linhas classId NULL.

### Próximo passo (Matheus)
1. **Push do branch `claude/eager-einstein-86203e`** via GitHub Desktop → merge em `main` → push.
2. Aguardar Vercel republicar.
3. **Hard-refresh** (Ctrl+Shift+R) no browser pra invalidar cache de JS.
4. Recriar CBSP - 01. Verificar se os 2 chunks de tarde aparecem (Mon 13–14 + Thu 13–17).

---

## SE A SESSÃO ANTERIOR FOI INTERROMPIDA — LEIA PRIMEIRO

1. **Não tem mais código pra escrever** (a menos que após deploy algum teste falhe). Tudo já está commitado em `16b89b5`. Migração Supabase também já está aplicada.
2. **Próximo passo:** confirmar push + deploy + testes (seção [TESTES](#testes-pra-matheus-rodar-no-browser) abaixo). Se algum falhar pós-deploy, ver seção [SE QUEBRAR](#se-quebrar---o-que-checar-primeiro).
3. **Não pergunte permissão pra mexer.** Matheus já autorizou tudo.
4. Cada novo fix em commit separado: `fix(schedule): <descrição>`. Co-author: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

---

## CONTEXTO RÁPIDO

Dois bugs encontrados juntos:

**H1 — Chunks da tarde sumiam ao reabrir turma:** Módulos de 8h (ex: NORMAM 223) eram split pelo wizard em manhã+tarde. O `loadClassForEdit` em [`js/schedule.js`](js/schedule.js) descartava silenciosamente o chunk da tarde (mesmo `module + date`, hora diferente), tratando como "continuação". Salvar a turma editada apagava a tarde do DB permanentemente.

**H_NEW — Turmas com mesmo nome eram fundidas:** O `loadClassForEdit` filtrava por `s.className === cls`. Duas turmas `MCIA - 01` em semanas diferentes apareciam como UMA turma de 26 módulos. Salvar essa "Frankenstein" apagava ambas do DB e re-inseria a fusão.

---

## SOLUÇÃO IMPLEMENTADA

### 1. Migração Supabase (já aplicada — projeto `snpvqqsmwrlazawjknme`)

```sql
ALTER TABLE relyon_schedules ADD COLUMN "classId" text;
CREATE INDEX idx_relyon_schedules_classid ON relyon_schedules ("classId");
-- + backfill: clusteriza rows pela "onda" do mesmo módulo retornando após 5+ dias
```

**Resultado:** 409 rows · 34 turmas distintas (CACI-01 / CBSP-01 / MCIA-01 cada uma com 2 turmas separadas — uma por semana).

Validação:
```sql
SELECT COUNT(*) FROM relyon_schedules WHERE "classId" IS NULL;  -- deve ser 0
SELECT "className", COUNT(DISTINCT "classId") FROM relyon_schedules
GROUP BY "className" HAVING COUNT(DISTINCT "classId") > 1;
-- CACI-01, CBSP-01, MCIA-01 devem aparecer com 2 turmas cada
```

### 2. Código

**`js/config.js`:**
- `newClassId()` — gera UUID (crypto.randomUUID com fallback)
- `_deleteSchedulesByClassId(classId)` — substitui `_deleteSchedulesByClassName`. Cirúrgico: deleta só rows daquele classId.

**`js/schedule.js`:**
- `savePlan` gera classId no início e replica em cada row.
- `saveEditItems` recupera classId do tab (ou fallback ao DB) e usa `_deleteSchedulesByClassId`.
- `loadClassForEdit(classId)` recebe classId em vez de className. Filtra rows por classId.
- **Mescla só por (module, date, startTime, endTime) idênticos** (multi-instrutor real). Chunks com hora diferente viram items separados em `editItems`. `_minutes` por item = duração do chunk.
- `deleteClass(classId)` recebe classId.
- `detectConflicts(rows, excludeClassId, linkedClassNames)` — exclude por classId. linkedClassNames continua semantic por nome (recurso de vínculo manual).
- `checkSlotConflict(date, ..., excludeClassId, linkedClassNames)` — mesmo padrão.
- List view, splitSidebar — agrupam por classId, exibem className.
- Tab state ganhou `editClassId`.

**`js/dashboard.js`:**
- `WeeklyCalendarView` e `GroupCalendarView` agrupam por classId, passam classId no `onClickClass`.

### 3. Comportamento esperado pós-fix

- Duas turmas com mesmo nome em semanas diferentes coexistem sem fusão.
- Apagar uma turma não afeta turmas distintas com mesmo nome.
- Módulo de 8h é salvo e reaberto preservando manhã + tarde.
- Editar e salvar (mesmo sem mudanças) não perde dados.

---

## TESTES PRA MATHEUS RODAR NO BROWSER

| # | Cenário | Esperado |
|---|---|---|
| 1 | Abrir app, ir em Programação → Lista | Turmas existentes carregam. CACI-01, MCIA-01, CBSP-01 aparecem **duas vezes cada** (uma turma por semana). |
| 2 | Console (F12) | Sem erros vermelhos relacionados a `classId`. |
| 3 | Criar nova turma com OBS322 (NORMAM 223 = 8h) | Wizard preview mostra `NORMAM 223` 08:00-12:00 E 13:00-17:00 na seg. |
| 4 | Aprovar → fechar aba → reabrir mesma turma pelo modo Lista | Manhã + tarde aparecem ambas. **Não pode sumir a tarde.** |
| 5 | Salvar alterações sem mudar nada → fechar → reabrir | Mesma turma íntegra. |
| 6 | Criar outra turma com mesmo nome em outra semana | Aparece como turma independente. |
| 7 | Deletar uma das duas com mesmo nome | A outra **permanece**. |
| 8 | Modo Semana → clicar numa turma | Carrega a turma da semana clicada (não a fundida com outra). |
| 9 | Modo Grupo → clicar numa turma | Idem #8. |

---

## SE QUEBRAR — O QUE CHECAR PRIMEIRO

### "Console mostra erro `classId is not defined`"
- Possível: alguma row do DB ainda sem classId. Rodar:
  ```sql
  SELECT COUNT(*) FROM relyon_schedules WHERE "classId" IS NULL;
  ```
- Se >0: re-aplicar backfill (ver bloco SQL na seção [Migração](#1-migração-supabase-já-aplicada--projeto-snpvqqsmwrlazawjknme)).

### "Turma some ao reabrir"
- Verificar console: o `loadClassForEdit` recebeu um classId válido? Pode ter alguma view ainda passando className.
- Grep `onClickClass` em `js/`. Tem que estar passando classId, não className.

### "Recalcular horários quebra"
- O `applyDaySchedule` re-temporiza ALL items começando de `items[0].date`. Com chunks como items separados, ele encadeia OK (chunk de 4h fits em meio período). Mas se houver um item com `_minutes` > 240 min, pode criar `_chunkOf` items que o save vai filtrar via `deChunkEdit`.
- Caso suspeito: testar Recalcular numa turma com 8h. Se perder dados, simplificar `saveEditItems` removendo `deChunkEdit` (cada item vira row, mesmo com `_chunkOf`).

### "Conflito não é detectado / é detectado falsamente"
- `detectConflicts` agora exclui por `classId`, não `className`. Se o caller ainda passa className, vira sempre conflito (excludeClassId não bate). Confirmar callers em `savePlan` (passa null — OK) e `saveEditItems` (passa classId — OK).

---

## FUNÇÕES-CHAVE — REFERÊNCIA RÁPIDA

`js/schedule.js`:
| Função | Linha aprox | Recebe |
|---|---|---|
| `recalcTimes` | 21 | items, startDate, startMins, dayEnd → array de chunks (uid herdado) |
| `applyDaySchedule` | 118 | items com `_minutes` → re-tempo sequencial desde items[0].date |
| `loadClassForEdit` | 153 | **classId** |
| `saveEditItems` | 298 | usa `editClassId` do tab |
| `detectConflicts` | 241 | (newRows, **excludeClassId**, linkedClassNames) |
| `checkSlotConflict` | 290 | (..., **excludeClassId**, linkedClassNames) |
| `initPlan` | 342 | wizard step 2 trigger |
| `savePlan` | 559 | gera `classId = newClassId()` |
| `deleteClass` | 606 | **classId** |

`js/config.js`:
| Função | Linha aprox |
|---|---|
| `newScheduleId` | 130 | bigint pra row.id |
| `newClassId` | 137 | UUID pra turma |
| `_deleteSchedulesByClassId` | 142 | DELETE cirúrgico por classId |

`js/dashboard.js`:
| Componente | Linha | onClickClass passa |
|---|---|---|
| `GroupCalendarView` | 299 | **classId** |
| `WeeklyCalendarView` | 449 | **classId** |

---

## DEFER — BUGS / MELHORIAS PRA PRÓXIMO CICLO

1. **Modo lista parece ter limite de exibição** (Matheus reportou: turmas novas não aparecem). Não diagnosticado nesta sessão.
2. **Modo semana não tem botão deletar turma.** UX gap.
3. **PoolBatchPage** (`js/poolbatch.js`) ainda usa `className` como identidade da coluna. Não causa perda de dados (savePlan já dá classIds únicos), mas turmas com mesmo nome aparecem fundidas nessa view específica. Refator análogo ao GroupCalendarView resolveria.
4. **`instructor.js`** linhas 26 e 320 fazem matching por `className` — usado pra agrupar slots do mesmo curso. Mesma situação: não perde dado, mas não desambigua duas turmas com mesmo nome.
5. **`reports.js`** linha 794 filtra por className. Aceitável (relatório usa nome como filtro user-facing).
6. **Wizard pode bloquear nome duplicado na mesma semana** (UX preventiva). Hoje permite — confiando no classId pra distinguir.
7. **LinkModal (`js/schedule.js:1255`)** continua linkando por className. Duas MCIA-01 não podem ser linkadas separadamente. Se virar requisito, migrar pra linkedClassIds.

---

## INPUTS HISTÓRICOS DO MATHEUS

### Round 1 — Sintoma
- "no preview eu vejo a turma sendo pré planejada pelo wizard perfeitamente. eu aprovo e simplesmente quando abro novamente está tudo zuado, faltando módulos da tarde, duplicados para outra semanas a frente."
- "já é a décima vez que peço para resolver um problema e ele persiste."

### Round 2 — Screenshots
- Wizard preview MCIA-02 mostrando `MCIA - NORMAM 223 - TEORIA 08:00-12:00` E `13:00-17:00` na seg 11/05 (chunks de 8h).
- Após salvo, NORMAM 223 só aparece manhã. Confirma H1.
- "tenho a impressão que sempre foi assim, mas só percebi quando o app entrou em produção."

### Round 3 — Descoberta H_NEW
- Screenshot de `MCIA - 01` carregada com `26 módulos · 10 dia(s)` (treinamento OBS322 só tem 13 módulos). Datas seg 04/05 e seg 11/05 ambas com NORMAM 223. Duas turmas fundidas pelo nome.

### Round 4 — Decisão
- "cada turma é única, cada registro de turma é único" → Opção 1 (classId UUID).
- "não se preocupe com os dados que tenho aqui... está em produção, mas a equipe sabe que os dados são para testes."
- "faça como deve ser, robusto e confiável."
- "permissão concedida para tudo... faça tudo até o final sem parar e pedir permissão."

---

## REGRAS QUE A PRÓXIMA SESSÃO PRECISA RESPEITAR

- **React:** hooks antes de qualquer return condicional. Estado imutável (`{...obj}`, `[...arr]`). Nunca definir componente dentro de componente.
- **Edição:** prefere Edit tool com `old_string` único. Para mudanças >20 linhas, `Write` ou múltiplas Edits.
- **Commits:** um por escopo, mensagem `fix(schedule): <descrição clara>`. Co-author Claude Opus 4.7.
- **Não dar `git push`** — Matheus faz pelo GitHub Desktop.
- **Não criar arquivos `.md` extras** — atualize ESTE doc.
- **CLAUDE.md está desatualizado:** diz que é single-file `index.html`. Na verdade é multi-file `js/*.js` carregados via `<script type="text/babel">`.
- **Não rodar testes em browser:** ambiente sem display direto. Matheus testa.
- **Migração Supabase:** sempre `apply_migration` (DDL), nunca `execute_sql` para mudanças de schema.

---

## ESTADO DO BANCO PÓS-MIGRAÇÃO

```
Project: snpvqqsmwrlazawjknme
Total rows: 409
Total classIds: 34
classNames duplicados (com >1 classId):
- CACI - 01 → 2 turmas, 34 rows
- CBSP - 01 → 2 turmas, 28 rows
- MCIA - 01 → 2 turmas, 45 rows
```

Schema final de `relyon_schedules`:
```
id              bigint      PK
classId         text        NEW (UUID, indexed)
trainingId      text
trainingName    text
className       text        (rótulo display, pode duplicar)
date            date
startTime       text
endTime         text
local           text
instructorId    integer
instructorName  text
module          text
role            text
studentCount    text
observation     text
status          text
issue           text
issueAt         text
issueBy         text
issueLog        jsonb
confirmedAt     text
confirmedBy     text
created_at      timestamptz
updated_at      timestamptz
```
