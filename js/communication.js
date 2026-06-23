const REQUEST_TYPES = [
  { id: "folga_dia",  label: "Folga — 1 dia",               period: "single", absType: "planejada",    absCat: "Folga Banco de Horas" },
  { id: "folga_dias", label: "Folga — Mais dias",            period: "range",  absType: "planejada",    absCat: "Folga Banco de Horas" },
  { id: "ferias",     label: "Férias",                       period: "range",  absType: "planejada",    absCat: "Férias" },
  { id: "exame",      label: "Folga para Exame ou Consulta", period: "single", absType: "involuntario", absCat: "Consultas e Exames (com declaração)" },
  { id: "doenca",     label: "Estou doente",                 period: "none",   absType: "involuntario", absCat: "Atestado Médico" },
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

let _msgCounter = 0;
const mkMsg = (role, name, text, kind) => ({
  id: `${Date.now()}-${_msgCounter++}`,
  at: new Date().toISOString(),
  role, name, text, kind: kind || "chat",
});

function ComunicacaoPage({ user, instructors, requests, setRequests, absences, setAbsences, activities, setActivities, crossbaseRequests, setCrossbaseRequests, viewBase }) {
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

  const doApprove = (req, startDate, endDate, feedback) => {
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
          startTime: req.startTime || "08:00", endTime: req.endTime || "17:00", obs: req.obs || "",
        }]);
      }
    }
    const at = new Date().toISOString();
    const msg = mkMsg("system", user.name,
      `APROVADO por ${user.name} em ${fmtDateTime(at)}.${feedback ? " Feedback: " + feedback : ""} Período: ${periodStr({ startDate, endDate })}.`, "decision");
    updateRequest(req.id, {
      status: "aprovada", approvedAt: at, approvedBy: user.name, approvalFeedback: feedback || "",
      startDate, endDate, absenceId, activityIds, absenceCreated: true, messages: withMsg(req, msg),
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

  // Instrutor pede exclusão → precisa aprovação do planejador
  const requestDeletion = (req, reason) => {
    const at = new Date().toISOString();
    const msg = mkMsg("system", user.name, `Exclusão SOLICITADA por ${user.name} em ${fmtDateTime(at)}. Motivo: ${reason}`, "delete");
    updateRequest(req.id, { deleteStatus: "pending", deleteReason: reason, deleteRequestedBy: user.name, deleteRequestedAt: at, messages: withMsg(req, msg) });
  };

  const _removeLinkedAbsence = (req) => {
    if (req.absenceId) setAbsences(prev => (prev || []).filter(a => a.id !== req.absenceId));
    if (req.activityIds?.length) setActivities(prev => (prev || []).filter(a => !req.activityIds.includes(a.id)));
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
          <GestaoTab
            requests={allRequests} todayStr={todayStr}
            onOpen={setSelectedId} onRegister={() => setShowPlannerCreate(true)} />
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
          onEdit={editRequest} onSend={sendMessage}
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

// ════════════════════════════════════════════════════════════════════════════
// Modal de detalhe + chat/LOG + ações
// ════════════════════════════════════════════════════════════════════════════
function TicketModal({ req, user, rel, stage, onClose, onCiente, onApprove, onReject, onEdit, onSend,
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
            {req.trainingName && <p style={{ color: "#fbbf24", margin: "4px 0 0", fontSize: 12 }}>Treinamento: {req.trainingName}</p>}
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
      {panel === "edit" && <EditPanel req={req} onConfirm={(c) => { onEdit(req, c); setPanel(null); }} onCancel={() => setPanel(null)} />}
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
        opts={REQUEST_TYPES.map(t => ({ v: t.id, l: t.label }))} />
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
// Criação pelo INSTRUTOR
// ════════════════════════════════════════════════════════════════════════════
function InstrCreateModal({ user, instructors, nextSeq, onSave, onCreateAbsence, onClose }) {
  const [selectedType, setSelectedType] = useState(null);
  const [sickStep, setSickStep] = useState(null); // null | "no" | "done"
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

  const handleSickYes = () => {
    const today = new Date().toISOString().split("T")[0];
    const rt = REQUEST_TYPES.find(t => t.id === "doenca");
    const absenceId = Date.now() + 1;
    onCreateAbsence({
      id: absenceId, instructorId: +user.id,
      instructorName: instructors.find(i => String(i.id) === String(user.id))?.name || user.name,
      type: rt.absType, category: rt.absCat, startDate: today, endDate: today, startTime: "08:00", endTime: "17:00", obs: typeForm.obs || "",
    });
    onSave(baseReq({ type: "doenca", startDate: today, endDate: today, obs: typeForm.obs, absenceCreated: true, absenceId }));
    setSickStep("done");
  };

  return (
    <Modal title="Nova Solicitação" onClose={onClose} width={500}>
      {!selectedType ? (
        <div>
          <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 12 }}>Qual o motivo da solicitação?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {REQUEST_TYPES.map(rt => (
              <button key={rt.id} onClick={() => { setSelectedType(rt); setSickStep(null); }}
                style={{ textAlign: "left", padding: "12px 16px", background: "#0d4a5a", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                {rt.label}
              </button>
            ))}
          </div>
        </div>
      ) : selectedType.id === "doenca" ? (
        <div>
          <p style={{ color: "#ffa619", fontWeight: 600, marginBottom: 16 }}>{selectedType.label}</p>
          {sickStep === "no" ? (
            <div style={{ background: "#1e3a47", borderRadius: 10, padding: 16 }}>
              <p style={{ color: "#fbbf24", fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Quando chegar na empresa, procure o departamento de Saúde — Enfermaria.</p>
              <Btn onClick={onClose} label="OK" color="#154753" />
            </div>
          ) : sickStep === "done" ? (
            <div style={{ background: "#14532d", borderRadius: 10, padding: 16 }}>
              <p style={{ color: "#4ade80", fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Ausência registrada para hoje. Os planejadores foram notificados.</p>
              <Btn onClick={onClose} label="OK" color="#154753" />
            </div>
          ) : (
            <div style={{ background: "#0d4a5a", borderRadius: 10, padding: 16, border: "1px solid #1e6b7a" }}>
              <p style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600, margin: "0 0 16px", lineHeight: 1.5 }}>Você quer informar que estará ausente e não poderá atender a próxima programação, certo?</p>
              <p style={{ color: "#94a3b8", fontSize: 12, margin: "0 0 16px" }}>Se sim, o planejamento será notificado quanto à necessidade de substituição.</p>
              <Input label="Observações (opcional)" value={typeForm.obs} onChange={e => setTypeForm({ ...typeForm, obs: e.target.value })} placeholder="Informações adicionais..." />
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <Btn onClick={handleSickYes} label="Sim, registrar ausência" color="#16a34a" />
                <Btn onClick={() => setSickStep("no")} label="Não" color="#dc2626" />
              </div>
            </div>
          )}
        </div>
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
      <Sel label="Tipo / motivo" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} opts={REQUEST_TYPES.filter(t => t.id !== "reivindicacao").map(t => ({ v: t.id, l: t.label }))} />
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
