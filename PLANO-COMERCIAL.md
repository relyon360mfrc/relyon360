# PLANO-COMERCIAL.md — Transformar o RelyOn 360 em produto SaaS vendável

**Data:** 2026-07-17 · **Status:** rascunho para decisão do Matheus
**Objetivo:** vender o sistema de programação de treinamentos para várias empresas, como assinatura (SaaS multi-tenant).

---

## 0. TL;DR

1. **O produto já está validado** — roda em produção desde maio/2026, com regras de negócio reais, testes no core e um diferencial raro (agente de IA via MCP). Isso vale muito: a maioria dos SaaS morre por não ter o que você já tem.
2. **O código atual NÃO é o produto comercial.** Ele foi (corretamente) otimizado para entregar rápido para UMA empresa. Para vender a várias, precisamos de uma **v2 em repositório novo**, com fundação multi-tenant desde o dia 1. O app atual vira a *especificação viva* e a RelyOn Nutec vira o *tenant #1*.
3. **Os 3 maiores bloqueios não são técnicos:** (a) propriedade intelectual — o app foi construído dentro do contexto RelyOn Nutec; (b) marca — "RelyOn 360" carrega o nome do empregador; (c) entidade jurídica + contratos. Nada disso o Claude resolve; é a Fase 0 e é sua.
4. **Prazo realista:** ~4–6 meses de sessões constantes até um beta pagante com 2–3 empresas. Não é um fim de semana, mas também não é começar do zero — as regras já existem e estão testadas.

---

## 1. Diagnóstico honesto: onde estamos

### 1.1 O que já é ouro (levamos para a v2)

| Ativo | Por que vale |
|---|---|
| Regras de negócio validadas | `recalcTimes`, `applyDaySchedule`, score de instrutor do `initPlan`, detecção de conflitos, vínculo por ID, moderador EAD, remuneração CLT/Freelancer — tudo batido em produção real |
| Testes do core | `logic.js` + `core.cjs` + ~88 testes vitest — o coração já tem rede de segurança e é portável |
| MCP agent (TypeScript) | `agents/mcp/` já é código moderno; "operar a programação por linguagem natural" é o diferencial de venda nº 1 |
| Know-how de domínio | Você conhece o mercado de centros de treinamento (NR, OPITO, offshore) por dentro — isso não se compra |
| UX iterada | Wizard de planejamento, Linha do Tempo, relatórios, PWA, push — anos-luz à frente de planilha, que é o concorrente real |
| Cicatrizes documentadas | MEMORY + docs registram cada doença (sync, split-brain de senha, cache) e a cura — a v2 nasce vacinada |

### 1.2 O que impede de vender amanhã (e por que retrofit não resolve)

| Problema | Situação atual | Por que é bloqueio comercial |
|---|---|---|
| **Single-tenant** | 1 projeto Supabase = 1 empresa; chaves `relyon_*` fixas | Cliente novo exigiria clonar projeto inteiro na mão — não escala nem para 3 clientes |
| **`app_state` com blobs JSON** | Arrays inteiros gravados por chave, merge no cliente | Origem da "doença crônica de sync" (outbox, rows órfãs, dirty-retry). Com 10 empresas escrevendo, vira loteria |
| **Auth caseira** | `relyon_users` local + bcrypt no cliente, sessão própria | Nenhum comprador sério aceita; sem MFA, sem SSO, sem recuperação padrão; auditoria de segurança reprova |
| **Escopo global JS** | 20 módulos, ~1,6 MB, um único escopo, sem imports/types | Cada feature nova fica mais cara; onboarding de qualquer outro dev é inviável |
| **Regras hardcoded** | Bônus R$60/dia CLT, bases Macaé/Bangu, tipos de atividade, paletas — tudo no código | Empresa B tem outras regras; hoje seria fork por cliente (suicídio de manutenção) |
| **Escrita client-authoritative** | Cliente decide DELETE/UPDATE/INSERT e torce | Incidentes CBSP 02 e THUET 03 provaram: a cura definitiva é escrita atômica server-side — e isso é redesenho, não patch |
| **Marca e IP** | Nome, repo e OneDrive são "RelyOn" | Não dá para vender para concorrentes da RelyOn Nutec um produto com o nome dela sem acordo formal |

