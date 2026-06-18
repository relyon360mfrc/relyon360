# ACESSO.md — Modelo de Usuários e Níveis de Acesso (RelyOn 360)

> **Fonte de verdade** do modelo de acesso do app: quem é cada papel, o que cada um vê/faz, e
> qual dado cada um *deveria* poder ler. Serve também de **especificação** para apertar a
> segurança do banco (ver `SEGURANCA.md`).
>
> **Status:** 🟢 **Fase A (modelo de papéis na UI) IMPLEMENTADA** em 2026-06-18 (APP_VERSION 31;
> build esbuild + 88 testes + smoke no navegador OK). 🟠 **Fase B (autorização no banco / RLS)
> ADIADA** para a sessão de segurança do fim de semana (ver `SEGURANCA.md §8`).
> Documento criado na Fase 0; o que a Fase A entregou está em §9.

---

## 1. As duas camadas de acesso (leia isto primeiro)

"Nível de acesso" no RelyOn vive em **duas camadas diferentes**. Confundi-las é o maior risco.

| | **Camada A — Modelo de papéis (UI)** | **Camada B — Autorização no banco (RLS)** |
|---|---|---|
| O que é | Quem é cada papel e o que vê/faz na tela | A trava real do que sai do banco |
| Onde mora | `js/` (front-end React) | Supabase (policies de RLS) |
| Estado hoje | **Cosmético** — só esconde itens do menu | **Destravada** — qualquer um lê/altera tudo |
| Protege dado? | ❌ **Não** (o dado já está no navegador) | ✅ **Sim** (é a única que protege) |
| Risco de mexer | Baixo (não derruba o app) | **Alto** (apertar errado deixa o app em branco p/ todos) |

> ⚠️ **Em linguagem simples:** organizar os papéis (Camada A) deixa o app claro e correto, mas
> **sozinho NÃO impede vazamento de dados**. Hoje o app baixa *todos* os dados pro navegador no
> login (PII de instrutores, hashes de senha, atestados), independente do papel — esconder o
> menu não tira o dado de lá. Quem impede vazamento é a Camada B (RLS), hoje **aberta**
> (achados **S1/S2** do `SEGURANCA.md`). O fechamento real depende da Camada B.

---

## 2. Glossário: "usuário do sistema" × "cliente"

- **Usuário do sistema** — trabalha *dentro* do app. Cadastrado em `relyon_users`. Papéis:
  `developer`, `admin`, `planejador`, `customer_service`. Login = objeto `{...row de relyon_users}`;
  vínculo opcional a um instrutor via `user.linkedInstructorId`.
- **Cliente** — *consome* informação, não opera o app. Hoje é só o **instrutor**. É uma entidade
  separada (`relyon_instructors`), não um `relyon_user`. Ao logar, vira
  `user = { ...instr, role: "instructor" }` → identifica-se por **`user.id`** (não existe
  `user.instructorId`).

---

## 3. Inventário de papéis (estado atual verificado)

| Papel | Tipo | Escopo de base | Onde é definido |
|-------|------|----------------|-----------------|
| `developer` | usuário-sistema | todas | `canAdmin` — `js/constants.js:225` |
| `admin` | usuário-sistema | todas | `canAdmin` |
| `planejador` | usuário-sistema | 1 base (`user.base`) | `canPlan` + `hasPermission` — `js/constants.js:226,229` |
| `customer_service` | usuário-sistema | 1 base | permissões (`hasPermission`) — default-deny |
| `DP` (Departamento Pessoal) | usuário-sistema | todas (folha é company-wide) | permissões (`hasPermission`) — **somente leitura**, default-deny |
| `instructor` | **cliente** | própria | `isInstr` — `js/auth.js:270` |

**Helpers de papel (sempre usar, nunca comparar `role` direto):**
- `canAdmin(u)` = `developer | admin` (acesso de gestão).
- `canPlan(u)` = `canAdmin(u) | planejador` (acesso de planejamento).
- `hasPermission(u, permId)` = admin/dev têm tudo; planejador precisa do `permId` em `permissions[]`.

**Permissões granulares do planejador** (`PERMISSIONS_LIST`, `js/constants.js:176`):

| Grupo | Permissões |
|-------|------------|
| Planejamento | `plan_view`, `plan_edit`, `events_turmas`, `events_manut`, `events_desenv` |
| Configuração | `skills_edit`, `locals_edit`, `train_edit`, `instr_view` |
| Relatórios | `reports`, `ai` |

---

