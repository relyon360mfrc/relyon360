# LAUNCH — RelyOn 360 Scheduler

> Plano operacional para lançamento interno na RelyOn Nutec.
> Criado: 2026-04-30 · Alvo: próximos 5-7 dias

---

## 1. Pré-launch técnico

### Hoje
- [ ] Push commit `986c0c8` (5 FASES + fixes) → Vercel republica em ~1 min
- [ ] Smoke test em https://relyon360.vercel.app:
  - [ ] Login com usuário real
  - [ ] Criar turma do zero (Step 1 → Step 2 → Salvar)
  - [ ] Editar turma existente (Step 3)
  - [ ] Login como instrutor → confirmar ciência → reportar problema
  - [ ] Push notification ativada e recebida
- [ ] Backup baseline via `window.__exportBackup()` no console — guardar JSON fora do Git

### Antes do go-live
- [ ] Limpar PII hardcoded em `constants.js` (ver §5 abaixo) — **bloqueador**
- [ ] Confirmar que SW (`relyon360-v3`) não está servindo versão antiga em browsers existentes
- [ ] Documentar que chave anon do Supabase permite SELECT/UPDATE — risco aceito para tool interno
- [ ] Revisar permissões granulares (`PERMISSIONS_LIST`) por usuário planejador

---

## 2. Pré-launch operacional

### Dados em produção
- [ ] Lista de instrutores conferida (nome, contato, áreas, competências)
- [ ] Áreas atualizadas (líderes, emails, WhatsApp)
- [ ] Locais conferidos (salas, módulos, capacidades)
- [ ] Treinamentos com `modes[]` cadastrados onde aplicável
- [ ] Senhas iniciais geradas com `mustChangePass: true`

### Material de onboarding
- [ ] Quick-guide de 1 página por perfil:
  - **Planejador:** criar turma, vincular turmas, Grade Paralela
  - **Customer Service:** consultar Programação da Turma, exportar PDF
  - **Instrutor:** Dashboard, confirmar ciência, reportar problema, ativar push
- [ ] Vídeo curto (3-5 min) demonstrando fluxo principal — opcional mas alto ROI
- [ ] Canal de bug report definido (WhatsApp do Matheus + botão "Reportar Problema" no Instructor Dashboard)

---

## 3. Apresentação interna

**Audiência:** liderança RelyOn (CSO/Operations) + planejadores
**Duração:** 10-15 min · **Formato:** demo ao vivo > slides

### Estrutura
1. **Problema (2 min)** — planejamento manual em planilhas → erros de conflito, retrabalho, falta de visibilidade
2. **Solução (1 min)** — app web responsivo, 3 personas, integração com Supabase em tempo real
3. **Demo ao vivo (7 min):**
   - Criar turma do zero usando Modo de Sequência auto-detectado
   - Mostrar Grade Paralela com conflitos visuais
   - Vincular duas turmas fundidas (bypass de conflito)
   - Login como instrutor → push notification real
   - Fritz analisando um bug rejeitado
4. **Roadmap (2 min)** — próximos 3 meses (LGPD, Supabase Auth, métricas de absenteísmo)
5. **Q&A (3 min)**

### Prep
- [ ] Slides em Google Slides (5-7 telas, design minimal)
- [ ] Demo em browser dedicado com dados reais
- [ ] Backup screencast caso haja falha de rede
- [ ] Notebook do Matheus com Fritz rodando local (porta 4747)

---

## 4. Post LinkedIn

**Tom:** técnico-pessoal, autêntico, sem corporativês.
**Hero:** Fritz (agente Claude que opera o sistema como planejador).

### Rascunho

