# TASKS — RelyOn 360 Scheduler
> Backlog derivado da SPEC. Toda tarefa nova deve referenciar uma seção da SPEC.
> Última revisão: 2026-04-24

---

## Como usar
- **Novo item:** descreva o comportamento esperado (não a solução técnica)
- **Referência:** seção da SPEC que justifica o item
- **Status:** `[ ]` pendente · `[x]` concluído · `[~]` em progresso · `[!]` bloqueado

---

## ✅ Concluído

### Login e Autenticação
- [x] Tela de login com campos usuário + senha (SPEC §5.1)
- [x] Mensagem de erro em credencial inválida
- [x] Fluxo de troca de senha obrigatória `mustChangePass` (SPEC §5.2)
- [x] Logout limpa sessão e abas abertas
- [x] Hash de senhas com bcrypt (bcryptjs, cost 8) — helpers `hashPw` / `checkPw`
- [x] Migração automática de plaintext para hash no AppLoader

### Roles e Controle de Acesso
- [x] Roles de Usuário: `developer`, `admin`, `planejador`, `customer_service` (SPEC §2.1)
- [x] Role de Cliente: `instructor` com experiência separada (SPEC §2.2)
- [x] Permissões granulares (`PERMISSIONS_LIST`) e `hasPermission()` em runtime (SPEC §4.6)
- [x] Guard de senha em ações destrutivas (excluir, editar áreas, resetar)

### Programação (SchedulePage)
- [x] Listagem de turmas com busca por nome e GCC (SPEC §5.4 / Step 0)
- [x] Cards expansíveis com disciplinas por dia
- [x] Wizard de criação de turma — Step 1 (SPEC §5.4 / Step 1)
- [x] Planejamento automático — Step 2 com drag & drop (SPEC §5.4 / Step 2)
- [x] Edição de turma existente — Step 3 (SPEC §5.4 / Step 3)
- [x] Exclusão de turma com guard de senha (SPEC §4.6)
- [x] Fix: primeiro módulo inicia às 08:00 (SPEC §4.1)
- [x] Fix: `instructorCount > 1` gera N slots simultâneos por módulo (SPEC §4.3 / §3.3)
- [x] Fix: mesmo instrutor priorizado ao longo do treinamento (SPEC §4.3)
- [x] Fix: `preferredLocals` keyed por `mod.id` — respeita `mod.locals[]` (SPEC §4.4)
- [x] Sistema de abas (até 5) — sobrevivem a troca de página e a F5 (SPEC §5.4 / DESIGN §8.1)
- [x] Visão Semanal — calendário Seg–Dom com navegação entre semanas (SPEC §5.4 / DESIGN §7.1)
- [x] Mover módulo entre dias no Step 2 (SPEC §5.4)
- [x] Slot de Tradutor por módulo no Step 3 (SPEC §4.3)

### Visão do Instrutor (Cliente)
- [x] `InstructorDashboard` — bloco Hoje, timeline visual, pendências (SPEC §5.5)
- [x] Botão "Confirmar Ciência" individual e "Confirmar tudo hoje" (SPEC §4.5)
- [x] Botão "Reportar Problema" com `issueLog[]` (SPEC §3.7)
- [x] `InstructorProfile` — dados pessoais, competências, troca de senha (SPEC §5.5)
- [x] `ReportsPage` modo instrutor — "Meu Histórico" com grid Manhã/Tarde/Noite (SPEC §5.5)

### Dashboard (Usuário)
- [x] StatCards: Hoje, Próximos, Confirmados, Pendentes, Treinamentos (SPEC §5.3)
- [x] Card "Salas Teóricas" com contagem de livres por turno (SPEC §5.3)
- [x] Seção "Problemas Reportados" com timeline e botão "Ciente" (SPEC §5.3)
- [x] `LocalsReportPage` — disponibilidade de locais por data e turno (SPEC §5.14)

### Treinamentos (TrainingsPage)
- [x] CRUD completo de treinamentos e módulos com drag-reorder (SPEC §5.6)
- [x] Flag EAD com `LocalsSelector` adaptado (SPEC §3.3a / DESIGN §10.1)
- [x] Campo `shortName` para prefixo de nome de turma (DESIGN §7.2)
- [x] "Quem faz o quê?" — drill-down instrutor por disciplina (DESIGN §10.2)
- [x] Busca unificada por GCC, shortName e nome (`SearchSel` + `keywords`) (DESIGN §8.4)

### Instrutores (InstructorsPage)
- [x] Lista em acordeão por área com filtros (SPEC §5.7)
- [x] Detalhe com dados pessoais e habilidades
- [x] Edição inline sem perda de foco (DESIGN §4.2)
- [x] Multi-seleção de competências no painel de adição (DESIGN §7.3)
- [x] Reset de senha de instrutor (volta para padrão + `mustChangePass: true`)

### Ausências (AbsenteismoPage)
- [x] CRUD de ausências com três tipos e categorias (SPEC §5.8 / §4.7)
- [x] Suporte a ausência parcial (hora) e dia inteiro
- [x] Integração com `initPlan` — instrutor ausente não é sugerido (SPEC §4.3)

### Usuários (UsersPage)
- [x] CRUD completo com senhas hasheadas (SPEC §5.9)
- [x] Validação de username único cruzando `users` + `instructors`
- [x] Reset de senha (`mustChangePass: true`)
- [x] Permissões granulares por checkboxes (quando role = `planejador`)
- [x] Dropdown "Instrutor Vinculado" (`linkedInstructorId`) (DESIGN §9)

