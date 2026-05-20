const REQUEST_TYPES = [
  { id: "folga_dia",  label: "Folga — 1 dia",              period: "single", absType: "planejada",    absCat: "Folga Banco de Horas" },
  { id: "folga_dias", label: "Folga — Mais dias",           period: "range",  absType: "planejada",    absCat: "Folga Banco de Horas" },
  { id: "ferias",     label: "Férias",                      period: "range",  absType: "planejada",    absCat: "Férias" },
  { id: "exame",      label: "Folga para Exame ou Consulta",     period: "single", absType: "involuntario", absCat: "Consultas e Exames (com declaração)" },
  { id: "doenca",     label: "Estou doente",                     period: "none",   absType: "involuntario", absCat: "Atestado Médico" },
  { id: "outro",      label: "Outro motivo",                     period: "none",   absType: "involuntario", absCat: "Falta" },
];

const STATUS_COLOR = {
  pendente:  { bg: "#1e3a47", text: "#ffa619", label: "Pendente" },
  aprovada:  { bg: "#14532d", text: "#4ade80", label: "Aprovada" },
  rejeitada: { bg: "#450a0a", text: "#f87171", label: "Rejeitada" },
};

function ComunicacaoPage({ user, instructors, requests, setRequests, absences, setAbsences }) {
  const isAdm   = user.role === "admin";
  const isPlan  = user.role === "planejador";
  const isInstr = user.role === "instructor";

  const [tab, setTab]             = useState("requisicao");
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approveModal, setApproveModal] = useState(null);

  const allRequests = requests || [];
  const pendingCount = allRequests.filter(r => r.status === "pendente").length;

  const myRequests = isInstr
    ? allRequests.filter(r => String(r.instructorId) === String(user.instructorId))
    : allRequests;

  const saveRequest = (req) => setRequests(prev => [...(prev || []), req]);

  const updateRequest = (id, patch) =>
    setRequests(prev => (prev || []).map(r => String(r.id) === String(id) ? { ...r, ...patch } : r));

  const handleApprove = (req) => {
    const rt = REQUEST_TYPES.find(t => t.id === req.type);
    if (!rt) return;
    if (rt.period === "none") { setApproveModal(req); return; }
    doApprove(req, req.startDate, req.endDate || req.startDate);
  };

  const doApprove = (req, startDate, endDate) => {
    const rt = REQUEST_TYPES.find(t => t.id === req.type);
    const absence = {
      id: Date.now(),
      instructorId: +req.instructorId,
      instructorName: req.instructorName,
      type: rt.absType,
      category: rt.absCat,
      startDate,
      endDate,
      startTime: "08:00",
      endTime: "17:00",
      obs: req.obs || "",
    };
    setAbsences(prev => [...(prev || []), absence]);
    updateRequest(req.id, { status: "aprovada" });
    createNotification({
      instructorId: req.instructorId,
      type: "request_update",
      title: `Solicitação aprovada: ${rt.label}`,
      body: startDate === endDate ? startDate : `${startDate} a ${endDate}`,
    });
    setApproveModal(null);
  };

  const handleReject = () => {
    const req = rejectModal;
    const rt  = REQUEST_TYPES.find(t => t.id === req.type);
    updateRequest(req.id, { status: "rejeitada", rejectionReason: rejectReason });
    createNotification({
      instructorId: req.instructorId,
      type: "request_update",
      title: `Solicitação não aprovada: ${rt?.label || req.type}`,
      body: rejectReason || "Sem motivo informado.",
    });
    setRejectModal(null);
    setRejectReason("");
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <h2 style={{ color: "#e2e8f0", fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Comunicação</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["requisicao", ...(isAdm || isPlan ? ["gestao"] : [])].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14,
              background: tab === t ? "#ffa619" : "#073d4a",
              color: tab === t ? "#01323d" : "#94a3b8" }}>
            {t === "requisicao" ? "Requisição" : `Gestão${pendingCount ? ` (${pendingCount})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "requisicao" && (
        <RequisicaoTab user={user} isInstr={isInstr} myRequests={myRequests}
          instructors={instructors} saveRequest={saveRequest} />
      )}

      {tab === "gestao" && (isAdm || isPlan) && (
        <GestaoTab requests={allRequests}
          onApprove={handleApprove}
          onReject={r => { setRejectModal(r); setRejectReason(""); }} />
      )}

      {rejectModal && (
        <Modal title="Rejeitar Solicitação" onClose={() => setRejectModal(null)} width={420}>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>
            {REQUEST_TYPES.find(t => t.id === rejectModal.type)?.label} — {rejectModal.instructorName}
          </p>
          <Input label="Motivo da rejeição" value={rejectReason}
            onChange={e => setRejectReason(e.target.value)} placeholder="Informe o motivo..." />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn onClick={handleReject} label="Confirmar Rejeição" color="#dc2626" />
            <Btn onClick={() => setRejectModal(null)} label="Cancelar" color="#154753" />
          </div>
        </Modal>
      )}

      {approveModal && (
        <ApproveWithDateModal req={approveModal} onConfirm={doApprove} onClose={() => setApproveModal(null)} />
      )}
    </div>
  );
}

