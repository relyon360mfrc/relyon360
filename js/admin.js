// ── USERS PAGE ────────────────────────────────────────────────────────────────
const UsersPage = ({ users, setUsers, currentUser, instructors }) => {
  const BLANK = { name: "", email: "", username: "", password: "", role: "planejador", avatar: "", permissions: [], linkedInstructorId: "" };
  const [form, setForm]       = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [delGuard, setDelGuard] = useState({ show: false, action: null, pass: "", err: "" });
  const askDelete = fn => setDelGuard({ show: true, action: fn, pass: "", err: "" });

  const openNew  = () => { setForm(BLANK); setEditing(null); setShowForm(true); };
  const openEdit = u => { setForm({ name: u.name, email: u.email, username: u.username || "", password: "", role: u.role, avatar: u.avatar || u.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase(), permissions: u.permissions || [], linkedInstructorId: u.linkedInstructorId || "" }); setEditing(u); setShowForm(true); };
  const [unameErr, setUnameErr] = useState("");
  const checkUsername = (val) => {
    const v = (val||"").trim().toLowerCase();
    if (!v) { setUnameErr(""); return; }
    const dupUser  = users.find(u => u.username === v && (!editing || u.id !== editing.id));
    const dupInstr = (instructors||[]).find(i => i.username === v);
    if (dupUser || dupInstr) setUnameErr("⚠ Já existe um usuário/instrutor com esse nome de acesso.");
    else setUnameErr("");
  };
  const save = () => {
    if (!form.name.trim() || !form.email.trim()) return;
    if (!form.username.trim()) return;
    const v = form.username.trim().toLowerCase();
    const dupUser  = users.find(u => u.username === v && (!editing || u.id !== editing.id));
    const dupInstr = (instructors||[]).find(i => i.username === v);
    if (dupUser || dupInstr) { setUnameErr("⚠ Já existe um usuário/instrutor com esse nome de acesso."); return; }
    const av = form.avatar || form.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
    // linkedInstructorId: normalizar — número se preenchido, ou undefined se vazio
    const linkedId = form.linkedInstructorId ? Number(form.linkedInstructorId) : undefined;
    const cleanForm = { ...form, linkedInstructorId: linkedId };
    // Hash password: new user requires password; editing keeps existing if empty
    if (editing) {
      const patch = { ...cleanForm, username: v, avatar: av };
      if (patch.password) { patch.password = hashPw(patch.password); } else { delete patch.password; }
      setUsers(users.map(u => u.id === editing.id ? { ...u, ...patch } : u));
    } else {
      if (!cleanForm.password) { alert("Informe uma senha para o novo usuário."); return; }
      setUsers([...users, { id: Date.now(), ...cleanForm, password: hashPw(cleanForm.password), username: v, avatar: av, mustChangePass: true }]);
    }
    setUnameErr(""); setShowForm(false); setEditing(null); setForm(BLANK);
  };
  const togglePerm = p => setForm({ ...form, permissions: form.permissions.includes(p) ? form.permissions.filter(x => x !== p) : [...form.permissions, p] });

  const roleColor = { developer: "#8b5cf6", admin: "#ffa619", planejador: "#3b82f6", customer_service: "#06b6d4" };
  const groups = [...new Set(PERMISSIONS_LIST.map(p => p.group))];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div><h2 style={{ color: "#fff", fontWeight: 800, margin: 0, fontSize: 24 }}>Usuários</h2>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>Gerenciar contas e níveis de acesso</p></div>
        <Btn onClick={openNew} label="Novo Usuário" icon="plus" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
        {users.map(u => (
          <div key={u.id} style={{ background: "#073d4a", borderRadius: 16, padding: 20, border: "1px solid #154753" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#ffa619,#e8920a)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{u.avatar}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: "#e2e8f0", fontWeight: 700, margin: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</p>
                <p style={{ color: "#64748b", fontSize: 12, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</p>
                {u.username && <p style={{ color: "#ffa619", fontSize: 11, margin: "1px 0 0", fontWeight: 600 }}>@{u.username}</p>}
              </div>
              <span style={{ padding: "3px 10px", borderRadius: 20, background: (roleColor[u.role]||"#64748b")+"25", color: roleColor[u.role]||"#64748b", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {ROLE_LABELS[u.role]||u.role}
              </span>
            </div>
            {u.role === "planejador" && (u.permissions||[]).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                {(u.permissions||[]).slice(0,4).map(p => { const pl = PERMISSIONS_LIST.find(x=>x.id===p); return pl ? <span key={p} style={{ padding: "2px 7px", borderRadius: 5, background: "#3b82f620", color: "#93c5fd", fontSize: 10 }}>{pl.label}</span> : null; })}
                {(u.permissions||[]).length > 4 && <span style={{ color: "#64748b", fontSize: 10 }}>+{u.permissions.length-4}</span>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, borderTop: "1px solid #154753", paddingTop: 12 }}>
              <button onClick={() => openEdit(u)} style={{ flex: 1, background: "#154753", border: "none", borderRadius: 8, padding: "8px 0", color: "#e2e8f0", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Editar</button>
              {u.id !== currentUser.id && (
                <button onClick={() => askDelete(() => setUsers(users.filter(x => x.id !== u.id)))} style={{ background: "none", border: "1px solid #ef444440", borderRadius: 8, padding: "8px 12px", cursor: "pointer", color: "#ef4444", fontSize: 13 }}>✕</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <BackupPanel />
      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={currentUser} />
      {showForm && (
        <Modal title={editing ? "Editar Usuário" : "Novo Usuário"} onClose={() => { setShowForm(false); setEditing(null); }} width={560}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1/-1" }}><Input label="Nome completo" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ex: João da Silva" /></div>
            <Input label="E-mail" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="joao@relyonnutec.com" />
            <Input label={editing ? "Nova senha (vazio = manter)" : "Senha"} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder={editing ? "Deixe vazio para manter" : "••••••••"} />
          </div>
          <Input label="Usuário (nome de acesso)" value={form.username} onChange={e => { const v = e.target.value.toLowerCase().replace(/\s/g,""); setForm({...form, username: v}); checkUsername(v); }} placeholder="Ex: joao.silva (sem espaços)" />
          {unameErr && <p style={{ color: "#f87171", fontSize: 12, margin: "-10px 0 10px" }}>{unameErr}</p>}
          {!editing && <p style={{ color: "#94a3b8", fontSize: 12, margin: "-8px 0 12px" }}>O usuário precisará alterar a senha no primeiro acesso.</p>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          </div>
          <Sel label="Nível de Acesso" value={form.role} onChange={e => setForm({...form, role: e.target.value, permissions: []})}
            opts={[
              { v: "developer",        l: "Desenvolvedor — acesso total ao sistema"          },
              { v: "admin",            l: "Administrador — gerencia usuários e configurações" },
              { v: "planejador",       l: "Planejador — permissões configuráveis abaixo"     },
              { v: "customer_service", l: "Customer Service — relatórios de turmas"          },
            ]} />
          {form.role === "planejador" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 10 }}>Permissões do Planejador</label>
              {groups.map(grp => (
                <div key={grp} style={{ marginBottom: 12 }}>
                  <p style={{ color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>{grp}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {PERMISSIONS_LIST.filter(p => p.group === grp).map(p => (
                      <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 10px", borderRadius: 8, background: form.permissions.includes(p.id) ? "#3b82f620" : "#01323d", border: `1px solid ${form.permissions.includes(p.id) ? "#3b82f6" : "#154753"}` }}>
                        <div onClick={() => togglePerm(p.id)}
                          style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${form.permissions.includes(p.id) ? "#3b82f6" : "#154753"}`, background: form.permissions.includes(p.id) ? "#3b82f6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {form.permissions.includes(p.id) && <Icon name="check" size={12} color="#fff" />}
                        </div>
                        <span style={{ color: form.permissions.includes(p.id) ? "#93c5fd" : "#94a3b8", fontSize: 13 }}>{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {form.role === "developer"       && <p style={{ color: "#8b5cf6", fontSize: 13, background: "#8b5cf620", padding: "8px 12px", borderRadius: 8, margin: "0 0 14px" }}>⚡ Desenvolvedor tem acesso irrestrito a todos os recursos do sistema.</p>}
          {form.role === "admin"           && <p style={{ color: "#ffa619",  fontSize: 13, background: "#ffa61920", padding: "8px 12px", borderRadius: 8, margin: "0 0 14px" }}>🔑 Administrador pode gerenciar usuários e todos os itens de configuração.</p>}
          {form.role === "customer_service"&& <p style={{ color: "#06b6d4", fontSize: 13, background: "#06b6d420", padding: "8px 12px", borderRadius: 8, margin: "0 0 14px" }}>📊 Customer Service acessa relatórios de turmas.</p>}
          <div style={{ marginBottom: 14 }}>
            <SearchSel
              label="Instrutor Vinculado (opcional)"
              value={form.linkedInstructorId ? String(form.linkedInstructorId) : ""}
              onChange={e => setForm({ ...form, linkedInstructorId: e.target.value })}
              opts={[
                { v: "", l: "— Nenhum —" },
                ...(instructors || []).map(i => ({ v: String(i.id), l: i.name }))
              ]}
              placeholder="Buscar instrutor..."
            />
            <p style={{ color: "#64748b", fontSize: 11, margin: "4px 0 0" }}>
              Se vinculado, o usuário pode consultar a agenda e o histórico do instrutor escolhido no Relatórios → Meu Histórico.
            </p>
          </div>
          <Btn onClick={save} label={editing ? "Salvar Alterações" : "Criar Usuário"} icon="check" color="#16a34a" />
        </Modal>
      )}
    </div>
  );
};

// ── BACKUP PANEL ──────────────────────────────────────────────────────────────
const BackupPanel = () => {
  const [status, setStatus] = React.useState(null);
  const [lastSaveOk, setLastSaveOk] = React.useState(true);

  React.useEffect(() => {
    const unsub = onSaveEvent(ev => setLastSaveOk(ev.ok));
    return unsub;
  }, []);

  const doBackup = async () => {
    setStatus("downloading");
    await window.__exportBackup();
    setStatus("done");
    setTimeout(() => setStatus(null), 3000);
  };

  return (
    <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753", marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: lastSaveOk ? "#16a34a20" : "#ef444420", border: `1px solid ${lastSaveOk ? "#16a34a" : "#ef4444"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
          {lastSaveOk ? "✅" : "⚠️"}
        </div>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Status do Banco de Dados</div>
          <div style={{ color: lastSaveOk ? "#16a34a" : "#ef4444", fontSize: 12 }}>
            {lastSaveOk ? "Saves funcionando normalmente" : "ATENÇÃO: último save falhou — faça backup agora!"}
          </div>
        </div>
      </div>
      <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px" }}>
        Baixe um arquivo JSON com todos os dados do sistema. Guarde em local seguro e faça isso periodicamente.
      </p>
      <button onClick={doBackup} disabled={status === "downloading"}
        style={{ padding: "10px 20px", background: status === "done" ? "#16a34a" : "#ffa619", border: "none", borderRadius: 10, color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
        {status === "downloading" ? "Baixando..." : status === "done" ? "✅ Backup baixado!" : "⬇️ Exportar Backup JSON"}
      </button>
    </div>
  );
};

// ── ABSENTEISMO PAGE ───────────────────────────────────────────────────────────
const AbsenteismoPage = ({ instructors, absences, setAbsences, user }) => {
  const BLANK = { instructorId: "", type: "", category: "", startDate: "", endDate: "", startTime: "08:00", endTime: "17:00", obs: "" };
  const [form, setForm]       = useState(BLANK);
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterInstr, setFilterInstr] = useState("");
  const [delGuard, setDelGuard] = useState({ show: false, action: null, pass: "", err: "" });
  const askDelete = fn => setDelGuard({ show: true, action: fn, pass: "", err: "" });

  const cats = form.type ? ABSENCE_TYPES[form.type]?.categories || [] : [];
  const filtered = absences.filter(a =>
    (!filterType || a.type === filterType) &&
    (!filterInstr || String(a.instructorId) === filterInstr)
  );

  const save = () => {
    if (!form.instructorId || !form.type || !form.category || !form.startDate) return;
    if (!isFullDayAbsence(form.category) && (!form.startTime || !form.endTime)) return;
    const instr = instructors.find(i => i.id === +form.instructorId);
    setAbsences([...absences, { ...form, id: Date.now(), instructorId: +form.instructorId, instructorName: instr?.name || "" }]);
    setShowForm(false); setForm(BLANK);
  };

  const typeInfo = t => ABSENCE_TYPES[t] || { label: t, color: "#64748b" };
  const daysBetween = (s, e) => { if (!s||!e) return "—"; const d = (new Date(e)-new Date(s))/(1000*60*60*24); return d >= 0 ? `${d+1} dias` : "—"; };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div><h2 style={{ color: "#fff", fontWeight: 800, margin: 0, fontSize: 24 }}>Absenteísmo</h2>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>Registro de ausências e afastamentos</p></div>
        <Btn onClick={() => { setForm(BLANK); setShowForm(true); }} label="Registrar Ausência" icon="plus" />
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        {Object.entries(ABSENCE_TYPES).map(([k,v]) => (
          <div key={k} style={{ background: "#073d4a", borderRadius: 12, padding: "12px 16px", border: `1px solid ${v.color}40`, flex: 1, minWidth: 160 }}>
            <p style={{ color: v.color, fontSize: 12, fontWeight: 700, margin: "0 0 4px" }}>{v.label}</p>
            <p style={{ color: "#fff", fontSize: 28, fontWeight: 800, margin: 0 }}>{absences.filter(a => a.type === k).length}</p>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: "8px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none" }}>
          <option value="">Todos os tipos</option>
          {Object.entries(ABSENCE_TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterInstr} onChange={e => setFilterInstr(e.target.value)}
          style={{ padding: "8px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none" }}>
          <option value="">Todos os instrutores</option>
          {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <div style={{ background: "#073d4a", borderRadius: 16, padding: 48, textAlign: "center", border: "1px solid #154753" }}>
          <p style={{ color: "#64748b", fontSize: 15 }}>Nenhuma ausência registrada.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(a => {
            const ti = typeInfo(a.type);
            return (
              <div key={a.id} style={{ background: "#073d4a", borderRadius: 14, padding: "16px 20px", border: "1px solid #154753", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: ti.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ color: "#e2e8f0", fontWeight: 700, margin: 0, fontSize: 14 }}>{a.instructorName}</p>
                  <p style={{ color: "#64748b", fontSize: 12, margin: "2px 0 0" }}>{a.category}</p>
                </div>
                <div style={{ textAlign: "center", minWidth: 100 }}>
                  <span style={{ padding: "3px 10px", borderRadius: 20, background: ti.color+"25", color: ti.color, fontSize: 11, fontWeight: 700 }}>{ti.label.replace("Absenteísmo ","").replace("Ausência ","Aus. ")}</span>
                </div>
                <div style={{ textAlign: "center", minWidth: 120 }}>
                  <p style={{ color: "#e2e8f0", fontSize: 13, margin: 0 }}>{new Date(a.startDate+"T12:00:00").toLocaleDateString("pt-BR")} — {new Date(a.endDate+"T12:00:00").toLocaleDateString("pt-BR")}</p>
                  <p style={{ color: "#64748b", fontSize: 11, margin: "2px 0 0" }}>{daysBetween(a.startDate, a.endDate)}</p>
                  {!isFullDayAbsence(a.category) && a.startTime && a.endTime && (
                    <p style={{ color: "#ffa619", fontSize: 11, margin: "2px 0 0", fontWeight: 600 }}>⏰ {a.startTime} – {a.endTime}</p>
                  )}
                </div>
                {a.obs && <p style={{ color: "#94a3b8", fontSize: 12, flex: 1, minWidth: 120, margin: 0 }}>{a.obs}</p>}
                <button onClick={() => askDelete(() => setAbsences(absences.filter(x => x.id !== a.id)))} style={{ background: "none", border: "1px solid #ef444440", borderRadius: 8, padding: "6px 8px", cursor: "pointer", flexShrink: 0 }}><Icon name="delete" size={14} color="#ef4444" /></button>
              </div>
            );
          })}
        </div>
      )}
      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
      {showForm && (
        <Modal title="Registrar Ausência" onClose={() => setShowForm(false)} width={500}>
          <Sel label="Instrutor" value={form.instructorId} onChange={e => setForm({...form, instructorId: e.target.value})} opts={instructors.map(i => ({v: i.id, l: i.name}))} />
          <Sel label="Tipo de Ausência" value={form.type} onChange={e => setForm({...form, type: e.target.value, category: ""})}
            opts={Object.entries(ABSENCE_TYPES).map(([k,v]) => ({v: k, l: v.label}))} />
          {form.type && (
            <Sel label="Categoria" value={form.category} onChange={e => setForm({...form, category: e.target.value})}
              opts={cats.map(c => ({v: c, l: c}))} />
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="Data de Início" type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
            <Input label="Data de Término" type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
          </div>
          {form.startDate && form.endDate && <p style={{ color: "#64748b", fontSize: 12, margin: "-4px 0 12px" }}>{daysBetween(form.startDate, form.endDate)}</p>}
          {form.category && !isFullDayAbsence(form.category) && (
            <div>
              <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Horário de Ausência</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <Input label="Hora Início" type="time" value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} />
                <Input label="Hora Término" type="time" value={form.endTime} onChange={e => setForm({...form, endTime: e.target.value})} />
              </div>
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Observações <span style={{ color: "#64748b" }}>(opcional)</span></label>
            <textarea value={form.obs} onChange={e => setForm({...form, obs: e.target.value})} rows={2}
              style={{ width: "100%", padding: "10px 12px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
          </div>
          <Btn onClick={save} label="Registrar" icon="check" color="#16a34a" />
        </Modal>
      )}
    </div>
  );
};

// ── SETTINGS ──────────────────────────────────────────────────────────────────
const maskPhone = v => {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};

const SettingsPage = ({ areas, setAreas, user }) => {
  const BLANK_FORM = { name: "", color: "#ffa619", leader: "", leaderEmail: "", whatsapp: "" };
  const [showNew,   setShowNew]   = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState(BLANK_FORM);
  const [delGuard,  setDelGuard]  = useState({ show: false, action: null, pass: "", err: "" });
  const [saveGuard, setSaveGuard] = useState({ show: false, action: null, pass: "", err: "" });
  const askDelete = (fn) => setDelGuard({ show: true, action: fn, pass: "", err: "" });
  const askSave   = (fn) => setSaveGuard({ show: true, action: fn, pass: "", err: "" });
  const confirmSave = () => {
    if (!checkPw(saveGuard.pass, user?.password)) { setSaveGuard({ ...saveGuard, err: "Senha incorreta." }); return; }
    saveGuard.action();
    setSaveGuard({ show: false, action: null, pass: "", err: "" });
  };

  // 6.3 — Paleta de cores com azul incluído
  const COLORS = [
    "#ffa619","#e8920a","#ef4444","#f97316",
    "#f59e0b","#16a34a","#10b981","#ec4899",
    "#3b82f6","#2563eb","#06b6d4","#64748b",
  ];

  const openNew  = () => { setForm(BLANK_FORM); setEditing(null); setShowNew(true); };
  const openEdit = a  => {
    setForm({ name: a.name, color: a.color, leader: a.leader, leaderEmail: a.leaderEmail, whatsapp: a.whatsapp || "" });
    setEditing(a);
    setShowNew(true);
  };
  const save = () => {
    if (!form.name || !form.leader) return;
    askSave(() => {
      if (editing) setAreas(areas.map(a => a.id === editing.id ? { ...a, ...form } : a));
      else setAreas([...areas, { id: Date.now(), ...form }]);
      setShowNew(false);
    });
  };

  return (
    <div>
      <h2 style={{ color: "#fff", fontWeight: 800, margin: "0 0 4px", fontSize: 24 }}>Configurações</h2>
      <p style={{ color: "#64748b", margin: "0 0 28px", fontSize: 14 }}>Gerencie as áreas de negócio — base de toda a estrutura</p>
      <div style={{ background: "#073d4a", borderRadius: 16, border: "1px solid #154753", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #154753", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><h3 style={{ color: "#fff", fontWeight: 700, margin: 0, fontSize: 16 }}>Áreas de Negócio</h3>
            <p style={{ color: "#64748b", fontSize: 13, margin: "2px 0 0" }}>Cada área tem um líder responsável e agrupa os treinamentos</p>
          </div>
          {canAdmin(user) && <Btn onClick={openNew} label="Nova Área" icon="plus" sm />}
        </div>
        {areas.map((a, i) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 24px", borderBottom: i < areas.length - 1 ? "1px solid #154753" : "none" }}>
            {/* 6.1 — Ícone de cor sem badge "ÁREA N" */}
            <div style={{ width: 44, height: 44, borderRadius: 12, background: a.color + "20", border: `2px solid ${a.color}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: a.color }} />
            </div>
            <div style={{ flex: 1 }}>
              {/* 6.1 — Nome da área sem o badge de índice */}
              <p style={{ color: "#fff", fontWeight: 800, fontSize: 15, margin: "0 0 6px" }}>{a.name}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#ffa619,#e8920a)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {a.leader.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <p style={{ color: "#e2e8f0", fontSize: 13, margin: 0, fontWeight: 600 }}>{a.leader}</p>
                  <p style={{ color: "#64748b", fontSize: 11, margin: 0 }}>{a.leaderEmail}</p>
                </div>
                {/* 6.2 — WhatsApp */}
                {a.whatsapp && (
                  <span style={{ marginLeft: 8, padding: "2px 10px", borderRadius: 20, background: "#16a34a20", color: "#16a34a", fontSize: 12, fontWeight: 600 }}>
                    📱 {maskPhone(a.whatsapp)}
                  </span>
                )}
              </div>
            </div>
            {canAdmin(user) && (
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Btn onClick={() => openEdit(a)} label="Editar" icon="edit" color="#154753" sm />
                <button onClick={() => askDelete(() => setAreas(areas.filter(x => x.id !== a.id)))} style={{ background: "none", border: "1px solid #ef444440", borderRadius: 8, cursor: "pointer", padding: "6px 8px" }}>
                  <Icon name="delete" size={14} color="#ef4444" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />

      {/* 6.4 — Guard modal para salvar/criar área */}
      {saveGuard.show && (
        <Modal title="🔐 Confirmar Alteração" onClose={() => setSaveGuard({ show: false, action: null, pass: "", err: "" })} width={400}>
          <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>
            Alterações em Áreas de Negócio exigem senha de <strong style={{ color: "#ffa619" }}>Administrador</strong>.
          </p>
          <Input label="Senha do Administrador" type="password" value={saveGuard.pass}
            onChange={e => setSaveGuard({ ...saveGuard, pass: e.target.value, err: "" })}
            placeholder="••••••••" />
          {saveGuard.err && <p style={{ color: "#f87171", fontSize: 13, margin: "-4px 0 12px" }}>{saveGuard.err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={confirmSave} label="Confirmar" color="#16a34a" icon="check" />
            <Btn onClick={() => setSaveGuard({ show: false, action: null, pass: "", err: "" })} label="Cancelar" color="#154753" />
          </div>
        </Modal>
      )}

      {showNew && (
        <Modal title={editing ? "Editar Área" : "Nova Área"} onClose={() => setShowNew(false)} width={480}>
          <Input label="Nome da Área" value={form.name} onChange={e => setForm({ ...form, name: e.target.value.toUpperCase() })} placeholder="Ex: OPITO" />
          {/* 6.3 — Paleta com azul */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 8 }}>Cor de identificação</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  style={{ width: 32, height: 32, borderRadius: "50%", background: c,
                    border: form.color === c ? "3px solid #fff" : "3px solid transparent",
                    cursor: "pointer", outline: "none", boxShadow: form.color === c ? `0 0 0 2px ${c}` : "none" }} />
              ))}
            </div>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: form.color, border: "2px solid #154753" }} />
              <span style={{ color: form.color, fontSize: 12, fontWeight: 700 }}>{form.color}</span>
            </div>
          </div>
          <Input label="Nome do Líder" value={form.leader} onChange={e => setForm({ ...form, leader: e.target.value })} placeholder="Ex: Matheus Fritz Rodrigues Carvalho" />
          <Input label="E-mail do Líder" value={form.leaderEmail} onChange={e => setForm({ ...form, leaderEmail: e.target.value })} placeholder="Ex: lider@relyonnutec.com" />
          {/* 6.2 — WhatsApp */}
          <Input label="WhatsApp" value={maskPhone(form.whatsapp)}
            onChange={e => setForm({ ...form, whatsapp: e.target.value.replace(/\D/g, "").slice(0, 11) })}
            placeholder="(22) 99999-9999" />
          <Btn onClick={save} label={editing ? "Salvar Alterações" : "Criar Área"} icon="check" color="#16a34a" />
        </Modal>
      )}
    </div>
  );
};

// ── SOBRE ─────────────────────────────────────────────────────────────────────
const SobrePage = () => (
  <div style={{ maxWidth: 640 }}>
    <h2 style={{ color: "#fff", fontWeight: 800, margin: "0 0 6px", fontSize: 24 }}>Sobre o Sistema</h2>
    <p style={{ color: "#64748b", margin: "0 0 32px", fontSize: 14 }}>Informações sobre a plataforma RelyOn 360 Scheduler</p>
    <div style={{ background: "#073d4a", borderRadius: 16, padding: 28, border: "1px solid #154753", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, flexShrink: 0 }}><svg width="56" height="56" viewBox="0 0 56 56" fill="none"><rect width="56" height="56" rx="13" fill="#011c22"/><circle cx="28" cy="28" r="18" stroke="#ffa619" strokeWidth="5.5" fill="none"/><text x="28" y="28" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="900" fill="#ffffff" textAnchor="middle" dominantBaseline="middle">360</text></svg></div>
        <div>
          <p style={{ color: "#fff", fontWeight: 800, fontSize: 18, margin: 0 }}>RelyOn 360 Scheduler</p>
          <p style={{ color: "#64748b", fontSize: 13, margin: "2px 0 0" }}>Plataforma de Gestão de Programação de Treinamentos</p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Empresa", value: "RelyOn Nutec — Macaé / RJ" },
          { label: "Versão", value: "1.0 — 2025" },
          { label: "Plataforma", value: "Web App (PWA)" },
          { label: "Banco de Dados", value: "Supabase (PostgreSQL)" },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: "#01323d", borderRadius: 10, padding: "12px 16px", border: "1px solid #154753" }}>
            <p style={{ color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 4px", letterSpacing: 0.5 }}>{label}</p>
            <p style={{ color: "#e2e8f0", fontSize: 13, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #154753", paddingTop: 20 }}>
        <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 6px" }}>
          Sistema desenvolvido para gerenciar a programação de turmas de treinamento, instrutores, locais e ausências da RelyOn Nutec.
          Permite planejamento automático com atribuição inteligente de instrutores e salas.
        </p>
        <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>
          Stack: React 18 · Babel Standalone · Supabase · PWA
        </p>
      </div>
    </div>
    <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #1e6a7a", textAlign: "center" }}>
      <p style={{ color: "#ffa619", fontWeight: 800, fontSize: 15, margin: "0 0 4px" }}>Desenvolvido e mantido por</p>
      <p style={{ color: "#fff", fontWeight: 900, fontSize: 20, margin: "0 0 4px" }}>Matheus Fritz</p>
      <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>mfrc@br.relyonnutec.com · RelyOn Nutec</p>
    </div>
  </div>
);

// ── APP ───────────────────────────────────────────────────────────────────────
