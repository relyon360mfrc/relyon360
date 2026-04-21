# EXECUTE — RelyOn 360 Scheduler
> Regras operacionais para o Claude trabalhar neste projeto de forma consistente.
> Leia este arquivo **antes** de qualquer alteração no código.
> Última revisão: 2026-04-16

---

## 1. Fluxo SDD obrigatório

Antes de implementar qualquer coisa:

```
SPEC → DESIGN → TASKS → EXECUTE
 ↓       ↓        ↓        ↓
O quê   Como    O que   Como fazer
```

1. **SPEC primeiro:** toda nova funcionalidade deve estar descrita na SPEC antes de ser codificada
2. **DESIGN se necessário:** decisões técnicas novas (nova estrutura de dados, novo padrão) devem ser registradas no DESIGN
3. **TASKS para rastrear:** abra o item em TASKS antes de começar, feche ao terminar
4. **EXECUTE para operar:** siga este arquivo para não quebrar o que já funciona

---

## 2. Localização dos arquivos

| Arquivo | Caminho |
|---------|---------|
| App principal | `RELYON 360 - scheduler\relyon360\index.html` |
| SPEC | `RELYON 360 - scheduler\SPEC.md` |
| DESIGN | `RELYON 360 - scheduler\DESIGN.md` |
| TASKS | `RELYON 360 - scheduler\TASKS.md` |
| EXECUTE | `RELYON 360 - scheduler\EXECUTE.md` |
| CLAUDE.md (instruções) | `CLAUDE.md` (raiz) |
| Briefing legado | `BRIEFING_RELYON360.md` (raiz) |

Raiz do repo: `C:\Users\mcarvalho\OneDrive - RelyOn\RelyOn 360 Scheduler\`

URL de produção: https://relyon360.vercel.app
Repositório: https://github.com/relyon360mfrc/relyon360

---

## 3. Regras de edição de código

### 3.1 Edições pequenas (1–5 linhas)
Usar a ferramenta `Edit` do Claude com indentação exata.

### 3.2 Edições grandes (> ~20 linhas ou blocos de JSX)
Preferir **script Python** via Bash — a ferramenta `Edit` pode falhar em blocos grandes de HTML/JSX.

```python
path = r"C:\Users\mcarvalho\OneDrive - RelyOn\RelyOn 360 Scheduler\RELYON 360 - scheduler\relyon360\index.html"
with open(path, "r", encoding="utf-8") as f:
    html = f.read()

