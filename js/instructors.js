// ── INSTRUCTOR ACCORDION (must be outside InstructorsPage to avoid remount) ──
const InstructorAcc = ({ open, onToggle, title, count, children }) => (
  <div style={{ background: "#073d4a", borderRadius: 16, border: "1px solid #154753", marginBottom: 12, overflow: "hidden" }}>
    <button onClick={onToggle} style={{ width: "100%", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{title}{count != null && <span style={{ color: "#ffa619", fontWeight: 400, fontSize: 13, marginLeft: 8 }}>({count})</span>}</span>
      <span style={{ color: "#64748b", fontSize: 11 }}>{open ? "▲" : "▼"}</span>
    </button>
    {open && <div style={{ borderTop: "1px solid #154753", padding: 20 }}>{children}</div>}
  </div>
);

// ── INSTRUCTORS ───────────────────────────────────────────────────────────────
const InstructorsPage = ({ instructors, setInstructors, trainings, user, users, areas }) => {
  const statusColor = s => s === "Ativo" ? "#16a34a" : s === "Inativo" ? "#ef4444" : "#f59e0b";
  const allModuleOpts = [
    { v: TRANSLATOR_SKILL, l: `🌐 Tradutor` },
    ...trainings.flatMap(t => (t.modules || []).map(m => ({ v: m.name, l: `${t.gcc} · ${m.name}` })))
  ];
  const groupSkills = skills => {
    const map = {};
    const seen = new Set();
    (skills || []).forEach(skill => {
      const sName   = typeof skill === 'string' ? skill : skill.name;
      if (!sName || seen.has(sName)) return;
      seen.add(sName);
      const canLead = typeof skill === 'string' ? false : (skill.canLead || false);
      const t = trainings.find(tr => (tr.modules || []).some(m => m.name === sName));
      const key = t ? t.id : "__outros__";
      if (!map[key]) map[key] = { label: t ? `${t.gcc} — ${t.name.slice(0, 45)}` : "Outros", color: "#64748b", modules: [] };
      map[key].modules.push({ name: sName, canLead });
    });
    return Object.values(map);
  };

  // ── LIST STATE ──
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", contract: "CLT", status: "Ativo", base: "Unidade Macaé", phone: "", email: "", username: "", leader: "" });
  const [delGuard, setDelGuard] = useState({ show: false, action: null, pass: "", err: "" });
  const askDelete = fn => setDelGuard({ show: true, action: fn, pass: "", err: "" });

  const createInstructor = () => {
    if (!newForm.name.trim()) return;
    const unV = (newForm.username||"").trim().toLowerCase();
    if (!unV) { alert("Informe um nome de Usuário para o instrutor."); return; }
    const dupU = users.find(u => u.username === unV);
    const dupI = instructors.find(i => i.username === unV);
    if (dupU || dupI) { alert("Já existe um usuário/instrutor com esse nome de acesso."); return; }
    const newId = Math.max(0, ...instructors.map(i => i.id)) + 1;
    setInstructors([...instructors, { id: newId, ...newForm, username: unV, password: hashPw("inst123"), mustChangePass: true, skills: [] }]);
    setNewForm({ name: "", contract: "CLT", status: "Ativo", base: "Unidade Macaé", phone: "", email: "", username: "", leader: "" });
    setShowNew(false);
  };

  // ── DETAIL STATE ──
  const [detail, setDetail] = useState(null);
  const [personalOpen, setPersonalOpen] = useState(true);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [pForm, setPForm] = useState({});
  const [addingSkill, setAddingSkill] = useState(false);
  const [newSkillVals, setNewSkillVals] = useState(new Set());
  const [newSkillSearch, setNewSkillSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [expandedTrainings, setExpandedTrainings] = useState(new Set());

  const openDetail = i => { setDetail(i); setPersonalOpen(false); setSkillsOpen(false); setEditingPersonal(false); setAddingSkill(false); setNewSkillVals(new Set()); setNewSkillSearch(""); setSkillSearch(""); setExpandedTrainings(new Set()); };

  // ── HELPERS + FILTER STATE (must be before any early return) ──
  const instrAreas = (instr) => {
    const areaIds = new Set(
      (instr.skills || []).flatMap(s => {
        const sName = typeof s === 'string' ? s : s.name;
        const t = trainings.find(tr => (tr.modules || []).some(m => m.name === sName));
        return t && t.area ? [t.area] : [];
      })
    );
    return (areas || []).filter(a => areaIds.has(a.id));
  };
  const uniqueLeaders = [...new Map((areas||[]).map(a => [a.leader, a.leader])).values()].filter(Boolean);
  const [filterLeader, setFilterLeader] = useState("");
  const [filterArea,   setFilterArea]   = useState("");
  const updateInstr = (id, patch) => {
    setInstructors(prev => {
      const upd = prev.map(i => i.id === id ? { ...i, ...patch } : i);
      const updated = upd.find(i => i.id === id) || null;
      // Atualiza detail em microtask para evitar setState aninhado
      Promise.resolve().then(() => setDetail(updated));
      return upd;
    });
  };

  // ── DETAIL VIEW ──
  if (detail) {
    const groups = groupSkills(detail.skills);


    return (
      <div>
        <button onClick={() => { setDetail(null); setEditingPersonal(false); setAddingSkill(false); }}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14, marginBottom: 20, padding: 0 }}>
          <Icon name="back" size={18} color="#94a3b8" /> Voltar para Instrutores
        </button>

        {/* ── HEADER ── */}
        <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753", marginBottom: 16, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ width: 76, height: 76, borderRadius: "50%", background: "linear-gradient(135deg,#ffa619,#e8920a)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 24, flexShrink: 0, boxShadow: "0 4px 12px #ffa61930" }}>
            {detail.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ color: "#fff", fontWeight: 800, margin: "0 0 6px", fontSize: 21 }}>{detail.name}</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>{detail.contract}</span>
              <span style={{ color: "#154753" }}>·</span>
              <span style={{ padding: "2px 10px", borderRadius: 20, background: statusColor(detail.status) + "20", color: statusColor(detail.status), fontSize: 12, fontWeight: 600 }}>{detail.status}</span>
              {detail.leader && <><span style={{ color: "#154753" }}>·</span><span style={{ color: "#64748b", fontSize: 12 }}>Reporta a <strong style={{ color: "#94a3b8" }}>{detail.leader}</strong></span></>}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
              <span style={{ color: "#475569", fontSize: 12 }}>📍 {detail.base}</span>
              <span style={{ color: "#475569", fontSize: 12 }}>🎓 {(detail.skills || []).length} competência{(detail.skills || []).length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <button onClick={() => askDelete(() => { setInstructors(instructors.filter(i => i.id !== detail.id)); setDetail(null); })}
            style={{ background: "none", border: "1px solid #ef444440", borderRadius: 10, padding: "8px 12px", cursor: "pointer", color: "#ef4444", fontSize: 13 }}>Excluir</button>
        </div>

        {/* ── DADOS PESSOAIS ── */}
        <InstructorAcc open={personalOpen} onToggle={() => setPersonalOpen(v => !v)} title="👤 Dados Pessoais">
          {!editingPersonal ? (
            <div>
              {[["Tipo de Contrato", detail.contract], ["Status", detail.status], ["Base", detail.base], ["Telefone", detail.phone || "—"], ["E-mail", detail.email || "—"], ["Usuário", detail.username ? "@" + detail.username : "—"], ["Reporta a (Líder)", detail.leader || "—"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #154753" }}>
                  <span style={{ color: "#64748b", fontSize: 14 }}>{k}</span>
                  <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 500 }}>{v}</span>
                </div>
              ))}
              {canAdmin(user) && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #154753" }}>
                  <span style={{ color: "#64748b", fontSize: 14 }}>Senha de acesso</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#94a3b8", fontSize: 13, fontFamily: "monospace" }}>••••••••</span>
                    <button onClick={() => { if (window.confirm("Resetar senha para 'inst123'? O instrutor precisará trocar no próximo login.")) { updateInstr(detail.id, { password: hashPw("inst123"), mustChangePass: true }); } }} style={{ background: "#154753", border: "none", cursor: "pointer", color: "#ffa619", fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>Resetar</button>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                <Btn onClick={() => { setPForm({ contract: detail.contract, status: detail.status, base: detail.base || "", phone: detail.phone || "", email: detail.email || "", username: detail.username || "", leader: detail.leader || "", password: "" }); setEditingPersonal(true); }} label="Editar Dados" icon="edit" color="#ffa619" sm />
              </div>
            </div>
          ) : (
            <div>
              <Sel label="Tipo de Contrato" value={pForm.contract} onChange={e => setPForm({ ...pForm, contract: e.target.value })} opts={["CLT","CLT Offshore","Freelancer","PJ","Prestador"].map(v => ({ v, l: v }))} />
              <Sel label="Status" value={pForm.status} onChange={e => setPForm({ ...pForm, status: e.target.value })} opts={["Ativo","Inativo","Afastado"].map(v => ({ v, l: v }))} />
              <Sel label="Base" value={pForm.base} onChange={e => setPForm({ ...pForm, base: e.target.value })} opts={["Unidade Macaé","Unidade Rio de Janeiro"].map(v => ({ v, l: v }))} />
              <Input label="Telefone" value={pForm.phone} onChange={e => setPForm({ ...pForm, phone: e.target.value })} placeholder="Ex: (22) 99999-0000" />
              <Input label="E-mail" value={pForm.email} onChange={e => setPForm({ ...pForm, email: e.target.value })} placeholder="Ex: nome@relyonnutec.com" />
              <Input label="Usuário (acesso)" value={pForm.username||""} onChange={e => setPForm({ ...pForm, username: e.target.value.toLowerCase().replace(/\s/g,"") })} placeholder="Ex: joao.silva" />
              <Sel label="Reporta a (Líder)" value={pForm.leader} onChange={e => setPForm({ ...pForm, leader: e.target.value })} opts={[{ v: "", l: "— Sem líder —" }, ...[...new Map((areas||[]).map(a => [a.leader, a.leader])).values()].filter(Boolean).map(v => ({ v, l: v }))]} />
              {canAdmin(user) && (
                <Input label="Nova senha (deixe vazio para manter)" type="text" value={pForm.password} onChange={e => setPForm({ ...pForm, password: e.target.value })} placeholder="Deixe vazio para manter a atual" />
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={() => { const patch = { ...pForm }; if (patch.password) { patch.password = hashPw(patch.password); } else { delete patch.password; } updateInstr(detail.id, patch); setEditingPersonal(false); }} label="Salvar" icon="check" color="#16a34a" sm />
                <Btn onClick={() => setEditingPersonal(false)} label="Cancelar" color="#154753" sm />
              </div>
            </div>
          )}
        </InstructorAcc>

        {/* ── COMPETÊNCIAS ── */}
        <InstructorAcc open={skillsOpen} onToggle={() => setSkillsOpen(v => !v)} title="🎓 Competências" count={(detail.skills || []).length}>
          {/* Search */}
          <div style={{ position: "relative", marginBottom: 14 }}>
            <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={14} color="#64748b" /></div>
            <input value={skillSearch} onChange={e => setSkillSearch(e.target.value)} placeholder="Filtrar competências..."
              style={{ width: "100%", padding: "8px 8px 8px 30px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Add skill */}
          <div style={{ marginBottom: 16 }}>
            {!addingSkill ? (
              hasPermission(user, "skills_edit") && <Btn onClick={() => { setAddingSkill(true); setNewSkillVals(new Set()); setNewSkillSearch(""); }} label="+ Adicionar Competência" color="#ffa619" sm />
            ) : (
              <div style={{ background: "#01323d", borderRadius: 12, padding: 16, border: "1px solid #ffa61940", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <p style={{ color: "#ffa619", fontSize: 13, fontWeight: 700, margin: 0 }}>
                    Adicionar Competências
                    {newSkillVals.size > 0 && <span style={{ color: "#fff", fontWeight: 400, marginLeft: 8 }}>({newSkillVals.size} selecionada(s))</span>}
                  </p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => {
                      const all = new Set();
                      trainings.forEach(t => (t.modules||[]).forEach(m => { if (!(detail.skills||[]).some(s => (s.name||s) === m.name)) all.add(m.name); }));
                      if (!(detail.skills||[]).some(s => (s.name||s) === TRANSLATOR_SKILL)) all.add(TRANSLATOR_SKILL);
                      setNewSkillVals(all);
                    }} style={{ background: "none", border: "1px solid #154753", borderRadius: 6, color: "#94a3b8", fontSize: 11, padding: "2px 8px", cursor: "pointer" }}>Todas</button>
                    <button onClick={() => setNewSkillVals(new Set())}
                      style={{ background: "none", border: "1px solid #154753", borderRadius: 6, color: "#94a3b8", fontSize: 11, padding: "2px 8px", cursor: "pointer" }}>Nenhuma</button>
                  </div>
                </div>
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <div style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={13} color="#64748b" /></div>
                  <input value={newSkillSearch} onChange={e => setNewSkillSearch(e.target.value)} placeholder="Buscar módulo..."
                    style={{ width: "100%", padding: "7px 8px 7px 28px", background: "#073d4a", border: "1px solid #154753", borderRadius: 7, color: "#e2e8f0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                  {!(detail.skills||[]).some(s => (s.name||s) === TRANSLATOR_SKILL) &&
                   (!newSkillSearch || "tradutor".includes(newSkillSearch.toLowerCase())) && (() => {
                    const sel = newSkillVals.has(TRANSLATOR_SKILL);
                    return (
                      <div onClick={() => setNewSkillVals(prev => { const n = new Set(prev); sel ? n.delete(TRANSLATOR_SKILL) : n.add(TRANSLATOR_SKILL); return n; })}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, cursor: "pointer", background: sel ? "#073d4a" : "transparent", border: "1px solid " + (sel ? "#1e6a7a" : "transparent") }}>
                        <div style={{ width: 15, height: 15, borderRadius: 3, border: "2px solid " + (sel ? "#ffa619" : "#1e4a56"), background: sel ? "#ffa619" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {sel && <Icon name="check" size={9} color="#000" />}
                        </div>
                        <span style={{ flex: 1, color: sel ? "#e2e8f0" : "#94a3b8", fontSize: 12 }}>🌐 Tradutor</span>
                      </div>
                    );
                  })()}
                  {trainings.map(t => {
                    const sl = newSkillSearch.toLowerCase();
                    const avail = (t.modules||[]).filter(m =>
                      !(detail.skills||[]).some(s => (s.name||s) === m.name) &&
                      (!sl || m.name.toLowerCase().includes(sl) || t.gcc.toLowerCase().includes(sl) || (t.shortName||'').toLowerCase().includes(sl))
                    );
                    if (avail.length === 0) return null;
                    return (
                      <div key={t.id} style={{ marginBottom: 4 }}>
                        <div style={{ color: "#475569", fontSize: 10, fontWeight: 700, padding: "6px 4px 3px", textTransform: "uppercase", letterSpacing: 0.4 }}>
                          {t.gcc} — {t.name.slice(0, 48)}
                        </div>
                        {avail.map(m => {
                          const sel = newSkillVals.has(m.name);
                          return (
                            <div key={m.name}
                              onClick={() => setNewSkillVals(prev => { const n = new Set(prev); sel ? n.delete(m.name) : n.add(m.name); return n; })}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, cursor: "pointer", marginBottom: 2, background: sel ? "#073d4a" : "transparent", border: "1px solid " + (sel ? "#1e6a7a" : "transparent"), transition: "all 0.1s" }}>
                              <div style={{ width: 15, height: 15, borderRadius: 3, border: "2px solid " + (sel ? "#ffa619" : "#1e4a56"), background: sel ? "#ffa619" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.1s" }}>
                                {sel && <Icon name="check" size={9} color="#000" />}
                              </div>
                              <span style={{ flex: 1, color: sel ? "#e2e8f0" : "#64748b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                              <span style={{ padding: "1px 5px", borderRadius: 4, background: m.type === "PRÁTICA" ? "#16a34a20" : "#ffa61920", color: m.type === "PRÁTICA" ? "#16a34a" : "#ffa619", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{m.type||"TEORIA"}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Btn onClick={() => {
                    if (newSkillVals.size === 0) { setAddingSkill(false); return; }
                    const currentSkills = instructors.find(i => i.id === detail.id)?.skills || [];
                    const existingNames = new Set(currentSkills.map(s => typeof s === 'string' ? s : s.name));
                    const toAdd = [...newSkillVals].filter(n => !existingNames.has(n)).map(name => ({ name, canLead: false }));
                    if (toAdd.length > 0) updateInstr(detail.id, { skills: [...currentSkills, ...toAdd] });
                    setAddingSkill(false); setNewSkillVals(new Set()); setNewSkillSearch("");
                  }} label={newSkillVals.size > 0 ? "Adicionar (" + newSkillVals.size + ")" : "Adicionar"} icon="check" color="#16a34a" sm disabled={newSkillVals.size === 0} />
                  <Btn onClick={() => { setAddingSkill(false); setNewSkillVals(new Set()); setNewSkillSearch(""); }} label="Cancelar" color="#154753" sm />
                </div>
              </div>
            )}
          </div>

          {/* Skills grouped by training — collapsible */}
          {(() => {
            const sl = skillSearch.toLowerCase();
            const filteredGroups = groups.map(g => ({
              ...g,
              modules: sl ? g.modules.filter(m => m.name.toLowerCase().includes(sl)) : g.modules
            })).filter(g => g.modules.length > 0);
            const isExp = gi => sl ? true : expandedTrainings.has(gi);
            const toggle = gi => setExpandedTrainings(s => { const n = new Set(s); n.has(gi) ? n.delete(gi) : n.add(gi); return n; });
            if (filteredGroups.length === 0)
              return <p style={{ color: "#64748b", fontSize: 14 }}>{sl ? `Nenhuma competência encontrada para "${skillSearch}".` : "Nenhuma competência cadastrada."}</p>;
            return filteredGroups.map((g, gi) => (
              <div key={gi} style={{ marginBottom: 8 }}>
                <button onClick={() => toggle(gi)}
                  style={{ width: "100%", background: "#01323d", border: "1px solid #154753", borderRadius: isExp(gi) ? "8px 8px 0 0" : 8, padding: "9px 12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#ffa619", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{g.label}</span>
                    <span style={{ color: "#64748b", fontSize: 11 }}>({g.modules.length})</span>
                  </div>
                  <span style={{ color: "#64748b", fontSize: 10 }}>{isExp(gi) ? "▲" : "▼"}</span>
                </button>
                {isExp(gi) && (
                  <div style={{ border: "1px solid #154753", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                    {g.modules.map((skill, mi) => (
                      <div key={skill.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: mi % 2 === 0 ? "#073d4a" : "#01323d", borderTop: mi > 0 ? "1px solid #154753" : "none" }}>
                        <span style={{ flex: 1, color: "#e2e8f0", fontSize: 12 }}>{skill.name}</span>
                        {skill.name !== TRANSLATOR_SKILL && hasPermission(user, "skills_edit") && (
                          <button
                            title={skill.canLead ? "Marcado como Lead — clique para remover" : "Clique para marcar como Lead Instructor"}
                            onClick={() => updateInstr(detail.id, { skills: (detail.skills || []).map(s => (s.name || s) === skill.name ? { name: s.name || s, canLead: !skill.canLead } : s) })}
                            style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0, border: skill.canLead ? "1px solid #ffa619" : "1px solid #154753", background: skill.canLead ? "#ffa61920" : "transparent", color: skill.canLead ? "#ffa619" : "#475569" }}>
                            LEAD
                          </button>
                        )}
                        {hasPermission(user, "skills_edit") && (
                          <button onClick={() => askDelete(() => updateInstr(detail.id, { skills: (detail.skills || []).filter(s => (s.name || s) !== skill.name) }))}
                            style={{ background: "none", border: "1px solid #ef444430", borderRadius: 6, padding: "3px 8px", color: "#ef4444", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ));
          })()}
        </InstructorAcc>

        <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
      </div>
    );
  }

  const fullyFiltered = instructors.filter(i => {
    if (!i.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterLeader && i.leader !== filterLeader) return false;
    if (filterArea) {
      const ia = instrAreas(i);
      if (!ia.some(a => String(a.id) === String(filterArea))) return false;
    }
    return true;
  });

  // ── LIST VIEW ──
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#fff", fontWeight: 800, margin: 0, fontSize: 24 }}>Instrutores</h2>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>{fullyFiltered.length} de {instructors.length} instrutores</p>
        </div>
        <button onClick={() => setShowNew(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: "#ffa619", border: "none", borderRadius: 10, padding: "10px 18px", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          <Icon name="plus" size={16} color="#fff" /> Novo Instrutor
        </button>
      </div>

      {/* Filters (5.2) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={16} color="#64748b" /></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar instrutor..."
            style={{ width: "100%", padding: "10px 10px 10px 40px", background: "#073d4a", border: "1px solid #154753", borderRadius: 10, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>
        <select value={filterLeader} onChange={e => setFilterLeader(e.target.value)}
          style={{ padding: "10px 12px", background: "#073d4a", border: `1px solid ${filterLeader ? "#ffa619" : "#154753"}`, borderRadius: 10, color: filterLeader ? "#ffa619" : "#94a3b8", fontSize: 13, outline: "none", cursor: "pointer" }}>
          <option value="">Todos os líderes</option>
          {uniqueLeaders.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterArea} onChange={e => setFilterArea(e.target.value)}
          style={{ padding: "10px 12px", background: "#073d4a", border: `1px solid ${filterArea ? "#ffa619" : "#154753"}`, borderRadius: 10, color: filterArea ? "#ffa619" : "#94a3b8", fontSize: 13, outline: "none", cursor: "pointer" }}>
          <option value="">Todas as áreas</option>
          {(areas||[]).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {(filterLeader || filterArea) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {filterLeader && <span style={{ padding: "3px 12px", borderRadius: 20, background: "#ffa61920", color: "#ffa619", fontSize: 12, cursor: "pointer" }} onClick={() => setFilterLeader("")}>✕ Líder: {filterLeader}</span>}
          {filterArea && <span style={{ padding: "3px 12px", borderRadius: 20, background: "#ffa61920", color: "#ffa619", fontSize: 12, cursor: "pointer" }} onClick={() => setFilterArea("")}>✕ Área: {(areas||[]).find(a => String(a.id) === String(filterArea))?.name}</span>}
        </div>
      )}

      {/* LIST TABLE (5.1) */}
      <div style={{ background: "#073d4a", borderRadius: 16, border: "1px solid #154753", overflow: "hidden" }}>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 160px 130px 130px", gap: 0, padding: "10px 20px", borderBottom: "1px solid #154753", background: "#01323d" }}>
          {["","Nome","Contrato · Base","Líder","Áreas de Atuação"].map((h,i) => (
            <span key={i} style={{ color: "#475569", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</span>
          ))}
        </div>
        {fullyFiltered.length === 0 && (
          <p style={{ color: "#475569", padding: "24px 20px", fontSize: 14 }}>Nenhum instrutor encontrado.</p>
        )}
        {fullyFiltered.map((i, idx) => {
          const ia = instrAreas(i);
          return (
            <div key={i.id} onClick={() => openDetail(i)}
              style={{ display: "grid", gridTemplateColumns: "44px 1fr 160px 130px 130px", gap: 0, padding: "12px 20px", borderBottom: idx < fullyFiltered.length - 1 ? "1px solid #154753" : "none", cursor: "pointer", alignItems: "center", transition: "background .12s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#073d4a80"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {/* Avatar */}
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#ffa619,#e8920a)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>
                {i.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              {/* Name + status + contract */}
              <div style={{ minWidth: 0, paddingRight: 8 }}>
                <p style={{ color: "#e2e8f0", fontWeight: 700, margin: "0 0 3px", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</p>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ padding: "1px 8px", borderRadius: 10, background: statusColor(i.status) + "20", color: statusColor(i.status), fontSize: 10, fontWeight: 700 }}>{i.status}</span>
                  <span style={{ padding: "1px 8px", borderRadius: 10, background: "#154753", color: "#94a3b8", fontSize: 10, fontWeight: 600 }}>{i.contract}</span>
                </div>
              </div>
              {/* Contract + Base */}
              <div style={{ minWidth: 0 }}>
                <p style={{ color: "#94a3b8", fontSize: 12, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.contract}</p>
                <p style={{ color: "#475569", fontSize: 11, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {i.base}</p>
              </div>
              {/* Leader */}
              <p style={{ color: "#64748b", fontSize: 12, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.leader || "—"}</p>
              {/* Areas (5.3) */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {ia.length === 0
                  ? <span style={{ color: "#475569", fontSize: 11 }}>—</span>
                  : ia.map(a => <span key={a.id} style={{ padding: "2px 7px", borderRadius: 8, background: (a.color||"#64748b") + "22", color: a.color||"#64748b", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{a.name}</span>)
                }
              </div>
            </div>
          );
        })}
      </div>

      {showNew && (
        <Modal title="Novo Instrutor" onClose={() => setShowNew(false)} width={480}>
          <Input label="Nome completo" value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} placeholder="Ex: João da Silva" />
          <Sel label="Tipo de contrato" value={newForm.contract} onChange={e => setNewForm({ ...newForm, contract: e.target.value })} opts={["CLT","CLT Offshore","Freelancer","PJ","Prestador"].map(v => ({ v, l: v }))} />
          <Sel label="Status" value={newForm.status} onChange={e => setNewForm({ ...newForm, status: e.target.value })} opts={["Ativo","Inativo","Afastado"].map(v => ({ v, l: v }))} />
          <Sel label="Base" value={newForm.base} onChange={e => setNewForm({ ...newForm, base: e.target.value })} opts={["Unidade Macaé","Unidade Rio de Janeiro"].map(v => ({ v, l: v }))} />
          <Sel label="Reporta a (Líder)" value={newForm.leader} onChange={e => setNewForm({ ...newForm, leader: e.target.value })} opts={[{ v: "", l: "— Sem líder —" }, ...[...new Map((areas||[]).map(a => [a.leader, a.leader])).values()].filter(Boolean).map(v => ({ v, l: v }))]} />
          <Input label="Telefone" value={newForm.phone} onChange={e => setNewForm({ ...newForm, phone: e.target.value })} placeholder="Ex: (22) 99999-0000" />
          <Input label="E-mail" value={newForm.email} onChange={e => setNewForm({ ...newForm, email: e.target.value })} placeholder="Ex: nome@relyonnutec.com" />
          <Input label="Usuário (nome de acesso)" value={newForm.username||""} onChange={e => setNewForm({ ...newForm, username: e.target.value.toLowerCase().replace(/\s/g,"") })} placeholder="Ex: joao.silva (sem espaços)" />
          <Btn onClick={createInstructor} label="Criar Instrutor" icon="check" color="#16a34a" />
        </Modal>
      )}
      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
    </div>
  );
};

