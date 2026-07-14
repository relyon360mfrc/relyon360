# NOTION-OFFSHORE.md — Integração Notion → R360 (setor offshore, somente leitura)

> **Status:** PLANEJADO — nada implementado. Bloqueado em pré-requisito externo (token do Notion).
> **Criado:** 2026-07-13 · Sessão de concepção com Matheus.
> **Memória relacionada:** `memory/project_notion_offshore_integracao.md`
> **Para retomar:** leia este arquivo inteiro + a seção "Checklist de retomada" no final.

---

## 1. Contexto e motivação

O setor offshore da RelyOn usa o **Notion** (workspace da empresa, página **Planejamento HQ → Páginas → Embarque**) para gerenciar os embarques de instrutores em unidades marítimas de clientes. A estrutura no Notion é madura e completa; a operadora (Maria Vitória) domina a ferramenta. **Decisão: NÃO migrar o setor pro R360.** O Notion permanece como front-end e fonte de verdade; o R360 **extrai (lê)** de lá o que interessa à programação.

### O ganho concreto pro R360
Embarque + folga pós-embarque + traslado = **instrutor indisponível**. Hoje o R360 não sabe disso — depende de alguém olhar o Notion. Exemplo real: Aloysio Junior tem 8 embarques em 2026; de 06/07 a 31/07 está fora (embarque 06→19/07 + folga 19→31/07). Se o planejador montar turma com ele em Macaé dia 25/07, o R360 atual não acusa nada. Com a integração, o período aparece na Linha do Tempo e o detector de conflitos acusa sozinho.

---

## 2. Restrição INEGOCIÁVEL de segurança

Medo explícito e legítimo do Matheus: o Notion é plataforma oficial da empresa; qualquer dado apagado/alterado por IA o descredibilizaria profissionalmente.

**O desenho elimina o risco por construção, não por promessa:**

1. **Conexão Notion com capacidade só-leitura** — criada com APENAS "Ler conteúdo" marcado ("Atualizar conteúdo" e "Inserir conteúdo" DESMARCADOS; informações de usuário: nenhuma). Qualquer tentativa de escrita é rejeitada pelo próprio Notion com erro de permissão, antes de qualquer código nosso rodar.
2. **Acesso granular** — a conexão só enxerga as páginas explicitamente compartilhadas com ela (4 páginas, ver §6).
3. **Token nunca no client** — o R360 roda no navegador; token exposto no bundle seria legível via F12. O token vive SÓ em secret de Edge Function do Supabase (`NOTION_TOKEN`). Nunca colar o token em chat, código ou arquivo do repo.
4. **Revogável** — desativar a conexão no Notion encerra o acesso na hora.

Pior cenário possível (bug + vazamento de token): alguém LÊ as 4 páginas compartilhadas. Escrita/exclusão no Notion é impossível por permissão.

---

## 3. O que já sabemos da estrutura no Notion (lido por screenshots em 2026-07-13)

### Database "Embarque"
- 1 linha = 1 embarque de instrutor. ~44 linhas preenchidas + 12 vazias no momento da leitura.
- **Views** (todas da MESMA database — confirmado): Geral, Status, Cliente, Financeiro, Ocorrências, Cancelamento/Negado, **Schedule** (timeline agrupada por Instrutor).
- Edição é inline (clicar na célula abre picker); não há campos ocultos no detalhe da página.

### Colunas (tipo aparente → relevância)

| Coluna | Tipo no Notion | Relevante? |
|---|---|---|
| ID | número | não (usar o page_id do Notion como chave) |
| **Cliente** | relation → database "Clientes" (HELIX, VALARIS, SBM, NOBLE, YINSON, HMH, MCDERMOTT, ETESCO…) | **SIM** |
| **Unidade** | relation (NS-52, DS-17, DS-8, DS-4, FPSO CDP/ESS/ATD/CDS/CDM, NFK, COURAGE, ATLANTA…) | **SIM** |
| TMS / Comercial | relation (Rute, Samara, Caroline, Bruno, Karen, Laís, Mainara, Lísia, Isabelle…) | não |
| **Instrutor** | relation → database de instrutores (Joarês dos Santos, Maycon Waked, Fábio Gonçalves, Max Rezende, Wagner Gomes, Aloysio Junior, Rhayane dos Santos, Elson Lara, João Ricardo, Giovani Sousa, Francisco Brant, Hamilton Chagas, Renata Daudt, Arilson da Conceição, Artur Nicácio, Arthur Cavalheiro, Bruno Paiva…) | **SIM** |
| **Traslado** | data (às vezes range) — dia(s) de viagem até o ponto de embarque | **SIM** |
| **Embarque** | range de datas (início → fim a bordo), com lembretes ⏰ | **SIM** (núcleo) |
| A bordo | fórmula/rollup — dias a bordo (5–15, tipicamente 14) | derivável (fim − início) |
| **Status** | fórmula — Finalizado / Concluído / Em andamento / Confirmado | **SIM** (filtro) |
| **Folga** | fórmula — range pós-desembarque (≈13–14 dias após 14 a bordo) | **SIM** (núcleo) |
| Descanso | fórmula — dias de folga | derivável |
| Alunos | número | não (decisão do Matheus) |
| Bilingue / SISPAT / Reembolso | selects SIM/Não/Parcial | não |
| Local de embarque/desembarque | select (Rio de Janeiro, Farol de São Tomé, Vitória, Jacarepaguá…) | não |
| PACK | número (ex.: 211) | não |

