# SEGURANCA.md — Segurança da Informação & dos Dados (RelyOn 360)

> Documento dedicado, com dois objetivos:
> 1. **Gatilho/Prompt** para o **Fable 5** rodar uma avaliação de segurança completa, propor e
>    implementar melhorias e criar testes que mantenham o sistema seguro ao longo do tempo.
> 2. Abrigar o **Relatório do estado atual** da arquitetura de segurança — material para
>    **apresentar à empresa**.
>
> **Status:** 🟢 **S1/S2 FECHADOS EM PRODUÇÃO — cutover (§8.3) EXECUTADO em 2026-07-02.**
> A role `anon` não lê nem escreve mais nas tabelas do app; acesso a dados exige sessão
> autenticada. Verificado por sondas curl em produção (leitura anon → vazio; INSERT →
> 42501; UPDATE/DELETE → 0 linhas; credenciais → 401; login válido → acesso normal).
> - **Relatório de auditoria apresentável:** `RELATORIO_SEGURANCA.md` (documento separado,
>   linguagem executiva, pra responder "o app é seguro?" numa apresentação).
> - Histórico: Fase 1 (cfcdb3b) + Marco 1 login server-side (8efad62) + fixes pré-cutover
>   (f100e78) + MCP via env (1f7a001) + aperto de RLS (migration marco2_aperto_transition).
> - **Pendências não-urgentes:** S7 (ativar HIBP — toggle manual no painel); MCP em prod
>   precisa da env SUPABASE_SERVICE_ROLE_KEY na Vercel (código pronto, cego até setar);
>   refino RLS por papel/área (§7.2, menor-privilégio interno); remover backups de PII
>   (`_bkp_*_20260622`); strip dos hashes dos blobs (BLOQUEADO — guards client-side usam
>   `user.password`; exige mover os guards pro server antes; NÃO é vuln aberta pois anon
>   já não lê). Modelo atual = transição (authenticated amplo).

---

## 1. 🔮 PROMPT INICIAL — disparar no Fable 5

> Cole o bloco abaixo (ou diga *"rodar a avaliação de segurança do SEGURANCA.md"*).

```
Você é o engenheiro de segurança responsável pelo RelyOn 360 Scheduler (app React de
agendamento de treinamentos da RelyOn Nutec, backend Supabase). Faça uma AVALIAÇÃO DE
SEGURANÇA DA INFORMAÇÃO E DOS DADOS deste sistema e conduza o ciclo completo:
avaliar → priorizar → corrigir → testar → relatar.

REGRAS:
- VERIFIQUE tudo contra o código e o Supabase reais — não presuma. Leia config.js (cliente
  sb, chave, _DB_KEYS, portão de versão, hashPw/checkPw), auth.js (login), agents/mcp
  (servidor MCP), sw.js (service worker), index.html (scripts de CDN), e use as ferramentas
  MCP do Supabase: `get_advisors` (security advisors), `list_tables`, `list_migrations`,
  e consultas às policies de RLS (`pg_policies`).
- Use o §2 (checklist) como roteiro e o §3 (pistas iniciais) como ponto de partida — confirme
  ou refute cada pista; NÃO trate pista como achado até verificar.
- Classifique cada achado por severidade (§5). Para cada um: descrição, evidência (arquivo/linha
  ou policy), impacto, e correção proposta.
- ⚠️ MUDANÇAS DE RLS SÃO PERIGOSAS: a app hoje depende de RLS permissiva para a role anon.
  Apertar policy errada DERRUBA o app inteiro para todos os usuários. NUNCA altere RLS em
  produção sem: (a) plano de rollback, (b) teste em branch/preview do Supabase, (c) aprovação
  do Matheus. Apresente o plano ANTES de aplicar.
- Implemente as correções de forma incremental, seguindo o ritual de deploy (APP_VERSION + 1
  em config.js + commit/push → build esbuild na Vercel). Mudanças de schema/policy via
  migration versionada.
- Crie TESTES DE REGRESSÃO de segurança (vitest na suíte existente + testes de policy/RLS no
  Supabase) para que cada correção fique protegida contra regressão. "Sempre manter seguro".
- Respeite a LGPD (empresa brasileira; há dados pessoais de instrutores e, possivelmente,
  alunos). Considere bases legais, retenção, direitos do titular e minimização.
- Ao final, PREENCHA o §6 (Relatório de Segurança) deste documento — linguagem apresentável
  para a empresa, com sumário executivo não-técnico no topo.

ENTREGÁVEIS:
1. Lista priorizada de achados (severidade + correção).
2. Plano de remediação faseado (quick wins vs. mudanças estruturais).
3. Correções implementadas (com testes) — uma fase de cada vez, com aprovação.
4. §6 preenchido = o relatório de estado atual da arquitetura de segurança.
```

---

## 2. Escopo da avaliação (checklist aterrado nesta app)

Avaliar cada domínio **contra o código/Supabase reais**:

- **Autorização / RLS (prioridade máxima):** a chave **anon** do Supabase está no cliente
  (`config.js`) — toda a segurança recai sobre as policies de RLS. Mapear, por tabela
  (`app_state`, `relyon_schedules`, `relyon_notifications`, `push_subscriptions`, e demais),
  o que a role `anon` pode SELECT/INSERT/UPDATE/DELETE. Há tabelas com acesso amplo a anon?
  Um usuário não-autenticado consegue ler/alterar/apagar dados via API direta (curl + anon key)?
- **Autenticação:** modelo de login real (fallback LOCAL via `relyon_users` × `sb.auth` —
  há uso misto: `InstructorProfile.changePass` usa `sb.auth.signInWithPassword/updateUser`).
  Mapear o fluxo de ponta a ponta. Senhas em bcrypt (bcryptjs cost 8) — cost adequado?
  Proteção contra brute-force / rate limiting? Política de senha (default `RelyOn360!` +
  `mustChangePass`). Gestão e revogação de sessão (já existe revogação remota).
- **Gestão de segredos:** confirmar que só a chave **anon/publishable** está no cliente
  (nenhuma `service_role` vazada no front, repo, ou bundle). Token Bearer do servidor MCP —
  onde mora, como roda, rotação.
- **Supply chain / dependências:** 6 scripts de CDN no `index.html` (React, react-dom,
  **babel-standalone**, supabase-js `@2` (versão flutuante), bcryptjs, xlsx) carregados **sem
  SRI (Subresource Integrity)**. Avaliar SRI + versões fixas. Babel no cliente ainda em algum
  caminho de produção? Dependências npm do build/MCP (auditoria).
