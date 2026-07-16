// RelyOn 360 — Edge Function `atestado-upload`
//
// POR QUE EXISTE: a foto do atestado médico pode conter o CID (dado de saúde —
// LGPD). Ela NUNCA entra no app_state (que todo usuário autenticado lê): sobe pra
// o bucket PRIVADO `atestados`, que não tem nenhuma policy de acesso direto —
// só o service_role (esta função e a `atestado-file`) alcança os arquivos.
//
// QUEM PODE SUBIR: somente o próprio instrutor logado (identificado pela SESSÃO).
// A identidade vem do e-mail do JWT (username@relyon360.app) casado com o blob
// `relyon_instructors` — NUNCA de user_metadata, que o próprio usuário consegue
// editar via auth.updateUser (seria falsificável).
//
// PATH: `${instructorId}_${timestamp}.{ext}` — o prefixo permite o check de dono
// na `atestado-file` e o timestamp registra quando o arquivo foi enviado.
// RETENÇÃO: indeterminada — evidência jurídica (LGPD art. 7º, VI); o expurgo de
// 6 meses da v1 foi removido em 2026-07-16 (decisão de negócio).
// DEPLOY: verify_jwt = true (functions.invoke manda o token da sessão).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "atestados";
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
// ~8.6MB decodificados (base64 infla ~1.33x). O bucket ainda trava em 10MB.
const MAX_B64_CHARS = 11_500_000;

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

  // 1) Identifica o chamador pela SESSÃO. A anon key pura passa no verify_jwt do
  //    gateway, mas não tem user — getUser() vazio = não autenticado.
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

  // 2) Corpo + validações de tipo/tamanho.
  let contentType = "", fileBase64 = "";
  try {
    const b = await req.json();
    contentType = String(b?.contentType ?? "");
    fileBase64 = String(b?.fileBase64 ?? "");
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const ext = ALLOWED[contentType];
  if (!ext) return json({ error: "tipo de arquivo não permitido (use foto ou PDF)" }, 400);
  if (!fileBase64) return json({ error: "arquivo vazio" }, 400);
  if (fileBase64.length > MAX_B64_CHARS) return json({ error: "arquivo grande demais (máx. ~8MB)" }, 400);

  // 3) Só instrutor cadastrado sobe atestado — papel vem do BLOB, não do JWT.
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: instrRow } = await db.from("app_state").select("value").eq("key", "relyon_instructors").maybeSingle();
  const instrs: Rec[] = Array.isArray(instrRow?.value) ? instrRow!.value : [];
  const me = instrs.find((i) => String(i?.username ?? "").toLowerCase() === username);
  if (!me) return json({ error: "somente instrutores enviam atestado" }, 403);

  // 4) Decodifica e grava no bucket privado.
  let bytes: Uint8Array;
  try {
    const bin = atob(fileBase64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return json({ error: "base64 inválido" }, 400);
  }

  const path = `${me.id}_${Date.now()}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) return json({ error: "falha ao gravar o arquivo: " + error.message }, 500);

  return json({ ok: true, path });
});
