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

const Dashboard = ({ schedules, setSchedules, trainings, setActive, user, instructors = [], activities = [], absences = [], holidays = [], viewBase }) => {
  const todayStr = new Date().toISOString().split("T")[0];
  const [date, setDate] = React.useState(todayStr);
  const [pendingModal,       setPendingModal]       = React.useState(false);
  const [conflictModal,      setConflictModal]      = React.useState(false);
  const [contractAlertModal, setContractAlertModal] = React.useState(false);
  const [expandedIssue,      setExpandedIssue]      = React.useState(null);

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

      {/* Resumo por base — visível para admin/dev independente do viewBase ativo */}
      {canPlan && canPlan(user) && (() => {
        const bases = ["Macaé", "Bangu"];
        return (
          <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
            {bases.map(base => {
              const bSched = schedules.filter(s => (!s.base || s.base === base) && (s.planningType === "base" || !s.planningType));
              const bDay   = bSched.filter(s => s.date === date);
              const bClass = [...new Set(bDay.map(s => s.classId).filter(Boolean))].length;
              const bInstr = [...new Set(bDay.map(s => s.instructorId).filter(Boolean))].length;
              const bPend  = [...new Set(bDay.filter(s => s.status !== "Confirmado").map(s => String(s.instructorId)).filter(Boolean))].length;
              const isActive = viewBase === base;
              return (
                <div key={base} style={{ background: isActive ? "#073d4a" : "#042830", border:`1px solid ${isActive ? "#ffa619" : "#0e3a45"}`, borderRadius:12, padding:"12px 16px", minWidth:160, flex:"0 0 auto" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                    <span style={{ fontSize:11, fontWeight:700, color: isActive ? "#ffa619" : "#64748b", textTransform:"uppercase", letterSpacing:0.5 }}>📍 {base}</span>
                    {isActive && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:10, background:"#ffa61920", color:"#ffa619", fontWeight:700, border:"1px solid #ffa61940" }}>ativa</span>}
                  </div>
                  <div style={{ display:"flex", gap:16 }}>
                    <div>
                      <div style={{ color:"#e2e8f0", fontWeight:800, fontSize:22, lineHeight:1 }}>{bClass}</div>
                      <div style={{ color:"#475569", fontSize:10, marginTop:2 }}>turmas</div>
                    </div>
                    <div>
                      <div style={{ color:"#06b6d4", fontWeight:800, fontSize:22, lineHeight:1 }}>{bInstr}</div>
                      <div style={{ color:"#475569", fontSize:10, marginTop:2 }}>instrutores</div>
                    </div>
                    {bPend > 0 && (
                      <div>
                        <div style={{ color:"#ef4444", fontWeight:800, fontSize:22, lineHeight:1 }}>{bPend}</div>
                        <div style={{ color:"#475569", fontSize:10, marginTop:2 }}>pendentes</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
              {conflictClassCount} turma(s) com {conflictInfo.pairs.length} conflito(s). Inclui sobreposição de instrutor/local e vagas em aberto (sem instrutor após inativação).
            </p>
            {conflictInfo.pairs.length === 0
              ? <p style={{ color:"#64748b", textAlign:"center", marginTop:24 }}>Sem conflitos.</p>
              : conflictInfo.pairs.map((p, idx) => {
                  const kindMeta = p.kind === "instr"   ? { label: "INSTRUTOR",   color: "#ef4444" }
                                 : p.kind === "vacancy" ? { label: "VAGA ABERTA", color: "#ef4444" }
                                 :                        { label: "LOCAL",       color: "#d97806" };
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