**Subconjunto mínimo definido pelo Matheus:** Instrutor, Embarque (range), Folga (range), Traslado, Status, Cliente, Unidade.

---

## 4. Mapa De-Para (Notion → R360)

| Notion | Destino no R360 |
|---|---|
| Instrutor (relation) | instrutor do R360 — casamento por nome normalizado (ver §7.3) |
| Embarque (range) | indisponibilidade tipo **embarque** — overlay na Linha do Tempo (tipo `embarque` já existe em `ACTIVITY_TYPES`, constants.js L52, cor #0369a1, não-elegível a bônus) |
| Folga (range) | indisponibilidade **folga pós-embarque** (overlay; decisão de rótulo/cor pendente — §9.2) |
| Traslado (data/range) | indisponibilidade (dia de viagem — §9.3) |
| Status | filtro de importação (§9.1) |
| Cliente / Unidade | texto descritivo da indisponibilidade ("HELIX · NS-52"); futuramente casar com `offshoreClients`/`offshoreUnits` (offshore.js) — fase 5 |

---

## 5. Arquitetura técnica

### 5.1 DECISÃO CRÍTICA: espelho em tabela dedicada, NUNCA em `relyon_activities`

Verificado no código em 2026-07-13:
- Atividades da Linha do Tempo são **1 registro por instrutor por DIA** (coverage.js ~L834: `{ id, type, instructorId, instructorName, date, obs, startTime?, endTime? }`) — não há ranges.
- `relyon_activities` é **chave do `app_state`** (JSON reescrito inteiro pelos clientes, com journal de uploads — histórico de doença crônica de sync, ver memória `project_sync_server_authoritative_fix`).

**Se a Edge Function escrevesse embarques dentro de `relyon_activities`:** um cliente com estado velho poderia sobrescrever as linhas do sync, ou o sync sobrescreveria edições do usuário — reabriria a doença de sync. **PROIBIDO.**

**Desenho correto — espelho descartável em tabela dedicada:**
- Nova tabela Supabase **`relyon_notion_embarques`** (fora do app_state), escrita SOMENTE pela Edge Function (service_role).
- A cada sync: `DELETE` de todas as linhas da tabela + `INSERT` do estado atual do Notion ("espelho descartável"). Sem lógica de diff — o espelho sempre reflete o Notion. Mudou/cancelou lá, some/atualiza aqui na próxima sync.
- Colunas propostas: `notion_page_id (pk)`, `instructor_name_notion`, `instructor_id_r360 (nullable — null = não casou)`, `client`, `unit`, `traslado_start`, `traslado_end`, `embark_start`, `embark_end`, `folga_start`, `folga_end`, `status`, `synced_at`.
- Guardar **ranges** (não explodir por dia) — o app expande por dia na renderização. Tabela pequena (~44 linhas), reconciliação trivial.
- RLS: leitura pública/anon (como as demais leituras do app hoje); escrita só service_role.
- **App nunca escreve nessa tabela. Notion nunca é escrito por ninguém do nosso lado.**

### 5.2 Edge Function `sync-notion-embarques`

Segue o padrão das existentes (`supabase/functions/`: change-password, login, reset-password).

- Lê `NOTION_TOKEN` dos secrets.
- `POST https://api.notion.com/v1/databases/{DATABASE_ID}/query` (paginado, 100/página; header `Notion-Version`). `DATABASE_ID` fica em secret/env também (`NOTION_EMBARQUE_DB_ID`) — obtém-se da URL da database.
- **Relations devolvem só page_ids** → resolver nomes com `GET /v1/pages/{id}` (title). Cachear resoluções na própria execução (Cliente/Unidade/Instrutor repetem muito). Atenção ao rate limit do Notion (~3 req/s) — com ~44 linhas e cache, tranquilo.
- Propriedades de fórmula (Status, Folga) vêm com valor calculado pela API — sem precisar recalcular.
- Normaliza → espelho descartável (§5.1) → responde resumo `{ imported, unmatched: [nomes], synced_at }`.
- **Gatilhos:** botão manual "Sincronizar Notion" no app (admin, via `supabase.functions.invoke`) + agendamento 1–2×/dia (pg_cron ou scheduled functions — decidir na implementação).

### 5.3 Consumo no app (overlay somente-leitura)

- **Fase leitura:** `AppLoader`/hook busca `relyon_notion_embarques` junto com o resto (atenção: `.range()` se um dia passar de 1000 linhas — memória `feedback_supabase_1000_row_limit`).
- **Linha do Tempo (coverage.js):** expandir ranges em pseudo-atividades diárias renderizadas com badge "Notion" e **sem edição** (clicar não abre modal de edição; no máximo tooltip "editar no Notion"). NÃO inserir nada em `activities`/`setActivities`.
- **Detector de conflitos (dashboard.js + schedule.js):** instrutor com dia dentro de traslado/embarque/folga = indisponível → mesmo tratamento visual de ausência/conflito já existente.
- **Relatórios/bônus:** overlay NÃO entra em `relyon_activities` → não afeta bônus nem utilização automaticamente (comportamento desejado: embarque já é não-elegível a bônus por decisão de produto — constants.js L63).

---

## 6. Pré-requisitos manuais (fora do código) — ONDE PARAMOS

**Bloqueio atual:** Matheus é admin do Notion mas **não é proprietário do workspace** (dropdown "Selecionar espaço de trabalho" vazio: "Nenhum espaço de trabalho disponível"). Só proprietário cria conexões.

Passos pendentes, em ordem:

1. [ ] **Descobrir o proprietário do workspace** — Notion: Configurações → Pessoas → coluna de função "Proprietário do espaço de trabalho".
2. [ ] **Proprietário cria a conexão** (receita pronta em §10): nome `R360 - Somente Leitura`, método **Token de acesso** (não OAuth), capacidades: SÓ "Ler conteúdo", sem informações de usuário.
3. [ ] **Receber o token** (`ntn_...`) por canal seguro.
4. [ ] **Compartilhar com a conexão** (qualquer editor das páginas faz, não precisa ser proprietário): página **Embarque** + databases **Clientes**, **Unidades** e **Instrutores** (onde quer que morem — necessário pra resolver os nomes das relations). Menu `•••` da página → Conexões → adicionar `R360 - Somente Leitura`.
5. [ ] **Guardar o token no Supabase**: Dashboard → projeto `snpvqqsmwrlazawjknme` → Project Settings → Edge Functions → Secrets → `NOTION_TOKEN`. (Matheus faz; token nunca passa pelo chat.)
6. [ ] **Anotar o `DATABASE_ID`** da database Embarque (da URL) → secret `NOTION_EMBARQUE_DB_ID`.

---

## 7. Fases de implementação (com critérios de aceite)

### Fase 0 — Prova de conceito (leitura crua)
- [ ] Edge Function mínima que consulta a database e devolve JSON normalizado (sem gravar nada em lugar nenhum).
- Critério de aceite: chamada manual retorna as ~44 linhas com instrutor/embarque/folga/status legíveis; zero escrita no Notion e no R360.

### Fase 1 — Espelho no Supabase
- [ ] Criar tabela `relyon_notion_embarques` + RLS (§5.1).
- [ ] Função completa com espelho descartável + resolução de relations + casamento de nomes (§7.3).
- Critério de aceite: rodar 2× seguidas termina com o mesmo conteúdo (idempotente); linha alterada no Notion reflete na sync seguinte; linha com instrutor não-reconhecido aparece com `instructor_id_r360 = null` (não é descartada em silêncio).

### Fase 2 — Painel na seção Offshore (offshore.js)
- [ ] Lista dos embarques sincronizados (agrupar por instrutor ou por unidade), com `synced_at` visível.
- [ ] Botão "Sincronizar agora" (gate `canAdmin`/`canPlan`).
- [ ] Alerta visível de nomes não casados ("X embarques sem instrutor reconhecido").
- Critério de aceite: planejador vê no R360 o mesmo que a view Geral do Notion (colunas relevantes) sem abrir o Notion.

### Fase 3 — Overlay na Linha do Tempo (coverage.js)
- [ ] Pseudo-atividades diárias (embarque/folga/traslado) com badge "Notion", somente-leitura.
- Critério de aceite: dias de embarque aparecem no grid do instrutor; clicar NÃO abre modal de edição; nada entra em `relyon_activities`.

### Fase 4 — Detector de conflitos (dashboard.js + schedule.js/initPlan)
- [ ] Planejar turma com instrutor embarcado/de folga/em traslado gera o mesmo aviso de conflito de ausência.
- [ ] `initPlan` rebaixa score/exclui instrutor indisponível por embarque.
- Critério de aceite: reproduzir o cenário Aloysio 25/07 → conflito acusado.

### Fase 5 (opcional/futuro) — Cadastro offshore
- [ ] Casar Cliente/Unidade do Notion com `offshoreClients`/`offshoreUnits` (offshore.js) pra enriquecer em vez de duplicar.
- [ ] Agendamento automático da sync (1–2×/dia).

### 7.3 Casamento de nomes (parte da Fase 1)
- Normalizar (trim, lowercase, sem acentos) e casar com `relyon_instructors` por nome exato normalizado.
- Não casou → `instructor_id_r360 = null` + aparece no alerta da Fase 2. NUNCA descartar em silêncio.
- Fase futura: De-Para manual persistido (page_id do Notion → instructorId) editável no admin, pra casos tipo apelido/nome de casada.
- Já sabido: há gente no Notion possivelmente sem cadastro no R360 (ex.: Artur Nicácio, Arthur Cavalheiro, Bruno Paiva — conferir). Decisão caso a caso com o Matheus: cadastrar ou ignorar.

---

## 8. Regras de importação (proposta inicial — validar com Matheus)

- Importar **todas** as linhas não-canceladas (44 linhas é trivial; o app decide o que renderizar). Histórico passado é inofensivo e útil pra Linha do Tempo retroativa.
- Ignorar linhas sem instrutor OU sem range de embarque (há ~12 linhas vazias).
- Status `Finalizado`/`Concluído` = passado (importa, mas nunca gera conflito futuro por definição).
- Canceladas/negadas: **fora** — mas ver pendência §9.1 (não sabemos ainda qual propriedade marca cancelamento).

---

## 9. Decisões em aberto (resolver ANTES ou DURANTE a Fase 1)

1. **Como o Notion marca cancelamento?** A view "Cancelamento/Negado" existe, mas a propriedade que a alimenta não apareceu nos screenshots (o Status-fórmula só mostrou Finalizado/Concluído/Em andamento/Confirmado). → Pedir ao Matheus um print da view Cancelamento/Negado ou das propriedades da database.
2. **Rótulo/cor da Folga no overlay:** reutilizar visual de "folga" existente, ou criar visual próprio "Folga pós-embarque"? (NÃO precisa entrar em `ACTIVITY_TYPES` — overlay pode ter seus próprios rótulos.)
3. **Traslado bloqueia o dia inteiro?** Provavelmente sim (viagem), confirmar com Matheus.
4. **Frequência da sync automática** (1×/dia de manhã? 2×?) e horário.
5. **Instrutores offshore CLT Offshore:** conferir se o contrato `CLT Offshore` (isOffshore, constants.js L93) tem implicações de remuneração que a folga pós-embarque deva alimentar (por ora: NÃO alimenta nada de dinheiro).
6. **TASKS.md "Fora do Escopo" diz "Integração com ERP ou sistemas de RH"** — Notion não é ERP/RH e é somente-leitura; considerado compatível. Registrar caso alguém questione.

---

## 10. Receita pronta pro proprietário do workspace (copiar/colar)

> Olá! Preciso que você crie uma conexão (integração) no Notion pra um projeto interno de leitura de dados — só proprietário do workspace consegue. É rápido:
>
> 1. **Configurações → Conexões → Desenvolver ou gerenciar integrações → Nova conexão**
> 2. Nome: **R360 - Somente Leitura** · Método: **Token de acesso** · Workspace: o da empresa
> 3. Nas configurações de acesso da conexão: deixar marcado **apenas "Ler conteúdo"** — desmarcar "Atualizar conteúdo" e "Inserir conteúdo", e em informações de usuário escolher "nenhuma". Ou seja: a conexão fica incapaz de alterar ou apagar qualquer coisa, só lê.
> 4. Me enviar o **token** gerado (começa com `ntn_`) por canal seguro.
>
> Ela só vai enxergar as páginas que forem explicitamente compartilhadas com ela depois — nada além disso.

---

## 11. Checklist de retomada (pra próxima sessão)

1. Ler este arquivo inteiro.
2. Perguntar ao Matheus: token já existe? Páginas já compartilhadas? Secrets `NOTION_TOKEN`/`NOTION_EMBARQUE_DB_ID` já no Supabase?
   - **Não** → destravar §6 (receita §10).
   - **Sim** → começar Fase 0 (§7). Validação: `node build.mjs` + `npx vitest run` (preview não alcança supabase.co — não usar preview pra testar isso).
3. Resolver as decisões em aberto do §9 com o Matheus ANTES da Fase 1 (principalmente a 9.1 — cancelamento).
4. Lembretes de regras do projeto: overlay NUNCA escreve em `relyon_activities` (§5.1); token NUNCA no client/chat/repo (§2); gates de UI com `canAdmin`/`canPlan`; deploy = commit+push (build step, sem ritual `?v=`); `APP_VERSION+1` opcional (só pra forçar reload da frota).
