// ── LOCALS ────────────────────────────────────────────────────────────────────
const LocalsPage = ({ schedules, locals, setLocals, user }) => {
  const [search,      setSearch]      = useState("");
  const [activeGroup, setActiveGroup] = useState("Todos");
  const [showModal,   setShowModal]   = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [form,        setForm]        = useState({ name: "", type: "RelyOn Macaé", env: "Teórico", subtype: "", capacity: "" });
  const [delGuard,    setDelGuard]    = useState({ show: false, action: null, pass: "", err: "" });
  const askDelete = fn => setDelGuard({ show: true, action: fn, pass: "", err: "" });

  const today = new Date().toISOString().split("T")[0];
  const isOcc = name => schedules.some(s => s.local === name && s.date === today && (s.status === "Confirmado" || s.status === "Pendente"));

  const grouped = [
    { name: "RelyOn Macaé — Teórico", color: "#ffa619", items: locals.filter(l => l.type === "RelyOn Macaé" && l.env === "Teórico") },
    { name: "Piscinas",               color: "#ffa619", items: locals.filter(l => l.subtype === "piscina") },
    { name: "Combate a Incêndio",     color: "#ef4444", items: locals.filter(l => l.subtype === "incendio") },
    { name: "Industrial / Rigger",    color: "#f97316", items: locals.filter(l => l.subtype === "industrial") },
    { name: "Manobras",               color: "#8b5cf6", items: locals.filter(l => l.subtype === "manobra") },
    { name: "Offshore",               color: "#e8920a", items: locals.filter(l => l.type === "Offshore") },
    { name: "In Company",             color: "#f59e0b", items: locals.filter(l => l.type === "In Company") },
    { name: "Online",                 color: "#10b981", items: locals.filter(l => l.type === "Online") },
  ].filter(g => g.items.length > 0);

  const visibleGroups = activeGroup === "Todos" ? grouped : grouped.filter(g => g.name === activeGroup);
  const filtered = visibleGroups
    .map(g => ({ ...g, items: g.items.filter(l => l.name.toLowerCase().includes(search.toLowerCase())) }))
    .filter(g => g.items.length > 0);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", type: "RelyOn Macaé", env: "Teórico", subtype: "", capacity: "" });
    setShowModal(true);
  };
  const openEdit = l => {
    setEditing(l);
    setForm({ name: l.name, type: l.type, env: l.env || "—", subtype: l.subtype || "", capacity: l.capacity ? String(l.capacity) : "" });
    setShowModal(true);
  };
  const saveLocal = () => {
    if (!form.name.trim()) return;
    const obj = {
      name: form.name.trim().toUpperCase(),
      type: form.type,
      env:  form.env,
      ...(form.subtype  ? { subtype:  form.subtype   } : {}),
      ...(form.capacity ? { capacity: +form.capacity } : {}),
    };
    if (editing) {
      setLocals(locals.map(l => l.id === editing.id ? { ...l, ...obj } : l));
    } else {
      const newId = Math.max(0, ...locals.map(l => l.id)) + 1;
      setLocals([...locals, { id: newId, ...obj }]);
    }
    setShowModal(false);
  };
  const delLocal = id => askDelete(() => setLocals(locals.filter(l => l.id !== id)));
  const canEdit = hasPermission(user, "locals_edit");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div>
          <h2 style={{ color: "#fff", fontWeight: 800, margin: 0, fontSize: 24 }}>Locais</h2>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>{locals.length} locais cadastrados</p>
        </div>
        {canEdit && <Btn onClick={openAdd} label="Novo Local" icon="plus" />}
      </div>
      <div style={{ display: "flex", gap: 8, margin: "20px 0", flexWrap: "wrap" }}>
        <button onClick={() => setActiveGroup("Todos")}
          style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${activeGroup === "Todos" ? "#fff" : "#154753"}`, background: activeGroup === "Todos" ? "#fff" : "transparent", color: activeGroup === "Todos" ? "#01323d" : "#94a3b8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          TODOS ({locals.length})
        </button>
        {grouped.map(g => (
          <button key={g.name} onClick={() => setActiveGroup(activeGroup === g.name ? "Todos" : g.name)}
            style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${activeGroup === g.name ? g.color : "#154753"}`, background: activeGroup === g.name ? g.color + "20" : "transparent", color: activeGroup === g.name ? g.color : "#94a3b8", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} />
            {g.name} ({g.items.length})
          </button>
        ))}
      </div>
      <div style={{ position: "relative", marginBottom: 20 }}>
        <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={16} color="#64748b" /></div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar local..."
          style={{ width: "100%", padding: "10px 10px 10px 40px", background: "#073d4a", border: "1px solid #154753", borderRadius: 10, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
      </div>
      {filtered.map(g => (
        <div key={g.name} style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: g.color }} />
            <h3 style={{ color: "#e2e8f0", fontWeight: 700, margin: 0, fontSize: 15 }}>{g.name}</h3>
            <span style={{ color: "#64748b", fontSize: 13 }}>{g.items.length} local(is)</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
            {g.items.map(l => {
              const occ = isOcc(l.name);
              const lc  = localColor(l.name);
              return (
                <div key={l.id} style={{ background: "#073d4a", borderRadius: 12, padding: 14, border: `1px solid ${occ ? "#ef4444" : lc + "40"}`, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: occ ? "#ef4444" : lc }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Icon name="location" size={14} color={occ ? "#ef4444" : lc} />
                    <span style={{ padding: "2px 6px", borderRadius: 20, background: occ ? "#ef444420" : lc + "20", color: occ ? "#ef4444" : lc, fontSize: 10, fontWeight: 700 }}>{occ ? "EM USO" : "LIVRE"}</span>
                  </div>
                  <p style={{ color: "#e2e8f0", fontWeight: 600, margin: 0, fontSize: 12, lineHeight: 1.3 }}>{l.name}</p>
                  {l.capacity && <p style={{ color: "#64748b", fontSize: 11, margin: "4px 0 0" }}>até {l.capacity} alunos</p>}
                  {canEdit && (
                    <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                      <button onClick={() => openEdit(l)}
                        style={{ flex: 1, padding: "4px 8px", background: "#154753", border: "none", borderRadius: 6, color: "#94a3b8", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <Icon name="edit" size={11} color="#94a3b8" /> Editar
                      </button>
                      <button onClick={() => delLocal(l.id)}
                        style={{ padding: "4px 8px", background: "none", border: "1px solid #ef444440", borderRadius: 6, cursor: "pointer" }}>
                        <Icon name="delete" size={11} color="#ef4444" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <p style={{ color: "#64748b", textAlign: "center", padding: 40 }}>Nenhum local encontrado.</p>}
      {showModal && (
        <Modal title={editing ? "Editar Local" : "Novo Local"} onClose={() => setShowModal(false)} width={480}>
          <Input label="Nome do Local" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: SALA 25" />
          <Sel label="Tipo" value={form.type}
            onChange={e => setForm({ ...form, type: e.target.value, env: e.target.value === "RelyOn Macaé" ? "Teórico" : "—", subtype: "" })}
            opts={[{ v: "RelyOn Macaé", l: "RelyOn Macaé" }, { v: "Offshore", l: "Offshore" }, { v: "In Company", l: "In Company" }, { v: "Online", l: "Online" }]} />
          {form.type === "RelyOn Macaé" && (
            <Sel label="Ambiente" value={form.env}
              onChange={e => setForm({ ...form, env: e.target.value, subtype: "" })}
              opts={[{ v: "Teórico", l: "Teórico" }, { v: "Prático", l: "Prático" }]} />
          )}
          {form.type === "RelyOn Macaé" && form.env === "Prático" && (
            <Sel label="Subtipo Prático" value={form.subtype}
              onChange={e => setForm({ ...form, subtype: e.target.value })}
              opts={[{ v: "piscina", l: "Piscina" }, { v: "incendio", l: "Combate a Incêndio" }, { v: "industrial", l: "Industrial / Rigger" }, { v: "manobra", l: "Manobras (Coxswain)" }]}
              placeholder="Selecionar..." />
          )}
          {form.type === "RelyOn Macaé" && form.env === "Teórico" && (
            <Input label="Capacidade (alunos)" type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="Ex: 20" />
          )}
          <Btn onClick={saveLocal} label={editing ? "Salvar Alterações" : "Criar Local"} icon="check" color="#16a34a" disabled={!form.name.trim()} />
        </Modal>
      )}
      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
    </div>
  );
};

