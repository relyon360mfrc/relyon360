const REQUEST_TYPES = [
  { id: "folga_dia",  label: "Folga — 1 dia",               period: "single", absType: "planejada",    absCat: "Folga Banco de Horas" },
  { id: "folga_dias", label: "Folga — Mais dias",            period: "range",  absType: "planejada",    absCat: "Folga Banco de Horas" },
  { id: "ferias",     label: "Férias",                       period: "range",  absType: "planejada",    absCat: "Férias" },
  { id: "abono_aniversario", label: "Folga — Abono Aniversário", period: "single", absType: "planejada", absCat: "Folga Abonada" },
  { id: "exame",      label: "Folga para Exame ou Consulta", period: "single", absType: "involuntario", absCat: "Consultas e Exames (com declaração)" },
  // "doenca" virou LEGADO em 2026-07-15: o caminho novo é "atestado" (foto validada pelo
  // QSMS). O id continua existindo pra renderizar o histórico E pro atalho "ainda não
  // tenho atestado, só avisar que estou doente hoje" dentro do AtestadoWizard.
  { id: "doenca",     label: "Estou doente",                 period: "none",   absType: "involuntario", absCat: "Atestado Médico", legacy: true },
  // qsmsFlow: aprovação acontece na página Ausência (subaba Atestado Médico), pelo papel
  // qsms — NÃO pelo planejador (sigilo do CID; ver relOf e AbsenteismoPage em admin.js).
  { id: "atestado",   label: "Atestado Médico",              period: "range",  absType: "involuntario", absCat: "Atestado Médico", qsmsFlow: true },
  { id: "outro",         label: "Outro motivo",                 period: "none",   absType: "involuntario", absCat: "Falta" },
  { id: "reivindicacao", label: "Reivindicar Programação",      period: "claim" },
];

// Categorias de ausência que são benefício trabalhista — só existem pra CLT
// (inclui CLT Offshore). Pra Freelancer/PJ, aprovar uma solicitação desse tipo
// marca os dias como Livre em vez de criar a ausência (ver doApprove).
const CLT_ONLY_ABS_CATEGORIES = ["Folga Banco de Horas", "Férias"];

const rtLabel = (id) => REQUEST_TYPES.find(t => t.id === id)?.label || id;

// ── Ciclo de vida: 4 estágios derivados (não digitados) ────────────────────────
// aberto → andamento (após ciente) → fechado (aprovado, até a data de conclusão)
//                                   → finalizado (aprovado após a data | não aprovado na hora)
// excluida = soft-delete, preserva o LOG.
const STAGE = {
  aberto:     { label: "Em aberto",   color: "#ffa619", bg: "#3a2e15" },
  andamento:  { label: "Em andamento", color: "#38bdf8", bg: "#0c3a4a" },
  fechado:    { label: "Fechado",     color: "#4ade80", bg: "#14532d" },
  finalizado: { label: "Finalizado",  color: "#94a3b8", bg: "#1e293b" },
  excluida:   { label: "Excluída",    color: "#f87171", bg: "#450a0a" },
};
const STAGE_ORDER = ["aberto", "andamento", "fechado", "finalizado", "excluida"];

function lifecycleStage(req, todayStr) {
  if (req.status === "excluida") return "excluida";
  if (req.status === "rejeitada") return "finalizado"; // não aprovado finaliza na hora
  if (req.status === "aprovada") {
    const concl = req.endDate || req.startDate || "";
    return (concl && todayStr > concl) ? "finalizado" : "fechado";
  }
  // status pendente
  return req.cienteAt ? "andamento" : "aberto";
}

const decisionLabel = (req) =>
  req.status === "aprovada" ? "APROVADO" :
  req.status === "rejeitada" ? "NÃO APROVADO" : null;

// ── Reivindicação de Programação (claim) ───────────────────────────────────────
// Tipos de APOIO oferecidos ao instrutor = subconjunto "apoio interno" das
// atividades da Linha do Tempo (ACTIVITY_TYPES, em constants.js). Reaproveita os
// mesmos tipos — sem criar nada novo em paleta/bônus/relatórios.
const CLAIM_APOIO_TYPES = ["maintenance", "development", "customer_service", "almoxarifado", "cenario", "marketing", "qsms", "material_pdi"];
// Funções oferecidas ao "Entrar na equipe" (chaves de ROLE_PT em constants.js).
const CLAIM_ROLE_OPTS = ["Assistant Instructor", "Practical Instructor", "Theoretical Instructor", "Scuba Diver", "Translator"];

const _rolePt = (r) => (typeof ROLE_PT !== "undefined" && ROLE_PT[r]) || r || "—";
const _apoioLabel = (t) => (typeof ACTIVITY_TYPES !== "undefined" && ACTIVITY_TYPES[t]?.label) || t;

// Rótulo humano da reivindicação (mostrado na lista/cabeçalho/LOG).
function buildClaimLabel(claim) {
  if (!claim) return "";
  if (claim.reason === "apoio") return `Apoio: ${_apoioLabel(claim.activityType)}`;
  const verb = claim.action === "assumir" ? "Assumir vaga" : "Entrar na equipe";
  return `${claim.className || "Turma"} · ${claim.module || ""} (${verb})`;
}

// Antes → depois para o planejador conferir no momento de aprovar.
function claimBeforeAfter(claim, instructorName) {
  if (!claim) return null;
  if (claim.reason === "apoio") {
    return {
      before: "— (sem registro na Linha do Tempo)",
      after: `${_apoioLabel(claim.activityType)} · ${claim.startTime}–${claim.endTime} · ${instructorName}`,
    };
  }
  const where = `${claim.className || ""} · ${claim.module || ""} · ${claim.local || "local a definir"} · ${claim.startTime}–${claim.endTime}`;
  if (claim.action === "assumir") {
    return {
      before: `${where} · ${claim.displacedInstructorName || "—"} (${_rolePt(claim.role)})`,
      after: `${where} · ${instructorName} (${_rolePt(claim.role)})`,
    };
  }
  return {
    before: `${where} · equipe atual`,
    after: `${where} · + ${instructorName} (${_rolePt(claim.role)})`,
  };
}

const _isInvalidInstructorId = (id) =>
  id == null || id === "" || id === "undefined" || id === "null" || id === "NaN";

const _pad = n => String(n).padStart(2, "0");
function genProtocol(iso, seq) {
  const d = iso ? new Date(iso) : new Date();
  return `${_pad(d.getDate())}${_pad(d.getMonth() + 1)}${d.getFullYear()}-${_pad(d.getHours())}${_pad(d.getMinutes())}-${seq}`;
}

function fmtDateTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
const fmtDate = (s) => {
  if (!s) return "";
  try { return new Date(s + "T12:00:00").toLocaleDateString("pt-BR"); } catch { return s; }
};
const periodStr = (req) =>
  req.startDate
    ? (req.startDate === req.endDate || !req.endDate ? fmtDate(req.startDate) : `${fmtDate(req.startDate)} a ${fmtDate(req.endDate)}`)
    : "Período a definir";

// ── Aviso ao DP (Férias / Abono Aniversário) ───────────────────────────────────
// Ao aprovar uma solicitação desses tipos que gere ausência real (não Freelancer
// tratado como Livre), anexamos um `dpNotify` pendente à solicitação — com o e-mail
// já pronto. O envio de fato acontece depois, via cowork (Outlook logado do
// planejador). Enviado → dpNotify.status = "sent".
const DP_NOTIFY_EMAILS_BASE = "programacao@safetyservice.net; monica.lima@relyon.com";
// Destinatário extra por tipo: José Fardim aprova Férias; Maryana trata Abono Aniversário.
const DP_NOTIFY_EMAILS_BY_TYPE = {
  ferias: `${DP_NOTIFY_EMAILS_BASE}; jose.fardim@relyon.com`,
  abono_aniversario: `${DP_NOTIFY_EMAILS_BASE}; maryana.rodrigues@relyon.com`,
};
const DP_NOTIFY_TYPES = ["ferias", "abono_aniversario"];
function buildDpEmail(req, instr, startDate, endDate, approver) {
  const isFerias = req.type === "ferias";
  const nome = req.instructorName || (instr && instr.name) || "—";
  const periodo = periodStr({ startDate, endDate });
  const tipoLabel = isFerias ? "Férias" : "Folga — Abono Aniversário";
  const aprovadoEm = fmtDateTime(new Date().toISOString());
  const to = DP_NOTIFY_EMAILS_BY_TYPE[req.type] || DP_NOTIFY_EMAILS_BASE;
  const subject = isFerias
    ? `Registro de férias — ${nome} — ${periodo}`
    : `Abono de folga aniversário — ${nome} — ${periodo}`;
  // José Fardim só aprova Férias — Abono Aniversário não passa por ele, então
  // o corpo do Abono não tem o pedido de aprovação endereçado a ele.
  const body = isFerias
?`Prezados,

Solicito, por favor, o agendamento de férias conforme os dados abaixo:

Colaborador: ${nome}
Tipo: ${tipoLabel}
Período: ${periodo}
Pré aprovado no RelyOn 360º - scheduler por: ${approver} em ${aprovadoEm}

José Fardim, poderia avaliar e se possível aprovar?

Atenciosamente,
${approver}`
:`Prezados,

Solicito, por favor, o abono da folga de aniversário conforme os dados abaixo:

Colaborador: ${nome}
Tipo: ${tipoLabel}
Período: ${periodo}
Pré aprovado no RelyOn 360º - scheduler por: ${approver} em ${aprovadoEm}

Atenciosamente,
${approver}`;
  return { to, subject, body };
}

// ── Aviso ao DP (Atestado Médico validado pelo QSMS) ───────────────────────────
// MODELO-EMAIL-ATESTADO: texto PROVISÓRIO no padrão do aviso de Férias — o Matheus
// vai fornecer o modelo oficial; quando chegar, substituir destinatários/assunto/corpo
// AQUI (procurar por "MODELO-EMAIL-ATESTADO"). O CID nunca entra no e-mail.
function buildAtestadoDpEmail(req, approver) {
  const nome = req.instructorName || "—";
  const at = req.atestado || {};
  const periodo = periodStr(req);
  const validadoEm = fmtDateTime(new Date().toISOString());
  const subject = `Atestado médico — ${nome} — ${periodo}`;
  const body = `Prezados,

Informamos o registro de atestado médico conforme os dados abaixo:

Colaborador: ${nome}
Tipo: Atestado Médico
Data da consulta: ${fmtDate(at.consultDate) || "—"}
Dias de afastamento: ${at.days || "—"}
Período: ${periodo}
Validado pela equipe de Saúde (QSMS) no RelyOn 360º - scheduler por: ${approver} em ${validadoEm}

O documento original está arquivado com a equipe de Saúde.

Atenciosamente,
${approver}`;
  return { to: DP_NOTIFY_EMAILS_BASE, subject, body };
}