assert OLD in html, "trecho não encontrado — verifique indentação exata"
html = html.replace(OLD, NEW, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(html)
```

**Nunca pular o `assert`.** Se o trecho não for encontrado, **pare e investigue** — jamais escreva por cima do arquivo inteiro como workaround.

> **Atenção — ambiente Windows:** heredocs bash com conteúdo JSX (aspas, acentos, chaves) falham. Sempre escrever o script Python em um arquivo separado com a ferramenta `Write` em `C:\Users\mcarvalho\` (ex: `fix_algo.py`) e executá-lo via `python fix_algo.py`. O diretório `/tmp` não existe neste ambiente.

### 3.3 Deploy
O deploy é manual, feito pelo usuário:
1. GitHub Desktop → Commit → Push
2. Vercel republica automaticamente

Claude **não** executa `git push` nem interage com Vercel. Ao terminar uma alteração, apenas reportar o que foi feito.

### 3.4 Nunca fazer "deploy" / `present_files` ao final de tarefas
Apenas salvar o arquivo e notificar o usuário com texto.

---

## 4. Antes de alterar qualquer componente React

Verificar as regras críticas do DESIGN:

### 4.1 Rules of Hooks
- **Todos os hooks antes de qualquer `return` condicional**
- Se um componente tem `if (detail) return (...)`, todos os `useState`/`useEffect`/`useRef` devem aparecer ANTES dessa linha

### 4.2 Estabilidade de componentes
- **Nunca definir um componente dentro de outro componente**
- Se precisar de um sub-componente, defini-lo no topo do arquivo, antes do componente pai
- Exemplo no projeto: `InstructorScheduleCard` é definido **fora** de `InstructorDashboard`

### 4.3 Imutabilidade de estado
- Nunca mutar arrays ou objetos diretamente
- Sempre usar `[...arr]`, `{...obj}`, `arr.map(...)`, `arr.filter(...)` para derivar novo estado

---

## 5. Antes de alterar funções de agendamento

Funções críticas que afetam toda a grade — verificar o comportamento esperado na DESIGN antes de mexer:

| Função | Risco | O que verificar |
|--------|-------|-----------------|
| `recalcTimes` | Alto | módulos começam às 08:00; quebra entre dias funciona; almoço é pulado corretamente |
| `initPlan` | Alto | score de instrutor; committedInstrs; preferredLocals; slots |
| `sortModules` | Médio | CBINC → TEORIA antes de PRÁTICA; PROVA → TEMPO RESERVA ao fim |
| `getLocalOpts` | Médio | filtro por `env` e (se CBINC) subtype |
| `isInstructorAbsent` | Médio | full-day categories + sobreposição de horário |
| `savePlan` | Alto | usar `flatMap` nos `slots` — não `map` |
| `applyDaySchedule` | Médio | mesma lógica de almoço que `recalcTimes` |

---

## 6. Estrutura de dados de planItems

Após `initPlan`, os items têm esta estrutura — **não quebrar**:

```js
{
  uid: "pi-0-101",          // string única: `pi-${idx}-${mod.id}`
  mod: { ... },             // referência ao módulo
  date: "YYYY-MM-DD",
  startTime: "HH:MM",
  endTime: "HH:MM",
  slots: [                  // array — sempre presente
    { instructorId: "5", local: "SALA 09" },
    { instructorId: "7", local: "SALA 09" }  // mesmo local quando instructorCount = 2
  ]
}
```

`savePlan` usa `item.slots || [{ instructorId: item.instructorId || "", local: item.local || "" }]` como fallback para compatibilidade com dados antigos.

---

## 7. Checklist antes de entregar uma tarefa

```
[ ] A SPEC cobre o comportamento implementado?
[ ] O DESIGN foi atualizado se houver nova decisão técnica?
[ ] O item em TASKS foi movido para ✅ Concluído?
[ ] O arquivo foi salvo (não apenas editado na memória)?
[ ] Nenhum hook está depois de um `return` condicional?
[ ] Nenhum componente foi definido dentro de outro?
[ ] `savePlan` ainda usa `flatMap` com `slots`?
[ ] `recalcTimes` ainda não pula almoço antecipadamente?
[ ] Scripts Python foram escritos em C:\Users\mcarvalho\ (não em /tmp)?
[ ] Se gerando PNGs de ícone: Pillow instalado? (`pip install Pillow`)
```

---

## 8. Reset do app para testes

No console do navegador com o app aberto:
```js
window.__resetRelyOn360()
```
Apaga todas as chaves em `app_state` no Supabase e recarrega com os dados iniciais do arquivo.

> **Cuidado:** isso afeta **todo mundo** que esteja usando o app (é um banco compartilhado), não só sua sessão local. Use com parcimônia em produção.

---

## 8b. Geração de Ícones PWA

Para atualizar os ícones do app (icon-192.png, icon-512.png, apple-touch-icon.png):

1. Instalar Pillow: `pip install Pillow`
2. Usar `gen_icons.py` em `C:\Users\mcarvalho\` como referência (contém o design completo)
3. Os PNGs gerados vão para `relyon360/` (mesma pasta do index.html)
4. Atualizar `manifest.json` se mudar os nomes dos arquivos
5. Commitar todos os arquivos novos junto com `icon.svg` e `manifest.json`

> Após trocar ícones, o usuário precisa **desinstalar e reinstalar o PWA** no dispositivo — o SO não atualiza ícones instalados automaticamente.

---

## 9. Padrões de nomenclatura

| Elemento | Padrão | Exemplo |
|----------|--------|---------|
| Componente React | PascalCase | `InstructorsPage`, `DeleteGuardModal` |
| Hook customizado | camelCase com `use` | `usePersisted`, `useIsMobile` |
| Função utilitária | camelCase | `recalcTimes`, `minsToTime` |
| Constante global | UPPER_SNAKE | `INITIAL_TRAININGS`, `PERMISSIONS_LIST` |
| Chave no Supabase (`app_state`) | snake_case com prefixo | `relyon_schedules`, `relyon_users` |
| uid de planItem | template literal | `` `pi-${idx}-${mod.id}` `` |
| Roles | palavras inteiras em minúsculo | `developer`, `admin`, `planejador`, `customer_service`, `instructor` |

---

## 10. Comunicação com o usuário (Matheus)

- Reportar o que foi feito em linguagem simples (não técnica primeiro, técnica depois se necessário)
- Matheus está aprendendo — detalhar os passos quando o pedido exigir execução dele (ex: como testar, onde olhar)
- Não pedir confirmação para tarefas pequenas e óbvias dentro do escopo já definido
- Sugerir melhorias relacionadas ao item da TASKS quando relevante
- Nunca perguntar "posso continuar?" após finalizar — apenas finalizar e reportar
- Antes de ações destrutivas ou que afetem todos os usuários (ex: `__resetRelyOn360`), sempre confirmar