- **Dados no dispositivo:** `localStorage` guarda schedules/estado (PII em claro no device).
  Service worker (`sw.js`) e cache — risco de dado obsoleto / envenenamento de cache.
- **Transporte / em repouso:** TLS Supabase/Vercel; criptografia em repouso no Postgres;
  headers de segurança (CSP, HSTS, X-Frame-Options) servidos pela Vercel.
- **XSS / injeção:** React escapa por padrão — buscar `dangerouslySetInnerHTML` ou render de
  conteúdo gerado por usuário (issueLog, observações, nomes). SQL: cliente supabase-js
  parametriza; conferir qualquer query crua / RPC.
- **PII / LGPD:** inventário de dados pessoais (instrutores: CPF? contato? diárias; alunos:
  nomes/contagem). Há o "Privacidade Dashboard" recente — mapear o que cobre. Bases legais,
  retenção, minimização, direito de eliminação (tombstones preservam dados?).
- **Auditoria / rastreabilidade:** o que já existe (tombstones com motivo de exclusão,
  `issueLog`, log de aprovação em solicitações) e o que falta (trilha de acesso/admin).
- **Servidor MCP (`agents/mcp`):** superfície exposta (quais operações o agente pode fazer),
  autenticação Bearer, escopo das tools, exposição na Vercel.

---

## 3. Pistas iniciais (HIPÓTESES a confirmar — ainda não são achados)

> Levantadas a partir da arquitetura conhecida. O Fable deve **confirmar ou refutar** cada uma
> com evidência antes de tratá-las como achado.

1. **RLS permissiva para anon (suspeita de maior impacto).** DESIGN §18 e a memória
   `reference_relyon_auth_model` indicam acesso amplo da role anon a `app_state`
   ("INSERT restrito a `_DB_KEYS`, UPDATE livre") e a outras tabelas com SELECT/UPDATE/DELETE
   liberados ("risco residual aceito"). Com a chave anon pública, isso pode permitir que
   qualquer um leia/altere/apague dados via API direta. **Confirmar o que é exposto e propor
   modelo de autorização real** (sem quebrar o app).
2. **CDN sem SRI.** Os 6 `<script src>` externos no `index.html` não têm `integrity=` —
   comprometimento de CDN injetaria código. Avaliar SRI + pin de versão.
3. **Auth híbrida pouco clara.** Coexistem login local (`relyon_users`) e `sb.auth` — mapear
   qual é a fonte de verdade da sessão e se há brecha (ex.: trocar senha não derruba sessão).
4. **PII em `localStorage`.** Dados de escala/instrutor ficam em claro no dispositivo —
   relevante em device compartilhado/roubado.
5. **LGPD.** Empresa brasileira; verificar base legal, retenção e direitos do titular para os
   dados pessoais tratados.

---

## 4. Fluxo de trabalho (avaliar → corrigir → testar → relatar)

1. **Avaliar** — percorrer o §2, verificando contra código/Supabase; registrar achados.
2. **Priorizar** — ranquear por severidade (§5); separar quick wins de mudanças estruturais.
3. **Aprovar** — apresentar achados + plano ao Matheus ANTES de aplicar (especialmente RLS).
4. **Corrigir** — fase a fase, com ritual de deploy; mudanças de schema/policy via migration.
5. **Testar** — adicionar testes de regressão (vitest + testes de RLS/policy) para travar cada
   correção. Meta: "sempre manter seguro".
6. **Relatar** — preencher o §6 e marcar o status do topo como 🟢.

---

## 5. Política de severidade

| Nível | Critério | Prazo alvo |
|-------|----------|-----------|
| 🔴 Crítico | Vazamento/alteração/perda de dados acessível sem autenticação, ou bypass total de autorização | imediato |
| 🟠 Alto | Escalonamento de privilégio, exposição de PII, ou perda de dados com pré-condição simples | dias |
| 🟡 Médio | Endurecimento ausente (SRI, headers, rate-limit) ou exposição limitada | semanas |
| ⚪ Baixo | Defesa em profundidade / boas práticas | backlog |

---

## 6. 📋 RELATÓRIO DE SEGURANÇA — estado atual *(a preencher pelo Fable após a avaliação)*

> Linguagem apresentável para a empresa. Sumário executivo no topo, não-técnico.

### 6.1 Sumário executivo

O RelyOn 360 é um aplicativo de planejamento de treinamentos com backend Supabase. A avaliação
de 2026-06-11 verificou o código e o banco reais (policies de RLS, autenticação, dependências,
servidor MCP) e confirmou empiricamente, com a chave pública do aplicativo, os principais riscos.

**Em linguagem simples:** o aplicativo é seguro no transporte (toda comunicação é criptografada
via HTTPS) e as senhas são guardadas de forma cifrada (não em texto puro). **Porém**, a "trava"
que deveria impedir que estranhos leiam ou alterem os dados está hoje **destravada**: a chave de
acesso usada pelo navegador é necessariamente pública (faz parte de qualquer site), e as regras
do banco permitem que **qualquer pessoa na internet**, de posse dessa chave, **leia toda a base
de dados** (incluindo dados pessoais de instrutores e as senhas cifradas dos usuários) e até
**altere ou apague** a programação e os cadastros — **sem precisar fazer login**. Isso foi
comprovado na prática durante a avaliação (leitura e teste de escrita retornaram "permitido").

A causa não é um descuido pontual e sim uma **decisão arquitetural**: o login hoje acontece
dentro do próprio navegador (o app baixa a lista de usuários com as senhas cifradas e compara
localmente), então o banco nunca chega a saber "quem" está conectado e não tem como restringir
o acesso por pessoa. Corrigir isso bem exige mover a autenticação para o servidor — um trabalho
estrutural que **já está parcialmente preparado** no banco (existe um conjunto novo de tabelas
com regras de acesso por perfil e por área, ainda vazias, prontas para receber essa migração).

**Nível de maturidade atual:** **inicial**. Higiene básica presente (HTTPS, hash de senha,
trilha de exclusão com motivo, revogação remota de sessão, portão de versão). Lacuna central:
**não há autorização real no banco** — toda a proteção depende de regras permissivas. Há ainda
três correções rápidas de menor risco (cabeçalhos de segurança, integridade dos scripts de CDN,
e uma remoção de um backup com dados pessoais exposto) que podem ser feitas de imediato sem risco
de derrubar o app.