// ── Upload do atestado (foto/PDF) ───────────────────────────────────────────────
// A foto pode conter o CID (dado de saúde — LGPD): NUNCA vai pro app_state. Sobe pra
// bucket privado via edge function `atestado-upload`; leitura só via `atestado-file`
// (signed URL), que o servidor libera APENAS pro papel qsms e pro instrutor dono.
// Imagem é comprimida no cliente (max 1600px, JPEG q0.82) pra caber no plano Free.
const ATESTADO_ACCEPT = "image/*,application/pdf";
function _readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("Falha ao ler o arquivo.")); r.readAsDataURL(file); });
}
async function _compressImage(file) {
  const dataUrl = await _readAsDataURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Arquivo de imagem inválido.")); i.src = dataUrl; });
  const MAX = 1600;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
async function uploadAtestadoFile(file) {
  if (!file) throw new Error("Nenhum arquivo selecionado.");
  const isPdf = file.type === "application/pdf";
  // PDF sobe cru (precisa caber no corpo da requisição da edge function); imagem pode
  // ser grande — ela é comprimida localmente antes de subir.
  if (isPdf && file.size > 8 * 1024 * 1024) throw new Error("PDF muito grande (máx. 8MB) — envie uma foto do atestado.");
  if (!isPdf && file.size > 25 * 1024 * 1024) throw new Error("Imagem muito grande (máx. 25MB).");
  const dataUrl = isPdf ? await _readAsDataURL(file) : await _compressImage(file);
  const contentType = isPdf ? "application/pdf" : "image/jpeg";
  const fileBase64 = String(dataUrl).split(",")[1];
  const { data, error } = await sb.functions.invoke("atestado-upload", { body: { fileBase64, contentType } });
  if (error || !data?.path) throw new Error((data && data.error) || (error && error.message) || "Falha no upload do atestado.");
  return { path: data.path, type: contentType };
}

let _msgCounter = 0;
const mkMsg = (role, name, text, kind) => ({
  id: `${Date.now()}-${_msgCounter++}`,
  at: new Date().toISOString(),
  role, name, text, kind: kind || "chat",
});

// ── Painel de Avisos ao DP pendentes (Férias/Abono aprovados) ──────────────────
// Mostra a fila de dpNotify. Três estados possíveis em dpNotify.status:
//   "pending" — aprovado, ninguém mexeu ainda (nem a rotina automática)
//   "drafted" — a rotina agendada (cowork) já compôs o rascunho no Outlook;
//               existe só pra evitar que a rotina componha o MESMO aviso de novo
//               a cada execução (rascunho duplicado). Setado via SQL direto pela
//               rotina, nunca pela UI (ver EXECUTE.md §11 e DESIGN §35).
//   "sent"    — enviado de fato (some da fila).
// Ponte manual: abre o Outlook Web já preenchido (deeplink) e permite marcar como enviado.
function DpNotifyPanel({ pending, drafted, onMarkSent }) {
  const [open, setOpen] = useState(true);
  const items = [...(pending || []), ...(drafted || [])];
  if (!items.length) return null;
  const openOutlook = (n) => {
    const url = "https://outlook.office.com/mail/deeplink/compose?to=" +
      encodeURIComponent(n.to) + "&subject=" + encodeURIComponent(n.subject) +
      "&body=" + encodeURIComponent(n.body);
    window.open(url, "_blank", "noopener");
  };
  const copyEmail = (n) => {
    const txt = `Para: ${n.to}\nAssunto: ${n.subject}\n\n${n.body}`;
    try { navigator.clipboard.writeText(txt); } catch {}
  };
  return (
    <div style={{ background: "#3a2e15", border: "1px solid #7c5e1a", borderRadius: 10, padding: 14, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <span style={{ color: "#ffa619", fontWeight: 700, fontSize: 14, flex: 1 }}>
          📧 Avisos ao DP pendentes ({items.length})
        </span>
        <span style={{ color: "#ffa619", fontSize: 12 }}>{open ? "▼" : "▶"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map(req => {
            const isDrafted = req.dpNotify.status === "drafted";
            return (
              <div key={req.id} style={{ background: "#1e293b", borderRadius: 8, padding: "10px 12px" }}>
                <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, margin: "0 0 2px" }}>
                  {req.dpNotify.subject}
                </p>
                <p style={{ color: "#94a3b8", fontSize: 11, margin: "0 0 8px" }}>
                  {rtLabel(req.type)} · {req.instructorName || "—"} · {periodStr(req)}
                  {isDrafted && <span style={{ color: "#38bdf8" }}> · 📝 Rascunho já preparado no Outlook — só falta enviar</span>}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!isDrafted && <Btn onClick={() => openOutlook(req.dpNotify)} label="Abrir no Outlook" color="#0d4a5a" />}
                  {!isDrafted && <Btn onClick={() => copyEmail(req.dpNotify)} label="Copiar" color="#154753" />}
                  <Btn onClick={() => onMarkSent(req)} label="Marcar enviado" color="#166534" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComunicacaoPage({ user, instructors, requests, setRequests, absences, setAbsences, activities, setActivities, schedules, setSchedules, trainings, locals, crossbaseRequests, setCrossbaseRequests, viewBase }) {
  const isInstr   = user.role === "instructor";
  const canManage = canPlan(user); // developer | admin | planejador
  const todayStr  = new Date().toISOString().split("T")[0];
  const [commTab, setCommTab] = useState("requests"); // "requests" | "crossbase"

  const [selectedId, setSelectedId] = useState(null);
  const [showInstrCreate, setShowInstrCreate]   = useState(false);
  const [showPlannerCreate, setShowPlannerCreate] = useState(false);

  // ── Migração: corrige instructorId inválido (legado pré-fix) ──
  React.useEffect(() => {
    if (!requests || !requests.length || !instructors || !instructors.length) return;
    const needsFix = requests.some(r => _isInvalidInstructorId(r.instructorId) && r.instructorName);
    if (!needsFix) return;
    const fixed = requests.map(r => {
      if (!_isInvalidInstructorId(r.instructorId)) return r;
      const match = instructors.find(i => i.name === r.instructorName);
      return match ? { ...r, instructorId: String(match.id) } : r;
    });
    if (fixed.some((r, i) => r.instructorId !== requests[i].instructorId)) setRequests(fixed);
  }, [requests, instructors, setRequests]);

  // ── Migração: atribui seq/protocolo/origin a solicitações legadas ──
  React.useEffect(() => {
    if (!requests || !requests.length) return;
    const missing = requests.filter(r => r.seq == null);
    if (!missing.length) return;
    let maxSeq = requests.reduce((m, r) => Math.max(m, r.seq || 0), 0);
    const seqMap = new Map();
    [...missing].sort((a, b) => ((a.createdAt || "") < (b.createdAt || "") ? -1 : 1))
      .forEach(r => { maxSeq += 1; seqMap.set(r.id, maxSeq); });
    setRequests(prev => prev.map(r => {
      if (r.seq != null) return r;
      const s = seqMap.get(r.id);
      return { ...r, seq: s, protocol: genProtocol(r.createdAt, s), origin: r.origin || "instructor", messages: r.messages || [] };
    }));
  }, [requests, setRequests]);

  const allRequests = requests || [];
  const nextSeq = () => allRequests.reduce((m, r) => Math.max(m, r.seq || 0), 0) + 1;

  const updateRequest = (id, patch) =>
    setRequests(prev => (prev || []).map(r => String(r.id) === String(id) ? { ...r, ...patch } : r));
  const saveRequest = (req) => setRequests(prev => [...(prev || []), req]);

  // Aviso ao DP: fila de pendentes/rascunhos + marcar como enviado (após envio via Outlook/cowork)
  const pendingDp = allRequests.filter(r => r.dpNotify && r.dpNotify.status === "pending" && r.status === "aprovada");
  const draftedDp = allRequests.filter(r => r.dpNotify && r.dpNotify.status === "drafted" && r.status === "aprovada");
  const markDpSent = (req) => updateRequest(req.id, {
    dpNotify: { ...req.dpNotify, status: "sent", sentAt: new Date().toISOString(), sentBy: user.name },
  });

  // appendMsg: devolve a lista de mensagens já com a nova entrada (LOG append-only)
  const withMsg = (req, msg) => [...(req.messages || []), msg];

  // ── Relação do usuário com a solicitação ──────────────────────────────────
  // owner    = quem pode editar/excluir (criador)
  // approver = quem dá ciente e decide (lado oposto da origem)
  // party    = qualquer um dos dois lados (pode conversar)
  const relOf = (req) => {
    const planner = canManage;
    const thisInstr = isInstr && String(user.id) === String(req.instructorId);
    if (req.origin === "planner") {
      // Após o instrutor dar ciente, o planejador também pode aprovar/rejeitar —
      // cobre o caso em que o instrutor confirma por chat ("Positivo") em vez de clicar Aprovar.
      const plannerCanApprove = planner && !!req.cienteAt;
      return { owner: planner, approver: thisInstr || plannerCanApprove, party: planner || thisInstr };
    }
    // Atestado: quem valida é o QSMS, na página Ausência (sigilo do CID) — o planejador
    // acompanha e conversa, mas NÃO aprova/rejeita por aqui.
    if (req.type === "atestado") return { owner: thisInstr, approver: false, party: planner || thisInstr };
    return { owner: thisInstr, approver: planner, party: planner || thisInstr };
  };

  // ── Ações ─────────────────────────────────────────────────────────────────
  const giveCiente = (req) => {
    const at = new Date().toISOString();
    const msg = mkMsg("system", user.name, `Ciente registrado por ${user.name} em ${fmtDateTime(at)}. Aguarde uma decisão.`, "ciente");
    updateRequest(req.id, { cienteAt: at, cienteBy: user.name, messages: withMsg(req, msg) });
    if (req.origin === "instructor") {
      createNotification({
        instructorId: req.instructorId, type: "request_update",
        title: `Solicitação ${req.protocol || ""}: ciente registrado`,
        body: `Ciente por ${user.name}. Aguarde uma decisão.`,
      });
    }
  };

  // Materializa uma reivindicação aprovada: lança a programação no store certo.
  // Retorna { ok, result, logLine } ou { ok:false, error } (error "cancelado" = planejador desistiu no aviso de conflito).
  const materializeClaim = (req) => {
    const c = req.claim;
    if (!c) return { ok: true, result: null, logLine: "" }; // reivindicação legada sem payload estruturado → só aprova
    const instrName = req.instructorName;
    const instrId = +req.instructorId;
    const warnConflict = (date, sT, eT, excludeRowId) => {
      const conf = scheduleSlotConflict(schedules, { date, startTime: sT, endTime: eT, instructorId: instrId, excludeRowId });
      if (conf.instrConflict) {
        return window.confirm(`Atenção: ${instrName} já tem programação que sobrepõe ${sT}–${eT} em ${fmtDate(date)}. Aprovar mesmo assim?`);
      }
      return true;
    };

    // APOIO → cria atividade na Linha do Tempo (relyon_activities)
    if (c.reason === "apoio") {
      if (!warnConflict(c.date, c.startTime, c.endTime)) return { ok: false, error: "cancelado" };
      const actId = newScheduleId();
      setActivities(prev => [...(prev || []), {
        id: actId, type: c.activityType, date: c.date,
        instructorId: instrId, instructorName: instrName,
        startTime: c.startTime, endTime: c.endTime, obs: c.obs || req.obs || "",
      }]);
      return { ok: true, result: { kind: "apoio", activityIds: [actId] },
        logLine: `LANÇADO Apoio "${_apoioLabel(c.activityType)}" ${c.startTime}–${c.endTime} em ${fmtDate(c.date)} para ${instrName}.` };
    }

    // INSTRUÇÃO → toca relyon_schedules. Revalida a row alvo (pode ter mudado desde o pedido).
    const target = schedules.find(s => String(s.id) === String(c.targetRowId));
    if (!target) return { ok: false, error: "A turma/vaga reivindicada não existe mais (a programação mudou desde o pedido). Revise com o instrutor antes de aprovar." };

    if (c.action === "assumir") {
      // Conflito = o reivindicante já está ocupado nesse horário em OUTRA row.
      if (!warnConflict(target.date, target.startTime, target.endTime, target.id)) return { ok: false, error: "cancelado" };
      const prevInstrName = target.instructorName, prevInstrId = target.instructorId;
      setSchedules(prev => prev.map(s => String(s.id) === String(target.id)
        ? { ...s, instructorId: instrId, instructorName: instrName, local: c.local || s.local }
        : s));
      return { ok: true,
        result: { kind: "assumir", changedRowIds: [target.id], prevInstructorId: prevInstrId, prevInstructorName: prevInstrName, prevLocal: target.local },
        logLine: `LANÇADO: ${instrName} assumiu "${target.className} · ${target.module}" (${_rolePt(target.role)}) ${target.startTime}–${target.endTime} em ${fmtDate(target.date)}, no lugar de ${prevInstrName || "—"}.` };
    }

    // entrar na equipe → nova row no mesmo classId/módulo, com a função escolhida.
    if (!warnConflict(target.date, target.startTime, target.endTime)) return { ok: false, error: "cancelado" };
    const newId = newScheduleId();
    const row = {
      id: newId, classId: target.classId, trainingId: target.trainingId, trainingName: target.trainingName,
      className: target.className, date: target.date, startTime: target.startTime, endTime: target.endTime,
      local: c.local || target.local || "", instructorId: instrId, instructorName: instrName,
      module: target.module, moduleId: target.moduleId, role: c.role || "Assistant Instructor",
      studentCount: target.studentCount || "", observation: target.observation || "",
      status: "Programado", base: target.base || null, planningType: target.planningType || "base",
      ...(target.linkedClassNames ? { linkedClassNames: target.linkedClassNames } : {}),
    };
    setSchedules(prev => [...prev, row]);
    return { ok: true, result: { kind: "entrar", createdRowIds: [newId] },
      logLine: `LANÇADO: ${instrName} entrou na equipe de "${target.className} · ${target.module}" como ${_rolePt(row.role)}, ${target.startTime}–${target.endTime} em ${fmtDate(target.date)}.` };
  };

  const doApprove = (req, startDate, endDate, feedback) => {
    // Reivindicação de Programação: aprovar LANÇA a programação no store certo
    // (schedules/activities) e finaliza. O instrutor autorou a alteração; o planejador só aprova.
    if (req.type === "reivindicacao") {
      const m = materializeClaim(req);
      if (!m.ok) { if (m.error && m.error !== "cancelado") alert(m.error); return; }
      const at = new Date().toISOString();
      const msg = mkMsg("system", user.name,
        `APROVADO por ${user.name} em ${fmtDateTime(at)}.${feedback ? " Feedback: " + feedback : ""}${m.logLine ? " " + m.logLine : ""}`, "decision");
      updateRequest(req.id, {
        status: "aprovada", approvedAt: at, approvedBy: user.name, approvalFeedback: feedback || "",
        claimResult: m.result, messages: withMsg(req, msg),
      });
      if (req.origin === "instructor") {
        createNotification({
          instructorId: req.instructorId, type: "request_update",
          title: "Reivindicação aprovada",
          body: buildClaimLabel(req.claim) || "Sua programação foi lançada.",
        });
      }
      return;
    }
    const rt = REQUEST_TYPES.find(t => t.id === req.type);
    // Benefícios trabalhistas (banco de horas, férias) só existem como conceito pra CLT
    // (inclui CLT Offshore). Freelancer/PJ não tem direito a isso — aprovar essa
    // solicitação pra eles marca os dias como Livre em vez de criar a ausência.
    const instr = instructors.find(i => String(i.id) === String(req.instructorId));
    const treatAsFree = CLT_ONLY_ABS_CATEGORIES.includes(rt?.absCat) && instr && !isClt(instr);
    let absenceId = req.absenceId;
    let activityIds = req.activityIds;
    if (!req.absenceCreated && rt?.absType) {
      if (treatAsFree) {
        const days = [];
        for (let d = startDate; d <= endDate; ) {
          days.push(d);
          const nd = new Date(d + "T12:00:00"); nd.setDate(nd.getDate() + 1); d = nd.toISOString().split("T")[0];
        }
        activityIds = days.map((_, i) => Date.now() + i);
        setActivities(prev => [...(prev || []), ...days.map((day, i) => ({
          id: activityIds[i], type: "free", date: day,
          instructorId: +req.instructorId, instructorName: req.instructorName,
          obs: req.obs || "",
          ...(req.startTime ? { startTime: req.startTime, endTime: req.endTime } : {}),
        }))]);
      } else {
        absenceId = Date.now();
        setAbsences(prev => [...(prev || []), {
          id: absenceId, instructorId: +req.instructorId, instructorName: req.instructorName,
          type: rt.absType, category: rt.absCat, startDate, endDate,
          // Full-day sem horário explícito NÃO grava startTime (convenção isInstructorAbsent).
          ...(req.startTime ? { startTime: req.startTime, endTime: req.endTime || "17:00" }
            : isFullDayAbsence(rt.absCat) ? {}
            : { startTime: "08:00", endTime: "17:00" }),
          obs: req.obs || "",
        }]);
      }
    }
    const at = new Date().toISOString();
    const msg = mkMsg("system", user.name,
      `APROVADO por ${user.name} em ${fmtDateTime(at)}.${feedback ? " Feedback: " + feedback : ""} Período: ${periodStr({ startDate, endDate })}.`, "decision");
    // Enfileira aviso ao DP quando aprovamos Férias/Abono que virou ausência real
    // (Freelancer tratado como Livre não gera aviso — não é benefício trabalhista dele).
    let dpNotify = req.dpNotify;
    if (!treatAsFree && DP_NOTIFY_TYPES.includes(req.type) && (!dpNotify || dpNotify.status !== "sent")) {
      dpNotify = { status: "pending", queuedAt: at, ...buildDpEmail(req, instr, startDate, endDate, user.name) };
    }
    updateRequest(req.id, {
      status: "aprovada", approvedAt: at, approvedBy: user.name, approvalFeedback: feedback || "",
      startDate, endDate, absenceId, activityIds, absenceCreated: true, dpNotify, messages: withMsg(req, msg),
    });
    if (req.origin === "instructor") {
      createNotification({
        instructorId: req.instructorId, type: "request_update",
        title: `Solicitação aprovada: ${rt?.label || req.type}`,
        body: (feedback ? feedback + " — " : "") + periodStr({ startDate, endDate }),
      });
    }
  };

  const doReject = (req, reason) => {
    const at = new Date().toISOString();
    const msg = mkMsg("system", user.name,
      `NÃO APROVADO por ${user.name} em ${fmtDateTime(at)}.${reason ? " Motivo: " + reason : ""}`, "decision");
    updateRequest(req.id, {
      status: "rejeitada", rejectedAt: at, rejectedBy: user.name, rejectionReason: reason || "",
      messages: withMsg(req, msg),
    });
    if (req.origin === "instructor") {
      createNotification({
        instructorId: req.instructorId, type: "request_update",
        title: `Solicitação não aprovada: ${rtLabel(req.type)}`,
        body: reason || "Sem motivo informado.",
      });
    }
  };

  const editRequest = (req, changes) => {
    const labelMap = { type: "Tipo", startDate: "Início", endDate: "Término", obs: "Observação" };
    const fmtVal = (k, v) => k === "type" ? rtLabel(v) : (k === "startDate" || k === "endDate") ? (fmtDate(v) || "—") : (v || "—");
    const diffs = Object.keys(changes)
      .filter(k => (req[k] || "") !== (changes[k] || ""))
      .map(k => `${labelMap[k] || k}: "${fmtVal(k, req[k])}" → "${fmtVal(k, changes[k])}"`);
    if (!diffs.length) return;
    const msg = mkMsg("system", user.name, `Solicitação alterada por ${user.name} em ${fmtDateTime(new Date().toISOString())}. ${diffs.join("; ")}.`, "edit");
    updateRequest(req.id, { ...changes, messages: withMsg(req, msg) });
    if (req.origin === "planner" && req.instructorId) {
      createNotification({
        instructorId: req.instructorId, type: "request_update",
        title: `Solicitação ${req.protocol || ""} alterada`, body: diffs.join("; "),
      });
    }
  };

  const sendMessage = (req, text) => {
    const t = (text || "").trim();
    if (!t) return;
    const role = canManage ? "planner" : "instructor";
    updateRequest(req.id, { messages: withMsg(req, mkMsg(role, user.name, t, "chat")) });
  };

  // Edição de atestado (instrutor, enquanto aguarda validação): TODA alteração vira
  // entrada no LOG (o quê mudou e quando — exigência do fluxo QSMS) e a pré-ausência
  // vinculada é re-sincronizada com o novo período.
  const editAtestado = (req, changes) => {
    const prev = req.atestado || {};
    const days = Math.max(1, Math.floor(+changes.days || 0));
    const diffs = [];
    if ((prev.consultDate || "") !== changes.consultDate) diffs.push(`Data da consulta: "${fmtDate(prev.consultDate) || "—"}" → "${fmtDate(changes.consultDate)}"`);
    if (String(prev.days || "") !== String(days)) diffs.push(`Dias de atestado: "${prev.days || "—"}" → "${days}"`);
    if (changes.filePath && changes.filePath !== prev.filePath) diffs.push("Arquivo do atestado substituído");
    if (!diffs.length) return;
    const startDate = changes.consultDate;
    const endDate = addDaysIso(startDate, days - 1);
    const msg = mkMsg("system", user.name, `Atestado alterado por ${user.name} em ${fmtDateTime(new Date().toISOString())}. ${diffs.join("; ")}.`, "edit");
    updateRequest(req.id, {
      startDate, endDate,
      atestado: { ...prev, consultDate: startDate, days, ...(changes.filePath ? { filePath: changes.filePath, fileType: changes.fileType } : {}) },
      messages: withMsg(req, msg),
    });
    if (req.absenceId) setAbsences(prevAbs => (prevAbs || []).map(a => a.id === req.absenceId ? { ...a, startDate, endDate } : a));
  };

  // Instrutor pede exclusão → precisa aprovação do planejador
  const requestDeletion = (req, reason) => {
    const at = new Date().toISOString();
    const msg = mkMsg("system", user.name, `Exclusão SOLICITADA por ${user.name} em ${fmtDateTime(at)}. Motivo: ${reason}`, "delete");
    updateRequest(req.id, { deleteStatus: "pending", deleteReason: reason, deleteRequestedBy: user.name, deleteRequestedAt: at, messages: withMsg(req, msg) });
  };

  const _removeLinkedAbsence = (req) => {
    if (req.absenceId) setAbsences(prev => (prev || []).filter(a => a.id !== req.absenceId));
    if (req.activityIds?.length) setActivities(prev => (prev || []).filter(a => !req.activityIds.includes(a.id)));
    // Desfaz o que uma reivindicação aprovada lançou (best-effort).
    const cr = req.claimResult;
    if (cr) {
      if (cr.activityIds?.length) setActivities(prev => (prev || []).filter(a => !cr.activityIds.includes(a.id)));
      if (cr.createdRowIds?.length) setSchedules(prev => (prev || []).filter(s => !cr.createdRowIds.map(String).includes(String(s.id))));
      // "assumir" trocou o instrutor de uma row existente — restaura o anterior se a row
      // ainda existir e continuar com o reivindicante (best-effort; não força se mudou de novo).
      if (cr.kind === "assumir" && cr.changedRowIds?.length) {
        setSchedules(prev => (prev || []).map(s =>
          cr.changedRowIds.map(String).includes(String(s.id)) && String(s.instructorId) === String(req.instructorId)
            ? { ...s, instructorId: cr.prevInstructorId ?? null, instructorName: cr.prevInstructorName || "", local: cr.prevLocal ?? s.local }
            : s));
      }
    }
  };

  // Planejador aprova a exclusão pedida pelo instrutor
  const approveDeletion = (req) => {
    const at = new Date().toISOString();
    const msg = mkMsg("system", user.name, `Exclusão APROVADA por ${user.name} em ${fmtDateTime(at)}.`, "delete");
    _removeLinkedAbsence(req);
    updateRequest(req.id, { status: "excluida", deleteStatus: "approved", deletedBy: user.name, deletedAt: at, messages: withMsg(req, msg) });
    createNotification({
      instructorId: req.instructorId, type: "request_update",
      title: `Solicitação ${req.protocol || ""} excluída`, body: `Sua solicitação de exclusão foi aprovada por ${user.name}.`,
    });
    setSelectedId(null);
  };

  const refuseDeletion = (req, reason) => {
    const at = new Date().toISOString();
    const msg = mkMsg("system", user.name, `Pedido de exclusão RECUSADO por ${user.name} em ${fmtDateTime(at)}.${reason ? " Motivo: " + reason : ""}`, "delete");
    updateRequest(req.id, { deleteStatus: "refused", messages: withMsg(req, msg) });
    createNotification({
      instructorId: req.instructorId, type: "request_update",
      title: `Exclusão recusada — ${req.protocol || ""}`, body: reason || "Pedido de exclusão recusado.",
    });
  };

  // Planejador exclui direto → instrutor é notificado
  const deleteDirect = (req, reason) => {
    const at = new Date().toISOString();
    const msg = mkMsg("system", user.name, `EXCLUÍDA por ${user.name} em ${fmtDateTime(at)}. Motivo: ${reason}`, "delete");
    _removeLinkedAbsence(req);
    updateRequest(req.id, { status: "excluida", deleteStatus: "direct", deletedBy: user.name, deletedAt: at, deleteReason: reason, messages: withMsg(req, msg) });
    if (req.instructorId) {
      createNotification({
        instructorId: req.instructorId, type: "request_update",
        title: `Solicitação ${req.protocol || ""} excluída`, body: `Excluída por ${user.name}. Motivo: ${reason}`,
      });
    }
    setSelectedId(null);
  };

  const selected = allRequests.find(r => String(r.id) === String(selectedId)) || null;

  const pendingCrossbase = Array.isArray(crossbaseRequests)
    ? crossbaseRequests.filter(r => r.status === "pending" && r.targetBase === viewBase).length
    : 0;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <h2 style={{ color: "#e2e8f0", fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Comunicação</h2>

      {/* Seletor de abas — só para planejadores */}
      {canManage && (
        <div style={{ display:"flex", gap:8, marginBottom:20, borderBottom:"1px solid #154753", paddingBottom:0 }}>
          {[
            { key:"requests", label:"Solicitações" },
            { key:"crossbase", label:`Req. de Escala${pendingCrossbase > 0 ? ` (${pendingCrossbase})` : ""}` },
          ].map(t => (
            <button key={t.key} onClick={() => setCommTab(t.key)}
              style={{ padding:"8px 16px", background:"transparent", border:"none", borderBottom: commTab===t.key ? "2px solid #ffa619" : "2px solid transparent", color: commTab===t.key ? "#ffa619" : "#64748b", fontWeight: commTab===t.key ? 700 : 400, fontSize:14, cursor:"pointer", marginBottom:-1 }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {(!canManage || commTab === "requests") && (
        canManage ? (
          <div>
            <DpNotifyPanel pending={pendingDp} drafted={draftedDp} onMarkSent={markDpSent} />
            <GestaoTab
              requests={allRequests} todayStr={todayStr}
              onOpen={setSelectedId} onRegister={() => setShowPlannerCreate(true)} />
          </div>
        ) : (
          <RequisicaoTab
            user={user} instructors={instructors}
            myRequests={allRequests.filter(r => String(r.instructorId) === String(user.id))}
            todayStr={todayStr} onOpen={setSelectedId}
            onNew={() => setShowInstrCreate(true)} />
        )
      )}

      {canManage && commTab === "crossbase" && (
        <CrossbaseTab
          crossbaseRequests={crossbaseRequests || []}
          setCrossbaseRequests={setCrossbaseRequests}
          viewBase={viewBase}
          instructors={instructors}
          user={user} />
      )}

      {/* Criação pelo instrutor */}
      {showInstrCreate && (
        <InstrCreateModal
          user={user} instructors={instructors} nextSeq={nextSeq}
          schedules={schedules} trainings={trainings} locals={locals}
          onSave={saveRequest} onCreateAbsence={(a) => setAbsences(prev => [...(prev || []), a])}
          onClose={() => setShowInstrCreate(false)} />
      )}

      {/* Registro pelo planejador (instrutor aprova) */}
      {showPlannerCreate && (
        <PlannerCreateModal
          user={user} instructors={instructors} nextSeq={nextSeq}
          onSave={saveRequest} onClose={() => setShowPlannerCreate(false)} />
      )}

      {/* Detalhe + chat/LOG */}
      {selected && (
        <TicketModal
          req={selected} user={user} rel={relOf(selected)} stage={lifecycleStage(selected, todayStr)}
          onClose={() => setSelectedId(null)}
          onCiente={giveCiente} onApprove={doApprove} onReject={doReject}
          onEdit={editRequest} onEditAtestado={editAtestado} onSend={sendMessage}
          onRequestDeletion={requestDeletion} onApproveDeletion={approveDeletion}
          onRefuseDeletion={refuseDeletion} onDeleteDirect={deleteDirect} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Aba GESTÃO (planejador)
// ════════════════════════════════════════════════════════════════════════════
function GestaoTab({ requests, todayStr, onOpen, onRegister }) {
  const [filter, setFilter] = useState("aberto");
  const staged = requests.map(r => ({ r, st: lifecycleStage(r, todayStr) }));
  const counts = STAGE_ORDER.reduce((acc, s) => { acc[s] = staged.filter(x => x.st === s).length; return acc; }, {});
  const pendingDeletions = requests.filter(r => r.deleteStatus === "pending" && r.status !== "excluida").length;

  const filtered = staged.filter(x => x.st === filter).map(x => x.r).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STAGE_ORDER.map(s => {
            const sc = STAGE[s];
            return (
              <button key={s} onClick={() => setFilter(s)}
                style={{ padding: "6px 14px", borderRadius: 6, border: filter === s ? `1px solid ${sc.color}` : "1px solid #154753",
                  cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: filter === s ? sc.bg : "transparent",
                  color: filter === s ? sc.color : "#475569" }}>
                {sc.label} ({counts[s] || 0})
              </button>
            );
          })}
        </div>
        <Btn onClick={onRegister} label="+ Registrar p/ instrutor" color="#ffa619" />
      </div>

      {pendingDeletions > 0 && (
        <p style={{ color: "#f87171", fontSize: 12, margin: "0 0 12px" }}>
          ⚠ {pendingDeletions} pedido(s) de exclusão aguardando sua aprovação.
        </p>
      )}

      {filtered.length === 0 && (
        <p style={{ color: "#475569", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
          Nenhuma solicitação em "{STAGE[filter].label}".
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(req => (
          <TicketCard key={req.id} req={req} showInstructor={true} todayStr={todayStr} onOpen={() => onOpen(req.id)} />
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Aba REQUISIÇÃO (instrutor)
// ════════════════════════════════════════════════════════════════════════════
function RequisicaoTab({ user, myRequests, todayStr, onOpen, onNew }) {
  const [filter, setFilter] = useState("aberto");
  const staged = myRequests.map(r => ({ r, st: lifecycleStage(r, todayStr) }));
  const counts = STAGE_ORDER.reduce((acc, s) => { acc[s] = staged.filter(x => x.st === s).length; return acc; }, {});
  const filtered = staged.filter(x => x.st === filter).map(x => x.r).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ color: "#94a3b8", fontSize: 15, fontWeight: 600, margin: 0 }}>Minhas solicitações</h3>
        <Btn onClick={onNew} label="+ Nova Solicitação" color="#ffa619" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {STAGE_ORDER.map(s => {
          const sc = STAGE[s];
          return (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: "6px 14px", borderRadius: 6, border: filter === s ? `1px solid ${sc.color}` : "1px solid #154753",
                cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: filter === s ? sc.bg : "transparent",
                color: filter === s ? sc.color : "#475569" }}>
              {sc.label} ({counts[s] || 0})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p style={{ color: "#475569", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
          Nenhuma solicitação em "{STAGE[filter].label}".
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(req => (
          <TicketCard key={req.id} req={req} showInstructor={false} todayStr={todayStr} onOpen={() => onOpen(req.id)} />
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Card-resumo do ticket
// ════════════════════════════════════════════════════════════════════════════
function TicketCard({ req, showInstructor, todayStr, onOpen }) {
  const st = lifecycleStage(req, todayStr);
  const sc = STAGE[st];
  const dec = decisionLabel(req);
  const originTxt = req.origin === "planner"
    ? `Registrado por ${req.createdByName || "planejador"} · aprovação de ${req.instructorName}`
    : `Solicitado por ${req.instructorName}`;
  const lastMsg = (req.messages || []).filter(m => m.kind === "chat").slice(-1)[0];

  return (
    <button onClick={onOpen}
      style={{ textAlign: "left", width: "100%", background: "#073d4a",
        border: req.deleteStatus === "pending" ? "1px solid #f87171" : (req.priority && st === "aberto" ? "1px solid #ffa619" : "1px solid #154753"),
        borderRadius: 10, padding: "14px 16px", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ color: "#64748b", margin: "0 0 4px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
          Nº {req.protocol || "—"}
        </p>
        {showInstructor && (
          <p style={{ color: "#e2e8f0", fontWeight: 700, margin: "0 0 2px", fontSize: 14 }}>
            {req.deleteStatus === "pending" && <span style={{ color: "#f87171", fontSize: 11 }}>🗑 EXCLUSÃO PENDENTE · </span>}
            {req.priority && st === "aberto" && <span style={{ color: "#ffa619", fontSize: 12 }}>📌 </span>}
            {req.instructorName}
          </p>
        )}
        <p style={{ color: "#94a3b8", margin: "0 0 2px", fontSize: 13 }}>{rtLabel(req.type)}</p>
        <p style={{ color: "#64748b", margin: "0 0 2px", fontSize: 12 }}>{periodStr(req)}</p>
        <p style={{ color: "#334155", margin: "2px 0 0", fontSize: 11 }}>{originTxt}</p>
        {lastMsg && <p style={{ color: "#475569", margin: "6px 0 0", fontSize: 11, fontStyle: "italic" }}>💬 {lastMsg.name}: {lastMsg.text.slice(0, 60)}{lastMsg.text.length > 60 ? "…" : ""}</p>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
        <span style={{ background: sc.bg, color: sc.color, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{sc.label}</span>
        {dec && <span style={{ color: req.status === "aprovada" ? "#4ade80" : "#f87171", fontSize: 11, fontWeight: 700 }}>{dec}</span>}
        <span style={{ color: "#475569", fontSize: 11 }}>Abrir →</span>
      </div>
    </button>
  );
}

// Antes → depois de uma reivindicação (o que será lançado ao aprovar).
function ClaimSummary({ req, compact }) {
  const ba = claimBeforeAfter(req.claim, req.instructorName);
  if (!ba) {
    // Reivindicação legada (sem payload estruturado) — mostra o texto livre antigo.
    return req.trainingName
      ? <p style={{ color: "#fbbf24", margin: compact ? 0 : "4px 0 0", fontSize: 12 }}>Treinamento: {req.trainingName}</p>
      : null;
  }
  return (
    <div style={{ background: "#01323d", border: "1px solid #154753", borderRadius: 8, padding: "8px 10px", marginTop: compact ? 0 : 6 }}>
      <p style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700, margin: "0 0 4px", letterSpacing: "0.04em" }}>{buildClaimLabel(req.claim)}</p>
      <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}><span style={{ color: "#64748b" }}>Antes:</span> {ba.before}</p>
      <p style={{ color: "#4ade80", fontSize: 12, margin: "2px 0 0" }}><span style={{ color: "#64748b" }}>Depois:</span> {ba.after}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Modal de detalhe + chat/LOG + ações
// ════════════════════════════════════════════════════════════════════════════
function TicketModal({ req, user, rel, stage, onClose, onCiente, onApprove, onReject, onEdit, onEditAtestado, onSend,
  onRequestDeletion, onApproveDeletion, onRefuseDeletion, onDeleteDirect }) {
  const canManage = canPlan(user);
  const isOpenPhase = stage === "aberto" || stage === "andamento";
  const [text, setText] = useState("");
  const [panel, setPanel] = useState(null); // null | approve | reject | edit | delete | refuse
  const messages = req.messages || [];

  const submitChat = () => { if (text.trim()) { onSend(req, text); setText(""); } };

  return (
    <Modal title={`Solicitação Nº ${req.protocol || ""}`} onClose={onClose} width={620}>
      {/* Cabeçalho */}
      <div style={{ background: "#0d4a5a", borderRadius: 10, padding: "12px 14px", marginBottom: 16, border: "1px solid #154753" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <p style={{ color: "#e2e8f0", fontWeight: 700, margin: 0, fontSize: 15 }}>{rtLabel(req.type)}</p>
            <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: 13 }}>{periodStr(req)}</p>
            {req.fracaoDia && req.startTime && <p style={{ color: "#ffa619", margin: "2px 0 0", fontSize: 12 }}>Fração: {req.startTime} – {req.endTime}</p>}
            {req.type === "atestado" && req.atestado && (
              <div style={{ marginTop: 6 }}>
                <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>Consulta: {fmtDate(req.atestado.consultDate)} · {req.atestado.days} dia(s) de atestado</p>
                <p style={{ color: req.status === "aprovada" ? "#4ade80" : req.status === "rejeitada" ? "#f87171" : "#fbbf24", fontSize: 12, fontWeight: 700, margin: "4px 0 0" }}>
                  {req.status === "aprovada" ? "✓ Atestado validado pela equipe de saúde"
                    : req.status === "rejeitada" ? "✗ Atestado não validado pela equipe de saúde"
                    : "⏳ Aguardando validação da equipe de saúde"}
                </p>
                {rel.owner && req.atestado.filePath && (
                  <button onClick={() => openAtestadoFile(req.atestado.filePath)}
                    style={{ marginTop: 6, background: "none", border: "1px solid #38bdf840", borderRadius: 8, padding: "5px 10px", color: "#7dd3fc", fontSize: 12, cursor: "pointer" }}>
                    📎 Ver meu atestado
                  </button>
                )}
              </div>
            )}
            {req.type === "reivindicacao" ? <ClaimSummary req={req} /> : (req.trainingName && <p style={{ color: "#fbbf24", margin: "4px 0 0", fontSize: 12 }}>Treinamento: {req.trainingName}</p>)}
            {req.obs && <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 12 }}>Obs: {req.obs}</p>}
          </div>
          <span style={{ background: STAGE[stage].bg, color: STAGE[stage].color, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700, height: "fit-content" }}>
            {STAGE[stage].label}
          </span>
        </div>
        <p style={{ color: "#334155", margin: "10px 0 0", fontSize: 11 }}>
          {req.origin === "planner"
            ? `Registrado por ${req.createdByName || "planejador"} para ${req.instructorName} (aprovação do instrutor)`
            : `Solicitado por ${req.instructorName}`}
          {req.createdAt ? ` · ${fmtDateTime(req.createdAt)}` : ""}
        </p>
      </div>

      {/* LOG / chat */}
      <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, margin: "0 0 8px", letterSpacing: "0.04em" }}>HISTÓRICO (LOG)</p>
      <div style={{ background: "#01323d", borderRadius: 10, padding: 12, maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, border: "1px solid #154753" }}>
        {messages.length === 0 && <p style={{ color: "#475569", fontSize: 12, textAlign: "center", padding: "16px 0" }}>Sem mensagens ainda.</p>}
        {messages.map(m => m.kind !== "chat" ? (
          <div key={m.id} style={{ textAlign: "center" }}>
            <span style={{ color: m.kind === "decision" ? "#cbd5e1" : "#64748b", fontSize: 11, fontStyle: "italic", background: "#0d4a5a", borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
              {m.text}
            </span>
          </div>
        ) : (
          <div key={m.id} style={{ alignSelf: m.role === "planner" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
            <div style={{ background: m.role === "planner" ? "#154753" : "#073d4a", borderRadius: 10, padding: "8px 12px", border: "1px solid #1e6b7a" }}>
              <p style={{ color: m.role === "planner" ? "#7dd3fc" : "#ffa619", margin: 0, fontSize: 10, fontWeight: 700 }}>{m.name}</p>
              <p style={{ color: "#e2e8f0", margin: "2px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>{m.text}</p>
              <p style={{ color: "#475569", margin: "3px 0 0", fontSize: 9 }}>{fmtDateTime(m.at)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Entrada de chat (somente em aberto/andamento e para quem é parte) */}
      {isOpenPhase && rel.party ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitChat(); } }}
            placeholder="Escreva uma mensagem..."
            style={{ flex: 1, padding: "10px 12px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none" }} />
          <Btn onClick={submitChat} label="Enviar" color="#16a34a" />
        </div>
      ) : (
        <p style={{ color: "#475569", fontSize: 12, textAlign: "center", marginTop: 10 }}>
          🔒 Conversa encerrada — somente leitura.
        </p>
      )}

      {/* Painéis de ação */}
      {panel === "approve" && <ApprovePanel req={req} onConfirm={(s, e, f) => { onApprove(req, s, e, f); setPanel(null); }} onCancel={() => setPanel(null)} />}
      {panel === "reject" && <ReasonPanel title="Não aprovar — informe o motivo" confirmLabel="Confirmar (Não Aprovar)" color="#dc2626" onConfirm={(r) => { onReject(req, r); setPanel(null); }} onCancel={() => setPanel(null)} />}
      {panel === "edit" && (req.type === "atestado"
        ? <AtestadoEditPanel req={req} onConfirm={(c) => { onEditAtestado(req, c); setPanel(null); }} onCancel={() => setPanel(null)} />
        : <EditPanel req={req} onConfirm={(c) => { onEdit(req, c); setPanel(null); }} onCancel={() => setPanel(null)} />)}
      {panel === "delete" && <ReasonPanel title={canManage ? "Excluir — justifique a exclusão" : "Solicitar exclusão — justifique"} confirmLabel={canManage ? "Excluir definitivamente" : "Enviar pedido de exclusão"} color="#dc2626" required onConfirm={(r) => { canManage ? onDeleteDirect(req, r) : onRequestDeletion(req, r); setPanel(null); }} onCancel={() => setPanel(null)} />}
      {panel === "refuse" && <ReasonPanel title="Recusar pedido de exclusão" confirmLabel="Recusar exclusão" color="#dc2626" onConfirm={(r) => { onRefuseDeletion(req, r); setPanel(null); }} onCancel={() => setPanel(null)} />}

      {/* Botões de ação */}
      {!panel && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          {rel.approver && stage === "aberto" && req.deleteStatus !== "pending" && (
            <Btn onClick={() => onCiente(req)} label="Dar Ciente" color="#38bdf8" />
          )}
          {rel.approver && stage === "andamento" && req.deleteStatus !== "pending" && (
            <>
              <Btn onClick={() => setPanel("approve")} label="Aprovar" color="#16a34a" />
              <Btn onClick={() => setPanel("reject")} label="Não Aprovar" color="#dc2626" />
            </>
          )}
          {rel.owner && isOpenPhase && req.deleteStatus !== "pending" && (
            <Btn onClick={() => setPanel("edit")} label="Editar solicitação" color="#154753" />
          )}
          {/* Exclusão */}
          {canManage && req.deleteStatus === "pending" && (
            <>
              <Btn onClick={() => onApproveDeletion(req)} label="Aprovar exclusão" color="#dc2626" />
              <Btn onClick={() => setPanel("refuse")} label="Recusar exclusão" color="#154753" />
            </>
          )}
          {stage !== "excluida" && req.deleteStatus !== "pending" && (canManage || rel.owner) && (
            <Btn onClick={() => setPanel("delete")} label={canManage ? "Excluir" : "Solicitar exclusão"} color="#7f1d1d" />
          )}
        </div>
      )}
    </Modal>
  );
}

function ApprovePanel({ req, onConfirm, onCancel }) {
  const rt = REQUEST_TYPES.find(t => t.id === req.type);
  const needsDate = rt?.period === "none";
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(needsDate ? today : (req.startDate || today));
  const [endDate, setEndDate]     = useState(needsDate ? today : (req.endDate || req.startDate || today));
  const [feedback, setFeedback]   = useState("");
  // Reivindicação: aprovar LANÇA a programação. Mostra antes→depois e confirma.
  if (req.type === "reivindicacao") {
    return (
      <div style={{ background: "#0d4a5a", borderRadius: 10, padding: 14, marginTop: 14, border: "1px solid #16a34a" }}>
        <p style={{ color: "#4ade80", fontWeight: 700, margin: "0 0 6px", fontSize: 14 }}>Aprovar e lançar programação</p>
        <p style={{ color: "#94a3b8", fontSize: 12, margin: "0 0 10px" }}>Ao confirmar, a alteração abaixo será lançada na programação.</p>
        <ClaimSummary req={req} compact />
        <div style={{ marginTop: 10 }}>
          <Input label="Feedback ao solicitante (opcional)" value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Ex: Confirmado, obrigado!" />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Btn onClick={() => onConfirm(req.startDate || today, req.endDate || req.startDate || today, feedback)} label="Confirmar e lançar" color="#16a34a" />
          <Btn onClick={onCancel} label="Cancelar" color="#154753" />
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: "#0d4a5a", borderRadius: 10, padding: 14, marginTop: 14, border: "1px solid #16a34a" }}>
      <p style={{ color: "#4ade80", fontWeight: 700, margin: "0 0 12px", fontSize: 14 }}>Aprovar solicitação</p>
      {needsDate ? (
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="De" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <Input label="Até" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      ) : (
        <div style={{ marginBottom: 8 }}>
          <p style={{ color: "#94a3b8", fontSize: 12, margin: "0 0 2px" }}>Período: {periodStr({ startDate, endDate })}</p>
          {req.trainingName && <p style={{ color: "#fbbf24", fontSize: 12, margin: 0 }}>Treinamento: {req.trainingName}</p>}
        </div>
      )}
      <Input label="Feedback ao solicitante (opcional)" value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Ex: Aprovado, bom descanso!" />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn onClick={() => onConfirm(startDate, endDate, feedback)} label="Confirmar Aprovação" color="#16a34a" />
        <Btn onClick={onCancel} label="Cancelar" color="#154753" />
      </div>
    </div>
  );
}

function ReasonPanel({ title, confirmLabel, color, required, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  return (
    <div style={{ background: "#0d4a5a", borderRadius: 10, padding: 14, marginTop: 14, border: `1px solid ${color}` }}>
      <p style={{ color: "#e2e8f0", fontWeight: 700, margin: "0 0 12px", fontSize: 14 }}>{title}</p>
      <Input label={required ? "Justificativa (obrigatória)" : "Motivo"} value={reason} onChange={e => setReason(e.target.value)} placeholder="Descreva..." />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn onClick={() => { if (required && !reason.trim()) { alert("A justificativa é obrigatória."); return; } onConfirm(reason.trim()); }} label={confirmLabel} color={color} />
        <Btn onClick={onCancel} label="Cancelar" color="#154753" />
      </div>
    </div>
  );
}

// Edição de atestado pelo instrutor (enquanto pendente) — cada alteração vira entrada
// no LOG via editAtestado. Trocar a foto refaz o upload (o arquivo antigo permanece no
// bucket como evidência — retenção indeterminada; o metadado aponta sempre pro atual).
function AtestadoEditPanel({ req, onConfirm, onCancel }) {
  const at = req.atestado || {};
  const [form, setForm] = useState({ consultDate: at.consultDate || req.startDate || "", days: at.days || "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const days = Math.floor(+form.days || 0);
  const endDate = form.consultDate && days >= 1 ? addDaysIso(form.consultDate, days - 1) : "";
  const save = async () => {
    setErr("");
    if (!form.consultDate) { setErr("Informe a data da consulta."); return; }
    if (!days || days < 1) { setErr("Informe quantos dias constam no atestado."); return; }
    setBusy(true);
    try {
      let up = null;
      if (file) up = await uploadAtestadoFile(file);
      onConfirm({ consultDate: form.consultDate, days, ...(up ? { filePath: up.path, fileType: up.type } : {}) });
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <div style={{ background: "#0d4a5a", borderRadius: 10, padding: 14, marginTop: 14, border: "1px solid #38bdf8" }}>
      <p style={{ color: "#7dd3fc", fontWeight: 700, margin: "0 0 12px", fontSize: 14 }}>Editar atestado (toda alteração fica registrada no LOG)</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Data da consulta" type="date" value={form.consultDate} onChange={e => setForm({ ...form, consultDate: e.target.value })} />
        <Input label="Dias de atestado" type="number" value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} />
      </div>
      {endDate && <p style={{ color: "#94a3b8", fontSize: 12, margin: "-4px 0 10px" }}>Período: {fmtDate(form.consultDate)} a {fmtDate(endDate)}</p>}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#01323d", border: "1px solid #1e6b7a", borderRadius: 8, color: "#e2e8f0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        📎 Substituir arquivo do atestado (opcional)
        <input type="file" accept={ATESTADO_ACCEPT} capture="environment" style={{ display: "none" }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) setFile(f); }} />
      </label>
      {file && <p style={{ color: "#4ade80", fontSize: 12, margin: "8px 0 0" }}>Novo arquivo: {file.name || "foto capturada"}</p>}
      {err && <p style={{ color: "#f87171", fontSize: 13, margin: "10px 0 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn onClick={save} label={busy ? "Salvando..." : "Salvar alteração"} color="#16a34a" />
        <Btn onClick={onCancel} label="Cancelar" color="#154753" />
      </div>
    </div>
  );
}

function EditPanel({ req, onConfirm, onCancel }) {
  const rt = REQUEST_TYPES.find(t => t.id === req.type);
  const [form, setForm] = useState({
    type: req.type, startDate: req.startDate || "", endDate: req.endDate || "", obs: req.obs || "",
  });
  const period = REQUEST_TYPES.find(t => t.id === form.type)?.period || rt?.period || "single";
  return (
    <div style={{ background: "#0d4a5a", borderRadius: 10, padding: 14, marginTop: 14, border: "1px solid #38bdf8" }}>
      <p style={{ color: "#7dd3fc", fontWeight: 700, margin: "0 0 12px", fontSize: 14 }}>Editar solicitação (registrado no LOG)</p>
      <Sel label="Tipo / motivo" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
        opts={REQUEST_TYPES.filter(t => !t.legacy && !t.qsmsFlow).map(t => ({ v: t.id, l: t.label }))} />
      {period !== "none" && (
        <div style={{ display: "flex", gap: 12 }}>
          <Input label="Início" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
          {period === "range" && <Input label="Término" type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />}
        </div>
      )}
      <Input label="Observações" value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} placeholder="Opcional" />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn onClick={() => onConfirm({ type: form.type, startDate: form.startDate, endDate: period === "range" ? form.endDate : form.startDate, obs: form.obs })} label="Salvar alteração" color="#16a34a" />
        <Btn onClick={onCancel} label="Cancelar" color="#154753" />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Reivindicar Programação — wizard "por perguntas" (instrutor autora a alteração)
// dia → razão (Instrução/Apoio) → [Instrução: turma do dia → assumir/entrar] | [Apoio: tipo + horário]
// O resultado é um "claim" encenado; nada toca a programação até o planejador aprovar.
// ════════════════════════════════════════════════════════════════════════════
function ClaimWizard({ user, instructors, schedules, locals, onBack, onSubmit }) {
  const [step, setStep] = useState("dia");        // dia | razao | pickClass | editClass | apoio
  const [date, setDate] = useState("");
  const [pickedClassId, setPickedClassId] = useState(null);
  const [sel, setSel] = useState(null);            // { row, mode:"assumir"|"entrar" }
  const [selLocal, setSelLocal] = useState("");
  const [selRole, setSelRole]   = useState("Assistant Instructor");
  const [apoioType, setApoioType] = useState("");
  const [aStart, setAStart] = useState("08:00");
  const [aEnd, setAEnd]     = useState("17:00");
  const [aObs, setAObs]     = useState("");

  const localOpts = React.useMemo(() => {
    const names = Array.from(new Set((locals || []).map(l => (l && l.name) || l).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
    return [{ v: "", l: "— local a definir —" }, ...names.map(n => ({ v: n, l: n }))];
  }, [locals]);

  const dayRows = (schedules || []).filter(s => s.date === date);
  const dayClasses = React.useMemo(() => {
    const map = new Map();
    dayRows.forEach(r => {
      if (!r.classId) return;
      if (!map.has(r.classId)) map.set(r.classId, { classId: r.classId, className: r.className, rows: [] });
      map.get(r.classId).rows.push(r);
    });
    return Array.from(map.values()).sort((a, b) => String(a.className || "").localeCompare(String(b.className || "")));
  }, [schedules, date]);
  const classRows = pickedClassId ? dayRows.filter(r => r.classId === pickedClassId) : [];

  const openSel = (row, mode) => { setSel({ row, mode }); setSelLocal(row.local || ""); setSelRole("Assistant Instructor"); };
  const confirmSel = () => {
    const r = sel.row;
    const base = { reason: "instrucao", date, classId: r.classId, className: r.className, targetRowId: r.id,
      module: r.module, moduleId: r.moduleId, local: selLocal || r.local || "", startTime: r.startTime, endTime: r.endTime };
    const claim = sel.mode === "assumir"
      ? { ...base, action: "assumir", role: r.role, displacedInstructorId: r.instructorId, displacedInstructorName: r.instructorName }
      : { ...base, action: "entrar", role: selRole };
    onSubmit(claim, buildClaimLabel(claim));
  };
  const submitApoio = () => {
    if (!apoioType) { alert("Escolha o tipo de apoio."); return; }
    if (!aStart || !aEnd) { alert("Informe o horário."); return; }
    const claim = { reason: "apoio", date, activityType: apoioType, startTime: aStart, endTime: aEnd, obs: aObs };
    onSubmit(claim, buildClaimLabel(claim));
  };

  const card = { background: "#0d4a5a", border: "1px solid #154753", borderRadius: 8, padding: "12px 14px" };
  const bigBtn = (label, sub, onClick, color) => (
    <button onClick={onClick} style={{ textAlign: "left", padding: "14px 16px", background: "#0d4a5a", border: `1px solid ${color || "#154753"}`, borderRadius: 10, color: "#e2e8f0", cursor: "pointer", width: "100%" }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
    </button>
  );

  return (
    <Modal title="Reivindicar Programação" onClose={onBack}>
      {step === "dia" && (
        <div>
          <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 12 }}>Qual o dia da programação?</p>
          <Input label="Dia" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn onClick={() => { if (!date) { alert("Escolha o dia."); return; } setStep("razao"); }} label="Continuar" color="#16a34a" />
            <Btn onClick={onBack} label="Voltar" color="#154753" />
          </div>
        </div>
      )}

      {step === "razao" && (
        <div>
          <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 12 }}>O que você fez em {fmtDate(date)}?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bigBtn("📚 Instrução", "Atuei numa turma — assumir uma vaga ou entrar na equipe.", () => { setPickedClassId(null); setSel(null); setStep("pickClass"); }, "#1e6b7a")}
            {bigBtn("🛠️ Apoio", "Manutenção, almoxarifado, marketing, PDI, QSMS, etc.", () => setStep("apoio"), "#1e6b7a")}
          </div>
          <div style={{ marginTop: 16 }}><Btn onClick={() => setStep("dia")} label="Voltar" color="#154753" /></div>
        </div>
      )}

      {step === "pickClass" && (
        <div>
          <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 12 }}>Turmas de {fmtDate(date)} — escolha em qual você atuou:</p>
          {dayClasses.length === 0 ? (
            <div style={{ ...card, color: "#94a3b8", fontSize: 13 }}>Nenhuma turma programada nesse dia. Se foi apoio, volte e escolha "Apoio".</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
              {dayClasses.map(c => bigBtn(
                c.className || "(sem nome)",
                `${c.rows.length} disciplina(s) · ${Array.from(new Set(c.rows.map(r => r.instructorName).filter(Boolean))).join(", ") || "sem instrutor"}`,
                () => { setPickedClassId(c.classId); setStep("editClass"); }, "#154753"))}
            </div>
          )}
          <div style={{ marginTop: 16 }}><Btn onClick={() => setStep("razao")} label="Voltar" color="#154753" /></div>
        </div>
      )}

      {step === "editClass" && (
        <div>
          <p style={{ color: "#ffa619", fontWeight: 700, marginBottom: 4 }}>{classRows[0]?.className || ""}</p>
          <p style={{ color: "#94a3b8", fontSize: 12, marginBottom: 12 }}>Toque numa disciplina para assumir a vaga de alguém ou entrar na equipe.</p>
          {sel ? (
            <div style={{ ...card, border: "1px solid #16a34a" }}>
              <p style={{ color: "#e2e8f0", fontWeight: 700, margin: "0 0 8px", fontSize: 14 }}>
                {sel.mode === "assumir"
                  ? `Assumir a vaga de ${sel.row.instructorName || "—"}`
                  : "Entrar na equipe"}
              </p>
              <p style={{ color: "#94a3b8", fontSize: 12, margin: "0 0 10px" }}>
                {sel.row.module} · {_rolePt(sel.row.role)} · {sel.row.startTime}–{sel.row.endTime}
              </p>
              {sel.mode === "entrar" && (
                <Sel label="Sua função" value={selRole} onChange={e => setSelRole(e.target.value)} opts={CLAIM_ROLE_OPTS.map(r => ({ v: r, l: _rolePt(r) }))} />
              )}
              {localOpts.length > 1
                ? <Sel label="Local" value={selLocal} onChange={e => setSelLocal(e.target.value)} opts={localOpts} />
                : <Input label="Local" value={selLocal} onChange={e => setSelLocal(e.target.value)} placeholder="Ex: SALA 09" />}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Btn onClick={confirmSel} label="Enviar reivindicação" color="#16a34a" />
                <Btn onClick={() => setSel(null)} label="Cancelar" color="#154753" />
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
              {classRows.map(r => (
                <div key={r.id} style={card}>
                  <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>{r.module}</div>
                  <div style={{ color: "#94a3b8", fontSize: 12, margin: "2px 0 8px" }}>
                    {_rolePt(r.role)} · {r.instructorName || "vaga aberta"} · {r.local || "—"} · {r.startTime}–{r.endTime}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Btn onClick={() => openSel(r, "assumir")} label="Assumir esta vaga" color="#0d6e7a" />
                    <Btn onClick={() => openSel(r, "entrar")} label="Entrar na equipe" color="#154753" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!sel && <div style={{ marginTop: 16 }}><Btn onClick={() => setStep("pickClass")} label="Voltar" color="#154753" /></div>}
        </div>
      )}

      {step === "apoio" && (
        <div>
          <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 12 }}>Que apoio você fez em {fmtDate(date)}?</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {CLAIM_APOIO_TYPES.map(t => (
              <button key={t} onClick={() => setApoioType(t)}
                style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: apoioType === t ? (ACTIVITY_TYPES[t]?.color || "#16a34a") : "#0d4a5a",
                  color: apoioType === t ? "#fff" : "#e2e8f0",
                  border: `1px solid ${apoioType === t ? (ACTIVITY_TYPES[t]?.color || "#16a34a") : "#154753"}` }}>
                {_apoioLabel(t)}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Input label="Hora início" type="time" value={aStart} onChange={e => setAStart(e.target.value)} />
            <Input label="Hora término" type="time" value={aEnd} onChange={e => setAEnd(e.target.value)} />
          </div>
          <Input label="Observações (opcional)" value={aObs} onChange={e => setAObs(e.target.value)} placeholder="Detalhes do apoio..." />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn onClick={submitApoio} label="Enviar reivindicação" color="#16a34a" />
            <Btn onClick={() => setStep("razao")} label="Voltar" color="#154753" />
          </div>
        </div>
      )}
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Atestado Médico — wizard do instrutor (fluxo QSMS, 2026-07-15)
// Passo 1: já tem o atestado em mãos?
//   SIM → data da consulta + dias + FOTO obrigatória (câmera ou arquivo) → cria a
//         solicitação "atestado" + PRÉ-AUSÊNCIA (pendingValidation) que já bloqueia a
//         agenda/conflitos. O QSMS valida na página Ausência.
//   NÃO → atalho legado "Estou doente" (ausência de hoje + aviso aos planejadores);
//         o atestado é enviado depois, quando o instrutor o tiver.
// Sem campo de observação no envio do atestado — de propósito: evita alguém escrever
// o diagnóstico/CID em texto que todos os planejadores leem (LGPD).
// ════════════════════════════════════════════════════════════════════════════
function AtestadoWizard({ user, instructors, baseReq, onSave, onCreateAbsence, onBack, onClose }) {
  const [step, setStep] = useState("ask"); // ask | form | sick | sick_done | done
  const [form, setForm] = useState({ consultDate: "", days: "" });
  const [sickObs, setSickObs] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const instrName = instructors.find(i => String(i.id) === String(user.id))?.name || user.name;
  const days = Math.floor(+form.days || 0);
  const endDate = form.consultDate && days >= 1 ? addDaysIso(form.consultDate, days - 1) : "";

  const pickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFile(f); setErr("");
    if (f.type.startsWith("image/")) _readAsDataURL(f).then(setPreview).catch(() => setPreview(null));
    else setPreview(null);
  };

  // Atalho legado "Estou doente" (sem atestado ainda): mesmo comportamento do antigo
  // tipo "doenca" — ausência de HOJE com horário 08:00–17:00 + solicitação no histórico.
  const submitSickToday = () => {
    const today = new Date().toISOString().split("T")[0];
    const absenceId = Date.now() + 1;
    onCreateAbsence({
      id: absenceId, instructorId: +user.id, instructorName: instrName,
      type: "involuntario", category: "Atestado Médico",
      startDate: today, endDate: today, startTime: "08:00", endTime: "17:00", obs: sickObs || "",
    });
    onSave(baseReq({ type: "doenca", startDate: today, endDate: today, obs: sickObs, absenceCreated: true, absenceId }));
    setStep("sick_done");
  };

  const submitAtestado = async () => {
    setErr("");
    if (!form.consultDate) { setErr("Informe a data da consulta."); return; }
    if (!days || days < 1) { setErr("Informe quantos dias constam no atestado."); return; }
    if (!file) { setErr("Anexe a foto (ou PDF) do atestado — é obrigatória para a validação."); return; }
    setBusy(true);
    try {
      const up = await uploadAtestadoFile(file);
      const reqId = Date.now();
      const absenceId = reqId + 1;
      const startDate = form.consultDate;
      const end = addDaysIso(startDate, days - 1);
      // Pré-ausência: full-day SEM startTime (convenção isInstructorAbsent). Já bloqueia
      // a agenda enquanto "aguardando validação"; rejeição do QSMS remove.
      onCreateAbsence({
        id: absenceId, instructorId: +user.id, instructorName: instrName,
        type: "involuntario", category: "Atestado Médico",
        startDate, endDate: end, obs: "",
        pendingValidation: true, requestId: reqId,
      });
      onSave(baseReq({
        id: reqId, type: "atestado", startDate, endDate: end, obs: "",
        atestado: { consultDate: startDate, days, filePath: up.path, fileType: up.type },
        absenceCreated: true, absenceId,
        messages: [mkMsg("system", instrName, `Atestado enviado por ${instrName} em ${fmtDateTime(new Date().toISOString())}: consulta ${fmtDate(startDate)}, ${days} dia(s) — período ${fmtDate(startDate)} a ${fmtDate(end)}. Aguardando validação da equipe de saúde.`, "edit")],
      }));
      setStep("done");
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  };

  const fileBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "#0d4a5a", border: "1px solid #1e6b7a", borderRadius: 8, color: "#e2e8f0", fontSize: 13, fontWeight: 600, cursor: "pointer" };

  if (step === "sick_done") return (
    <div style={{ background: "#14532d", borderRadius: 10, padding: 16 }}>
      <p style={{ color: "#4ade80", fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Ausência registrada para hoje. Os planejadores foram notificados.</p>
      <p style={{ color: "#94a3b8", fontSize: 12, margin: "0 0 12px" }}>Quando receber o atestado, envie por aqui (Nova Solicitação → Atestado Médico) para a equipe de saúde validar.</p>
      <Btn onClick={onClose} label="OK" color="#154753" />
    </div>
  );

  if (step === "done") return (
    <div style={{ background: "#14532d", borderRadius: 10, padding: 16 }}>
      <p style={{ color: "#4ade80", fontSize: 14, fontWeight: 600, margin: "0 0 10px" }}>Atestado enviado! ✅</p>
      <p style={{ color: "#e2e8f0", fontSize: 13, margin: "0 0 8px", lineHeight: 1.5 }}>Sua agenda já foi bloqueada no período e a equipe de saúde vai validar o documento. Acompanhe em "Minhas solicitações".</p>
      <p style={{ color: "#94a3b8", fontSize: 12, margin: "0 0 12px" }}>🔒 A foto do atestado é confidencial: somente a equipe de Saúde (QSMS) e você têm acesso a ela.</p>
      <Btn onClick={onClose} label="OK" color="#154753" />
    </div>
  );

  if (step === "sick") return (
    <div style={{ background: "#0d4a5a", borderRadius: 10, padding: 16, border: "1px solid #1e6b7a" }}>
      <p style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600, margin: "0 0 16px", lineHeight: 1.5 }}>Você quer informar que estará ausente hoje e não poderá atender a próxima programação, certo?</p>
      <p style={{ color: "#94a3b8", fontSize: 12, margin: "0 0 16px" }}>O planejamento será notificado quanto à necessidade de substituição. Quando chegar na empresa, procure o departamento de Saúde — Enfermaria.</p>
      <Input label="Observações (opcional)" value={sickObs} onChange={e => setSickObs(e.target.value)} placeholder="Informações adicionais..." />
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Btn onClick={submitSickToday} label="Sim, registrar ausência" color="#16a34a" />
        <Btn onClick={() => setStep("ask")} label="Voltar" color="#154753" />
      </div>
    </div>
  );

  if (step === "ask") return (
    <div>
      <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 12 }}>Você já está com o atestado em mãos?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={() => setStep("form")}
          style={{ textAlign: "left", padding: "12px 16px", background: "#0d4a5a", border: "1px solid #16a34a", borderRadius: 8, color: "#e2e8f0", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
          📄 Sim — enviar o atestado para validação
        </button>
        <button onClick={() => setStep("sick")}
          style={{ textAlign: "left", padding: "12px 16px", background: "#0d4a5a", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", cursor: "pointer", fontSize: 14 }}>
          🤒 Ainda não — só avisar que estou doente hoje
        </button>
      </div>
      <div style={{ marginTop: 16 }}><Btn onClick={onBack} label="Voltar" color="#154753" /></div>
    </div>
  );

  // step === "form"
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Data da consulta" type="date" value={form.consultDate} onChange={e => setForm({ ...form, consultDate: e.target.value })} />
        <Input label="Dias de atestado" type="number" value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} placeholder="Ex: 3" />
      </div>
      {endDate && (
        <p style={{ color: "#94a3b8", fontSize: 12, margin: "-4px 0 12px" }}>Período de afastamento: <strong style={{ color: "#ffa619" }}>{fmtDate(form.consultDate)} a {fmtDate(endDate)}</strong></p>
      )}
      <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Foto do atestado (obrigatória)</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={fileBtn}>📷 Tirar foto
          <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={pickFile} />
        </label>
        <label style={fileBtn}>📁 Escolher arquivo
          <input type="file" accept={ATESTADO_ACCEPT} style={{ display: "none" }} onChange={pickFile} />
        </label>
      </div>
      {file && <p style={{ color: "#4ade80", fontSize: 12, margin: "0 0 8px" }}>📎 {file.name || "foto capturada"} anexado</p>}
      {preview && <img src={preview} alt="Prévia do atestado" style={{ maxWidth: "100%", maxHeight: 180, borderRadius: 8, border: "1px solid #154753", marginBottom: 10, display: "block" }} />}
      <p style={{ color: "#64748b", fontSize: 11, margin: "0 0 12px", lineHeight: 1.5 }}>🔒 A foto é confidencial (LGPD): somente a equipe de Saúde (QSMS) e você têm acesso. Planejadores veem apenas o período do afastamento.</p>
      {err && <p style={{ color: "#f87171", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={submitAtestado} label={busy ? "Enviando..." : "Enviar para validação"} color="#16a34a" disabled={busy} />
        <Btn onClick={() => setStep("ask")} label="Voltar" color="#154753" />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Criação pelo INSTRUTOR
// ════════════════════════════════════════════════════════════════════════════
function InstrCreateModal({ user, instructors, nextSeq, schedules, trainings, locals, onSave, onCreateAbsence, onClose }) {
  const [selectedType, setSelectedType] = useState(null);
  const [typeForm, setTypeForm] = useState({ startDate: "", endDate: "", obs: "", fracaoDia: false, fracStart: "08:00", fracEnd: "17:00", trainingName: "" });

  const baseReq = (extra) => {
    const seq = nextSeq();
    const now = new Date().toISOString();
    const instr = instructors.find(i => String(i.id) === String(user.id));
    return {
      id: Date.now(), seq, protocol: genProtocol(now, seq), origin: "instructor",
      createdByName: instr?.name || user.name,
      instructorId: String(user.id), instructorName: instr?.name || user.name,
      status: "pendente", createdAt: now, messages: [], ...extra,
    };
  };

  const handleSubmit = () => {
    const rt = selectedType;
    if (!rt) return;
    if (rt.period !== "none" && rt.period !== "claim" && !typeForm.startDate) { alert("Informe a data."); return; }
    if (rt.period === "claim" && !typeForm.startDate) { alert("Informe a data da aula."); return; }
    if (rt.period === "claim" && !typeForm.trainingName.trim()) { alert("Informe o treinamento."); return; }
    const endDate = rt.period === "range" ? typeForm.endDate : typeForm.startDate;
    onSave(baseReq({
      type: rt.id, startDate: typeForm.startDate || "", endDate: endDate || "", obs: typeForm.obs,
      ...(rt.id === "reivindicacao" ? { trainingName: typeForm.trainingName } : {}),
      ...(typeForm.fracaoDia ? { fracaoDia: true, startTime: typeForm.fracStart, endTime: typeForm.fracEnd } : {}),
    }));
    onClose();
  };

  return (
    <Modal title="Nova Solicitação" onClose={onClose} width={500}>
      {!selectedType ? (
        <div>
          <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 12 }}>Qual o motivo da solicitação?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {REQUEST_TYPES.filter(t => !t.legacy).map(rt => (
              <button key={rt.id} onClick={() => setSelectedType(rt)}
                style={{ textAlign: "left", padding: "12px 16px", background: "#0d4a5a", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                {rt.label}
              </button>
            ))}
          </div>
        </div>
      ) : selectedType.id === "atestado" ? (
        <div>
          <p style={{ color: "#ffa619", fontWeight: 600, marginBottom: 16 }}>{selectedType.label}</p>
          <AtestadoWizard user={user} instructors={instructors} baseReq={baseReq}
            onSave={onSave} onCreateAbsence={onCreateAbsence}
            onBack={() => setSelectedType(null)} onClose={onClose} />
        </div>
      ) : selectedType.id === "reivindicacao" ? (
        <ClaimWizard
          user={user} instructors={instructors} schedules={schedules} locals={locals}
          onBack={() => setSelectedType(null)}
          onSubmit={(claim, label) => {
            onSave(baseReq({ type: "reivindicacao", startDate: claim.date, endDate: claim.date, trainingName: label, claim }));
            onClose();
          }} />
      ) : (
        <div>
          <p style={{ color: "#ffa619", fontWeight: 600, marginBottom: 16 }}>{selectedType.label}</p>
          {selectedType.period === "single" && (
            <div>
              <Input label="Data" type="date" value={typeForm.startDate} onChange={e => setTypeForm({ ...typeForm, startDate: e.target.value })} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 6px" }}>
                <input type="checkbox" id="fracaoDia" checked={typeForm.fracaoDia} onChange={e => setTypeForm({ ...typeForm, fracaoDia: e.target.checked })} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#ffa619" }} />
                <label htmlFor="fracaoDia" style={{ color: typeForm.fracaoDia ? "#ffa619" : "#94a3b8", fontSize: 13, cursor: "pointer", fontWeight: 700, letterSpacing: "0.05em" }}>FRAÇÃO DO DIA</label>
              </div>
              {typeForm.fracaoDia && (
                <div style={{ display: "flex", gap: 12, marginTop: 8, padding: "10px 12px", background: "#0d4a5a", borderRadius: 8, border: "1px solid #1e6b7a" }}>
                  <Input label="Hora início" type="time" value={typeForm.fracStart} onChange={e => setTypeForm({ ...typeForm, fracStart: e.target.value })} />
                  <Input label="Hora término" type="time" value={typeForm.fracEnd} onChange={e => setTypeForm({ ...typeForm, fracEnd: e.target.value })} />
                </div>
              )}
            </div>
          )}
          {selectedType.period === "range" && (
            <div style={{ display: "flex", gap: 12 }}>
              <Input label="De" type="date" value={typeForm.startDate} onChange={e => setTypeForm({ ...typeForm, startDate: e.target.value })} />
              <Input label="Até" type="date" value={typeForm.endDate} onChange={e => setTypeForm({ ...typeForm, endDate: e.target.value })} />
            </div>
          )}
          {selectedType.period === "claim" && (
            <div>
              <Input label="Data da aula" type="date" value={typeForm.startDate} onChange={e => setTypeForm({ ...typeForm, startDate: e.target.value })} />
              <Input label="Treinamento / GCC" value={typeForm.trainingName} onChange={e => setTypeForm({ ...typeForm, trainingName: e.target.value })} placeholder="Ex: CBSP, NR-12, GCC-001..." />
            </div>
          )}
          {selectedType.period === "none" && (
            <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>O período será definido pelo planejador.</p>
          )}
          <Input label="Observações (opcional)" value={typeForm.obs} onChange={e => setTypeForm({ ...typeForm, obs: e.target.value })} placeholder="Informações adicionais..." />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn onClick={handleSubmit} label="Enviar Solicitação" color="#16a34a" />
            <Btn onClick={() => setSelectedType(null)} label="Voltar" color="#154753" />
          </div>
        </div>
      )}
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Registro pelo PLANEJADOR (instrutor aprova)
// ════════════════════════════════════════════════════════════════════════════
function PlannerCreateModal({ user, instructors, nextSeq, onSave, onClose }) {
  const [form, setForm] = useState({ instructorId: "", type: "", startDate: "", endDate: "", obs: "" });
  const rt = REQUEST_TYPES.find(t => t.id === form.type);
  const period = rt?.period || "single";

  const submit = () => {
    if (!form.instructorId || !form.type) { alert("Selecione instrutor e tipo."); return; }
    if (period !== "none" && !form.startDate) { alert("Informe a data."); return; }
    const instr = instructors.find(i => String(i.id) === String(form.instructorId));
    const seq = nextSeq();
    const now = new Date().toISOString();
    const endDate = period === "range" ? form.endDate : form.startDate;
    onSave({
      id: Date.now(), seq, protocol: genProtocol(now, seq), origin: "planner", createdByName: user.name,
      instructorId: String(form.instructorId), instructorName: instr?.name || "",
      type: form.type, startDate: form.startDate || "", endDate: endDate || "", obs: form.obs,
      status: "pendente", createdAt: now,
      messages: [mkMsg("system", user.name, `Solicitação registrada por ${user.name} (planejador) em ${fmtDateTime(now)}. Aguardando ciente do instrutor.`, "edit")],
    });
    createNotification({
      instructorId: String(form.instructorId), type: "request_update",
      title: `Nova solicitação registrada para você`, body: `${rtLabel(form.type)} — ${periodStr({ startDate: form.startDate, endDate })}. Dê ciente na Comunicação.`,
    });
    onClose();
  };

  return (
    <Modal title="Registrar solicitação para instrutor" onClose={onClose} width={500}>
      <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 16 }}>O instrutor receberá para dar ciente e aprovar/não aprovar.</p>
      <Sel label="Instrutor" value={form.instructorId} onChange={e => setForm({ ...form, instructorId: e.target.value })} opts={instructors.map(i => ({ v: i.id, l: i.name }))} />
      {/* Atestado (qsmsFlow) fica de fora: exige a foto e nasce do instrutor; doenca é legado. */}
      <Sel label="Tipo / motivo" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} opts={REQUEST_TYPES.filter(t => t.id !== "reivindicacao" && !t.legacy && !t.qsmsFlow).map(t => ({ v: t.id, l: t.label }))} />
      {form.type && period !== "none" && (
        <div style={{ display: "flex", gap: 12 }}>
          <Input label={period === "range" ? "De" : "Data"} type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
          {period === "range" && <Input label="Até" type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />}
        </div>
      )}
      {form.type && period === "none" && <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>Período a definir.</p>}
      <Input label="Observações (opcional)" value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} placeholder="Informações adicionais..." />
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Btn onClick={submit} label="Registrar" color="#16a34a" />
        <Btn onClick={onClose} label="Cancelar" color="#154753" />
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
function CrossbaseTab({ crossbaseRequests, setCrossbaseRequests, viewBase, instructors, user }) {
  const [filter, setFilter]   = useState("inbound"); // "inbound" | "outbound"
  const [approveModal, setApproveModal] = useState(null); // { req }
  const [rejectModal,  setRejectModal]  = useState(null); // { req }
  const [approveInstr, setApproveInstr] = useState("");
  const [rejectNote,   setRejectNote]   = useState("");

  const inbound  = crossbaseRequests.filter(r => r.targetBase === viewBase);
  const outbound = crossbaseRequests.filter(r => r.requestingBase === viewBase);
  const shown    = filter === "inbound" ? inbound : outbound;

  const pendingIn  = inbound.filter(r => r.status === "pending").length;
  const pendingOut = outbound.filter(r => r.status === "pending").length;

  const fmtDt = (iso) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }); } catch { return iso; }
  };

  const doApprove = () => {
    if (!approveModal) return;
    const instr = instructors.find(i => String(i.id) === String(approveInstr));
    setCrossbaseRequests(prev => prev.map(r => String(r.id) === String(approveModal.req.id)
      ? { ...r, status:"approved", approvedBy: user.name, approvedAt: new Date().toISOString(),
          selectedInstructorId: approveInstr, selectedInstructorName: instr?.name || "" }
      : r));
    setApproveModal(null);
    setApproveInstr("");
  };

  const doReject = () => {
    if (!rejectModal) return;
    setCrossbaseRequests(prev => prev.map(r => String(r.id) === String(rejectModal.req.id)
      ? { ...r, status:"rejected", rejectedBy: user.name, rejectedAt: new Date().toISOString(), rejectionNote: rejectNote }
      : r));
    setRejectModal(null);
    setRejectNote("");
  };

  const statusColor = (s) => s === "approved" ? "#16a34a" : s === "rejected" ? "#ef4444" : "#ffa619";
  const statusLabel = (s) => s === "approved" ? "Aprovada" : s === "rejected" ? "Rejeitada" : "Aguardando";

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:6 }}>
          {[
            { key:"inbound",  label:`Recebidas${pendingIn > 0 ? ` (${pendingIn})` : ""}` },
            { key:"outbound", label:`Enviadas${pendingOut > 0 ? ` (${pendingOut})` : ""}` },
          ].map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              style={{ padding:"6px 14px", borderRadius:20, border:"1px solid " + (filter===t.key ? "#ffa619" : "#154753"), background: filter===t.key ? "#ffa61920" : "transparent", color: filter===t.key ? "#ffa619" : "#64748b", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
        <span style={{ color:"#475569", fontSize:12, marginLeft:"auto" }}>
          {filter==="inbound" ? `Requisições de instrutores para a base ${viewBase||"—"}` : `Requisições enviadas pela base ${viewBase||"—"}`}
        </span>
      </div>

      {shown.length === 0 ? (
        <div style={{ textAlign:"center", color:"#475569", padding:"40px 0", fontSize:14 }}>
          {filter==="inbound" ? "Nenhuma requisição recebida." : "Nenhuma requisição enviada."}
        </div>
      ) : shown.map(req => {
        const isP = req.status === "pending";
        return (
          <div key={req.id} style={{ background:"#073d4a", border:`1px solid ${isP ? "#ffa61940" : "#154753"}`, borderRadius:12, padding:"14px 16px", marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase" }}>
                    🔀 {req.requestingBase} → {req.targetBase}
                  </span>
                  <span style={{ fontSize:10, padding:"1px 8px", borderRadius:10, background:statusColor(req.status)+"20", color:statusColor(req.status), fontWeight:700, border:`1px solid ${statusColor(req.status)}40` }}>
                    {statusLabel(req.status)}
                  </span>
                </div>
                <p style={{ color:"#e2e8f0", fontWeight:700, margin:"0 0 2px", fontSize:14 }}>{req.className || "—"}</p>
                <p style={{ color:"#94a3b8", fontSize:12, margin:"0 0 4px" }}>{req.moduleName || ""} · {req.date || ""} · {req.startTime || ""}–{req.endTime || ""}</p>
                <p style={{ color:"#475569", fontSize:11, margin:0 }}>Solicitado por <span style={{ color:"#64748b" }}>{req.requestedBy || "—"}</span> em {fmtDt(req.requestedAt)}</p>
                {req.status === "approved" && (
                  <p style={{ color:"#16a34a", fontSize:12, margin:"6px 0 0", fontWeight:600 }}>
                    ✓ Aprovado por {req.approvedBy} — Instrutor: {req.selectedInstructorName || req.selectedInstructorId || "—"}
                  </p>
                )}
                {req.status === "rejected" && (
                  <p style={{ color:"#ef4444", fontSize:12, margin:"6px 0 0" }}>
                    ✕ Rejeitado por {req.rejectedBy}{req.rejectionNote ? ` · ${req.rejectionNote}` : ""}
                  </p>
                )}
              </div>
              {filter === "inbound" && isP && (
                <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                  <button onClick={() => { setApproveModal({ req }); setApproveInstr(""); }}
                    style={{ padding:"6px 14px", background:"#16a34a20", border:"1px solid #16a34a40", borderRadius:8, color:"#16a34a", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    ✓ Indicar instrutor
                  </button>
                  <button onClick={() => { setRejectModal({ req }); setRejectNote(""); }}
                    style={{ padding:"6px 14px", background:"#ef444420", border:"1px solid #ef444440", borderRadius:8, color:"#ef4444", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    ✕ Rejeitar
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Modal de aprovação */}
      {approveModal && (
        <Modal title="Indicar instrutor para a outra base" onClose={() => setApproveModal(null)} width={460}>
          <p style={{ color:"#94a3b8", fontSize:13, marginBottom:12 }}>
            Selecione um instrutor da base <strong style={{ color:"#ffa619" }}>{viewBase}</strong> disponível para "{approveModal.req.moduleName}" em {approveModal.req.date}.
          </p>
          <Sel label="Instrutor indicado" value={approveInstr} onChange={e => setApproveInstr(e.target.value)}
            opts={instructors.filter(i => i.status !== "Inativo" && (!i.base || i.base === viewBase)).map(i => ({ v: i.id, l: i.name }))} />
          <div style={{ display:"flex", gap:8, marginTop:16 }}>
            <Btn onClick={doApprove} label="Confirmar indicação" color="#16a34a" />
            <Btn onClick={() => setApproveModal(null)} label="Cancelar" color="#154753" />
          </div>
        </Modal>
      )}

      {/* Modal de rejeição */}
      {rejectModal && (
        <Modal title="Rejeitar requisição de instrutor" onClose={() => setRejectModal(null)} width={420}>
          <Input label="Motivo (opcional)" value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Ex: sem disponibilidade nessa data" />
          <div style={{ display:"flex", gap:8, marginTop:16 }}>
            <Btn onClick={doReject} label="Confirmar rejeição" color="#ef4444" />
            <Btn onClick={() => setRejectModal(null)} label="Cancelar" color="#154753" />
          </div>
        </Modal>
      )}
    </div>
  );
}
