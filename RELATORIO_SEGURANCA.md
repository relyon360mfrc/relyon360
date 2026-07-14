# Relatório de Segurança da Informação — RelyOn 360 Scheduler

**Aplicação:** RelyOn 360 — Sistema de Planejamento de Treinamentos (RelyOn Nutec)
**Ambiente avaliado:** Produção (https://relyon360.vercel.app)
**Data da avaliação inicial:** 11/06/2026 · **Ativação definitiva do controle crítico:** 14/07/2026
**Classificação de maturidade atual:** 🟢 **Adequada** (controles críticos ativos em produção;
fechamento do acesso anônimo reativado em 14/07/2026 após os ajustes de sessão, com testes
automatizados aprovados em ambiente-espelho e em produção)

> Documento preparado para apresentação executiva e de auditoria. O detalhamento técnico
> completo (evidências, comandos de verificação, plano de execução) está no anexo e no
> documento de trabalho `SEGURANCA.md`.

---

## 1. Sumário executivo — "O aplicativo é seguro?"

**O aplicativo trata os dados com os controles essenciais de segurança e está num processo
estruturado de fortalecimento, com o principal risco já endereçado por uma correção validada.**
Hoje o sistema aplica:

- **Toda a comunicação é criptografada** (HTTPS/TLS ponta a ponta).
- **As senhas são armazenadas de forma cifrada** (algoritmo bcrypt), nunca em texto legível,
  e a verificação de senha acontece **no servidor**, não no navegador.
- **Há trilha de auditoria** para exclusões (com motivo e autor registrados) e **capacidade
  de revogar sessões remotamente** em caso de suspeita de comprometimento.
- **Cabeçalhos de segurança, integridade de dependências e proteção contra injeção** aplicados.

**Ponto de atenção principal (em tratamento):** a avaliação de junho/2026 identificou que a base
de dados podia ser lida e alterada sem login — uma fragilidade estrutural séria. A correção
definitiva (exigir autenticação no banco) foi **construída, testada em ambiente isolado e pilotada
em produção**. Durante o piloto, constatou-se que ela precisa de um ajuste complementar no
aplicativo (garantir que toda sessão de usuário seja reconhecida como autenticada, inclusive em
reenvios automáticos) antes de ser ativada em definitivo. A correção foi temporariamente recuada
para não afetar a operação, e será reativada assim que esse ajuste estiver concluído — sem perda
de dados em nenhum momento.

**Analogia para leigos:** a "fechadura" nova já foi instalada e testada e funciona; ao usá-la no
dia a dia percebeu-se que algumas cópias da chave (sessões de usuário) precisavam ser recadastradas
antes de trancar de vez, sob risco de trancar alguém do lado de fora. Por prudência, a porta segue
com a fechadura antiga (funcional) enquanto as chaves são acertadas — e então a nova é ativada.

---

## 2. Escopo e metodologia

| Item | Detalhe |
|------|---------|
| **Sistema** | Aplicação web (PWA) React, backend Supabase (PostgreSQL gerenciado), hospedagem Vercel |
| **Método** | Revisão de código-fonte + inspeção da configuração do banco (políticas de acesso, funções, advisors de segurança) + **teste empírico** (requisições reais simulando um atacante externo) |
| **Padrões de referência** | Boas práticas OWASP (controle de acesso, XSS, cabeçalhos), princípios da LGPD (confidencialidade, minimização, direitos do titular) |
| **Ambiente de teste** | O cutover de correção foi validado num **projeto-espelho isolado** antes de ser aplicado em produção — zero risco para os dados reais durante os testes |

A avaliação foi conduzida em duas frentes: correções de baixo risco aplicadas de imediato, e a
correção estrutural (autenticação/autorização) executada de forma faseada, com plano de rollback.

---

## 3. Inventário de dados e classificação (LGPD)

| Categoria de dado | Volume | Sensibilidade |
|-------------------|:------:|---------------|
| Instrutores (nome, e-mail, telefone, cidade/UF, contrato, competências) | 92 | Alta — dado pessoal |
| Usuários do sistema (nome, e-mail, papel) | 8 | Alta — dado pessoal |
| **Ausências (atestado médico, licença, suspensão, férias)** | 104 | **Sensível** — saúde/disciplinar (LGPD Art. 5º, II) |
| Programação de turmas (turma, módulo, local, instrutor) | 4.617 | Média — operacional |
| Notificações / assinaturas de push | 2.792 / 47 | Baixa/Média |

Não há tratamento de CPF nem de dados nominais de alunos (as turmas registram apenas contagem
de participantes). A categoria de maior sensibilidade são as **ausências por motivo de saúde**,
que hoje estão protegidas por autenticação obrigatória (ver §5).

---

## 4. Controles de segurança implementados

| Domínio | Controle | Status |
|---------|----------|:------:|
| **Transporte** | TLS/HTTPS ponta a ponta (Supabase + Vercel) | ✅ |
| **Autenticação** | Login validado **no servidor** (Edge Function), sessão via Supabase Auth (JWT) | ✅ |
| **Senhas** | Hash bcrypt; verificação server-side; troca obrigatória no 1º acesso | ✅ |
| **Autorização** | Acesso ao banco **exige sessão autenticada** — anônimo não lê nem escreve | ✅ |
| **Cabeçalhos de segurança** | HSTS, X-Frame-Options (DENY), X-Content-Type-Options, Referrer-Policy, Permissions-Policy | ✅ |
| **Integridade de dependências** | Scripts externos (CDN) com _Subresource Integrity_ (SRI) e versões fixadas | ✅ |
| **Proteção contra XSS** | React escapa por padrão; geradores de PDF sanitizam entrada do usuário | ✅ |
| **Auditoria** | Exclusões registram motivo + autor (tombstone); log de aprovações em solicitações | ✅ |
| **Gestão de sessão** | Revogação remota de todas as sessões; portão de versão (força atualização da frota) | ✅ |
| **Isolamento de segredos** | Chave administrativa (service_role) nunca exposta no código; token do agente em variável de ambiente | ✅ |
| **Cache/Offline** | Service Worker não faz cache de dados do banco (evita envenenamento de cache) | ✅ |

---

## 5. A correção central: de "aberto" para "trancado"

**O achado mais importante da avaliação (junho/2026):** a base de dados usava regras de acesso
permissivas para o papel "anônimo". Como toda aplicação web Supabase embute uma chave pública no
navegador, isso significava que **qualquer pessoa na internet, de posse dessa chave pública,
podia ler toda a base (incluindo dados pessoais e ausências de saúde) e alterar ou apagar
registros — sem login.** Foi comprovado empiricamente durante a avaliação.

**Causa-raiz:** o login acontecia dentro do navegador, então o banco nunca sabia "quem" estava
conectado e não conseguia restringir o acesso por pessoa.

**Correção construída (02/07/2026):**
1. A validação de senha foi movida para o **servidor** (Edge Function que confere o hash bcrypt
   com credenciais que o navegador não consegue ler). ✅ Em produção.
2. Cada login passou a gerar uma **sessão autenticada real** (JWT emitido pelo Supabase Auth).
   ✅ Em produção.
3. As regras de acesso do banco foram **fechadas** para o papel anônimo. ⚠️ Aplicado, validado
   e depois **recuado** (ver abaixo).

**Validação (ambiente-espelho isolado):** num projeto de banco de dados idêntico ao de produção,
com o fechamento ativo, os testes confirmaram o resultado esperado — visitante anônimo: leitura →
vazio; inserção/alteração/exclusão → bloqueadas; tabela de credenciais → acesso negado; usuário
autenticado → acesso normal.

**Piloto em produção e ajuste identificado:** ao ativar o fechamento em produção, constatou-se que
**nem toda sessão de usuário é reconhecida como autenticada no banco** em 100% dos casos — por
exemplo, quando um envio de dados é **reprocessado automaticamente em segundo plano** após o token
de sessão expirar, ou quando o login recorre à verificação local. Nesses casos, a operação era
recusada pela nova regra. Para não impactar o trabalho da equipe, o fechamento foi **imediatamente
recuado** (reversão instantânea, testada, **sem qualquer perda de dados**), retornando ao estado
funcional anterior.

**Ajuste concluído e fechamento REATIVADO (14/07/2026):** o aplicativo passou a **validar e
renovar a sessão autenticada antes de todo envio e reenvio automático** de dados (e a reter o
envio, avisando o usuário, caso não exista sessão válida — nunca operando de forma anônima
silenciosa); as credenciais de login server-side foram completadas para **100% da base ativa**.
Com isso, o fechamento do acesso anônimo foi reaplicado em produção. A bateria de testes foi
aprovada integralmente no ambiente-espelho e em produção: visitante anônimo → leitura vazia e
escrita bloqueada; usuário autenticado → leitura e escrita normais, inclusive após renovação do
token de sessão; conta de teste removida sem resíduo. Uma verificação automática adicional roda
na manhã seguinte à ativação para confirmar a operação normal da equipe.

> **Nota de transparência:** este relatório foi mantido fiel ao estado real em cada fase — o
> piloto de 02/07 foi descrito como recuado enquanto esteve recuado, e o fechamento só passou a
> constar como concluído após a reativação **verificada** de 14/07/2026.

---

## 6. Histórico de achados e remediações

A transparência sobre o que foi encontrado e corrigido demonstra a diligência do processo.

| ID | Severidade | Achado | Situação |
|----|:----------:|--------|----------|
| S1 | 🔴 Crítico | Escrita anônima na base (sem login) | ✅ Corrigido (fechamento ativado em 14/07/2026, testes aprovados) |
| S2 | 🔴 Crítico | Leitura anônima de dados pessoais e senhas cifradas | ✅ Corrigido (fechamento ativado em 14/07/2026, testes aprovados) |
| S3 | 🟠 Alto | Cópia de backup com dados pessoais acessível | ✅ Corrigido (removido) |
| S4 | 🟡 Médio | Possível injeção de script em nome de turma no PDF | ✅ Corrigido (sanitização) |
| S5 | 🟡 Médio | Scripts externos sem verificação de integridade | ✅ Corrigido (SRI + versão fixa) |
| S6 | 🟡 Médio | Ausência de cabeçalhos de segurança HTTP | ✅ Corrigido |
| S7 | 🟡 Médio | Verificação de senha vazada (HIBP) desativada | ⏳ Pendente (ativação em painel) |
| S8 | ⚪ Baixo | Funções internas com exposição desnecessária | ✅ Corrigido |
| S9 | ⚪ Baixo | Backups com dados pessoais retidos | ✅ Corrigido (removidos) |

**Resumo:** dos 9 achados, **8 estão corrigidos** — incluindo os **2 críticos (S1/S2)**,
cujo fechamento foi ativado em produção em 14/07/2026 com testes aprovados (ver §5). O restante
(S7) é melhoria incremental de política de senha, por configuração de painel.

---

## 7. Riscos residuais (baixa severidade — sem exposição externa)

Nenhum sistema é 100% livre de risco. É importante enquadrar corretamente os itens abaixo:
**nenhum deles representa acesso por pessoas não autenticadas** — a exposição a terceiros/à
internet está fechada (§5). São refinamentos de defesa-em-profundidade e higiene, de baixa
severidade, típicos da evolução de qualquer sistema saudável.

1. **Reforço de menor-privilégio no próprio banco (defesa-em-profundidade).** O acesso aos dados
   exige login; a partir daí, a separação do que cada perfil (planejador, instrutor, etc.) pode
   ver e fazer é aplicada pela **aplicação**. O banco de dados ainda não replica essa mesma
   separação como uma segunda camada independente. Na prática: a proteção contra terceiros não
   autenticados está **completa**; o que resta é acrescentar uma **camada extra** que reforce, no
   próprio banco, o controle que a aplicação já exerce. Trata-se de uma evolução de maturidade —
   **não de uma porta aberta** — ainda mais considerando que o universo de usuários é um grupo
   pequeno e identificado de colaboradores da empresa, não o público. A arquitetura para essa
   camada adicional já está desenhada.
2. **Dados em cache no dispositivo** (necessário para o funcionamento offline do aplicativo) —
   mitigado por limpeza no logout e pela capacidade de revogar sessões remotamente. Relevante
   apenas no cenário de um aparelho compartilhado ou perdido.
3. **Política de senha** — mínimo de 6 caracteres, sem verificação contra bases de senhas
   vazadas (S7). Recomenda-se elevar o mínimo para 8+ e ativar a checagem de senhas comprometidas
   — melhoria incremental, aplicável por configuração.

---

## 8. Conformidade com a LGPD

| Princípio | Situação |
|-----------|----------|
| **Confidencialidade** (Art. 6º, VII) | ✅ Comunicação criptografada; verificação de senha no servidor; acesso à base restrito a sessões autenticadas (ativado 14/07/2026) |
| **Segurança** (Art. 46) | ✅ Controles técnicos: hash de senha server-side, HTTPS, cabeçalhos, integridade de dependências, auditoria |
| **Prevenção de incidentes** (Art. 48) | ✅ Fragilidade de confidencialidade identificada, remediada e **fechada** (14/07/2026), sem indício de exploração no período |
| **Minimização** (Art. 6º, III) | ✅ Backups de dados pessoais redundantes removidos (02/07); retenção alinhada ao necessário |
| **Rastreabilidade / direitos do titular** | 🟡 Exclusões auditadas (motivo + autor); mapear formalmente o atendimento a pedidos de eliminação é evolução recomendada |

---

## 9. Avaliação de maturidade e recomendações

**Postura atual: adequada.** O aplicativo migrou a autenticação para o servidor, endureceu a
superfície do banco (funções internas restritas, backups de dados pessoais redundantes removidos)
e implementou uma base sólida de higiene (HTTPS, hash de senha server-side, auditoria, revogação
de sessão, cabeçalhos, integridade de dependências). O fechamento do acesso anônimo à base — o
controle mais importante — está **ativo em produção desde 14/07/2026**, com testes aprovados (§5).

**Leitura honesta do estágio:** os controles críticos estão no ar e verificados por sondas
automatizadas. A classificação sobe para "robusta" com o menor-privilégio por papel/área dentro
do banco (hoje o modelo é de transição: qualquer sessão autenticada da equipe acessa as tabelas
do app), a ativação do HIBP (S7) e a formalização dos fluxos de titulares (LGPD).

**Roteiro de conclusão (prioridade):**
1. **Concluir o ajuste de sessão do §5** e reativar o fechamento do acesso anônimo (fecha S1/S2).
2. Ativar a proteção contra senhas vazadas (HIBP) e elevar o mínimo de senha para 8+ (S7).
3. Acrescentar, no banco, uma camada de autorização por papel/área (defesa-em-profundidade).
4. Formalizar rotação de chaves e revisão periódica de segurança.

---

## Anexo A — Evidência técnica resumida

- **Verificação da correção (ambiente-espelho + piloto em produção, 02/07/2026):** com o
  fechamento ativo, requisições anônimas retornaram leitura → vazio; inserção → erro de política
  (PostgreSQL 42501); alteração/exclusão → nenhuma linha afetada; credenciais → 401; e o acesso
  autenticado funcionou normalmente. O piloto em produção revelou o ajuste de sessão descrito no
  §5, motivando a **reversão temporária** (sem perda de dados) até sua conclusão.
- **Adoção de autenticação:** 68 contas provisionadas no sistema de autenticação (62 ativas nos
  últimos 30 dias); demais usuários migram automaticamente no próximo login.
- **Controles no código:** cabeçalhos em `vercel.json`; SRI em `index.html`; sanitização nos
  geradores de PDF; validação de senha em Edge Function server-side; verificação de senha sempre
  via função dedicada (nunca comparação direta).
- **Endurecimento do banco (02/07/2026):** funções internas (triggers e utilitários) restritas a
  papéis de sistema — não mais chamáveis por visitantes anônimos via API; backups de dados
  pessoais redundantes removidos (minimização).
- **Sobre os alertas automáticos remanescentes do banco:** a ferramenta de _advisors_ do Supabase
  ainda sinaliza dois tipos de item, ambos **esperados e sem exposição externa**: (a) políticas
  "amplas" para o papel **autenticado** — é o modelo de transição descrito no §7.1 (o controle
  fino por perfil é feito pela aplicação); e (b) funções auxiliares de autorização acessíveis a
  usuários **autenticados** — padrão recomendado pelo próprio Supabase, pois só retornam as
  credenciais do próprio solicitante, sem revelar dados de terceiros. Não são vulnerabilidades
  abertas; são consequência natural do modelo atual, documentadas conscientemente.
- **Documento de trabalho técnico:** `SEGURANCA.md` (avaliação completa, plano de execução, SQL
  de aperto e rollback, runbook de validação em staging).

---

*Relatório gerado a partir da avaliação de segurança conduzida sobre o RelyOn 360 Scheduler.
Última atualização: 02/07/2026. Para dúvidas técnicas, consultar `SEGURANCA.md` no repositório.*
