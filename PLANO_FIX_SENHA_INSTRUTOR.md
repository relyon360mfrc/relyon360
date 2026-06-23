# PLANO — Fix da troca de senha do instrutor (senha nova "não cola")

> **Status:** ✅ **EXECUTADO 2026-06-23.** Falta só `commit + push` do JS (GitHub Desktop → Vercel).
> **Data da investigação:** 2026-06-22 · **Execução:** 2026-06-23 · **Sintoma reportado por:** Matheus

---

## ✅ ATUALIZAÇÃO — o que foi feito (2026-06-23)

A **verificação ao vivo (§3) corrigiu o diagnóstico**: não eram 2 fontes, eram **TRÊS**, e a
autoridade primária do login é a tabela **`relyon_credentials`** (a Edge `login` a prefere),
que é **service_role-only** — o cliente anon **não consegue** escrevê-la. Por isso a senha nova
ia 100% certinha pro **Supabase Auth**, mas `relyon_credentials` + blob continuavam no `ron123`,
e o login (que valida pela credencial) seguia recusando a senha nova.

**Achados ao vivo:** 89→90 instrutores no blob, **todos** `ron123`/`mustChangePass:true`;
`relyon_credentials` com 92 rows, 86 instrutores **ainda ron123**; **34 contas Auth já trocadas**
(senha real salva, `$2a$10$`, portável). 44 instrutores estavam presos.

**Entregue:**
1. **Recuperação (dados, produção):** copiei o hash real do Auth → `relyon_credentials` + blob
   (`relyon_instructors`/`relyon_users`) + `mustChangePass:false`, p/ todos que tinham trocado no
   Auth. Os 44 presos voltaram a entrar **com a senha que já tinham escolhido** (verificado).
2. **Edge Function `change-password`** (service_role, `verify_jwt=true`): valida a senha atual e
   grava os **3 lugares** (cred + blob + Auth) de forma consistente. Testada ponta-a-ponta
   (rejeita senha errada, troca certo, sincroniza tudo) com usuário descartável + cleanup.
   Arquivo: `supabase/functions/change-password/index.ts`. **Já deployada.**
3. **Cliente religado:** `ChangePasswordScreen` (auth.js) e `InstructorProfile.changePass`
   (instructor.js) agora chamam `change-password` em vez de `sb.auth.updateUser`; removida a
   corrida do `__postLoginRefresh` (agora `__revalidateFromSupabase` roda **depois** da escrita
   server-side). `APP_VERSION 32 → 33`. Build esbuild OK, 88 testes verdes.

**Pendente (1 passo manual):** `commit + push` na `main` (GitHub Desktop) → Vercel republica o
bundle → APP_VERSION 33 força a frota a recarregar e passar a usar o fluxo novo. **Enquanto não
pushar, trocas NOVAS ainda quebram** (cliente velho em produção) — recuperação e função já estão
no ar, mas o cliente novo só chega com o push.

> O texto abaixo é o plano original (diagnóstico parcialmente revisado pelo §3 — ver acima).

---

---

## 1. Sintoma (o que o usuário vê)

1. Instrutor entra com a senha padrão `ron123`.
2. App força a tela de **Primeiro Acesso** → ele define uma senha nova e salva.
3. Sai e tenta entrar com a **senha nova** → **"Usuário ou senha inválidos"**.
4. Entra de novo com `ron123` → **entra direto no menu** (a tela de troca de senha **não** aparece mais).

Ou seja: a senha nova é **perdida**, mas o flag "precisa trocar senha" (`mustChangePass`) foi **zerado**. A conta fica presa no `ron123`.

---

## 2. Causa-raiz (o "porquê", em ordem de importância)

### 2.1 Defeito principal — DOIS donos da senha que não conversam

O sistema tem **duas fontes de verdade** para credencial, e elas **não são sincronizadas** numa troca de senha:

| Fonte | Quem é | Quem usa pra **autenticar** |
|-------|--------|------------------------------|
| **Blob** `relyon_instructors` (+ `relyon_users` / `relyon_credentials`) em `app_state` | A "tabela" de instrutores do app | ✅ A Edge Function `login` lê o hash daqui · ✅ O fallback local em `auth.js` (`checkPw(pass, instr.password)`) lê daqui |
| **Supabase Auth** (conta `usuario@relyon360.app`) | Conta JWT do Supabase | ⚠️ Só importa se `signInWithPassword` passar — e a Edge Function **reescreve** a senha do Auth a cada login a partir do blob |

**As telas de troca de senha do próprio usuário gravam só no Supabase Auth:**