## 4. Matriz Papel × Tela (o que cada um vê hoje)

Fonte: navegação em `js/auth.js:548+`. ✅ = vê · ⚙️ = depende de permissão do planejador · ❌ = não vê.

| Tela | developer | admin | planejador | customer_service | instructor |
|------|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ | ❌ | ✅ (visão instrutor) |
| Programação (Base/InCompany/EAD/Offshore/Lote) | ✅ | ✅ | ✅ | ❌ | ❌ |
| IA — Sugerir Escala | ✅ | ✅ | ⚙️ `ai` | ❌ | ❌ |
| Linha do Tempo | ✅ | ✅ | ✅ | ❌ | ❌ |
| Relatórios (Financeiro / KPI) | ✅ | ✅ | ⚙️ `reports` | ⚠️ **abre a página inteira** | ❌ |
| Instrutores / Locais / Treinamentos / Áreas | ✅ | ✅ | ✅ | ❌ | ❌ |
| Clientes Offshore | ✅ | ✅ | ❌ | ❌ | ❌ |
| Usuários | ✅ | ✅ | ❌ | ❌ | ❌ |
| Absenteísmo / Feriados | ✅ | ✅ | ❌ | ❌ | ❌ |
| Comunicação | ✅ | ✅ | ✅ | ❌ | ✅ |
| Meu Histórico / Meu Perfil | ❌ | ❌ | ❌ | ❌ | ✅ |
| Sobre | ✅ | ✅ | ✅ | ✅ | ✅ |

> ⚠️ **Atenção (lacuna conhecida):** esta matriz descreve o **menu**. As **telas em si não são
> bloqueadas por papel** — o roteador (`js/app.js:133`) renderiza qualquer página que `active`
> apontar. Esconder o item do menu não impede chegar na tela por outro caminho. Ver §6.

---

## 5. Matriz Papel × Dado (alvo PROPOSTO — a confirmar)

O que cada papel *deveria* poder **ler** (princípio do menor privilégio). Esta é a **spec** da
RLS por papel/área da Fase B-refino. ✅ = pode ler · 🔸 = só da sua base/área · 👤 = só o próprio ·
❌ = não · **(P)** = proposta a confirmar na §7.

| Dado (sensibilidade LGPD) | developer | admin | planejador | customer_service | instructor |
|---|:---:|:---:|:---:|:---:|:---:|
| `relyon_users` — **hash de senha** | ❌ *(ninguém via app)* | ❌ | ❌ | ❌ | ❌ |
| `relyon_users` — nome/e-mail/papel | ✅ | ✅ | ❌ **(P)** | ❌ | ❌ |
| `relyon_instructors` — PII (nome, e-mail, tel., cidade) | ✅ | ✅ | 🔸 **(P)** | 🔸 limitado **(P)** | 👤 |
| `relyon_instructors` — hash de senha | ❌ | ❌ | ❌ | ❌ | ❌ |
| `relyon_absences` — **atestado/saúde/disciplinar** (sensível) | ✅ | ✅ | 🔸 **(P)** | ❌ **(P)** | 👤 |
| `relyon_schedules` — programação | ✅ | ✅ | 🔸 | 🔸 turmas **(P)** | 👤 (suas turmas) |
| Relatórios financeiros / bônus CLT | ✅ | ✅ | ⚙️ `reports` | ❌ **(P)** | 👤 (próprio extrato) |
| Treinamentos / Locais / Áreas / Feriados | ✅ | ✅ | ✅ | 🔸 leitura **(P)** | ❌ |

> Hoje **nenhuma** dessas restrições existe no banco: a role efetiva é sempre `anon`/`authenticated`
> e lê **tudo**. Esta tabela é o destino, não o presente. Ver `SEGURANCA.md §6.4`.

---

## 6. Lacunas conhecidas (o que "organizar" precisa endereçar)

**Camada A (UI):**
1. **`customer_service` vaza a `ReportsPage` inteira.** O menu "Relatórios Turmas" aponta para a
   página `reports` (`js/auth.js:583`), que abre financeiro/bônus/utilização — não uma visão
   restrita a turmas.
2. **Telas não bloqueadas por papel — só o menu** (`js/app.js:133`). `setActive("users")` direto
   renderiza a tela de Usuários para qualquer papel.
3. **Permissões "fantasma":** itens do `PERMISSIONS_LIST` declarados mas possivelmente não
   aplicados (ex.: `plan_view` ignorado — o menu usa `isAdm || isPlan`; `events_*` a auditar).