> ⚠️ **Nada foi alterado em produção nesta avaliação.** Os testes de escrita foram propositalmente
> "vazios" (filtros que não casam com nenhuma linha) — provam a permissão sem mudar dado nenhum.

### 6.2 Inventário e classificação de dados

Backend: projeto Supabase `snpvqqsmwrlazawjknme` (Postgres). Volume e residência verificados:

| Dado | Onde reside | Volume | Sensibilidade (LGPD) |
|------|-------------|--------|----------------------|
| **Usuários do sistema** (`relyon_users`): nome, e-mail, login, **hash bcrypt da senha**, papel, permissões | `app_state` (JSON) | 6 | Alta (credenciais + PII) |
| **Instrutores** (`relyon_instructors`): nome, e-mail, telefone, cidade/UF, contrato, líder, competências, **hash bcrypt da senha** | `app_state` (JSON) | 87 | Alta (PII + credenciais) |
| **Backup de instrutores** (`relyon_instructors_backup_2026_05_27_ose_skills`) | `app_state` (JSON) | 86 | Alta (PII duplicada, legível por anon) |
| **Programação** (`relyon_schedules`): turma, módulo, local, instrutor, observações | tabela dedicada | 3.025 | Média (operacional + nomes) |
| **Ausências** (`relyon_absences`): atestado, licença, suspensão, férias | `app_state` (JSON) | 62 | **Alta — dado sensível** (saúde/disciplinar) |
| Atividades, solicitações, treinamentos, áreas, locais, feriados, pacotes de IA | `app_state` (JSON) | ~520 | Baixa/Média |
| **Notificações** (`relyon_notifications`) | tabela dedicada | 2.607 | Baixa/Média |
| **Assinaturas de push** (`push_subscriptions`) | tabela dedicada | 39 | Média (endpoint do dispositivo) |
| Backup de programação (`relyon_schedules_backup_20260502`) | tabela dedicada | 192 | Média (parada, RLS sem policy → não exposta) |
| Espelho no dispositivo (programação, estado, journal) | `localStorage` | — | PII em claro no aparelho |

Não há indício de CPF nem de dados de alunos individualizados (turmas guardam contagem de alunos,
não nominata). A categoria de maior sensibilidade são as **ausências por atestado/saúde**.

### 6.3 Modelo de autenticação

Modelo **híbrido**, com a verdade da sessão **no cliente** (ver `auth.js`):

1. O login tenta primeiro **Supabase Auth** (`sb.auth.signInWithPassword`, e-mail sintético
   `<usuario>@relyon360.app`). Hoje é caminho secundário — poucos/nenhum usuário real cadastrado lá.
2. **Fallback local (caminho real):** o app baixa `relyon_users`/`relyon_instructors` (do banco,
   via chave anon) e compara a senha **no navegador** com `checkPw` (bcrypt `compareSync`).
   Consequência de segurança: **as senhas cifradas de todos trafegam para qualquer cliente** e o
   banco nunca recebe um "quem sou eu" — a role efetiva é sempre `anon`.

- **Hashing:** bcryptjs, **cost 8** (`HASH_ROUNDS=8`, `config.js`). Aceitável; recomendável subir
  para 10 quando o login for server-side. Migração automática de texto puro → hash já existe.
- **Política de senha:** mínimo **6 caracteres**, sem checagem de complexidade nem de vazamento
  (HIBP **desativado** no Supabase Auth — ver advisor). Senha padrão `RelyOn360!` + `mustChangePass`.
- **Sessão:** "permanecer conectado" (LS). Há **revogação remota** (corte por `ts` em
  `session_revoke_before`) e **portão de versão** (auto-reload de clientes velhos) — bons controles.

### 6.4 Modelo de autorização (RLS)

**Este é o centro de gravidade da avaliação.** RLS está *habilitada* em todas as tabelas, mas as
policies que governam o app em produção são **permissivas para a role `anon`** (a única que o
cliente realmente usa). Mapa verificado em `pg_policies`:

| Tabela | anon SELECT | anon INSERT | anon UPDATE | anon DELETE |
|--------|:----------:|:-----------:|:-----------:|:-----------:|
| `app_state` | ✅ `true` | ⚠️ restrito a `_DB_KEYS` | ❌ **`true`** | ❌ **`true`** |
| `relyon_schedules` | ✅ `true` | ❌ `true` | ❌ **`true`** | ❌ **`true`** |
| `relyon_notifications` | ✅ `true` | ❌ `true` | ❌ **`true`** | ❌ **`true`** |
| `push_subscriptions` | ✅ `true` | ❌ `true` | ❌ **`true`** | ❌ **`true`** |
| `fritz_*` (bookkeeping do agente) | ✅ `true` | — | — | — |

(❌ = permissivo demais / ⚠️ = parcialmente contido.) O único limite real é o **INSERT em
`app_state`**, restrito à lista de chaves conhecidas (`_DB_KEYS`) — mas isso não impede UPDATE
nem DELETE livres dessas mesmas linhas.

**Existe um segundo conjunto de tabelas, todas vazias e com RLS correta** (`users_cliente`,
`areas`, `trainings`, `locals`, `schedules`, `training_disciplines`, `discipline_allowed_locals`):
as policies são keyed em `current_user_role()` / `current_user_area_id()` sobre a role
`authenticated` (Supabase Auth) — ou seja, o **alvo arquitetural** (autorização por perfil e por
área) já está desenhado, faltando a migração de dados e do login.

### 6.5 Gestão de segredos

- ✅ **Nenhuma chave `service_role` vazada** — verificado em todo o repositório e bundle. Tanto o
  front (`config.js`) quanto o servidor MCP (`agents/mcp/src/constants.ts`) usam **apenas a chave
  `anon`** (publishable). A exposição da anon é esperada; o problema é o que a RLS deixa ela fazer.
- ✅ **Token do servidor MCP** (`MCP_AUTH_TOKEN`) mora em env var, **não está commitado**
  (`.env.example` vazio). Comparação em tempo constante (`timingSafeEqual`), fail-closed (recusa
  subir sem token). 401 omite `WWW-Authenticate` de propósito (evita fluxo OAuth quebrado).
- ⚠️ O servidor MCP escreve no banco com a **mesma anon key** — herda toda a permissividade da RLS.
  Sua segurança hoje é só o Bearer token. Rotação de chaves: não há processo documentado.

### 6.6 Transporte, repouso e dispositivo