- `ChangePasswordScreen` (primeiro acesso) — [js/auth.js:12](js/auth.js#L12):
  `sb.auth.updateUser({ password: np, data: { mustChangePass: false } })`
- `InstructorProfile.changePass` (Meu Perfil) — [js/instructor.js:1019](js/instructor.js#L1019): idem.

**Mas o login não consulta o Supabase Auth como autoridade.** A Edge Function `login` ([supabase/functions/login/index.ts:107-145](supabase/functions/login/index.ts#L107)) faz, **a cada login válido**:
- valida a senha digitada contra o **hash do blob**;
- **reescreve** a senha do Auth = senha digitada;
- **reescreve** `mustChangePass` do Auth = `record.mustChangePass` (do **blob**).

Resultado: a senha que a tela gravou no Auth é **ignorada/atropelada**. O blob continua com `ron123`. A senha nova não existe em lugar nenhum que o login respeite.

> **Prova por contraste (smoking gun):** o **reset pelo admin** funciona sempre — porque ele grava no **blob** via `updateInstr(... { password: hashPw("ron123"), mustChangePass: true })` ([js/instructors.js:628](js/instructors.js#L628) → [js/instructors.js:309](js/instructors.js#L309)). A diferença entre "funciona" (admin → blob) e "não cola" (instrutor → Auth) é exatamente o destino da escrita.

### 2.2 Defeito secundário — corrida do revalidate logo após gravar

No caminho **sem sessão Supabase** (instrutor logou pelo fallback local, que é o caso real da maioria — ver memória `reference_relyon_auth_model`), o `updateUser` falha com "Auth session missing!", e o callback grava **no blob** corretamente:

```js
// js/auth.js:122-134  (onDone)
setInstructors(prev => prev.map(i => ... { ...i, password: hashed, mustChangePass: false } ...)); // grava np no blob ✅
if (window.__postLoginRefresh) window.__postLoginRefresh();   // ⚠️ dispara revalidate IMEDIATO
onLogin({ ...pendingUser, mustChangePass: false }, keep);
```

O `__postLoginRefresh()` ([js/config.js:333](js/config.js#L333)) chama `_revalidateFromSupabase()`, que faz um `select` do `relyon_instructors` **antes do upsert do `setInstructors` chegar ao servidor**, lê o blob **velho** (`ron123/true`) e dispara `_REVALIDATE_EVENT`. O `usePersisted` então faz `setState(blobVelho)` ([js/config.js:254-268](js/config.js#L254)), **revertendo** a senha nova em memória — e o re-render re-grava o blob velho por cima. Clássico "revalidate stale atropela escrita local fresca".

> O estado final exato depende do timing (qual upsert vence a corrida), por isso o comportamento é **intermitente/esquisito**. Mas as duas falhas acima, juntas, explicam 100% do sintoma: senha nova perdida + `mustChangePass` zerado.

---

## 3. Verificação ao vivo (PRIMEIRO passo da próxima sessão — antes de codar)

Confirmar empiricamente qual caminho está ativo em produção, pra não codar no escuro:

1. **No Supabase** (SQL read-only) inspecionar um instrutor que tentou trocar a senha:
   ```sql
   select value from app_state where key = 'relyon_instructors';
   ```
   Conferir, pro `username` afetado: `password` ainda é o hash de `ron123`? `mustChangePass` está `false`? (Esperado pela teoria: senha = ron123, flag = false → ou variações da corrida.)
2. Conferir se `relyon_credentials` está **populado** (decide se a Edge lê dela ou cai no blob) — não muda o fix, mas confirma o caminho.
3. Conferir se o instrutor afetado tem **conta no Supabase Auth** (decide se cai no caminho 2.1 com sessão viva ou 2.2 sem sessão).
4. **Reproduzir** o bug num instrutor de teste, observando o Network/console na tela de troca de senha (ver se `updateUser` retorna "session missing" ou sucesso).

---

## 4. Correção recomendada

**Princípio:** enquanto o login for autoritativo pelo **blob** (ele é, hoje), **toda** troca de senha tem que gravar no **blob** — igual ao reset do admin. O Supabase Auth vira espelho best-effort (a própria Edge já re-provisiona o Auth do blob no próximo login, então blob basta).

### 4.1 Single-source de um helper de troca de senha
Criar um helper único (ex.: em `config.js`) usado pelas duas telas:

```js
// pseudo
async function changeOwnPassword({ source, username, newPass, setUsers, setInstructors }) {
  const hashed = hashPw(newPass);
  const patch = { password: hashed, mustChangePass: false };
  // 1) AUTORIDADE: grava no blob (igual admin reset)
  if (source === 'instructor') setInstructors(prev => prev.map(i => i.username === username ? { ...i, ...patch } : i));
  else                         setUsers(prev => prev.map(u => u.username === username ? { ...u, ...patch } : u));
  // 2) best-effort: espelha no Auth (não bloqueia, erro engolido)
  try { await sb.auth.updateUser({ password: newPass, data: { mustChangePass: false } }); } catch {}
}
```

### 4.2 `ChangePasswordScreen` (auth.js)
- Sempre gravar no blob via o helper (não depender de `updateUser` ter sessão).
- **Remover** o `__postLoginRefresh()` imediato do `onDone` no caminho de troca de senha (ou garantir que ele rode **só depois** do upsert do blob confirmar). Não há motivo de RLS pra refetch aqui — acabamos de escrever localmente. Isso mata a corrida 2.2.

### 4.3 `InstructorProfile.changePass` (instructor.js, Meu Perfil)
- Verificar a **senha atual** com `checkPw(oldPass, instr.password)` contra o **blob**, **não** com `signInWithPassword` ([js/instructor.js:1017](js/instructor.js#L1017)) — o Auth pode estar dessincronizado e o `signInWithPassword` falha/atrapalha.
- Gravar a nova senha pelo mesmo helper (blob + best-effort Auth).

### 4.4 Não regredir o que já funciona
- Reset do admin ([js/instructors.js:628](js/instructors.js#L628)) já está certo (grava no blob) — **não mexer**.
- Manter o portão de versão (`APP_VERSION + 1`) ao subir — `auth.js`/`config.js`/`instructor.js` mudam.

---

## 5. Limpeza / comunicação (efeito colateral do bug já em campo)

- Instrutores que "trocaram" a senha e ficaram presos **continuam no `ron123`** com `mustChangePass:false`. Depois do fix, avisar pra trocarem de novo. Opcional: um reset em lote re-ativando `mustChangePass:true` pros afetados (decidir na execução, com a lista da verificação do §3).

---

## 6. Compatibilidade com a Fase 2 de Segurança (SEGURANCA.md §7)

A Fase 2 quer mover a autoridade pro **Supabase Auth + RLS por papel** (Auth vira o dono). **Quando isso fechar**, este fix (blob-autoritativo) precisa ser revisitado: a troca de senha passaria a gravar no Auth e o blob deixaria de guardar hash. Por ora, **blob-autoritativo é o correto** porque é o que o login realmente consulta. Deixar essa nota linkada no SEGURANCA.md pra não criar conflito quando o Marco de RLS avançar.

---

## 7. Checklist de execução (próxima sessão)

- [ ] §3 — verificação ao vivo (SQL + reproduzir + confirmar caminho)
- [ ] §4.1 — helper `changeOwnPassword` (blob autoritativo + Auth best-effort)
- [ ] §4.2 — `ChangePasswordScreen` usa o helper; **remover** `__postLoginRefresh` da corrida
- [ ] §4.3 — `InstructorProfile`: verificar senha atual via `checkPw` no blob; usar o helper
- [ ] Testar: ron123 → trocar → **sair** → entrar com a nova (deve funcionar) → ron123 deve **falhar**
- [ ] `APP_VERSION + 1` em `config.js` + build OK + testes verdes
- [ ] §5 — comunicar/limpar afetados
- [ ] Atualizar `feedback_default_password_reset` / memória do incidente
- [ ] Commit + push (main) → Vercel republica

---

## Arquivos-chave (mapa rápido)

| Arquivo | Papel no bug |
|---------|--------------|
| [js/auth.js:3-43](js/auth.js#L3) | `ChangePasswordScreen` — grava no Auth (defeito 2.1) |
| [js/auth.js:120-136](js/auth.js#L120) | `onDone` — grava blob no caminho sem-sessão + `__postLoginRefresh` (corrida 2.2) |
| [js/instructor.js:1012-1023](js/instructor.js#L1012) | `InstructorProfile.changePass` — grava no Auth + verifica via signIn (defeito 2.1) |
| [supabase/functions/login/index.ts:107-145](supabase/functions/login/index.ts#L107) | Edge `login` — reescreve Auth a partir do **blob** a cada login |
| [js/instructors.js:309-317](js/instructors.js#L309) · [:628](js/instructors.js#L628) | `updateInstr` / reset admin — grava no **blob** (referência do que está CERTO) |
| [js/config.js:333-337](js/config.js#L333) · [:254-268](js/config.js#L254) | `__postLoginRefresh` / `usePersisted` revalidate — mecânica da corrida |
