# SEGURANCA.md — Segurança da Informação & dos Dados (RelyOn 360)

> Documento dedicado, com dois objetivos:
> 1. **Gatilho/Prompt** para o **Fable 5** rodar uma avaliação de segurança completa, propor e
>    implementar melhorias e criar testes que mantenham o sistema seguro ao longo do tempo.
> 2. Abrigar o **Relatório do estado atual** da arquitetura de segurança — material para
>    **apresentar à empresa**.
>
> **Status:** 🟡 Prompt registrado · avaliação **ainda NÃO executada**. (criado em 2026-06-10)
> Quando a avaliação rodar, preencher o §6 e virar o status para 🟢.

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
*[a preencher — 1 parágrafo: postura geral, principais riscos endereçados, nível de maturidade]*

### 6.2 Inventário e classificação de dados
*[a preencher — quais dados pessoais/sensíveis existem, onde residem (Supabase/LS), volume]*

### 6.3 Modelo de autenticação
*[a preencher — como usuários e instrutores autenticam; senhas (bcrypt cost); sessão; revogação]*

### 6.4 Modelo de autorização (RLS)
*[a preencher — por tabela, o que cada role pode fazer; como a chave anon é contida]*

### 6.5 Gestão de segredos
*[a preencher — chaves no cliente vs. servidor; token MCP; rotação]*

### 6.6 Transporte, repouso e dispositivo
*[a preencher — TLS, criptografia em repouso, headers de segurança, dados no localStorage]*

### 6.7 LGPD / privacidade
*[a preencher — bases legais, retenção, minimização, direitos do titular, Privacidade Dashboard]*

### 6.8 Modelo de ameaças
*[a preencher — atores (anon externo, instrutor, planejador, admin), superfícies, cenários]*

### 6.9 Achados e remediações
*[a preencher — tabela: ID · severidade · descrição · evidência · status · correção]*

### 6.10 Cobertura de testes de segurança
*[a preencher — testes vitest + testes de RLS/policy que protegem cada correção]*

### 6.11 Riscos residuais aceitos
*[a preencher — o que foi conscientemente não-corrigido e por quê]*

### 6.12 Postura geral e roadmap
*[a preencher — resumo do nível atual + próximos passos]*

---

*Gatilho registrado em 2026-06-10, junto com a remoção do sistema de ciência. Para o redesenho
da confirmação do instrutor, ver `DESIGN.md §18.3`.*