**Conclusão:** retrofit multi-tenant em cima do `app_state` herdaria todas as doenças e ainda arriscaria a operação da RelyOn Nutec (que depende do app hoje). A v2 em repo novo protege a operação atual E nasce certa.

---

## 2. Decisão de arquitetura: v2 em repositório novo

- **O app atual continua rodando intocado** para a RelyOn Nutec durante toda a construção. Zero risco para a operação.
- **A v2 nasce multi-tenant, TypeScript, com escrita server-side.** Cada módulo é *portado* (não reescrito do zero): a lógica já existe e os testes garantem paridade.
- **A RelyOn Nutec migra por último, como tenant #1** — quando a v2 provar paridade. Dogfooding real antes de qualquer cliente externo.
- **Nome novo para o produto** (decisão da Fase 0). Sugestão de critério: nome neutro de segmento ("programação de treinamento"), domínio .com.br + .com disponíveis, sem colidir com marca do empregador.

---

## 3. Arquitetura definitiva

### 3.1 Stack (mantém o que você domina, moderniza o que dói)

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | **Vite + React 18 + TypeScript** | Mesmo React que você já escreve, agora com imports, types e build instantâneo; o esbuild caseiro se aposenta |
| Estado servidor | **TanStack Query** | Cache, revalidação e retry padronizados — substitui os hooks de persistência artesanais do `app.js` |
| Backend | **Supabase (projeto novo)** | Você já opera Supabase; Postgres + Auth + RLS + Edge Functions + Storage + Realtime cobrem tudo |
| Escritas críticas | **RPCs Postgres + Edge Functions** | Transações atômicas server-side = cura definitiva da doença de sync (nada de outbox no cliente) |
| Autenticação | **Supabase Auth** | E-mail/senha + convite + reset padrão; MFA nativo; SSO Google/Microsoft nos planos maiores |
| Billing | **Stripe** (Checkout + Customer Portal + webhooks) | Padrão de mercado, funciona no Brasil, portal de assinatura pronto |
| Deploy | **Vercel** (que você já usa) | Mantém o fluxo push→deploy |
| Observabilidade | **Sentry** (erros) + logs do Supabase | Com 10 clientes você precisa saber do erro antes do cliente ligar |
| E-mail transacional | **Resend** (ou Postmark) | Convites, reset, avisos — sai do improviso do cowork/Outlook |
| Monorepo | **pnpm workspaces**: `apps/web`, `apps/mcp`, `packages/core` | `packages/core` = a lógica de `logic.js`/`core.cjs` portada para TS, testada, consumida por web E mcp (fonte única de verdade, como você já aprendeu a exigir) |

### 3.2 Modelo multi-tenant: shared schema + `org_id` + RLS

**Escolha: banco único, schema único, coluna `org_id` em toda tabela, RLS por organização.**

- É o padrão da indústria SaaS para até centenas/milhares de tenants (Linear, Cal.com etc. começaram assim).
- Você JÁ aprendeu RLS no cutover de 2026-07-14 — o conhecimento transfere direto.
- Alternativas descartadas: *projeto-por-cliente* (o que você faria hoje — não escala operacionalmente) e *schema-por-cliente* (complexidade de migração multiplicada sem ganho real no nosso porte).
- Porta de saída enterprise: se um dia um cliente gigante exigir isolamento físico, um tenant pode ser exportado para projeto dedicado — a arquitetura não impede.

**Regra de ouro:** TODA tabela de dados tem `org_id NOT NULL REFERENCES orgs(id)`, e TODA policy RLS começa com `org_id = auth_org_id()` (função que lê a org do JWT). Sem exceção, desde a primeira migração.

### 3.3 Schema core (normalizado — adeus blobs)

