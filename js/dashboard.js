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

const Dashboard = ({ schedules, setSchedules, trainings, setActive, user }) => {
  const today = new Date().toISOString().split("T")[0];
  const upcoming = schedules.filter(s => s.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const issues = schedules.filter(s => s.issue);
  const [expandedIssue, setExpandedIssue] = React.useState(null);
  const fmtDate = ds => ds ? new Date(ds + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }) : "";
  const fmtDt = iso => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const ackIssue = (id) => setSchedules && setSchedules(schedules.map(s =>
    s.id === id ? { ...s, issueLog: [...(s.issueLog || []), { type: "ack", text: "Ciente — problema visualizado", by: (user && user.name) || "Planejador", at: new Date().toISOString() }] } : s
  ));
  return (
    <div>
      <h2 style={{ color: "#fff", fontWeight: 800, marginBottom: 4, fontSize: 24 }}>Dashboard</h2>
      <p style={{ color: "#64748b", marginBottom: 24, fontSize: 14 }}>Visão geral do planejamento</p>
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="Hoje"         value={schedules.filter(s => s.date === today).length} icon="calendar"   color="#ffa619" sub="treinamentos" />
        <StatCard label="Próximos"     value={schedules.filter(s => s.date >= today).length}  icon="star"       color="#f59e0b" sub="agendados" />
        <StatCard label="Confirmados"  value={schedules.filter(s => s.status === "Confirmado").length} icon="check" color="#16a34a" sub="com ciência" />
        <StatCard label="Pendentes"    value={schedules.filter(s => s.status === "Pendente").length}   icon="warning" color="#ef4444" sub="aguardando" />
        <StatCard label="Treinamentos" value={trainings.length} icon="training" color="#e8920a" sub="cadastrados" />
        {(() => {
          const M_END = 12 * 60, A_START = 13 * 60;
          const teoricos = LOCALS.filter(l => l.env === "Teórico");
          const fM = teoricos.filter(l => !schedules.some(s => s.local === l.name && s.date === today && timeToMins(s.startTime) < M_END)).length;
          const fA = teoricos.filter(l => !schedules.some(s => s.local === l.name && s.date === today && timeToMins(s.endTime) > A_START)).length;
          return (
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
          );
        })()}
      </div>
      {issues.length > 0 && (
        <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #d9780640", marginBottom: 24 }}>
          <h3 style={{ color: "#d97806", fontWeight: 700, margin: "0 0 16px", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="warning" size={18} color="#d97806" /> {issues.length} Problema(s) Reportado(s)
          </h3>
          {issues.map(s => {
            const log = s.issueLog || [];
            const hasAck = log.some(e => e.type === "ack");
            return (
              <div key={s.id} style={{ background: "#01323d", borderRadius: 10, border: `1px solid ${hasAck ? "#16a34a30" : "#d9780630"}`, padding: "12px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <p style={{ color: "#e2e8f0", fontWeight: 700, margin: 0, fontSize: 14 }}>
                    {s.trainingName} · {fmtDate(s.date)} ·{" "}
                    <button onClick={() => setActive && setActive("schedule")}
                      style={{ background: "none", border: "none", color: "#ffa619", fontWeight: 700, cursor: "pointer", fontSize: 14, padding: 0, textDecoration: "underline" }}>
                      {s.className}
                    </button>
                  </p>
                  {!hasAck ? (
                    <button onClick={() => ackIssue(s.id)}
                      style={{ padding: "4px 12px", background: "#16a34a", border: "none", borderRadius: 8, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                      Ciente ✓
                    </button>
                  ) : (
                    <span style={{ color: "#16a34a", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓ Ciente</span>
                  )}
                </div>
                {/* Histórico de eventos */}
                <div style={{ borderLeft: "2px solid #154753", marginLeft: 4, paddingLeft: 12 }}>
                  {(log.length > 0 ? log : [{ type: "report", text: s.issue, by: s.issueBy, at: s.issueAt }]).map((entry, i) => (
                    <div key={i} style={{ marginBottom: i < log.length - 1 ? 8 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.type === "ack" ? "#16a34a" : "#d97806", flexShrink: 0 }} />
                        <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>{entry.by}</span>
                        <span style={{ color: "#475569", fontSize: 10 }}>{fmtDt(entry.at)}</span>
                        {entry.type === "ack" && <span style={{ color: "#16a34a", fontSize: 10, fontWeight: 700 }}>CIENTE</span>}
                      </div>
                      {entry.type === "report" && (
                        <div style={{ color: "#fca5a5", fontSize: 12, background: "#ef444410", borderRadius: 6, padding: "6px 10px", borderLeft: "3px solid #d97806", marginTop: 4, marginLeft: 14 }}>
                          {expandedIssue === `${s.id}-${i}` || (entry.text||"").length <= 120 ? entry.text : (entry.text||"").slice(0, 120) + "…"}
                          {(entry.text||"").length > 120 && (
                            <button onClick={() => setExpandedIssue(expandedIssue === `${s.id}-${i}` ? null : `${s.id}-${i}`)}
                              style={{ background: "none", border: "none", color: "#64748b", fontSize: 11, cursor: "pointer", marginLeft: 4, padding: 0 }}>
                              {expandedIssue === `${s.id}-${i}` ? "▲" : "▼"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753" }}>
        <h3 style={{ color: "#fff", fontWeight: 700, margin: "0 0 16px", fontSize: 16 }}>📅 Próximas Programações</h3>
        {upcoming.length === 0 ? <p style={{ color: "#64748b" }}>Nenhuma programação.</p> : upcoming.map(s => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: "1px solid #154753" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "#01323d", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#f59e0b", fontSize: 16, fontWeight: 800 }}>{new Date(s.date + "T12:00:00").getDate()}</span>
              <span style={{ color: "#64748b", fontSize: 10 }}>{new Date(s.date + "T12:00:00").toLocaleDateString("pt-BR", { month: "short" }).toUpperCase()}</span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: "#e2e8f0", fontWeight: 600, margin: 0, fontSize: 14 }}>{s.trainingName} — {s.className}</p>
              <p style={{ color: "#64748b", fontSize: 12, margin: "2px 0 0" }}>{s.instructorName} · {s.local} · {s.startTime}–{s.endTime}</p>
            </div>
            {s.status !== "Confirmado" && (
              <span style={{ padding: "4px 10px", borderRadius: 20, background: (STATUS_COLOR[s.status] || "#64748b") + "20", color: STATUS_COLOR[s.status] || "#64748b", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{s.status}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── WEEKLY CALENDAR VIEW (defined outside Schedule to avoid remount) ─────────
const WeeklyCalendarView = ({ schedules, areas, trainings, weekOffset, setWeekOffset, onClickClass, canEdit }) => {
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

  const classesByDay = days.map(({ dateStr }) => {
    const dayRows = schedules.filter(s => s.date === dateStr);
    const classNames = [...new Set(dayRows.map(s => s.className))];
    return classNames.map(cls => {
      const clsOnDay = dayRows.filter(s => s.className === cls);
      const allRows  = schedules.filter(s => s.className === cls);
      const t    = trainings.find(t => t.id === allRows[0]?.trainingId);
      const area = areas.find(a => a.id === t?.area);
      const sorted = [...clsOnDay].sort((a, b) => a.startTime.localeCompare(b.startTime));
      const startTime = sorted[0]?.startTime || "—";
      const endTime   = [...clsOnDay].sort((a, b) => b.endTime.localeCompare(a.endTime))[0]?.endTime || "—";
      const modules   = [...new Set(clsOnDay.map(r => r.module))];
      const pending   = clsOnDay.filter(r => r.status === "Pendente").length;
      return { cls, area, t, startTime, endTime, modules, pending };
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
          return (
            <div key={dateStr}>
              <div style={{
                textAlign:"center", padding:"8px 4px",
                background: isToday ? "#ffa61920" : "#073d4a",
                border:`1px solid ${isToday ? "#ffa619" : "#154753"}`,
                borderBottom:"none", borderRadius:"10px 10px 0 0"
              }}>
                <div style={{ color: isToday ? "#ffa619" : "#64748b", fontSize:10, fontWeight:700 }}>{DAY_NAMES[i]}</div>
                <div style={{ color: isToday ? "#ffa619" : "#e2e8f0", fontSize:20, fontWeight:800, lineHeight:1.1 }}>{dateObj.getDate()}</div>
                <div style={{ color:"#64748b", fontSize:10 }}>{dateObj.toLocaleDateString("pt-BR",{month:"short"})}</div>
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
                {classes.map(({ cls, area, t, startTime, endTime, modules, pending }) => (
                  <div key={cls}
                    onClick={() => canEdit && onClickClass(cls)}
                    title={cls}
                    style={{
                      background: area ? area.color+"20" : "#073d4a",
                      border:`1px solid ${area ? area.color+"50" : "#154753"}`,
                      borderRadius:7, padding:"5px 7px",
                      cursor: canEdit ? "pointer" : "default",
                      borderLeft: area ? `3px solid ${area.color}` : "3px solid #154753"
                    }}>
                    <div style={{ color:"#fff", fontSize:11, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cls}</div>
                    {t && <div style={{ color:"#ffa619", fontSize:10, fontWeight:600 }}>{t.gcc}</div>}
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