function RequisicaoTab({ user, isInstr, myRequests, instructors, saveRequest }) {
  const [selectedType, setSelectedType] = useState(null);
  const [showForm, setShowForm]         = useState(false);
  const [typeForm, setTypeForm]         = useState({ startDate: "", endDate: "", obs: "" });

  const openNew  = () => { setShowForm(true); setSelectedType(null); setTypeForm({ startDate: "", endDate: "", obs: "" }); };
  const closeForm = () => { setShowForm(false); setSelectedType(null); };

  const handleSubmit = () => {
    const rt = selectedType;
    if (!rt) return;
    if (rt.period !== "none" && !typeForm.startDate) { alert("Informe a data."); return; }
    const endDate = rt.period === "range" ? typeForm.endDate : typeForm.startDate;
    const instr = isInstr ? instructors.find(i => String(i.id) === String(user.instructorId)) : null;
    const req = {
      id: Date.now(),
      instructorId: isInstr ? String(user.instructorId) : "",
      instructorName: isInstr ? (instr?.name || user.name) : user.name,
      type: rt.id,
      startDate: typeForm.startDate || "",
      endDate:   endDate            || "",
      obs: typeForm.obs,
      status: "pendente",
      createdAt: new Date().toISOString(),
    };
    saveRequest(req);
    closeForm();
  };

  const sorted = [...myRequests].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ color: "#94a3b8", fontSize: 15, fontWeight: 600, margin: 0 }}>
          {isInstr ? "Minhas solicitações" : "Todas as solicitações"}
        </h3>
        {isInstr && !showForm && (
          <Btn onClick={openNew} label="+ Nova Solicitação" color="#ffa619" />
        )}
      </div>

      {showForm && (
        <div style={{ background: "#073d4a", borderRadius: 12, padding: 20, marginBottom: 20, border: "1px solid #154753" }}>
          {!selectedType ? (
            <div>
              <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 12 }}>Qual o motivo da solicitação?</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {REQUEST_TYPES.map(rt => (
                  <button key={rt.id} onClick={() => setSelectedType(rt)}
                    style={{ textAlign: "left", padding: "12px 16px", background: "#0d4a5a",
                      border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0",
                      cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                    {rt.label}
                  </button>
                ))}
              </div>
              <button onClick={closeForm}
                style={{ marginTop: 12, background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
            </div>
          ) : (
            <div>
              <p style={{ color: "#ffa619", fontWeight: 600, marginBottom: 16 }}>{selectedType.label}</p>
              {selectedType.period === "single" && (
                <Input label="Data" type="date" value={typeForm.startDate}
                  onChange={e => setTypeForm({ ...typeForm, startDate: e.target.value })} />
              )}
              {selectedType.period === "range" && (
                <div style={{ display: "flex", gap: 12 }}>
                  <Input label="De" type="date" value={typeForm.startDate}
                    onChange={e => setTypeForm({ ...typeForm, startDate: e.target.value })} />
                  <Input label="Até" type="date" value={typeForm.endDate}
                    onChange={e => setTypeForm({ ...typeForm, endDate: e.target.value })} />
                </div>
              )}
              {selectedType.period === "none" && (
                <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>
                  O período será definido pelo planejador.
                </p>
              )}
              <Input label="Observações (opcional)" value={typeForm.obs}
                onChange={e => setTypeForm({ ...typeForm, obs: e.target.value })}
                placeholder="Informações adicionais..." />
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <Btn onClick={handleSubmit} label="Enviar Solicitação" color="#16a34a" />
                <Btn onClick={() => setSelectedType(null)} label="Voltar" color="#154753" />
              </div>
            </div>
          )}
        </div>
      )}

      {sorted.length === 0 && !showForm && (
        <p style={{ color: "#475569", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
          Nenhuma solicitação encontrada.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(req => (
          <RequestCard key={req.id} req={req} showInstructor={!isInstr} />
        ))}
      </div>
    </div>
  );
}

function GestaoTab({ requests, onApprove, onReject }) {
  const [filter, setFilter] = useState("pendente");
  const filtered = requests.filter(r => r.status === filter)
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["pendente", "aprovada", "rejeitada"].map(s => {
          const sc = STATUS_COLOR[s];
          const count = requests.filter(r => r.status === s).length;
          return (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                background: filter === s ? sc.bg : "transparent",
                color: filter === s ? sc.text : "#475569",
                outline: filter === s ? `1px solid ${sc.text}` : "1px solid #154753" }}>
              {sc.label} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p style={{ color: "#475569", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
          Nenhuma solicitação {STATUS_COLOR[filter].label.toLowerCase()}.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(req => (
          <RequestCard key={req.id} req={req} showInstructor={true}
            onApprove={req.status === "pendente" ? () => onApprove(req) : null}
            onReject={req.status  === "pendente" ? () => onReject(req)  : null} />
        ))}
      </div>
    </div>
  );
}

function RequestCard({ req, showInstructor, onApprove, onReject }) {
  const rt  = REQUEST_TYPES.find(t => t.id === req.type);
  const sc  = STATUS_COLOR[req.status] || STATUS_COLOR.pendente;
  const dateStr = req.startDate
    ? (req.startDate === req.endDate || !req.endDate
        ? req.startDate
        : `${req.startDate} a ${req.endDate}`)
    : null;

  return (
    <div style={{ background: "#073d4a", border: "1px solid #154753", borderRadius: 10,
      padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        {showInstructor && (
          <p style={{ color: "#e2e8f0", fontWeight: 700, margin: "0 0 4px", fontSize: 14 }}>
            {req.instructorName}
          </p>
        )}
        <p style={{ color: "#94a3b8", margin: "0 0 2px", fontSize: 13 }}>{rt?.label || req.type}</p>
        {dateStr && <p style={{ color: "#64748b", margin: "0 0 2px", fontSize: 12 }}>{dateStr}</p>}
        {req.obs && <p style={{ color: "#64748b", margin: "0 0 2px", fontSize: 12 }}>Obs: {req.obs}</p>}
        {req.rejectionReason && (
          <p style={{ color: "#f87171", margin: "0 0 2px", fontSize: 12 }}>Motivo: {req.rejectionReason}</p>
        )}
        <p style={{ color: "#334155", margin: 0, fontSize: 11 }}>
          {req.createdAt ? new Date(req.createdAt).toLocaleDateString("pt-BR") : ""}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ background: sc.bg, color: sc.text, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
          {sc.label}
        </span>
        {onApprove && <Btn onClick={onApprove} label="Aprovar"  color="#16a34a" />}
        {onReject  && <Btn onClick={onReject}  label="Rejeitar" color="#dc2626" />}
      </div>
    </div>
  );
}

function ApproveWithDateModal({ req, onConfirm, onClose }) {
  const rt = REQUEST_TYPES.find(t => t.id === req.type);
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate,   setEndDate]   = useState(today);

  return (
    <Modal title="Aprovar Solicitação" onClose={onClose} width={420}>
      <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 16 }}>
        {rt?.label} — {req.instructorName}
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <Input label="De"   type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <Input label="Até" type="date" value={endDate}   onChange={e => setEndDate(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Btn onClick={() => onConfirm(req, startDate, endDate)} label="Confirmar Aprovação" color="#16a34a" />
        <Btn onClick={onClose} label="Cancelar" color="#154753" />
      </div>
    </Modal>
  );
}
