// ── AI ────────────────────────────────────────────────────────────────────────
const AiPage = ({ schedules, setSchedules, trainings, instructors }) => {
  const [tid, setTid] = useState("");
  const [date, setDate] = useState("");
  const [local, setLocal] = useState("");
  const [sugs, setSugs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const t = trainings.find(x => x.id === +tid);
  const suggest = () => {
    if (!tid || !date) return;
    setLoading(true); setApplied(false);
    setTimeout(() => {
      const busy = schedules.filter(s => s.date === date).map(s => s.instructorId);
      setSugs((t?.modules || []).map((mod, idx) => {
        const qual = instructors.filter(i => (i.skills || []).some(s => (s.name||s) === mod.name));
        const avail = qual.filter(i => !busy.includes(i.id));
        const chosen = avail[0] || qual[0];
        return { module: mod.name, instructor: chosen, available: avail.length, conflict: avail.length === 0, role: idx === 0 ? "Lead Instructor" : mod.name.includes("PRÁTICA") ? "Practical Instructor" : "Theoretical Instructor" };
      }));
      setLoading(false);
    }, 1600);
  };
  const apply = () => {
    const news = sugs.filter(s => s.instructor).map(s => ({
      id: Date.now() + Math.random(), trainingId: +tid, trainingName: t?.gcc || "", className: `${t?.gcc}-AI`,
      date, startTime: "08:00", endTime: "17:00", local: local || "A definir",
      instructorId: s.instructor.id, instructorName: s.instructor.name, module: s.module, role: s.role, status: "Pendente",
    }));
    setSchedules([...schedules, ...news]); setApplied(true);
  };
  return (
    <div>
      <h2 style={{ color: "#fff", fontWeight: 800, margin: "0 0 4px", fontSize: 24 }}>IA — Sugestão de Escala</h2>
      <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 14 }}>Analisa competências, disponibilidade e conflitos</p>
      <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753", marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Sel label="Treinamento" value={tid} onChange={e => setTid(e.target.value)} opts={trainings.map(t => ({ v: t.id, l: `${t.gcc} — ${t.name.slice(0, 30)}` }))} />
          <div><label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          </div>
          <Sel label="Local" value={local} onChange={e => setLocal(e.target.value)} opts={LOCALS.map(l => ({ v: l.name, l: l.name }))} />
        </div>
        <Btn onClick={suggest} label={loading ? "Analisando..." : "Gerar Sugestão com IA"} icon="ai" color={loading ? "#154753" : "linear-gradient(135deg,#ffa619,#e8920a)"} disabled={loading || !tid || !date} />
      </div>
      {sugs.length > 0 && (
        <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ color: "#fff", margin: 0, fontWeight: 700 }}>✨ Sugestão para {t?.gcc}</h3>
            {!applied ? <Btn onClick={apply} label="Aplicar Escala" color="#16a34a" sm /> : <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 13 }}>✅ Aplicada!</span>}
          </div>
          {sugs.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderBottom: "1px solid #154753" }}>
              <div style={{ flex: 1 }}><p style={{ color: "#e2e8f0", fontWeight: 600, margin: 0, fontSize: 14 }}>{s.module}</p><p style={{ color: "#64748b", fontSize: 12, margin: "2px 0 0" }}>{s.role}</p></div>
              {s.instructor ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#ffa619,#e8920a)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>
                    {s.instructor.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <div><p style={{ color: "#e2e8f0", margin: 0, fontSize: 13, fontWeight: 600 }}>{s.instructor.name}</p>
                    <p style={{ color: s.conflict ? "#ef4444" : "#16a34a", fontSize: 11, margin: 0 }}>{s.conflict ? "⚠️ Possível conflito" : `✅ ${s.available} disponível(is)`}</p>
                  </div>
                </div>
              ) : <span style={{ color: "#ef4444", fontSize: 13 }}>❌ Sem instrutor qualificado</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

