# EXECUTE — RelyOn 360 Scheduler
> Regras operacionais para o Claude trabalhar neste projeto de forma consistente.
> Leia este arquivo **antes** de qualquer alteração no código.

---

## 1. Fluxo SDD obrigatório

Antes de implementar qualquer coisa:

```
SPEC → DESIGN → TASKS → EXECUTE
 ↓        ↓        ↓        ↓
O quê   Como    O que    Como fazer
```

1. **SPEC primeiro:** toda nova funcionalidade deve estar descrita na SPEC antes de ser codificada
2. **DESIGN se necessário:** decisões técnicas novas (nova estrutura de dados, novo padrão) devem ser registradas no DESIGN
3. **TASKS para rastrear:** abra o item em TASKS antes de começar, feche ao terminar
4. **EXECUTE para operar:** siga este arquivo para não quebrar o que já funciona

---

## 2. Localização dos arquivos

| Arquivo | Caminho |
|---------|---------|
| App principal | `/sessions/busy-bold-fermat/mnt/RelyOn 360 Scheduler/RelyOn360_Scheduler.html` |
| Cópia Desktop | `/sessions/busy-bold-fermat/mnt/Desktop/RelyOn360_Scheduler.html` |
| Documentação SDD | `/sessions/busy-bold-fermat/mnt/Desktop/RELYON 360 - scheduler/` |
| Briefing legado | `/sessions/busy-bold-fermat/mnt/RelyOn 360 Scheduler/BRIEFING_RELYON360.md` |

---

## 3. Regras de edição de código

### 3.1 Edições grandes (> ~20 linhas ou blocos de JSX)
**Sempre usar script Python.** A ferramenta `Edit` falha em blocos grandes de HTML/JSX.

```python
path = "/sessions/busy-bold-fermat/mnt/RelyOn 360 Scheduler/RelyOn360_Scheduler.html"
with open(path, "r", encoding="utf-8") as f:
    html = f.read()

assert OLD in html, "trecho não encontrado — verifique indentação exata"
html = html.replace(OLD, NEW, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(html)
```

**Nunca pular o `assert`.** Se o trecho não for encontrado, pare e investigue — não escreva por cima do arquivo inteiro.

### 3.2 Edições pequenas (1–5 linhas, simples)
Pode usar a ferramenta `Edit`, tomando cuidado com indentação exata.

### 3.3 Sync obrigatório após qualquer edição
```bash
cp "/sessions/busy-bold-fermat/mnt/RelyOn 360 Scheduler/RelyOn360_Scheduler.html" \
   "/sessions/busy-bold-fermat/mnt/Desktop/RelyOn360_Scheduler.html"
```

### 3.4 Nunca usar `present_files` / "deploy" ao final de tarefas
Apenas salvar o arquivo e notificar o usuário com texto. O arquivo já está no destino correto.

---

## 4. Antes de alterar qualquer componente React

Verificar as regras críticas do DESIGN:

### 4.1 Rules of Hooks
- **Todos os hooks antes de qualquer `return` condicional**
- Se um componente tem `if (detail) return (...)`, todos os `useState`/`useEffect`/`useRef` devem aparecer ANTES dessa linha

### 4.2 Estabilidade de componentes
- **Nunca definir um componente dentro de outro componente**
- Se precisar de um sub-componente, defini-lo no topo do arquivo, antes do componente pai

### 4.3 Imutabilidade de estado
- Nunca mutar arrays ou objetos diretamente
- Sempre usar `[...arr]`, `{...obj}`, `arr.map(...)`, `arr.filter(...)` para derivar novo estado

---

## 5. Antes de alterar funções de agendamento

Funções críticas que afetam toda a grade:

| Função | Risco | O que verificar |
|--------|-------|-----------------|
| `recalcTimes` | Alto | módulos começam às 08:00; almoço adiciona 60 min ao wall-clock |
| `initPlan` | Alto | score de instrutor; committedInstrs; preferredLocals; slots |
| `sortModules` | Médio | CBINC → TEORIA antes de PRÁTICA; PROVA → TEMPO RESERVA ao fim |
| `getLocalOpts` | Médio | filtro por `env` e `subtype` |
| `isInstructorAbsent` | Médio | FULL_DAY_CATEGORIES + sobreposição de horário |
| `savePlan` | Alto | usar `flatMap` nos `slots` — não `map` |
| `applyDaySchedule` | Médio | mesma lógica de almoço que `recalcTimes` |

---

## 6. Estrutura de dados de planItems

Após `initPlan`, os items têm esta estrutura — **não quebrar**:

```js
{
  uid: "pi-0-101",          // string única
  mod: { ... },             // referência ao módulo
  date: "YYYY-MM-DD",
  startTime: "HH:MM",
  endTime: "HH:MM",
  slots: [                  // array — sempre presente
    { instructorId: "5", local: "SALA 09" },
    { instructorId: "7", local: "CBINC 01" }  // quando instructorCount = 2
  ]
}
```

`savePlan` usa `item.slots || [{ instructorId: item.instructorId||"", local: item.local||"" }]` como fallback para compatibilidade com dados antigos.

---

## 7. Checklist antes de entregar uma tarefa

```
[ ] A SPEC cobre o comportamento implementado?
[ ] O DESIGN foi atualizado se houver nova decisão técnica?
[ ] O item em TASKS foi movido para ✅ Concluído?
[ ] O arquivo foi salvo (não apenas editado na memória)?
[ ] O sync para Desktop foi feito?
[ ] Nenhum hook está depois de um `return` condicional?
[ ] Nenhum componente foi definido dentro de outro?
[ ] `savePlan` ainda usa `flatMap` com `slots`?
[ ] `recalcTimes` ainda não pula almoço antecipadamente?
```

---

## 8. Reset do app para testes

No console do navegador com o app aberto:
```js
window.__resetRelyOn360()
```
Apaga todo o localStorage e recarrega com dados iniciais.

---

## 9. Padrões de nomenclatura

| Elemento | Padrão | Exemplo |
|----------|--------|---------|
| Componente React | PascalCase | `InstructorsPage`, `DeleteGuardModal` |
| Hook customizado | camelCase com `use` | `usePersisted` |
| Função utilitária | camelCase | `recalcTimes`, `minsToTime` |
| Constante global | UPPER_SNAKE | `INITIAL_TRAININGS`, `FULL_DAY_CATEGORIES` |
| Chave localStorage | snake_case com prefixo | `relyon_schedules` |
| uid de planItem | template literal | `` `pi-${idx}-${mod.id}` `` |

---

## 10. Comunicação com o usuário (Matheus)

- Reportar o que foi feito em linguagem simples (não técnica primeiro, técnica depois se necessário)
- Não pedir confirmação para tarefas pequenas e óbvias dentro do escopo já definido
- Sugerir melhorias relacionadas ao item da TASKS quando relevante
- Nunca perguntar "posso continuar?" após finalizar — apenas finalizar e reportar