```
orgs                  id, name, slug, plan, status, settings jsonb, created_at
org_members           org_id, user_id (auth.users), role, linked_instructor_id?
instructors           org_id, id, name, employment_type (clt|freelancer|pj),
                      base_id, hire_date, contract_end, competencies jsonb, active
trainings             org_id, id, name, area_id, modules jsonb (id,name,minutes,
                      instructorCount,locals...), lunch_schedule jsonb, planning_types
areas                 org_id, id, name
locals                org_id, id, name, base_id, capacity?
bases                 org_id, id, name            -- generaliza Macaé/Bangu/Offshore
classes               org_id, id, name, training_id, start_date, end_date,
                      planning_type, linked_class_ids uuid[], status, meta jsonb
class_slots           org_id, id, class_id, module_id, date, start_time, end_time,
                      instructor_id, role, local_id
                      UNIQUE(org_id, class_id, module_id, date, start_time,
                             instructor_id, role)   -- herda a unique_slot que já te salvou
absences              org_id, id, instructor_id, date, end_date?, category,
                      start_time?, end_time?, status, evidence_ref?
activities            org_id, id, instructor_id, date, type, local_id?, notes
                      -- Linha do Tempo; tipos viram catálogo por org (3.6)
requests              org_id, id, ... (ciclo de vida que o communication.js já define)
holidays              org_id, id, date, name, scope
notifications         org_id, ...          push_subscriptions   org_id, ...
audit_log             org_id, actor, action, entity, entity_id, diff jsonb, at
                      -- LGPD + suporte: quem mudou o quê, quando
```

Pontos que travamos por cicatriz conhecida:
- **Vínculo de turmas:** `linked_class_ids` (array de UUID) autoritativo desde o dia 1 — nome nunca foi e nunca será chave (Migração 7).
- **Ausência dia-inteiro com horário:** o schema separa `category` de horários opcionais — o bug de 2026-07-08 vira impossível por construção.
- **Sem coluna derivada gravada:** status de request derivado do log, nunca coluna (lição do `issueStatus`).
- **IDs sempre UUID gerados no servidor** — extingue a classe de bugs "id null / patchear id perdido".

### 3.4 Auth e papéis

- **Supabase Auth de verdade** (acaba o fallback local): convite por e-mail → usuário define senha → JWT carrega `org_id` + `role` (custom claims via hook).
- Papéis por org: `owner`, `admin`, `planner`, `customer_service`, `qsms`, `instructor`, `viewer` — os helpers `canAdmin`/`canPlan` viram funções TS em `packages/core`, usadas na UI E espelhadas nas policies RLS.
- Instrutor continua sendo "cliente que consome": app dele só lê a própria agenda + escreve requests (o modelo de acesso do ACESSO.md transfere direto).
- MFA opcional (nativo do Supabase Auth); SSO Google/Microsoft = feature de plano superior.
- **Renovação proativa de token desde o dia 1** — a cura definitiva do bug "aba aberta perde escrita" (RLS 42501) que hoje está pendente na v1.

### 3.5 Escritas server-authoritative (a cura definitiva, agora de fábrica)

Toda operação composta vira **uma RPC Postgres transacional**:

- `save_plan(org_id, class_payload)` — cria/atualiza turma + slots numa transação; ou entra tudo, ou nada. Reorder nunca mais deixa órfã nem colide com unique_slot: é `DELETE+INSERT` dentro da MESMA transação no servidor.
- `swap_instructor`, `register_absence`, `approve_request` — idem.
- O cliente só faz: chamar RPC → invalidar cache do TanStack Query → re-renderizar. **Sem outbox, sem journal, sem merge no cliente.** Realtime do Supabase empurra mudanças para outros dispositivos abertos.
- Leitura sempre com paginação explícita (`.range()`) — o corte silencioso em 1000 rows vira erro de lint no projeto.

### 3.6 Parametrização por tenant (o que hoje é hardcoded vira configuração)

Isso é O trabalho conceitual da v2 — transformar "regras da RelyOn Nutec" em "regras configuráveis":

