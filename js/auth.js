// ── LOGIN ─────────────────────────────────────────────────────────────────────
// ── CHANGE-PASSWORD SCREEN (first-login) ──────────────────────────────────
const ChangePasswordScreen = ({ user, onDone }) => {
  const [np, setNp] = useState("");
  const [np2, setNp2] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (np.length < 6) { setErr("Mínimo 6 caracteres."); return; }
    if (np !== np2)    { setErr("As senhas não coincidem."); return; }
    setSaving(true);
    const { error } = await sb.auth.updateUser({ password: np, data: { mustChangePass: false } });
    setSaving(false);
    if (error) { setErr("Erro: " + error.message); return; }
    onDone();
  };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#01323d,#073d4a,#01323d)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 48, width: 400, boxShadow: "0 25px 50px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#ffa61920", border: "2px solid #ffa619", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffa619" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: 0 }}>Primeiro Acesso</h2>
          <p style={{ color: "#94a3b8", fontSize: 14, margin: "6px 0 0" }}>Olá, {user.name.split(" ")[0]}! Defina sua nova senha para continuar.</p>
        </div>
        <Input label="Nova Senha" type="password" value={np}  onChange={e => { setNp(e.target.value);  setErr(""); }} placeholder="Mínimo 6 caracteres" />
        <Input label="Confirmar Senha" type="password" value={np2} onChange={e => { setNp2(e.target.value); setErr(""); }} placeholder="Repita a nova senha" />
        {err && <p style={{ color: "#f87171", fontSize: 13, margin: "-4px 0 10px" }}>{err}</p>}
        <button onClick={save} disabled={saving} style={{ width: "100%", padding: 14, background: saving ? "#0e3a45" : "linear-gradient(135deg,#ffa619,#e8920a)", border: "none", borderRadius: 10, color: "#fff", fontSize: 16, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Salvando..." : "Salvar e Entrar"}
        </button>
      </div>
    </div>
  );
};