- ✅ **Transporte:** TLS ponta a ponta (Supabase + Vercel, HTTPS).
- ✅ **Repouso:** criptografia em repouso gerida pelo Supabase (Postgres gerenciado).
- ✅ **Service Worker** (`sw.js`): **ignora o Supabase** no cache (`hostname.includes('supabase.co')
  → return`) — não há risco de envenenamento de cache de dados. App-shell network-first, CDN
  cache-first.
- ❌ **Cabeçalhos de segurança ausentes** na Vercel (`vercel.json` não define nenhum): sem CSP,
  HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. Sem CSP, um XSS tem alcance total.
- ⚪ **localStorage:** programação/estado/PII ficam em claro no dispositivo (necessário p/ offline).
  Risco em aparelho compartilhado/roubado. Logout deveria limpar; revogação remota mitiga em parte.

### 6.7 LGPD / privacidade

- **Dados pessoais tratados:** instrutores (nome, e-mail, telefone, cidade/UF, contrato,
  competências) e usuários (nome, e-mail). Categoria **sensível**: ausências por atestado/saúde
  e suspensão disciplinar. Não há CPF nem nominata de alunos.
- **Risco LGPD principal:** os achados S1/S2 (leitura anônima de PII e de ausências de saúde por
  qualquer um na internet) configuram **falha de confidencialidade** — potencial incidente
  reportável (Art. 48). Endereçar isso é a prioridade de conformidade.
- **Minimização/retenção:** há **backups com PII** parados (`relyon_instructors_backup_…` legível
  por anon; `relyon_schedules_backup_20260502`). Recomenda-se remover quando não forem mais
  necessários — reduz superfície e atende ao princípio da minimização.
- **Direitos do titular / eliminação:** exclusões usam tombstone com motivo (bom para auditoria),
  mas tombstone **preserva** metadados — mapear se atende a pedidos de eliminação. Há um
  "Privacidade Dashboard" recente (commit `b782a04`) — escopo a documentar aqui numa próxima volta.

### 6.8 Modelo de ameaças

| Ator | Capacidade hoje | Cenário |
|------|-----------------|---------|
| **Anônimo externo** (só precisa da chave pública, que está no site) | Ler **toda** a base; alterar/apagar programação, cadastros, notificações | Vazamento de PII (LGPD) + sabotagem/ransom da operação; **comprovado** |
| **Anônimo externo** (offline) | Coletar hashes bcrypt e tentar quebrar offline | Cost 8 + senha curta (mín. 6) ⇒ senhas fracas caem |
| **Anônimo externo** (via S1+S4) | Plantar `<script>` em nome de turma/módulo/observação | XSS armazenado dispara quando o planejador gera o PDF da turma |
| **Usuário interno** (planejador/instrutor) | Idem anônimo (não há contenção por papel no banco) | Ação além do papel não é tecnicamente barrada — só pela UI |
| **CDN comprometida** (sem SRI) | Injetar JS nos scripts externos | Execução arbitrária no app de todos os usuários |

Superfícies: REST do Supabase (PostgREST) com anon key · bundle JS público · servidor MCP (Bearer)
· geradores de PDF (XSS) · scripts de CDN.

### 6.9 Achados e remediações

| ID | Sev | Achado | Evidência | Correção proposta | Status |
|----|-----|--------|-----------|-------------------|--------|
| **S1** | 🔴 | **Escrita anônima total** — anon faz UPDATE/DELETE em `app_state`, `relyon_schedules`, `relyon_notifications`, `push_subscriptions` sem login | `pg_policies` `qual=true`; advisor `rls_policy_always_true`; `curl -X DELETE … → HTTP 200` | Login server-side + aperto de RLS (remover anon) | ✅ **FECHADO em prod 2026-07-02** — migration `marco2_aperto_transition_remove_anon`; anon INSERT→42501, UPDATE/DELETE→0 linhas (verificado) |
| **S2** | 🔴 | **Leitura anônima de PII + hashes de senha** — `app_state SELECT true` expõe `relyon_users`/`relyon_instructors` (e-mail, telefone, **bcrypt**) | `curl GET app_state?key=eq.relyon_users → 200`, campo `password` = `$2a$…` | Login server-side; remover anon do SELECT | ✅ **FECHADO em prod 2026-07-02** — anon SELECT → `[]` (verificado). Hashes seguem no blob mas invisíveis ao anon; strip é limpeza opcional bloqueada pelos guards client-side (`user.password`) |
| **S3** | 🟠 | **Backup com PII legível por anon** — `relyon_instructors_backup_2026_05_27_ose_skills` dentro de `app_state` | linha presente; coberta por `app_state SELECT true` | Linha de backup **removida** do `app_state` (dados vivem na tabela ativa) | ✅ **Aplicado** (DB, 2026-06-11) |
| **S4** | 🟡 | **XSS armazenado no PDF da Programação** — `schedule.js` ~1327–1342 não escapa turma/módulo/local/instrutor; demais geradores escapam | `schedule.js:1327`+ (sem `esc`); combina com S1 | `esc()` aplicado em turma/módulo/local/instrutor (+ corrige `</td>` faltante) | ✅ **Em produção** (`cfcdb3b`) |
| **S5** | 🟡 | **CDN sem SRI + versão flutuante** — 6 `<script>` externos sem `integrity=`; `supabase-js@2` é tag móvel | `index.html:16–21`, `sw.js:38–44` | `integrity` (sha384) + `crossorigin` em todos; `supabase-js` fixado em `@2.108.1`; `build.mjs` ajustado p/ continuar removendo babel | ✅ **Em produção** (`cfcdb3b`; hashes reverificados) |
| **S6** | 🟡 | **Sem cabeçalhos de segurança** (CSP/HSTS/X-Frame-Options/X-Content-Type/Referrer-Policy) | `vercel.json` sem `headers` | HSTS + X-Frame-Options DENY + nosniff + Referrer-Policy + Permissions-Policy adicionados. CSP fica p/ Fase 2 (precisa report-only por causa de estilos inline/babel) | ✅ **Em produção** (`cfcdb3b`) |
| **S7** | 🟡 | **Proteção de senha vazada (HIBP) desativada + política fraca** (mín. 6, sem complexidade) | advisor `auth_leaked_password_protection`; `auth.js:9` | Ativar HIBP no painel; subir mínimo p/ 8–10 ao migrar login | ⏳ **Toggle manual pendente** (painel Supabase) |
| **S8** | ⚪ | Funções `SECURITY DEFINER` executáveis por anon + 3 com `search_path` mutável | advisors `0011`/`0028`/`0029` | `search_path=''` nas 3 funções; `REVOKE EXECUTE` das 2 funções de push (`notify_*`) de anon/auth/public. `current_user_*`/`enforce_*`/`rls_auto_enable` ficam p/ a Fase 2 (pareiam com a auth nova) | ✅ **Parcial** (DB, 2026-06-11; advisors `0011` zerados + 2 RPC fechadas) |
| **S9** | ⚪ | `relyon_schedules_backup_20260502` (192 linhas) parado (RLS sem policy → não exposto, mas é PII retida) | advisor `rls_enabled_no_policy` | Dropar a tabela de backup quando não for mais necessária | Aberto |
| **S10** | ⚪ | PII em `localStorage` no dispositivo | `config.js` (journal/cache) | Limpar LS no logout; aceitar resíduo necessário p/ offline | Aceito (parcial) |