| Hardcoded hoje | Vira na v2 |
|---|---|
| Bônus CLT R$60/dia, elegibilidade por tipo | `orgs.settings.compensation`: valores, regras por tipo de vínculo, tipos elegíveis |
| Tipos de atividade da Linha do Tempo | Catálogo `activity_types` por org (nome, cor, conta-cobertura?, gera-bônus?, categoria utilização) — acaba o "3 lugares hard-coded para cada tipo novo" |
| Bases Macaé/Bangu/Offshore | Tabela `bases` por org |
| Papéis de slot (instrutor/avaliador/moderador/tradutor) | Catálogo `slot_roles` por org + regra "moderador não conflita" como flag do papel |
| Horário 08:00 + almoço 60 min | `orgs.settings.schedule`: hora de início, política de almoço default (override por treinamento continua existindo) |
| Paletas/labels | Tema por org (white-label leve nos planos maiores: logo + cor primária) |
| Feriados | Por org, com import do calendário nacional/estadual |

**Critério prático:** na dúvida entre flexibilizar ou fixar, fixamos com o default RelyOn e anotamos no backlog — parametrizar tudo de uma vez é a receita para nunca lançar.

### 3.7 Billing e planos (hipótese para validar, não dogma)

- **Métrica de cobrança: instrutores ativos/mês** — cresce com o valor que o cliente extrai, fácil de auditar.
- Hipótese inicial (validar com design partners antes de imprimir em site):
  - **Starter** ~R$ 349/mês — até 15 instrutores, 1 base, features core
  - **Pro** ~R$ 799/mês — até 50 instrutores, multi-base, relatórios financeiros, Linha do Tempo completa
  - **Business** ~R$ 1.900/mês — instrutores ilimitados, assistente IA (MCP), SSO, white-label, suporte prioritário
- Implementação: Stripe Checkout para assinar, Customer Portal para cartão/upgrade/cancelamento, webhook → `orgs.plan`, gates de feature lidos de um único módulo `packages/core/entitlements.ts`.
- Trial de 14 dias sem cartão; design partners entram com desconto vitalício (50%) em troca de feedback semanal e depoimento.

### 3.8 IA/MCP como diferencial de venda

- O `agents/mcp` atual vira **`apps/mcp` multi-tenant**: cada org gera sua API key; o server resolve org pela key e o RLS faz o resto.
- Pitch de venda: *"programe a semana conversando"* — nenhuma planilha nem concorrente de nicho faz isso.
- Fica no plano Business (margem para pagar os tokens) e é a demo que abre portas.

### 3.9 Ambientes, CI/CD e observabilidade

- **3 ambientes:** `dev` (branch do Supabase ou projeto free) → `staging` → `prod`. Migrações SQL versionadas no repo (`supabase/migrations`), aplicadas por CI — nunca mais mudança de schema na mão em produção.
- **CI (GitHub Actions):** typecheck + vitest + build a cada PR; deploy preview da Vercel por branch.
- **Sentry** no front e nas edge functions; alerta de erro novo → seu e-mail.
- **Backups:** PITR do Supabase Pro + export semanal automatizado por org (que também vira a feature "exporte seus dados" da LGPD).
- Status page simples (BetterStack free tier) quando houver clientes externos.

### 3.10 Segurança e LGPD (pré-requisito de venda B2B)

- RLS por org em tudo + testes automatizados de isolamento (suite que tenta ler dados da org A logado na org B — roda no CI).
- Todo o aprendizado do RELATORIO_SEGURANCA/SEGURANCA.md aplicado de fábrica: sem hash no cliente, sem service_role no front, senhas 100% no Auth.
- LGPD mínimo vendável: Política de Privacidade + Termos de Uso + DPA modelo (advogado, Fase 0), `audit_log`, export de dados por org, exclusão de org com purga comprovável, bucket privado para documentos sensíveis (o padrão do atestado digital já é esse).
- Uptime honesto no contrato: 99,5% sem multa no início; não prometa SLA que uma pessoa só não sustenta.

---

## 4. Roadmap por fases

