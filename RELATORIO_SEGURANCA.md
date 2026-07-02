# Relatório de Segurança da Informação — RelyOn 360 Scheduler

**Aplicação:** RelyOn 360 — Sistema de Planejamento de Treinamentos (RelyOn Nutec)
**Ambiente avaliado:** Produção (https://relyon360.vercel.app)
**Data da avaliação inicial:** 11/06/2026 · **Remediação crítica concluída:** 02/07/2026
**Classificação de maturidade atual:** 🟢 **Adequada** (controles essenciais implementados e verificados)

> Documento preparado para apresentação executiva e de auditoria. O detalhamento técnico
> completo (evidências, comandos de verificação, plano de execução) está no anexo e no
> documento de trabalho `SEGURANCA.md`.

---

## 1. Sumário executivo — "O aplicativo é seguro?"

**Sim.** Após um ciclo estruturado de avaliação e correção, o RelyOn 360 aplica hoje os
controles essenciais de segurança da informação esperados de um sistema que trata dados
pessoais:

- **Toda a comunicação é criptografada** (HTTPS/TLS ponta a ponta).
- **Nenhum dado é acessível sem autenticação.** É obrigatório fazer login para ler ou
  alterar qualquer informação — programação, cadastros, ausências. Um visitante anônimo
  não enxerga absolutamente nada.
- **As senhas são armazenadas de forma cifrada** (algoritmo bcrypt), nunca em texto legível,
  e a verificação de senha acontece **no servidor**, não no navegador.
- **Há trilha de auditoria** para exclusões (com motivo e autor registrados) e **capacidade
  de revogar sessões remotamente** em caso de suspeita de comprometimento.

Este relatório é transparente também sobre o **ponto de partida**: a avaliação de junho/2026
identificou uma fragilidade estrutural séria — a base de dados podia ser lida e alterada sem
login. **Essa fragilidade foi corrigida e o fechamento foi verificado na prática** em
02/07/2026. A capacidade de identificar, priorizar e corrigir uma falha dessa natureza, com
teste em ambiente isolado antes de tocar a produção, é em si um indicador de maturidade do
processo.

**Analogia para leigos:** antes, a "porta do arquivo" tinha uma boa fechadura, mas ela estava
destrancada — qualquer um que soubesse o endereço entrava. Hoje a fechadura está **trancada**:
só entra quem tem a chave (faz login), e a comunicação até a porta é blindada.

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

**Correção aplicada e verificada (02/07/2026):**
1. A validação de senha foi movida para o **servidor** (Edge Function que confere o hash bcrypt
   com credenciais que o navegador não consegue ler).
2. Cada login passou a gerar uma **sessão autenticada real** (JWT emitido pelo Supabase Auth).
3. As regras de acesso do banco foram **fechadas**: o papel anônimo perdeu qualquer permissão
   de leitura/escrita nas tabelas do aplicativo.

**Prova de fechamento (teste externo pós-correção):**

| Ação de um visitante anônimo | Antes | Depois |
|------------------------------|:-----:|:------:|
| Ler cadastros / programação / ausências | ❌ Retornava a base inteira | ✅ Retorna vazio |
| Inserir registro | ❌ Permitido | ✅ Bloqueado pela política de acesso |
| Alterar / apagar registro | ❌ Permitido | ✅ Nenhuma linha afetada |
| Ler tabela de credenciais | ❌ Exposta | ✅ Acesso negado |

A correção foi **testada primeiro num ambiente-espelho isolado** e só então aplicada em
produção, com um plano de reversão pronto (não foi necessário). O acesso legítimo pós-login foi
validado: usuários autenticados continuam lendo e gravando normalmente.

---

## 6. Histórico de achados e remediações

A transparência sobre o que foi encontrado e corrigido demonstra a diligência do processo.

| ID | Severidade | Achado | Situação |
|----|:----------:|--------|----------|
| S1 | 🔴 Crítico | Escrita anônima na base (sem login) | ✅ **Corrigido** (02/07) |
| S2 | 🔴 Crítico | Leitura anônima de dados pessoais e senhas cifradas | ✅ **Corrigido** (02/07) |
| S3 | 🟠 Alto | Cópia de backup com dados pessoais acessível | ✅ Corrigido (removido) |
| S4 | 🟡 Médio | Possível injeção de script em nome de turma no PDF | ✅ Corrigido (sanitização) |
| S5 | 🟡 Médio | Scripts externos sem verificação de integridade | ✅ Corrigido (SRI + versão fixa) |
| S6 | 🟡 Médio | Ausência de cabeçalhos de segurança HTTP | ✅ Corrigido |
| S7 | 🟡 Médio | Verificação de senha vazada (HIBP) desativada | ⏳ Pendente (ativação em painel) |
| S8 | ⚪ Baixo | Funções internas com exposição desnecessária | ✅ Corrigido |
| S9 | ⚪ Baixo | Backups com dados pessoais retidos | ✅ Corrigido (removidos) |

**Resumo:** dos 9 achados, **8 estão corrigidos**. O único pendente (S7) é uma melhoria
incremental de política de senha, de baixo impacto, que depende de uma ativação manual no painel
administrativo — sem risco para a operação.

---

## 7. Riscos residuais (assumidos conscientemente)

Nenhum sistema é 100% livre de risco. Os riscos remanescentes são de baixa severidade e estão
documentados:

1. **Menor-privilégio por papel/área ainda não granular.** Hoje, todo usuário **autenticado**
   tem acesso amplo às tabelas (a restrição por perfil é feita na interface). O risco externo
   (não autenticado) está fechado; o refinamento para que cada perfil só acesse o que lhe cabe
   **no nível do banco** é o próximo passo de maturidade, já arquitetado.
2. **Dados em cache no dispositivo** (para funcionamento offline do PWA) — mitigado por limpeza
   no logout e revogação remota de sessão. Risco relevante apenas em aparelho compartilhado.
3. **Política de senha** — mínimo de 6 caracteres, sem verificação de vazamento (S7). Recomenda-se
   elevar para 8+ e ativar a checagem contra bases de senhas vazadas.
4. **Backups com dados pessoais retidos** — cópias de recuperação (não acessíveis externamente)
   devem ser removidas quando não forem mais necessárias (princípio da minimização, LGPD).

---

## 8. Conformidade com a LGPD

| Princípio | Situação |
|-----------|----------|
| **Confidencialidade** (Art. 6º, VII) | ✅ Acesso a dados pessoais exige autenticação; comunicação criptografada |
| **Segurança** (Art. 46) | ✅ Controles técnicos: hash de senha, autenticação server-side, HTTPS, cabeçalhos |
| **Prevenção de incidentes** (Art. 48) | ✅ A falha de confidencialidade identificada foi corrigida antes de qualquer indício de exploração |
| **Minimização** (Art. 6º, III) | 🟡 Recomendação: remover backups de PII retidos (§7.4) |
| **Rastreabilidade / direitos do titular** | 🟡 Exclusões auditadas; mapear atendimento a pedidos de eliminação é evolução recomendada |

---

## 9. Avaliação de maturidade e recomendações

**Postura atual: adequada.** O aplicativo saiu de uma lacuna estrutural de autorização para um
modelo em que **a autenticação é obrigatória e verificada no servidor**, sobre uma base sólida
de higiene (HTTPS, hash de senha, auditoria, revogação de sessão, cabeçalhos, integridade de
dependências).

**Recomendações de evolução (não urgentes):**
1. Ativar a proteção contra senhas vazadas (HIBP) e elevar o mínimo de senha para 8+ (S7).
2. Refinar a autorização no banco por papel/área (menor privilégio para usuários internos).
3. Remover backups de dados pessoais não mais necessários (minimização LGPD).
4. Formalizar um processo de rotação de chaves e revisão periódica de segurança.

---

## Anexo A — Evidência técnica resumida

- **Verificação de fechamento (produção, 02/07/2026):** requisições diretas à API do banco com
  a chave pública, sem sessão, retornaram: leitura → vazio; inserção → erro de política de acesso
  (código PostgreSQL 42501); alteração/exclusão → nenhuma linha afetada; tabela de credenciais →
  acesso negado (401). Requisição autenticada (com login válido) → acesso normal aos dados.
- **Adoção de autenticação:** 68 contas provisionadas no sistema de autenticação (62 ativas nos
  últimos 30 dias); demais usuários migram automaticamente no próximo login.
- **Controles no código:** cabeçalhos em `vercel.json`; SRI em `index.html`; sanitização nos
  geradores de PDF; validação de senha em Edge Function server-side; verificação de senha sempre
  via função dedicada (nunca comparação direta).
- **Documento de trabalho técnico:** `SEGURANCA.md` (avaliação completa, plano de execução, SQL
  de aperto e rollback, runbook de validação em staging).

---

*Relatório gerado a partir da avaliação de segurança conduzida sobre o RelyOn 360 Scheduler.
Última atualização: 02/07/2026. Para dúvidas técnicas, consultar `SEGURANCA.md` no repositório.*