> **Estado da Fase 2 (transição):** o Marco 1 (login server-side) está em produção, então o
> cliente agora recebe sessão `authenticated`. Após o incidente do dia (ver §7.0), `authenticated`
> tem **o mesmo acesso amplo que `anon`** nas 4 tabelas que o app lê — estado de transição estável,
> **ainda não fecha S1/S2**. O fechamento real é o Marco 2 (apertar a RLS por papel/área). Acompanhe
> o progresso e os próximos passos no **§7.0**.

### 6.10 Cobertura de testes de segurança

*A criar junto da remediação (ainda não escritos):*
- **Testes de RLS (SQL, em branch do Supabase):** para cada tabela, asseverar que a role `anon`
  **não** consegue UPDATE/DELETE após o aperto, e que `authenticated` só enxerga sua área/papel.
- **Vitest (suíte existente, 72 testes):** caso de regressão para `esc()` no gerador de PDF (S4);
  caso garantindo que o objeto de usuário em sessão nunca serializa `password` para a UI.
- **Smoke pós-deploy:** o mesmo probe `curl` desta avaliação, invertido — esperar **HTTP 401/403**
  no UPDATE/DELETE anônimo (vira o critério de "trava travada").

### 6.11 Riscos residuais aceitos

- **Chave anon pública** — inerente a qualquer app Supabase no navegador; a contenção é a RLS, não
  esconder a chave. Aceito por design (depois da Fase 2).
- **PII em localStorage** (S10) — necessária para uso offline/PWA; mitigada por limpeza no logout +
  revogação remota de sessão.
- **Token único no MCP (sem OAuth)** — adequado a uma equipe pequena com um agente confiável;
  OAuth completo é desproporcional agora.

### 6.12 Postura geral e roadmap

**Postura atual: inicial.** Bases sólidas (HTTPS, hash, auditoria de exclusão, revogação de sessão,
portão de versão) sobre uma **lacuna estrutural de autorização**. Roadmap proposto:

- **Fase 1 — Quick wins (baixo risco, sem aprovação especial):** S3 (remover backup exposto),
  S5 (SRI + pin), S6 (headers/CSP report-only), S7 (ativar HIBP), S8 (search_path/revoke),
  S4 (escapar PDF). Não tocam na RLS → não derrubam o app.
- **Fase 2 — Estrutural (exige aprovação + branch do Supabase + rollback):** login server-side
  (Edge Function que valida bcrypt e emite sessão) → migrar para Supabase Auth → ligar a RLS por
  papel/área **já desenhada** nas tabelas vazias → só então **apertar** `app_state`/`relyon_*` para
  `anon`. Testar em preview, validar com smoke probe, e só aí aplicar em produção.
- **Encerramento:** escrever os testes de regressão (§6.10), rerodar o probe (esperar 401/403),
  virar o status do topo para 🟢.

---

## 7. 📐 Plano detalhado da Fase 2 — fechar os 🔴 (S1/S2) sem derrubar o app

> Objetivo: que o banco passe a **saber quem está conectado** e a restringir acesso por pessoa/
> papel/área, de modo que a chave `anon` deixe de poder ler PII/hashes e alterar/apagar dados.
> **Pré-requisito inegociável:** nada disso entra em produção sem rodar antes num **branch do
> Supabase** (cópia isolada) e ter um **plano de rollback** testado. Aprovação do Matheus a cada
> marco. ⚠️ Apertar a RLS *antes* de o cliente autenticar = app em branco para todos.

### 7.0 Progresso

- **Marco 1 — backend: ✅ ao vivo e provado em produção (2026-06-11).**
  - Tabela `relyon_credentials` (hashes) criada **invisível ao anon** (sem policy + REVOKE →
    anon recebe `401`); 92 credenciais semeadas (86 instrutores + 6 usuários, todas bcrypt).
  - Edge Function `login` deployada (`verify_jwt`); valida bcrypt no servidor, provisiona o
    usuário no Supabase Auth e devolve `{ok}`. Testes: senha errada/usuário inexistente →
    `{ok:false}`; senha certa → `{ok:true}` + `signInWithPassword` retornou JWT real. Artefatos
    de teste (sentinela) criados e **removidos** — produção restaurada (verificado).
  - Fonte versionada: `supabase/functions/login/index.ts` + `supabase/migrations/…_credentials.sql`.
- **Marco 1 — cliente: ✅ NO AR** (commit `8efad62`, bundle `app.e1263701.js`, `APP_VERSION 19`,
  verificado em relyon360.vercel.app). `auth.js` chama a função `login` (best-effort, timeout 4s,
  fallback local intacto) antes do `signInWithPassword`. **Seguro:** se a função falhar, o login
  continua pelo caminho atual. (Fase 1 = commit `cfcdb3b`.)
- **🚨 INCIDENTE + HOTFIX (2026-06-11, logo após o deploy).** Reporte: "sumiram todos os
  dados". **Não houve perda** — a sessão `authenticated` (nova) batia em policies de SELECT que
  só liberavam `anon` (`app_state`, `relyon_schedules`, `relyon_notifications`,
  `push_subscriptions`) → o app logava e lia ZERO linhas. Dados intactos (87 instrutores, 61
  treinamentos, 3025 turmas). **Fix instantâneo** (migration `hotfix_grant_authenticated_same_as_anon`):
  `alter policy … to anon, authenticated` em cada policy anon-only — `authenticated` passa a ter o
  mesmo acesso que `anon`. Verificado: leitura autenticada volta a trazer linhas. **Lição:** ao
  ligar Supabase Auth, `authenticated` precisa ter acesso ≥ `anon` em TODAS as tabelas que o app lê
  ANTES do rollout. **Impacto no Marco 2:** o aperto terá de cobrir explicitamente a LEITURA por
  papel/área dessas 4 tabelas — senão repete o "sumiram os dados", agora por área.