> 4 meses atrás, comecei um experimento.
>
> E se eu construísse um app inteiro de gestão de treinamentos como engenheiro de produto — sem build step, sem framework pesado, sem time de back-end?
>
> Stack: single-file HTML + React 18 + Babel Standalone + Supabase + Realtime. Deploy em 30 segundos via GitHub Desktop → Vercel.
>
> Mas o que me empolgou de verdade foi o **Fritz** — um agente baseado em Claude Sonnet 4.6 que opera o sistema como um planejador humano. Recebe a planilha de turmas, distribui instrutores, valida conflitos, reporta inconsistências. Quando o humano rejeita uma sugestão, três sub-agentes (Developer, Guardian, Test) analisam o bug e propõem opções de correção.
>
> Hoje o RelyOn 360 está em produção:
> - 14 arquivos JS, 26 testes Vitest, push notifications nativas
> - Realtime entre operadores via Supabase
> - Grade paralela com detecção visual de conflitos
> - Modos de sequência auto-detectados pelo número da turma
>
> Lições do projeto:
> 1. Pragmatismo > pureza arquitetural — sem build step funciona muito bem até ~500KB
> 2. Agentes LLM bem prompted resolvem problemas que regras hardcoded não cobrem
> 3. Realtime do Supabase elimina toda uma camada de coordenação manual
>
> #ClaudeCode #Anthropic #Supabase #React #ProductEngineering

### Prep
- [ ] Screenshot da Grade Paralela (visualmente forte)
- [ ] Possível screenshot do Fritz analisando um bug
- [ ] Confirmar se repositório virará público ou permanecerá privado (afeta link no post)
- [ ] Limpar PII de constants.js **antes** de qualquer link público

---

## 5. Limpeza de dados — bloqueador para launch

### Problema
`constants.js` (286 linhas, ~67k tokens) contém:
- 76 instrutores com **nome completo, telefone, email, senha plaintext**
- 4 líderes de área com email
- Lista de salas e treinamentos com currículo completo
- 1 usuário admin com senha plaintext `"admin123"`

Isso é PII commitado no Git. Mesmo com repo privado, é risco LGPD e bloqueador para qualquer link público (LinkedIn, divulgação).

### Plano (a executar antes do launch)
1. Backup completo via `__exportBackup()` — JSON guardado fora do Git
2. Substituir seeds em `constants.js` por arrays vazios + 1 admin bootstrap (senha hash + `mustChangePass: true`)
3. Adicionar `*.json` ao `.gitignore` (proteção contra exports acidentais)
4. **Decidir sobre histórico:** os dados já estão em commits passados. Opções:
   - (a) Aceitar risco — repo continua privado, dados antigos ficam no histórico
   - (b) `git filter-branch` ou `git-filter-repo` para reescrever histórico — drástico, exige force-push
5. Documentar bootstrap em DESIGN.md §2

### Tradeoff
- (a) é rápido (30 min) e seguro se repo nunca virar público
- (b) preserva privacidade total mas reescreve história e exige coordenação se outros tiverem clonado

---

## 6. Rollout faseado

### Fase 1 — Internal soak (Dia 1-2)
- Apenas Matheus + 1-2 planejadores
- Foco: validar que produção estável, sem regressões
- Critério de avanço: 0 bugs críticos em 24h

### Fase 2 — Pilotos instrutores (Dia 3-5)
- 3-5 instrutores convidados
- Foco: testar push notifications, confirmar ciência, reportar problema
- Critério de avanço: feedback positivo dos pilotos

### Fase 3 — Go-live (Dia 6-7)
- Todos os instrutores onboardados
- Anúncio interno (e-mail + Teams)
- Apresentação para liderança
- Post LinkedIn no mesmo dia ou no dia seguinte

### Pós-launch (semana 2-4)
- Monitorar bug reports via Instructor Dashboard
- Reuniões semanais de feedback com planejadores
- Backup automatizado (cron via Fritz?) — backlog

---

## 7. Plano de rollback

- **Bug crítico em produção:** reverter deploy via Vercel dashboard (1 click) → rollback para `914fb51`
- **Dados corrompidos:** restaurar via JSON do `__exportBackup` mais recente → import via SQL Editor do Supabase
- **App brickado por seed vazio:** login com admin bootstrap → trocar senha → recarregar dados

---

## 8. Métricas de sucesso

### Semana 1
- 100% dos planejadores logaram ao menos 1 vez
- 0 bugs críticos
- Pelo menos 1 turma criada e completada via app

### Mês 1
- 80%+ dos instrutores ativos confirmando ciência via app
- Tempo médio de planejamento de turma reduzido (medir baseline manual antes)
- Pelo menos 5 bug reports rastreáveis via `issueLog`

### Trimestre 1
- App é a fonte de verdade primária para programação
- Planilhas Excel descontinuadas para esse fluxo
- Fritz gerando ≥50% dos planos sem intervenção manual