// ── LOGIN ──────────────────────────────────────────────────────────────────────
const Login = ({ onLogin, users, instructors }) => {
  const [uname, setUname] = useState("");
  const [pass,  setPass]  = useState("");
  const [keep,  setKeep]  = useState(false);
  const [err,   setErr]   = useState("");
  // 7.10 first-login state
  const [pendingUser, setPendingUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setErr(""); setLoading(true);
    const trimmed = uname.trim();

    // 1. Tenta Supabase Auth
    const email = `${trimmed}@relyon360.app`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (!error && data?.user) {
      setLoading(false);
      const meta = data.user.user_metadata || {};
      const source = meta.source || "user";
      const record = source === "instructor"
        ? (instructors || []).find(i => i.username === meta.username)
        : (users || []).find(u => u.username === meta.username);
      const av = record
        ? (record.avatar || record.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase())
        : (meta.name || meta.username || "?").slice(0, 2).toUpperCase();
      const fullUser = record
        ? { ...record, role: meta.role || record.role, avatar: av }
        : { username: meta.username, name: meta.name || meta.username, role: meta.role || "user", avatar: av };
      if (meta.mustChangePass) { setPendingUser({ ...fullUser, _source: source }); return; }
      onLogin(fullUser);
      return;
    }

    // 2. Fallback: autenticação local (senha armazenada no banco de dados)
    const u = (users || []).find(u => u.username === trimmed && checkPw(pass, u.password));
    if (u) {
      setLoading(false);
      if (u.mustChangePass) { setPendingUser({ ...u, _source: "user" }); return; }
      onLogin(u);
      return;
    }
    const instr = (instructors || []).find(i => i.username === trimmed && checkPw(pass, i.password));
    if (instr) {
      setLoading(false);
      const av = instr.avatar || instr.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
      const fullInstr = { ...instr, role: "instructor", avatar: av };
      if (instr.mustChangePass) { setPendingUser({ ...fullInstr, _source: "instructor" }); return; }
      onLogin(fullInstr);
      return;
    }

    setLoading(false);
    setErr("Usuário ou senha inválidos.");
  };

  if (pendingUser) {
    return (
      <ChangePasswordScreen user={pendingUser} onDone={() => {
        onLogin({ ...pendingUser, mustChangePass: false, _source: undefined });
      }} />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#011c22", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif", position: "relative", overflow: "hidden" }}>
      {/* Decorative background rings */}
      <svg style={{ position: "absolute", top: -140, right: -140, opacity: 0.05, pointerEvents: "none" }} width="520" height="520" viewBox="0 0 520 520" fill="none">
        <circle cx="260" cy="260" r="210" stroke="#ffa619" strokeWidth="48" fill="none"/>
      </svg>
      <svg style={{ position: "absolute", bottom: -160, left: -160, opacity: 0.035, pointerEvents: "none" }} width="440" height="440" viewBox="0 0 440 440" fill="none">
        <circle cx="220" cy="220" r="175" stroke="#ffa619" strokeWidth="40" fill="none"/>
      </svg>
      {/* Card */}
      <div style={{ position: "relative", zIndex: 1, background: "rgba(5,45,56,0.75)", backdropFilter: "blur(28px)", border: "1px solid rgba(255,166,25,0.18)", borderRadius: 24, padding: "52px 44px 40px", width: 420, boxShadow: "0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,166,25,0.06)", overflow: "hidden" }}>
        {/* Corner decorative arc — ~90° visible, fades at both ends */}
        <svg style={{ position: "absolute", top: 0, right: 0, pointerEvents: "none", opacity: 0.11 }} width="210" height="210" viewBox="0 0 210 210" fill="none">
          <defs>
            <linearGradient id="arc-corner" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffa619" stopOpacity="0"/>
              <stop offset="38%" stopColor="#ffa619" stopOpacity="1"/>
              <stop offset="62%" stopColor="#ffa619" stopOpacity="1"/>
              <stop offset="100%" stopColor="#ffa619" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <circle cx="210" cy="0" r="158" stroke="url(#arc-corner)" strokeWidth="36" fill="none" strokeLinecap="round"/>
        </svg>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>

          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: 0.3 }}>Rely<span style={{color:"#ffa619"}}>O</span>n 360</h1>
          <p style={{ color: "#475569", fontSize: 13, margin: "6px 0 0", letterSpacing: 0.4 }}>Sistema de Planejamento de Treinamentos</p>
        </div>
        {/* Fields */}
        <Input label="Usuário" value={uname} onChange={e => setUname(e.target.value.toLowerCase().replace(/\s/g,""))} placeholder="seu usuário de acesso" onKeyDown={e => e.key === "Enter" && handle()} />
        <Input label="Senha" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handle()} />
        {err && <p style={{ color: "#f87171", fontSize: 13, margin: "-4px 0 8px" }}>{err}</p>}
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", margin: "14px 0 20px" }}>
          <div onClick={() => setKeep(!keep)} style={{ width: 42, height: 24, borderRadius: 12, background: keep ? "#ffa619" : "#0e3a45", border: "1px solid " + (keep ? "#ffa619" : "#1e4a58"), position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: keep ? 20 : 2, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
          </div>
          <span style={{ color: "#64748b", fontSize: 13 }}>Manter conectado nesta sessão</span>
        </label>
        <button onClick={handle} disabled={loading} style={{ width: "100%", padding: "14px 0", background: loading ? "#0e3a45" : "linear-gradient(135deg,#ffa619,#e8920a)", border: "none", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", letterSpacing: 0.3, boxShadow: "0 4px 20px rgba(255,166,25,0.3)" }}>
          {loading ? "Entrando..." : "Entrar no Sistema"}
        </button>
        {/* Footer */}
        <p style={{ textAlign: "center", color: "#1a3d4a", fontSize: 11, margin: "24px 0 0", letterSpacing: 0.5 }}>Development by Fritz</p>
      </div>
    </div>
  );
};

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
const Sidebar = ({ active, setActive, user, onLogout, collapsed, setCollapsed, isMobile, mobileOpen, setMobileOpen }) => {
  const isAdm  = canAdmin(user);
  const isPlan = user.role === "planejador";
  const isInstr = user.role === "instructor";
  const isCS   = user.role === "customer_service";

  const planIds = ["schedule","ai","reports"];
  const confIds = ["instructors","locals","trainings","settings","users","absenteismo","my-profile"];
  const [planOpen, setPlanOpen] = useState(() => planIds.includes(active));
  const [confOpen, setConfOpen] = useState(() => confIds.includes(active));

  const nav = (id) => { setActive(id); if (isMobile && setMobileOpen) setMobileOpen(false); };

  const Item = ({ id, label, icon, sub }) => {
    const on = active === id;
    return (
      <button onClick={() => nav(id)}
        style={{ width: "100%", padding: collapsed ? "9px" : (sub ? "7px 12px 7px 32px" : "10px 12px"), marginBottom: 2, background: on ? "rgba(255,166,25,0.15)" : "none", border: on ? "1px solid rgba(255,166,25,0.3)" : "1px solid transparent", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 10, color: on ? "#ffa619" : sub ? "#94a3b8" : "#e2e8f0", fontSize: sub ? 13 : 14, fontWeight: on ? 700 : 400, textAlign: "left" }}>
        <Icon name={icon} size={sub ? 15 : 18} color={on ? "#ffa619" : sub ? "#64748b" : "#94a3b8"} />
        {!collapsed && label}
      </button>
    );
  };

  const Acc = ({ label, icon, open, toggle, children }) => (
    <div style={{ marginBottom: 4 }}>
      <button onClick={toggle}
        style={{ width: "100%", padding: collapsed ? "9px" : "10px 12px", marginBottom: open && !collapsed ? 2 : 0, background: "none", border: "1px solid transparent", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 10 }}>
        <Icon name={icon} size={18} color="#64748b" />
        {!collapsed && (
          <>
            <span style={{ flex: 1, color: "#e2e8f0", fontSize: 14, fontWeight: 600, textAlign: "left" }}>{label}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#64748b" style={{ flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><path d="M7 10l5 5 5-5z"/></svg>
          </>
        )}
      </button>
      {!collapsed && open && <div style={{ paddingBottom: 4 }}>{children}</div>}
    </div>
  );

  return (
    <div style={{ width: isMobile ? 240 : (collapsed ? 64 : 240), minHeight: "100vh", background: "#01323d", borderRight: "1px solid #073d4a", display: "flex", flexDirection: "column", transition: "width 0.2s, transform 0.25s", flexShrink: 0, ...(isMobile ? { position: "fixed", left: 0, top: 0, bottom: 0, height: "100dvh", zIndex: 200, transform: mobileOpen ? "translateX(0)" : "translateX(-100%)", boxShadow: mobileOpen ? "4px 0 32px rgba(0,0,0,0.7)" : "none" } : {}) }}>
      <div style={{ padding: collapsed ? "20px 12px" : "20px 20px", borderBottom: "1px solid #073d4a", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {!collapsed && <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><circle cx="18" cy="18" r="13" stroke="#ffa619" strokeWidth="5.5" fill="none"/></svg>}
        {!collapsed && <div><div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>Rely<span style={{color:"#ffa619"}}>O</span>n 360</div><div style={{ color: "#64748b", fontSize: 11 }}>Scheduler</div></div>}
        <button onClick={() => { if (isMobile) { setMobileOpen(false); } else { setCollapsed(!collapsed); } }} style={{ marginLeft: collapsed ? 0 : "auto", background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4, flexShrink: 0 }}>
          <Icon name="menu" size={20} />
        </button>
      </div>
      <div style={{ padding: collapsed ? "10px 8px" : "12px 16px", borderBottom: "1px solid #073d4a", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#ffa619,#e8920a)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{user.avatar}</div>
        {!collapsed && <div style={{ overflow: "hidden", minWidth: 0 }}><div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div><div style={{ color: "#f59e0b", fontSize: 11 }}>{ROLE_LABELS[user.role] || "Usuário"}</div></div>}
      </div>
      <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
        <Item id="dashboard" label="Dashboard" icon="dashboard" />

        {(isAdm || isPlan) && (
          <Acc label="Planejamento" icon="calendar" open={planOpen} toggle={() => setPlanOpen(v => !v)}>
            <Item id="schedule" label="Programação"       icon="calendar" sub />
            {(isAdm || hasPermission(user, "ai")) && <Item id="ai" label="IA — Sugerir Escala" icon="ai" sub />}
          </Acc>
        )}
        {(isAdm || isPlan || hasPermission(user, "reports")) && (
          <Item id="reports" label="Relatórios" icon="report" />
        )}

        {isInstr && (
          <>
            <Item id="my-history"  label="Meu Histórico" icon="report"   />
            <Acc label="Configurações" icon="settings" open={confOpen} toggle={() => setConfOpen(v => !v)}>
              <Item id="my-profile" label="Meu Perfil" icon="settings" sub />
            </Acc>
          </>
        )}
        {isCS && <Item id="reports" label="Relatórios Turmas" icon="report" />}

        {(isAdm || isPlan) && (
          <Acc label="Configurações" icon="settings" open={confOpen} toggle={() => setConfOpen(v => !v)}>
            <Item id="instructors"  label="Instrutores"  icon="instructor" sub />
            <Item id="locals"       label="Locais"        icon="location"  sub />
            <Item id="trainings"    label="Treinamentos"  icon="training"  sub />
            <Item id="settings"     label="Áreas"         icon="module"    sub />
            {isAdm && <Item id="users"       label="Usuários"     icon="settings"  sub />}
            {isAdm && <Item id="absenteismo" label="Absenteísmo"  icon="warning"   sub />}
          </Acc>
        )}
      </nav>
      <div style={{ padding: "12px 8px", borderTop: "1px solid #073d4a", flexShrink: 0 }}>
        <Item id="sobre" label="Sobre" icon="settings" />
        <button onClick={onLogout} style={{ width: "100%", padding: collapsed ? "9px" : "10px 12px", background: "none", border: "1px solid transparent", borderRadius: 10, color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 10, fontSize: 14 }}>
          <Icon name="logout" size={18} color="#64748b" />{!collapsed && "Sair"}
        </button>
        {!collapsed && <p style={{ color: "#1e4a56", fontSize: 10, textAlign: "center", margin: "8px 0 0", userSelect: "none" }}>Developed by Fritz</p>}
      </div>
    </div>
  );
};

