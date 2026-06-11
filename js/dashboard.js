// ── DASHBOARD ─────────────────────────────────────────────────────────────────
const LocalsReportPage = ({ schedules }) => {
  const todayStr = new Date().toISOString().split("T")[0];
  const [date,         setDate]        = React.useState(todayStr);
  const [search,       setSearch]      = React.useState("");
  const [activeGroup,  setActiveGroup] = React.useState("Todos");
  const [showOnlyFree, setShowOnlyFree]= React.useState(false);
  const [showOnlyOcc,  setShowOnlyOcc] = React.useState(false);

  const prevDay = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); setDate(d.toISOString().split("T")[0]); };
  const nextDay = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); setDate(d.toISOString().split("T")[0]); };

  const M_END   = 12 * 60;
  const A_START = 13 * 60;

  const schedForLocal = name => schedules.filter(s => s.local === name && s.date === date);
  const isMOcc = name => schedForLocal(name).some(s => timeToMins(s.startTime) < M_END);
  const isAOcc = name => schedForLocal(name).some(s => timeToMins(s.endTime)   > A_START);

  const grouped = [
    { key: "teorico",    label: "RelyOn Macaé — Teórico", color: "#ffa619", items: LOCALS.filter(l => l.type === "RelyOn Macaé" && l.env === "Teórico") },
    { key: "piscina",   label: "Piscinas",                color: "#06b6d4", items: LOCALS.filter(l => l.subtype === "piscina") },
    { key: "incendio",  label: "Combate a Incêndio",      color: "#ef4444", items: LOCALS.filter(l => l.subtype === "incendio") },
    { key: "industrial",label: "Industrial / Rigger",     color: "#f97316", items: LOCALS.filter(l => l.subtype === "industrial") },
    { key: "manobra",   label: "Manobras",                color: "#8b5cf6", items: LOCALS.filter(l => l.subtype === "manobra") },
    { key: "offshore",  label: "Offshore",                color: "#e8920a", items: LOCALS.filter(l => l.type === "Offshore") },
    { key: "incompany", label: "In Company",              color: "#f59e0b", items: LOCALS.filter(l => l.type === "In Company") },
    { key: "online",    label: "Online",                  color: "#10b981", items: LOCALS.filter(l => l.type === "Online") },
    { key: "interno",   label: "Interno (Apoio)",         color: "#64748b", items: LOCALS.filter(l => l.type === INTERNAL_LOCAL_TYPE) },
  ].filter(g => g.items.length > 0);

  const visibleGroups = activeGroup === "Todos" ? grouped : grouped.filter(g => g.key === activeGroup);
  const filtered = visibleGroups
    .map(g => ({
      ...g,
      items: g.items.filter(l => {
        if (!l.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (showOnlyFree) return !isMOcc(l.name) && !isAOcc(l.name);
        if (showOnlyOcc)  return  isMOcc(l.name) || isAOcc(l.name);
        return true;
      })
    }))
    .filter(g => g.items.length > 0);

  const getInfo = name => {
    const map = {};
    schedForLocal(name).forEach(s => {
      const key = s.className + "||" + s.module + "||" + s.startTime + "||" + s.endTime;
      if (!map[key]) map[key] = { className: s.className, module: s.module, startTime: s.startTime, endTime: s.endTime, instrs: [] };
      if (s.instructorName) map[key].instrs.push({ name: s.instructorName, role: s.role });
    });
    return Object.values(map).sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const isToday = date === todayStr;
  const fmtDay  = ds => new Date(ds + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div>
      <h2 style={{ color:"#fff", fontWeight:800, margin:"0 0 2px", fontSize:24 }}>Disponibilidade de Locais</h2>
      <p style={{ color:"#64748b", margin:"0 0 20px", fontSize:14, textTransform:"capitalize" }}>{fmtDay(date)}</p>

      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18, flexWrap:"wrap" }}>
        <button onClick={prevDay}
          style={{ padding:"8px 14px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", cursor:"pointer", fontSize:13 }}>
          ‹ Anterior
        </button>
        <button onClick={() => setDate(todayStr)}
          style={{ padding:"8px 16px", background: isToday ? "#ffa619" : "#073d4a", border:"1px solid " + (isToday ? "#ffa619" : "#154753"), borderRadius:8, color: isToday ? "#fff" : "#e2e8f0", cursor:"pointer", fontWeight: isToday ? 700 : 400, fontSize:13 }}>
          Hoje
        </button>
        <button onClick={nextDay}
          style={{ padding:"8px 14px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", cursor:"pointer", fontSize:13 }}>
          Próximo ›
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding:"7px 12px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none" }} />
        <button onClick={() => { setShowOnlyFree(v => !v); setShowOnlyOcc(false); }}
          style={{ padding:"8px 14px", marginLeft:"auto", background: showOnlyFree ? "#16a34a20" : "#073d4a", border:"1px solid " + (showOnlyFree ? "#16a34a" : "#154753"), borderRadius:8, color: showOnlyFree ? "#16a34a" : "#94a3b8", cursor:"pointer", fontSize:13, fontWeight: showOnlyFree ? 700 : 400 }}>
          {showOnlyFree ? "✓ Apenas livres" : "Só livres"}
        </button>
        <button onClick={() => { setShowOnlyOcc(v => !v); setShowOnlyFree(false); }}
          style={{ padding:"8px 14px", background: showOnlyOcc ? "#ef444420" : "#073d4a", border:"1px solid " + (showOnlyOcc ? "#ef4444" : "#154753"), borderRadius:8, color: showOnlyOcc ? "#ef4444" : "#94a3b8", cursor:"pointer", fontSize:13, fontWeight: showOnlyOcc ? 700 : 400 }}>
          {showOnlyOcc ? "✓ Apenas ocupados" : "Só ocupados"}
        </button>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <button onClick={() => setActiveGroup("Todos")}
          style={{ padding:"6px 14px", borderRadius:20, border:"1px solid " + (activeGroup === "Todos" ? "#fff" : "#154753"), background: activeGroup === "Todos" ? "#fff" : "transparent", color: activeGroup === "Todos" ? "#01323d" : "#94a3b8", fontSize:12, fontWeight:700, cursor:"pointer" }}>
          TODOS ({LOCALS.length})
        </button>
        {grouped.map(g => (
          <button key={g.key} onClick={() => setActiveGroup(activeGroup === g.key ? "Todos" : g.key)}
            style={{ padding:"6px 14px", borderRadius:20, border:"1px solid " + (activeGroup === g.key ? g.color : "#154753"), background: activeGroup === g.key ? g.color + "20" : "transparent", color: activeGroup === g.key ? g.color : "#94a3b8", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:g.color }} />
            {g.label} ({g.items.length})
          </button>
        ))}
      </div>

      <div style={{ position:"relative", marginBottom:20 }}>
        <div style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)" }}><Icon name="search" size={16} color="#64748b" /></div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar local..."
          style={{ width:"100%", padding:"10px 10px 10px 40px", background:"#073d4a", border:"1px solid #154753", borderRadius:10, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
      </div>

      {filtered.length === 0 && <p style={{ color:"#64748b", textAlign:"center", marginTop:40 }}>Nenhum local encontrado.</p>}
      {filtered.map(g => (
        <div key={g.key} style={{ marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:g.color }} />
            <h3 style={{ color:"#e2e8f0", fontWeight:700, margin:0, fontSize:15 }}>{g.label}</h3>
            <span style={{ color:"#64748b", fontSize:13 }}>{g.items.length} local(is)</span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
            {g.items.map(l => {
              const mo = isMOcc(l.name), ao = isAOcc(l.name), anyOcc = mo || ao;
              const lc = localColor(l.name);
              const sessions = getInfo(l.name);
              return (
                <div key={l.id} style={{ background:"#073d4a", borderRadius:14, border:"1px solid " + (anyOcc ? "#ef4444" : lc + "40"), overflow:"hidden" }}>
                  <div style={{ height:3, background: anyOcc ? "#ef4444" : lc }} />
                  <div style={{ padding:"12px 14px 10px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:6 }}>
                      <p style={{ color:"#e2e8f0", fontWeight:700, margin:0, fontSize:13, lineHeight:1.3 }}>{l.name}</p>
                      <span style={{ padding:"2px 7px", borderRadius:20, background: anyOcc ? "#ef444420" : lc + "20", color: anyOcc ? "#ef4444" : lc, fontSize:10, fontWeight:700, whiteSpace:"nowrap", flexShrink:0 }}>
                        {anyOcc ? "EM USO" : "LIVRE"}
                      </span>
                    </div>
                    <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
                      <span style={{ padding:"2px 8px", borderRadius:20, background: mo ? "#ef444415" : "#16a34a15", color: mo ? "#ef4444" : "#16a34a", fontSize:10, fontWeight:700, border:"1px solid " + (mo ? "#ef444430" : "#16a34a30") }}>
                        Manhã {mo ? "OCUPADA" : "LIVRE"}
                      </span>
                      <span style={{ padding:"2px 8px", borderRadius:20, background: ao ? "#ef444415" : "#16a34a15", color: ao ? "#ef4444" : "#16a34a", fontSize:10, fontWeight:700, border:"1px solid " + (ao ? "#ef444430" : "#16a34a30") }}>
                        Tarde {ao ? "OCUPADA" : "LIVRE"}
                      </span>
                    </div>
                  </div>
                  {sessions.length > 0 && (
                    <div style={{ borderTop:"1px solid #154753" }}>
                      {sessions.map((sess, idx) => (
                        <div key={idx} style={{ padding:"10px 14px", borderBottom: idx < sessions.length - 1 ? "1px solid #01323d40" : "none" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:4, marginBottom:4 }}>
                            <span style={{ color:"#ffa619", fontSize:11, fontWeight:700 }}>{sess.className}</span>
                            <span style={{ color:"#475569", fontSize:10 }}>{sess.startTime}–{sess.endTime}</span>
                          </div>
                          <p style={{ color:"#94a3b8", fontSize:11, margin:"0 0 5px", lineHeight:1.3 }}>{sess.module}</p>
                          {sess.instrs.map((instr, i) => (
                            <div key={i} style={{ display:"flex", alignItems:"center", gap:5, marginTop:3 }}>
                              <span style={{ color:"#64748b", fontSize:11 }}>👤</span>
                              <span style={{ color:"#cbd5e1", fontSize:11 }}>{instr.name}</span>
                              <span style={{ color:"#475569", fontSize:10 }}>· {ROLE_PT[instr.role] || instr.role || ""}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

const Dashboard = ({ schedules, setSchedules, trainings, setActive, user, instructors = [], activities = [], absences = [], holidays = [], viewBase, setAdminViewBase }) => {
  const todayStr = new Date().toISOString().split("T")[0];
  const [date, setDate] = React.useState(todayStr);
  const [pendingModal,       setPendingModal]       = React.useState(false);
  const [conflictModal,      setConflictModal]      = React.useState(false);
  const [contractAlertModal, setContractAlertModal] = React.useState(false);
  const [expandedIssue,      setExpandedIssue]      = React.useState(null);
  const [freeHidden,         setFreeHidden]         = React.useState(() => new Set());
  const [freeModalData,      setFreeModalData]      = React.useState(null);
  const [freeShowFilter,     setFreeShowFilter]     = React.useState(false);
  const [freeBlurred,        setFreeBlurred]        = React.useState(true);

  const prevDay = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); setDate(d.toISOString().split("T")[0]); };
  const nextDay = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); setDate(d.toISOString().split("T")[0]); };
  const isToday = date === todayStr;
  const fmtDay  = ds => new Date(ds + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const fmtDate = ds => ds ? new Date(ds + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }) : "";
  const fmtDt   = iso => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

  const daySchedules  = schedules.filter(s => s.date === date);
  const dayClassIds   = [...new Set(daySchedules.map(s => s.classId).filter(Boolean))];
  const turmasCount   = dayClassIds.length;

  // Detecta conflitos do dia: pares de rows em turmas diferentes (não vinculadas)
  // que se sobrepõem no horário e compartilham instrutor OU local.
  // Mesma lógica de GroupCalendarView (linhas 572-592). Agrega por classId pra
  // contar turmas únicas afetadas e por par de turmas pro modal.
  const conflictInfo = (() => {
    const linksByClassId = {};
    dayClassIds.forEach(cid => {
      const row = daySchedules.find(s => s.classId === cid && Array.isArray(s.linkedClassNames));
      linksByClassId[cid] = row?.linkedClassNames || [];
    });
    const tToM = (s) => { const [h, m] = (s || "00:00").split(":").map(Number); return h * 60 + m; };
    const conflictsByClassId = {};
    const pairList = []; // { classIds:[a,b], classNames:[A,B], kind:"instr"|"local"|"vacancy", subject, startTime, endTime, module }
    const pairSeen = new Set();
    // Vagas em aberto (instructorId vazio/null) — geralmente vêm de inativação de instrutor.
    // Cada row sem instrutor vira um "conflito" da turma, separado de overlap-conflicts.
    daySchedules.forEach(r => {
      if (r.instructorId) return;
      if (isDraftRow && isDraftRow(r)) return; // rascunho de IA não conta
      if (r.role === "Translator") return; // tradutor é opcional
      if (r.classId) conflictsByClassId[r.classId] = true;
      const key = ["vacancy", r.classId || "?", r.module || "?", r.startTime || "", r.endTime || ""].join("|");
      if (pairSeen.has(key)) return;
      pairSeen.add(key);
      pairList.push({
        kind: "vacancy",
        subject: "Vaga sem instrutor",
        classes: [{ classId: r.classId, className: r.className, module: r.module }],
        startTime: r.startTime,
        endTime: r.endTime,
        local: r.local || ""
      });
    });
    for (let i = 0; i < daySchedules.length; i++) {
      for (let j = i + 1; j < daySchedules.length; j++) {
        const a = daySchedules[i], b = daySchedules[j];
        if (a.classId && b.classId && a.classId === b.classId) continue;
        const aLinks = linksByClassId[a.classId] || [];
        if (aLinks.includes(b.className)) continue;
        const aS = tToM(a.startTime), aE = tToM(a.endTime);
        const bS = tToM(b.startTime), bE = tToM(b.endTime);
        if (!(aS < bE && bS < aE)) continue;
        const overlapStart = aS > bS ? a.startTime : b.startTime;
        const overlapEnd   = aE < bE ? a.endTime   : b.endTime;
        const sameInstr = a.instructorId && b.instructorId && +a.instructorId === +b.instructorId;
        const sameLocal = a.local && b.local && a.local === b.local;
        if (!sameInstr && !sameLocal) continue;
        if (a.classId) conflictsByClassId[a.classId] = true;
        if (b.classId) conflictsByClassId[b.classId] = true;
        if (sameInstr) {
          const key = ["instr", a.instructorId, a.classId, b.classId, overlapStart, overlapEnd].sort().join("|");
          if (!pairSeen.has(key)) {
            pairSeen.add(key);
            pairList.push({
              kind: "instr",
              subject: a.instructorName || b.instructorName || `Instrutor ${a.instructorId}`,
              classes: [{ classId: a.classId, className: a.className, module: a.module }, { classId: b.classId, className: b.className, module: b.module }],
              startTime: overlapStart, endTime: overlapEnd,
            });
          }
        }
        if (sameLocal) {
          const key = ["local", a.local, a.classId, b.classId, overlapStart, overlapEnd].sort().join("|");
          if (!pairSeen.has(key)) {
            pairSeen.add(key);
            pairList.push({
              kind: "local",
              subject: a.local,
              classes: [{ classId: a.classId, className: a.className, module: a.module }, { classId: b.classId, className: b.className, module: b.module }],
              startTime: overlapStart, endTime: overlapEnd,
            });
          }
        }
      }
    }

    // ── Conflitos de DISPONIBILIDADE / COMPETÊNCIA ───────────────────────────
    // Não comparam programação×programação; cruzam cada slot-com-instrutor contra
    // ausências, atividades da Linha do Tempo e o cadastro de competências.
    const _activeRows = daySchedules.filter(r => r.instructorId && !(isDraftRow && isDraftRow(r)));

    // (a) AUSÊNCIA registrada cobrindo a data (dia inteiro) ou o horário do slot.
    const absByInstr = {};
    (absences || []).forEach(a => {
      if (!a || a.instructorId == null) return;
      if (a.startDate && date < a.startDate) return;
      if (a.endDate && date > a.endDate) return;
      (absByInstr[+a.instructorId] = absByInstr[+a.instructorId] || []).push(a);
    });
    _activeRows.forEach(r => {
      const list = absByInstr[+r.instructorId];
      if (!list) return;
      const rS = tToM(r.startTime), rE = tToM(r.endTime);
      list.forEach(a => {
        const fullDay = isFullDayAbsence(a.category) || !a.startTime || !a.endTime;
        if (!fullDay && !(rS < tToM(a.endTime) && tToM(a.startTime) < rE)) return;
        const label = a.category || (ABSENCE_TYPES[a.type] || {}).label || a.type || "Ausência";
        const key = ["absence", r.instructorId, r.classId, r.module, r.startTime].join("|");
        if (pairSeen.has(key)) return;
        pairSeen.add(key);
        if (r.classId) conflictsByClassId[r.classId] = true;
        pairList.push({
          kind: "absence",
          subject: (r.instructorName || ("Instrutor " + r.instructorId)) + " — " + label,
          classes: [{ classId: r.classId, className: r.className, module: r.module }],
          startTime: r.startTime, endTime: r.endTime,
        });
      });
    });

    // (b) ATIVIDADE na Linha do Tempo no mesmo dia (free = dia inteiro) sobrepondo o slot.
    const actByInstr = {};
    (activities || []).forEach(a => {
      if (!a || a.instructorId == null || a.date !== date) return;
      (actByInstr[+a.instructorId] = actByInstr[+a.instructorId] || []).push(a);
    });
    _activeRows.forEach(r => {
      const list = actByInstr[+r.instructorId];
      if (!list) return;
      const rS = tToM(r.startTime), rE = tToM(r.endTime);
      list.forEach(a => {
        const fullDay = !a.startTime || !a.endTime; // ex: folga (free)
        if (!fullDay && !(rS < tToM(a.endTime) && tToM(a.startTime) < rE)) return;
        const label = (ACTIVITY_TYPES[a.type] || {}).label || a.type || "Atividade";
        const key = ["activity", r.instructorId, r.classId, r.module, r.startTime].join("|");
        if (pairSeen.has(key)) return;
        pairSeen.add(key);
        if (r.classId) conflictsByClassId[r.classId] = true;
        pairList.push({
          kind: "activity",
          subject: (r.instructorName || ("Instrutor " + r.instructorId)) + " — " + label,
          classes: [{ classId: r.classId, className: r.className, module: r.module }],
          startTime: r.startTime, endTime: r.endTime,
        });
      });
    });

    // (c) COMPETÊNCIA: papel especial (Scuba/Crane/Tradutor) exige a competência marcada e válida;
    //     papéis que ministram a disciplina (Teórico/Prático/Assistant) exigem skill com o moduleId do slot.
    const instrById = {};
    (instructors || []).forEach(i => { if (i && i.id != null) instrById[+i.id] = i; });
    const SPECIAL_BY_ROLE = { "Scuba Diver": "SCUBA_DIVER", "Crane Operator": "CRANE_OPERATOR", "Translator": "TRADUTOR" };
    const DISCIPLINE_ROLES = new Set(["Theoretical Instructor", "Practical Instructor", "Assistant Instructor"]);
    _activeRows.forEach(r => {
      const instr = instrById[+r.instructorId];
      if (!instr) return; // sem cadastro do instrutor não dá pra avaliar
      let lacking = null;
      const special = SPECIAL_BY_ROLE[r.role];
      if (special) {
        if (!hasValidCompetency(instr, special)) lacking = (getSpecialCompetency(special) || {}).label || special;
      } else if (DISCIPLINE_ROLES.has(r.role) && r.moduleId != null) {
        const has = (instr.skills || []).some(s => s && s.moduleId != null && +s.moduleId === +r.moduleId);
        if (!has) lacking = "competência neste treinamento";
      }
      if (!lacking) return;
      const key = ["competency", r.instructorId, r.classId, r.module, r.startTime].join("|");
      if (pairSeen.has(key)) return;
      pairSeen.add(key);
      if (r.classId) conflictsByClassId[r.classId] = true;
      pairList.push({
        kind: "competency",
        subject: (r.instructorName || ("Instrutor " + r.instructorId)) + " — sem " + lacking,
        classes: [{ classId: r.classId, className: r.className, module: r.module }],
        startTime: r.startTime, endTime: r.endTime,
      });
    });

    return { conflictClassCount: Object.keys(conflictsByClassId).length, pairs: pairList };
  })();
  const conflictClassCount = conflictInfo.conflictClassCount;

  const instrCount    = [...new Set(daySchedules.map(s => s.instructorId).filter(Boolean))].length;
  const totalStudents = dayClassIds.reduce((sum, cid) => {
    const row = daySchedules.find(s => s.classId === cid && s.studentCount);
    return sum + (parseInt(row?.studentCount) || 0);
  }, 0);

  const instrRows         = daySchedules.filter(s => s.instructorId);
  const confirmedInstrIds = new Set(instrRows.filter(s => s.status === "Confirmado").map(s => String(s.instructorId)));
  // Rascunho não é "aguardando ciência" — é trabalho em quarentena na IA. Não vira pendência.
  const pendingInstrIds   = [...new Set(instrRows.filter(s => s.status !== "Confirmado" && !isDraftRow(s)).map(s => String(s.instructorId)))]
                              .filter(id => !confirmedInstrIds.has(id));
  const confirmedCount    = instrCount - pendingInstrIds.length;

  const M_END   = 12 * 60, A_START = 13 * 60;
  const teoricos = LOCALS.filter(l => l.env === "Teórico");
  const fM = teoricos.filter(l => !schedules.some(s => s.local === l.name && s.date === date && timeToMins(s.startTime) < M_END)).length;
  const fA = teoricos.filter(l => !schedules.some(s => s.local === l.name && s.date === date && timeToMins(s.endTime)   > A_START)).length;

  // Contagem de cobertura: CLT sem nenhuma justificativa + freelancers sem decisão.
  // Usa o mesmo helper computeCoverage (definido em constants.js) que a tela de
  // Linha do Tempo para garantir consistência.
  const coverageStats = (() => {
    if (!instructors.length || typeof computeCoverage !== "function") return { cltEmpty: 0, freeUndecided: 0 };
    let cltEmpty = 0, freeUndecided = 0;
    instructors.forEach(i => {
      if (i.status === "Inativo") return;
      const cov = computeCoverage(i, date, schedules, activities, absences, holidays);
      if (isClt(i) && cov.status === "empty") cltEmpty++;
      else if (isFreelancer(i) && cov.status === "empty") freeUndecided++;
    });
    return { cltEmpty, freeUndecided };
  })();
  const coverageIssues = coverageStats.cltEmpty + coverageStats.freeUndecided;

  // Contagem de tickets ativos (aberto + em andamento) — a página dedicada
  // (rota "issues") cuida do chat completo, ações de ciente/resolver e lista
  // resolvidos.
  const activeIssuesCount = countActiveIssues(schedules);

  return (
    <div>
      <h2 style={{ color:"#fff", fontWeight:800, marginBottom:4, fontSize:24 }}>Dashboard</h2>
      <p style={{ color:"#64748b", marginBottom:16, fontSize:14, textTransform:"capitalize" }}>{fmtDay(date)}</p>

      {/* Resumo por seção — GERAL | MACAÉ | BANGU | OFFSHORE (horizontal, clicáveis) */}
      {canPlan && canPlan(user) && (() => {
        const allDay = schedules.filter(s => s.date === date);

        // Geral = Macaé base + Bangu base combinados
        const geralDay  = allDay.filter(s => s.planningType === "base" || !s.planningType);
        const gClass    = [...new Set(geralDay.map(s => s.classId).filter(Boolean))].length;
        const gInstr    = [...new Set(geralDay.map(s => s.instructorId).filter(Boolean))].length;

        // Dados por base
        const baseData = ["Macaé", "Bangu"].map(base => {
          const bDay   = allDay.filter(s => (!s.base || s.base === base) && (s.planningType === "base" || !s.planningType));
          return {
            base,
            cls:  [...new Set(bDay.map(s => s.classId).filter(Boolean))].length,
            instr:[...new Set(bDay.map(s => s.instructorId).filter(Boolean))].length,
            pend: [...new Set(bDay.filter(s => s.status !== "Confirmado").map(s => String(s.instructorId)).filter(Boolean))].length,
          };
        });

        // Offshore: a bordo, indisponíveis, disponíveis
        const offDay = allDay.filter(s => s.planningType === "offshore");
        const aBordoIds = new Set([
          ...offDay.map(s => String(s.instructorId)).filter(Boolean),
          ...(activities || []).filter(a => a.date === date && a.type === "embarque").map(a => String(a.instructorId)).filter(Boolean),
        ]);
        const absentIds = new Set(
          (absences || [])
            .filter(a => a.startDate <= date && (a.endDate || a.startDate) >= date)
            .map(a => String(a.instructorId))
        );
        const activeInstrs    = instructors.filter(i => i.status !== "Inativo");
        const aBordoCount     = aBordoIds.size;
        const indispCount     = [...absentIds].filter(id => !aBordoIds.has(id)).length;
        const dispCount       = activeInstrs.filter(i => !aBordoIds.has(String(i.id)) && !absentIds.has(String(i.id))).length;
        const offTurmas       = [...new Set(offDay.map(s => s.classId).filter(Boolean))].length;

        const isOff = viewBase === "Offshore";
        const canSwitch = typeof setAdminViewBase === "function";
        const switchBase = (base) => { if (canSwitch) setAdminViewBase(base); };

        const cardStyle = (accent, isActive) => ({
          background: isActive ? "#073d4a" : "#042830",
          border: `1px solid ${isActive ? accent : "#0e3a45"}`,
          borderRadius: 12,
          padding: "12px 16px",
          flex: "0 0 auto",
          cursor: canSwitch ? "pointer" : "default",
          transition: "border-color 0.2s",
        });

        const stat = (val, label, color = "#e2e8f0") => (
          <div>
            <div style={{ color, fontWeight:800, fontSize:20, lineHeight:1 }}>{val}</div>
            <div style={{ color:"#475569", fontSize:10, marginTop:2, whiteSpace:"nowrap" }}>{label}</div>
          </div>
        );

        return (
          <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap", alignItems:"flex-start" }}>

            {/* GERAL */}
            <div style={cardStyle("#8b5cf6", !viewBase)} onClick={() => switchBase(null)}
              onMouseEnter={e => { if(canSwitch) e.currentTarget.style.borderColor="#8b5cf6"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = !viewBase ? "#8b5cf6" : "#0e3a45"; }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color: !viewBase ? "#8b5cf6" : "#64748b", textTransform:"uppercase", letterSpacing:0.5 }}>◈ Geral</span>
                {!viewBase && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:10, background:"#8b5cf620", color:"#8b5cf6", fontWeight:700, border:"1px solid #8b5cf640" }}>ativo</span>}
              </div>
              <div style={{ display:"flex", gap:14 }}>
                {stat(gClass, "turmas")}
                {stat(gInstr, "instrutores", "#06b6d4")}
              </div>
            </div>

            {/* MACAÉ e BANGU */}
            {baseData.map(({ base, cls, instr, pend }) => {
              const isActive = viewBase === base;
              return (
                <div key={base} style={cardStyle("#ffa619", isActive)}
                  onClick={() => switchBase(base)}
                  onMouseEnter={e => { if(canSwitch) e.currentTarget.style.borderColor="#ffa619"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isActive ? "#ffa619" : "#0e3a45"; }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                    <span style={{ fontSize:11, fontWeight:700, color: isActive ? "#ffa619" : "#64748b", textTransform:"uppercase", letterSpacing:0.5 }}>📍 {base}</span>
                    {isActive && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:10, background:"#ffa61920", color:"#ffa619", fontWeight:700, border:"1px solid #ffa61940" }}>ativa</span>}
                  </div>
                  <div style={{ display:"flex", gap:14 }}>
                    {stat(cls, "turmas")}
                    {stat(instr, "instrutores", "#06b6d4")}
                    {pend > 0 && stat(pend, "pendentes", "#ef4444")}
                  </div>
                </div>
              );
            })}

            {/* OFFSHORE — card expandido */}
            <div style={{ ...cardStyle("#e8920a", isOff), minWidth: 220 }}
              onClick={() => switchBase("Offshore")}
              onMouseEnter={e => { if(canSwitch) e.currentTarget.style.borderColor="#e8920a"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = isOff ? "#e8920a" : "#0e3a45"; }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:11, fontWeight:700, color: isOff ? "#e8920a" : "#64748b", textTransform:"uppercase", letterSpacing:0.5 }}>⛵ Offshore</span>
                  {isOff && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:10, background:"#e8920a20", color:"#e8920a", fontWeight:700, border:"1px solid #e8920a40" }}>ativa</span>}
                </div>
                {offTurmas > 0 && <span style={{ fontSize:10, color:"#64748b" }}>{offTurmas} turma{offTurmas > 1 ? "s" : ""}</span>}
              </div>
              <div style={{ display:"flex", gap:14 }}>
                {stat(aBordoCount, "a bordo", "#0ea5e9")}
                {stat(indispCount, "indispon.", "#ef4444")}
                {stat(dispCount,   "disponív.", "#16a34a")}
              </div>
            </div>

          </div>
        );
      })()}

      {/* Navegação por data */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:24, flexWrap:"wrap" }}>
        <button onClick={prevDay}
          style={{ padding:"8px 14px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", cursor:"pointer", fontSize:13 }}>
          ‹ Anterior
        </button>
        <button onClick={() => setDate(todayStr)}
          style={{ padding:"8px 16px", background: isToday ? "#ffa619" : "#073d4a", border:"1px solid " + (isToday ? "#ffa619" : "#154753"), borderRadius:8, color: isToday ? "#fff" : "#e2e8f0", cursor:"pointer", fontWeight: isToday ? 700 : 400, fontSize:13 }}>
          Hoje
        </button>
        <button onClick={nextDay}
          style={{ padding:"8px 14px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", cursor:"pointer", fontSize:13 }}>
          Próximo ›
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding:"7px 12px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none" }} />
      </div>

      {/* Cards */}
      <div style={{ display:"flex", gap:16, marginBottom:24, flexWrap:"wrap" }}>
        {/* Turmas — clicável quando há conflitos */}
        <div
          onClick={() => conflictClassCount > 0 && setConflictModal(true)}
          style={{ cursor: conflictClassCount > 0 ? "pointer" : "default", background:"#073d4a", borderRadius:16, padding:"16px 20px", border:"1px solid " + (conflictClassCount > 0 ? "#ef444440" : "#154753"), minWidth:170, flex:"0 0 auto", transition:"border-color 0.2s" }}
          onMouseEnter={e => { if (conflictClassCount > 0) e.currentTarget.style.borderColor = "#ef4444"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = conflictClassCount > 0 ? "#ef444440" : "#154753"; }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ color:"#94a3b8", fontSize:13, fontWeight:600 }}>Turmas</span>
            <Icon name="calendar" size={15} color="#ffa619" />
          </div>
          <p style={{ color:"#e2e8f0", fontWeight:800, fontSize:26, margin:"0 0 2px" }}>{turmasCount}</p>
          <p style={{ color:"#64748b", fontSize:11, margin:"0 0 6px" }}>no dia</p>
          {conflictClassCount > 0 ? (
            <>
              <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 8px", borderRadius:20, background:"#ef444415", color:"#ef4444", fontSize:10, fontWeight:700, border:"1px solid #ef444440" }}>
                ⚠ {conflictClassCount} com conflito
              </span>
              <p style={{ color:"#64748b", fontSize:10, margin:"6px 0 0" }}>Clique para ver detalhes →</p>
            </>
          ) : (
            <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 8px", borderRadius:20, background:"#16a34a15", color:"#16a34a", fontSize:10, fontWeight:700, border:"1px solid #16a34a30" }}>
              ✓ sem conflitos
            </span>
          )}
        </div>
        <StatCard label="Instrutores" value={instrCount}               icon="star"     color="#06b6d4" sub="escalados" />
        <StatCard label="Alunos"      value={totalStudents || "—"}     icon="training" color="#8b5cf6" sub="previstos" />

        {/* Pendentes — clicável */}
        <div
          onClick={() => pendingInstrIds.length > 0 && setPendingModal(true)}
          style={{ cursor: pendingInstrIds.length > 0 ? "pointer" : "default", background:"#073d4a", borderRadius:16, padding:"16px 20px", border:"1px solid " + (pendingInstrIds.length > 0 ? "#ef444440" : "#154753"), minWidth:170, flex:"0 0 auto" }}
          onMouseEnter={e => { if (pendingInstrIds.length > 0) e.currentTarget.style.borderColor="#ef4444"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = pendingInstrIds.length > 0 ? "#ef444440" : "#154753"; }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ color:"#94a3b8", fontSize:13, fontWeight:600 }}>Pendentes</span>
            <Icon name="warning" size={15} color={pendingInstrIds.length > 0 ? "#ef4444" : "#64748b"} />
          </div>
          <p style={{ color: pendingInstrIds.length > 0 ? "#ef4444" : "#e2e8f0", fontWeight:800, fontSize:26, margin:"0 0 2px" }}>{pendingInstrIds.length}</p>
          <p style={{ color:"#64748b", fontSize:11, margin:"0 0 6px" }}>sem confirmação</p>
          <p style={{ color:"#475569", fontSize:11, margin:0 }}>{confirmedCount} de {instrCount} confirmaram</p>
          {pendingInstrIds.length > 0 && <p style={{ color:"#64748b", fontSize:10, margin:"6px 0 0" }}>Clique para ver detalhes →</p>}
        </div>

        {/* Linha do Tempo — clicável (CLT sem justificativa + freelancer sem decisão) */}
        <div onClick={() => setActive && setActive("cobertura")}
          style={{ cursor:"pointer", background:"#073d4a", borderRadius:16, padding:"16px 20px", border:"1px solid " + (coverageIssues > 0 ? (coverageStats.cltEmpty > 0 ? "#ef444440" : "#d9780640") : "#154753"), minWidth:200, flex:"0 0 auto", transition:"border-color 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = coverageStats.cltEmpty > 0 ? "#ef4444" : coverageIssues > 0 ? "#d97806" : "#94a3b8"}
          onMouseLeave={e => e.currentTarget.style.borderColor = coverageIssues > 0 ? (coverageStats.cltEmpty > 0 ? "#ef444440" : "#d9780640") : "#154753"}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ color:"#94a3b8", fontSize:13, fontWeight:600 }}>Linha do Tempo</span>
            <Icon name="warning" size={15} color={coverageStats.cltEmpty > 0 ? "#ef4444" : coverageIssues > 0 ? "#d97806" : "#64748b"} />
          </div>
          <p style={{ color: coverageStats.cltEmpty > 0 ? "#ef4444" : coverageIssues > 0 ? "#d97806" : "#e2e8f0", fontWeight:800, fontSize:26, margin:"0 0 2px" }}>{coverageIssues}</p>
          <p style={{ color:"#64748b", fontSize:11, margin:"0 0 8px" }}>sem justificativa</p>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <span style={{ padding:"2px 8px", borderRadius:20, background: coverageStats.cltEmpty > 0 ? "#ef444415" : "#16a34a15", color: coverageStats.cltEmpty > 0 ? "#ef4444" : "#16a34a", fontSize:10, fontWeight:700, border:"1px solid " + (coverageStats.cltEmpty > 0 ? "#ef444440" : "#16a34a30") }}>
              CLT: {coverageStats.cltEmpty}
            </span>
            <span style={{ padding:"2px 8px", borderRadius:20, background: coverageStats.freeUndecided > 0 ? "#d9780615" : "#16a34a15", color: coverageStats.freeUndecided > 0 ? "#d97806" : "#16a34a", fontSize:10, fontWeight:700, border:"1px solid " + (coverageStats.freeUndecided > 0 ? "#d9780640" : "#16a34a30") }}>
              Freelancer: {coverageStats.freeUndecided}
            </span>
          </div>
          <p style={{ color:"#475569", fontSize:10, margin:"8px 0 0" }}>Clique para ver detalhes →</p>
        </div>

        {/* Salas Teóricas */}
        <div onClick={() => setActive("locals-report")}
          style={{ cursor:"pointer", background:"#073d4a", borderRadius:16, padding:"16px 20px", border:"1px solid #154753", minWidth:180, flex:"0 0 auto", transition:"border-color 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor="#ffa619"}
          onMouseLeave={e => e.currentTarget.style.borderColor="#154753"}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ color:"#94a3b8", fontSize:13, fontWeight:600 }}>Salas Teóricas</span>
            <Icon name="location" size={15} color="#ffa619" />
          </div>
          <p style={{ color:"#e2e8f0", fontWeight:800, fontSize:26, margin:"0 0 2px" }}>{teoricos.length}</p>
          <p style={{ color:"#64748b", fontSize:11, margin:"0 0 10px" }}>locais cadastrados</p>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <span style={{ padding:"2px 8px", borderRadius:20, background: fM===teoricos.length ? "#16a34a15" : "#ef444415", color: fM===teoricos.length ? "#16a34a" : "#fbbf24", fontSize:10, fontWeight:700, border:"1px solid " + (fM===teoricos.length ? "#16a34a30" : "#fbbf2440") }}>
              Manhã: {fM} livres
            </span>
            <span style={{ padding:"2px 8px", borderRadius:20, background: fA===teoricos.length ? "#16a34a15" : "#ef444415", color: fA===teoricos.length ? "#16a34a" : "#fbbf24", fontSize:10, fontWeight:700, border:"1px solid " + (fA===teoricos.length ? "#16a34a30" : "#fbbf2440") }}>
              Tarde: {fA} livres
            </span>
          </div>
          <p style={{ color:"#475569", fontSize:10, margin:"8px 0 0" }}>Clique para ver detalhes →</p>
        </div>

        {/* Contratos vencendo — só para planejador/admin/dev */}
        {canPlan && canPlan(user) && (() => {
          const today = new Date(); today.setHours(0,0,0,0);
          const expiring = (instructors||[]).filter(i => {
            if (i.status === "Inativo") return false;
            if (i.contract !== "Freelancer" && i.contract !== "PJ") return false;
            if (!i.contractEndDate) return false;
            const end = new Date(i.contractEndDate + "T00:00:00");
            const days = Math.ceil((end - today) / 86400000);
            return days <= 10;
          }).map(i => {
            const end = new Date(i.contractEndDate + "T00:00:00");
            const days = Math.ceil((end - today) / 86400000);
            return { ...i, daysLeft: days };
          }).sort((a,b) => a.daysLeft - b.daysLeft);
          const expired  = expiring.filter(i => i.daysLeft < 0);
          const urgentNow = expiring.filter(i => i.daysLeft >= 0);
          const hasIssue = expiring.length > 0;
          const borderColor = expired.length > 0 ? "#ef444440" : hasIssue ? "#f59e0b40" : "#154753";
          const mainColor   = expired.length > 0 ? "#ef4444"   : hasIssue ? "#f59e0b"   : "#e2e8f0";
          if (!hasIssue) return null;
          return (
            <div onClick={() => setContractAlertModal(true)}
              style={{ cursor:"pointer", background:"#073d4a", borderRadius:16, padding:"16px 20px", border:`1px solid ${borderColor}`, minWidth:200, flex:"0 0 auto", transition:"border-color 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = expired.length > 0 ? "#ef4444" : "#f59e0b"}
              onMouseLeave={e => e.currentTarget.style.borderColor = borderColor}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span style={{ color:"#94a3b8", fontSize:13, fontWeight:600 }}>Contratos</span>
                <Icon name="warning" size={15} color={mainColor} />
              </div>
              <p style={{ color: mainColor, fontWeight:800, fontSize:26, margin:"0 0 2px" }}>{expiring.length}</p>
              <p style={{ color:"#64748b", fontSize:11, margin:"0 0 8px" }}>vencendo em 10 dias</p>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {expired.length > 0 && <span style={{ padding:"2px 8px", borderRadius:20, background:"#ef444415", color:"#ef4444", fontSize:10, fontWeight:700, border:"1px solid #ef444440" }}>⚠ {expired.length} vencido{expired.length>1?"s":""}</span>}
                {urgentNow.length > 0 && <span style={{ padding:"2px 8px", borderRadius:20, background:"#f59e0b15", color:"#f59e0b", fontSize:10, fontWeight:700, border:"1px solid #f59e0b40" }}>⏳ {urgentNow.length} a vencer</span>}
              </div>
              <p style={{ color:"#475569", fontSize:10, margin:"8px 0 0" }}>Clique para ver detalhes →</p>
            </div>
          );
        })()}
      </div>

      {/* Modal — instrutores pendentes */}
      {pendingModal && (
        <div onClick={() => setPendingModal(false)}
          style={{ position:"fixed", inset:0, background:"#00000085", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:"#022932", border:"1px solid #154753", borderRadius:16, padding:24, width:"100%", maxWidth:480, maxHeight:"80vh", overflowY:"auto", margin:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h3 style={{ color:"#ef4444", fontWeight:700, margin:0, fontSize:16 }}>
                Instrutores sem confirmação — {fmtDay(date).split(",")[0]}
              </h3>
              <button onClick={() => setPendingModal(false)}
                style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:22, lineHeight:1, padding:"0 4px" }}>✕</button>
            </div>
            {pendingInstrIds.length === 0
              ? <p style={{ color:"#64748b", textAlign:"center", marginTop:24 }}>Todos confirmaram!</p>
              : pendingInstrIds.map(instrId => {
                  const rows = daySchedules.filter(s => String(s.instructorId) === instrId && s.status !== "Confirmado" && !isDraftRow(s));
                  const name = rows[0]?.instructorName || `Instrutor ${instrId}`;
                  return (
                    <div key={instrId} style={{ background:"#073d4a", borderRadius:10, padding:"12px 14px", marginBottom:8, border:"1px solid #154753" }}>
                      <p style={{ color:"#e2e8f0", fontWeight:700, margin:"0 0 6px", fontSize:14 }}>👤 {name}</p>
                      {rows.map((s, i) => (
                        <div key={i} style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap", alignItems:"center" }}>
                          <span style={{ color:"#ffa619", fontSize:11, fontWeight:600 }}>{s.className}</span>
                          <span style={{ color:"#475569", fontSize:11 }}>·</span>
                          <span style={{ color:"#94a3b8", fontSize:11 }}>{s.module}</span>
                          <span style={{ color:"#475569", fontSize:11 }}>·</span>
                          <span style={{ color:"#64748b", fontSize:11 }}>{s.startTime}–{s.endTime}</span>
                        </div>
                      ))}
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}

      {/* Modal — turmas com conflito */}
      {conflictModal && (
        <div onClick={() => setConflictModal(false)}
          style={{ position:"fixed", inset:0, background:"#00000085", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:"#022932", border:"1px solid #154753", borderRadius:16, padding:24, width:"100%", maxWidth:560, maxHeight:"80vh", overflowY:"auto", margin:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h3 style={{ color:"#ef4444", fontWeight:700, margin:0, fontSize:16 }}>
                ⚠ Conflitos detectados — {fmtDay(date).split(",")[0]}
              </h3>
              <button onClick={() => setConflictModal(false)}
                style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:22, lineHeight:1, padding:"0 4px" }}>✕</button>
            </div>
            <p style={{ color:"#94a3b8", fontSize:12, margin:"0 0 14px" }}>
              {conflictClassCount} turma(s) com {conflictInfo.pairs.length} conflito(s). Inclui sobreposição de instrutor/local, vagas em aberto, ausências, atividades da Linha do Tempo e falta de competência.
            </p>
            {conflictInfo.pairs.length === 0
              ? <p style={{ color:"#64748b", textAlign:"center", marginTop:24 }}>Sem conflitos.</p>
              : conflictInfo.pairs.map((p, idx) => {
                  const kindMeta = p.kind === "instr"      ? { label: "INSTRUTOR",      color: "#ef4444" }
                                 : p.kind === "vacancy"    ? { label: "VAGA ABERTA",    color: "#ef4444" }
                                 : p.kind === "absence"    ? { label: "AUSÊNCIA",       color: "#ef4444" }
                                 : p.kind === "activity"   ? { label: "LINHA DO TEMPO", color: "#d97806" }
                                 : p.kind === "competency" ? { label: "COMPETÊNCIA",    color: "#a855f7" }
                                 :                           { label: "LOCAL",          color: "#d97806" };
                  return (
                  <div key={idx} style={{ background:"#073d4a", borderRadius:10, padding:"12px 14px", marginBottom:8, border:"1px solid " + kindMeta.color + "40" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ padding:"2px 7px", borderRadius:4, background: kindMeta.color + "20", color: kindMeta.color, fontSize:10, fontWeight:700, letterSpacing:0.3 }}>
                        {kindMeta.label}
                      </span>
                      <span style={{ color:"#e2e8f0", fontWeight:700, fontSize:13 }}>{p.subject}</span>
                      <span style={{ color:"#64748b", fontSize:11, marginLeft:"auto" }}>{p.startTime}–{p.endTime}</span>
                    </div>
                    {p.classes.map((c, ci) => (
                      <div key={ci} style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap", alignItems:"center", paddingLeft:8 }}>
                        <span style={{ color:"#475569", fontSize:11 }}>↳</span>
                        <span style={{ color:"#ffa619", fontSize:11, fontWeight:600 }}>{c.className || "—"}</span>
                        <span style={{ color:"#475569", fontSize:11 }}>·</span>
                        <span style={{ color:"#94a3b8", fontSize:11 }}>{c.module || "—"}</span>
                        {p.kind === "vacancy" && p.local && (
                          <>
                            <span style={{ color:"#475569", fontSize:11 }}>·</span>
                            <span style={{ color:"#94a3b8", fontSize:11 }}>📍 {p.local}</span>
                          </>
                        )}
                      </div>
                    ))}
                    {p.kind === "vacancy" && (
                      <p style={{ color: "#fca5a5", fontSize: 11, margin: "6px 0 0", paddingLeft: 8 }}>
                        Aloque um instrutor disponível em Planejar.
                      </p>
                    )}
                    {(p.kind === "absence" || p.kind === "activity") && (
                      <p style={{ color: "#fca5a5", fontSize: 11, margin: "6px 0 0", paddingLeft: 8 }}>
                        Instrutor indisponível neste horário — substitua em Planejar ou ajuste a ausência/atividade.
                      </p>
                    )}
                    {p.kind === "competency" && (
                      <p style={{ color: "#fca5a5", fontSize: 11, margin: "6px 0 0", paddingLeft: 8 }}>
                        Instrutor sem a competência exigida — troque o instrutor ou cadastre a competência.
                      </p>
                    )}
                  </div>
                  );
                })
            }
          </div>
        </div>
      )}

      {/* Modal — contratos vencendo */}
      {contractAlertModal && (
        <div onClick={() => setContractAlertModal(false)}
          style={{ position:"fixed", inset:0, background:"#00000085", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:"#022932", border:"1px solid #154753", borderRadius:16, padding:24, width:"100%", maxWidth:500, maxHeight:"80vh", overflowY:"auto", margin:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h3 style={{ color:"#f59e0b", fontWeight:700, margin:0, fontSize:16 }}>📋 Contratos Freelancer / PJ — Próximo vencimento</h3>
              <button onClick={() => setContractAlertModal(false)}
                style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:22, lineHeight:1, padding:"0 4px" }}>✕</button>
            </div>
            {(() => {
              const today = new Date(); today.setHours(0,0,0,0);
              const list = (instructors||[]).filter(i => {
                if (i.status === "Inativo") return false;
                if (i.contract !== "Freelancer" && i.contract !== "PJ") return false;
                if (!i.contractEndDate) return false;
                return Math.ceil((new Date(i.contractEndDate + "T00:00:00") - today) / 86400000) <= 10;
              }).map(i => ({ ...i, daysLeft: Math.ceil((new Date(i.contractEndDate + "T00:00:00") - today) / 86400000) }))
                .sort((a,b) => a.daysLeft - b.daysLeft);
              if (!list.length) return <p style={{ color:"#64748b", textAlign:"center" }}>Nenhum contrato crítico.</p>;
              return list.map(i => {
                const expired = i.daysLeft < 0;
                const color   = expired ? "#ef4444" : "#f59e0b";
                return (
                  <div key={i.id} style={{ background:"#073d4a", borderRadius:10, padding:"12px 14px", marginBottom:8, border:`1px solid ${color}40` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                      <div>
                        <p style={{ color:"#e2e8f0", fontWeight:700, margin:"0 0 4px", fontSize:14 }}>👤 {i.name}</p>
                        <p style={{ color:"#94a3b8", fontSize:12, margin:0 }}>{i.contract} · {i.base || "—"}</p>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <span style={{ display:"block", color, fontSize:12, fontWeight:700 }}>
                          {expired ? `⚠ Vencido há ${Math.abs(i.daysLeft)}d` : `⏳ Vence em ${i.daysLeft}d`}
                        </span>
                        <span style={{ color:"#64748b", fontSize:11 }}>{new Date(i.contractEndDate + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Widget — Freelancer a Receber (mês corrente) */}
      {canPlan && canPlan(user) && (() => {
        const now = new Date();
        const monthFrom  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        const monthTo    = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split("T")[0];
        const monthLabel = now.toLocaleDateString("pt-BR", { month:"long", year:"numeric" });

        const PRACT_R = new Set(["Practical Instructor","Lead Instructor","Scuba Diver","Crane Operator","Support Instructor","Assistant Instructor"]);
        const catOf = r => r==="Theoretical Instructor"?"t":r==="Translator"?"tr":PRACT_R.has(r)?"p":null;
        const pMin  = t => { if(!t) return 0; const [h,m]=t.split(":").map(Number); return (h||0)*60+(m||0); };
        const cDiar = m => m<=0?0:Math.ceil(m/240)*240/480;
        const fmtR  = v => Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
        const fmtDn = n => n===Math.floor(n)?String(n):n.toFixed(1).replace(".",",");
        const fmtD  = d => new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
        const fmtWd = d => { const w=new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long"}); return w.charAt(0).toUpperCase()+w.slice(1); };
        const esc   = s => String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

        const allFreelancers = (instructors||[]).filter(i => isFreelancer(i) && i.status !== "Inativo");
        const allData = allFreelancers.map(instr => {
          const aulas = (schedules||[]).filter(s => String(s.instructorId)===String(instr.id) && s.date>=monthFrom && s.date<=monthTo)
            .sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
          const byDay = {};
          aulas.forEach(s => { (byDay[s.date]=byDay[s.date]||[]).push(s); });
          let tD=0, pD=0, trD=0;
          Object.values(byDay).forEach(day => {
            let dT=0, dP=0, dTr=0;
            day.forEach(s => {
              const cat=catOf(s.role); const dur=pMin(s.endTime)-pMin(s.startTime);
              if(dur>0){if(cat==="t")dT+=dur;else if(cat==="p")dP+=dur;else if(cat==="tr")dTr+=dur;}
            });
            tD+=cDiar(dT); pD+=cDiar(dP); trD+=cDiar(dTr);
          });
          const tR=Number(instr.theoryRate||0), pR=Number(instr.practiceRate||0), trR=Number(instr.translationRate||0);
          const total = tD*tR + pD*pR + trD*trR;
          return { instr, aulas, dias:Object.keys(byDay).length, tD, pD, trD, tR, pR, trR, total };
        }).filter(d=>d.total>0).sort((a,b)=>b.total-a.total);

        const data = allData.filter(d => !freeHidden.has(String(d.instr.id)));
        const totalGeral = data.reduce((s,d)=>s+d.total, 0);
        const maxTotal   = Math.max(...data.map(d=>d.total), 1);

        const generatePDF = (d) => {
          const w = window.open("","_blank"); if(!w) return;
          const aulasPorDia = {};
          d.aulas.forEach(s => { (aulasPorDia[s.date]=aulasPorDia[s.date]||[]).push(s); });
          const dias = Object.keys(aulasPorDia).sort();
          const rows = dias.map((date,i) => {
            const arr = aulasPorDia[date];
            const bg = i%2===0?"#ffffff":"#f8fafc";
            return arr.map((s,j) => {
              const rl = (typeof ROLE_PT!=="undefined"?ROLE_PT[s.role]:null)||s.role||"—";
              const iF = j===0;
              return `<tr style="background:${bg}">
                ${iF?`<td class="cdt" rowspan="${arr.length}">${esc(fmtD(date))}</td>`:""}
                ${iF?`<td class="cwd" rowspan="${arr.length}">${esc(fmtWd(date))}</td>`:""}
                <td>${esc(s.trainingName||"—")}</td><td>${esc(s.className||"—")}</td>
                <td>${esc(s.module||"—")}</td>
                <td style="text-align:center;font-family:monospace">${esc(s.startTime||"")}–${esc(s.endTime||"")}</td>
                <td style="text-align:center">${esc(rl)}</td>
                <td>${esc(s.local||"—")}</td>
              </tr>`;
            }).join("");
          }).join("");
          const stRows = [
            d.tD>0?`<tr><td>Subtotal Teoria</td><td>${fmtDn(d.tD)} diária${d.tD!==1?"s":""}</td><td>× R$ ${fmtR(d.tR)}</td><td style="color:#0f766e;font-weight:700;text-align:right">R$ ${fmtR(d.tD*d.tR)}</td></tr>`:"",
            d.pD>0?`<tr><td>Subtotal Prática</td><td>${fmtDn(d.pD)} diária${d.pD!==1?"s":""}</td><td>× R$ ${fmtR(d.pR)}</td><td style="color:#0f766e;font-weight:700;text-align:right">R$ ${fmtR(d.pD*d.pR)}</td></tr>`:"",
            d.trD>0&&d.trR>0?`<tr><td>Subtotal Tradução</td><td>${fmtDn(d.trD)} diária${d.trD!==1?"s":""}</td><td>× R$ ${fmtR(d.trR)}</td><td style="color:#0f766e;font-weight:700;text-align:right">R$ ${fmtR(d.trD*d.trR)}</td></tr>`:"",
          ].filter(Boolean).join("");
          w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Extrato — ${esc(d.instr.name)}</title><style>
            @page{size:A4 portrait;margin:10mm}*{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
            .hdr{background:#01323d;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #ffa619}
            .brand{color:#ffa619;font-size:15px;font-weight:900}.co{color:rgba(255,255,255,.55);font-size:9px;margin-top:3px}
            .per{color:#fff;font-size:11px;font-weight:700;text-align:right}
            .sbar{background:#f1f5f9;padding:10px 20px;display:flex;gap:24px;border-bottom:2px solid #e2e8f0}
            .sv{font-size:15px;font-weight:800;color:#0f766e}.sl{font-size:9px;color:#64748b;margin-left:4px}
            .pbw{text-align:center;padding:12px}@media print{.pbw{display:none}}
            .pb{padding:8px 24px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700}
            table{width:100%;border-collapse:collapse}
            .wrap{padding:0 14px 14px}
            thead th{background:#01323d;color:#94a3b8;font-size:9px;font-weight:700;padding:8px 6px;border:1px solid #0d4a5a}
            tbody td{border:1px solid #e9ecef;padding:6px 8px;font-size:10px;color:#1e293b;vertical-align:middle}
            .cdt{font-weight:700;white-space:nowrap;text-align:center}.cwd{color:#64748b;font-size:9px;white-space:nowrap;text-align:center}
            tfoot td{background:#01323d!important;color:#ffa619!important;font-weight:800;font-size:11px;padding:10px 12px;border:1px solid #0d4a5a}
            .stw{padding:12px 14px 0}.stbl{width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #e2e8f0}
            .stbl td{padding:8px 12px;font-size:11px;border-bottom:1px solid #f1f5f9}
            .stbl tfoot td{background:#01323d!important;color:#ffa619!important;font-weight:800;padding:10px 12px;border:none!important;font-size:13px}
            .sig{margin:32px 14px 24px;display:flex;flex-direction:column;align-items:center;gap:6px}
            .sig-dt{font-size:11px;color:#64748b;align-self:flex-start;margin-bottom:8px}
            .sig-ln{width:300px;border-bottom:1.5px solid #374151;margin-top:48px}
            .sig-nm{font-size:12px;font-weight:700;color:#1e293b;letter-spacing:.5px;margin-top:6px}
            .sig-lb{font-size:10px;color:#64748b}
          </style></head><body>
          <div class="hdr"><div><div class="brand">💼 EXTRATO DE PROGRAMAÇÃO</div><div class="co">RELYON BRASIL TREINAMENTOS LTDA &nbsp;·&nbsp; ${esc(d.instr.name)} &nbsp;·&nbsp; ${esc(d.instr.contract||"Freelancer")}</div></div><div class="per">${esc(fmtD(monthFrom))} → ${esc(fmtD(monthTo))}</div></div>
          <div class="sbar"><span><span class="sv">${dias.length}</span><span class="sl">dia${dias.length!==1?"s":""} trabalhado${dias.length!==1?"s":""}</span></span><span><span class="sv">${d.aulas.length}</span><span class="sl">aula${d.aulas.length!==1?"s":""}</span></span></div>
          <div class="pbw"><button class="pb" onclick="window.print()">🖨 Imprimir / Salvar PDF</button></div>
          <div class="wrap"><table><thead><tr><th>DATA</th><th>DIA</th><th>TREINAMENTO</th><th>TURMA</th><th>MÓDULO</th><th>HORÁRIO</th><th>FUNÇÃO</th><th>LOCAL</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="8">TOTAL: ${dias.length} dia${dias.length!==1?"s":""} · ${d.aulas.length} aula${d.aulas.length!==1?"s":""}</td></tr></tfoot></table></div>
          ${stRows?`<div class="stw"><table class="stbl"><tbody>${stRows}</tbody><tfoot><tr><td colspan="3">TOTAL GERAL</td><td style="font-size:15px;text-align:right;white-space:nowrap">R$ ${fmtR(d.total)}</td></tr></tfoot></table></div>`:""}
          <div class="sig"><div class="sig-dt">Data: _____ / _____ / ____________</div><div class="sig-ln"></div><div class="sig-nm">${esc(d.instr.name||"")}</div><div class="sig-lb">Assinatura do Instrutor</div></div>
          </body></html>`);
          w.document.close();
        };

        return (
          <>
            {/* Widget principal */}
            {allData.length > 0 && (
              <div style={{ background:"#073d4a", borderRadius:16, padding:20, border:"1px solid #154753", marginBottom:24 }}>
                {/* Cabeçalho */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                  <div>
                    <p style={{ color:"#94a3b8", fontSize:11, fontWeight:700, margin:0, textTransform:"uppercase", letterSpacing:0.5 }}>💰 Freelancer a Receber</p>
                    <p style={{ color:"#64748b", fontSize:11, margin:"3px 0 0", textTransform:"capitalize" }}>{monthLabel}</p>
                  </div>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <button onClick={() => setFreeBlurred(v=>!v)} title={freeBlurred?"Mostrar valores":"Ocultar valores"}
                      style={{ background:"none", border:"1px solid #154753", borderRadius:20, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", color:"#64748b", fontSize:14, cursor:"pointer", flexShrink:0 }}>
                      {freeBlurred ? "🙈" : "👁️"}
                    </button>
                    <button onClick={() => setFreeShowFilter(v=>!v)}
                      style={{ background: freeShowFilter?"#ffa61920":"none", border:`1px solid ${freeShowFilter?"#ffa619":"#154753"}`, borderRadius:20, padding:"4px 12px", color:freeShowFilter?"#ffa619":"#64748b", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                      {freeHidden.size>0?`Filtrado (${allData.length-data.length} oculto${allData.length-data.length!==1?"s":""})` : "Filtrar ▾"}
                    </button>
                    <div style={{ textAlign:"right", filter:freeBlurred?"blur(6px)":"none", userSelect:freeBlurred?"none":"auto", transition:"filter 0.15s" }}>
                      <p style={{ color:"#22c55e", fontWeight:800, fontSize:18, margin:0 }}>R$ {fmtR(totalGeral)}</p>
                      <p style={{ color:"#64748b", fontSize:11, margin:"2px 0 0" }}>{data.length} de {allData.length} instrutores</p>
                    </div>
                  </div>
                </div>

                {/* Chips de filtro */}
                {freeShowFilter && (
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14, paddingBottom:14, borderBottom:"1px solid #154753" }}>
                    <button onClick={() => setFreeHidden(new Set())}
                      style={{ padding:"4px 12px", borderRadius:20, border:"1px solid #154753", background:freeHidden.size===0?"#22c55e20":"#073d4a", color:freeHidden.size===0?"#22c55e":"#64748b", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                      Todos
                    </button>
                    {allData.map(d => {
                      const hidden = freeHidden.has(String(d.instr.id));
                      return (
                        <button key={d.instr.id}
                          onClick={() => {
                            const next = new Set(freeHidden);
                            hidden ? next.delete(String(d.instr.id)) : next.add(String(d.instr.id));
                            setFreeHidden(next);
                          }}
                          style={{ padding:"4px 12px", borderRadius:20, border:`1px solid ${hidden?"#154753":"#ffa619"}`, background:hidden?"#073d4a":"#ffa61920", color:hidden?"#475569":"#ffa619", fontSize:11, fontWeight:600, cursor:"pointer", textDecoration:hidden?"line-through":"none" }}>
                          {d.instr.name.split(" ")[0]}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Barras clicáveis */}
                {data.length > 0 ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:8, filter:freeBlurred?"blur(6px)":"none", userSelect:freeBlurred?"none":"auto", pointerEvents:freeBlurred?"none":"auto", transition:"filter 0.15s" }}>
                    {data.map(d => (
                      <div key={d.instr.id} onClick={() => setFreeModalData(d)}
                        style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", borderRadius:8, padding:"4px 2px", transition:"background 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.background="#01323d"}
                        onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                        <div style={{ width:130, color:"#e2e8f0", fontSize:11, fontWeight:600, flexShrink:0, textAlign:"right", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }} title={d.instr.name}>
                          {d.instr.name}
                        </div>
                        <div style={{ flex:1, position:"relative", height:22, background:"#01323d", borderRadius:4, overflow:"hidden" }}>
                          <div style={{ width:`${(d.total/maxTotal)*100}%`, height:"100%", background:"linear-gradient(90deg,#ffa619,#f97316)", borderRadius:4, minWidth:4 }} />
                        </div>
                        <div style={{ width:110, color:"#ffa619", fontSize:12, fontWeight:700, flexShrink:0, textAlign:"right" }}>
                          R$ {fmtR(d.total)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color:"#475569", fontSize:12, textAlign:"center", padding:"8px 0" }}>Todos os instrutores estão ocultos pelo filtro.</p>
                )}

                {/* Rodapé */}
                <div style={{ marginTop:14, paddingTop:12, borderTop:"1px solid #154753", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <p style={{ color:"#475569", fontSize:10, margin:0 }}>Clique numa barra para ver o extrato</p>
                  <button onClick={() => setActive && setActive("reports")}
                    style={{ background:"none", border:"none", color:"#64748b", fontSize:11, cursor:"pointer", padding:0 }}>
                    Ver relatório completo →
                  </button>
                </div>
              </div>
            )}

            {/* Modal — extrato do instrutor */}
            {freeModalData && (() => {
              const d = freeModalData;
              const aulasPorDia = {};
              d.aulas.forEach(s => { (aulasPorDia[s.date]=aulasPorDia[s.date]||[]).push(s); });
              const diasModal = Object.keys(aulasPorDia).sort();
              const fmtDateFull = dt => new Date(dt+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"});
              return (
                <div onClick={() => setFreeModalData(null)}
                  style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
                  <div onClick={e=>e.stopPropagation()}
                    style={{ background:"#022932", border:"1px solid #154753", borderRadius:20, padding:28, width:"100%", maxWidth:800, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 24px 80px #000a" }}>

                    {/* Cabeçalho do modal */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, gap:12 }}>
                      <div>
                        <h3 style={{ color:"#e2e8f0", fontWeight:800, fontSize:20, margin:"0 0 4px" }}>{d.instr.name}</h3>
                        <p style={{ color:"#64748b", fontSize:13, margin:0, textTransform:"capitalize" }}>{d.instr.contract} · {monthLabel}</p>
                      </div>
                      <div style={{ display:"flex", gap:10, alignItems:"center", flexShrink:0 }}>
                        <button onClick={() => generatePDF(d)}
                          style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"8px 18px", color:"#000", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                          🖨 PDF
                        </button>
                        <button onClick={() => setFreeModalData(null)}
                          style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:24, lineHeight:1, padding:"0 4px" }}>✕</button>
                      </div>
                    </div>

                    {/* Subtotais */}
                    <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
                      {d.tD>0 && <div style={{ background:"#073d4a", borderRadius:10, padding:"10px 16px", border:"1px solid #154753" }}>
                        <p style={{ color:"#94a3b8", fontSize:10, margin:"0 0 4px", fontWeight:700 }}>TEORIA</p>
                        <p style={{ color:"#e2e8f0", fontSize:14, fontWeight:700, margin:"0 0 2px" }}>{fmtDn(d.tD)} diária{d.tD!==1?"s":""}</p>
                        <p style={{ color:"#64748b", fontSize:11, margin:0 }}>× R$ {fmtR(d.tR)} = <span style={{ color:"#22c55e", fontWeight:700 }}>R$ {fmtR(d.tD*d.tR)}</span></p>
                      </div>}
                      {d.pD>0 && <div style={{ background:"#073d4a", borderRadius:10, padding:"10px 16px", border:"1px solid #154753" }}>
                        <p style={{ color:"#94a3b8", fontSize:10, margin:"0 0 4px", fontWeight:700 }}>PRÁTICA</p>
                        <p style={{ color:"#e2e8f0", fontSize:14, fontWeight:700, margin:"0 0 2px" }}>{fmtDn(d.pD)} diária{d.pD!==1?"s":""}</p>
                        <p style={{ color:"#64748b", fontSize:11, margin:0 }}>× R$ {fmtR(d.pR)} = <span style={{ color:"#22c55e", fontWeight:700 }}>R$ {fmtR(d.pD*d.pR)}</span></p>
                      </div>}
                      {d.trD>0&&d.trR>0 && <div style={{ background:"#073d4a", borderRadius:10, padding:"10px 16px", border:"1px solid #154753" }}>
                        <p style={{ color:"#94a3b8", fontSize:10, margin:"0 0 4px", fontWeight:700 }}>TRADUÇÃO</p>
                        <p style={{ color:"#e2e8f0", fontSize:14, fontWeight:700, margin:"0 0 2px" }}>{fmtDn(d.trD)} diária{d.trD!==1?"s":""}</p>
                        <p style={{ color:"#64748b", fontSize:11, margin:0 }}>× R$ {fmtR(d.trR)} = <span style={{ color:"#22c55e", fontWeight:700 }}>R$ {fmtR(d.trD*d.trR)}</span></p>
                      </div>}
                      <div style={{ background:"#01323d", borderRadius:10, padding:"10px 16px", border:"1px solid #22c55e40", marginLeft:"auto" }}>
                        <p style={{ color:"#94a3b8", fontSize:10, margin:"0 0 4px", fontWeight:700 }}>TOTAL A RECEBER</p>
                        <p style={{ color:"#22c55e", fontSize:22, fontWeight:800, margin:0 }}>R$ {fmtR(d.total)}</p>
                        <p style={{ color:"#64748b", fontSize:11, margin:"2px 0 0" }}>{d.dias} dia{d.dias!==1?"s":""} · {d.aulas.length} aula{d.aulas.length!==1?"s":""}</p>
                      </div>
                    </div>

                    {/* Tabela de programação */}
                    <div style={{ overflowX:"auto", borderRadius:10, border:"1px solid #154753" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", minWidth:600 }}>
                        <thead>
                          <tr style={{ background:"#01323d" }}>
                            {["DATA","TREINAMENTO","TURMA","MÓDULO","HORÁRIO","FUNÇÃO","LOCAL"].map(h=>(
                              <th key={h} style={{ padding:"8px 10px", color:"#94a3b8", fontSize:10, fontWeight:700, textAlign:"left", border:"1px solid #154753", whiteSpace:"nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {diasModal.map((dt,ri) => {
                            const arr = aulasPorDia[dt];
                            return arr.map((s,j) => (
                              <tr key={`${dt}-${j}`} style={{ background:ri%2===0?"#073d4a":"#063540" }}>
                                {j===0 && <td rowSpan={arr.length} style={{ padding:"8px 10px", border:"1px solid #154753", color:"#ffa619", fontWeight:700, fontSize:11, whiteSpace:"nowrap", verticalAlign:"middle" }}>{fmtDateFull(dt)}</td>}
                                <td style={{ padding:"8px 10px", border:"1px solid #154753", color:"#e2e8f0", fontSize:11 }}>{s.trainingName||"—"}</td>
                                <td style={{ padding:"8px 10px", border:"1px solid #154753", color:"#94a3b8", fontSize:10 }}>{s.className||"—"}</td>
                                <td style={{ padding:"8px 10px", border:"1px solid #154753", color:"#94a3b8", fontSize:10 }}>{s.module||"—"}</td>
                                <td style={{ padding:"8px 10px", border:"1px solid #154753", color:"#64748b", fontSize:10, fontFamily:"monospace", whiteSpace:"nowrap" }}>{s.startTime}–{s.endTime}</td>
                                <td style={{ padding:"8px 10px", border:"1px solid #154753" }}>
                                  <span style={{ background:"#06b6d420", color:"#06b6d4", padding:"2px 8px", borderRadius:10, fontSize:9, fontWeight:700, whiteSpace:"nowrap" }}>{(typeof ROLE_PT!=="undefined"?ROLE_PT[s.role]:null)||s.role||"—"}</span>
                                </td>
                                <td style={{ padding:"8px 10px", border:"1px solid #154753", color:"#64748b", fontSize:10 }}>{s.local||"—"}</td>
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    </div>

                  </div>
                </div>
              );
            })()}
          </>
        );
      })()}

      {/* Card "Problemas Reportados" — clica para abrir página dedicada */}
      {activeIssuesCount > 0 && (
        <div onClick={() => setActive && setActive("issues")}
          style={{ cursor:"pointer", background:"#073d4a", borderRadius:16, padding:"16px 20px", border:"1px solid #d9780640", display:"flex", alignItems:"center", gap:16, transition:"border-color 0.2s", marginBottom:24 }}
          onMouseEnter={e => e.currentTarget.style.borderColor="#d97806"}
          onMouseLeave={e => e.currentTarget.style.borderColor="#d9780640"}>
          <div style={{ width:48, height:48, borderRadius:12, background:"#d9780620", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Icon name="warning" size={24} color="#d97806" />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ color:"#d97806", fontWeight:800, fontSize:22, margin:"0 0 2px" }}>{activeIssuesCount}</p>
            <p style={{ color:"#e2e8f0", fontWeight:600, fontSize:14, margin:0 }}>Problema(s) Reportado(s)</p>
            <p style={{ color:"#64748b", fontSize:11, margin:"2px 0 0" }}>Abertos e em andamento · Clique para abrir conversa</p>
          </div>
          <span style={{ color:"#d97806", fontSize:18 }}>›</span>
        </div>
      )}
    </div>
  );
};

// ── ISSUES PAGE — Hub de tickets de Problema Reportado (chat bidirecional) ─
// Lista tickets divididos por status: Abertos, Em andamento, Resolvidos.
// Cada item expande para mostrar IssueChat (histórico + responder + ações).
const IssuesPage = ({ schedules, setSchedules, user, instructors, trainings, setActive }) => {
  const [expandedId, setExpandedId] = React.useState(null);

  const issues = (schedules || []).filter(s => s.issue);
  const openIssues       = issues.filter(isIssueOpen);
  const inProgressIssues = issues.filter(isIssueInProgress);
  const resolvedIssues   = issues.filter(isIssueResolved);

  // Ordena por data de abertura desc (mais recentes primeiro)
  const sortByOpenedDesc = (a, b) => {
    const at = getIssueOpenedAt(a) || "";
    const bt = getIssueOpenedAt(b) || "";
    return at > bt ? -1 : at < bt ? 1 : 0;
  };
  openIssues.sort(sortByOpenedDesc);
  inProgressIssues.sort(sortByOpenedDesc);
  resolvedIssues.sort(sortByOpenedDesc);

  // Auto-expande o primeiro aberto se nada estiver expandido ainda
  React.useEffect(() => {
    if (expandedId == null) {
      const first = openIssues[0] || inProgressIssues[0];
      if (first) setExpandedId(first.id);
    }
  }, []);

  // Status é derivado de issueLog (ver getIssueStatus em constants.js).
  // Não gravamos campo issueStatus: a coluna não existe na tabela e o UPDATE seria rejeitado pelo PostgREST.
  const ackIssue = (id) => setSchedules && setSchedules(prev => prev.map(s =>
    s.id === id ? {
      ...s,
      issueLog: [...(s.issueLog || []), { type: "ack", from: "planner", by: (user && user.name) || "Planejador", at: new Date().toISOString() }],
    } : s
  ));

  const resolveIssue = (id) => setSchedules && setSchedules(prev => prev.map(s =>
    s.id === id ? {
      ...s,
      issueLog: [...(s.issueLog || []), { type: "resolved", from: "planner", by: (user && user.name) || "Planejador", at: new Date().toISOString() }],
    } : s
  ));

  const replyIssue = (id, text) => {
    let target = null;
    setSchedules && setSchedules(prev => prev.map(s => {
      if (s.id !== id) return s;
      target = s;
      // Se ainda estiver "aberto" e o planejador mandar primeira mensagem,
      // promove a "em andamento" (responder vale como ciente implícito).
      const wasOpen = getIssueStatus(s) === ISSUE_STATUS.ABERTO;
      const log = [...(s.issueLog || [])];
      if (wasOpen) {
        log.push({ type: "ack", from: "planner", by: (user && user.name) || "Planejador", at: new Date().toISOString() });
      }
      log.push({ type: "message", from: "planner", text, by: (user && user.name) || "Planejador", at: new Date().toISOString() });
      return {
        ...s,
        issueLog: log,
      };
    }));
    // Notifica o instrutor que abriu o ticket
    if (target && target.instructorId && typeof window.__createNotification === "function") {
      window.__createNotification({
        instructorId: target.instructorId,
        type: "issue_reply",
        title: "Nova mensagem do planejador",
        body: `${target.className} · ${target.module || target.trainingName || "Treinamento"} — ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}`,
        linkClassId: target.classId,
        linkScheduleId: target.id,
      });
    }
  };

  const fmtDate = ds => ds ? new Date(ds + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }) : "";

  const renderGroup = (title, color, list, options = {}) => (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ color, fontWeight: 700, margin: "0 0 12px", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
        {title} <span style={{ color: "#64748b", fontWeight: 500, fontSize: 13 }}>({list.length})</span>
      </h3>
      {list.length === 0 ? (
        <p style={{ color: "#475569", fontSize: 13, padding: "8px 0 0 18px" }}>
          {options.emptyText || "Nada por aqui."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map(s => {
            const isExpanded = expandedId === s.id;
            const openedAt = getIssueOpenedAt(s);
            const opener   = getIssueOpener(s);
            return (
              <div key={s.id} style={{ background: "#073d4a", borderRadius: 12, border: `1px solid ${color}30`, overflow: "hidden" }}>
                <div onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "#e2e8f0", fontWeight: 700, margin: "0 0 3px", fontSize: 14 }}>
                      <span style={{ color: "#ffa619" }}>{s.className}</span>
                      <span style={{ color: "#475569" }}> · </span>
                      <span style={{ color: "#94a3b8" }}>{s.module || s.trainingName}</span>
                    </p>
                    <p style={{ color: "#64748b", fontSize: 11, margin: 0 }}>
                      {fmtDate(s.date)} · {s.startTime}–{s.endTime} · {s.local || "—"}
                      {opener ? ` · Aberto por ${opener}` : ""}
                      {openedAt ? ` · ${fmtTicketDt(openedAt)}` : ""}
                    </p>
                  </div>
                  <span style={{ color, fontSize: 16, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
                </div>
                {isExpanded && (
                  <div style={{ background: "#01323d", padding: 14, borderTop: `1px solid ${color}30` }}>
                    <IssueChat
                      s={s}
                      currentRole="planner"
                      onSend={replyIssue}
                      onAck={ackIssue}
                      onResolve={resolveIssue}
                      readOnly={false}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button onClick={() => setActive && setActive("dashboard")}
          style={{ background: "transparent", border: "1px solid #154753", borderRadius: 8, padding: "6px 12px", color: "#94a3b8", cursor: "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="back" size={14} color="#94a3b8" /> Voltar
        </button>
        <div>
          <h2 style={{ color: "#fff", fontWeight: 800, margin: 0, fontSize: 22 }}>Problemas Reportados</h2>
          <p style={{ color: "#64748b", fontSize: 13, margin: "2px 0 0" }}>
            Histórico arquivado junto com a turma · {issues.length} ticket(s) no total
          </p>
        </div>
      </div>

      {issues.length === 0 ? (
        <div style={{ background: "#073d4a", borderRadius: 12, padding: 32, border: "1px solid #154753", textAlign: "center" }}>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>Nenhum problema reportado.</p>
        </div>
      ) : (
        <>
          {renderGroup("Abertos",       "#d97806", openIssues,       { emptyText: "Nenhum ticket aguardando ciência." })}
          {renderGroup("Em andamento",  "#3b82f6", inProgressIssues, { emptyText: "Nenhum ticket em andamento." })}
          {renderGroup("Resolvidos",    "#16a34a", resolvedIssues,   { emptyText: "Nenhum ticket resolvido ainda." })}
        </>
      )}
    </div>
  );
};

// ── GROUP CALENDAR VIEW (modo de visualização paralela de múltiplas turmas) ──
// Mostra todas as turmas de um dia em colunas lado a lado, com detecção visual
// de conflitos (mesmo instrutor ou local em duas turmas não-vinculadas).
const GroupCalendarView = ({ schedules, areas, trainings, instructors, holidays, dateOffset, setDateOffset, onClickClass, canEdit }) => {
  const fmtDs = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const baseDate = (() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + dateOffset);
    return d;
  })();
  const dateStr = fmtDs(baseDate);
  const todayStr = fmtDs(new Date());
  const isToday = dateStr === todayStr;

  // Schedules do dia, agrupados por turma (por classId — turmas com mesmo nome em
  // semanas diferentes são distintas)
  const dayRows = schedules.filter(s => s.date === dateStr);
  const classIds = [...new Set(dayRows.map(s => s.classId).filter(Boolean))];
  const columns = classIds.map(cid => {
    const rows = dayRows.filter(s => s.classId === cid)
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    const allRows = schedules.filter(s => s.classId === cid);
    const cls = rows[0]?.className || "";
    const t = trainings.find(x => String(x.id) === String(allRows[0]?.trainingId));
    const area = areas.find(a => a.id === t?.area);
    const links = allRows.find(r => Array.isArray(r.linkedClassNames))?.linkedClassNames || [];
    // shortName do training tem prioridade; fallback é primeiros 8 caracteres do className
    const shortLabel = t?.shortName || cls.replace(/\s+/g, "").slice(0, 10);
    return { cid, cls, rows, t, area, shortLabel, links };
  }).sort((a, b) => (a.cls||"").localeCompare(b.cls||""));

  // Detecta conflitos: para cada (instrutor ou local), encontrar pares de rows em colunas
  // diferentes (não vinculadas) que se sobrepõem no horário
  const conflictKeys = new Set();
  const tToM = (s) => { const [h, m] = (s||"00:00").split(":").map(Number); return h*60+m; };
  for (let i = 0; i < dayRows.length; i++) {
    for (let j = i + 1; j < dayRows.length; j++) {
      const a = dayRows[i], b = dayRows[j];
      if (a.classId && b.classId && a.classId === b.classId) continue;
      const aLinks = columns.find(c => c.cid === a.classId)?.links || [];
      if (aLinks.includes(b.className)) continue;
      const aS = tToM(a.startTime), aE = tToM(a.endTime);
      const bS = tToM(b.startTime), bE = tToM(b.endTime);
      if (!(aS < bE && bS < aE)) continue;
      if (a.instructorId && b.instructorId && +a.instructorId === +b.instructorId) {
        conflictKeys.add(`${a.id}|instr`); conflictKeys.add(`${b.id}|instr`);
      }
      if (a.local && b.local && a.local === b.local) {
        conflictKeys.add(`${a.id}|local`); conflictKeys.add(`${b.id}|local`);
      }
    }
  }

  const dateLabel = baseDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const colWidth = Math.max(180, Math.min(280, Math.floor(1100 / Math.max(1, columns.length))));

  // Feriados ativos no dia (ordem: nacional → estaduais → municipais)
  const dayHolidays = (holidays || [])
    .filter(h => h.date === dateStr)
    .sort((a, b) => {
      const order = { national: 0, state: 1, municipal: 2 };
      return (order[a.scope] ?? 9) - (order[b.scope] ?? 9);
    });
  const hasNationalHoliday = dayHolidays.some(h => h.scope === "national");

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        <button onClick={() => setDateOffset(d => d - 1)}
          style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#94a3b8", padding:"6px 14px", cursor:"pointer", fontSize:13 }}>
          ← Dia anterior
        </button>
        <button onClick={() => setDateOffset(0)}
          style={{ background: isToday ? "#ffa61920" : "#073d4a", border:`1px solid ${isToday ? "#ffa619" : "#154753"}`, borderRadius:8, color: isToday ? "#ffa619" : "#94a3b8", padding:"6px 14px", cursor:"pointer", fontSize:13, fontWeight: isToday ? 700 : 400 }}>
          Hoje
        </button>
        <button onClick={() => setDateOffset(d => d + 1)}
          style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#94a3b8", padding:"6px 14px", cursor:"pointer", fontSize:13 }}>
          Próximo dia →
        </button>
        <span style={{ color:"#fff", fontSize:14, marginLeft:8, textTransform:"capitalize", fontWeight:600 }}>{dateLabel}</span>
        <span style={{ color:"#64748b", fontSize:13, marginLeft:"auto" }}>{columns.length} turma(s) · {dayRows.length} aula(s)</span>
      </div>
      {dayHolidays.length > 0 && (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
          {dayHolidays.map(h => {
            const sInfo = HOLIDAY_SCOPES[h.scope] || { color: "#06b6d4", label: h.scope };
            const suffix = h.scope === "national" ? "" : h.scope === "state" ? ` · ${h.state}` : ` · ${h.city}/${h.state}`;
            return (
              <span key={h.id} style={{ padding:"5px 12px", borderRadius:20, background: sInfo.color + "15", border:`1px solid ${sInfo.color}40`, color: sInfo.color, fontSize:12, fontWeight:600, display:"inline-flex", alignItems:"center", gap:6 }}>
                🏖 {h.name}{suffix}
              </span>
            );
          })}
        </div>
      )}
      {columns.length === 0 ? (
        <div style={{ padding:60, textAlign:"center", color:"#475569", background:"#073d4a", borderRadius:12, border:"1px solid #154753" }}>
          Nenhuma turma neste dia.
        </div>
      ) : (
        <div style={{ overflowX:"auto", paddingBottom:8 }}>
          <div style={{ display:"flex", gap:8, minWidth:"min-content" }}>
            {columns.map(({ cid, cls, rows, t, area, shortLabel, links }) => (
              <div key={cid} style={{ width: colWidth, flexShrink:0, background:"#022932", border:`1px solid ${area ? area.color+"50" : "#154753"}`, borderRadius:10, overflow:"hidden", display:"flex", flexDirection:"column" }}>
                <div onClick={() => canEdit && onClickClass(cid)}
                  title={cls}
                  style={{ padding:"10px 12px", borderBottom: area ? `2px solid ${area.color}` : "2px solid #154753", background: area ? area.color+"15" : "#073d4a", cursor: canEdit ? "pointer" : "default" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ color:"#fff", fontSize:14, fontWeight:800, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{shortLabel}</span>
                    {links.length > 0 && <span title={`Vinculada a: ${links.join(", ")}`} style={{ color:"#06b6d4", fontSize:11 }}>🔗{links.length}</span>}
                  </div>
                  <div style={{ color:"#94a3b8", fontSize:10, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cls}</div>
                  {t && <div style={{ color:"#ffa619", fontSize:10, fontWeight:600 }}>{t.gcc}</div>}
                </div>
                <div style={{ flex:1, padding:6, display:"flex", flexDirection:"column", gap:5 }}>
                  {rows.map(r => {
                    const instrCfl = conflictKeys.has(`${r.id}|instr`);
                    const localCfl = conflictKeys.has(`${r.id}|local`);
                    const vacancy  = !r.instructorId && r.role !== "Translator";
                    const cfl = instrCfl || localCfl || vacancy;
                    return (
                      <div key={r.id}
                        style={{ background: vacancy ? "#ef444425" : cfl ? "#ef444415" : "#073d4a", border:`1px solid ${cfl ? "#ef4444" : "#15475360"}`, borderRadius:6, padding:"5px 7px" }}>
                        <div style={{ color:"#94a3b8", fontSize:10, fontWeight:700 }}>{r.startTime}–{r.endTime}</div>
                        <div style={{ color:"#e2e8f0", fontSize:11, fontWeight:600, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={r.module}>{r.module}</div>
                        {vacancy ? (
                          <div style={{ color: "#ef4444", fontSize:10, marginTop:2, fontWeight: 700, letterSpacing: 0.3 }}>
                            ⚠ VAGA ABERTA
                          </div>
                        ) : r.instructorName && (
                          <div style={{ color: instrCfl ? "#ef4444" : "#ffa619", fontSize:10, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={r.instructorName}>
                            {instrCfl ? "⚠ " : "👤 "}{r.instructorName}
                          </div>
                        )}
                        {r.local && (
                          <div style={{ color: localCfl ? "#ef4444" : "#64748b", fontSize:10, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={r.local}>
                            {localCfl ? "⚠ " : "📍 "}{r.local}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── WEEKLY CALENDAR VIEW (defined outside Schedule to avoid remount) ─────────
const WeeklyCalendarView = ({ schedules, areas, trainings, holidays, weekOffset, setWeekOffset, onClickClass, canEdit }) => {
  const getWeekStart = (offset) => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff + offset * 7);
    monday.setHours(12, 0, 0, 0);
    return monday;
  };
  const fmtDs = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const weekStart = getWeekStart(weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return { dateStr: fmtDs(d), dateObj: d };
  });
  const DAY_NAMES = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
  const todayStr = fmtDs(new Date());

  const areaRank = (name) => {
    if (!name) return 99;
    const n = name.toUpperCase();
    if (/MARINHA/.test(n)) return 0;
    if (/CBINC|INCÊNDIO|INCENDIO/.test(n)) return 1;
    if (/INDUSTRIAL/.test(n)) return 2;
    if (/OPITO/.test(n)) return 3;
    if (/COORDENA/.test(n)) return 4;
    return 5;
  };

  const classesByDay = days.map(({ dateStr }) => {
    const dayRows = schedules.filter(s => s.date === dateStr);
    // Agrupa por classId — turmas com mesmo nome em semanas diferentes são distintas
    const classIds = [...new Set(dayRows.map(s => s.classId).filter(Boolean))];
    return classIds.map(cid => {
      const clsOnDay = dayRows.filter(s => s.classId === cid);
      const allRows  = schedules.filter(s => s.classId === cid);
      const cls = clsOnDay[0]?.className || "";
      const t    = trainings.find(t => String(t.id) === String(allRows[0]?.trainingId));
      const area = areas.find(a => a.id === t?.area);
      const sorted = [...clsOnDay].sort((a, b) => a.startTime.localeCompare(b.startTime));
      const startTime = sorted[0]?.startTime || "—";
      const endTime   = [...clsOnDay].sort((a, b) => b.endTime.localeCompare(a.endTime))[0]?.endTime || "—";
      const modules   = [...new Set(clsOnDay.map(r => r.module))];
      const pending   = clsOnDay.filter(r => r.status === "Pendente").length;
      const links     = clsOnDay.find(r => Array.isArray(r.linkedClassNames))?.linkedClassNames || [];
      return { cid, cls, area, t, startTime, endTime, modules, pending, links };
    }).sort((a, b) => {
      const ra = areaRank(a.area?.name), rb = areaRank(b.area?.name);
      if (ra !== rb) return ra - rb;
      return (a.cls||"").localeCompare(b.cls||"");
    });
  });

  const weekLabel = (() => {
    const s = days[0].dateObj.toLocaleDateString("pt-BR", { day:"2-digit", month:"short" });
    const e = days[6].dateObj.toLocaleDateString("pt-BR", { day:"2-digit", month:"short", year:"numeric" });
    return `${s} – ${e}`;
  })();

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        <button onClick={() => setWeekOffset(w => w - 1)}
          style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#94a3b8", padding:"6px 14px", cursor:"pointer", fontSize:13 }}>
          ← Anterior
        </button>
        <button onClick={() => setWeekOffset(0)}
          style={{ background: weekOffset === 0 ? "#ffa61920" : "#073d4a", border:`1px solid ${weekOffset === 0 ? "#ffa619" : "#154753"}`, borderRadius:8, color: weekOffset === 0 ? "#ffa619" : "#94a3b8", padding:"6px 14px", cursor:"pointer", fontSize:13, fontWeight: weekOffset === 0 ? 700 : 400 }}>
          Hoje
        </button>
        <button onClick={() => setWeekOffset(w => w + 1)}
          style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#94a3b8", padding:"6px 14px", cursor:"pointer", fontSize:13 }}>
          Próxima →
        </button>
        <span style={{ color:"#94a3b8", fontSize:14, marginLeft:4 }}>{weekLabel}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:6 }}>
        {days.map(({ dateStr, dateObj }, i) => {
          const isToday = dateStr === todayStr;
          const classes = classesByDay[i];
          const dayHolidays = (holidays || [])
            .filter(h => h.date === dateStr)
            .sort((a, b) => { const order = { national: 0, state: 1, municipal: 2 }; return (order[a.scope] ?? 9) - (order[b.scope] ?? 9); });
          const isNationalHoliday = dayHolidays.some(h => h.scope === "national");
          const headerBg = isNationalHoliday ? "#06b6d420" : (isToday ? "#ffa61920" : "#073d4a");
          const headerBdr = isNationalHoliday ? "#06b6d4" : (isToday ? "#ffa619" : "#154753");
          const headerColor = isNationalHoliday ? "#06b6d4" : (isToday ? "#ffa619" : "#e2e8f0");
          const subColor = isNationalHoliday ? "#06b6d4" : (isToday ? "#ffa619" : "#64748b");
          const tooltip = dayHolidays.map(h => h.scope === "national" ? `🇧🇷 ${h.name}` : h.scope === "state" ? `🏖 ${h.name} · ${h.state}` : `🏖 ${h.name} · ${h.city}/${h.state}`).join("\n");
          return (
            <div key={dateStr}>
              <div title={tooltip || undefined} style={{
                textAlign:"center", padding:"8px 4px",
                background: headerBg,
                border:`1px solid ${headerBdr}`,
                borderBottom:"none", borderRadius:"10px 10px 0 0"
              }}>
                <div style={{ color: subColor, fontSize:10, fontWeight:700 }}>{DAY_NAMES[i]}</div>
                <div style={{ color: headerColor, fontSize:20, fontWeight:800, lineHeight:1.1 }}>{dateObj.getDate()}</div>
                <div style={{ color: subColor, fontSize:10 }}>
                  {dayHolidays.length > 0 ? <span title={tooltip}>🏖 {dayHolidays.length === 1 ? dayHolidays[0].name.slice(0, 12) : `${dayHolidays.length} feriados`}</span> : dateObj.toLocaleDateString("pt-BR",{month:"short"})}
                </div>
              </div>
              <div style={{
                minHeight:180, padding:"6px 4px",
                background:"#022932",
                border:`1px solid ${isToday ? "#ffa61940" : "#154753"}`,
                borderTop:`1px solid ${isToday ? "#ffa61940" : "#154753"}`,
                borderRadius:"0 0 10px 10px",
                display:"flex", flexDirection:"column", gap:5
              }}>
                {classes.length === 0 && (
                  <div style={{ textAlign:"center", color:"#1a4a56", fontSize:11, marginTop:20 }}>—</div>
                )}
                {classes.map(({ cid, cls, area, t, startTime, endTime, modules, pending, links }) => (
                  <div key={cid}
                    onClick={() => canEdit && onClickClass(cid)}
                    title={links.length > 0 ? `${cls}\n🔗 Vinculada com: ${links.join(", ")}` : cls}
                    style={{
                      background: area ? area.color+"20" : "#073d4a",
                      border:`1px solid ${links.length > 0 ? "#06b6d450" : (area ? area.color+"50" : "#154753")}`,
                      borderRadius:7, padding:"5px 7px",
                      cursor: canEdit ? "pointer" : "default",
                      borderLeft: links.length > 0 ? "3px solid #06b6d4" : (area ? `3px solid ${area.color}` : "3px solid #154753")
                    }}>
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ color:"#fff", fontSize:11, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{cls}</span>
                      {links.length > 0 && <span title={`Vinculada com: ${links.join(", ")}`} style={{ color:"#06b6d4", fontSize:10, flexShrink:0 }}>🔗</span>}
                    </div>
                    {t && <div style={{ color:"#ffa619", fontSize:10, fontWeight:600 }}>{t.gcc}</div>}
                    {links.length > 0 && <div style={{ color:"#06b6d4", fontSize:9, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>🔗 {links.join(", ")}</div>}
                    <div style={{ color:"#94a3b8", fontSize:10, marginTop:1 }}>{startTime}–{endTime}</div>
                    {modules.slice(0, 2).map((mod, mi) => (
                      <div key={mi} style={{ color:"#64748b", fontSize:10, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{mod}</div>
                    ))}
                    {modules.length > 2 && <div style={{ color:"#64748b", fontSize:10 }}>+{modules.length - 2} módulo(s)</div>}
                    {pending > 0 && <div style={{ marginTop:2, padding:"1px 5px", borderRadius:4, background:"#d9780625", color:"#d97806", fontSize:9, display:"inline-block" }}>{pending} pendente(s)</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

