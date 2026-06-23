// RelyOn 360 — Edge Function `reset-password`
//
// POR QUE EXISTE: o admin precisa RESETAR a senha de um usuário (esqueceu / conta
// presa), mas não conhece a senha atual dele. A troca de senha do app gravava só no
// blob `relyon_users` (cliente anon NÃO escreve `relyon_credentials`, service_role-only)
// — e o `login` valida pela credencial PRIMEIRO, então a senha resetada "não colava".
// Mesmo mal que a `change-password` resolveu pro próprio usuário.
//
// ESTA FUNÇÃO reseta NO SERVIDOR pro padrão `ron123` + mustChangePass, escrevendo os
// TRÊS lugares de forma consistente: (1) relyon_credentials, (2) o blob em app_state e
// (3) o Supabase Auth. No próximo login o usuário cai na tela de troca obrigatória.
//
// SEGURANÇA: diferente da `change-password` (que se autoriza exigindo a senha ATUAL do
// alvo), o reset não sabe a senha atual — então VALIDA O ADMIN no servidor (bcrypt da
// senha do admin + papel developer/admin). Sem isso, seria um "resete a senha de
// qualquer um" aberto a qualquer detentor da chave anon pública (account takeover).
// Resposta genérica em falha (não revela qual campo falhou).
// DEPLOY: verify_jwt = true (o cliente manda a anon key via functions.invoke; a
//   autorização real é a validação do admin aqui dentro).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const EMAIL_DOMAIN = "relyon360.app";
const HASH_ROUNDS = 10; // alinhado com o que o GoTrue/Auth gera ($2a$10$)
const DEFAULT_PASSWORD = "ron123";
const ADMIN_ROLES = ["developer", "admin"];

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

// Resolve hash/source/record de um username (mesma lógica de leitura cred→blob do `login`).
async function loadIdentity(db: Rec, users: Rec[], instrs: Rec[], username: string) {
  const findIn = (arr: Rec[]) => arr.find((x) => String(x?.username ?? "").toLowerCase() === username) ?? null;
  const { data: cred } = await db
    .from("relyon_credentials")
    .select("username, source, password")
    .eq("username", username)
    .maybeSingle();

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
  return { hash, source, record };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let admin = "", adminSenha = "", alvo = "";
  try {
    const b = await req.json();
    admin = String(b?.admin ?? "").trim().toLowerCase();
    adminSenha = String(b?.adminSenha ?? "");
    alvo = String(b?.alvo ?? "").trim().toLowerCase();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!admin || !adminSenha || !alvo) return json({ ok: false }, 200);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Carrega os blobs uma vez (admin + alvo saem deles).
  const [{ data: usersRow }, { data: instrRow }] = await Promise.all([
    db.from("app_state").select("value").eq("key", "relyon_users").maybeSingle(),
    db.from("app_state").select("value").eq("key", "relyon_instructors").maybeSingle(),
  ]);
  const users: Rec[] = Array.isArray(usersRow?.value) ? usersRow!.value : [];
  const instrs: Rec[] = Array.isArray(instrRow?.value) ? instrRow!.value : [];

  // 2) Autoriza o ADMIN no servidor: bcrypt da senha + papel developer/admin.
  const a = await loadIdentity(db, users, instrs, admin);
  if (!a.record || !a.hash || a.source !== "user") return json({ ok: false }, 200);
  let adminValid = false;
  if (a.hash.startsWith("$2")) {
    try { adminValid = bcrypt.compareSync(adminSenha, a.hash); } catch { adminValid = false; }
  } else {
    adminValid = adminSenha === a.hash;
  }
  if (!adminValid) return json({ ok: false }, 200);
  if (!ADMIN_ROLES.includes(String(a.record.role || ""))) return json({ ok: false }, 200);

  // 3) Resolve o ALVO.
  const t = await loadIdentity(db, users, instrs, alvo);
  if (!t.source) return json({ ok: false }, 200);

  // 4) Gera o hash do padrão e grava os TRÊS lugares (com mustChangePass).
  const newHash = bcrypt.hashSync(DEFAULT_PASSWORD, HASH_ROUNDS);
  const blobKey = t.source === "instructor" ? "relyon_instructors" : "relyon_users";

  // 4a) relyon_credentials (autoridade primária do login). Upsert: cria a row se faltar.
  await db.from("relyon_credentials").upsert(
    { username: alvo, source: t.source, password: newHash, updated_at: new Date().toISOString() },
    { onConflict: "username" },
  );

  // 4b) Blob em app_state. Read-modify-write do array inteiro, casando username case-insensitive.
  {
    const arr = t.source === "instructor" ? instrs : users;
    const next = arr.map((x) =>
      String(x?.username ?? "").toLowerCase() === alvo
        ? { ...x, password: newHash, mustChangePass: true }
        : x
    );
    await db.from("app_state").update({ value: next }).eq("key", blobKey);
  }

  // 4c) Supabase Auth (garante a conta com a senha padrão + metadata espelhada).
  const email = `${alvo}@${EMAIL_DOMAIN}`;
  const meta = {
    source: t.source,
    username: alvo,
    role: t.source === "instructor" ? "instructor" : String((t.record?.role) || "user"),
    name: String((t.record?.name) || alvo),
    mustChangePass: true,
  };
  let authUserId: string | null = null;
  try {
    const res = await db.auth.admin.getUserByEmail?.(email);
    authUserId = res?.data?.user?.id ?? null;
  } catch { /* sem getUserByEmail */ }
  if (!authUserId) {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email, password: DEFAULT_PASSWORD, email_confirm: true, user_metadata: meta,
    });
    if (createErr) authUserId = await findUserIdByEmail(db, email);
    else authUserId = created.user?.id ?? null;
  }
  if (authUserId) {
    await db.auth.admin.updateUserById(authUserId, {
      password: DEFAULT_PASSWORD, email_confirm: true, user_metadata: meta,
    });
  }

  return json({ ok: true });
});