### Áreas (SettingsPage)
- [x] CRUD completo de áreas com cor, líder, e-mail e WhatsApp (SPEC §5.10)
- [x] Guard de senha para salvar/deletar

### Locais (LocalsPage)
- [x] CRUD completo de locais com guard de senha (SPEC §5.11 / DESIGN §8.2)
- [x] 8 grupos de locais com filtro e busca

### Relatórios (ReportsPage)
- [x] Aba Utilização — matriz visual Instrutores × Períodos (SPEC §5.12)
- [x] Aba Carga Horária — grade de ocupação por instrutor (SPEC §5.12)
- [x] Aba Cursos — contagem de turmas por treinamento (SPEC §5.12)
- [x] Aba Salas — ocupação de salas por dia com exportação PDF (SPEC §5.12)
- [x] Aba Programação da Turma — linha do tempo com exportação PDF (SPEC §5.12)
- [x] Aba Horas por Instrutor — breakdown Teoria/Prática/Outras + exportação PDF (DESIGN §10.3)

### Persistência e Infraestrutura
- [x] Migração para Supabase (tabela `app_state`, projeto `snpvqqsmwrlazawjknme`)
- [x] `usePersisted` com proteção de primeiro render e `SaveMonitor` com toast de erro
- [x] `window.__resetRelyOn360()` protegido com senha de developer (exige `checkPw` contra `_liveData.relyon_users`)
- [x] `alert()` removido do `usePersisted` — erro de persistência tratado apenas pelo toast do `SaveMonitor`
- [x] Download automático no `beforeunload` removido — `window.__exportBackup()` disponível para download manual
- [x] `window.__exportBackup()` para download manual do estado completo
- [x] Migrações automáticas no AppLoader (hash de senhas, renomear locais, normalizar skills)
- [x] RLS no Supabase — DELETE bloqueado, INSERT restrito às 7 chaves (DESIGN §10.6)
- [x] Service Worker network-first com cache de CDN (DESIGN §10.4)
- [x] Split em 14 arquivos JS — index.html como shell de 59 linhas (DESIGN)
- [x] Identidade visual / branding — anel dourado, ícones PWA, tela de loading (DESIGN §10.5)

### Agente
- [x] `test_agent.py` — subagente de testes: roda Vitest, parseia resultado, reporta via Gemini Flash

---

## 🔄 Em Progresso

_(nenhum item ativo no momento)_

---

## 📋 Backlog — Alta Prioridade

### Qualidade de Código / UX
### Agente Scheduler (Fritz)
- [ ] **Implementar o Agente Scheduler** — operador do sistema (DESIGN §9)
  - O agente Fritz que "opera o sistema como usuário" é o diferencial estratégico do projeto
  - Atualmente só existe o `test_agent.py` (subagente de testes)
  - Critério: agente capaz de criar turmas, atribuir instrutores e reportar via linguagem natural

---

## 📋 Backlog — Média Prioridade

- [ ] **Detecção de conflito de instrutor no wizard** (SPEC §4.3)
  - Alertar visualmente no Step 2/3 quando o mesmo instrutor está em duas turmas no mesmo horário
  - A lógica existe em `AiPage` mas não está integrada ao wizard de criação/edição

- [ ] **Detecção de conflito de local no wizard** (SPEC §4.4)
  - Alertar visualmente quando o mesmo local está em duas turmas no mesmo horário

- [ ] **Remover stat cards do Meu Histórico do instrutor** (SPEC §5.5)
  - Cards de estatísticas na visão de instrutor não são relevantes para o fluxo do cliente
  - Critério: `ReportsPage` no modo instrutor exibe apenas o grid visual, sem StatCards

---

## 📋 Backlog — Baixa Prioridade / Futuro

- [ ] **Supabase Auth / JWT real** (DESIGN §9)
  - Substituiria o login client-side atual
  - Senhas já são bcrypt hash — pré-requisito técnico já cumprido
  - Eliminaria a chave anon exposta no cliente

- [ ] **Avaliar migração para Vite** (DESIGN §9)
  - Babel Standalone processa ~380KB de JS no browser a cada carga
  - Vite eliminaria esse custo e habilitaria tree-shaking, code splitting e HMR
  - Critério: benchmark de tempo de bootstrap antes/depois da migração

- [ ] **Refatorar mutação global de `LOCALS`** (DESIGN §9 — dívida técnica)
  - `LOCALS = locals` em `app.js` sobrescreve uma "constante" declarada em `constants.js` a cada render
  - Critério: `LOCALS` é lido via função ou contexto React; nunca mutado globalmente

- [ ] **Testes automatizados — aumentar cobertura** (DESIGN §9)
  - `logic.js` existe para funções puras testáveis via Vitest
  - Critério: `recalcTimes`, `sortModules`, `isInstructorAbsent` com testes unitários

---

## 🚫 Fora do Escopo

- Backend / API REST própria (Supabase é o backend)
- App mobile nativo
- Integração com ERP ou sistemas de RH
- Envio automático de e-mail / notificações push

---

## Como adicionar um item novo

```
- [ ] **Nome da funcionalidade** (SPEC §X.Y)
  - Descrição do comportamento esperado
  - Critério de aceite: o que precisa ser verdade para o item ser [x]
```