- **⏸️ PAUSA DE BAKING (decisão de 2026-06-11).** Marco 1 fica rodando pra a frota autenticar
  antes de avançar. **Monitorar:** `select count(*) from auth.users;` — base 16/~93 no deploy;
  sobe conforme cada um loga com o código novo. Retomar quando estiver perto de ~93.
- **2026-06-19 — relogin forçado pra acelerar o baking.** Checado `auth.users` antes de agir:
  26/93 (~28%) — ainda bem abaixo do alvo. Decisão (Matheus): NÃO fazer o aperto de RLS hoje
  (baking insuficiente, derrubaria acesso pra ~70% da frota); em vez disso, acionar a revogação
  remota de sessão pra empurrar todo mundo pro login novo agora. Aplicado via SQL direto
  (`update app_state set value = jsonb_build_object('ts', ...) where key = 'session_revoke_before'`),
  equivalente ao botão em Sobre. `ts=1781913465411`. Ação é aditiva/reversível (não fecha S1/S2
  por si só). **Próximo passo:** monitorar `select count(*) from auth.users;` subir perto de ~93
  antes de retomar o §8 (Marco 2 / cutover de RLS).
- **2026-06-19 — pré-requisito §8.0 implementado e em produção (commit `a8ef87e`).** `auth.js`
  chama `window.__postLoginRefresh()` após login bem-sucedido (Auth direto, fallback local, e
  troca de senha no 1º acesso); `config.js` ganhou o evento `rl360_refetch_schedules` que
  `useSchedules` escuta para re-buscar a programação pós-login, mais o helper
  `__postLoginRefresh` que encadeia isso com `__revalidateFromSupabase`. Cobre o gap que faria
  a tela ficar vazia pós-login quando a RLS for apertada (mesma classe do incidente 2026-06-11,
  agora em `relyon_schedules`). 88 testes + build esbuild OK antes do push. Re-checado
  `auth.users` no mesmo dia: ainda 26/93 — baking não andou (esperado, levam tempo pra relogar).
  **Itens conscientemente NÃO feitos nesta sessão** (exigem decisão/ação fora do escopo seguro):
  S7 (toggle HIBP — manual, painel Supabase Auth), S9 (DROP da tabela de backup — irreversível,
  pendente confirmação explícita), e o cutover de RLS em si (§8 completo — gated em baking +
  staging + janela com o Matheus presente).
- **Marco 1b — passo final (pendente, NÃO depende de baking): fechar a exposição dos *hashes*.**
  Antes de remover o `password` dos blobs anon (SQL comentado no fim da migration), migrar os
  fluxos que GRAVAM senha (troca de senha, reset de admin, onboarding) pra um caminho server-side
  (Edge Function `set-password`) — a chave anon não escreve em `relyon_credentials`. Senão esses
  fluxos quebram após o strip. Fecha a parte de HASH do S2 (a PII — email/telefone — só fecha no
  Marco 2, que precisa restringir o SELECT do anon).
- **Marco 2 (fecha S1 + leitura de PII do S2): GATED em baking + forçar relogin + branch.** Só
  apertar a RLS (tirar anon de UPDATE/DELETE/INSERT e do SELECT) quando ~toda a frota tiver sessão
  `authenticated` — senão derruba quem está em sessão anônima. Provável: acionar revogação de
  sessões pra empurrar todo mundo pelo login novo, confirmar adoção, aplicar tabela-a-tabela em
  branch do Supabase com rollback, e validar com o probe `curl` (esperar 401/403).
- **🛑 DECISÃO 2026-06-11 — Marco 2 PAUSADO (risco vs. ambiente).** Avaliação concluiu que o
  cutover exige re-arquitetar o boot/login + o **`useSchedules`** (a parte mais frágil do código)
  e um relogin forçado da frota. **Branch do Supabase (ambiente de teste isolado) exige plano Pro
  pago** — sem orçamento. Fazer o aperto free-hand na produção viva, sem staging e logo após o
  incidente do dia, tem risco real de tirar a empresa do acesso. **Recomendação: não fazer o
  cutover agora;** manter os ganhos já no ar (Fase 1 + Marco 1 + hotfix) e tratar **S1 e S2 como
  riscos conhecidos/aceitos** até haver (a) orçamento p/ um cutover testado em staging, ou (b) uma
  janela de manutenção dedicada com a decisão consciente do dono. Receita de fechamento: §7.1–§7.4.

### 7.1 Por que não dá pra "só apertar a RLS hoje"
O cliente só tem a role `anon` porque o login é feito **no navegador** (baixa `relyon_users`/
`relyon_instructors` com os hashes e compara local). Enquanto for assim, qualquer aperto na RLS
quebra o app, porque o banco não distingue um usuário legítimo de um anônimo. Logo, a ordem é
**primeiro dar identidade ao cliente, depois apertar**.

### 7.2 Sequência (cada passo é reversível e testável isolado)

1. **Login server-side (Edge Function `login`).**
   - Recebe `{ usuario, senha }`, lê o registro no servidor (com `service_role`, fora do alcance
     do anon), valida o `bcrypt` server-side e, em caso de sucesso, cria/garante o usuário
     correspondente no **Supabase Auth** e devolve uma **sessão JWT**.
   - Efeito de segurança imediato: **os hashes param de sair do servidor** (mata o vetor de
     cracking offline do S2), sem ainda mexer na RLS.
   - `auth.js` passa a chamar a Edge Function em vez de comparar senha local. O fallback local
     vira caminho de migração (some quando todos tiverem conta Auth).

2. **Migrar os dados pro modelo já desenhado.** As tabelas `users_cliente`, `areas`, `trainings`,
   `locals`, `schedules`, `training_disciplines`, `discipline_allowed_locals` **já existem vazias
   com RLS correta** keyed em `current_user_role()`/`current_user_area_id()`. Popular a partir do
   `app_state`/`relyon_schedules` atuais, ligando cada usuário ao seu `auth_user_id` e à sua área.
   - Risco: divergência de formato (camelCase × snake_case — ver [[feedback_schedules_column_camelcase]]).
     Fazer em branch, comparar contagens, validar com o app em preview.

3. **App lê/escreve autenticado.** Trocar as leituras/escritas de `app_state`/`relyon_schedules`
   pelas tabelas novas, agora sob sessão `authenticated`. Manter um período de **escrita dupla**
   (novo + legado) para permitir rollback sem perda.

