// RelyOn 360 — Edge Function `atestado-file`
//
// POR QUE EXISTE: é o ÚNICO caminho de leitura da foto do atestado (bucket privado
// `atestados`, sem policies de acesso direto). Devolve uma signed URL de 5 minutos
// APENAS para:
//   • papel `qsms` (equipe de Saúde — valida o atestado), ou
//   • o instrutor DONO do arquivo (prefixo `${instructorId}_` no path).
// Admin/dev/planejador recebem 403 DE PROPÓSITO — o CID é sigiloso (LGPD) e só
// diz respeito ao funcionário e à equipe de saúde.
//
// IDENTIDADE: e-mail do JWT (username@relyon360.app) casado com os blobs
// relyon_users / relyon_instructors via service_role — NUNCA user_metadata (o
// próprio usuário consegue editá-lo; seria falsificável).
//
// RETENÇÃO: os arquivos NÃO expiram — ficam guardados por prazo indeterminado
// como evidência para eventual necessidade jurídica (ex.: processo trabalhista),
// com base no art. 7º, VI da LGPD (exercício regular de direitos em processo).
// Decisão de negócio de 2026-07-16: o expurgo automático de 6 meses da v1 foi
// REMOVIDO. O sigilo é garantido pelo cofre (só QSMS/dono acessam), não pela
// exclusão do arquivo.
// DEPLOY: verify_jwt = true.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "atestados";
const SIGNED_URL_SECONDS = 300;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // 1) Identifica o chamador pela SESSÃO (anon key pura não tem user).
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await caller.auth.getUser();
  const email = userData?.user?.email ?? "";
  if (!email) return json({ error: "não autenticado" }, 401);
  const username = email.split("@")[0].toLowerCase();

  // 2) Path plano (sem pastas) — bloqueia traversal por construção.
  let path = "";
  try {
    const b = await req.json();
    path = String(b?.path ?? "");
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!path || path.includes("/") || path.includes("\\") || path.includes("..")) {
    return json({ error: "path inválido" }, 400);
  }

  // 3) Autorização pelo BLOB (papel real, não o do JWT).
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const [{ data: usersRow }, { data: instrRow }] = await Promise.all([
    db.from("app_state").select("value").eq("key", "relyon_users").maybeSingle(),
    db.from("app_state").select("value").eq("key", "relyon_instructors").maybeSingle(),
  ]);
  const users: Rec[] = Array.isArray(usersRow?.value) ? usersRow!.value : [];
  const instrs: Rec[] = Array.isArray(instrRow?.value) ? instrRow!.value : [];
  const sysUser = users.find((u) => String(u?.username ?? "").toLowerCase() === username);
  const isQsms = !!sysUser && String(sysUser.role) === "qsms";
  const me = instrs.find((i) => String(i?.username ?? "").toLowerCase() === username);
  const isOwner = !!me && path.startsWith(`${me.id}_`);
  if (!isQsms && !isOwner) {
    return json({ error: "acesso restrito à equipe de Saúde (QSMS) e ao instrutor dono do atestado" }, 403);
  }

  // 4) Signed URL de 5 minutos. (O arquivo em si não expira — ver RETENÇÃO no topo.)
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    return json({ error: "arquivo não encontrado no repositório de atestados" }, 404);
  }
  return json({ ok: true, url: data.signedUrl });
});
