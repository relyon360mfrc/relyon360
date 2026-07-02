// RelyOn 360 — Edge Function `login`  (Fase 2 / Marco 1 — SEGURANCA.md §7)
//
// POR QUE EXISTE: hoje o login é feito NO NAVEGADOR (auth.js baixa relyon_users/
// relyon_instructors COM os hashes de senha e compara local). Isso (a) vaza os
// hashes pra qualquer um com a chave anon pública [achado S2] e (b) deixa o cliente
// sempre como role `anon`, impedindo a RLS de conter por pessoa [achado S1].
//
// ESTA FUNÇÃO move a verificação pro SERVIDOR: valida o bcrypt com a service_role
// (fora do alcance do anon) e garante um usuário no Supabase Auth com a senha
// fornecida + metadata espelhada. O cliente então completa com signInWithPassword
// e recebe uma sessão JWT `authenticated` — base pra fechar S1/S2 nos próximos marcos.
//
// SEGURANÇA: só retorna { ok:true } com bcrypt válido. Nunca revela qual campo
// falhou. Lê credenciais preferindo a tabela dedicada relyon_credentials (Marco 1b,
// service_role-only); cai pro blob app_state enquanto os hashes não foram movidos.
//
// DEPLOY: verify_jwt = true (o cliente sempre manda a anon key via functions.invoke).
//   Requer as envs padrão SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (já presentes).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const EMAIL_DOMAIN = "relyon360.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
type Rec = Record<string, any>;

async function findUserIdByEmail(db: Rec, email: string): Promise<string | null> {
  for (let page = 1; page <= 5; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const list = data?.users ?? [];
    const u = list.find((x: Rec) => (x.email || "").toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (list.length < 200) break;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let usuario = "", senha = "";
  try {
    const b = await req.json();
    usuario = String(b?.usuario ?? "").trim().toLowerCase();
    senha = String(b?.senha ?? "");
  } catch {
    return json({ error: "bad request" }, 400);
  }
  // Resposta genérica (não vaza se foi usuário ou senha) — defesa contra enumeração.
  if (!usuario || !senha) return json({ ok: false }, 200);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Carrega os registros (necessários pro metadata) + a credencial dedicada.
  const [{ data: usersRow }, { data: instrRow }, { data: cred }] = await Promise.all([
    db.from("app_state").select("value").eq("key", "relyon_users").maybeSingle(),
    db.from("app_state").select("value").eq("key", "relyon_instructors").maybeSingle(),
    db.from("relyon_credentials").select("username, source, password").eq("username", usuario).maybeSingle(),
  ]);
  const users: Rec[] = Array.isArray(usersRow?.value) ? usersRow!.value : [];
  const instrs: Rec[] = Array.isArray(instrRow?.value) ? instrRow!.value : [];
  const findIn = (arr: Rec[]) => arr.find((x) => String(x?.username ?? "").toLowerCase() === usuario) ?? null;

  let hash = "", source = "", record: Rec | null = null;
  if (cred) {
    hash = String(cred.password || "");
    source = String(cred.source || "");
    record = source === "instructor" ? findIn(instrs) : findIn(users);
  } else {
    const u = findIn(users);
    if (u) { hash = String(u.password || ""); source = "user"; record = u; }
    else {
      const i = findIn(instrs);
      if (i) { hash = String(i.password || ""); source = "instructor"; record = i; }
    }
  }
  if (!record || !hash) return json({ ok: false }, 200);

  // Instrutor desligado (status Inativo) nunca valida nem provisiona. Best-effort:
  // bane o usuário Auth existente — mata também o signInWithPassword direto do
  // cliente (que não passa por aqui) e o refresh de sessões antigas.
  if (source === "instructor" && String(record.status ?? "") === "Inativo") {
    try {
      const bannedEmail = `${usuario}@${EMAIL_DOMAIN}`;
      const bannedId = await findUserIdByEmail(db, bannedEmail);
      if (bannedId) await db.auth.admin.updateUserById(bannedId, { ban_duration: "876600h" });
    } catch { /* best-effort */ }
    return json({ ok: false }, 200);
  }

  // 2) Valida no servidor. Suporta o fallback legado de texto puro (espelha checkPw).
  let valid = false;
  if (hash.startsWith("$2")) {
    try { valid = bcrypt.compareSync(senha, hash); } catch { valid = false; }
  } else {
    valid = senha === hash;
  }
  if (!valid) return json({ ok: false }, 200);

  // 3) Garante o usuário no Supabase Auth (senha = a fornecida agora) + metadata.
  const email = `${usuario}@${EMAIL_DOMAIN}`;
  const meta = {
    source,
    username: usuario,
    role: source === "instructor" ? "instructor" : String(record.role || "user"),
    name: String(record.name || usuario),
    mustChangePass: !!record.mustChangePass,
  };

  let authUserId: string | null = null;
  try {
    // getUserByEmail existe nas versões recentes do admin API; se não, cai no createUser.
    const res = await db.auth.admin.getUserByEmail?.(email);
    authUserId = res?.data?.user?.id ?? null;
  } catch { /* sem getUserByEmail */ }

  if (!authUserId) {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: meta,
    });
    if (createErr) {
      authUserId = await findUserIdByEmail(db, email); // já existia (corrida / sem getUserByEmail)
      if (!authUserId) return json({ error: "auth provisioning failed" }, 500);
    } else {
      authUserId = created.user?.id ?? null;
    }
  }

  if (authUserId) {
    await db.auth.admin.updateUserById(authUserId, {
      password: senha,
      email_confirm: true,
      user_metadata: meta,
    });
  }

  // Sucesso: o cliente agora chama signInWithPassword({ email, password: senha }).
  return json({ ok: true, email });
});
