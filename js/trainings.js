// ── LOCAIS SELECTOR (fora do componente para evitar remount no re-render) ────
const LocalsSelector = ({ type, locals, onChange, isCbinc, isEad }) => (
  <div style={{ background: "#01323d", border: "1px solid #154753", borderRadius: 8, padding: 10, maxHeight: 220, overflowY: "auto" }}>
    {isEad && <>
      <div style={{ color: "#10b981", fontSize: 11, fontWeight: 700, padding: "2px 0 6px" }}>── LOCAIS ONLINE (EAD) ──</div>
      {LOCALS.filter(l => l.type === "Online").map(l => (
        <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={locals.includes(l.name)} onChange={e => onChange(e.target.checked ? [...locals, l.name] : locals.filter(x => x !== l.name))} />
          <span style={{ color: "#e2e8f0", fontSize: 12 }}>{l.name}</span>
        </label>
      ))}
      {["MICROSOFT TEAMS","ZOOM"].map(name => (
        <label key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={locals.includes(name)} onChange={e => onChange(e.target.checked ? [...locals, name] : locals.filter(x => x !== name))} />
          <span style={{ color: "#e2e8f0", fontSize: 12 }}>{name}</span>
        </label>
      ))}
      {type === "TEORIA" && <div style={{ color: "#ffa619", fontSize: 10, fontWeight: 700, padding: "8px 0 2px", borderTop: "1px solid #073d4a", marginTop: 4 }}>── SALAS TEÓRICAS (PRESENCIAL) ──</div>}
      {type === "PRÁTICA" && <div style={{ color: "#16a34a", fontSize: 10, fontWeight: 700, padding: "8px 0 2px", borderTop: "1px solid #073d4a", marginTop: 4 }}>── AMBIENTES PRÁTICOS (PRESENCIAL) ──</div>}
    </>}
    {type === "TEORIA" && <>
      {!isEad && <div style={{ color: "#ffa619", fontSize: 11, fontWeight: 700, padding: "2px 0 6px" }}>── SALAS TEÓRICAS ──</div>}
      {LOCALS.filter(l => l.type === "RelyOn Macaé" && l.env === "Teórico").map(l => (
        <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={locals.includes(l.name)} onChange={e => onChange(e.target.checked ? [...locals, l.name] : locals.filter(x => x !== l.name))} />
          <span style={{ color: "#e2e8f0", fontSize: 12 }}>{l.name}</span>
        </label>
      ))}
    </>}
    {type === "PRÁTICA" && <>
      {!isEad && <div style={{ color: "#16a34a", fontSize: 11, fontWeight: 700, padding: "2px 0 6px" }}>── AMBIENTES PRÁTICOS ──</div>}
      {(isCbinc
        ? [{ label: "Combate a Incêndio", color: "#ef4444", items: LOCALS.filter(l => l.subtype === "incendio") }]
        : [{ label: "Piscinas", color: "#ffa619", items: LOCALS.filter(l => l.subtype === "piscina") },
           { label: "Combate a Incêndio", color: "#ef4444", items: LOCALS.filter(l => l.subtype === "incendio") },
           { label: "Industrial / Rigger", color: "#f97316", items: LOCALS.filter(l => l.subtype === "industrial") },
           { label: "Manobras", color: "#8b5cf6", items: LOCALS.filter(l => l.subtype === "manobra") }]
      ).map(g => (
        <React.Fragment key={g.label}>
          <div style={{ color: g.color, fontSize: 10, fontWeight: 700, padding: "6px 0 2px", borderTop: "1px solid #073d4a" }}>{g.label}</div>
          {g.items.map(l => (
            <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={locals.includes(l.name)} onChange={e => onChange(e.target.checked ? [...locals, l.name] : locals.filter(x => x !== l.name))} />
              <span style={{ color: "#e2e8f0", fontSize: 12 }}>{l.name}</span>
            </label>
          ))}
        </React.Fragment>
      ))}
      {isCbinc && <p style={{ color: "#ef444480", fontSize: 10, margin: "6px 0 0" }}>⚠ Área CBINC — apenas locais de combate a incêndio</p>}
    </>}
  </div>
);

