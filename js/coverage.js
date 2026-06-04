// ── COBERTURA DIÁRIA ──────────────────────────────────────────────────────────
// Visualização de justificativas por instrutor por dia.
// CLT: precisa cobertura — buracos viram alerta vermelho.
// Freelancer: precisa decisão explícita — sem nada vira flag "Sem decisão".

// Janela visual da timeline (08:00 → 20:00 = 12h, mesma da Utilização Diária)
const COV_DAY_START_MIN = 8 * 60;
const COV_DAY_END_MIN   = 20 * 60;
const COV_DAY_SPAN_MIN  = COV_DAY_END_MIN - COV_DAY_START_MIN;

// CLT: expediente padrão 08:00-17:00 com almoço 12:00-13:00 = 480 min de trabalho
const COV_CLT_EXPECTED_MIN = 8 * 60;

const _covTimeToMins = (t) => {
  if (!t || !t.includes(":")) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Calcula minutos cobertos no expediente CLT (08-12 + 13-17), considerando os blocos
const coverageMinutesClt = (blocks) => {
  if (!blocks || !blocks.length) return 0;
  // Períodos do expediente
  const work = [[8*60, 12*60], [13*60, 17*60]];
  let total = 0;
  for (const [ws, we] of work) {
    // Linha de tempo de 1 minuto, marca true para cada minuto coberto
    const covered = new Array(we - ws).fill(false);
    blocks.forEach(b => {
      const bs = b.fullDay ? 0 : _covTimeToMins(b.startTime);
      const be = b.fullDay ? 24*60 : _covTimeToMins(b.endTime);
      const s = Math.max(bs, ws), e = Math.min(be, we);
      for (let i = s; i < e; i++) covered[i - ws] = true;
    });
    total += covered.filter(Boolean).length;
  }
  return total;
};

const CoverageDailyPage = ({ schedules, instructors, activities, setActivities, absences, setAbsences, holidays, user, locals }) => {
  const todayStr = new Date().toISOString().split("T")[0];
  const [date, setDate] = React.useState(todayStr);
  const [filterContract, setFilterContract] = React.useState("all"); // all | clt | freelancer | issues
  const [search, setSearch] = React.useState("");
  const [activityModal, setActivityModal] = React.useState({ show: false, instr: null, editing: null });
  const [freeModal, setFreeModal] = React.useState({ show: false, instr: null });
  const [bankHoursModal, setBankHoursModal] = React.useState({ show: false, instr: null, editing: null });
  const [delGuard, setDelGuard] = React.useState({ show: false, action: null, pass: "", err: "" });

  const prevDay = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); setDate(d.toISOString().split("T")[0]); };
  const nextDay = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); setDate(d.toISOString().split("T")[0]); };
  const isToday = date === todayStr;
  const fmtDay = ds => new Date(ds + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  // Coberturas por instrutor
  const allCov = React.useMemo(() => instructors
    .filter(i => i.status !== "Inativo")
    .map(instr => {
      const cov = computeCoverage(instr, date, schedules, activities, absences, holidays);
      const clt = isClt(instr);
      const free = isFreelancer(instr);
      let issue = null; // "empty" (CLT sem nada), "partial" (CLT cobertura < 100%), "undecided" (freelancer sem nada)
      if (clt) {
        if (cov.status === "empty") issue = "empty";
        else if (cov.status === "training" || cov.status === "activity") {
          const mins = coverageMinutesClt(cov.blocks);
          if (mins < COV_CLT_EXPECTED_MIN) issue = "partial";
        }
      } else if (free) {
        if (cov.status === "empty" || cov.status === "holiday") issue = "undecided";
      }
      return { instr, cov, clt, free, issue };
    }), [instructors, date, schedules, activities, absences, holidays]);

  const issuesCLT = allCov.filter(r => r.clt && (r.issue === "empty" || r.issue === "partial"));
  const undecidedFL = allCov.filter(r => r.free && r.issue === "undecided");

  // Lista visível conforme filtros
  const filtered = allCov.filter(r => {
    const nameOk = search ? r.instr.name.toLowerCase().includes(search.toLowerCase()) : true;
    if (!nameOk) return false;
    if (filterContract === "clt") return r.clt;
    if (filterContract === "freelancer") return r.free;
    if (filterContract === "issues") return !!r.issue;
    return true;
  }).sort((a, b) => {
    // Prioriza pendências, depois ordem alfabética
    const ra = a.issue ? 0 : 1, rb = b.issue ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return (a.instr.name || "").localeCompare(b.instr.name || "");
  });

  // Cores e legenda
  const legend = [
    { c: "#16a34a", l: "Treinamento" },
    { c: ACTIVITY_TYPES.maintenance.color, l: "Manutenção" },
    { c: ACTIVITY_TYPES.development.color, l: "Desenvolvimento" },
    { c: ACTIVITY_TYPES.customer_service.color, l: "Apoio CS" },
    { c: ACTIVITY_TYPES.almoxarifado.color, l: "Almoxarifado" },
    { c: ACTIVITY_TYPES.cenario.color, l: "Apoio Cenário" },
    { c: ACTIVITY_TYPES.material_pdi.color, l: "Material Didático - PDI" },
    { c: ACTIVITY_TYPES.holiday_work.color,       l: "Feriado" },
    { c: ACTIVITY_TYPES.mandatory_training.color, l: "Treinamento Obrigatório" },
    { c: ACTIVITY_TYPES.free.color,               l: "Livre (avaliado)" },
    { c: "#ef4444", l: "Ausência" },
    { c: "#f59e0b", l: "Folga BH" },
    { c: "#ef444450", l: "CLT sem cobertura", hatched: true },
    { c: "#64748b40", l: "Freelancer sem decisão" },
  ];

  // ── Renderização da timeline ──────────────────────────────────────────────
  // Posiciona um bloco em % na barra de 08-20h, clamping em ambas as bordas
  const blockBox = (b) => {
    const bs = b.fullDay ? COV_DAY_START_MIN : _covTimeToMins(b.startTime);
    const be = b.fullDay ? COV_DAY_END_MIN  : _covTimeToMins(b.endTime);
    const s = Math.max(bs, COV_DAY_START_MIN);
    const e = Math.min(be, COV_DAY_END_MIN);
    if (e <= s) return null;
    const left = ((s - COV_DAY_START_MIN) / COV_DAY_SPAN_MIN) * 100;
    const width = ((e - s) / COV_DAY_SPAN_MIN) * 100;
    return { left, width };
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:12, marginBottom:6 }}>
        <div>
          <h2 style={{ color:"#fff", fontWeight:800, margin:0, fontSize:24 }}>Cobertura Diária</h2>
          <p style={{ color:"#64748b", margin:"4px 0 0", fontSize:14, textTransform:"capitalize" }}>{fmtDay(date)}</p>
        </div>
        <p style={{ color:"#475569", margin:0, fontSize:12, maxWidth:380, lineHeight:1.4 }}>
          CLT precisa cobertura completa do expediente. Freelancer precisa <strong style={{color:"#94a3b8"}}>LIVRE</strong> ou alocação explícita.
        </p>
      </div>

      {/* Navegação por data */}
      <div style={{ display:"flex", alignItems:"center", gap:8, margin:"20px 0 18px", flexWrap:"wrap" }}>
        <button onClick={prevDay} style={{ padding:"8px 14px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", cursor:"pointer", fontSize:13 }}>
          ‹ Anterior
        </button>
        <button onClick={() => setDate(todayStr)} style={{ padding:"8px 16px", background: isToday ? "#ffa619" : "#073d4a", border:"1px solid " + (isToday ? "#ffa619" : "#154753"), borderRadius:8, color: isToday ? "#fff" : "#e2e8f0", cursor:"pointer", fontWeight: isToday ? 700 : 400, fontSize:13 }}>
          Hoje
        </button>
        <button onClick={nextDay} style={{ padding:"8px 14px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", cursor:"pointer", fontSize:13 }}>
          Próximo ›
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding:"7px 12px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none" }} />
      </div>

      {/* Banner de pendências */}
      {(issuesCLT.length > 0 || undecidedFL.length > 0) && (
        <div style={{ background:"#073d4a", border:"1px solid " + (issuesCLT.length > 0 ? "#ef444460" : "#d9780640"), borderRadius:14, padding:"14px 18px", marginBottom:18, display:"flex", gap:14, flexWrap:"wrap", alignItems:"center" }}>
          <Icon name="warning" size={20} color={issuesCLT.length > 0 ? "#ef4444" : "#d97806"} />
          <div style={{ display:"flex", gap:18, flexWrap:"wrap", flex:1 }}>
            {issuesCLT.length > 0 && (
              <button onClick={() => setFilterContract("issues")}
                style={{ background:"none", border:"none", padding:0, cursor:"pointer", color:"#ef4444", fontWeight:700, fontSize:14, textAlign:"left" }}>
                {issuesCLT.length} CLT pendente{issuesCLT.length > 1 ? "s" : ""} <span style={{ color:"#94a3b8", fontWeight:400, fontSize:12 }}>(clique para filtrar)</span>
              </button>
            )}
            {undecidedFL.length > 0 && (
              <button onClick={() => setFilterContract("issues")}
                style={{ background:"none", border:"none", padding:0, cursor:"pointer", color:"#d97806", fontWeight:700, fontSize:14, textAlign:"left" }}>
                {undecidedFL.length} freelancer{undecidedFL.length > 1 ? "s" : ""} sem decisão <span style={{ color:"#94a3b8", fontWeight:400, fontSize:12 }}>(clique para filtrar)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        {[
          { v: "all",        l: "Todos",       c: "#fff"    },
          { v: "clt",        l: "Só CLT",      c: "#3b82f6" },
          { v: "freelancer", l: "Só Freelancer", c: "#f59e0b" },
          { v: "issues",     l: "Só pendentes", c: "#ef4444" },
        ].map(b => {
          const on = filterContract === b.v;
          return (
            <button key={b.v} onClick={() => setFilterContract(b.v)}
              style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${on ? b.c : "#154753"}`, background: on ? b.c + "20" : "transparent", color: on ? b.c : "#94a3b8", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              {b.l}
            </button>
          );
        })}
        <div style={{ position:"relative", marginLeft:"auto" }}>
          <div style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
            <Icon name="search" size={14} color="#64748b" />
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar instrutor..."
            style={{ padding:"9px 12px 9px 32px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", width:220 }} />
        </div>
      </div>

      {/* Legenda */}
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:12, padding:"10px 14px", background:"#01323d", borderRadius:10, border:"1px solid #154753" }}>
        {legend.map((l, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:14, height:10, borderRadius:3,
              background: l.hatched
                ? "repeating-linear-gradient(135deg," + l.c + "," + l.c + " 3px,transparent 3px,transparent 6px)"
                : l.c }} />
            <span style={{ color:"#94a3b8", fontSize:11 }}>{l.l}</span>
          </div>
        ))}
      </div>

      {/* Header da timeline (horas) */}
      <div style={{ display:"flex", gap:0, alignItems:"center", padding:"6px 0", borderBottom:"1px solid #154753", marginBottom:6 }}>
        <div style={{ width:200, flexShrink:0, color:"#64748b", fontSize:11, fontWeight:700, paddingLeft:6 }}>INSTRUTOR</div>
        <div style={{ flex:1, position:"relative", height:18, marginRight:160 }}>
          {Array.from({ length: 13 }, (_, i) => {
            const h = 8 + i;
            const pct = (i / 12) * 100;
            return (
              <div key={i} style={{ position:"absolute", left:`${pct}%`, transform:"translateX(-50%)", color:"#64748b", fontSize:10, fontWeight:600 }}>
                {String(h).padStart(2, "0")}
              </div>
            );
          })}
        </div>
        <div style={{ width:160, flexShrink:0, color:"#64748b", fontSize:11, fontWeight:700, textAlign:"right", paddingRight:6 }}>AÇÕES</div>
      </div>

      {/* Lista de instrutores com timeline */}
      {filtered.length === 0 ? (
        <div style={{ padding:60, textAlign:"center", background:"#073d4a", borderRadius:12, border:"1px solid #154753" }}>
          <p style={{ color:"#64748b", fontSize:14 }}>Nenhum instrutor encontrado com esses filtros.</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          {filtered.map(({ instr, cov, clt, free, issue }) => {
            const contractLabel = clt ? "CLT" : free ? "Freelancer" : (instr.contract || "—");
            const contractColor = clt ? "#3b82f6" : free ? "#f59e0b" : "#64748b";
            const issueColor = issue === "empty" ? "#ef4444" : issue === "partial" ? "#d97806" : issue === "undecided" ? "#d97806" : null;
            const issueLabel = issue === "empty" ? "VAZIO" : issue === "partial" ? "PARCIAL" : issue === "undecided" ? "SEM DECISÃO" : null;
            const minsClt = clt ? coverageMinutesClt(cov.blocks) : 0;
            const pctClt = clt ? Math.min(100, Math.round((minsClt / COV_CLT_EXPECTED_MIN) * 100)) : 0;

            return (
              <div key={instr.id} style={{ display:"flex", alignItems:"center", gap:0, padding:"8px 6px", borderRadius:8, background: issue ? (issue === "empty" ? "#7f1d1d10" : "#d9780610") : "#073d4a40", border:`1px solid ${issueColor ? issueColor + "30" : "#15475330"}` }}>
                {/* Nome + contrato */}
                <div style={{ width:200, flexShrink:0, paddingRight:8 }}>
                  <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{instr.name.split(" ").slice(0, 3).join(" ")}</div>
                  <div style={{ display:"flex", gap:5, alignItems:"center", marginTop:2 }}>
                    <span style={{ padding:"1px 7px", borderRadius:10, background: contractColor + "20", color: contractColor, fontSize:10, fontWeight:700 }}>{contractLabel}</span>
                    {issueLabel && <span style={{ padding:"1px 7px", borderRadius:10, background: issueColor + "25", color: issueColor, fontSize:9, fontWeight:800, letterSpacing:0.4 }}>{issueLabel}</span>}
                    {clt && !issue && cov.status !== "absence" && cov.status !== "holiday" && (
                      <span style={{ color:"#16a34a", fontSize:10, fontWeight:700 }}>✓ {pctClt}%</span>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div style={{ flex:1, position:"relative", height:30, marginRight:8, background:"#01323d", borderRadius:6, overflow:"hidden",
                  border: clt && issue ? "1px solid #ef444440" : (free && issue ? "1px solid #64748b40" : "1px solid #15475360") }}>
                  {/* Fundo: hachura pra CLT pendente, cinza pra freelancer sem decisão */}
                  {clt && issue === "empty" && (
                    <div style={{ position:"absolute", inset:0, background:"repeating-linear-gradient(135deg,#ef444440,#ef444440 4px,transparent 4px,transparent 9px)" }} />
                  )}
                  {clt && issue === "partial" && (
                    <div style={{ position:"absolute", inset:0, background:"repeating-linear-gradient(135deg,#d9780620,#d9780620 4px,transparent 4px,transparent 9px)" }} />
                  )}
                  {free && issue === "undecided" && (
                    <div style={{ position:"absolute", inset:0, background:"#64748b15" }} />
                  )}
                  {/* Gridlines para cada hora */}
                  {Array.from({ length: 11 }, (_, i) => (
                    <div key={i} style={{ position:"absolute", left:`${((i+1)/12)*100}%`, top:0, bottom:0, width:1, background:"#15475360" }} />
                  ))}
                  {/* Linhas verticais especiais: 12:00 (almoço) e 17:00 (fim expediente CLT) */}
                  {clt && (
                    <>
                      <div style={{ position:"absolute", left:`${(4/12)*100}%`, top:0, bottom:0, width:1, background:"#ffa61980" }} title="Almoço" />
                      <div style={{ position:"absolute", left:`${(5/12)*100}%`, top:0, bottom:0, width:1, background:"#ffa61980" }} title="Almoço" />
                      <div style={{ position:"absolute", left:`${(9/12)*100}%`, top:0, bottom:0, width:1.5, background:"#ffa619" }} title="Fim do expediente" />
                    </>
                  )}
                  {/* Blocos */}
                  {cov.blocks.map((b, i) => {
                    const box = blockBox(b);
                    if (!box) return null;
                    const tip = `${b.label}${b.sub ? " · " + b.sub : ""} (${b.startTime}–${b.endTime})`;
                    const isFree = b.type === "free";
                    const isHoliday = b.type === "holiday";
                    return (
                      <div key={i} title={tip}
                        onClick={() => {
                          const _editable = ["maintenance","development","customer_service","almoxarifado","cenario","holiday_work","mandatory_training"];
                          if (b.ref && _editable.includes(b.type)) {
                            setActivityModal({ show: true, instr, editing: b.ref });
                          } else if (isFree && b.ref) {
                            setFreeModal({ show: true, instr, editing: b.ref });
                          } else if (b.type === "absence" && b.ref && b.ref.category === "Folga Banco de Horas") {
                            setBankHoursModal({ show: true, instr, editing: b.ref });
                          }
                        }}
                        style={{
                          position:"absolute", left:`${box.left}%`, width:`${box.width}%`, top:3, bottom:3,
                          background: b.color, borderRadius:4, cursor: (["maintenance","development","customer_service","almoxarifado","cenario","holiday_work","mandatory_training"].includes(b.type) || isFree || (b.type==="absence" && b.ref?.category==="Folga Banco de Horas")) ? "pointer" : "default",
                          display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden",
                          border: `1px solid ${b.color}`,
                          ...(isFree ? { background:"repeating-linear-gradient(135deg," + b.color + "," + b.color + " 5px," + b.color + "70 5px," + b.color + "70 10px)" } : {}),
                        }}>
                        <span style={{ color: isHoliday ? "#01323d" : "#fff", fontSize:9, fontWeight:700, textShadow:"0 1px 1px rgba(0,0,0,0.4)", whiteSpace:"nowrap", textOverflow:"ellipsis", overflow:"hidden", padding:"0 4px" }}>
                          {isFree ? "LIVRE" : (ACTIVITY_TYPES[b.type]?.short || b.label.slice(0, 14))}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Ações */}
                <div style={{ width:160, flexShrink:0, display:"flex", gap:4, justifyContent:"flex-end", flexWrap:"wrap" }}>
                  <button onClick={() => setActivityModal({ show: true, instr, editing: null })}
                    title="Adicionar atividade interna"
                    style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:6, padding:"5px 9px", color:"#94a3b8", cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", gap:4 }}>
                    <Icon name="plus" size={10} color="#94a3b8" /> Atividade
                  </button>
                  {clt && (
                    <button onClick={() => setBankHoursModal({ show: true, instr, editing: null })}
                      title="Registrar Folga Banco de Horas"
                      style={{ background:"#073d4a", border:"1px solid #f59e0b40", borderRadius:6, padding:"5px 9px", color:"#f59e0b", cursor:"pointer", fontSize:11 }}>
                      Folga BH
                    </button>
                  )}
                  {free && (
                    <button onClick={() => setFreeModal({ show: true, instr, editing: null })}
                      title="Marcar dia como LIVRE (avaliado e sem alocação)"
                      style={{ background: cov.status === "free" ? "#94a3b820" : "#073d4a", border:"1px solid " + (cov.status === "free" ? "#94a3b860" : "#154753"), borderRadius:6, padding:"5px 9px", color: cov.status === "free" ? "#94a3b8" : "#64748b", cursor:"pointer", fontSize:11, fontWeight: cov.status === "free" ? 700 : 400 }}>
                      {cov.status === "free" ? "✓ Livre" : "Livre"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: criar/editar atividade interna */}
      {activityModal.show && (
        <ActivityModal
          instr={activityModal.instr}
          date={date}
          editing={activityModal.editing}
          activities={activities}
          setActivities={setActivities}
          schedules={schedules}
          onClose={() => setActivityModal({ show: false, instr: null, editing: null })}
          onAskDelete={(action) => setDelGuard({ show: true, action, pass: "", err: "" })}
        />
      )}

      {/* Modal: marcar LIVRE */}
      {freeModal.show && (
        <FreeModal
          instr={freeModal.instr}
          date={date}
          editing={freeModal.editing}
          activities={activities}
          setActivities={setActivities}
          onClose={() => setFreeModal({ show: false, instr: null, editing: null })}
          onAskDelete={(action) => setDelGuard({ show: true, action, pass: "", err: "" })}
        />
      )}

      {bankHoursModal.show && (
        <BankHoursModal
          instr={bankHoursModal.instr}
          date={date}
          editing={bankHoursModal.editing}
          absences={absences}
          setAbsences={setAbsences}
          onClose={() => setBankHoursModal({ show: false, instr: null, editing: null })}
          onAskDelete={(action) => setDelGuard({ show: true, action, pass: "", err: "" })}
        />
      )}

      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
    </div>
  );
};

// ── MODAL: Atividade interna (manutenção/desenvolvimento) ────────────────────
const ActivityModal = ({ instr, date, editing, activities, setActivities, schedules, onClose, onAskDelete }) => {
  const isEdit = !!editing;
  const [type, setType]           = React.useState(editing?.type || "maintenance");
  const [startTime, setStartTime] = React.useState(editing?.startTime || "08:00");
  const [endTime, setEndTime]     = React.useState(editing?.endTime   || "12:00");
  const [local, setLocal]         = React.useState(editing?.local     || "");
  const [obs, setObs]             = React.useState(editing?.obs       || "");
  const [err, setErr]             = React.useState("");

  const internalLocals = LOCALS.filter(l => l.type === INTERNAL_LOCAL_TYPE);

  const save = () => {
    setErr("");
    if (!startTime || !endTime) { setErr("Informe início e fim."); return; }
    const sM = _covTimeToMins(startTime), eM = _covTimeToMins(endTime);
    if (eM <= sM) { setErr("O horário de fim deve ser maior que o de início."); return; }
    // Detecta sobreposição com treinamentos (que são fonte de receita — não pode misturar)
    const overlapsTraining = (schedules || []).some(s =>
      s.date === date && String(s.instructorId) === String(instr.id) &&
      _covTimeToMins(s.startTime) < eM && _covTimeToMins(s.endTime) > sM
    );
    if (overlapsTraining) { setErr("Este horário conflita com um treinamento já programado."); return; }
    // Sobreposição com outras atividades internas do mesmo instrutor no dia
    const overlapsActivity = (activities || []).some(a =>
      a.id !== (editing?.id) && a.date === date && String(a.instructorId) === String(instr.id) && a.type !== "free" &&
      _covTimeToMins(a.startTime || "00:00") < eM && _covTimeToMins(a.endTime || "23:59") > sM
    );
    if (overlapsActivity) { setErr("Este horário conflita com outra atividade interna do instrutor."); return; }

    const payload = {
      type, startTime, endTime, local: local || "", obs: obs || "",
      instructorId: instr.id, instructorName: instr.name, date,
    };
    if (isEdit) {
      setActivities(activities.map(a => a.id === editing.id ? { ...a, ...payload } : a));
    } else {
      setActivities([...activities, { id: Date.now(), ...payload }]);
    }
    onClose();
  };

  const del = () => {
    onAskDelete(() => {
      setActivities(activities.filter(a => a.id !== editing.id));
      onClose();
    });
  };

  const info = ACTIVITY_TYPES[type] || { color: "#64748b", label: type };

  return (
    <Modal title={isEdit ? "Editar Atividade Interna" : "Nova Atividade Interna"} onClose={onClose} width={520}>
      <p style={{ color:"#94a3b8", fontSize:13, marginBottom:14 }}>
        <strong style={{ color:"#e2e8f0" }}>{instr.name}</strong> · {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long" })}
      </p>

      <Sel label="Tipo" value={type} onChange={e => setType(e.target.value)}
        opts={[
          { v: "maintenance",      l: "🔧 Manutenção" },
          { v: "development",      l: "📚 Desenvolvimento" },
          { v: "customer_service", l: "🎧 Apoio Customer Service" },
          { v: "almoxarifado",     l: "📦 Apoio Almoxarifado" },
          { v: "cenario",             l: "🎬 Apoio Cenário" },
          { v: "material_pdi",        l: "📖 Material Didático - PDI" },
          { v: "holiday_work",        l: "🏖 Feriado" },
          { v: "mandatory_training",  l: "🎓 Treinamento Obrigatório" },
        ]} />

      <div style={{ display:"flex", gap:10 }}>
        <div style={{ flex:1 }}>
          <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Início</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
            style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
        </div>
        <div style={{ flex:1 }}>
          <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Fim</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
            style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
        </div>
      </div>

      <div style={{ display:"flex", gap:6, marginTop:8, marginBottom:14, flexWrap:"wrap" }}>
        {[
          { l: "Manhã",     s: "08:00", e: "12:00" },
          { l: "Tarde",     s: "13:00", e: "17:00" },
          { l: "Dia todo",  s: "08:00", e: "17:00" },
          { l: "1h",        s: startTime, e: minsToTimeG(_covTimeToMins(startTime) + 60) },
          { l: "2h",        s: startTime, e: minsToTimeG(_covTimeToMins(startTime) + 120) },
        ].map(p => (
          <button key={p.l} onClick={() => { setStartTime(p.s); setEndTime(p.e); }}
            style={{ padding:"3px 10px", borderRadius:6, border:"1px solid #154753", background:"#073d4a", color:"#94a3b8", fontSize:11, cursor:"pointer" }}>
            {p.l}
          </button>
        ))}
      </div>

      <div style={{ marginBottom:14 }}>
        <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Local interno (opcional)</label>
        {internalLocals.length === 0 ? (
          <p style={{ color:"#d97806", fontSize:12, background:"#d9780615", border:"1px solid #d9780640", borderRadius:8, padding:"8px 12px", margin:0 }}>
            Nenhum local interno cadastrado. Cadastre em <strong>Locais</strong> com tipo "Interno" (ex: ALMOXARIFADO, OFICINA DE MERGULHO).
          </p>
        ) : (
          <select value={local} onChange={e => setLocal(e.target.value)}
            style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none" }}>
            <option value="">— sem local —</option>
            {internalLocals.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
          </select>
        )}
      </div>

      <div style={{ marginBottom:18 }}>
        <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Observação (opcional)</label>
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} maxLength={200} placeholder="Ex: manutenção dos manequins de RCP"
          style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
      </div>

      {err && <p style={{ color:"#f87171", fontSize:13, marginBottom:12 }}>{err}</p>}

      <div style={{ display:"flex", gap:8, justifyContent: isEdit ? "space-between" : "flex-start" }}>
        <div style={{ display:"flex", gap:8 }}>
          <Btn onClick={save} label={isEdit ? "Salvar" : "Criar"} icon="check" color={info.color} />
          <Btn onClick={onClose} label="Cancelar" color="#154753" />
        </div>
        {isEdit && <Btn onClick={del} label="Excluir" icon="delete" color="#ef4444" />}
      </div>
    </Modal>
  );
};

// ── MODAL: Marcar dia LIVRE (freelancer) ─────────────────────────────────────
const FreeModal = ({ instr, date, editing, activities, setActivities, onClose, onAskDelete }) => {
  const isEdit = !!editing;
  const [obs, setObs] = React.useState(editing?.obs || "");

  const save = () => {
    // Remove qualquer "free" pré-existente do instrutor naquele dia para evitar duplicatas
    const cleaned = activities.filter(a => !(a.date === date && String(a.instructorId) === String(instr.id) && a.type === "free" && a.id !== editing?.id));
    if (isEdit) {
      setActivities(cleaned.map(a => a.id === editing.id ? { ...a, obs } : a));
    } else {
      setActivities([...cleaned, { id: Date.now(), type: "free", instructorId: instr.id, instructorName: instr.name, date, obs }]);
    }
    onClose();
  };

  const del = () => {
    onAskDelete(() => {
      setActivities(activities.filter(a => a.id !== editing.id));
      onClose();
    });
  };

  return (
    <Modal title={isEdit ? "Editar dia LIVRE" : "Marcar dia LIVRE"} onClose={onClose} width={460}>
      <p style={{ color:"#94a3b8", fontSize:13, marginBottom:14 }}>
        <strong style={{ color:"#e2e8f0" }}>{instr.name}</strong> · {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long" })}
      </p>
      <div style={{ background:"#01323d", border:"1px solid #15475380", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
        <p style={{ color:"#94a3b8", fontSize:13, lineHeight:1.5, margin:0 }}>
          Marca este dia como <strong style={{ color:"#94a3b8" }}>LIVRE</strong> — informa que o freelancer foi <em>avaliado</em> e está fora da programação. Diferente de VAZIO (que indica falta de avaliação).
        </p>
      </div>

      <div style={{ marginBottom:18 }}>
        <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Observação (opcional)</label>
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} maxLength={200} placeholder="Ex: já alocado em outra empresa hoje"
          style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
      </div>

      <div style={{ display:"flex", gap:8, justifyContent: isEdit ? "space-between" : "flex-start" }}>
        <div style={{ display:"flex", gap:8 }}>
          <Btn onClick={save} label={isEdit ? "Salvar" : "Marcar como Livre"} icon="check" color={ACTIVITY_TYPES.free.color} />
          <Btn onClick={onClose} label="Cancelar" color="#154753" />
        </div>
        {isEdit && <Btn onClick={del} label="Remover marcação" icon="delete" color="#ef4444" />}
      </div>
    </Modal>
  );
};

// ── MODAL: Folga Banco de Horas ──────────────────────────────────────────────
const BankHoursModal = ({ instr, date, editing, absences, setAbsences, onClose, onAskDelete }) => {
  const isEdit = !!editing;
  const [fullDay, setFullDay]     = React.useState(isEdit ? !editing.startTime : true);
  const [startTime, setStartTime] = React.useState(editing?.startTime || "08:00");
  const [endTime, setEndTime]     = React.useState(editing?.endTime   || "12:00");
  const [obs, setObs]             = React.useState(editing?.obs       || "");
  const [err, setErr]             = React.useState("");

  const save = () => {
    setErr("");
    if (!fullDay) {
      const sM = _covTimeToMins(startTime), eM = _covTimeToMins(endTime);
      if (eM <= sM) { setErr("O horário de fim deve ser maior que o de início."); return; }
    }
    const payload = {
      type: "planejada",
      category: "Folga Banco de Horas",
      instructorId: instr.id,
      instructorName: instr.name,
      startDate: date,
      endDate: date,
      obs: obs || "",
      ...(fullDay ? {} : { startTime, endTime }),
    };
    if (isEdit) {
      setAbsences(absences.map(a => a.id === editing.id ? { ...a, ...payload } : a));
    } else {
      setAbsences([...absences, { id: Date.now(), ...payload }]);
    }
    onClose();
  };

  const del = () => {
    onAskDelete(() => {
      setAbsences(absences.filter(a => a.id !== editing.id));
      onClose();
    });
  };

  return (
    <Modal title={isEdit ? "Editar Folga Banco de Horas" : "Registrar Folga Banco de Horas"} onClose={onClose} width={520}>
      <p style={{ color:"#94a3b8", fontSize:13, marginBottom:14 }}>
        <strong style={{ color:"#e2e8f0" }}>{instr.name}</strong> · {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long" })}
      </p>
      <div style={{ background:"#01323d", border:"1px solid #15475380", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
        <p style={{ color:"#94a3b8", fontSize:13, lineHeight:1.5, margin:0 }}>
          Registra que o instrutor está de <strong style={{ color:"#f59e0b" }}>Folga Banco de Horas</strong>. Aparece como ausência planejada na Cobertura Diária e no Absenteísmo.
        </p>
      </div>

      <label style={{ color:"#94a3b8", fontSize:13, display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:14 }}>
        <input type="checkbox" checked={fullDay} onChange={e => setFullDay(e.target.checked)}
          style={{ accentColor:"#f59e0b", width:15, height:15 }} />
        Dia inteiro
      </label>

      {!fullDay && (
        <>
          <div style={{ display:"flex", gap:10, marginBottom:8 }}>
            <div style={{ flex:1 }}>
              <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Início</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Fim</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
            </div>
          </div>
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
            {[
              { l: "Manhã",  s: "08:00", e: "12:00" },
              { l: "Tarde",  s: "13:00", e: "17:00" },
              { l: "Dia todo", s: "08:00", e: "17:00" },
            ].map(p => (
              <button key={p.l} onClick={() => { setStartTime(p.s); setEndTime(p.e); }}
                style={{ padding:"3px 10px", borderRadius:6, border:"1px solid #154753", background:"#073d4a", color:"#94a3b8", fontSize:11, cursor:"pointer" }}>
                {p.l}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ marginBottom:18 }}>
        <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Observação (opcional)</label>
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} maxLength={200} placeholder="Ex: compensação de horas extras da semana passada"
          style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
      </div>

      {err && <p style={{ color:"#f87171", fontSize:13, marginBottom:12 }}>{err}</p>}

      <div style={{ display:"flex", gap:8, justifyContent: isEdit ? "space-between" : "flex-start" }}>
        <div style={{ display:"flex", gap:8 }}>
          <Btn onClick={save} label={isEdit ? "Salvar" : "Registrar"} icon="check" color="#f59e0b" />
          <Btn onClick={onClose} label="Cancelar" color="#154753" />
        </div>
        {isEdit && <Btn onClick={del} label="Excluir" icon="delete" color="#ef4444" />}
      </div>
    </Modal>
  );
};
