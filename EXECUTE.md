# EXECUTE — RelyOn 360 Scheduler
> Regras operacionais para o Claude trabalhar neste projeto de forma consistente.
> Leia este arquivo **antes** de qualquer alteração no código.
> Última revisão: 2026-07-01 (regra 3.2 corrigida — script Python abandonado, `Edit` direto funciona bem em Windows; nova §11 — cowork e escrita direta no Supabase)

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

### 3.2 Edições grandes (> ~20 linhas ou blocos de JSX) — **atualizado 2026-07-01**
**Não usar mais script Python.** Isso era resquício de um sandbox Linux antigo (ver CLAUDE.md). Ambiente atual é Windows/PowerShell — a ferramenta `Edit` funciona bem mesmo em blocos grandes, desde que se ancore num trecho **único** do arquivo (uma string exata que não se repete). Arquivos grandes do projeto (`reports.js` 199KB, `schedule.js` 149KB) editam normalmente assim — não é preciso reescrever o arquivo inteiro.

Se um trecho não for único, amplie o contexto do `old_string` até virar único — nunca escreva por cima do arquivo inteiro como workaround.

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

### 4.4 Identidade do `user` logado
- **Instrutor logado:** `user = { ...instr, role: "instructor", avatar }` — `user.id` é o id do instrutor. **NÃO existe `user.instructorId`** (campo herdado de tentativas antigas). Sempre use `user.id` para filtrar/salvar referências ao instrutor logado.
- **Usuário-sistema (developer/admin/planejador/customer_service):** `user = {...record from relyon_users}`. Vínculo opcional com instrutor via `user.linkedInstructorId` (usado no "Meu Histórico" de Admin visualizando como Instrutor).
- **Gates de role:** preferir os helpers de `constants.js` — `canAdmin(user)` (developer | admin) e `canPlan(user)` (developer | admin | planejador). Não checar `user.role === "admin"` direto — sempre exclui o developer.

Pegado em 2026-05-22: a feature de Comunicação salvava `instructorId: "undefined"` para todas as requisições porque lia `user.instructorId` (inexistente). Ver DESIGN §21.1.

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

## 5b. Leituras do Supabase — sempre passar por `_stripScheduleRow`

Qualquer `sb.from('relyon_schedules').select(...)` que materialize dados pra React state ou localStorage **precisa stripar antes**. A tabela tem colunas (`created_at`, `updated_at`) fora do whitelist `_SCHEDULE_COLUMNS` — sem strip, elas vazam pro LS e o `_readLocalSchedules` fica detectando e "limpando" toda boot (warning crônico). Ver DESIGN §25.

**Padrão correto:**
```js
const { data } = await sb.from('relyon_schedules').select('*');
const clean = data.map(_stripScheduleRow);  // ← obrigatório
// ...usa `clean` daqui pra frente
```

**Aplicar também em payloads de Realtime:**
```js
.on('postgres_changes', { ... }, ({ new: nw }) => {
  const nwClean = nw ? _stripScheduleRow(nw) : nw;
  // ...usa nwClean, NÃO nw
})
```

**Quando NÃO precisa stripar:** quando só lê metadados (`.select('id')`, `count`, etc.) ou quando o dado nunca vira state/LS.

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

---

## 11. Cowork (navegador) e escrita direta no Supabase — regras de segurança (2026-07-01)

Ver DESIGN §34 para o caso de uso completo (Aviso ao DP via Outlook).

### 11.1 Ações externas irreversíveis (enviar e-mail, etc.)
Quando o Claude opera o navegador do usuário (extensão Claude for Chrome) para uma ação que sai do RelyOn 360 — como enviar um e-mail — **sempre compor e parar antes de confirmar/enviar**, mostrar o resultado pro usuário, e só executar a ação final (clicar "Enviar") com confirmação explícita na conversa. Ações dentro do próprio app (navegar, clicar num botão que só muda estado do app) não precisam desse passo extra.

> **Exceção documentada (2026-07-14) — rotina de Aviso ao DP:** a tarefa agendada `aviso-dp-rascunho-outlook` **envia** o e-mail sozinha, sem confirmação no momento. É a única exceção autorizada e só se sustenta porque o e-mail inteiro (destinatário/assunto/corpo) é gerado pelo próprio app (`buildDpEmail`), sem entrada de fonte externa, e a decisão de enviar já foi tomada quando o planejador aprovou a solicitação. Ver DESIGN §35.6. Fora desse caso, a regra acima continua valendo — nunca auto-enviar e-mail sem confirmação humana no momento.

### 11.2 Nunca escrever direto em `app_state` para mudanças que o app já modela via UI
`relyon_requests` (e as demais chaves de `app_state`) são **arrays JSON inteiros guardados numa linha só** — o cliente React mantém uma cópia em memória e regrava o array inteiro em vários gatilhos. Um `UPDATE` SQL direto enquanto uma aba tem o estado antigo carregado corre risco real de ser **silenciosamente sobrescrito** no próximo save do cliente (mesma classe do incidente de sync documentado em memória de sessão — `project_sync_server_authoritative_fix`).

**Preferir sempre:** se o cowork já está com o navegador aberto, **acionar a própria UI** (clicar o botão que o app já tem) em vez de um `UPDATE` cego — isso passa pelo `setState`/`updateRequest` do React, que sabe lidar com a concorrência.

**Exceção aceitável — só para mutação pura de dado (sem necessidade de conferência visual):** ler o array inteiro via `execute_sql`, alterar apenas o campo necessário, regravar o array inteiro (nunca um patch parcial às cegas) — **e**, se alguma aba do app estiver aberta na sessão, recarregá-la logo em seguida pra forçar o refetch do estado novo. Sem o reload, a leitura da aba pode ficar desatualizada e, num save seguinte, apagar a mudança.

### 11.3 Por que isso importa para custo de tokens
Cowork (screenshots + cliques) é caro em tokens — cada screenshot é uma imagem inteira. Para ações puramente de dado (ex: marcar um campo como "enviado"), o SQL direto com o protocolo acima é bem mais barato. Reservar o cowork visual para o que realmente precisa de interface (compor/enviar e-mail, verificar algo visualmente).
