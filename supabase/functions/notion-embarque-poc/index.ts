// RelyOn 360 — Edge Function `notion-embarque-poc`  (NOTION-OFFSHORE.md — Fase 0)
//
// PROVA DE CONCEITO, SOMENTE LEITURA. Não grava nada em lugar nenhum — nem no
// Notion (a conexão usada só tem capacidade "Read content", ver NOTION-OFFSHORE.md
// §2), nem no Supabase (essa função não toca em nenhuma tabela). Só consulta a
// database Embarque no Notion e devolve JSON normalizado, pra validar que a
// conexão/token/IDs estão certos antes de construir o espelho de verdade (Fase 1).
//
// Requer secrets: NOTION_TOKEN, NOTION_EMBARQUE_DB_ID (Project Settings → Edge
// Functions → Secrets).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const NOTION_VERSION = "2022-06-28";

// deno-lint-ignore no-explicit-any
type Rec = Record<string, any>;

async function notionFetch(path: string, token: string, init?: RequestInit, notionVersion = NOTION_VERSION) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Notion API ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function plainText(richText: Rec[] | undefined): string {
  if (!Array.isArray(richText)) return "";
  return richText.map((t) => t?.plain_text ?? "").join("");
}

// Cobre tanto propriedade "date" crua quanto "formula" que resulta em date
// (caso do Folga, que é fórmula calculada a partir do Embarque no Notion).
function extractDateRange(prop: Rec | undefined): { start: string | null; end: string | null } {
  if (!prop) return { start: null, end: null };
  if (prop.type === "date" && prop.date) {
    return { start: prop.date.start ?? null, end: prop.date.end ?? null };
  }
  if (prop.type === "formula" && prop.formula?.type === "date" && prop.formula.date) {
    return { start: prop.formula.date.start ?? null, end: prop.formula.date.end ?? null };
  }
  return { start: null, end: null };
}

// Cobre select / status / multi_select / rich_text / title / formula(string|select),
// pra não quebrar caso a suposição de tipo (feita por screenshot) esteja errada.
function extractText(prop: Rec | undefined): string | null {
  if (!prop) return null;
  switch (prop.type) {
    case "select":
      return prop.select?.name ?? null;
    case "status":
      return prop.status?.name ?? null;
    case "multi_select":
      return (prop.multi_select ?? []).map((s: Rec) => s.name).join(", ") || null;
    case "rich_text":
      return plainText(prop.rich_text) || null;
    case "title":
      return plainText(prop.title) || null;
    case "formula": {
      const f = prop.formula;
      if (f?.type === "string") return f.string ?? null;
      if (f?.type === "select") return f.select?.name ?? null;
      if (f?.type === "number") return f.number != null ? String(f.number) : null;
      return null;
    }
    default:
      return null;
  }
}

async function resolvePageTitle(pageId: string, token: string, cache: Map<string, string>): Promise<string> {
  if (cache.has(pageId)) return cache.get(pageId)!;
  try {
    const page = await notionFetch(`/pages/${pageId}`, token);
    const props = page?.properties ?? {};
    const titleProp = (Object.values(props) as Rec[]).find((p) => p?.type === "title");
    const title = plainText(titleProp?.title) || "(sem nome)";
    cache.set(pageId, title);
    return title;
  } catch {
    cache.set(pageId, "(erro ao resolver)");
    return "(erro ao resolver)";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const token = Deno.env.get("NOTION_TOKEN");
  let dbId = Deno.env.get("NOTION_EMBARQUE_DB_ID");
  if (!token || !dbId) {
    return json({ error: "NOTION_TOKEN ou NOTION_EMBARQUE_DB_ID não configurados nos secrets" }, 500);
  }

  const url = new URL(req.url);
  // Override temporário só pra teste manual da Fase 0 (o ID configurado no
  // secret é o da PÁGINA; o da database de verdade veio do modo ?discover=1).
  const dbIdOverride = url.searchParams.get("db_id");
  if (dbIdOverride) dbId = dbIdOverride;
  const nv = url.searchParams.get("nv") || NOTION_VERSION;

  if (url.searchParams.get("retrieve") === "1") {
    try {
      const database = await notionFetch(`/databases/${dbId}`, token, undefined, nv);
      return json(database);
    } catch (err) {
      return json({ error: String(err instanceof Error ? err.message : err) }, 500);
    }
  }

  if (url.searchParams.get("query_ds") === "1") {
    const dsId = url.searchParams.get("ds_id") || dbId;
    try {
      const result = await notionFetch(`/data_sources/${dsId}/query`, token, {
        method: "POST",
        body: JSON.stringify({ page_size: 5 }),
      }, nv);
      return json(result);
    } catch (err) {
      return json({ error: String(err instanceof Error ? err.message : err) }, 500);
    }
  }

  if (url.searchParams.get("discover") === "1") {
    // O ID configurado é de uma PÁGINA (contém a tabela embutida, não é ela
    // mesma). Lista os blocos-filho da página pra achar o child_database.
    try {
      const children = await notionFetch(`/blocks/${dbId}/children?page_size=50`, token);
      const blocks = (children.results ?? []).map((b: Rec) => ({
        id: b.id,
        type: b.type,
        child_database_title: b.child_database?.title ?? null,
      }));
      return json({ page_id: dbId, blocks });
    } catch (err) {
      return json({ error: String(err instanceof Error ? err.message : err) }, 500);
    }
  }

  try {
    const rows: Rec[] = [];
    let cursor: string | undefined;
    do {
      const page = await notionFetch(`/databases/${dbId}/query`, token, {
        method: "POST",
        body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      });
      rows.push(...(page.results ?? []));
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);

    const instructorCache = new Map<string, string>();
    const out: Rec[] = [];
    for (const row of rows) {
      const props: Rec = row.properties ?? {};

      const instrRelation: Rec[] = props["Instrutor"]?.relation ?? [];
      const instructorNames = await Promise.all(
        instrRelation.map((r: Rec) => resolvePageTitle(r.id, token, instructorCache)),
      );

      out.push({
        notion_page_id: row.id,
        instrutor: instructorNames.join(", ") || null,
        cliente: extractText(props["Cliente"]),
        unidade: extractText(props["Unidade"]),
        status: extractText(props["Status"]),
        traslado: extractDateRange(props["Traslado"]),
        embarque: extractDateRange(props["Embarque"]),
        folga: extractDateRange(props["Folga"]),
      });
    }

    // Debug leve: nomes e tipos reais das propriedades da 1ª linha, pra validar
    // as suposições do plano (ex.: Cliente/Unidade são mesmo "select"?) sem
    // precisar despejar o payload inteiro do Notion.
    const debugPropertyTypes = rows[0]
      ? Object.fromEntries(
        Object.entries(rows[0].properties as Rec).map(([k, v]) => [k, (v as Rec).type]),
      )
      : null;

    return json({
      imported: out.length,
      synced_at: new Date().toISOString(),
      debug_property_types: debugPropertyTypes,
      rows: out,
    });
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
