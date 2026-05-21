// ── REPORTS ───────────────────────────────────────────────────────────────────
const COMPANY_LEGAL_NAME = "RELYON BRASIL TREINAMENTOS LTDA";
const ReportsPage = ({ schedules, trainings, instructors, holidays, user, areas }) => {
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
  const [cpFrom, setCpFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1)); return d.toISOString().split("T")[0]; });
  const [cpTo, setCpTo]   = useState(() => { const d = new Date(); d.setDate(d.getDate() + (d.getDay() === 0 ? 0 : 7 - d.getDay())); return d.toISOString().split("T")[0]; });
  const [cpTraining, setCpTraining] = useState("");
  const [clpDate, setClpDate] = useState(today);
  const [ipDate, setIpDate] = useState(today);
  const [marinhaWeekOffset, setMarinhaWeekOffset] = useState(0);
  const [fteDate, setFteDate] = useState(today);
  // ── Hooks da aba Utilização (precisam ficar no nível raiz — regra dos hooks) ──
  const [somenteLivres, setSomenteLivres]         = React.useState(false);
  const [somenteCLT, setSomenteCLT]               = React.useState(false);
  const [somenteCLTOFFSHORE, setSomenteCLTOFFSHORE] = React.useState(false);
  const [hoveredSlot, setHoveredSlot]             = React.useState(null);
  const [busca, setBusca]                         = React.useState("");
  const buscaRef                                  = React.useRef(null);

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
  const byT = trainings.map(t => ({ ...t, count: schedules.filter(s => String(s.trainingId) === String(t.id)).length })).sort((a, b) => b.count - a.count);
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
          {TAB_BTN("classplanning", "📅 Class Planning")}
          {TAB_BTN("instructorplanning", "👨‍🏫 Instructor Planning")}
          {TAB_BTN("marinha", "⚓ MARINHA")}
          {TAB_BTN("salas", "📋 Plano Individual")}
          {TAB_BTN("turmas", "📋 Programação da Turma")}
          {TAB_BTN("horas", "⏱ Horas por Instrutor")}
          {TAB_BTN("fte", "👥 FTE*")}
        </div>
      </div>

      {/* ── ABA: UTILIZAÇÃO DIÁRIA ── */}
      {tab === "utilizacao" && (() => {
        const listaFiltrada = instructors.filter(i => {
          const nomeOk = busca ? i.name.toLowerCase().includes(busca.toLowerCase()) : true;
          const livreOk = somenteLivres ? !PERIODS.some(p => p.slots.some(s => getSlotOccupation(i.id, s).length > 0)) : true;
          const contratoOk = (!somenteCLT && !somenteCLTOFFSHORE) ||
            (somenteCLT && (i.contract || "").toLowerCase() === "clt") ||
            (somenteCLTOFFSHORE && /offshore/i.test(i.contract || ""));
          return nomeOk && livreOk && contratoOk;
        });

        const printUtil = () => {
          const PERIOD_CLS = { "MANHÃ":"manha", "TARDE":"tarde", "NOITE":"noite" };
          const dateLabel = new Date(utilDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
          let html = `<html><head><title>Utilização Diária</title><style>
            @page{size:A4 landscape;margin:10mm}
            *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif}
            .ph{background:#01323d;color:#fff;text-align:center;padding:14px 20px}
            .ph h1{font-size:13px;font-weight:800;letter-spacing:1px}
            .ph .sub{color:#ffa619;font-size:11px;font-weight:700;margin-top:3px}
            .ph .per{color:rgba(255,255,255,0.5);font-size:9px;margin-top:3px}
            table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed}
            th{padding:4px 2px;font-size:8px;border:1px solid #ccc;text-align:center;font-weight:700}
            th.instr{text-align:left;background:#01323d;color:#fff;padding:6px 8px;width:44mm}
            th.manha{background:#92400e;color:#fde68a}th.tarde{background:#1e3a8a;color:#bfdbfe}th.noite{background:#3b0764;color:#e9d5ff}
            th.slot{background:#f5f5f5;color:#555;font-weight:600;font-size:7px}
            td{padding:3px 2px;font-size:7px;border:1px solid #ddd;text-align:center;vertical-align:middle;color:#333}
            td.ic{text-align:left;font-weight:600;font-size:8px;padding:4px 6px;background:#fafafa}
            td.busy{background:#dcfce7;color:#166534;font-size:7px;line-height:1.3}
            tr:nth-child(even) td.ic{background:#f0f4f8}
            @media print{button{display:none}}
          </style></head><body>`;
          html += `<div class="ph"><h1>RELATÓRIO DE UTILIZAÇÃO DIÁRIA</h1><div class="sub">${COMPANY_LEGAL_NAME}</div><div class="per">${dateLabel}</div></div>`;
          html += `<div style="text-align:center;padding:8px 0"><button onclick="window.print()" style="padding:5px 18px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px">🖨 Imprimir / Salvar PDF</button></div>`;
          html += `<table><colgroup><col style="width:44mm">${PERIODS.flatMap(p => p.slots.map(() => `<col>`)).join("")}</colgroup>`;
          html += `<thead><tr><th class="instr" rowspan="2">INSTRUTOR</th>`;
          html += PERIODS.map(p => `<th class="${PERIOD_CLS[p.label]}" colspan="4">${p.label}</th>`).join("");
          html += `</tr><tr>${PERIODS.flatMap(p => p.slots.map(s => `<th class="slot">${s}</th>`)).join("")}</tr></thead><tbody>`;
          listaFiltrada.forEach(instr => {
            html += `<tr><td class="ic">${instr.name.split(" ").slice(0,3).join(" ")}</td>`;
            PERIODS.forEach(p => p.slots.forEach(slot => {
              const occ = getSlotOccupation(instr.id, slot);
              if (occ.length > 0) {
                const e = occ[0];
                html += `<td class="busy">${(e.trainingName||"")}${e.className ? "<br><span style='color:#166534;opacity:.8'>"+e.className+"</span>" : ""}</td>`;
              } else {
                html += `<td></td>`;
              }
            }));
            html += `</tr>`;
          });
          html += `</tbody></table></body></html>`;
          const w = window.open("", "_blank");
          if (!w) return;
          w.document.write(html);
          w.document.close();
        };

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
                {/* Filtros de contrato */}
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", marginLeft:8,
                  padding:"3px 10px", borderRadius:6, background: somenteCLT ? "#3b82f620" : "#154753",
                  border:`1px solid ${somenteCLT ? "#3b82f660" : "#1e5a6a"}` }}>
                  <input type="checkbox" checked={somenteCLT} onChange={e => { setSomenteCLT(e.target.checked); if (e.target.checked) setSomenteCLTOFFSHORE(false); }}
                    style={{ accentColor:"#3b82f6", width:13, height:13 }} />
                  <span style={{ color: somenteCLT ? "#3b82f6" : "#94a3b8", fontSize:11, fontWeight:600 }}>Somente CLT</span>
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer",
                  padding:"3px 10px", borderRadius:6, background: somenteCLTOFFSHORE ? "#f59e0b20" : "#154753",
                  border:`1px solid ${somenteCLTOFFSHORE ? "#f59e0b60" : "#1e5a6a"}` }}>
                  <input type="checkbox" checked={somenteCLTOFFSHORE} onChange={e => { setSomenteCLTOFFSHORE(e.target.checked); if (e.target.checked) setSomenteCLT(false); }}
                    style={{ accentColor:"#f59e0b", width:13, height:13 }} />
                  <span style={{ color: somenteCLTOFFSHORE ? "#f59e0b" : "#94a3b8", fontSize:11, fontWeight:600 }}>Somente CLT Offshore</span>
                </label>
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
            <button onClick={printUtil}
              style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"9px 18px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer", alignSelf:"center", whiteSpace:"nowrap" }}>
              🖨 PDF
            </button>
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

      {/* ── ABA: CLASS PLANNING (visão semanal a partir de um dia) ── */}
      {tab === "classplanning" && (() => {
        const fmtBR = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });
        const toMins = t => { const [h,m] = (t||"00:00").split(":").map(Number); return h*60+m; };

        // Resolve a semana Segunda→Domingo que contém o dia selecionado
        const getWeekRange = (dateStr) => {
          const d = new Date(dateStr + "T12:00:00");
          const dow = d.getDay(); // 0=Dom..6=Sab
          const offsetToMon = dow === 0 ? 6 : dow - 1;
          const mon = new Date(d); mon.setDate(d.getDate() - offsetToMon);
          const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
          const fmt = x => x.toISOString().split("T")[0];
          return { weekStart: fmt(mon), weekEnd: fmt(sun) };
        };
        const { weekStart, weekEnd } = getWeekRange(clpDate);

        const allItems = schedules.filter(s => s.date === clpDate);

        // Agrupa por classId (turma é identificada por UUID; nomes podem repetir entre cohortes).
        // Fallback para className em dados legados sem classId.
        const keyOf = s => s.classId || `name:${s.className}`;
        const byClass = {};
        allItems.forEach(s => {
          const k = keyOf(s);
          if (!byClass[k]) byClass[k] = { classId: s.classId, className: s.className, trainingName: s.trainingName, studentCount: "", items: [] };
          if (!byClass[k].studentCount && s.studentCount) byClass[k].studentCount = s.studentCount;
          byClass[k].items.push(s);
        });
        const classes = Object.keys(byClass).sort((a, b) =>
          (byClass[a].className || "").localeCompare(byClass[b].className || "")
        );

        // PERÍODO real da turma: considera todas as datas em schedules (mesmo fora da semana filtrada)
        const allClassDates = {};
        schedules.forEach(s => {
          const k = keyOf(s);
          if (!byClass[k]) return;
          if (!allClassDates[k]) allClassDates[k] = [];
          allClassDates[k].push(s.date);
        });

        // Agrupa por (módulo + local) e acumula instrutores únicos para o período
        const getPeriodGroups = (items, fn) => {
          const seen = {};
          items.filter(fn).forEach(s => {
            const key = (s.module || "") + "|" + (s.local || "");
            if (!seen[key]) seen[key] = { module: s.module || "—", local: s.local || "", instrs: [], minStart: s.startTime, maxEnd: s.endTime };
            const instr = instructors.find(i => String(i.id) === String(s.instructorId));
            const name = instr ? instr.name : s.instructorName;
            const isLeadRole = !["Assistant Instructor","Translator"].includes(s.role);
            if (name && isLeadRole && !seen[key].instrs.includes(name)) seen[key].instrs.push(name);
            if (s.startTime < seen[key].minStart) seen[key].minStart = s.startTime;
            if (s.endTime   > seen[key].maxEnd)   seen[key].maxEnd   = s.endTime;
          });
          return Object.values(seen);
        };

        const fmtH = t => t ? t.split(":")[0] + "H" : "";
        const renderPeriodGroups = (groups) => {
          const validGroups = groups.filter(g => g.local);
          if (!validGroups.length) return <span style={{ color:"#475569", fontSize:15 }}>—</span>;
          return validGroups.map((g, i) => (
            <div key={i} style={{ marginBottom: i < validGroups.length-1 ? 6 : 0 }}>
              <span style={{ color:"#94a3b8", fontSize:11, fontWeight:700 }}>{fmtH(g.minStart)}-{fmtH(g.maxEnd)}</span>
              <span style={{ color:"#e2e8f0", fontSize:14, marginLeft:6 }}>{g.local}</span>
            </div>
          ));
        };

        const printClp = () => {
          const renderGroupsHtml = (groups) => {
            const fmtHp = t => t ? t.split(":")[0] + "H" : "";
            const valid = groups.filter(g => g.local);
            if (!valid.length) return "—";
            return valid.map(g => `<div style="font-size:12px"><span style="color:#888;font-size:10px">${fmtHp(g.minStart)}-${fmtHp(g.maxEnd)}</span> ${g.local}</div>`).join("");
          };
          const rows = classes.map(k => {
            const { className, studentCount, items } = byClass[k];
            const dates = [...new Set(allClassDates[k] || items.map(s => s.date))].sort();
            const manha = getPeriodGroups(items, s => toMins(s.startTime) < 13*60);
            const tarde = getPeriodGroups(items, s => toMins(s.startTime) >= 13*60 && toMins(s.startTime) < 17*60);
            const noite = getPeriodGroups(items, s => toMins(s.startTime) >= 17*60);
            return `<tr>
              <td>${className || "—"}</td>
              <td>${fmtBR(dates[0])}<br><small>até ${fmtBR(dates[dates.length-1])}</small></td>
              <td style="text-align:center;font-weight:700">${studentCount||"—"}</td>
              <td>${renderGroupsHtml(manha)}</td>
              <td>${renderGroupsHtml(tarde)}</td>
              <td>${renderGroupsHtml(noite)}</td>
            </tr>`;
          }).join("");
          const w = window.open("", "_blank");
          if (!w) return;
          w.document.write(`<html><head><title>Class Planning</title><style>
            @page{size:A4 landscape;margin:10mm}
            *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif}
            .ph{background:#01323d;color:#fff;text-align:center;padding:20px 32px}
            .ph h1{font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:4px}
            .ph .sub{color:#ffa619;font-size:12px;font-weight:700}
            .ph .per{color:rgba(255,255,255,0.5);font-size:10px;margin-top:4px}
            table{width:100%;border-collapse:collapse;margin:20px 0;table-layout:fixed}
            col.turma{width:40mm}col.periodo{width:32mm}col.alunos{width:18mm}col.p3{width:56mm}
            th{background:#01323d;color:#fff;padding:8px 10px;border:1px solid #ccc;font-size:12px;text-align:left}
            th.manha{background:#92400e;color:#fde68a}th.tarde{background:#1e3a8a;color:#bfdbfe}th.noite{background:#3b0764;color:#e9d5ff}
            td{padding:7px 10px;border:1px solid #ddd;font-size:12px;vertical-align:top}
            tr:nth-child(even) td{background:#f8f8f8}small{color:#888}
            @media print{button{display:none}}
          </style></head><body>
          <div class="ph"><h1>CLASS PLANNING</h1><div class="sub">${COMPANY_LEGAL_NAME}</div>
          <div class="per">SEMANA: ${fmtBR(weekStart)} → ${fmtBR(weekEnd)} · DIA SELECIONADO: ${fmtBR(clpDate)}</div></div>
          <div style="text-align:center;padding:12px"><button onclick="window.print()" style="padding:7px 20px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Imprimir / PDF</button></div>
          <table><colgroup><col class="turma"><col class="periodo"><col class="alunos"><col class="p3"><col class="p3"><col class="p3"></colgroup><thead><tr>
            <th>TURMA</th><th>PERÍODO</th><th>ALUNOS</th>
            <th class="manha">☀️ MANHÃ</th><th class="tarde">🌤 TARDE</th><th class="noite">🌙 NOITE</th>
          </tr></thead><tbody>${rows}</tbody></table>
          </body></html>`);
          w.document.close();
        };

        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-end", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15, alignSelf:"center" }}>📅 Class Planning</h3>
              <div style={{ display:"flex", gap:10, alignItems:"flex-end", marginLeft:"auto", flexWrap:"wrap" }}>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>DIA</label>
                  <input type="date" value={clpDate} onChange={e => setClpDate(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                  <div style={{ color:"#64748b", fontSize:10, marginTop:4 }}>Semana: {fmtBR(weekStart)} → {fmtBR(weekEnd)}</div>
                </div>
                <button onClick={printClp} style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"8px 18px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>🖨 PDF</button>
              </div>
            </div>

            {classes.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>Nenhuma turma encontrada na semana selecionada.</p>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
                  <thead>
                    <tr style={{ background:"#01323d" }}>
                      <th style={{ padding:"12px 16px", color:"#94a3b8", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:160 }}>TURMA</th>
                      <th style={{ padding:"12px 16px", color:"#94a3b8", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:140 }}>PERÍODO</th>
                      <th style={{ padding:"12px 16px", color:"#94a3b8", fontSize:13, fontWeight:700, textAlign:"center", border:"1px solid #154753", minWidth:80 }}>ALUNOS</th>
                      <th style={{ padding:"12px 16px", color:"#f59e0b", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#f59e0b08" }}>☀️ MANHÃ</th>
                      <th style={{ padding:"12px 16px", color:"#60a5fa", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#3b82f608" }}>🌤 TARDE</th>
                      <th style={{ padding:"12px 16px", color:"#a78bfa", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#8b5cf608" }}>🌙 NOITE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((k, ri) => {
                      const { className, studentCount, items } = byClass[k];
                      const dates = [...new Set(allClassDates[k] || items.map(s => s.date))].sort();
                      const manha = getPeriodGroups(items, s => toMins(s.startTime) < 13*60);
                      const tarde = getPeriodGroups(items, s => toMins(s.startTime) >= 13*60 && toMins(s.startTime) < 17*60);
                      const noite = getPeriodGroups(items, s => toMins(s.startTime) >= 17*60);
                      return (
                        <tr key={k} style={{ background: ri%2===0 ? "#073d4a" : "#063540" }}>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", color:"#fff", fontWeight:700, fontSize:16 }}>{className || "—"}</td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753" }}>
                            <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{fmtBR(dates[0])}</div>
                            <div style={{ color:"#64748b", fontSize:12 }}>até {fmtBR(dates[dates.length-1])}</div>
                          </td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", textAlign:"center", color: studentCount ? "#ffa619" : "#475569", fontWeight: studentCount ? 700 : 400, fontSize:16 }}>
                            {studentCount || "—"}
                          </td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>
                            {renderPeriodGroups(manha, "#f59e0b")}
                          </td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>
                            {renderPeriodGroups(tarde, "#60a5fa")}
                          </td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>
                            {renderPeriodGroups(noite, "#a78bfa")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ABA: INSTRUCTOR PLANNING (visão semanal de instrutor por turma) ── */}
      {tab === "instructorplanning" && (() => {
        const fmtBR = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });
        const toMins = t => { const [h,m] = (t||"00:00").split(":").map(Number); return h*60+m; };

        const getWeekRange = (dateStr) => {
          const d = new Date(dateStr + "T12:00:00");
          const dow = d.getDay();
          const offsetToMon = dow === 0 ? 6 : dow - 1;
          const mon = new Date(d); mon.setDate(d.getDate() - offsetToMon);
          const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
          const fmt = x => x.toISOString().split("T")[0];
          return { weekStart: fmt(mon), weekEnd: fmt(sun) };
        };
        const { weekStart, weekEnd } = getWeekRange(ipDate);

        const allItems = schedules.filter(s => s.date === ipDate);
        const keyOf = s => s.classId || `name:${s.className}`;
        const byClass = {};
        allItems.forEach(s => {
          const k = keyOf(s);
          if (!byClass[k]) byClass[k] = { className: s.className, items: [] };
          byClass[k].items.push(s);
        });
        const classes = Object.keys(byClass).sort((a, b) =>
          (byClass[a].className || "").localeCompare(byClass[b].className || "")
        );

        const getIPGroups = (items, fn) => {
          const seen = {};
          items.filter(fn).forEach(s => {
            const key = s.module || "";
            if (!seen[key]) seen[key] = { module: s.module || "—", lead: null, minStart: s.startTime, maxEnd: s.endTime };
            if (s.role === "Lead Instructor") {
              const instr = instructors.find(i => String(i.id) === String(s.instructorId));
              seen[key].lead = instr ? instr.name : (s.instructorName || null);
            }
            if (s.startTime < seen[key].minStart) seen[key].minStart = s.startTime;
            if (s.endTime   > seen[key].maxEnd)   seen[key].maxEnd   = s.endTime;
          });
          return Object.values(seen);
        };

        const fmtH = t => t ? t.split(":")[0] + "H" : "";

        const renderIPGroups = (groups) => {
          if (!groups.length) return <span style={{ color:"#475569", fontSize:15 }}>—</span>;
          return groups.map((g, i) => (
            <div key={i} style={{ marginBottom: i < groups.length-1 ? 8 : 0, paddingBottom: i < groups.length-1 ? 8 : 0, borderBottom: i < groups.length-1 ? "1px solid #154753" : "none" }}>
              <div style={{ color:"#94a3b8", fontSize:11, fontWeight:700, marginBottom:2 }}>{fmtH(g.minStart)}–{fmtH(g.maxEnd)}</div>
              <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600, marginBottom:2 }}>{g.module}</div>
              <div style={{ color:"#ffa619", fontSize:12 }}>{g.lead || <span style={{ color:"#475569", fontStyle:"italic" }}>—</span>}</div>
            </div>
          ));
        };

        const printIP = () => {
          const renderIPHtml = (groups) => {
            if (!groups.length) return "—";
            return groups.map((g, i) => `<div style="margin-bottom:${i < groups.length-1 ? 8 : 0}px;padding-bottom:${i < groups.length-1 ? 8 : 0}px;border-bottom:${i < groups.length-1 ? "1px solid #eee" : "none"}">
              <div style="color:#888;font-size:10px;font-weight:700">${fmtH(g.minStart)}–${fmtH(g.maxEnd)}</div>
              <div style="font-size:12px;font-weight:600">${g.module}</div>
              <div style="color:#b45309;font-size:11px">${g.lead || "—"}</div>
            </div>`).join("");
          };
          const rows = classes.map(k => {
            const { className, items } = byClass[k];
            const manha = getIPGroups(items, s => toMins(s.startTime) < 13*60);
            const tarde = getIPGroups(items, s => toMins(s.startTime) >= 13*60 && toMins(s.startTime) < 17*60);
            const noite = getIPGroups(items, s => toMins(s.startTime) >= 17*60);
            return `<tr>
              <td>${className || "—"}</td>
              <td>${renderIPHtml(manha)}</td>
              <td>${renderIPHtml(tarde)}</td>
              <td>${renderIPHtml(noite)}</td>
            </tr>`;
          }).join("");
          const w = window.open("", "_blank");
          if (!w) return;
          w.document.write(`<html><head><title>Instructor Planning</title><style>
            @page{size:A4 landscape;margin:10mm}
            *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif}
            .ph{background:#01323d;color:#fff;text-align:center;padding:20px 32px}
            .ph h1{font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:4px}
            .ph .sub{color:#ffa619;font-size:12px;font-weight:700}
            .ph .per{color:rgba(255,255,255,0.5);font-size:10px;margin-top:4px}
            table{width:100%;border-collapse:collapse;margin:20px 0;table-layout:fixed}
            col.turma{width:44mm}col.p3{width:75mm}
            th{background:#01323d;color:#fff;padding:8px 10px;border:1px solid #ccc;font-size:12px;text-align:left}
            th.manha{background:#92400e;color:#fde68a}th.tarde{background:#1e3a8a;color:#bfdbfe}th.noite{background:#3b0764;color:#e9d5ff}
            td{padding:7px 10px;border:1px solid #ddd;font-size:12px;vertical-align:top}
            tr:nth-child(even) td{background:#f8f8f8}
            @media print{button{display:none}}
          </style></head><body>
          <div class="ph"><h1>INSTRUCTOR PLANNING</h1><div class="sub">${COMPANY_LEGAL_NAME}</div>
          <div class="per">SEMANA: ${fmtBR(weekStart)} → ${fmtBR(weekEnd)} · DIA SELECIONADO: ${fmtBR(ipDate)}</div></div>
          <div style="text-align:center;padding:12px"><button onclick="window.print()" style="padding:7px 20px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Imprimir / PDF</button></div>
          <table><colgroup><col class="turma"><col class="p3"><col class="p3"><col class="p3"></colgroup>
          <thead><tr>
            <th>TURMA</th>
            <th class="manha">☀️ MANHÃ</th><th class="tarde">🌤 TARDE</th><th class="noite">🌙 NOITE</th>
          </tr></thead><tbody>${rows}</tbody></table>
          </body></html>`);
          w.document.close();
        };

        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-end", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15, alignSelf:"center" }}>👨‍🏫 Instructor Planning</h3>
              <div style={{ display:"flex", gap:10, alignItems:"flex-end", marginLeft:"auto", flexWrap:"wrap" }}>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>DIA</label>
                  <input type="date" value={ipDate} onChange={e => setIpDate(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                  <div style={{ color:"#64748b", fontSize:10, marginTop:4 }}>Semana: {fmtBR(weekStart)} → {fmtBR(weekEnd)}</div>
                </div>
                <button onClick={printIP} style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"8px 18px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>🖨 PDF</button>
              </div>
            </div>

            {classes.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>Nenhuma turma encontrada no dia selecionado.</p>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth:800 }}>
                  <thead>
                    <tr style={{ background:"#01323d" }}>
                      <th style={{ padding:"12px 16px", color:"#94a3b8", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:160 }}>TURMA</th>
                      <th style={{ padding:"12px 16px", color:"#f59e0b", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#f59e0b08" }}>☀️ MANHÃ</th>
                      <th style={{ padding:"12px 16px", color:"#60a5fa", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#3b82f608" }}>🌤 TARDE</th>
                      <th style={{ padding:"12px 16px", color:"#a78bfa", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#8b5cf608" }}>🌙 NOITE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((k, ri) => {
                      const { className, items } = byClass[k];
                      const manha = getIPGroups(items, s => toMins(s.startTime) < 13*60);
                      const tarde = getIPGroups(items, s => toMins(s.startTime) >= 13*60 && toMins(s.startTime) < 17*60);
                      const noite = getIPGroups(items, s => toMins(s.startTime) >= 17*60);
                      return (
                        <tr key={k} style={{ background: ri%2===0 ? "#073d4a" : "#063540" }}>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", color:"#fff", fontWeight:700, fontSize:15, verticalAlign:"top" }}>{className || "—"}</td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>{renderIPGroups(manha)}</td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>{renderIPGroups(tarde)}</td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>{renderIPGroups(noite)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ABA: PLANO INDIVIDUAL ── */}
      {tab === "salas" && (() => {
        const trainingOpts = [...new Set(schedules.map(s => s.trainingName).filter(Boolean))].sort();
        const fmtBR = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });

        const getInstrName = s => {
          if (s.instructorName) return s.instructorName;
          const i = instructors.find(x => String(x.id) === String(s.instructorId));
          return i ? i.name : null;
        };

        const allItems = schedules.filter(s =>
          s.date >= cpFrom && s.date <= cpTo &&
          (!cpTraining || s.trainingName === cpTraining)
        );

        const byClass = {};
        allItems.forEach(s => {
          if (!byClass[s.className]) byClass[s.className] = { trainingName: s.trainingName, entries: {} };
          const key = `${s.module}|${s.date}|${s.startTime}|${s.endTime}|${s.local||""}`;
          if (!byClass[s.className].entries[key]) byClass[s.className].entries[key] = { ...s, instrNames: [] };
          const n = getInstrName(s);
          if (n && !byClass[s.className].entries[key].instrNames.includes(n))
            byClass[s.className].entries[key].instrNames.push(n);
        });
        const classes = Object.keys(byClass).sort();

        const classDates = cls => {
          const ds = Object.values(byClass[cls].entries).map(e => e.date).sort();
          return { start: ds[0], end: ds[ds.length-1] };
        };

        const printCP = () => {
          const fmtD = d => fmtBR(d);
          let html = `<html><head><title>Class Planning</title><style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial,sans-serif;background:#fff}
            .ph{background:#01323d;color:#fff;text-align:center;padding:22px 32px 18px}
            .ph h1{font-size:17px;font-weight:800;letter-spacing:1px;margin-bottom:5px}
            .ph .sub{color:#ffa619;font-size:12px;font-weight:700;letter-spacing:1px}
            .ph .per{color:rgba(255,255,255,0.5);font-size:10px;margin-top:5px;letter-spacing:.5px}
            .cb{margin:20px 24px}
            .ch{display:flex;border:1px solid #ccc;border-bottom:none}
            .cn{padding:10px 16px;font-weight:800;font-size:13px;border-right:1px solid #ccc;min-width:130px}
            .cm{display:flex;flex:1}
            .cm span{padding:10px 16px;font-size:11px;border-right:1px solid #ccc}
            .cm span:last-child{border-right:none}
            .lbl{color:#888;font-size:10px;display:block}
            table{width:100%;border-collapse:collapse;border:1px solid #ccc}
            thead tr{background:#f5f5f5}
            th{padding:7px 12px;text-align:left;font-size:10px;color:#666;font-weight:700;border:1px solid #ddd;text-transform:uppercase}
            td{padding:6px 12px;font-size:11px;border:1px solid #ddd;vertical-align:top;color:#333}
            tr:nth-child(even) td{background:#fafafa}
            .pf{margin-top:28px;background:#01323d;color:rgba(255,255,255,0.45);text-align:center;padding:12px;font-size:9px;letter-spacing:1px}
            @media print{button{display:none}.cb{page-break-inside:avoid}}
          </style></head><body>`;
          html += `<div class="ph"><h1>PROGRAMAÇÃO SEMANAL DE CURSOS E TREINAMENTOS</h1><div class="sub">${COMPANY_LEGAL_NAME}</div><div class="per">PROGRAMAÇÃO SEMANAL DE CURSOS E TREINAMENTOS &nbsp;|&nbsp; PERÍODO: ${fmtD(cpFrom)} - ${fmtD(cpTo)}</div></div>`;
          html += `<div style="text-align:center;padding:16px 0"><button onclick="window.print()" style="padding:8px 24px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨 Imprimir / Salvar PDF</button></div>`;
          classes.forEach(cls => {
            const { start, end } = classDates(cls);
            const rows = Object.values(byClass[cls].entries).sort((a,b) => a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
            html += `<div class="cb"><div class="ch"><div class="cn">${cls}</div><div class="cm"><span><span class="lbl">INÍCIO</span>${fmtD(start)}</span><span><span class="lbl">TÉRMINO</span>${fmtD(end)}</span></div></div>`;
            html += `<table><thead><tr><th>Name</th><th>PlanDate</th><th>Start</th><th>End</th><th>Local</th><th>Instructors</th></tr></thead><tbody>`;
            rows.forEach(r => {
              html += `<tr><td>${r.module||"—"}</td><td>${fmtD(r.date)}</td><td>${r.startTime||"—"}</td><td>${r.endTime||"—"}</td><td>${r.local||"—"}</td><td>${r.instrNames.join("<br>")||"—"}</td></tr>`;
            });
            html += `</tbody></table></div>`;
          });
          html += `<div class="pf">PROGRAMAÇÃO SEMANAL DE CURSOS E TREINAMENTOS &nbsp;|&nbsp; PERÍODO: ${fmtD(cpFrom)} - ${fmtD(cpTo)}</div><div style="text-align:center;padding:10px 24px 14px;font-size:8px;color:#666;letter-spacing:0.5px;margin-top:4px;font-style:italic">SUJEITO A ALTERAÇÃO SEM COMUNICAÇÃO PRÉVIA — PORTANTO VENHA PREPARADO PARA AS PRÁTICAS TODOS OS DIAS!</div></body></html>`;
          const w = window.open("", "_blank");
          w.document.write(html);
          w.document.close();
        };

        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-end", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15, alignSelf:"center" }}>📋 Plano Individual</h3>
              <div style={{ display:"flex", alignItems:"flex-end", gap:10, marginLeft:"auto", flexWrap:"wrap" }}>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>DE</label>
                  <input type="date" value={cpFrom} onChange={e => setCpFrom(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                </div>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>ATÉ</label>
                  <input type="date" value={cpTo} onChange={e => setCpTo(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                </div>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>TREINAMENTO</label>
                  <select value={cpTraining} onChange={e => setCpTraining(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none", minWidth:160 }}>
                    <option value="">Todos</option>
                    {trainingOpts.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button onClick={printCP} style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"8px 18px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>🖨 PDF</button>
              </div>
            </div>

            {classes.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>Nenhuma turma encontrada para o período selecionado.</p>
            ) : classes.map(cls => {
              const entry = byClass[cls];
              const rows = Object.values(entry.entries).sort((a,b) => a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
              const { start, end } = classDates(cls);
              return (
                <div key={cls} style={{ marginBottom:20, background:"#01323d", borderRadius:12, border:"1px solid #154753", overflow:"hidden" }}>
                  {/* Cabeçalho da turma */}
                  <div style={{ display:"flex", flexWrap:"wrap", alignItems:"stretch", borderBottom:"1px solid #154753" }}>
                    <div style={{ padding:"12px 20px", borderRight:"1px solid #154753", display:"flex", alignItems:"center", minWidth:140 }}>
                      <span style={{ color:"#fff", fontWeight:800, fontSize:15 }}>{cls}</span>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", flex:1 }}>
                      <div style={{ padding:"8px 20px", borderRight:"1px solid #154753" }}>
                        <div style={{ color:"#64748b", fontSize:10, fontWeight:700, marginBottom:2 }}>INÍCIO</div>
                        <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{fmtBR(start)}</div>
                      </div>
                      <div style={{ padding:"8px 20px", borderRight:"1px solid #154753" }}>
                        <div style={{ color:"#64748b", fontSize:10, fontWeight:700, marginBottom:2 }}>TÉRMINO</div>
                        <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{fmtBR(end)}</div>
                      </div>
                      <div style={{ padding:"8px 20px", color:"#64748b", fontSize:12, marginLeft:"auto" }}>{entry.trainingName || ""}</div>
                    </div>
                  </div>
                  {/* Tabela de módulos */}
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", minWidth:680 }}>
                      <thead>
                        <tr style={{ background:"#073d4a" }}>
                          {["Name","PlanDate","Start","End","Local","Instructors"].map((h,i) => (
                            <th key={h} style={{ padding:"8px 14px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:[200,100,70,70,120,200][i] }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, ri) => (
                          <tr key={ri} style={{ background: ri%2===0 ? "#01323d" : "#02293a" }}>
                            <td style={{ padding:"8px 14px", color:"#e2e8f0", fontSize:12, border:"1px solid #154753" }}>{r.module||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#94a3b8", fontSize:12, border:"1px solid #154753" }}>{fmtBR(r.date)}</td>
                            <td style={{ padding:"8px 14px", color:"#f59e0b", fontSize:12, fontWeight:600, border:"1px solid #154753" }}>{r.startTime||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#f59e0b", fontSize:12, fontWeight:600, border:"1px solid #154753" }}>{r.endTime||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#94a3b8", fontSize:12, border:"1px solid #154753" }}>{r.local||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#e2e8f0", fontSize:12, border:"1px solid #154753", lineHeight:1.6 }}>
                              {r.instrNames.length > 0 ? r.instrNames.map((n,ni) => <div key={ni}>{n}</div>) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
          // Horas trabalhadas em feriado (regional ou nacional) — separadas para futura bonificação
          const holidayMins = items.filter(s => isHoliday(s.date, instr, holidays || []))
            .reduce((acc, s) => acc + Math.max(0, toMinsH(s.endTime) - toMinsH(s.startTime)), 0);
          const trainings2 = [...new Set(items.map(s => s.trainingName).filter(Boolean))];
          return { ...instr, totalMins, teoriaMins, praticaMins, outrasMins, holidayMins, items, trainings2 };
        }).filter(i => i.totalMins > 0).sort((a,b) => b.totalMins - a.totalMins);
        const maxMins = Math.max(...byInstr.map(i => i.totalMins), 1);
        const fmtMonthLabel = () => { const [y,m] = horasMonth.split("-").map(Number); return new Date(y, m-1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); };
        const printHoras = () => {
          const rowsHtml = byInstr.map(i =>
            "<tr><td style='padding:6px 12px;border:1px solid #ddd'>" + i.name + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;text-align:center'>" + fmtHM(i.totalMins) + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;text-align:center'>" + fmtHM(i.teoriaMins) + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;text-align:center'>" + fmtHM(i.praticaMins) + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;text-align:center;color:" + (i.holidayMins > 0 ? "#06b6d4" : "#999") + ";font-weight:" + (i.holidayMins > 0 ? "700" : "400") + "'>" + (i.holidayMins > 0 ? fmtHM(i.holidayMins) : "—") + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;font-size:11px;color:#555'>" + i.trainings2.join(", ") + "</td></tr>"
          ).join("");
          const totalGeral = byInstr.reduce((a,i) => a + i.totalMins, 0);
          const totalFeriado = byInstr.reduce((a,i) => a + i.holidayMins, 0);
          const w = window.open("", "_blank");
          w.document.write("<html><head><title>Horas por Instrutor – " + fmtMonthLabel() + "</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{background:#01323d;color:#fff;padding:8px 12px;border:1px solid #ccc}@media print{button{display:none}}</style></head><body>");
          w.document.write("<h2 style='margin:0 0 4px'>Relatório de Horas por Instrutor</h2>");
          w.document.write("<p style='color:#555;margin:0 0 6px'>" + fmtMonthLabel().toUpperCase() + " &nbsp;·&nbsp; Total geral: " + fmtHM(totalGeral) + " em " + byInstr.length + " instrutor(es)</p>");
          if (totalFeriado > 0) w.document.write("<p style='color:#06b6d4;margin:0 0 16px;font-weight:700'>🏖 Horas em feriado: " + fmtHM(totalFeriado) + " — sujeitas a bonificação</p>");
          w.document.write("<button onclick='window.print()' style='margin-bottom:16px;padding:8px 18px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer'>🖨 Imprimir / PDF</button>");
          w.document.write("<table><thead><tr><th>Instrutor</th><th>Total</th><th>Teoria</th><th>Prática</th><th>🏖 Feriado</th><th>Treinamentos</th></tr></thead><tbody>" + rowsHtml + "</tbody></table>");
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
                  {byInstr.reduce((a,i)=>a+i.holidayMins,0) > 0 && (
                    <div title="Horas trabalhadas em feriado — sujeitas a bonificação">
                      <span style={{ color:"#06b6d4", fontWeight:700, fontSize:15 }}>🏖 {fmtHM(byInstr.reduce((a,i)=>a+i.holidayMins,0))}</span>
                      <span style={{ color:"#64748b", fontSize:12 }}> em feriado</span>
                    </div>
                  )}
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
                          {instr.holidayMins > 0 && <span title="Horas em feriado — sujeitas a bonificação" style={{ color:"#06b6d4", fontSize:11, fontWeight:700 }}>🏖 {fmtHM(instr.holidayMins)}</span>}
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

      {/* ── ABA: MARINHA ── */}
      {tab === "marinha" && (() => {
        const toMins = t => { const [h,m] = (t||"00:00").split(":").map(Number); return h*60+m; };
        const fmtBR = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });

        const getWeekBounds = (offset) => {
          const now = new Date();
          const day = now.getDay(); // 0=Dom … 6=Sáb
          const diff = day === 0 ? -6 : 1 - day; // dias até segunda
          const pad = n => String(n).padStart(2, "0");
          const toISO = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
          const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff + offset * 7);
          const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
          return { start: toISO(mon), end: toISO(sun) };
        };
        const getISOWeek = (dateStr) => {
          const d = new Date(dateStr + "T12:00:00");
          d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
          const yearStart = new Date(d.getFullYear(), 0, 4);
          return 1 + Math.round(((d - yearStart) / 86400000 - 3 + (yearStart.getDay() + 6) % 7) / 7);
        };
        const { start: marinhaFrom, end: marinhaTo } = getWeekBounds(marinhaWeekOffset);
        const semanaNum = getISOWeek(marinhaFrom);

        const marinhaTrainingIds = new Set(
          trainings.filter(t => {
            const areaName = (areas || []).find(a => a.id === t.area)?.name || "";
            return /marinha/i.test(areaName) || /marinha/i.test(t.name || "");
          }).map(t => String(t.id))
        );

        const getInstrName = s => {
          if (s.instructorName) return s.instructorName;
          const i = instructors.find(x => String(x.id) === String(s.instructorId));
          return i ? i.name : null;
        };

        const allMarinhaItems = schedules.filter(s => marinhaTrainingIds.has(String(s.trainingId)));

        // Turmas cujo PRIMEIRO dia cai dentro da semana selecionada
        const classFirstDate = {};
        allMarinhaItems.forEach(s => {
          if (!classFirstDate[s.className] || s.date < classFirstDate[s.className])
            classFirstDate[s.className] = s.date;
        });
        const startingClasses = new Set(
          Object.entries(classFirstDate)
            .filter(([, d]) => d >= marinhaFrom && d <= marinhaTo)
            .map(([cls]) => cls)
        );
        // Mostra TODOS os itens dessas turmas (visão completa do curso)
        const weekItems = allMarinhaItems.filter(s => startingClasses.has(s.className));

        const byClass = {};
        weekItems.forEach(s => {
          if (!byClass[s.className]) byClass[s.className] = { trainingName: s.trainingName, studentCount: "", entries: {} };
          if (!byClass[s.className].studentCount && s.studentCount) byClass[s.className].studentCount = s.studentCount;
          const key = `${s.module}|${s.date}|${s.startTime}|${s.endTime}|${s.local||""}`;
          if (!byClass[s.className].entries[key]) byClass[s.className].entries[key] = { ...s, instrNames: [] };
          const n = getInstrName(s);
          if (n && !byClass[s.className].entries[key].instrNames.includes(n))
            byClass[s.className].entries[key].instrNames.push(n);
        });
        const classes = Object.keys(byClass).sort();

        const allClassDates = {};
        allMarinhaItems.forEach(s => {
          if (!allClassDates[s.className]) allClassDates[s.className] = [];
          allClassDates[s.className].push(s.date);
        });
        const classDates = cls => {
          const ds = [...new Set(allClassDates[cls] || [])].sort();
          return { start: ds[0], end: ds[ds.length - 1] };
        };

        const printMarinha = () => {
          const fmtD = d => fmtBR(d);
          let html = `<html><head><title>MARINHA</title><style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial,sans-serif;background:#fff}
            .ph{background:#01323d;color:#fff;text-align:center;padding:22px 32px 18px}
            .ph h1{font-size:17px;font-weight:800;letter-spacing:1px;margin-bottom:5px}
            .ph .sub{color:#ffa619;font-size:12px;font-weight:700;letter-spacing:1px}
            .ph .per{color:rgba(255,255,255,0.5);font-size:10px;margin-top:5px;letter-spacing:.5px}
            .cb{margin:20px 24px}
            .ch{display:flex;border:1px solid #ccc;border-bottom:none;background:#e8f0f5}
            .cn{padding:10px 16px;font-weight:800;font-size:13px;border-right:1px solid #ccc;min-width:130px}
            .cm{display:flex;flex:1}
            .cm span{padding:10px 16px;font-size:11px;border-right:1px solid #ccc}
            .cm span:last-child{border-right:none}
            .lbl{color:#888;font-size:10px;display:block}
            table{width:100%;border-collapse:collapse;border:1px solid #ccc}
            thead tr{background:#f5f5f5}
            th{padding:7px 12px;text-align:left;font-size:10px;color:#666;font-weight:700;border:1px solid #ddd;text-transform:uppercase}
            td{padding:6px 12px;font-size:11px;border:1px solid #ddd;vertical-align:top;color:#333}
            tr:nth-child(even) td{background:#fafafa}
            .pf{margin-top:28px;background:#01323d;color:rgba(255,255,255,0.45);text-align:center;padding:12px;font-size:9px;letter-spacing:1px}
            @media print{button{display:none}.cb{page-break-inside:avoid}}
          </style></head><body>`;
          html += `<div class="ph"><h1>PROGRAMAÇÃO SEMANAL DE CURSOS E TREINAMENTOS</h1><div class="sub">${COMPANY_LEGAL_NAME}</div><div class="per">PERÍODO: ${fmtD(marinhaFrom)} - ${fmtD(marinhaTo)} (Semana ${semanaNum})</div></div>`;
          html += `<div style="text-align:center;padding:16px 0"><button onclick="window.print()" style="padding:8px 24px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨 Imprimir / Salvar PDF</button></div>`;
          classes.forEach(cls => {
            const { start, end } = classDates(cls);
            const sc = byClass[cls].studentCount;
            const rows = Object.values(byClass[cls].entries).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
            html += `<div class="cb"><div class="ch"><div class="cn">${cls}</div><div class="cm">`;
            html += `<span><span class="lbl">INÍCIO</span>${start ? fmtD(start) : "—"}</span>`;
            html += `<span><span class="lbl">TÉRMINO</span>${end ? fmtD(end) : "—"}</span>`;
            if (sc) html += `<span><span class="lbl">N ALUNOS</span>${sc}</span>`;
            html += `</div></div>`;
            html += `<table><thead><tr><th>Name</th><th>PlanDate</th><th>Start</th><th>End</th><th>Local</th><th>Instructors</th></tr></thead><tbody>`;
            rows.forEach(r => {
              html += `<tr><td>${r.module||"—"}</td><td>${fmtD(r.date)}</td><td>${r.startTime||"—"}</td><td>${r.endTime||"—"}</td><td>${r.local||"—"}</td><td>${r.instrNames.join("<br>")||"—"}</td></tr>`;
            });
            html += `</tbody></table></div>`;
          });
          html += `<div class="pf">PROGRAMAÇÃO SEMANAL DE CURSOS E TREINAMENTOS &nbsp;|&nbsp; PERÍODO: ${fmtD(marinhaFrom)} - ${fmtD(marinhaTo)} (Semana ${semanaNum})</div></body></html>`;
          const w = window.open("", "_blank");
          if (!w) return;
          w.document.write(html);
          w.document.close();
        };

        const navBtn = (dir, label) => (
          <button onClick={() => setMarinhaWeekOffset(o => o + dir)}
            style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:8, padding:"7px 14px", color:"#e2e8f0", fontSize:18, cursor:"pointer", lineHeight:1 }}>
            {label}
          </button>
        );

        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-end", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15, alignSelf:"center" }}>⚓ MARINHA</h3>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto", flexWrap:"wrap" }}>
                {navBtn(-1, "◀")}
                <span style={{ color:"#e2e8f0", fontSize:13, fontWeight:600, minWidth:260, textAlign:"center" }}>
                  {fmtBR(marinhaFrom)} – {fmtBR(marinhaTo)}
                  <span style={{ color:"#64748b", fontWeight:400, fontSize:12 }}> (Semana {semanaNum})</span>
                </span>
                {navBtn(1, "▶")}
                {marinhaWeekOffset !== 0 && (
                  <button onClick={() => setMarinhaWeekOffset(0)}
                    style={{ background:"#154753", border:"1px solid #1e6a7a", borderRadius:8, padding:"7px 14px", color:"#ffa619", fontSize:12, cursor:"pointer" }}>
                    Semana Atual
                  </button>
                )}
                <button onClick={printMarinha}
                  style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"8px 18px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  🖨 PDF
                </button>
              </div>
            </div>

            {classes.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>Nenhuma turma da área MARINHA nesta semana.</p>
            ) : classes.map(cls => {
              const entry = byClass[cls];
              const rows = Object.values(entry.entries).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
              const { start, end } = classDates(cls);
              return (
                <div key={cls} style={{ marginBottom:20, background:"#01323d", borderRadius:12, border:"1px solid #154753", overflow:"hidden" }}>
                  <div style={{ display:"flex", flexWrap:"wrap", alignItems:"stretch", borderBottom:"1px solid #154753" }}>
                    <div style={{ padding:"12px 20px", borderRight:"1px solid #154753", display:"flex", alignItems:"center", minWidth:140 }}>
                      <span style={{ color:"#fff", fontWeight:800, fontSize:15 }}>{cls}</span>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", flex:1 }}>
                      <div style={{ padding:"8px 20px", borderRight:"1px solid #154753" }}>
                        <div style={{ color:"#64748b", fontSize:10, fontWeight:700, marginBottom:2 }}>INÍCIO</div>
                        <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{start ? fmtBR(start) : "—"}</div>
                      </div>
                      <div style={{ padding:"8px 20px", borderRight:"1px solid #154753" }}>
                        <div style={{ color:"#64748b", fontSize:10, fontWeight:700, marginBottom:2 }}>TÉRMINO</div>
                        <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{end ? fmtBR(end) : "—"}</div>
                      </div>
                      {entry.studentCount && (
                        <div style={{ padding:"8px 20px", borderRight:"1px solid #154753" }}>
                          <div style={{ color:"#64748b", fontSize:10, fontWeight:700, marginBottom:2 }}>N ALUNOS</div>
                          <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{entry.studentCount}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", minWidth:680 }}>
                      <thead>
                        <tr style={{ background:"#073d4a" }}>
                          {["Name","PlanDate","Start","End","Local","Instructors"].map((h, i) => (
                            <th key={h} style={{ padding:"8px 14px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:[200,100,70,70,120,200][i] }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, ri) => (
                          <tr key={ri} style={{ background: ri%2===0 ? "#01323d" : "#02293a" }}>
                            <td style={{ padding:"8px 14px", color:"#e2e8f0", fontSize:12, border:"1px solid #154753" }}>{r.module||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#94a3b8", fontSize:12, border:"1px solid #154753" }}>{fmtBR(r.date)}</td>
                            <td style={{ padding:"8px 14px", color:"#f59e0b", fontSize:12, fontWeight:600, border:"1px solid #154753" }}>{r.startTime||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#f59e0b", fontSize:12, fontWeight:600, border:"1px solid #154753" }}>{r.endTime||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#94a3b8", fontSize:12, border:"1px solid #154753" }}>{r.local||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#e2e8f0", fontSize:12, border:"1px solid #154753", lineHeight:1.6 }}>
                              {r.instrNames.length > 0 ? r.instrNames.map((n, ni) => <div key={ni}>{n}</div>) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── ABA: FTE* ── */}
      {tab === "fte" && (() => {
        const toMins = t => { const [h,m] = (t||"00:00").split(":").map(Number); return h*60+m; };
        const fmtBR = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });

        const freelancers = instructors.filter(i => i.contract === "Freelancer");

        const manhaFn = s => toMins(s.startTime) < 13 * 60;
        const tardeFn = s => toMins(s.startTime) >= 13 * 60 && toMins(s.startTime) < 17 * 60;
        const noiteFn = s => toMins(s.startTime) >= 17 * 60;

        const getShiftData = (instrId, shiftFn) => {
          const items = schedules.filter(s => s.date === fteDate && String(s.instructorId) === String(instrId) && shiftFn(s));
          const seen = new Set();
          const labels = [];
          const areas = new Set();
          items.forEach(s => {
            if (!seen.has(s.className)) {
              seen.add(s.className);
              labels.push(s.role === "Translator" ? `Tradutor · ${s.className}` : `${s.trainingName} · ${s.className}`);
            }
            const t = trainings.find(tr => String(tr.id) === String(s.trainingId));
            if (t?.area) areas.add(t.area);
          });
          return { labels, areas: [...areas], active: items.length > 0 };
        };

        const rows = freelancers.map(instr => {
          const manha = getShiftData(instr.id, manhaFn);
          const tarde = getShiftData(instr.id, tardeFn);
          const noite = getShiftData(instr.id, noiteFn);
          const fte = (manha.active ? 0.5 : 0) + (tarde.active ? 0.5 : 0) + (noite.active ? 0.5 : 0);
          return { ...instr, manha, tarde, noite, fte };
        }).filter(r => r.fte > 0).sort((a, b) => b.fte - a.fte || a.name.localeCompare(b.name));

        const areaSummary = {};
        rows.forEach(r => {
          if (r.manha.active) { const a = r.manha.areas[0] || "—"; areaSummary[a] = (areaSummary[a] || 0) + 0.5; }
          if (r.tarde.active) { const a = r.tarde.areas[0] || "—"; areaSummary[a] = (areaSummary[a] || 0) + 0.5; }
          if (r.noite.active) { const a = r.noite.areas[0] || "—"; areaSummary[a] = (areaSummary[a] || 0) + 0.5; }
        });
        const totalFte = rows.reduce((s, r) => s + r.fte, 0);

        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            {/* Controles */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-end", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15, alignSelf:"center" }}>👥 FTE*</h3>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginLeft:"auto", flexWrap:"wrap" }}>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>DATA</label>
                  <input type="date" value={fteDate} onChange={e => setFteDate(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                </div>
                <div style={{ padding:"10px 16px", background:"#01323d", borderRadius:10, border:"1px solid #154753", alignSelf:"flex-end" }}>
                  <span style={{ color:"#64748b", fontSize:12 }}>Total FTE: </span>
                  <span style={{ color:"#ffa619", fontSize:16, fontWeight:800 }}>{totalFte.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* Resumo por área */}
            {Object.keys(areaSummary).length > 0 && (
              <div style={{ background:"#01323d", borderRadius:12, padding:"16px 20px", marginBottom:20, border:"1px solid #154753" }}>
                <div style={{ color:"#94a3b8", fontSize:11, fontWeight:700, marginBottom:10, letterSpacing:1 }}>RESUMO POR ÁREA</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {Object.entries(areaSummary).sort((a, b) => b[1] - a[1]).map(([area, fte]) => (
                    <div key={area} style={{ background:"#073d4a", borderRadius:8, padding:"8px 16px", border:"1px solid #154753", display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ color:"#94a3b8", fontSize:12 }}>{area}</span>
                      <span style={{ color:"#ffa619", fontSize:16, fontWeight:800 }}>{fte.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabela */}
            {rows.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>
                {freelancers.length === 0
                  ? "Nenhum instrutor com contrato Freelancer cadastrado."
                  : "Nenhum freelancer com programação nesta data."}
              </p>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth:600 }}>
                  <thead>
                    <tr style={{ background:"#01323d" }}>
                      <th style={{ padding:"10px 16px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753" }}>INSTRUTOR</th>
                      <th style={{ padding:"10px 16px", color:"#f59e0b", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753", background:"#92400e18" }}>☀️ MANHÃ</th>
                      <th style={{ padding:"10px 16px", color:"#3b82f6", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753", background:"#1e3a8a18" }}>🌤 TARDE</th>
                      <th style={{ padding:"10px 16px", color:"#8b5cf6", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753", background:"#3b076418" }}>🌙 NOITE</th>
                      <th style={{ padding:"10px 16px", color:"#ffa619", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753" }}>FTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => (
                      <tr key={r.id} style={{ background: ri%2===0 ? "#01323d" : "#02293a" }}>
                        <td style={{ padding:"10px 16px", color:"#e2e8f0", fontSize:13, fontWeight:600, border:"1px solid #154753" }}>{r.name}</td>
                        <td style={{ padding:"10px 16px", color: r.manha.active ? "#f59e0b" : "#334155", fontSize:12, textAlign:"left", border:"1px solid #154753" }}>
                          {r.manha.labels.length > 0 ? r.manha.labels.map((l, li) => <div key={li} style={{lineHeight:1.6}}>{l}</div>) : "—"}
                        </td>
                        <td style={{ padding:"10px 16px", color: r.tarde.active ? "#3b82f6" : "#334155", fontSize:12, textAlign:"left", border:"1px solid #154753" }}>
                          {r.tarde.labels.length > 0 ? r.tarde.labels.map((l, li) => <div key={li} style={{lineHeight:1.6}}>{l}</div>) : "—"}
                        </td>
                        <td style={{ padding:"10px 16px", color: r.noite.active ? "#8b5cf6" : "#334155", fontSize:12, textAlign:"left", border:"1px solid #154753" }}>
                          {r.noite.labels.length > 0 ? r.noite.labels.map((l, li) => <div key={li} style={{lineHeight:1.6}}>{l}</div>) : "—"}
                        </td>
                        <td style={{ padding:"10px 16px", color:"#ffa619", fontSize:14, fontWeight:800, textAlign:"center", border:"1px solid #154753" }}>
                          {r.fte.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background:"#01323d", borderTop:"2px solid #1e6a7a" }}>
                      <td colSpan={4} style={{ padding:"10px 16px", color:"#94a3b8", fontSize:11, fontWeight:700, border:"1px solid #154753", textAlign:"right" }}>TOTAL FTE DO DIA</td>
                      <td style={{ padding:"10px 16px", color:"#ffa619", fontSize:16, fontWeight:800, textAlign:"center", border:"1px solid #154753" }}>{totalFte.toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ color:"#475569", fontSize:11, marginTop:14 }}>* FTE = Full-Time Equivalent. Cada turno (Manhã / Tarde / Noite) = 0,5 FTE. Exibe apenas instrutores com contrato <strong style={{color:"#64748b"}}>Freelancer</strong>.</p>
          </div>
        );
      })()}

    </div>
  );
};