// ── TRAININGS ─────────────────────────────────────────────────────────────────
const TrainingsPage = ({ trainings, setTrainings, areas, user, instructors, setInstructors }) => {
  const [search,     setSearch]     = useState("");
  const [areaFilter, setAreaFilter] = useState(0);
  const [showNew,    setShowNew]    = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [showMod,    setShowMod]    = useState(false);
  const [editingMod, setEditingMod] = useState(null);
  const [bulkLocal,  setBulkLocal]  = useState("");
  const [bulkType,   setBulkType]   = useState("all"); // "all" | "TEORIA" | "PRÁTICA"
  const [form,       setForm]       = useState({ gcc: "", name: "", shortName: "", totalMinutes: "", area: "", defaultSchedule: true, ead: false });
  const [modForm,    setModForm]    = useState({ name: "", type: "TEORIA", locals: [], minutes: "", instructorCount: 1, sameDay: true });
  const [delGuard,   setDelGuard]   = useState({ show: false, action: null, pass: "", err: "" });
  const [dragModId,  setDragModId]  = useState(null);
  const [showOrphans, setShowOrphans] = useState(false);
  const [orphanSearch, setOrphanSearch] = useState("");
  const [orphanSel, setOrphanSel] = useState(new Set());
  const [orphanTarget, setOrphanTarget] = useState("existing"); // "existing" | "new"
  const [orphanTrainingId, setOrphanTrainingId] = useState("");
  const [orphanNewGcc, setOrphanNewGcc] = useState("");
  const [orphanNewName, setOrphanNewName] = useState("");
  const [orphanNewArea, setOrphanNewArea] = useState("");
  const [expandedNames, setExpandedNames] = useState(new Set());
  const [showQfq,    setShowQfq]    = useState(false);
  const [qfqSearch,  setQfqSearch]  = useState("");
  const [qfqOpen,    setQfqOpen]    = useState(new Set()); // expanded training ids
  const [qfqModOpen, setQfqModOpen] = useState(new Set()); // expanded module ids
  const askDelete = (fn) => setDelGuard({ show: true, action: fn, pass: "", err: "" });

  const reorderMod = (fromId, toId) => {
    if (!editing || fromId === toId) return;
    const arr = [...(editing.modules || [])];
    const fi = arr.findIndex(m => m.id === fromId);
    const ti = arr.findIndex(m => m.id === toId);
    if (fi < 0 || ti < 0) return;
    const [item] = arr.splice(fi, 1);
    arr.splice(ti, 0, item);
    const reindexed = arr.map((m, i) => ({ ...m, priority: i + 1 }));
    const upd = trainings.map(t => t.id === editing.id ? { ...t, modules: reindexed } : t);
    setTrainings(upd);
    setEditing(upd.find(t => t.id === editing.id));
  };

  // Disciplinas órfãs: skills de instrutores sem módulo correspondente em nenhum treinamento
  // Normaliza string | {name,canLead} → string
  const _modNames  = new Set(trainings.flatMap(t => (t.modules||[]).map(m => m.name)));
  const orphanSkills = [...new Set((instructors||[]).flatMap(i => (i.skills||[]).map(s => typeof s === 'string' ? s : s.name)))].filter(s => !_modNames.has(s)).sort();

  const assignOrphans = () => {
    if (orphanSel.size === 0) return;
    const selected = [...orphanSel];
    let targetId;
    let updatedTrainings = [...trainings];
    if (orphanTarget === "new") {
      if (!orphanNewGcc.trim() || !orphanNewName.trim()) { alert("Preencha GCC e nome do novo treinamento."); return; }
      targetId = Date.now();
      updatedTrainings = [...updatedTrainings, { id: targetId, gcc: orphanNewGcc.trim().toUpperCase(), name: orphanNewName.trim().toUpperCase(), area: orphanNewArea ? +orphanNewArea : null, totalMinutes: 0, defaultSchedule: true, modules: [] }];
    } else {
      targetId = +orphanTrainingId;
      if (!targetId) { alert("Selecione um treinamento."); return; }
    }
    updatedTrainings = updatedTrainings.map(t => {
      if (t.id !== targetId) return t;
      const existingNames = new Set((t.modules||[]).map(m => m.name));
      const newMods = selected.filter(s => !existingNames.has(s)).map((s, i) => ({
        id: Date.now() + i + Math.random() * 1000 | 0,
        name: s,
        type: /pr[áa]tic/i.test(s) ? "PRÁTICA" : "TEORIA",
        locals: [], minutes: 60, instructorCount: 1, sameDay: true,
        priority: (t.modules||[]).length + i + 1,
      }));
      return { ...t, modules: [...(t.modules||[]), ...newMods] };
    });
    setTrainings(updatedTrainings);
    setShowOrphans(false);
    setOrphanSel(new Set());
    setOrphanSearch("");
    setOrphanNewGcc(""); setOrphanNewName(""); setOrphanNewArea("");
    setOrphanTrainingId("");
  };

  const deleteOrphanSkill = skillName => {
    if (!window.confirm(`Remover a competência "${skillName}" de todos os instrutores? Esta ação não pode ser desfeita.`)) return;
    setInstructors(prev => prev.map(i => ({
      ...i,
      skills: (i.skills || []).filter(s => (typeof s === 'string' ? s : s.name) !== skillName)
    })));
  };

  const visibleOrphans = orphanSkills.filter(s => s.toLowerCase().includes(orphanSearch.toLowerCase()));
  const orphanAllVisible = visibleOrphans.length > 0 && visibleOrphans.every(s => orphanSel.has(s));
  const toggleAllOrphans = () => {
    setOrphanSel(prev => {
      const n = new Set(prev);
      if (orphanAllVisible) visibleOrphans.forEach(s => n.delete(s));
      else visibleOrphans.forEach(s => n.add(s));
      return n;
    });
  };

  const filtered = trainings.filter(t =>
    (areaFilter === 0 || t.area === areaFilter) &&
    (t.name.toLowerCase().includes(search.toLowerCase()) || t.gcc.toLowerCase().includes(search.toLowerCase()) || (t.shortName||'').toLowerCase().includes(search.toLowerCase()))
  );

  const saveTraining = () => {
    if (!form.gcc || !form.name) return;
    setTrainings([...trainings, { id: Date.now(), gcc: form.gcc.toUpperCase(), name: form.name.toUpperCase(), shortName: form.shortName ? form.shortName.toUpperCase() : "", totalMinutes: +form.totalMinutes || 0, area: +form.area || null, defaultSchedule: form.defaultSchedule !== false, ead: form.ead === true, modules: [] }]);
    setForm({ gcc: "", name: "", shortName: "", totalMinutes: "", area: "", defaultSchedule: true, ead: false });
    setShowNew(false);
  };

  const saveModule = () => {
    if (!modForm.name || !editing) return;
    const nameUp = modForm.name.toUpperCase();
    if ((editing.modules || []).some(m => m.name === nameUp)) {
      alert(`Módulo "${nameUp}" já existe neste treinamento.`);
      return;
    }
    const np = (editing.modules?.length || 0) + 1;
    const nm = { id: Date.now(), name: nameUp, type: modForm.type, locals: modForm.locals, priority: np, minutes: +modForm.minutes || 0, instructorCount: +modForm.instructorCount || 1, sameDay: modForm.sameDay !== false };
    const upd = trainings.map(t => t.id === editing.id ? { ...t, modules: [...(t.modules || []), nm] } : t);
    setTrainings(upd); setEditing(upd.find(t => t.id === editing.id));
    setModForm({ name: "", type: "TEORIA", locals: [], minutes: "", instructorCount: 1, sameDay: true });
    setShowMod(false);
  };

  const saveInline = (tid, mid, ch) => {
    const upd = trainings.map(t => t.id === tid ? { ...t, modules: t.modules.map(m => m.id === mid ? { ...m, ...ch } : m) } : t);
    setTrainings(upd); setEditing(upd.find(t => t.id === tid)); setEditingMod(null);
  };

  const delModule = (tid, mid) => {
    askDelete(() => {
      const upd = trainings.map(t => t.id === tid ? { ...t, modules: t.modules.filter(m => m.id !== mid).map((m, i) => ({ ...m, priority: i + 1 })) } : t);
      setTrainings(upd); setEditing(upd.find(t => t.id === tid));
    });
  };

  const delTraining = id => askDelete(() => setTrainings(trainings.filter(t => t.id !== id)));

  const applyBulk = () => {
    if (!bulkLocal || !editing) return;
    const upd = trainings.map(t => t.id === editing.id ? { ...t, modules: t.modules.map(m => {
      if (bulkType !== "all" && m.type !== bulkType) return m;
      return { ...m, locals: m.locals?.includes(bulkLocal) ? m.locals : [...(m.locals || []), bulkLocal] };
    }) } : t);
    setTrainings(upd); setEditing(upd.find(t => t.id === editing.id)); setBulkLocal("");
  };

  const replaceBulk = () => {
    if (!bulkLocal || !editing) return;
    const upd = trainings.map(t => t.id === editing.id ? { ...t, modules: t.modules.map(m => {
      if (bulkType !== "all" && m.type !== bulkType) return m;
      return { ...m, locals: [bulkLocal] };
    }) } : t);
    setTrainings(upd); setEditing(upd.find(t => t.id === editing.id)); setBulkLocal("");
  };

  const removeBulk = ln => {
    const upd = trainings.map(t => t.id === editing.id ? { ...t, modules: t.modules.map(m => {
      if (bulkType !== "all" && m.type !== bulkType) return m;
      return { ...m, locals: (m.locals || []).filter(l => l !== ln) };
    }) } : t);
    setTrainings(upd); setEditing(upd.find(t => t.id === editing.id));
  };

  // ── EDITING VIEW ─────────────────────────────────────────────────────────
  if (editing) {
    const totalMin = editing.modules?.reduce((s, m) => s + (m.minutes || 0), 0) || 0;
    const area = areas.find(a => a.id === editing.area);
    const em = editingMod;
    const common = editing.modules?.length > 0 ? [...new Set(editing.modules.flatMap(m => m.locals || []))].filter(l => editing.modules.every(m => (m.locals || []).includes(l))) : [];
    return (
      <div>
        <button onClick={() => { setEditing(null); setEditingMod(null); }}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14, marginBottom: 20, padding: 0 }}>
          <Icon name="back" size={18} color="#94a3b8" /> Voltar para Treinamentos
        </button>
        <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <div>
              <label style={{ color: "#94a3b8", fontSize: 11, display: "block", marginBottom: 4 }}>Código GCC</label>
              <input value={editing.gcc} onChange={e => { const upd = trainings.map(t => t.id === editing.id ? { ...t, gcc: e.target.value.toUpperCase() } : t); setTrainings(upd); setEditing(upd.find(t => t.id === editing.id)); }}
                style={{ padding: "6px 12px", background: "#01323d", border: "1px solid #ffa61940", borderRadius: 8, color: "#ffa619", fontSize: 14, fontWeight: 700, outline: "none", width: 120 }} />
            </div>
            <div>
              <label style={{ color: "#94a3b8", fontSize: 11, display: "block", marginBottom: 4 }}>Nome Abreviado <span style={{ color: "#64748b", fontWeight: 400 }}>(máx. 15)</span></label>
              <input value={editing.shortName||""} onChange={e => { const v = e.target.value.slice(0,15).toUpperCase(); const upd = trainings.map(t => t.id === editing.id ? { ...t, shortName: v } : t); setTrainings(upd); setEditing(upd.find(t => t.id === editing.id)); }}
                placeholder="Ex: CBSP"
                style={{ padding: "6px 12px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", width: 140 }} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ color: "#94a3b8", fontSize: 11, display: "block", marginBottom: 4 }}>Nome do Treinamento</label>
              <input value={editing.name} onChange={e => { const upd = trainings.map(t => t.id === editing.id ? { ...t, name: e.target.value.toUpperCase() } : t); setTrainings(upd); setEditing(upd.find(t => t.id === editing.id)); }}
                style={{ width: "100%", padding: "6px 12px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#fff", fontSize: 15, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: "#64748b", fontSize: 13 }}>{fmtMin(totalMin)} · {editing.modules?.length || 0} módulo(s)</span>
            <span style={{ padding: "2px 8px", borderRadius: 6, background: editing.defaultSchedule !== false ? "#ffa61920" : "#154753", color: editing.defaultSchedule !== false ? "#ffa619" : "#94a3b8", fontSize: 11, fontWeight: 600 }}>
              {editing.defaultSchedule !== false ? "⏰ Horário padrão 08:00–17:00" : "⏰ Horário personalizado"}
            </span>
            {editing.ead && <span style={{ padding: "2px 8px", borderRadius: 6, background: "#10b98120", color: "#10b981", fontSize: 11, fontWeight: 700 }}>🌐 EAD</span>}
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#64748b", fontSize: 12 }}>Horário padrão?</span>
              <div onClick={() => { const upd = trainings.map(t => t.id === editing.id ? { ...t, defaultSchedule: !editing.defaultSchedule } : t); setTrainings(upd); setEditing(upd.find(t => t.id === editing.id)); }}
                style={{ width: 36, height: 20, borderRadius: 10, background: editing.defaultSchedule !== false ? "#ffa619" : "#154753", position: "relative", transition: "background 0.2s", cursor: "pointer", flexShrink: 0 }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: editing.defaultSchedule !== false ? 19 : 3, transition: "left 0.2s" }} />
              </div>
              <span style={{ color: editing.defaultSchedule !== false ? "#ffa619" : "#64748b", fontSize: 12 }}>{editing.defaultSchedule !== false ? "Sim" : "Não"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <span style={{ color: "#64748b", fontSize: 12 }}>Modalidade EAD?</span>
              <div onClick={() => { const upd = trainings.map(t => t.id === editing.id ? { ...t, ead: !editing.ead } : t); setTrainings(upd); setEditing(upd.find(t => t.id === editing.id)); }}
                style={{ width: 36, height: 20, borderRadius: 10, background: editing.ead ? "#10b981" : "#154753", position: "relative", transition: "background 0.2s", cursor: "pointer", flexShrink: 0 }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: editing.ead ? 19 : 3, transition: "left 0.2s" }} />
              </div>
              <span style={{ color: editing.ead ? "#10b981" : "#64748b", fontSize: 12 }}>{editing.ead ? "EAD — locais online + presencial disponíveis" : "Presencial"}</span>
            </div>
          </div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label style={{ color: "#94a3b8", fontSize: 13 }}>Área:</label>
            <select
              value={editing.area || ""}
              onChange={e => {
                const upd = trainings.map(t => t.id === editing.id ? { ...t, area: +e.target.value || null } : t);
                setTrainings(upd);
                setEditing(upd.find(t => t.id === editing.id));
              }}
              style={{ padding: "6px 12px", background: "#01323d", border: `1px solid ${area ? area.color + "80" : "#154753"}`, borderRadius: 8, color: area ? area.color : "#94a3b8", fontSize: 13, fontWeight: 600, outline: "none", cursor: "pointer" }}
            >
              <option value="">— Sem área —</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name} — {a.leader}</option>)}
            </select>
            {area && <span style={{ padding: "2px 10px", borderRadius: 20, background: area.color + "20", color: area.color, fontSize: 12, fontWeight: 700 }}>{area.name}</span>}
          </div>
        </div>
        <div style={{ background: "#073d4a", borderRadius: 16, border: "1px solid #154753", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #154753", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ color: "#fff", margin: 0, fontWeight: 700, fontSize: 15 }}>Módulos / Disciplinas</h3>
            {hasPermission(user, "train_edit") && <Btn onClick={() => setShowMod(true)} label="Adicionar Módulo" icon="plus" sm />}
          </div>
          {editing.modules?.length > 0 && hasPermission(user, "train_edit") && (
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #154753", background: "#01323d" }}>
              <p style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700, margin: "0 0 10px" }}>⚡ APLICAR SALA A TODOS</p>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {[["all","Todos","#64748b"],["TEORIA","Só TEORIA","#ffa619"],["PRÁTICA","Só PRÁTICA","#16a34a"]].map(([v,l,c]) => (
                  <button key={v} onClick={() => setBulkType(v)}
                    style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${bulkType === v ? c : "#154753"}`, background: bulkType === v ? c + "20" : "transparent", color: bulkType === v ? c : "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {l}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select value={bulkLocal} onChange={e => setBulkLocal(e.target.value)}
                  style={{ flex: 1, minWidth: 160, padding: "8px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none" }}>
                  <option value="">Selecionar sala...</option>
                  <optgroup label="── TEÓRICO ──">{LOCALS.filter(l => l.type === "RelyOn Macaé" && l.env === "Teórico").map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</optgroup>
                  <optgroup label="── PRÁTICO ──">{LOCALS.filter(l => l.type === "RelyOn Macaé" && l.env === "Prático").map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</optgroup>
                </select>
                <Btn onClick={applyBulk} label="+ Adicionar a todos" disabled={!bulkLocal} sm />
                <Btn onClick={replaceBulk} label="↺ Substituir todos" color="#f59e0b" disabled={!bulkLocal} sm />
                <Btn onClick={() => { if (bulkLocal) removeBulk(bulkLocal); }} label="− Remover de todos" color="#ef4444" disabled={!bulkLocal} sm />
              </div>
              {common.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ color: "#64748b", fontSize: 11, margin: "0 0 6px" }}>Salas em TODOS os módulos:</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {common.map(l => (
                      <span key={l} style={{ padding: "3px 10px", borderRadius: 20, background: "#16a34a20", color: "#16a34a", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                        {l} <button onClick={() => removeBulk(l)} style={{ background: "none", border: "none", cursor: "pointer", color: "#16a34a", padding: 0, fontSize: 13 }}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {(!editing.modules || editing.modules.length === 0) && <p style={{ color: "#64748b", padding: 24, textAlign: "center" }}>Nenhum módulo. Clique em "Adicionar Módulo".</p>}
          {editing.modules?.map(m => {
            const isE = em?.id === m.id;
            const isDraggingMod = dragModId === m.id;
            return (
              <div key={m.id}
                draggable={!isE}
                onDragStart={e => { e.stopPropagation(); setDragModId(m.id); }}
                onDragEnd={() => setDragModId(null)}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => { e.stopPropagation(); if (dragModId && dragModId !== m.id) { reorderMod(dragModId, m.id); setDragModId(null); } }}
                style={{ borderBottom: "1px solid #154753", background: isE ? "#01323d" : isDraggingMod ? "#1e5a6a" : "transparent", opacity: isDraggingMod ? 0.4 : 1, cursor: isE ? "default" : "grab", transition: "opacity 0.15s" }}>
                {!isE && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
                    <span style={{ color: "#475569", fontSize: 16, flexShrink: 0, cursor: "grab" }}>⠿</span>
                    <span style={{ color: "#64748b", fontSize: 12, width: 24, textAlign: "center", flexShrink: 0 }}>{m.priority}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                        <span style={{ padding: "2px 7px", borderRadius: 5, background: m.type === "PRÁTICA" ? "#16a34a20" : "#ffa61920", color: m.type === "PRÁTICA" ? "#16a34a" : "#ffa619", fontSize: 11, fontWeight: 700 }}>{m.type || "TEORIA"}</span>
                        <span style={{ color: "#ffa619", fontSize: 11, fontWeight: 600 }}>{fmtMin(m.minutes)}</span>
                        <span style={{ color: "#64748b", fontSize: 11 }}>{m.instructorCount || 1} instrutor(es)</span>
                        {m.sameDay !== false && <span style={{ padding: "1px 6px", borderRadius: 4, background: "#0ea5e920", color: "#0ea5e9", fontSize: 10, fontWeight: 600 }}>1 dia</span>}
                        {m.locals?.slice(0, 3).map(l => <span key={l} style={{ padding: "1px 5px", borderRadius: 4, background: localColor(l) + "20", color: localColor(l), fontSize: 10, fontWeight: 600 }}>{l}</span>)}
                        {m.locals?.length > 3 && <span style={{ color: "#64748b", fontSize: 10 }}>+{m.locals.length - 3}</span>}
                      </div>
                    </div>
                    {hasPermission(user, "train_edit") && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button onClick={() => setEditingMod({ ...m })} style={{ padding: "5px 10px", background: "#154753", border: "none", borderRadius: 6, color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                        <Icon name="edit" size={12} color="#94a3b8" /> Editar
                      </button>
                      <button onClick={() => delModule(editing.id, m.id)} style={{ padding: "5px 8px", background: "none", border: "1px solid #ef444440", borderRadius: 6, cursor: "pointer" }}>
                        <Icon name="delete" size={13} color="#ef4444" />
                      </button>
                    </div>
                    )}
                  </div>
                )}
                {isE && (
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div><label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Nome</label>
                        <input value={em.name} onChange={e => setEditingMod({ ...em, name: e.target.value })}
                          style={{ width: "100%", padding: "8px 10px", background: "#073d4a", border: "1px solid #154753", borderRadius: 7, color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
                      <div><label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Tipo</label>
                        <select value={em.type} onChange={e => setEditingMod({ ...em, type: e.target.value, locals: [] })}
                          style={{ width: "100%", padding: "8px 10px", background: "#073d4a", border: "1px solid #154753", borderRadius: 7, color: "#e2e8f0", fontSize: 13, outline: "none" }}>
                          <option value="TEORIA">TEORIA</option><option value="PRÁTICA">PRÁTICA</option>
                        </select></div>
                      <div><label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Carga (min)</label>
                        <input type="number" value={em.minutes} onChange={e => setEditingMod({ ...em, minutes: e.target.value })}
                          style={{ width: "100%", padding: "8px 10px", background: "#073d4a", border: "1px solid #154753", borderRadius: 7, color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
                      <div><label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Nº Instrutores</label>
                        <input type="number" value={em.instructorCount} onChange={e => setEditingMod({ ...em, instructorCount: +e.target.value })}
                          style={{ width: "100%", padding: "8px 10px", background: "#073d4a", border: "1px solid #154753", borderRadius: 7, color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
                    </div>
                    <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 6 }}>Locais Compatíveis</label>
                    {(() => { const _area = areas.find(a => a.id === editing?.area); const _isCbinc = _area && /CBINC|INCÊNDIO|INCENDIO/i.test(_area.name); return <LocalsSelector type={em.type} locals={em.locals || []} onChange={ls => setEditingMod({ ...em, locals: ls })} isCbinc={em.type === "PRÁTICA" && _isCbinc} isEad={!!editing?.ead} />; })()}
                    {em.locals?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, marginBottom: 12 }}>
                        {em.locals.map(l => (
                          <span key={l} style={{ padding: "2px 8px", borderRadius: 20, background: localColor(l) + "20", color: localColor(l), fontSize: 11, display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                            {l} <button onClick={() => setEditingMod({ ...em, locals: em.locals.filter(x => x !== l) })} style={{ background: "none", border: "none", cursor: "pointer", color: localColor(l), padding: 0, fontSize: 12 }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, marginBottom: 4 }}>
                      <label style={{ color: "#94a3b8", fontSize: 12 }}>Mesmo dia?</label>
                      <div onClick={() => setEditingMod({ ...em, sameDay: !em.sameDay })}
                        style={{ width: 36, height: 20, borderRadius: 10, background: em.sameDay !== false ? "#ffa619" : "#154753", position: "relative", transition: "background 0.2s", cursor: "pointer", flexShrink: 0 }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: em.sameDay !== false ? 19 : 3, transition: "left 0.2s" }} />
                      </div>
                      <span style={{ color: em.sameDay !== false ? "#ffa619" : "#64748b", fontSize: 12 }}>{em.sameDay !== false ? "Sim" : "Não"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Btn onClick={() => saveInline(editing.id, m.id, { name: em.name, type: em.type, locals: em.locals, minutes: +em.minutes, instructorCount: +em.instructorCount, sameDay: em.sameDay !== false })} label="Salvar" icon="check" color="#16a34a" sm />
                      <Btn onClick={() => setEditingMod(null)} label="Cancelar" color="#154753" sm />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {showMod && (
          <Modal title="Adicionar Módulo" onClose={() => setShowMod(false)} width={500}>
            <Input label="Nome do Módulo / Disciplina" value={modForm.name} onChange={e => setModForm({ ...modForm, name: e.target.value })} placeholder="Ex: CBSP - TSP/P - TEORIA" />
            <Sel label="Tipo" value={modForm.type} onChange={e => setModForm({ ...modForm, type: e.target.value, locals: [] })} opts={[{ v: "TEORIA", l: "TEORIA" }, { v: "PRÁTICA", l: "PRÁTICA" }]} placeholder="Selecionar..." />
            <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Locais Compatíveis</label>
            {(() => { const _area = areas.find(a => a.id === editing?.area); const _isCbinc = _area && /CBINC|INCÊNDIO|INCENDIO/i.test(_area.name); return <LocalsSelector type={modForm.type} locals={modForm.locals} onChange={ls => setModForm({ ...modForm, locals: ls })} isCbinc={modForm.type === "PRÁTICA" && _isCbinc} isEad={!!editing?.ead} />; })()}
            {modForm.locals.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, marginBottom: 8 }}>{modForm.locals.map(l => <span key={l} style={{ padding: "2px 8px", borderRadius: 6, background: localColor(l) + "20", color: localColor(l), fontSize: 11 }}>{l}</span>)}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <Input label="Carga Horária (min)" type="number" value={modForm.minutes} onChange={e => setModForm({ ...modForm, minutes: e.target.value })} placeholder="Ex: 300" />
              <Input label="Nº de Instrutores" type="number" value={modForm.instructorCount} onChange={e => setModForm({ ...modForm, instructorCount: e.target.value })} placeholder="Ex: 1" />
            </div>
            {modForm.minutes > 0 && <p style={{ color: "#64748b", fontSize: 12, margin: "-4px 0 12px" }}>= {fmtMin(+modForm.minutes)}</p>}
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Concluir no mesmo dia? <span style={{ color: "#64748b", fontSize: 11 }}>(Sim = pode passar das 17h no mesmo dia; Não = horas restantes vão para o próximo dia)</span></label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div onClick={() => setModForm({ ...modForm, sameDay: !modForm.sameDay })}
                  style={{ width: 42, height: 24, borderRadius: 12, background: modForm.sameDay ? "#ffa619" : "#154753", position: "relative", transition: "background 0.2s", cursor: "pointer", flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: modForm.sameDay ? 21 : 3, transition: "left 0.2s" }} />
                </div>
                <span style={{ color: modForm.sameDay ? "#ffa619" : "#64748b", fontSize: 13, fontWeight: 600 }}>{modForm.sameDay ? "Sim" : "Não"}</span>
              </div>
            </div>
            <Btn onClick={saveModule} label="Salvar Módulo" icon="check" color="#16a34a" />
          </Modal>
        )}
        <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
      </div>
    );
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div><h2 style={{ color: "#fff", fontWeight: 800, margin: 0, fontSize: 24 }}>Treinamentos</h2><p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>{trainings.length} cursos cadastrados</p></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {hasPermission(user, "train_edit") && orphanSkills.length > 0 && (
            <button onClick={() => { setShowOrphans(true); setOrphanSel(new Set()); setOrphanSearch(""); }} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d9770680", background: "#d9770610", color: "#fb923c", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              ⚠ {orphanSkills.length} disciplina{orphanSkills.length > 1 ? "s" : ""} sem treinamento
            </button>
          )}
          <button onClick={() => { setShowQfq(true); setQfqSearch(""); setQfqOpen(new Set()); setQfqModOpen(new Set()); }}
            style={{ padding:"8px 16px", borderRadius:8, border:"1px solid #154753", background:"#073d4a", color:"#94a3b8", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            🔍 Quem faz o quê?
          </button>
          {hasPermission(user, "train_edit") && <Btn onClick={() => setShowNew(true)} label="Novo Treinamento" icon="plus" />}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setAreaFilter(0)} style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${areaFilter === 0 ? "#fff" : "#154753"}`, background: areaFilter === 0 ? "#fff" : "transparent", color: areaFilter === 0 ? "#01323d" : "#94a3b8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          TODAS ({trainings.length})
        </button>
        {areas.map(a => (
          <button key={a.id} onClick={() => setAreaFilter(areaFilter === a.id ? 0 : a.id)}
            style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${areaFilter === a.id ? a.color : "#154753"}`, background: areaFilter === a.id ? a.color + "20" : "transparent", color: areaFilter === a.id ? a.color : "#94a3b8", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.color }} />
            {a.name} ({trainings.filter(t => t.area === a.id).length})
          </button>
        ))}
      </div>
      <div style={{ position: "relative", marginBottom: 16 }}>
        <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={16} color="#64748b" /></div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou código GCC..."
          style={{ width: "100%", padding: "10px 10px 10px 40px", background: "#073d4a", border: "1px solid #154753", borderRadius: 10, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map(t => {
          const area = areas.find(a => a.id === t.area);
          return (
            <div key={t.id} style={{ background: "#073d4a", borderRadius: 14, padding: "14px 20px", border: `1px solid ${area ? area.color + "40" : "#154753"}`, display: "flex", alignItems: "center", gap: 14 }}>
              {area && <div style={{ width: 4, height: 44, borderRadius: 4, background: area.color, flexShrink: 0 }} />}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ padding: "4px 12px", borderRadius: 8, background: "#ffa61920", color: "#ffa619", fontSize: 13, fontWeight: 700 }}>{t.gcc}</span>
                {t.shortName && <span style={{ padding: "2px 8px", borderRadius: 6, background: "#154753", color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>{t.shortName}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: "#e2e8f0", fontWeight: 600, margin: 0, fontSize: 14 }}>
                  {expandedNames.has(t.id) || t.name.length <= 50
                    ? t.name
                    : <>{t.name.slice(0, 50)}… <button onClick={e => { e.stopPropagation(); setExpandedNames(prev => { const n = new Set(prev); n.add(t.id); return n; }); }} style={{ background: "none", border: "1px solid #1e6a7a", borderRadius: 4, color: "#ffa619", fontSize: 11, cursor: "pointer", padding: "0 5px", lineHeight: "18px" }}>+</button></>
                  }
                  {expandedNames.has(t.id) && t.name.length > 50 && <button onClick={e => { e.stopPropagation(); setExpandedNames(prev => { const n = new Set(prev); n.delete(t.id); return n; }); }} style={{ background: "none", border: "1px solid #1e6a7a", borderRadius: 4, color: "#64748b", fontSize: 11, cursor: "pointer", padding: "0 5px", lineHeight: "18px", marginLeft: 4 }}>−</button>}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
                  {area && <span style={{ padding: "1px 8px", borderRadius: 20, background: area.color + "20", color: area.color, fontSize: 11, fontWeight: 700 }}>{area.name}</span>}
                  {t.ead && <span style={{ padding: "1px 8px", borderRadius: 20, background: "#10b98120", color: "#10b981", fontSize: 11, fontWeight: 700 }}>EAD</span>}
                  <span style={{ color: "#64748b", fontSize: 12 }}>{t.modules?.length || 0} módulo(s){t.totalMinutes > 0 ? ` · ${fmtMin(t.totalMinutes)}` : ""}</span>
                  {t.modules?.length === 0 && <span style={{ color: "#d97706", fontSize: 11 }}>⚠ Sem módulos</span>}
                  {area && <span style={{ color: "#64748b", fontSize: 11 }}>· {area.leader}</span>}
                </div>
              </div>
              {hasPermission(user, "train_edit") && (
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Btn onClick={() => setEditing(t)} label="Editar" icon="edit" color="#154753" sm />
                <button onClick={() => delTraining(t.id)} style={{ background: "none", border: "1px solid #ef444440", borderRadius: 8, cursor: "pointer", padding: "6px 8px" }}>
                  <Icon name="delete" size={14} color="#ef4444" />
                </button>
              </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p style={{ color: "#64748b", textAlign: "center", padding: 32 }}>Nenhum treinamento encontrado.</p>}
      </div>
      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />

      {/* ── MODAL: DISCIPLINAS ÓRFÃS ─────────────────────────────────────── */}
      {showOrphans && (
        <Modal title={"Disciplinas sem Treinamento (" + orphanSkills.length + ")"} onClose={() => setShowOrphans(false)} width={620}>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 14 }}>
            Estas disciplinas existem nas habilidades dos instrutores mas não pertencem a nenhum treinamento.
            Selecione as que deseja atribuir e escolha (ou crie) um treinamento destino.
          </p>
          <input value={orphanSearch} onChange={e => setOrphanSearch(e.target.value)}
            placeholder="Buscar disciplina..." style={{ width: "100%", padding: "8px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "#94a3b8", fontSize: 12 }}>
              <input type="checkbox" checked={orphanAllVisible} onChange={toggleAllOrphans} />
              {" "}Selecionar visíveis ({visibleOrphans.length})
            </label>
            <span style={{ color: "#ffa619", fontSize: 12, fontWeight: 700 }}>{orphanSel.size} selecionada{orphanSel.size !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #154753", borderRadius: 8, marginBottom: 16 }}>
            {visibleOrphans.length === 0 && (
              <p style={{ color: "#64748b", textAlign: "center", padding: 16, fontSize: 13 }}>Nenhuma disciplina encontrada.</p>
            )}
            {visibleOrphans.map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", borderBottom: i < visibleOrphans.length - 1 ? "1px solid #154753" : "none", background: orphanSel.has(s) ? "#ffa61912" : "transparent" }}>
                <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", cursor: "pointer" }}>
                  <input type="checkbox" checked={orphanSel.has(s)} onChange={() => setOrphanSel(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; })} />
                  <span style={{ color: "#e2e8f0", fontSize: 13 }}>{s}</span>
                </label>
                {hasPermission(user, "train_edit") && (
                  <button onClick={e => { e.preventDefault(); deleteOrphanSkill(s); }}
                    title="Excluir competência de todos os instrutores"
                    style={{ background: "none", border: "none", padding: "4px 10px", cursor: "pointer", color: "#ef4444", fontSize: 15, flexShrink: 0 }}>✕</button>
                )}
              </div>
            ))}
          </div>
          <div style={{ background: "#073d4a", borderRadius: 10, padding: 14, border: "1px solid #154753", marginBottom: 14 }}>
            <p style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Treinamento Destino</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setOrphanTarget("existing")}
                style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid " + (orphanTarget === "existing" ? "#ffa619" : "#154753"), background: orphanTarget === "existing" ? "#ffa61920" : "transparent", color: orphanTarget === "existing" ? "#ffa619" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Treinamento existente
              </button>
              <button onClick={() => setOrphanTarget("new")}
                style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid " + (orphanTarget === "new" ? "#ffa619" : "#154753"), background: orphanTarget === "new" ? "#ffa61920" : "transparent", color: orphanTarget === "new" ? "#ffa619" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Criar novo treinamento
              </button>
            </div>
            {orphanTarget === "existing" ? (
              <select value={orphanTrainingId} onChange={e => setOrphanTrainingId(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                <option value="">— Selecionar treinamento —</option>
                {trainings.map(t => <option key={t.id} value={t.id}>{t.gcc} — {t.name.slice(0, 55)}</option>)}
              </select>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8 }}>
                <input value={orphanNewGcc} onChange={e => setOrphanNewGcc(e.target.value.toUpperCase())} placeholder="GCC (ex: NR10)" style={{ padding: "8px 10px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#ffa619", fontWeight: 700, fontSize: 13, outline: "none" }} />
                <input value={orphanNewName} onChange={e => setOrphanNewName(e.target.value)} placeholder="Nome do treinamento" style={{ padding: "8px 10px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none" }} />
                <select value={orphanNewArea} onChange={e => setOrphanNewArea(e.target.value)}
                  style={{ gridColumn: "1/-1", padding: "8px 10px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                  <option value="">— Área (opcional) —</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <p style={{ color: "#64748b", fontSize: 11, marginBottom: 12 }}>
            Tipo detectado pelo nome (PRÁTICA se contiver "prática"), 60 min, 1 instrutor — ajuste depois dentro do treinamento.
          </p>
          <Btn onClick={assignOrphans} label={"Atribuir " + orphanSel.size + " disciplina" + (orphanSel.size !== 1 ? "s" : "")} icon="check" color="#16a34a" />
        </Modal>
      )}

      {showQfq && (() => {
        const qfqTerm = qfqSearch.trim().toLowerCase();
        const qfqFiltered = trainings.filter(t =>
          !qfqTerm ||
          t.name.toLowerCase().includes(qfqTerm) ||
          t.gcc.toLowerCase().includes(qfqTerm) ||
          (t.shortName||"").toLowerCase().includes(qfqTerm)
        ).sort((a,b) => a.gcc.localeCompare(b.gcc));
        const getInstructorsForSkill = skillName =>
          (instructors||[]).filter(i =>
            (i.skills||[]).some(s => (typeof s === "string" ? s : s.name) === skillName)
          ).map(i => {
            const skill = (i.skills||[]).find(s => (typeof s === "string" ? s : s.name) === skillName);
            const canLead = skill && typeof skill === "object" ? skill.canLead !== false : true;
            return { ...i, canLead };
          }).sort((a,b) => a.name.localeCompare(b.name));
        const toggleT  = id => setQfqOpen(p  => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
        const toggleM  = id => setQfqModOpen(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
        return (
          <Modal title="🔍 Quem faz o quê?" onClose={() => setShowQfq(false)} width={680}>
            <div style={{ marginBottom:16 }}>
              <input
                autoFocus
                value={qfqSearch} onChange={e => { setQfqSearch(e.target.value); setQfqOpen(new Set()); setQfqModOpen(new Set()); }}
                placeholder="Digite o nome ou código GCC do treinamento..."
                style={{ width:"100%", padding:"10px 14px", background:"#073d4a", border:"1px solid #ffa61960", borderRadius:10, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }}
              />
              {qfqTerm && <p style={{ color:"#64748b", fontSize:12, margin:"6px 0 0" }}>{qfqFiltered.length} treinamento(s) encontrado(s)</p>}
            </div>
            {!qfqTerm && (
              <p style={{ color:"#475569", fontSize:13, textAlign:"center", padding:"24px 0" }}>
                Digite o nome ou GCC do treinamento para ver quais instrutores entregam cada disciplina.
              </p>
            )}
            <div style={{ maxHeight:"65vh", overflowY:"auto", display:"flex", flexDirection:"column", gap:10 }}>
              {qfqFiltered.map(t => {
                const area = areas.find(a => a.id === t.area);
                const isOpen = qfqOpen.has(t.id);
                const modules = t.modules || [];
                return (
                  <div key={t.id} style={{ background:"#073d4a", borderRadius:12, border:`1px solid ${area ? area.color+"40" : "#154753"}`, overflow:"hidden" }}>
                    {/* Training header */}
                    <div onClick={() => toggleT(t.id)}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", cursor:"pointer" }}>
                      {area && <div style={{ width:4, height:36, borderRadius:4, background:area.color, flexShrink:0 }} />}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <span style={{ color:"#ffa619", fontWeight:700, fontSize:13 }}>{t.gcc}</span>
                          {t.shortName && <span style={{ padding:"1px 7px", borderRadius:5, background:"#154753", color:"#94a3b8", fontSize:11 }}>{t.shortName}</span>}
                          {t.ead && <span style={{ padding:"1px 7px", borderRadius:5, background:"#10b98120", color:"#10b981", fontSize:11, fontWeight:700 }}>EAD</span>}
                          {area && <span style={{ padding:"1px 7px", borderRadius:5, background:area.color+"20", color:area.color, fontSize:11 }}>{area.name}</span>}
                        </div>
                        <div style={{ color:"#94a3b8", fontSize:12, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.name}</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                        <span style={{ color:"#64748b", fontSize:11 }}>{modules.length} disciplina(s)</span>
                        <span style={{ color:"#64748b", fontSize:13 }}>{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </div>
                    {/* Modules */}
                    {isOpen && (
                      <div style={{ borderTop:"1px solid #154753" }}>
                        {modules.length === 0 ? (
                          <p style={{ color:"#64748b", fontSize:13, padding:"12px 16px", margin:0 }}>Nenhuma disciplina cadastrada.</p>
                        ) : modules.map(m => {
                          const instrList = getInstructorsForSkill(m.name);
                          const isModOpen = qfqModOpen.has(m.id);
                          return (
                            <div key={m.id} style={{ borderBottom:"1px solid #073d4a40" }}>
                              {/* Module row */}
                              <div onClick={() => toggleM(m.id)}
                                style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 20px", cursor:"pointer", background: isModOpen ? "#01323d" : "transparent" }}>
                                <span style={{ padding:"2px 8px", borderRadius:5, background: m.type==="TEORIA" ? "#ffa61920" : "#16a34a20", color: m.type==="TEORIA" ? "#ffa619" : "#16a34a", fontSize:10, fontWeight:700, flexShrink:0 }}>{m.type}</span>
                                <span style={{ color:"#e2e8f0", fontSize:13, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name}</span>
                                <span style={{ color: instrList.length > 0 ? "#16a34a" : "#ef4444", fontSize:11, fontWeight:700, flexShrink:0 }}>
                                  {instrList.length > 0 ? instrList.length+" instrutor(es)" : "⚠ Nenhum"}
                                </span>
                                <span style={{ color:"#64748b", fontSize:12 }}>{isModOpen ? "▲" : "▼"}</span>
                              </div>
                              {/* Instructor list */}
                              {isModOpen && (
                                <div style={{ padding:"10px 20px 12px 44px", background:"#01323d", display:"flex", flexWrap:"wrap", gap:8 }}>
                                  {instrList.length === 0 ? (
                                    <span style={{ color:"#ef4444", fontSize:12 }}>Nenhum instrutor habilitado para esta disciplina.</span>
                                  ) : instrList.map(i => (
                                    <div key={i.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"#073d4a", borderRadius:20, border:"1px solid #154753" }}>
                                      <div style={{ width:22, height:22, borderRadius:"50%", background:"linear-gradient(135deg,#ffa619,#e8920a)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:8, fontWeight:700, flexShrink:0 }}>
                                        {i.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
                                      </div>
                                      <span style={{ color:"#e2e8f0", fontSize:12, fontWeight:500 }}>{i.name.split(" ").slice(0,3).join(" ")}</span>
                                      {i.canLead && <span style={{ padding:"1px 5px", borderRadius:4, background:"#dc262620", color:"#dc2626", fontSize:9, fontWeight:700 }}>LÍDER</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Modal>
        );
      })()}

      {showNew && (
        <Modal title="Novo Treinamento" onClose={() => setShowNew(false)} width={480}>
          <Input label="Código GCC" value={form.gcc} onChange={e => setForm({ ...form, gcc: e.target.value })} placeholder="Ex: OBS308" />
          <Input label="Nome Abreviado" value={form.shortName} onChange={e => setForm({ ...form, shortName: e.target.value.slice(0,15) })} placeholder="Ex: CBSP (máx. 15 car.)" />
          <Input label="Nome completo" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: CBSP - CURSO BÁSICO DE SEGURANÇA DE PLATAFORMA" />
          <Sel label="Área" value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} opts={areas.map(a => ({ v: a.id, l: `${a.name} — ${a.leader}` }))} />
          <Input label="Carga Horária Total (minutos)" type="number" value={form.totalMinutes} onChange={e => setForm({ ...form, totalMinutes: e.target.value })} placeholder="Ex: 2400" />
          {form.totalMinutes > 0 && <p style={{ color: "#64748b", fontSize: 12, margin: "-4px 0 12px" }}>= {fmtMin(+form.totalMinutes)}</p>}
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Horário padrão? <span style={{ color: "#64748b", fontSize: 11 }}>(Sim = 08:00–17:00 com almoço 12:00–13:00)</span></label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div onClick={() => setForm({ ...form, defaultSchedule: !form.defaultSchedule })}
                style={{ width: 42, height: 24, borderRadius: 12, background: form.defaultSchedule ? "#ffa619" : "#154753", position: "relative", transition: "background 0.2s", cursor: "pointer", flexShrink: 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: form.defaultSchedule ? 21 : 3, transition: "left 0.2s" }} />
              </div>
              <span style={{ color: form.defaultSchedule ? "#ffa619" : "#64748b", fontSize: 13, fontWeight: 600 }}>{form.defaultSchedule ? "Sim — Padrão 08:00–17:00" : "Não — Solicitar horário na programação"}</span>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Modalidade EAD? <span style={{ color: "#64748b", fontSize: 11 }}>(Ativo = libera locais online nos módulos)</span></label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div onClick={() => setForm({ ...form, ead: !form.ead })}
                style={{ width: 42, height: 24, borderRadius: 12, background: form.ead ? "#10b981" : "#154753", position: "relative", transition: "background 0.2s", cursor: "pointer", flexShrink: 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: form.ead ? 21 : 3, transition: "left 0.2s" }} />
              </div>
              <span style={{ color: form.ead ? "#10b981" : "#64748b", fontSize: 13, fontWeight: 600 }}>{form.ead ? "EAD — Módulos online" : "Presencial"}</span>
            </div>
          </div>
          <Btn onClick={saveTraining} label="Salvar Treinamento" icon="check" color="#16a34a" />
        </Modal>
      )}
    </div>
  );
};