> Estimativas assumem o ritmo atual: sessões frequentes você+Claude, sem equipe. São **estimativas honestas, não promessas** — a Fase 2 é a mais sujeita a descobertas.

### Fase 0 — Decisões de negócio (2–4 semanas, corre em paralelo; é SUA, não do código)

| # | Tarefa | Saída |
|---|---|---|
| 0.1 | **Conversa de IP com a RelyOn Nutec** — o app nasceu no contexto do seu emprego. Caminhos possíveis: licença/autorização formal, spin-off com participação da empresa, ou compra dos direitos. **Sem isso resolvido POR ESCRITO, nada é vendável.** | Acordo assinado |
| 0.2 | Advogado (societário + LGPD): revisar acordo de IP, abrir empresa (ou usar existente), minutas de ToS/Privacidade/DPA/contrato de assinatura | CNPJ + minutas |
| 0.3 | Nome e marca do produto (não pode carregar "RelyOn"), domínio, busca INPI básica | Nome + domínio registrados |
| 0.4 | Lista de 5 empresas-alvo que você conhece do setor; sondar 2–3 como design partners ("se existisse X, você pagaria Y?") | 2–3 cartas de intenção informais |
| 0.5 | Definir preço-hipótese (§3.7) e o que entra no MVP comercial | 1 página de escopo |

**Critério de saída:** IP resolvido por escrito. (Sem 0.1, as fases seguintes são hobby, não negócio.)

### Fase 1 — Fundação técnica (3–4 semanas)

| # | Tarefa |
|---|---|
| 1.1 | Repo novo + monorepo pnpm (`apps/web`, `apps/mcp`, `packages/core`) + Vite + TS + CI verde |
| 1.2 | Projeto Supabase novo: migrações do schema §3.3, RLS por org, função `auth_org_id()`, seeds de demo |
| 1.3 | Supabase Auth: signup de org, convite de membros, papéis via claims, telas de login/reset, renovação proativa de token |
| 1.4 | Portar `packages/core`: recalcTimes, applyDaySchedule, score do initPlan, validações — **com os testes atuais passando em TS** (paridade provada pelo golden test) |
| 1.5 | Esqueleto do app: shell, roteamento, TanStack Query, Sentry, design system (o Liquid Glass transfere) |
| 1.6 | Suite de isolamento multi-tenant no CI (org A não lê org B) |

**Critério de saída:** duas orgs de teste coexistindo no mesmo banco, isolamento provado por teste automatizado, core com paridade de testes.

### Fase 2 — Paridade do núcleo (6–10 semanas — a fase longa)

Ordem de porte (dependências primeiro, telas depois), cada item = portar + RPC server-side + teste + conferir contra o app v1 com dados reais exportados:

1. Cadastros: áreas, locais, bases, treinamentos (com `lunch_schedule`)
2. Instrutores (admin) + competências + contratos
3. **Planejamento de turmas** (wizard, initPlan, savePlan como RPC atômica) — o coração; reservar 2–3 semanas só para ele
4. Dashboard + detecção de conflitos + vínculo por ID
5. Ausências (com o modelo pré-ausência/atestado) + feriados
6. Comunicação (requests com ciclo de vida)
7. Linha do Tempo (activities com catálogo de tipos por org)
8. Visão do instrutor (Meu Histórico) + PWA + push
9. Relatórios CLT/Freelancer + utilização (o `reports.js` de 355 KB é o maior porte individual — fatiar por aba)
10. Pool/lote + import por planilha (aproveita o parse-lote existente)

**Critério de saída:** um mês real da programação da RelyOn Nutec reproduzido na v2 com os mesmos números nos relatórios (golden test de folha).

### Fase 3 — SaaS-ficação (3–4 semanas)

| # | Tarefa |
|---|---|
| 3.1 | Onboarding self-service: criar org → wizard de setup (bases, treinamentos, instrutores) → import por planilha |
| 3.2 | Stripe: checkout, portal, webhooks, gates de plano (`entitlements.ts`), trial 14 dias |
| 3.3 | Tela de configurações da org (§3.6): compensação, tipos de atividade, papéis de slot, tema |
| 3.4 | LGPD: export de dados, exclusão de org, `audit_log` visível para admin, textos legais publicados |
| 3.5 | `apps/mcp` multi-tenant com API key por org |