4. **Apertar a RLS — só no fim, e em camadas.** Para cada tabela, substituir as policies
   `USING(true)` por policies keyed na sessão:
   - **Leitura:** instrutor só vê o que é dele; planejador/admin vê a sua área; remover `anon`.
   - **Escrita:** `INSERT/UPDATE/DELETE` só para papéis de planejamento, e dentro da própria área.
   - Tirar o `anon` de `app_state`/`relyon_schedules`/`relyon_notifications`/`push_subscriptions`.
   - Reabilitar os SECURITY DEFINER restantes com cuidado (revoke `anon` em `enforce_*`/
     `rls_auto_enable`; manter `authenticated` onde a RLS nova precisar de `current_user_*`).

5. **Endurecer credenciais (S7 + senha).** Ativar HIBP, subir o mínimo de senha p/ 8–10, e
   considerar `bcrypt` cost 10 (agora que o hash não trafega, o custo pode subir sem impacto no UX).

### 7.3 Rollback
- Edge Function e escrita dupla são aditivas → reverter = parar de usá-las (sem perda).
- O aperto de RLS (passo 4) é o único irreversível-em-efeito: aplicar **uma tabela por vez**, com
  o `vercel.json`/policies versionados, e manter à mão o SQL que restaura as policies `USING(true)`
  caso algo quebre. Reverter o `vercel.json` (CLAUDE.md) ressuscita o caminho estático antigo.

### 7.4 Critério de pronto (vira 🟢)
- Probe `curl` com a anon key: `SELECT`/`UPDATE`/`DELETE` em `relyon_users`/`relyon_schedules`
  retornam **401/403** (hoje retornam 200).
- Testes de RLS (SQL) verdes para os 3 papéis; testes vitest de regressão verdes.
- App em produção funcionando autenticado, sem PII/hash acessível por anon.

---

## 8. 🗓️ RUNBOOK do cutover via STAGING GRÁTIS (sessão de fim de semana)

> **Combinado em 2026-06-11:** fechar S1/S2 num fim de semana (janela tranquila), testando antes
> num **2º projeto Supabase GRÁTIS** (staging — `get_cost project` = US$ 0). Sem Pro, sem branch.
> **Escopo deliberadamente enxuto:** o cutover usa o **modelo de transição** — *remover o `anon`*
> das 4 tabelas e manter `authenticated` com acesso amplo. Isso **fecha S1 e S2** (ninguém sem
> login lê/escreve). Restringir por papel/área (o modelo normalizado do §7.2) fica como refino
> FUTURO, não é pré-requisito pra fechar os 🔴.

> **✅ PROGRESSO 2026-07-02 (Fable 5): §8.0, §8.1 e §8.2 EXECUTADOS — staging validado.**
> - **Staging:** projeto free `szxjgyxvtvlydrvyhbhk` (us-east-2, US$ 0), espelho fiel do
>   schema/policies/índices de prod (incl. `relyon_schedules_unique_slot` e realtime), amostra
>   100% sintética (sem PII real; logins `admin.staging` / `instrutor.staging`, senha
>   `staging360`), edge `login` deployada, **APERTO (§8.5) aplicado**.
> - **11 sondas curl OK:** anon SELECT → `200 + []` (dados invisíveis); anon INSERT → 42501
>   (violação de RLS); anon UPDATE/DELETE → 0 linhas afetadas; `relyon_credentials` → 401;
>   login server-side → `ok:true` só com senha certa → JWT → authenticated lê tudo.
>   **⚠️ NOTA que corrige o runbook:** com `alter policy ... to authenticated`, a LEITURA anon
>   NÃO vira 401/403 — vira **lista vazia** (RLS filtra linhas, não erra). Proteção
>   equivalente; o probe de regressão (§6.10/§7.4/§8.3) deve esperar `200 + []` no SELECT
>   e 401/403 só em INSERT/`relyon_credentials`.
> - **App inteiro testado** (bundle esbuild apontando pro staging, servido local): boot anon
>   fail-open → tela de login normal; login fresco de ADMIN → dashboard popula (turma do dia
>   + instrutores); login fresco de INSTRUTOR → agenda do dia popula (prova exigente: depende
>   de `user.id`). Zero erros de console. Receita: copiar o repo pra pasta temporária, trocar
>   `SUPABASE_URL`/`SUPABASE_KEY` no config.js da cópia, `node build.mjs`, servir `dist/` com
>   `serve-smoke.mjs`, logar com os usuários acima.
> - **2 fixes de cliente saíram desta validação** (js/auth.js + js/config.js, **commit/push
>   ANTES do cutover**): (1) o fluxo de 1ª senha (`ChangePasswordScreen`) agora chama
>   `__postLoginRefresh` (re-fetcha schedules, não só app_state); (2) o login fresco AGUARDA o
>   refetch e re-localiza o cadastro quando o boot anon veio vazio — sem isso, TODO relogin do
>   cutover entraria "degradado" (sem `id`/`base`/`permissions`: quebra dashboard de instrutor
>   e gates de CS/DP) até um F5. `_revalidateFromSupabase` passou a retornar os dados frescos.
> - **Falta só o §8.3** (produção). Staging pode ser pausado/apagado depois do cutover.

### 8.0 Pré-requisito de código (o passo que faltou hoje): cliente "carrega DEPOIS de autenticar"
Hoje o `AppLoader` lê `app_state`/`relyon_schedules` como `anon` no **boot, antes do login**. Se o
`anon` perder o SELECT, o boot vem vazio. Por isso, ANTES de apertar a RLS:
- **`auth.js`** — após `signInWithPassword` dar certo, chamar `await window.__revalidateFromSupabase()`
  (re-busca `app_state` já autenticado) **e** disparar um refetch de schedules.
- **`config.js` / `useSchedules`** — hoje só carrega no boot. Adicionar um listener de evento
  (ex.: `rl360_refetch_schedules`) que re-roda o load; `__revalidateFromSupabase` (ou o handle de
  login) dispara esse evento. (Espelhar o padrão do `_REVALIDATE_EVENT` que o `usePersisted` já usa.)
- Resultado: depois do login a tela popula sob a sessão `authenticated`, independente do boot anon.
- **Testar local** com `node build.mjs` + servir, apontando pro STAGING (ver 8.2). NÃO mexer no
  `useSchedules` sem teste — é a parte mais frágil do código.

