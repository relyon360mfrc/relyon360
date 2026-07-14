# Relatório de Segurança da Informação — RelyOn 360 Scheduler

**Aplicação:** RelyOn 360 — Sistema de Planejamento de Treinamentos (RelyOn Nutec)
**Ambiente avaliado:** Produção (https://relyon360.vercel.app)
**Data da avaliação inicial:** 11/06/2026 · **Fechamento do controle crítico:** 14/07/2026
**Classificação de maturidade atual:** 🟢 **Adequada** — os controles de segurança críticos estão
**ativos em produção**. O fechamento do acesso anônimo à base foi ativado em 14/07/2026, com testes
automatizados aprovados em ambiente-espelho e em produção e verificação de campo no dia seguinte.

> **Como ler este documento.** Ele foi escrito para dois públicos ao mesmo tempo:
> - **Gestão / leitura executiva (não técnica):** seções **1 a 9** respondem "o app é seguro?" em
>   linguagem simples, com analogias. Se você não é da área técnica, leia só essa parte.
> - **Especialistas / auditoria técnica:** o **Anexo A** traz o detalhamento (mecânica dos achados,
>   remediação, evidências de verificação com códigos de resposta, riscos residuais e alertas
>   automáticos do banco). O **Anexo B** é um glossário e o **Anexo C**, a cronologia. O documento
>   de trabalho `SEGURANCA.md` (no repositório) contém o SQL de aperto/rollback e o runbook completo.

---

## 1. Sumário executivo — "O aplicativo é seguro?"

**Sim. O aplicativo aplica os controles essenciais de segurança da informação e o principal risco
identificado na avaliação já foi corrigido e verificado em produção.** Hoje o sistema garante:

- **Toda a comunicação é criptografada** (HTTPS/TLS ponta a ponta).
- **O acesso aos dados exige login.** Ninguém sem estar autenticado lê ou altera a base — nem
  mesmo alguém de posse da chave pública que todo aplicativo web embute no navegador.
- **As senhas são cifradas** (algoritmo bcrypt), nunca em texto legível, e a verificação acontece
  **no servidor**, não no navegador.
- **Há trilha de auditoria** para exclusões (motivo + autor) e **capacidade de revogar sessões
  remotamente** em caso de suspeita de comprometimento.
- **Cabeçalhos de segurança, integridade de dependências e proteção contra injeção** aplicados.

**O principal achado e seu desfecho.** A avaliação de junho/2026 identificou que a base de dados
podia ser lida e alterada **sem login** — uma fragilidade estrutural séria. A correção definitiva
(exigir autenticação no banco) foi construída, testada em ambiente isolado e pilotada em produção
em 02/07. O piloto revelou que faltava um ajuste no aplicativo — garantir que **toda** sessão de
usuário fosse reconhecida como autenticada, inclusive nos reenvios automáticos em segundo plano — e
a correção foi prudentemente recuada, **sem qualquer perda de dados**. Esse ajuste foi concluído e o
fechamento foi **reativado em definitivo em 14/07/2026**, com bateria de testes aprovada em ambiente
isolado e em produção, e confirmação com a equipe real trabalhando na manhã seguinte.

**Analogia para leitura não técnica:** a "fechadura" nova foi instalada, testada e trancada. No
primeiro teste no dia a dia percebeu-se que algumas cópias da chave (as sessões de cada usuário)
precisavam ser recadastradas antes de trancar de vez — senão haveria risco de trancar alguém do
lado de fora. As chaves foram recadastradas para 100% da equipe, a porta foi trancada, e testou-se
que quem tem chave entra e quem não tem fica de fora. **A porta está trancada.**

---

## 2. Escopo e metodologia

| Item | Detalhe |
|------|---------|
| **Sistema** | Aplicação web (PWA) React, backend Supabase (PostgreSQL gerenciado + API PostgREST + autenticação GoTrue + funções Edge), hospedagem Vercel |
| **Método** | Revisão de código-fonte + inspeção da configuração do banco (políticas de acesso RLS, funções, _advisors_ de segurança) + **teste empírico** (requisições reais simulando um atacante externo, com a chave pública) |
| **Padrões de referência** | Boas práticas OWASP (controle de acesso quebrado, XSS, cabeçalhos, exposição de dados sensíveis), princípios da LGPD (confidencialidade, minimização, direitos do titular) |
| **Ambiente de teste** | O cutover de correção foi validado num **projeto-espelho isolado** (banco Supabase separado) antes e depois de produção — zero risco para os dados reais durante os testes |
| **Plano de reversão** | Toda alteração estrutural teve _rollback_ testado e reversível em segundos, aplicado quando necessário |

A avaliação foi conduzida em duas frentes: correções de baixo risco aplicadas de imediato, e a
correção estrutural (autenticação + autorização) executada de forma faseada e reversível.

---

## 3. Inventário de dados e classificação (LGPD)

| Categoria de dado | Volume | Sensibilidade |
|-------------------|:------:|---------------|
| Instrutores (nome, e-mail, telefone, cidade/UF, contrato, competências) | 94 (88 ativos) | Alta — dado pessoal |
| Usuários do sistema (nome, e-mail, papel) | 9 | Alta — dado pessoal |
| **Ausências (atestado médico, licença, suspensão, férias)** | 134 | **Sensível** — saúde/disciplinar (LGPD Art. 5º, II) |
| Programação de turmas (turma, módulo, local, instrutor) | 5.717 | Média — operacional |
| Notificações / assinaturas de push | 2.905 / 47 | Baixa/Média |

Não há tratamento de CPF nem de dados nominais de alunos (as turmas registram apenas a contagem
de participantes). A categoria de maior sensibilidade são as **ausências por motivo de saúde**,
que hoje estão protegidas por autenticação obrigatória (ver §5).

---

## 4. Controles de segurança implementados

| Domínio | Controle | Status |
|---------|----------|:------:|
| **Transporte** | TLS/HTTPS ponta a ponta (Supabase + Vercel) | ✅ |
| **Autenticação** | Login validado **no servidor** (Edge Function), sessão via Supabase Auth (JWT) | ✅ |
| **Senhas** | Hash bcrypt; verificação server-side; credenciais em tabela dedicada fora do alcance anônimo; troca obrigatória no 1º acesso | ✅ |
| **Autorização** | Acesso ao banco **exige sessão autenticada** — o papel anônimo não lê nem escreve | ✅ |
| **Resiliência de sessão** | O cliente renova a sessão antes de cada gravação e **nunca grava de forma anônima** — em falta de sessão, retém e pede novo login (sem perda) | ✅ |
| **Cabeçalhos de segurança** | HSTS, X-Frame-Options (DENY), X-Content-Type-Options, Referrer-Policy, Permissions-Policy | ✅ |
| **Integridade de dependências** | Scripts externos (CDN) com _Subresource Integrity_ (SRI) e versões fixadas | ✅ |
| **Proteção contra XSS** | React escapa por padrão; geradores de PDF sanitizam entrada do usuário | ✅ |
| **Auditoria** | Exclusões registram motivo + autor; log de aprovações em solicitações | ✅ |
| **Gestão de sessão** | Revogação remota de todas as sessões; portão de versão (força atualização da frota) | ✅ |
| **Isolamento de segredos** | Chave administrativa (service_role) nunca exposta no navegador; segredos em variáveis de ambiente | ✅ |
| **Cache/Offline** | Service Worker não faz cache de dados do banco (evita envenenamento de cache) | ✅ |

---

## 5. A correção central: de "aberto" para "trancado"

**O achado mais importante da avaliação (junho/2026):** a base de dados usava regras de acesso
permissivas para o papel "anônimo". Como toda aplicação web Supabase embute uma chave pública no
navegador, isso significava que **qualquer pessoa na internet, de posse dessa chave pública, podia
ler toda a base (incluindo dados pessoais e ausências de saúde) e alterar ou apagar registros — sem
login.** Foi comprovado empiricamente durante a avaliação.

**Causa-raiz:** o login acontecia dentro do navegador, então o banco de dados nunca sabia "quem"
estava conectado — a sessão era sempre "anônima" — e por isso não conseguia restringir o acesso por
pessoa.

**A correção, em três partes:**
1. **Login no servidor.** A validação de senha foi movida para uma função no servidor (Edge
   Function), que confere o hash bcrypt com uma credencial que o navegador não consegue ler, e
   emite uma **sessão autenticada real** (token JWT). ✅ Em produção.
2. **Resiliência de sessão no aplicativo.** O app passou a **validar e renovar a sessão antes de
   cada gravação**, inclusive nos reenvios automáticos em segundo plano; sem sessão válida, ele
   **retém a gravação e pede novo login**, em vez de tentar gravar de forma anônima. Este era o
   ajuste que faltava no piloto de 02/07. ✅ Em produção (14/07).
3. **Fechamento do banco.** As regras de acesso foram **fechadas para o papel anônimo** nas tabelas
   do aplicativo, mantendo o acesso para usuários autenticados. ✅ Ativado em produção (14/07).

**Linha do tempo do fechamento:**
- **02/07 — construído, testado em ambiente-espelho, pilotado em produção e recuado.** No piloto,
  parte das gravações chegava ao banco ainda como "anônima" (reenvio após o token expirar; login que
  caía na verificação local) e era barrada pela nova regra. Para não afetar o trabalho da equipe, o
  fechamento foi **imediatamente revertido** — reversão instantânea, testada, **sem perda de dados**
  (a base permaneceu íntegra o tempo todo).
- **14/07 — pré-requisitos concluídos e fechamento reativado.** Implementada a resiliência de sessão
  (parte 2), semeadas as credenciais de login para **100% da base ativa**, revalidado o cutover no
  ambiente-espelho e reaplicado em produção. **Testes aprovados integralmente** (Anexo A): visitante
  anônimo → leitura vazia e escrita bloqueada; usuário autenticado → leitura e escrita normais,
  inclusive após renovação do token; conta de teste removida sem resíduo. Na manhã seguinte, a
  operação foi confirmada com a equipe real em uso (dezenas de logins, leitura e gravação normais).

> **Nota de transparência.** Este relatório foi mantido fiel ao estado real em cada fase: o piloto de
> 02/07 constou como recuado enquanto esteve recuado, e o fechamento só passou a constar como
> concluído após a reativação **verificada** de 14/07/2026.

---

## 6. Histórico de achados e remediações

A transparência sobre o que foi encontrado e corrigido demonstra a diligência do processo.

| ID | Severidade | Achado | Situação |
|----|:----------:|--------|----------|
| S1 | 🔴 Crítico | Escrita anônima na base (sem login) | ✅ **Corrigido** — fechamento ativado em 14/07/2026, testes aprovados |
| S2 | 🔴 Crítico | Leitura anônima de dados pessoais e senhas cifradas | ✅ **Corrigido** — fechamento ativado em 14/07/2026, testes aprovados |
| S3 | 🟠 Alto | Cópia de backup com dados pessoais acessível | ✅ Corrigido (removido) |
| S4 | 🟡 Médio | Possível injeção de script em nome de turma no PDF | ✅ Corrigido (sanitização) |
| S5 | 🟡 Médio | Scripts externos sem verificação de integridade | ✅ Corrigido (SRI + versão fixa) |
| S6 | 🟡 Médio | Ausência de cabeçalhos de segurança HTTP | ✅ Corrigido |
| S7 | 🟡 Médio | Verificação de senha vazada (HIBP) desativada | 🔒 Indisponível no plano atual da plataforma (recurso do plano pago); reavaliar em eventual _upgrade_ |
| S8 | ⚪ Baixo | Funções internas com exposição desnecessária | ✅ Corrigido |
| S9 | ⚪ Baixo | Backups com dados pessoais retidos | ✅ Corrigido (removidos) |

**Resumo:** dos 9 achados, **8 estão corrigidos** — incluindo os **2 críticos (S1/S2)**, fechados em
produção em 14/07/2026 com testes aprovados (ver §5 e Anexo A). O único item restante (S7) é uma
melhoria incremental de política de senha cujo recurso é **exclusivo do plano pago** da plataforma —
documentado para reavaliação em eventual _upgrade_, sem impacto sobre os controles críticos.

---

## 7. Riscos residuais (baixa severidade — sem exposição externa)

Nenhum sistema é 100% livre de risco. É importante enquadrar corretamente os itens abaixo:
**nenhum deles representa acesso por pessoas não autenticadas** — a exposição a terceiros/à internet
está fechada (§5). São refinamentos de defesa-em-profundidade e higiene, típicos da evolução de
qualquer sistema saudável.

1. **Reforço de menor-privilégio no próprio banco (defesa-em-profundidade).** O acesso aos dados
   exige login; a partir daí, a separação do que cada perfil (planejador, instrutor, etc.) pode ver
   e fazer é aplicada pela **aplicação**. O banco ainda não replica essa mesma separação como uma
   segunda camada independente — é o chamado "modelo de transição" (qualquer sessão autenticada da
   equipe acessa as tabelas do app). Na prática: a proteção contra terceiros não autenticados está
   **completa**; o que resta é acrescentar uma **camada extra** no próprio banco que reforce o
   controle que a aplicação já exerce. É evolução de maturidade — **não uma porta aberta** — ainda
   mais considerando que o universo de usuários é um grupo pequeno e identificado de colaboradores,
   não o público. A arquitetura para essa camada já está desenhada (tabelas normalizadas por
   papel/área existem no banco, prontas para adoção futura).
2. **Hashes de senha ainda presentes no registro de usuários (invisíveis ao anônimo).** Os hashes
   bcrypt continuam armazenados junto ao cadastro por uma dependência interna do aplicativo (algumas
   telas protegidas conferem a senha do próprio usuário localmente). Como o acesso anônimo foi
   fechado, **eles não são mais legíveis por terceiros**. Removê-los do cadastro depende de mover
   essas conferências para o servidor — melhoria planejada, sem exposição atual.
3. **Dados em cache no dispositivo** (necessários ao funcionamento offline do app) — mitigados por
   limpeza no logout e pela revogação remota de sessões. Relevante apenas em cenário de aparelho
   compartilhado ou perdido.
4. **Política de senha** — mínimo de 6 caracteres, sem checagem contra bases de senhas vazadas (S7,
   dependente do plano pago). Recomenda-se, num eventual _upgrade_, elevar o mínimo para 8+ e ativar
   a checagem de senhas comprometidas.

---

## 8. Conformidade com a LGPD

| Princípio | Situação |
|-----------|----------|
| **Confidencialidade** (Art. 6º, VII) | ✅ Comunicação criptografada; verificação de senha no servidor; acesso à base restrito a sessões autenticadas (ativado 14/07/2026) |
| **Segurança** (Art. 46) | ✅ Controles técnicos: hash de senha server-side, HTTPS, cabeçalhos, integridade de dependências, auditoria |
| **Prevenção de incidentes** (Art. 48) | ✅ Fragilidade de confidencialidade identificada, remediada e **fechada** (14/07/2026), sem indício de exploração no período |
| **Minimização** (Art. 6º, III) | ✅ Backups de dados pessoais redundantes removidos; retenção alinhada ao necessário |
| **Rastreabilidade / direitos do titular** | 🟡 Exclusões auditadas (motivo + autor); mapear formalmente o atendimento a pedidos de eliminação é evolução recomendada |

---

## 9. Avaliação de maturidade e recomendações

**Postura atual: adequada.** O aplicativo migrou a autenticação para o servidor, fechou o acesso
anônimo à base (o controle mais importante), endureceu a superfície do banco (funções internas
restritas, backups de dados pessoais redundantes removidos) e implementou uma base sólida de higiene
(HTTPS, hash de senha server-side, auditoria, revogação de sessão, cabeçalhos, integridade de
dependências). O fechamento crítico está **ativo em produção desde 14/07/2026**, verificado por
sondas automatizadas e por observação da operação real (§5, Anexo A).

**Leitura honesta do estágio:** os controles críticos estão no ar e verificados. A classificação
evolui para "robusta" com três passos, todos de **defesa-em-profundidade** (nenhum reabre exposição
externa):

**Roteiro de evolução (prioridade):**
1. Acrescentar, no banco, a camada de autorização por papel/área (hoje aplicada pela aplicação) —
   defesa-em-profundidade. A arquitetura já está desenhada (§7.1).
2. Mover para o servidor as conferências de senha que ainda dependem do hash no cadastro, e então
   removê-lo do registro de usuários (§7.2).
3. Num eventual _upgrade_ de plano: ativar a proteção contra senhas vazadas (HIBP) e elevar o mínimo
   de senha para 8+ (S7); formalizar rotação de chaves e revisão periódica de segurança.

---

## Anexo A — Evidência técnica (para auditoria/especialistas)

### A.1 Arquitetura e superfície avaliada
Frontend React (PWA, _bundle_ único via esbuild) hospedado na Vercel; backend Supabase: PostgreSQL
gerenciado com **PostgREST** (API REST sobre as tabelas), **GoTrue** (autenticação/JWT) e **Edge
Functions** (Deno). O controle de acesso do banco é feito por **Row Level Security (RLS)** com
políticas por papel (`anon`, `authenticated`, `service_role`). O aplicativo toca quatro tabelas:
`app_state` (blob JSON por chave — cadastros, ausências, etc.), `relyon_schedules` (programação),
`relyon_notifications` e `push_subscriptions`.

### A.2 Achados críticos S1/S2 — mecânica
As políticas RLS das quatro tabelas estavam concedidas ao papel **`anon`** com cláusula permissiva
(`USING (true)` / `WITH CHECK (true)`). Como a autenticação era **client-side** (o app baixava a
lista de usuários **com os hashes** e comparava a senha no navegador), a sessão do banco nunca
deixava de ser `anon` — logo, a RLS não tinha como restringir por pessoa. Comprovação empírica com a
chave pública (`anon`): `GET .../app_state?key=eq.relyon_users` retornava a base com o campo
`password = $2a$…`; `DELETE` sobre `relyon_schedules` retornava HTTP 200. Resultado: **leitura e
escrita anônimas totais**, incluindo PII e ausências de saúde.

### A.3 Remediação
1. **Login server-side** (Edge Function `login`, `verify_jwt`): valida o bcrypt com a
   `service_role` (fora do alcance do `anon`), provisiona/atualiza o usuário no Supabase Auth e
   devolve `{ok}`; o cliente completa com `signInWithPassword`, obtendo sessão `authenticated`.
2. **Credenciais dedicadas** em `relyon_credentials` (RLS _deny-all_, acessível só via
   `service_role`) — hashes retirados do alcance anônimo. Semeadas para **100% da base ativa com
   login** (96/96 usuários com _username_; 104 credenciais no total).
3. **Guard de sessão no cliente** (`_ensureFreshSession()`): antes de cada _flush_ de gravação
   (fila de escrita de `relyon_schedules` e _retry_ de `app_state`), executa `getSession()` e, se o
   token estiver a ≤60 s de expirar, `refreshSession()`. **Sem sessão válida, não grava como `anon`**
   — retém a fila, sinaliza "sessão expirada — refaça o login" e drena a fila (`force`) após o
   próximo login. Fecha as duas frestas do incidente de 02/07 (reenvio pós-expiração e login em
   modo local).
4. **Aperto de RLS**: `ALTER POLICY … TO authenticated` nas 16 políticas das quatro tabelas
   (removendo `anon`, preservando as cláusulas `USING`/`WITH CHECK`). Migração
   `marco2_aperto_transition_remove_anon_20260714`; _rollback_ simétrico (`… TO anon, authenticated`)
   pronto e reversível em segundos. Frota forçada a relogar via _bump_ de `session_revoke_before` +
   ciclo do portão de versão.

### A.4 Verificação (12/12 sondas, ambiente-espelho **e** produção)
Script Node exercitando o fluxo completo. Resultados aprovados em ambos os ambientes:
- `anon` `SELECT` em `app_state` / `relyon_schedules` → **HTTP 200 + lista vazia** (a RLS filtra as
  linhas; não é 401 — a leitura é "permitida" mas não retorna nada, proteção equivalente).
- `anon` `INSERT` → **HTTP 401 / PostgreSQL 42501** (violação de política).
- Edge `login` → `ok:true` → _grant_ `password` → **JWT** `authenticated`.
- `authenticated` `SELECT` → **linhas reais** (17 chaves de `app_state`, programação).
- `authenticated` `INSERT`/`PATCH`/`DELETE` de sentinela → **201/204**.
- _grant_ `refresh_token` → escrita com **JWT renovado** → **204** (valida o cenário-chave do guard:
  token expirado, renovado antes do _flush_).
- Sentinela (`__sec_probe_*`) removida **sem resíduo** (verificado por contagem).

### A.5 Cobertura de adoção e verificação de campo
74 contas no Supabase Auth (67 ativas nos últimos 30 dias); os demais usuários são provisionados no
próximo login (a Edge `login` **atualiza** a senha do usuário Auth existente). Na manhã de 14/07,
com o aperto ativo, observou-se dezenas de logins reais e leitura/gravação normais; o guard de
sessão foi validado em caso real — uma gravação pendente sem sessão exibiu o alerta (sem escrever
como `anon`, **sem perda**), e após o login a fila drenou e confirmou as gravações (HTTP 200).

### A.6 Achado operacional corrigido durante a ativação
`auth.users.banned_until = 'infinity'` (resquício de um banimento de instrutor inativo) provocava
erro de _scan_ no GoTrue ao listar usuários (`unsupported Scan … *time.Time`), quebrando a
sincronização de senha da Edge `login` para contas já existentes. Substituído por data finita
distante (banimento preservado); sincronização restabelecida. **Lição:** não gravar `'infinity'`
em coluna de _timestamp_ lida pelo GoTrue — banimentos via SQL devem usar data finita.

### A.7 Alertas automáticos remanescentes do banco (_advisors_) — esperados
Todos sem exposição externa, documentados conscientemente:
- **`rls_policy_always_true` para `authenticated`** nas quatro tabelas: é o **modelo de transição**
  (§7.1) — o controle fino por perfil é feito pela aplicação. Fechar exige normalizar o `app_state`
  (hoje um blob JSON por chave, incompatível com RLS por linha) e migrar para as tabelas por
  papel/área já existentes.
- **`current_user_*` (SECURITY DEFINER) executáveis por `authenticated`**: padrão recomendado pelo
  Supabase para RLS; retornam apenas as _claims_ do próprio solicitante.
- **`extension_in_public` (`btree_gist`, `pg_net`)**: geridas pela plataforma / usadas por
  _constraint_ de exclusão; mover é arriscado — mantidas.
- **`rls_enabled_no_policy` em `relyon_credentials`**: intencional (_deny-all_, só `service_role`).
- **Regressão corrigida em 14/07:** `notify_instructor_push` havia sido recriada (mudança de push em
  03/07) sem `search_path` fixo, reabrindo o _advisor_ `0011`; `search_path` refixado (migração
  `sec_s8_repin_search_path_notify_instructor_push`).

### A.8 Outros controles no código
Cabeçalhos em `vercel.json` (HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy,
Permissions-Policy); SRI + versões fixas dos CDNs em `index.html`; sanitização (`esc`) nos geradores
de PDF; verificação de senha sempre por função dedicada (`checkPw`, nunca comparação direta);
Service Worker que ignora o domínio Supabase no cache. Endurecimento do banco (S8/S9): funções
internas (`enforce_*`, _triggers_) com `EXECUTE` revogado de `anon`/`authenticated`/`PUBLIC`;
backups de PII redundantes removidos (minimização).

> **Documento de trabalho técnico:** `SEGURANCA.md` (avaliação completa §1–§8, plano de execução, SQL
> de aperto e _rollback_ prontos, runbook de validação em _staging_, e o histórico do incidente/piloto).

---

## Anexo B — Glossário (para leitura não técnica)

- **RLS (Row Level Security):** trava do próprio banco de dados que decide, linha a linha, quem pode
  ver ou mudar cada registro. É a "fechadura" central desta história.
- **Papel `anon` (anônimo):** o "visitante sem crachá" — qualquer um na internet com a chave pública
  do app. O achado crítico era esse visitante ter acesso total; agora ele não entra.
- **Papel `authenticated`:** o usuário que fez login e recebeu um "crachá" válido (token JWT).
- **Chave pública (`anon key`):** identifica o aplicativo perante o banco; fica visível no navegador
  por natureza. Sozinha, **não deveria** dar acesso a dados — e agora não dá.
- **Chave administrativa (`service_role`):** a "chave-mestra" do banco, que ignora as travas. Fica
  só no servidor, nunca no navegador.
- **JWT / sessão:** o "crachá" digital, com validade (expira em ~1 h e é renovado automaticamente).
- **bcrypt / hash:** forma de guardar a senha embaralhada de modo irreversível — mesmo quem vê o
  hash não descobre a senha.
- **Edge Function:** um pequeno programa que roda no servidor (não no navegador), usado aqui para
  conferir a senha em local seguro.
- **HIBP (Have I Been Pwned):** serviço que checa se uma senha já apareceu em vazamentos conhecidos;
  o recurso existe na plataforma, mas só no plano pago.
- **Cutover / rollback:** "virada" para a configuração nova / "reversão" imediata para a anterior.
- **PII:** dado pessoal identificável (nome, e-mail, telefone).

---

## Anexo C — Cronologia

| Data | Evento |
|------|--------|
| 11/06/2026 | Avaliação de segurança conduzida; achados S1–S9 registrados |
| 11/06/2026 | Fase 1 (correções de baixo risco: S3, S4, S5, S6, S8) e login server-side (Edge `login`) aplicados |
| 02/07/2026 | Cutover do fechamento **pilotado em produção e recuado** no mesmo dia (frestas de sessão anônima); zero perda de dados |
| 02/07/2026 | S9 (backups de PII redundantes) removidos; endurecimento de funções internas |
| 14/07/2026 | Guard de sessão (resiliência) implementado; credenciais semeadas p/ 100% da base; validação no ambiente-espelho (12/12) |
| 14/07/2026 | **Fechamento reativado em produção** (S1/S2); 12/12 sondas aprovadas; correção de _bug_ operacional (`banned_until`) |
| 14/07/2026 | Verificação de campo com a equipe real em uso; guard confirmado em caso real; _advisor_ de regressão (push) refixado |

---

*Relatório gerado a partir da avaliação de segurança conduzida sobre o RelyOn 360 Scheduler.
Última atualização: 14/07/2026. Detalhamento técnico e runbook em `SEGURANCA.md` (repositório).*
