// RelyOn 360 — Edge Function `change-password`
//
// POR QUE EXISTE: a troca de senha do próprio usuário gravava SÓ no Supabase Auth
// (auth.js / instructor.js → sb.auth.updateUser). Mas o login é autoritativo pela
// tabela `relyon_credentials` (service_role-only) e pelo blob `relyon_instructors`/
// `relyon_users` — que o cliente anon NÃO consegue manter em sincronia. Resultado:
// a senha nova "não colava" (login continuava validando o ron123 da credencial).
//
// ESTA FUNÇÃO faz a troca NO SERVIDOR, com service_role, escrevendo os TRÊS lugares
// de forma consistente: (1) relyon_credentials, (2) o blob em app_state e (3) o
// Supabase Auth. Valida a senha ATUAL no servidor antes (mesmo bcrypt do login),
// então não dá pra trocar a senha de terceiros sem conhecer a senha vigente.
//
// SEGURANÇA: resposta genérica em falha (não revela se foi usuário ou senha).
// DEPLOY: verify_jwt = true (o cliente manda a anon key via functions.invoke; a
//   autorização real é a validação da senha atual aqui dentro).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const EMAIL_DOMAIN = "relyon360.app";
const HASH_ROUNDS = 10; // alinhado com o que o GoTrue/Auth gera ($2a$10$)

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

  let usuario = "", senhaAtual = "", senhaNova = "";
  try {
    const b = await req.json();
    usuario = String(b?.usuario ?? "").trim().toLowerCase();
    senhaAtual = String(b?.senhaAtual ?? "");
    senhaNova = String(b?.senhaNova ?? "");
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!usuario || !senhaAtual || !senhaNova) return json({ ok: false }, 200);
  if (senhaNova.length < 6) return json({ ok: false, reason: "weak" }, 200);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Carrega blobs + credencial dedicada (mesma lógica do `login`).
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
  if (!source) return json({ ok: false }, 200);

  // 2) Valida a senha ATUAL no servidor (espelha checkPw: bcrypt + fallback texto puro).
  let valid = false;
  if (hash && hash.startsWith("$2")) {
    try { valid = bcrypt.compareSync(senhaAtual, hash); } catch { valid = false; }
  } else if (hash) {
    valid = senhaAtual === hash;
  }
  if (!valid) return json({ ok: false }, 200);

  // 3) Gera o hash da senha nova e grava os TRÊS lugares.
  const newHash = bcrypt.hashSync(senhaNova, HASH_ROUNDS);
  const blobKey = source === "instructor" ? "relyon_instructors" : "relyon_users";

  // 3a) relyon_credentials (autoridade primária do login). Upsert: cria a row se faltar.
  await db.from("relyon_credentials").upsert(
    { username: usuario, source, password: newHash, updated_at: new Date().toISOString() },
    { onConflict: "username" },
  );

  // 3b) Blob em app_state (fonte do mustChangePass + fallback local do auth.js).
  //     Read-modify-write do array inteiro, casando username case-insensitive.
  {
    const arr = source === "instructor" ? instrs : users;
    const next = arr.map((x) =>
      String(x?.username ?? "").toLowerCase() === usuario
        ? { ...x, password: newHash, mustChangePass: false }
        : x
    );
    await db.from("app_state").update({ value: next }).eq("key", blobKey);
  }

  // 3c) Supabase Auth (garante a conta com a senha nova + metadata espelhada).
  const email = `${usuario}@${EMAIL_DOMAIN}`;
  const meta = {
    source,
    username: usuario,
    role: source === "instructor" ? "instructor" : String((record?.role) || "user"),
    name: String((record?.name) || usuario),
    mustChangePass: false,
  };
  let authUserId: string | null = null;
  try {
    const res = await db.auth.admin.getUserByEmail?.(email);
    authUserId = res?.data?.user?.id ?? null;
  } catch { /* sem getUserByEmail */ }
  if (!authUserId) {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email, password: senhaNova, email_confirm: true, user_metadata: meta,
    });
    if (createErr) authUserId = await findUserIdByEmail(db, email);
    else authUserId = created.user?.id ?? null;
  }
  if (authUserId) {
    await db.auth.admin.updateUserById(authUserId, {
      password: senhaNova, email_confirm: true, user_metadata: meta,
    });
  }

  return json({ ok: true });
});