### Fase 4 — Beta com design partners (4–8 semanas de calendário)

| # | Tarefa |
|---|---|
| 4.1 | **Migrar a RelyOn Nutec como tenant #1** (script de migração app_state→schema novo; rodar em staging até bater; janela de virada num fim de semana; v1 fica de rollback por 30 dias) |
| 4.2 | Onboarding assistido dos 2–3 design partners (você faz o import junto — cada onboarding ensina o que automatizar) |
| 4.3 | Ciclo semanal: feedback → triagem → fix; Sentry limpo como disciplina |
| 4.4 | Primeiro pagamento real processado no Stripe (mesmo com desconto) — **isso é o marco que separa projeto de negócio** |

### Fase 5 — GA e escala (contínua)

Landing page + demo em vídeo (a demo do MCP por voz é o abre-portas) · docs/central de ajuda · canal de suporte com expectativa clara (e-mail/WhatsApp comercial, resposta em 1 dia útil) · SSO enterprise · API pública read-only · programa de indicação no nicho (o setor se conhece).

---

## 5. Custos estimados (ordem de grandeza, mensal)

| Item | Custo |
|---|---|
| Supabase Pro (prod) | ~US$ 25 |
| Vercel Pro | ~US$ 20 |
| Sentry / Resend / BetterStack | free tiers no início |
| Domínio + e-mail do produto | ~R$ 30 |
| Stripe | ~3,99% + R$ 0,39 por transação (sem mensalidade) |
| Contador (empresa) | ~R$ 300–500 |
| **Total fixo inicial** | **< R$ 800/mês** — o breakeven de infra é ~1 cliente Starter |
| Advogado (Fase 0, one-off) | ~R$ 3–8 mil (societário + minutas LGPD) |

## 6. Riscos e mitigação

| Risco | Prob. | Mitigação |
|---|---|---|
| IP não resolvido com a RelyOn Nutec | média | Fase 0.1 vem ANTES de escrever código da v2; considerar a empresa como sócia/cliente-âncora pode alinhar interesses |
| Fase 2 estourar prazo | alta | Fatiar por módulo com critério de saída; MVP comercial pode lançar sem relatórios completos/pool |
| Você é o único dev + tem emprego | alta | Ritmo sustentável > sprint heroico; o plano é modular justamente para pausar sem apodrecer; Claude carrega a memória entre sessões |
| Migração da RelyOn Nutec corromper dados | média | Script idempotente, ensaio em staging até golden test bater, janela com rollback |
| Design partner desistir | média | 3 partners, não 1; contrato beta simples com desconto vitalício amarra o incentivo |
| Custo de suporte crescer | média | Onboarding assistido no início é FEATURE (aprende-se o que automatizar), mas medir horas/cliente |

## 7. Métricas de sucesso

- **Fase 1–2:** golden tests de paridade passando; suite de isolamento verde no CI
- **Fase 4:** RelyOn Nutec operando 100% na v2 por 30 dias sem rollback; 1º pagamento no Stripe
- **Fase 5:** 3 clientes pagantes fora da RelyOn; churn 0 nos primeiros 6 meses; NPS informal ≥ 8

## 8. Próximos passos imediatos (esta semana)

1. **[Matheus]** Marcar a conversa de IP com a RelyOn Nutec (0.1) — é o caminho crítico de TUDO.
2. **[Matheus]** Listar as 5 empresas-alvo e escolher 2–3 para sondar (0.4).
3. **[Juntos]** Brainstorm de nome + checar domínios (0.3).
4. **[Juntos]** Quando 0.1 estiver encaminhado: criar o repo da v2 e executar a Fase 1.1 (fundação) — primeiro commit do produto.

---

*Documento vivo — atualizar status por fase a cada marco. Histórico de decisões nos arquivos de memória do Claude.*