4. **Definição de papéis espalhada** (inline no `<Sel>` de `js/admin.js:131`, `ROLE_LABELS`,
   helpers) — sem uma constante única (`ROLE_DEFS`).

**Camada B (banco) — ver `SEGURANCA.md`:**
5. **S1/S2 (🔴 abertos):** leitura/escrita anônima total. Marco 1 (login server-side) no ar;
   Marco 2 (apertar RLS) **pausado** — runbook de staging grátis no `SEGURANCA.md §8`.
6. **Todo dado entra no cliente no boot**, independente do papel — minimização real por papel
   depende da Camada B.

---

## 7. Decisões em aberto (resolver antes de executar Fase A/B)

1. **Conjunto de papéis:** manter os 5 atuais, ou criar papel(éis) novo(s) — ex.: "somente
   leitura/consulta", "coordenador de base", "RH"?
2. **Escopo do `customer_service`:** quais abas de relatório ele vê (só turmas? inclui utilização?
   nunca financeiro/CLT)? Reflete-se nas células **(P)** da §5.
3. **Ordem de execução:** Fase A (UI, segura) agora e Fase B (banco) como projeto separado com
   janela dedicada? (recomendado.)
4. **Staging da Fase B:** usar o staging grátis (`SEGURANCA.md §8.1`) ou janela de manutenção?

---

## 8. Relação com outros documentos

- **`SEGURANCA.md`** — achados de segurança (S1–S10), modelo de auth, e o **runbook do cutover**
  da Camada B (§7/§8). Este `ACESSO.md` descreve o **modelo desejado**; o `SEGURANCA.md` descreve
  **como e quando** apertar o banco com segurança.
- **`CLAUDE.md` → "Modelo de Acesso"** — resumo de uma linha; este arquivo é a versão detalhada.
- **`DESIGN.md §18`** — decisões técnicas de autorização/RLS.

---

## 9. Fase A — o que foi implementado (2026-06-18, APP_VERSION 31)

> ⚠️ A Fase A organiza e endurece a **UI/cliente**. Ela **NÃO** fecha S1/S2 (leitura/escrita anônima
> no banco) — isso é a Fase B (`SEGURANCA.md §8`), adiada para a sessão de segurança do fim de semana.

- **Novo papel `DP` (Departamento Pessoal) — somente leitura.** Não cria, edita nem exclui.
- **`customer_service` e `DP` agora dirigidos por `permissions[]`** (checkbox na tela de Usuários,
  **default-deny**), como o planejador. `PERMISSIONED_ROLES` + `permissionsForRole(role)` em
  `constants.js` filtram quais permissões cada papel pode receber (o DP nunca recebe permissão de edição).
- **Permissão `reports` legada dividida** em `reports_operacional` (KPI/turmas) e
  `reports_financeiro` (folha/pagamento). **Gate por aba** em `reports.js` via `REPORT_TAB_PERM` +
  `canSeeReportTab` — impede o CS ver as abas de pagamento (Freelancer a Receber, Extrato por
  Instrutor, Bônus) que moram na página de KPI.
- **Bloqueio no roteador:** `canSeePage(user, pageId)` (`constants.js`) usado em `js/app.js` bloqueia
  a renderização da página por papel/permissão — não dá mais para "pular" o menu via `setActive`.
- **Botões de escrita protegidos:** "Excluir" e "Novo Instrutor" (`instructors.js`) agora exigem
  `canPlan` (antes eram ungated; o DP somente-leitura conseguiria gravar).
- **Migração (AppLoader):** planejadores com `reports` legado recebem as duas novas permissões; os
  `customer_service` atuais recebem `reports_operacional` (mantêm o acesso de turmas). Roda uma vez
  (`_permV2`); default-deny preservado depois disso.
- **Verificado:** build esbuild, 88 testes vitest, e matriz de acesso (30+ asserções) provada no
  navegador — CS não alcança pagamento/edição; DP é somente leitura; default-deny funciona.

### 9.1 Detalhes/UX menores a observar
- **DP** vê todas as bases (folha é company-wide) — sem seletor de base.
- O **Dashboard** ainda mostra atalhos `locals-report`/`issues` para CS/DP; clicar cai no Dashboard
  (o roteador bloqueia) — não vaza dado, é só um clique sem efeito. Refino futuro opcional.
- `?v=acesso1` foi bumpado nos `js/*` alterados (caminho babel/dev/rollback). Produção usa o bundle
  hasheado do esbuild (deploy via commit+push → Vercel).