### 8.1 Subir o staging grátis (isolado, US$ 0)
1. `create_project` (org `tlwaurjkyptgwxetdopv`, free). Guardar o novo `project_id`/URL/anon key.
2. Recriar SÓ o que o app usa (o branch falharia porque `app_state` não está em migration; aqui a
   gente cria na mão): tabelas **`app_state`, `relyon_schedules`, `relyon_notifications`,
   `push_subscriptions`, `relyon_credentials`** + RLS (copiar as policies atuais de prod via
   `pg_dump`/introspecção) + a função/trigger `login`/credenciais conforme necessário.
3. Semear uma **amostra pequena** (poucos users/instrutores/turmas + credenciais) — não copiar a
   base inteira (evita PII desnecessária no staging).
4. Deployar a Edge Function `login` no staging (mesma fonte `supabase/functions/login`).

### 8.2 Testar o fluxo inteiro no staging
1. Build de preview apontando pro staging: trocar `SUPABASE_URL`/`SUPABASE_KEY` (em `config.js`
   **e** `agents/mcp/src/constants.ts` não — só o front) por uma variante de staging e `node build.mjs`.
   Servir `dist/` local (há `serve-smoke.mjs` de referência).
2. Aplicar o **aperto (8.5)** no staging.
3. Exercitar: login → dashboard popula → criar/editar/excluir turma → todas as telas. Validar:
   - `curl` anon no staging em `app_state`/`relyon_schedules` → **401/403**.
   - `curl` com JWT autenticado → **200 + linhas**.
4. Só avançar pra produção quando o preview rodar limpo contra o staging apertado.

### 8.3 Cutover em PRODUÇÃO (janela tranquila, você presente)
1. **Push** do código do 8.0 (client load-after-auth) → confirmar no ar (`APP_VERSION +1`).
2. **Forçar relogin** (botão "revogar sessões" em Sobre) → todos caem no login novo → viram
   `authenticated`. Confirmar adoção: `select count(*) from auth.users;` perto do total (~93).
3. Aplicar o **aperto (8.5)** em produção (migration). **Reversível em segundos** (rollback 8.5).
4. **Verificar na hora:** `curl` anon → 401/403; abrir o app logado e checar dashboard/turmas.
5. Se QUALQUER coisa quebrar → rodar o **ROLLBACK (8.5)** imediatamente (volta `anon` e tudo
   funciona como antes). Investigar com calma depois.

### 8.4 Pós-cutover (fecha o resto)
- Com `anon` sem SELECT, os **hashes no blob** já ficam invisíveis → **S2 fechado** (o strip do
  blob vira limpeza opcional). **S1 fechado** (anon não escreve).
- Endurecer credenciais (S7: HIBP + min 8–10). Refino futuro: RLS por papel/área (§7.2).
- Virar o status do topo pra 🟢 e rodar o probe `curl` como teste de regressão (§6.10).

### 8.5 SQL pronto — APERTO e ROLLBACK (modelo de transição: tira anon, mantém authenticated)

```sql
-- ░░ APERTO ░░ (fecha S1+S2 — rodar como migration no cutover; preserva as cláusulas USING/CHECK)
alter policy app_state_select            on public.app_state          to authenticated;
alter policy app_state_insert            on public.app_state          to authenticated;
alter policy app_state_update            on public.app_state          to authenticated;
alter policy app_state_delete            on public.app_state          to authenticated;
alter policy relyon_schedules_select     on public.relyon_schedules   to authenticated;
alter policy relyon_schedules_anon_insert on public.relyon_schedules  to authenticated;
alter policy relyon_schedules_anon_update on public.relyon_schedules  to authenticated;
alter policy relyon_schedules_anon_delete on public.relyon_schedules  to authenticated;
alter policy relyon_notifications_select on public.relyon_notifications to authenticated;
alter policy relyon_notifications_insert on public.relyon_notifications to authenticated;
alter policy relyon_notifications_update on public.relyon_notifications to authenticated;
alter policy relyon_notifications_delete on public.relyon_notifications to authenticated;
alter policy push_sub_anon_select        on public.push_subscriptions to authenticated;
alter policy push_sub_anon_insert        on public.push_subscriptions to authenticated;
alter policy push_sub_anon_update        on public.push_subscriptions to authenticated;
alter policy push_sub_anon_delete        on public.push_subscriptions to authenticated;
```

```sql
-- ░░ ROLLBACK ░░ (volta tudo a anon+authenticated = estado de hoje; reversão instantânea)
alter policy app_state_select            on public.app_state          to anon, authenticated;
alter policy app_state_insert            on public.app_state          to anon, authenticated;
alter policy app_state_update            on public.app_state          to anon, authenticated;
alter policy app_state_delete            on public.app_state          to anon, authenticated;
alter policy relyon_schedules_select     on public.relyon_schedules   to anon, authenticated;
alter policy relyon_schedules_anon_insert on public.relyon_schedules  to anon, authenticated;
alter policy relyon_schedules_anon_update on public.relyon_schedules  to anon, authenticated;
alter policy relyon_schedules_anon_delete on public.relyon_schedules  to anon, authenticated;
alter policy relyon_notifications_select on public.relyon_notifications to anon, authenticated;
alter policy relyon_notifications_insert on public.relyon_notifications to anon, authenticated;
alter policy relyon_notifications_update on public.relyon_notifications to anon, authenticated;
alter policy relyon_notifications_delete on public.relyon_notifications to anon, authenticated;
alter policy push_sub_anon_select        on public.push_subscriptions to anon, authenticated;
alter policy push_sub_anon_insert        on public.push_subscriptions to anon, authenticated;
alter policy push_sub_anon_update        on public.push_subscriptions to anon, authenticated;
alter policy push_sub_anon_delete        on public.push_subscriptions to anon, authenticated;
```

> ⚠️ **Efeitos colaterais conhecidos do aperto** (aceitáveis, documentados): o portão de versão
> (`_publishVersion`) e o portão de sessão rodam no boot **pré-login como anon** → passam a falhar
> (fail-open, não travam o boot); voltam a funcionar pós-login (authenticated). A Edge Function
> `login` usa `service_role` e **não** é afetada. Boot pré-login mostra a tela de login (sem dados,
> ok). Por isso o 8.0 (carregar pós-auth) é obrigatório ANTES do aperto.

---

*Gatilho registrado em 2026-06-10, junto com a remoção do sistema de ciência. Para o redesenho
da confirmação do instrutor, ver `DESIGN.md §18.3`. Avaliação executada e Fase 1 + Marco 1
aplicados em 2026-06-11; Marco 2 (cutover) PAUSADO → runbook do staging grátis no §8 p/ o fim de
semana.*
