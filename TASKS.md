# TASKS — RelyOn 360 Scheduler
> Backlog derivado da SPEC. Toda tarefa nova deve referenciar uma seção da SPEC.

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
- [x] Logout limpa sessão

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

### Instrutores (InstructorsPage)
- [x] Lista em acordeão por área com filtros (SPEC §5.7)
- [x] Detalhe com dados pessoais e habilidades
- [x] Edição inline sem perda de foco (bug de componente instável corrigido)

### Persistência
- [x] Hook `usePersisted` com localStorage (SPEC §6)
- [x] `window.__resetRelyOn360()` para reset via console

---

## 🔄 Em Progresso

_(nenhum item ativo no momento)_

---

## 📋 Backlog — Alta Prioridade

### Roles e Controle de Acesso
- [ ] **Adicionar roles de Cliente ao modelo de usuários** (SPEC §2.2)
  - Criar roles: `instructor`, `cs`, `hr`
  - Atualizar tabela de permissões (SPEC §4.6)
  - Critério: login com role `instructor` exibe visão de cliente

- [ ] **Visão do Instrutor (Cliente)** (SPEC §5.5)
  - Ao logar como instrutor, exibir apenas suas disciplinas atribuídas
  - Agrupadas por turma e data
  - Sem acesso às telas de gestão (Treinamentos, Usuários, Áreas)

- [ ] **Botão "Confirmar Programação" para instrutores** (SPEC §4.5)
  - Aparece na visão do cliente/instrutor por linha ou por turma
  - Ao confirmar: `status → "Confirmado"`, `confirmedAt = now`, `confirmedBy = nome do instrutor`
  - Na visão do usuário (admin/planner): badge "Pendente" permanece clicável para ver histórico

- [ ] **Dashboard — contador de confirmações pendentes** (SPEC §5.3)
  - Visão Usuário: "X instrutores ainda não confirmaram"
  - Visão Instrutor: notificação de pendência

### Locais
- [ ] **Corrigir `preferredLocals` para usar `mod.id` como chave** (SPEC §4.4)
  - Substituir `preferredLocals[mod.type]` por `preferredLocals[mod.id]`
  - Garante que módulos PRÁTICA de subtipos diferentes (piscina, incêndio) não compartilhem preferência de local

### Treinamentos
- [ ] **CRUD completo de módulos dentro de treinamento** (SPEC §5.6)
  - Criar, editar, excluir módulo
  - Campos: nome, tipo, duração, instructorCount, locals[], priority

### Ausências
- [ ] **Tela de Ausências completa** (SPEC §5.8)
  - CRUD de ausências com suporte a dia inteiro e intervalo de hora
  - Visualização por instrutor e por data

---

## 📋 Backlog — Média Prioridade

- [ ] **Usuários — CRUD completo** (SPEC §5.9)
  - Criar, editar, excluir usuário
  - Reset de senha (`mustChangePass: true`)

- [ ] **Áreas — CRUD completo** (SPEC §5.10)
  - Criar / editar / excluir área com cor e líder

- [ ] **Detecção de conflito de instrutor** (SPEC §4.3)
  - Alertar quando o mesmo instrutor está em duas turmas no mesmo horário

- [ ] **Detecção de conflito de local** (SPEC §4.4)
  - Alertar quando o mesmo local está em duas turmas no mesmo horário

- [ ] **Step 2 — mover módulo entre dias**
  - Seletor de data por linha para mover módulo para outro dia

---

## 📋 Backlog — Baixa Prioridade / Futuro

- [ ] **Migração para Supabase** (SPEC §6)
  - Banco de dados real, multi-usuário, sem risco de perda de dados
  - Autenticação com JWT e hash de senha

- [ ] **Hash de senhas** (dívida técnica — hoje plaintext)

- [ ] **Exportação de PDF** da programação de uma turma (SPEC §7)

- [ ] **Relatório de horas por instrutor** (SPEC §7)

- [ ] **Visualização em calendário** de todas as turmas

---

## 🚫 Fora do Escopo

- Backend / API REST própria
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
