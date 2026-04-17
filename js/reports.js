// ── REPORTS ───────────────────────────────────────────────────────────────────
const ReportsPage = ({ schedules, trainings, instructors, user }) => {
  const isInstr = user && user.role === "instructor";
  const instrId = isInstr && (user.linkedInstructorId || user.id);
  // ── Visão do Instrutor (My History) ──────────────────────────────────────
  const hoje = new Date();
  const trintaDiasAtras = new Date(hoje); trintaDiasAtras.setDate(hoje.getDate() - 30);
  const [periodoInicio, setPeriodoInicio] = useState(trintaDiasAtras.toISOString().split("T")[0]);
  const [periodoFim, setPeriodoFim] = useState(hoje.toISOString().split("T")[0]);

  if (isInstr) {
    const INSTR_PERIODS = [
      { label: "MANHÃ",  color: "#f59e0b", slots: ["08:00","09:00","10:00","11:00"] },
      { label: "TARDE",  color: "#3b82f6", slots: ["13:00","14:00","15:00","16:00"] },
      { label: "NOITE",  color: "#8b5cf6", slots: ["17:00","18:00","19:00","20:00"] },
    ];
    const toMins = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
    const minhasAulas = schedules
      .filter(s => String(s.instructorId) === String(instrId) && s.date >= periodoInicio && s.date <= periodoFim)
      .sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));
    const sortedDates = [...new Set(minhasAulas.map(s => s.date))].sort((a, b) => b.localeCompare(a));
    const getSlot = (date, slotStart) => {
      const sS = toMins(slotStart), sE = sS + 60;
      return minhasAulas.filter(s => s.date === date && toMins(s.startTime) < sE && toMins(s.endTime) > sS);
    };
    const [hoveredSlot, setHoveredSlot] = React.useState(null);
    const fmtDay = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
    return (
      <div>
        <h2 style={{ color: "#fff", fontWeight: 800, margin: "0 0 4px", fontSize: 24 }}>Meu Histórico</h2>
        <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 14 }}>Consulte suas aulas ministradas por período</p>
        {/* Filtros */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ color: "#94a3b8", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>DE</label>
            <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)}
              style={{ background: "#073d4a", border: "1px solid #154753", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, outline: "none" }} />
          </div>
          <div>
            <label style={{ color: "#94a3b8", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>ATÉ</label>
            <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
              style={{ background: "#073d4a", border: "1px solid #154753", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, outline: "none" }} />
          </div>
          <div style={{ padding: "10px 16px", background: "#01323d", borderRadius: 10, border: "1px solid #154753" }}>
            <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 700 }}>{minhasAulas.length}</span>
            <span style={{ color: "#64748b", fontSize: 12 }}> aula{minhasAulas.length !== 1 ? "s" : ""} em </span>
            <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 700 }}>{sortedDates.length}</span>
            <span style={{ color: "#64748b", fontSize: 12 }}> dia{sortedDates.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        {/* Grade MANHÃ / TARDE / NOITE */}
        {minhasAulas.length === 0 ? (
          <div style={{ background: "#073d4a", borderRadius: 16, padding: 48, border: "1px solid #154753", textAlign: "center" }}>
            <p style={{ color: "#64748b", fontSize: 15 }}>Nenhuma aula encontrada neste período.</p>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            {/* Tooltip */}
            {hoveredSlot && (() => {
              const occ = getSlot(hoveredSlot.date, hoveredSlot.slot);
              if (!occ.length) return null;
              const e = occ[0];
              return (
                <div style={{ position: "fixed", left: hoveredSlot.x + 12, top: hoveredSlot.y - 10, zIndex: 999,
                  background: "#0a2a34", border: "1px solid #ffa61960", borderRadius: 10, padding: "10px 14px",
                  boxShadow: "0 8px 24px #00000080", minWidth: 220, pointerEvents: "none" }}>
                  <div style={{ color: "#ffa619", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{e.trainingName} · {e.className}</div>
                  <div style={{ color: "#e2e8f0", fontSize: 11, marginBottom: 2 }}>{e.module}</div>
                  {e.local && <div style={{ color: "#94a3b8", fontSize: 11 }}>📍 {e.local}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ color: "#64748b", fontSize: 10 }}>{e.startTime}–{e.endTime}</span>
                    <span style={{ padding: "1px 6px", borderRadius: 4, background: (ROLE_BADGE[e.role] || "#64748b") + "20", color: ROLE_BADGE[e.role] || "#64748b", fontSize: 9, fontWeight: 600 }}>{ROLE_PT[e.role] || e.role || "—"}</span>
                    <span style={{ padding: "1px 6px", borderRadius: 10, background: (STATUS_COLOR[e.status] || "#64748b") + "20", color: STATUS_COLOR[e.status] || "#64748b", fontSize: 9, fontWeight: 600 }}>{e.status}</span>
                  </div>
                </div>
              );
            })()}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "#01323d" }}>
                    <th rowSpan={2} style={{ padding: "10px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700, textAlign: "left", border: "1px solid #154753", minWidth: 130 }}>DATA</th>
                    {INSTR_PERIODS.map(p => (
                      <th key={p.label} colSpan={4}
                        style={{ padding: "8px", color: p.color, fontSize: 12, fontWeight: 800, textAlign: "center", border: "1px solid #154753", background: p.color + "15" }}>
                        {p.label}
                      </th>
                    ))}
                  </tr>
                  <tr style={{ background: "#01323d" }}>
                    {INSTR_PERIODS.map(p => p.slots.map(slot => (
                      <th key={`${p.label}-${slot}`}
                        style={{ padding: "6px 4px", color: "#64748b", fontSize: 11, fontWeight: 600, textAlign: "center", border: "1px solid #154753", minWidth: 70 }}>
                        {slot}
                      </th>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {sortedDates.map((date, ri) => {
                    const hasAny = INSTR_PERIODS.some(p => p.slots.some(s => getSlot(date, s).length > 0));
                    return (
                      <tr key={date} style={{ background: ri % 2 === 0 ? "#073d4a" : "#063540" }}>
                        <td style={{ padding: "8px 14px", border: "1px solid #154753", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: "#01323d", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>{new Date(date + "T12:00:00").getDate()}</span>
                              <span style={{ color: "#64748b", fontSize: 8 }}>{new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { month: "short" }).toUpperCase()}</span>
                            </div>
                            <span style={{ color: hasAny ? "#e2e8f0" : "#475569", fontSize: 11, fontWeight: 600 }}>
                              {fmtDay(date)}
                            </span>
                          </div>
                        </td>
                        {INSTR_PERIODS.map(p => p.slots.map(slot => {
                          const occ = getSlot(date, slot);
                          const busy = occ.length > 0;
                          const slotKey = `${date}-${p.label}-${slot}`;
                          return (
                            <td key={slotKey} style={{ padding: "6px 4px", border: "1px solid #154753", textAlign: "center", verticalAlign: "middle" }}>
                              <div
                                onMouseEnter={e => busy && setHoveredSlot({ date, slot, x: e.clientX, y: e.clientY })}
                                onMouseMove={e => busy && setHoveredSlot(h => h ? { ...h, x: e.clientX, y: e.clientY } : h)}
                                onMouseLeave={() => setHoveredSlot(null)}
                                style={{ width: 12, height: 12, borderRadius: "50%", margin: "auto", cursor: busy ? "pointer" : "default", transition: "transform 0.1s",
                                  background: busy ? "#16a34a" : "#1e3a42",
                                  boxShadow: busy ? "0 0 6px #16a34a80" : "none",
                                  transform: hoveredSlot?.date === date && hoveredSlot?.slot === slot ? "scale(1.4)" : "scale(1)" }}
                              />
                            </td>
                          );
                        }))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Legenda */}
            <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 6px #16a34a80" }} />
                <span style={{ color: "#64748b", fontSize: 12 }}>Ocupado</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#1e3a42" }} />
                <span style={{ color: "#64748b", fontSize: 12 }}>Livre</span>
              </div>
              {INSTR_PERIODS.map(p => (
                <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color + "40", border: `1px solid ${p.color}60` }} />
                  <span style={{ color: "#64748b", fontSize: 12 }}>{p.label} ({p.slots[0]}–{String(+p.slots[3].split(":")[0] + 1).padStart(2, "0")}:00)</span>
                </div>
              ))}
              <span style={{ color: "#475569", fontSize: 11, marginLeft: "auto" }}>Passe o mouse sobre uma bolinha verde para ver detalhes</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  const [tab, setTab] = useState("utilizacao");
  const today = new Date().toISOString().split("T")[0];
  const [utilDate, setUtilDate] = useState(today);
  // ── Estado das abas Salas e Turmas ─────────────────────────────────────────
  const [salaDate, setSalaDate] = useState(today);
  const [salaSearch, setSalaSearch] = useState("");
  const [trmFrom, setTrmFrom] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0]; });
  const [trmTo, setTrmTo] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().split("T")[0]; });
  const [trmTraining, setTrmTraining] = useState("");
  const [trmClass, setTrmClass] = useState("");
  const [horasMonth, setHorasMonth] = useState(() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0"); });

  // ── Relatório de Utilização ───────────────────────────────────────────────
  // Slots: cada slot representa o início da hora. 08:00 = 08:00–09:00, 20:00 = 20:00–21:00
  const PERIODS = [
    { label: "MANHÃ",  color: "#f59e0b", slots: ["08:00","09:00","10:00","11:00"] },
    { label: "TARDE",  color: "#3b82f6", slots: ["13:00","14:00","15:00","16:00"] },
    { label: "NOITE",  color: "#8b5cf6", slots: ["17:00","18:00","19:00","20:00"] },
  ];

  const getSlotOccupation = (instructorId, slotStart) => {
    const slotS = timeToMins(slotStart);
    const slotE = slotS + 60; // cada slot = 1 hora
    return schedules.filter(s =>
      s.instructorId === instructorId &&
      s.date === utilDate &&
      timeToMins(s.startTime) < slotE &&
      timeToMins(s.endTime)   > slotS
    );
  };

  const daySchedules = schedules.filter(s => s.date === utilDate);
  const activeInstructors = instructors.filter(i =>
    daySchedules.some(s => s.instructorId === i.id)
  );

  // ── Carga por Instrutor ───────────────────────────────────────────────────
  const byI = instructors.map(i => ({ ...i, count: schedules.filter(s => s.instructorId === i.id).length })).sort((a, b) => b.count - a.count);
  const byT = trainings.map(t => ({ ...t, count: schedules.filter(s => s.trainingId === t.id).length })).sort((a, b) => b.count - a.count);
  const maxI = Math.max(...byI.map(x => x.count), 1), maxT = Math.max(...byT.map(x => x.count), 1);

  const TAB_BTN = (id, label) => (
    <button key={id} onClick={() => setTab(id)}
      style={{ padding: "8px 18px", borderRadius: 20, border: `1px solid ${tab===id ? "#ffa619" : "#154753"}`,
        background: tab===id ? "#ffa61920" : "transparent", color: tab===id ? "#ffa619" : "#64748b",
        fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:"#fff", fontWeight:800, margin:0, fontSize:24 }}>Relatórios</h2>
          <p style={{ color:"#64748b", margin:"4px 0 0", fontSize:14 }}>Análise de desempenho e utilização</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {TAB_BTN("utilizacao", "📊 Utilização Diária")}
          {TAB_BTN("carga", "🏆 Carga por Instrutor")}
          {TAB_BTN("cursos", "📚 Cursos Programados")}
          {TAB_BTN("salas", "🏢 Salas / Class Planning")}
          {TAB_BTN("turmas", "📋 Programação da Turma")}
          {TAB_BTN("horas", "⏱ Horas por Instrutor")}
        </div>
      </div>

      {/* ── ABA: UTILIZAÇÃO DIÁRIA ── */}
      {tab === "utilizacao" && (() => {
        const [somenteLivres, setSomenteLivres] = React.useState(false);
        const [hoveredSlot, setHoveredSlot] = React.useState(null);
        const [busca, setBusca] = React.useState("");
        const buscaRef = React.useRef(null);

        const listaFiltrada = instructors.filter(i => {
          const nomeOk = busca ? i.name.toLowerCase().includes(busca.toLowerCase()) : true;
          const livreOk = somenteLivres ? !PERIODS.some(p => p.slots.some(s => getSlotOccupation(i.id, s).length > 0)) : true;
          return nomeOk && livreOk;
        });

        return (
        <div style={{ position:"relative" }}>
          {/* Tooltip flutuante */}
          {hoveredSlot && (() => {
            const occ = getSlotOccupation(hoveredSlot.instrId, hoveredSlot.slot);
            if (!occ.length) return null;
            const e = occ[0];
            return (
              <div style={{ position:"fixed", left: hoveredSlot.x+12, top: hoveredSlot.y-10, zIndex:999,
                background:"#0a2a34", border:"1px solid #ffa61960", borderRadius:10, padding:"10px 14px",
                boxShadow:"0 8px 24px #00000080", minWidth:200, pointerEvents:"none" }}>
                <div style={{ color:"#ffa619", fontSize:12, fontWeight:700, marginBottom:4 }}>{e.trainingName} · {e.className}</div>
                <div style={{ color:"#e2e8f0", fontSize:11, marginBottom:2 }}>{e.module}</div>
                {e.local && <div style={{ color:"#94a3b8", fontSize:11 }}>📍 {e.local}</div>}
                <div style={{ color:"#64748b", fontSize:10, marginTop:4 }}>{e.startTime} – {e.endTime}</div>
              </div>
            );
          })()}

          {/* Barra de controles */}
          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16, flexWrap:"wrap" }}>
            <div>
              <label style={{ color:"#94a3b8", fontSize:12, display:"block", marginBottom:4 }}>Selecionar dia</label>
              <input type="date" value={utilDate} onChange={e => setUtilDate(e.target.value)}
                style={{ padding:"8px 12px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none" }} />
            </div>
            <div style={{ padding:"10px 16px", background:"#01323d", borderRadius:10, border:"1px solid #154753" }}>
              <div style={{ color:"#64748b", fontSize:12 }}>
                {new Date(utilDate+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
                <span style={{ color:"#16a34a", fontSize:13, fontWeight:700 }}>{activeInstructors.length}/{instructors.length}</span>
                <span style={{ color:"#64748b", fontSize:12 }}>instrutor(es) com programação</span>
                {/* Checkbox: mostrar somente livres */}
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", marginLeft:8,
                  padding:"3px 10px", borderRadius:6, background: somenteLivres ? "#16a34a20" : "#154753",
                  border:`1px solid ${somenteLivres ? "#16a34a60" : "#1e5a6a"}` }}>
                  <input type="checkbox" checked={somenteLivres} onChange={e => setSomenteLivres(e.target.checked)}
                    style={{ accentColor:"#16a34a", width:13, height:13 }} />
                  <span style={{ color: somenteLivres ? "#16a34a" : "#94a3b8", fontSize:11, fontWeight:600 }}>
                    Somente disponíveis
                  </span>
                </label>
              </div>
            </div>
            {/* Campo de busca com ESC para cancelar */}
            <div style={{ position:"relative" }}>
              <div style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
                <Icon name="search" size={14} color="#64748b" />
              </div>
              <input
                ref={buscaRef}
                value={busca}
                onChange={e => setBusca(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") { setBusca(""); buscaRef.current?.blur(); } }}
                placeholder="Filtrar instrutor..."
                style={{ padding:"9px 12px 9px 32px", background:"#073d4a", border:`1px solid ${busca ? "#ffa619" : "#154753"}`,
                  borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", width:200, transition:"border 0.2s" }} />
              {busca && (
                <button onClick={() => { setBusca(""); buscaRef.current?.focus(); }}
                  style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#64748b", fontSize:14, lineHeight:1 }}>
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Tabela */}
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
              <thead>
                <tr style={{ background:"#01323d" }}>
                  <th rowSpan={2} style={{ padding:"10px 16px", color:"#94a3b8", fontSize:12, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:180 }}>INSTRUTOR</th>
                  {PERIODS.map(p => (
                    <th key={p.label} colSpan={4}
                      style={{ padding:"8px", color:p.color, fontSize:12, fontWeight:800, textAlign:"center", border:"1px solid #154753", background:p.color+"15" }}>
                      {p.label}
                    </th>
                  ))}
                </tr>
                <tr style={{ background:"#01323d" }}>
                  {PERIODS.map(p => p.slots.map(slot => (
                    <th key={`${p.label}-${slot}`}
                      style={{ padding:"6px 4px", color:"#64748b", fontSize:11, fontWeight:600, textAlign:"center", border:"1px solid #154753", minWidth:70 }}>
                      {slot}
                    </th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((instr, ri) => {
                  const hasAny = PERIODS.some(p => p.slots.some(s => getSlotOccupation(instr.id, s).length > 0));
                  return (
                    <tr key={instr.id} style={{ background: ri%2===0 ? "#073d4a" : "#063540" }}>
                      <td style={{ padding:"8px 14px", border:"1px solid #154753", whiteSpace:"nowrap" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,#ffa619,#e8920a)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:9, fontWeight:700, flexShrink:0 }}>
                            {instr.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
                          </div>
                          <span style={{ color: hasAny ? "#e2e8f0" : "#475569", fontSize:12, fontWeight: hasAny ? 600 : 400 }}>
                            {instr.name.split(" ").slice(0,3).join(" ")}
                          </span>
                        </div>
                      </td>
                      {PERIODS.map(p => p.slots.map(slot => {
                        const occ = getSlotOccupation(instr.id, slot);
                        const busy = occ.length > 0;
                        const entry = occ[0];
                        const slotKey = `${instr.id}-${p.label}-${slot}`;
                        return (
                          <td key={slotKey} style={{ padding:"6px 4px", border:"1px solid #154753", textAlign:"center", verticalAlign:"middle" }}>
                            {/* Bolinha: verde = ocupado, cinza = livre */}
                            <div
                              onMouseEnter={e => busy && setHoveredSlot({ instrId:instr.id, slot, x:e.clientX, y:e.clientY })}
                              onMouseMove={e => busy && setHoveredSlot(h => h ? { ...h, x:e.clientX, y:e.clientY } : h)}
                              onMouseLeave={() => setHoveredSlot(null)}
                              style={{ width:12, height:12, borderRadius:"50%", margin:"auto", cursor: busy ? "pointer" : "default", transition:"transform 0.1s",
                                background: busy ? "#16a34a" : "#1e3a42",
                                boxShadow: busy ? "0 0 6px #16a34a80" : "none",
                                transform: hoveredSlot?.instrId===instr.id && hoveredSlot?.slot===slot ? "scale(1.4)" : "scale(1)" }}
                            />
                          </td>
                        );
                      }))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {listaFiltrada.length === 0 && (
            <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>
              {somenteLivres ? "Todos os instrutores têm programação neste dia." : "Nenhuma programação encontrada para este dia."}
            </p>
          )}

          {/* Legenda */}
          <div style={{ display:"flex", gap:20, marginTop:14, flexWrap:"wrap", alignItems:"center" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:12, height:12, borderRadius:"50%", background:"#16a34a", boxShadow:"0 0 6px #16a34a80" }} />
              <span style={{ color:"#64748b", fontSize:12 }}>Ocupado</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:12, height:12, borderRadius:"50%", background:"#1e3a42" }} />
              <span style={{ color:"#64748b", fontSize:12 }}>Livre</span>
            </div>
            {PERIODS.map(p => (
              <div key={p.label} style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:10, height:10, borderRadius:2, background:p.color+"40", border:`1px solid ${p.color}60` }} />
                <span style={{ color:"#64748b", fontSize:12 }}>{p.label} ({p.slots[0]}–{String(+p.slots[3].split(":")[0]+1).padStart(2,"0")}:00)</span>
              </div>
            ))}
            <span style={{ color:"#475569", fontSize:11, marginLeft:"auto" }}>Passe o mouse sobre uma bolinha verde para ver detalhes</span>
          </div>
        </div>
        );
      })()}

      {/* ── ABA: CARGA POR INSTRUTOR ── */}
      {tab === "carga" && (
        <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
          <h3 style={{ color:"#fff", fontWeight:700, margin:"0 0 16px", fontSize:15 }}>🏆 Carga por Instrutor</h3>
          {byI.filter(i => i.count > 0).map(i => (
            <div key={i.id} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
              <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#ffa619,#e8920a)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:10, fontWeight:700, flexShrink:0 }}>
                {i.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"#e2e8f0", fontSize:13 }}>{i.name}</span>
                  <span style={{ color:"#64748b", fontSize:13 }}>{i.count} disciplina(s)</span>
                </div>
                <div style={{ height:4, background:"#154753", borderRadius:2, marginTop:4 }}>
                  <div style={{ height:"100%", width:`${(i.count/maxI)*100}%`, background:"linear-gradient(90deg,#ffa619,#e8920a)", borderRadius:2 }} />
                </div>
              </div>
            </div>
          ))}
          {byI.every(i => i.count === 0) && <p style={{ color:"#64748b", textAlign:"center", padding:24 }}>Nenhuma programação cadastrada.</p>}
        </div>
      )}

      {/* ── ABA: CURSOS PROGRAMADOS ── */}
      {tab === "cursos" && (
        <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
          <h3 style={{ color:"#fff", fontWeight:700, margin:"0 0 16px", fontSize:15 }}>📚 Cursos Mais Programados</h3>
          {byT.filter(t => t.count > 0).slice(0,15).map(t => (
            <div key={t.id} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
              <span style={{ padding:"2px 8px", borderRadius:6, background:"#ffa61920", color:"#ffa619", fontSize:11, fontWeight:700, flexShrink:0, minWidth:60, textAlign:"center" }}>{t.gcc}</span>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"#e2e8f0", fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:200 }}>{t.name.slice(0,35)}</span>
                  <span style={{ color:"#64748b", fontSize:13 }}>{t.count}</span>
                </div>
                <div style={{ height:4, background:"#154753", borderRadius:2, marginTop:4 }}>
                  <div style={{ height:"100%", width:`${(t.count/maxT)*100}%`, background:"linear-gradient(90deg,#f59e0b,#ef4444)", borderRadius:2 }} />
                </div>
              </div>
            </div>
          ))}
          {byT.every(t => t.count === 0) && <p style={{ color:"#64748b", textAlign:"center", padding:24 }}>Nenhuma programação cadastrada.</p>}
        </div>
      )}

      {/* ── ABA: SALAS / CLASS PLANNING ── */}
      {tab === "salas" && (() => {
        const dayItems = schedules.filter(s => s.date === salaDate);
        const allLocals = [...new Set(dayItems.map(s => s.local).filter(Boolean))].sort();
        const filtered = salaSearch.trim()
          ? allLocals.filter(l => l.toLowerCase().includes(salaSearch.trim().toLowerCase()))
          : allLocals;
        const prevDay = () => { const d = new Date(salaDate + "T12:00:00"); d.setDate(d.getDate()-1); setSalaDate(d.toISOString().split("T")[0]); };
        const nextDay = () => { const d = new Date(salaDate + "T12:00:00"); d.setDate(d.getDate()+1); setSalaDate(d.toISOString().split("T")[0]); };
        const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
        const printSalas = () => {
          const rows = filtered.map(local => {
            const items = dayItems.filter(s => s.local === local).sort((a,b) => a.startTime.localeCompare(b.startTime));
            const rowsHtml = items.map(s =>
              "<tr><td style='padding:6px 12px;border:1px solid #ddd'>" + (s.startTime||"") + " – " + (s.endTime||"") + "</td>" +
              "<td style='padding:6px 12px;border:1px solid #ddd'>" + (s.trainingName||"") + "</td>" +
              "<td style='padding:6px 12px;border:1px solid #ddd'>" + (s.className||"") + "</td>" +
              "<td style='padding:6px 12px;border:1px solid #ddd'>" + (s.module||"") + "</td></tr>"
            ).join("");
            return "<tr><td colspan='4' style='background:#f0f4f8;padding:8px 12px;font-weight:700;border:1px solid #ddd'>" + local + "</td></tr>" + rowsHtml;
          }).join("");
          const w = window.open("", "_blank");
          w.document.write("<html><head><title>Salas – " + salaDate + "</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{background:#01323d;color:#fff;padding:8px 12px;border:1px solid #ccc}@media print{button{display:none}}</style></head><body>");
          w.document.write("<h2 style='margin:0 0 4px'>Salas / Class Planning</h2>");
          w.document.write("<p style='color:#555;margin:0 0 16px'>" + fmtDate(salaDate) + "</p>");
          w.document.write("<button onclick='window.print()' style='margin-bottom:16px;padding:8px 18px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer'>🖨 Imprimir / PDF</button>");
          w.document.write("<table><thead><tr><th>Horário</th><th>Treinamento</th><th>Turma</th><th>Módulo</th></tr></thead><tbody>" + rows + "</tbody></table>");
          w.document.write("</body></html>");
          w.document.close();
        };
        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"center", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15 }}>🏢 Salas / Class Planning</h3>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
                <button onClick={prevDay} style={{ background:"#01323d", border:"1px solid #154753", color:"#e2e8f0", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:14 }}>‹</button>
                <input type="date" value={salaDate} onChange={e => setSalaDate(e.target.value)}
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"6px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                <button onClick={nextDay} style={{ background:"#01323d", border:"1px solid #154753", color:"#e2e8f0", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:14 }}>›</button>
                <input value={salaSearch} onChange={e => setSalaSearch(e.target.value)} placeholder="Filtrar sala..."
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"6px 10px", color:"#e2e8f0", fontSize:13, outline:"none", width:160 }} />
                <button onClick={printSalas} style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"7px 14px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>🖨 PDF</button>
              </div>
            </div>
            {filtered.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:32 }}>Nenhuma sala ocupada neste dia.</p>
            ) : filtered.map(local => {
              const items = dayItems.filter(s => s.local === local).sort((a,b) => a.startTime.localeCompare(b.startTime));
              return (
                <div key={local} style={{ marginBottom:16, background:"#01323d", borderRadius:12, border:"1px solid #154753", overflow:"hidden" }}>
                  <div style={{ background:"#0a4a5a", padding:"10px 16px", borderBottom:"1px solid #154753" }}>
                    <span style={{ color:"#ffa619", fontWeight:700, fontSize:14 }}>📍 {local}</span>
                    <span style={{ color:"#64748b", fontSize:11, marginLeft:8 }}>{items.length} aula{items.length !== 1 ? "s" : ""}</span>
                  </div>
                  {items.map((s,i) => (
                    <div key={i} style={{ display:"flex", flexWrap:"wrap", gap:8, padding:"10px 16px", borderBottom: i < items.length-1 ? "1px solid #0f3a48" : "none", alignItems:"center" }}>
                      <span style={{ color:"#f59e0b", fontSize:12, fontWeight:700, minWidth:110 }}>{s.startTime} – {s.endTime}</span>
                      <span style={{ color:"#e2e8f0", fontSize:12, flex:1, minWidth:140 }}>{s.trainingName || "—"}</span>
                      <span style={{ color:"#94a3b8", fontSize:11, background:"#073d4a", padding:"2px 8px", borderRadius:6 }}>{s.className || "—"}</span>
                      <span style={{ color:"#64748b", fontSize:11 }}>{s.module || ""}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── ABA: PROGRAMAÇÃO DA TURMA ── */}
      {tab === "turmas" && (() => {
        const trainingOpts = [...new Set(schedules.map(s => s.trainingName).filter(Boolean))].sort();
        const classOpts = [...new Set(
          schedules.filter(s => !trmTraining || s.trainingName === trmTraining).map(s => s.className).filter(Boolean)
        )].sort();
        const filtered2 = schedules.filter(s =>
          s.date >= trmFrom && s.date <= trmTo &&
          (!trmTraining || s.trainingName === trmTraining) &&
          (!trmClass || s.className === trmClass)
        );
        const byClass = {};
        filtered2.forEach(s => {
          if (!byClass[s.className]) byClass[s.className] = { trainingName: s.trainingName, days: {} };
          if (!byClass[s.className].days[s.date]) byClass[s.className].days[s.date] = [];
          byClass[s.className].days[s.date].push(s);
        });
        const classes = Object.keys(byClass).sort();
        const fmtD = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"short", day:"2-digit", month:"2-digit" });
        const printTurma = (cls) => {
          const entry = byClass[cls];
          const days = Object.keys(entry.days).sort();
          const rowsHtml = days.map(d => {
            const items = entry.days[d].sort((a,b) => a.startTime.localeCompare(b.startTime));
            return items.map((s,i) =>
              "<tr>" + (i === 0 ? "<td rowspan='" + items.length + "' style='padding:6px 12px;border:1px solid #ddd;vertical-align:top;font-weight:600'>" + new Date(d + "T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"}) + "</td>" : "") +
              "<td style='padding:6px 12px;border:1px solid #ddd'>" + (s.startTime||"") + " – " + (s.endTime||"") + "</td>" +
              "<td style='padding:6px 12px;border:1px solid #ddd'>" + (s.module||"") + "</td>" +
              "<td style='padding:6px 12px;border:1px solid #ddd'>" + (s.local||"—") + "</td>" +
              "<td style='padding:6px 12px;border:1px solid #ddd'>" + (s.instructorName||"—") + "</td>" +
              "</tr>"
            ).join("");
          }).join("");
          const w = window.open("", "_blank");
          w.document.write("<html><head><title>" + cls + "</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{background:#01323d;color:#fff;padding:8px 12px;border:1px solid #ccc}@media print{button{display:none}}</style></head><body>");
          w.document.write("<h2 style='margin:0 0 2px'>Programação da Turma</h2>");
          w.document.write("<h3 style='margin:0 0 4px;color:#555'>" + cls + " — " + (entry.trainingName||"") + "</h3>");
          w.document.write("<button onclick='window.print()' style='margin-bottom:16px;padding:8px 18px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer'>🖨 Imprimir / PDF</button>");
          w.document.write("<table><thead><tr><th>Dia</th><th>Horário</th><th>Módulo</th><th>Local</th><th>Instrutor</th></tr></thead><tbody>" + rowsHtml + "</tbody></table>");
          w.document.write("</body></html>");
          w.document.close();
        };
        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <h3 style={{ color:"#fff", fontWeight:700, margin:"0 0 16px", fontSize:15 }}>📋 Programação da Turma</h3>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, marginBottom:20, alignItems:"flex-end" }}>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:4, fontWeight:600 }}>DE</label>
                <input type="date" value={trmFrom} onChange={e => setTrmFrom(e.target.value)}
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
              </div>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:4, fontWeight:600 }}>ATÉ</label>
                <input type="date" value={trmTo} onChange={e => setTrmTo(e.target.value)}
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
              </div>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:4, fontWeight:600 }}>TREINAMENTO</label>
                <select value={trmTraining} onChange={e => { setTrmTraining(e.target.value); setTrmClass(""); }}
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:13, outline:"none", minWidth:180 }}>
                  <option value="">Todos</option>
                  {trainingOpts.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:4, fontWeight:600 }}>TURMA</label>
                <select value={trmClass} onChange={e => setTrmClass(e.target.value)}
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:13, outline:"none", minWidth:160 }}>
                  <option value="">Todas</option>
                  {classOpts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {classes.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:32 }}>Nenhuma turma encontrada para os filtros selecionados.</p>
            ) : classes.map(cls => {
              const entry = byClass[cls];
              const days = Object.keys(entry.days).sort();
              return (
                <div key={cls} style={{ marginBottom:20, background:"#01323d", borderRadius:12, border:"1px solid #154753", overflow:"hidden" }}>
                  <div style={{ background:"#0a4a5a", padding:"12px 16px", borderBottom:"1px solid #154753", display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ color:"#ffa619", fontWeight:800, fontSize:14 }}>{cls}</span>
                    <span style={{ color:"#64748b", fontSize:12 }}>— {entry.trainingName||""}</span>
                    <span style={{ color:"#94a3b8", fontSize:11, marginLeft:"auto" }}>{days.length} dia{days.length !== 1 ? "s" : ""}</span>
                    <button onClick={() => printTurma(cls)} style={{ background:"#ffa619", border:"none", borderRadius:6, padding:"4px 10px", color:"#000", fontSize:11, fontWeight:700, cursor:"pointer" }}>🖨 PDF</button>
                  </div>
                  {days.map(d => {
                    const items = entry.days[d].sort((a,b) => a.startTime.localeCompare(b.startTime));
                    return (
                      <div key={d} style={{ borderBottom:"1px solid #0f3a48" }}>
                        <div style={{ background:"#073d4a", padding:"6px 16px" }}>
                          <span style={{ color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>{fmtD(d)}</span>
                        </div>
                        {items.map((s,i) => (
                          <div key={i} style={{ display:"flex", flexWrap:"wrap", gap:8, padding:"8px 16px", alignItems:"center", borderTop: i>0 ? "1px solid #0f3a48" : "none" }}>
                            <span style={{ color:"#f59e0b", fontSize:12, fontWeight:700, minWidth:110 }}>{s.startTime} – {s.endTime}</span>
                            <span style={{ color:"#e2e8f0", fontSize:12, flex:1, minWidth:140 }}>{s.module || "—"}</span>
                            {s.local && <span style={{ color:"#94a3b8", fontSize:11, background:"#073d4a", padding:"2px 8px", borderRadius:6 }}>📍 {s.local}</span>}
                            {s.instructorName && <span style={{ color:"#64748b", fontSize:11 }}>👤 {s.instructorName}</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── ABA: HORAS POR INSTRUTOR ── */}
      {tab === "horas" && (() => {
        const [hmFrom, hmTo] = (() => {
          const [y, m] = horasMonth.split("-").map(Number);
          const from = new Date(y, m-1, 1).toISOString().split("T")[0];
          const to   = new Date(y, m,   0).toISOString().split("T")[0];
          return [from, to];
        })();
        const toMinsH = t => { if (!t) return 0; const [h,mn] = t.split(":").map(Number); return h*60+(mn||0); };
        const fmtHM = mins => { const h = Math.floor(mins/60); const m = mins%60; return h + "h" + (m ? String(m).padStart(2,"0")+"min" : ""); };
        const monthItems = schedules.filter(s => s.date >= hmFrom && s.date <= hmTo);
        const byInstr = instructors.map(instr => {
          const items = monthItems.filter(s => s.instructorId === instr.id);
          const totalMins = items.reduce((acc, s) => acc + Math.max(0, toMinsH(s.endTime) - toMinsH(s.startTime)), 0);
          const teoriaMins = items.filter(s => (s.type||"").toUpperCase() === "TEORIA").reduce((acc,s) => acc + Math.max(0, toMinsH(s.endTime) - toMinsH(s.startTime)), 0);
          const praticaMins = items.filter(s => (s.type||"").toUpperCase() === "PRÁTICA").reduce((acc,s) => acc + Math.max(0, toMinsH(s.endTime) - toMinsH(s.startTime)), 0);
          const outrasMins = totalMins - teoriaMins - praticaMins;
          const trainings2 = [...new Set(items.map(s => s.trainingName).filter(Boolean))];
          return { ...instr, totalMins, teoriaMins, praticaMins, outrasMins, items, trainings2 };
        }).filter(i => i.totalMins > 0).sort((a,b) => b.totalMins - a.totalMins);
        const maxMins = Math.max(...byInstr.map(i => i.totalMins), 1);
        const fmtMonthLabel = () => { const [y,m] = horasMonth.split("-").map(Number); return new Date(y, m-1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); };
        const printHoras = () => {
          const rowsHtml = byInstr.map(i =>
            "<tr><td style='padding:6px 12px;border:1px solid #ddd'>" + i.name + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;text-align:center'>" + fmtHM(i.totalMins) + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;text-align:center'>" + fmtHM(i.teoriaMins) + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;text-align:center'>" + fmtHM(i.praticaMins) + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;font-size:11px;color:#555'>" + i.trainings2.join(", ") + "</td></tr>"
          ).join("");
          const totalGeral = byInstr.reduce((a,i) => a + i.totalMins, 0);
          const w = window.open("", "_blank");
          w.document.write("<html><head><title>Horas por Instrutor – " + fmtMonthLabel() + "</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{background:#01323d;color:#fff;padding:8px 12px;border:1px solid #ccc}@media print{button{display:none}}</style></head><body>");
          w.document.write("<h2 style='margin:0 0 4px'>Relatório de Horas por Instrutor</h2>");
          w.document.write("<p style='color:#555;margin:0 0 16px'>" + fmtMonthLabel().toUpperCase() + " &nbsp;·&nbsp; Total geral: " + fmtHM(totalGeral) + " em " + byInstr.length + " instrutor(es)</p>");
          w.document.write("<button onclick='window.print()' style='margin-bottom:16px;padding:8px 18px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer'>🖨 Imprimir / PDF</button>");
          w.document.write("<table><thead><tr><th>Instrutor</th><th>Total</th><th>Teoria</th><th>Prática</th><th>Treinamentos</th></tr></thead><tbody>" + rowsHtml + "</tbody></table>");
          w.document.write("</body></html>");
          w.document.close();
        };
        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"center", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15 }}>⏱ Horas por Instrutor — Fechamento Mensal</h3>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
                <input type="month" value={horasMonth} onChange={e => setHorasMonth(e.target.value)}
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 12px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                <button onClick={printHoras} style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"7px 14px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>🖨 PDF</button>
              </div>
            </div>
            {byInstr.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:32 }}>Nenhuma aula registrada em {fmtMonthLabel()}.</p>
            ) : (
              <>
                <div style={{ background:"#01323d", borderRadius:10, padding:"10px 16px", marginBottom:16, display:"flex", gap:24, flexWrap:"wrap" }}>
                  <div><span style={{ color:"#ffa619", fontWeight:800, fontSize:16 }}>{fmtHM(byInstr.reduce((a,i)=>a+i.totalMins,0))}</span><span style={{ color:"#64748b", fontSize:12 }}> total</span></div>
                  <div><span style={{ color:"#f59e0b", fontWeight:700, fontSize:15 }}>{fmtHM(byInstr.reduce((a,i)=>a+i.teoriaMins,0))}</span><span style={{ color:"#64748b", fontSize:12 }}> teoria</span></div>
                  <div><span style={{ color:"#16a34a", fontWeight:700, fontSize:15 }}>{fmtHM(byInstr.reduce((a,i)=>a+i.praticaMins,0))}</span><span style={{ color:"#64748b", fontSize:12 }}> prática</span></div>
                  <div><span style={{ color:"#e2e8f0", fontWeight:700, fontSize:15 }}>{byInstr.length}</span><span style={{ color:"#64748b", fontSize:12 }}> instrutor(es)</span></div>
                </div>
                {byInstr.map((instr, ri) => (
                  <div key={instr.id} style={{ marginBottom:10, background:"#01323d", borderRadius:12, padding:"12px 16px", border:"1px solid #154753" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#ffa619,#e8920a)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:11, fontWeight:700, flexShrink:0 }}>
                        {instr.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:13 }}>{instr.name.split(" ").slice(0,3).join(" ")}</div>
                        <div style={{ display:"flex", gap:10, marginTop:2, flexWrap:"wrap" }}>
                          <span style={{ color:"#ffa619", fontSize:12, fontWeight:700 }}>{fmtHM(instr.totalMins)}</span>
                          {instr.teoriaMins > 0 && <span style={{ color:"#f59e0b", fontSize:11 }}>T: {fmtHM(instr.teoriaMins)}</span>}
                          {instr.praticaMins > 0 && <span style={{ color:"#16a34a", fontSize:11 }}>P: {fmtHM(instr.praticaMins)}</span>}
                          {instr.outrasMins > 0 && <span style={{ color:"#64748b", fontSize:11 }}>?: {fmtHM(instr.outrasMins)}</span>}
                        </div>
                      </div>
                      <span style={{ color:"#64748b", fontSize:11, textAlign:"right" }}>{instr.items.length} aula{instr.items.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ background:"#073d4a", borderRadius:6, height:8, overflow:"hidden" }}>
                      <div style={{ display:"flex", height:"100%" }}>
                        {instr.teoriaMins > 0 && <div style={{ width: (instr.teoriaMins/maxMins*100) + "%", background:"#f59e0b", transition:"width 0.3s" }} />}
                        {instr.praticaMins > 0 && <div style={{ width: (instr.praticaMins/maxMins*100) + "%", background:"#16a34a", transition:"width 0.3s" }} />}
                        {instr.outrasMins > 0 && <div style={{ width: (instr.outrasMins/maxMins*100) + "%", background:"#64748b", transition:"width 0.3s" }} />}
                      </div>
                    </div>
                    {instr.trainings2.length > 0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:8 }}>
                        {instr.trainings2.map(t => (
                          <span key={t} style={{ padding:"1px 7px", borderRadius:20, background:"#ffa61915", color:"#ffa619", fontSize:10, fontWeight:600 }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
};

