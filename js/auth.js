// ── LOGIN ─────────────────────────────────────────────────────────────────────
// ── CHANGE-PASSWORD SCREEN (first-login) ──────────────────────────────────
const ChangePasswordScreen = ({ user, currentPass, onDone }) => {
  const [np, setNp] = useState("");
  const [np2, setNp2] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (np.length < 6) { setErr("Mínimo 6 caracteres."); return; }
    if (np !== np2)    { setErr("As senhas não coincidem."); return; }
    setSaving(true);
    // Troca NO SERVIDOR (Edge Function `change-password`): grava de forma consistente em
    // relyon_credentials + blob (app_state) + Supabase Auth. O cliente NÃO consegue
    // escrever relyon_credentials (service_role-only) — por isso a troca TEM que ser
    // server-side, senão a senha nova "não cola" (o login valida pela credencial).
    try {
      const { data, error } = await sb.functions.invoke("change-password", {
        body: { usuario: user.username, senhaAtual: currentPass, senhaNova: np }
      });
      setSaving(false);
      if (error || !data || data.ok !== true) {
        setErr("Não foi possível salvar a senha. Confira a conexão e tente de novo.");
        return;
      }
    } catch (_) {
      setSaving(false);
      setErr("Erro de conexão. Tente de novo.");
      return;
    }
    onDone();
  };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#01323d,#073d4a,#01323d)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif" }}>
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
const Login = ({ onLogin, users, instructors, setUsers, setInstructors }) => {
  const [uname, setUname] = useState("");
  const [pass,  setPass]  = useState("");
  const [keep,  setKeep]  = useState(true);
  const [err,   setErr]   = useState("");
  // 7.10 first-login state
  const [pendingUser, setPendingUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setErr(""); setLoading(true);
    const trimmed = uname.trim();
    const email = `${trimmed}@relyon360.app`;

    // 0. Provisão server-side (Fase 2 / Marco 1 — SEGURANCA.md §7). A Edge Function
    //    `login` valida o bcrypt NO SERVIDOR (a chave anon não enxerga os hashes) e
    //    garante o usuário no Supabase Auth com a senha digitada, pra que o
    //    signInWithPassword abaixo passe e o cliente receba uma sessão `authenticated`.
    //    BEST-EFFORT: timeout curto e erro engolido — se a função estiver fora, o login
    //    cai no fallback local (hashes ainda no blob durante a transição). Não bloqueia.
    try {
      await Promise.race([
        sb.functions.invoke("login", { body: { usuario: trimmed, senha: pass } }),
        new Promise(res => setTimeout(res, 4000)),
      ]);
    } catch (_) { /* segue pro fluxo normal */ }

    // 1. Tenta Supabase Auth
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
      // Sessão `authenticated` acabou de nascer — boot tinha lido tudo como `anon`.
      // Re-fetcha sob a sessão nova (best-effort; não bloqueia o login). SEGURANCA.md §8.0.
      if (typeof window.__postLoginRefresh === 'function') window.__postLoginRefresh();
      onLogin(fullUser, keep);
      return;
    }

    // 2. Fallback: autenticação local (senha armazenada no banco de dados)
    const u = (users || []).find(u => u.username === trimmed && checkPw(pass, u.password));
    if (u) {
      setLoading(false);
      if (u.mustChangePass) { setPendingUser({ ...u, _source: "user" }); return; }
      if (typeof window.__postLoginRefresh === 'function') window.__postLoginRefresh();
      onLogin(u, keep);
      return;
    }
    const instr = (instructors || []).find(i => i.username === trimmed && checkPw(pass, i.password));
    if (instr) {
      setLoading(false);
      const av = instr.avatar || instr.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
      const fullInstr = { ...instr, role: "instructor", avatar: av };
      if (instr.mustChangePass) { setPendingUser({ ...fullInstr, _source: "instructor" }); return; }
      if (typeof window.__postLoginRefresh === 'function') window.__postLoginRefresh();
      onLogin(fullInstr, keep);
      return;
    }

    setLoading(false);
    setErr("Usuário ou senha inválidos.");
  };

  if (pendingUser) {
    return (
      <ChangePasswordScreen user={pendingUser} currentPass={pass} onDone={async () => {
        // O servidor (change-password) já gravou cred + blob + Auth de forma consistente.
        // Re-sincroniza o blob local A PARTIR do servidor (sem corrida — a escrita já
        // terminou) e entra. NÃO gravar o blob aqui no cliente: era a fonte do bug
        // (escrevia só o Auth / corria com o revalidate).
        if (typeof window.__revalidateFromSupabase === 'function') {
          try { await window.__revalidateFromSupabase(); } catch (_) {}
        }
        onLogin({ ...pendingUser, mustChangePass: false, _source: undefined }, keep);
      }} />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#011c22", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif", position: "relative", overflow: "hidden" }}>
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
          <span style={{ color: "#64748b", fontSize: 13 }}>Permanecer conectado neste dispositivo</span>
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
const SIDE_THEMES = {
  classic: {
    bg:             'linear-gradient(160deg, rgba(0,15,24,0.72) 0%, rgba(1,50,61,0.58) 100%)',
    backdropFilter: 'blur(48px) saturate(220%)',
    divider:        'rgba(255,255,255,0.09)',
    borderRight:    (exp) => `1px solid rgba(255,255,255,${exp ? '0.12' : '0.06'})`,
    shadow:         '1px 0 0 rgba(255,255,255,0.04)',
    shadowHov:      '16px 0 60px rgba(0,0,0,0.55), 1px 0 0 rgba(255,255,255,0.08)',
    logo360:        '#8e8e93',
    scheduler:      '#636366',
    userName:       '#ffffff',
    userRole:       '#8e8e93',
    secLabel:       '#636366',
    secIcon:        '#48484a',
    itemColor:      'rgba(235,235,245,0.86)',
    itemIcon:       '#636366',
    subColor:       'rgba(235,235,245,0.55)',
    subIcon:        '#48484a',
    activeBg:       'rgba(255,149,0,0.18)',
    activeColor:    '#ffffff',
    activeIcon:     '#ff9500',
    activeBorder:   '2px solid transparent',
    activeFilter:   'none',
    activeRadius:   '14px',
    ddBg:           'rgba(18,18,20,0.88)',
    ddBorder:       'rgba(255,255,255,0.12)',
    ddShadow:       '0 16px 48px rgba(0,0,0,0.80)',
    ddSecLabel:     '#636366',
    ddItemColor:    'rgba(235,235,245,0.86)',
    ddActiveColor:  '#ffffff',
    ddActiveBg:     'rgba(255,149,0,0.20)',
    ddActiveBorder: '2px solid transparent',
    ddDisabled:     '#3a3a3c',
    ddBadgeBg:      '#2c2c2e',
    ddBadgeColor:   '#636366',
    footerColor:    '#636366',
    devBy:          '#3a3a3c',
    overlay:        'rgba(0,0,0,0.60)',
    mobileShadow:   '20px 0 80px rgba(0,0,0,0.90)',
    toggleTrack:    '#2c2c2e',
    toggleKnob:     '#8e8e93',
  },
  light: {
    bg:             'rgba(242,242,247,0.72)',
    backdropFilter: 'blur(48px) saturate(200%)',
    divider:        'rgba(60,60,67,0.12)',
    borderRight:    (_) => '1px solid rgba(60,60,67,0.12)',
    shadow:         'none',
    shadowHov:      '8px 0 32px rgba(0,0,0,0.08)',
    logo360:        '#86868b',
    scheduler:      '#86868b',
    userName:       '#1d1d1f',
    userRole:       '#86868b',
    secLabel:       '#86868b',
    secIcon:        '#aeaeb2',
    itemColor:      '#1d1d1f',
    itemIcon:       '#86868b',
    subColor:       '#48484a',
    subIcon:        '#86868b',
    activeBg:       'rgba(255,149,0,0.14)',
    activeColor:    '#1d1d1f',
    activeIcon:     '#ff9500',
    activeBorder:   '2px solid transparent',
    activeFilter:   'none',
    activeRadius:   '14px',
    ddBg:           'rgba(255,255,255,0.96)',
    ddBorder:       'rgba(60,60,67,0.12)',
    ddShadow:       '0 8px 32px rgba(0,0,0,0.12)',
    ddSecLabel:     '#86868b',
    ddItemColor:    '#1d1d1f',
    ddActiveColor:  '#1d1d1f',
    ddActiveBg:     'rgba(255,149,0,0.14)',
    ddActiveBorder: '2px solid transparent',
    ddDisabled:     '#aeaeb2',
    ddBadgeBg:      '#f2f2f7',
    ddBadgeColor:   '#86868b',
    footerColor:    '#86868b',
    devBy:          '#c7c7cc',
    overlay:        'rgba(0,0,0,0.30)',
    mobileShadow:   '20px 0 60px rgba(0,0,0,0.15)',
    toggleTrack:    '#ff9500',
    toggleKnob:     '#ffffff',
  },
};

const Sidebar = ({ active, setActive, user, onLogout, isMobile, mobileOpen, setMobileOpen, tabletSideOpen, setTabletSideOpen, viewBase, setAdminViewBase, crossbaseRequests, theme, setTheme }) => {
  const isAdm  = canAdmin(user);
  const isPlan = user.role === "planejador";
  const isInstr = user.role === "instructor";
  const isCS   = user.role === "customer_service";

  const isTouch = useIsTouch();
  const [sideHovered, setSideHovered]   = useState(false);
  const [hoveredAcc, setHoveredAcc]     = useState(null);
  const [navDropdown, setNavDropdown]   = useState(null);
  const [dropdownPos, setDropdownPos]   = useState({ top: 0, left: 0 });
  const ddTimerRef = React.useRef(null);
  const T = SIDE_THEMES[theme === 'light' ? 'light' : 'classic'];

  const isTablet = isTouch && !isMobile;
  const tabletOpen = tabletSideOpen !== undefined ? tabletSideOpen : true;

  const isExpanded = isMobile || (isTablet ? tabletOpen : isTouch) || sideHovered;
  const nav = (id) => { setActive(id); if (isMobile && setMobileOpen) setMobileOpen(false); };

  const touchRef = React.useRef({});
  const onTouchStart = React.useCallback((e) => {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false };
  }, []);
  const onTouchMove = React.useCallback((e) => {
    const dx = e.touches[0].clientX - touchRef.current.x;
    const dy = e.touches[0].clientY - touchRef.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) touchRef.current.moved = true;
    touchRef.current.lastX = e.touches[0].clientX;
    touchRef.current.lastY = e.touches[0].clientY;
  }, []);
  const onTouchEnd = React.useCallback(() => {
    if (!isTablet || !setTabletSideOpen) return;
    const dx = (touchRef.current.lastX || touchRef.current.x) - touchRef.current.x;
    const dy = (touchRef.current.lastY || touchRef.current.y) - touchRef.current.y;
    if (!touchRef.current.moved) {
      if (!tabletOpen) setTabletSideOpen(true);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < -50 && tabletOpen) setTabletSideOpen(false);
      if (dx > 50 && !tabletOpen) setTabletSideOpen(true);
    }
  }, [isTablet, tabletOpen, setTabletSideOpen]);

  const Item = ({ id, label, icon, sub, badge }) => {
    const on = active === id;
    return (
      <button
        className="rl-nav-btn"
        data-active={on}
        onClick={() => nav(id)}
        style={{
          width: "100%",
          padding: !isExpanded ? "10px 0" : (sub ? "7px 12px 7px 28px" : "10px 12px"),
          marginBottom: 1,
          background: on ? T.activeBg : "transparent",
          border: "none",
          borderLeft: on ? T.activeBorder : "2px solid transparent",
          borderRadius: on ? T.activeRadius : 8,
          cursor: "pointer",
          display: "flex", alignItems: "center",
          justifyContent: !isExpanded ? "center" : "flex-start",
          gap: 10,
          color: on ? T.activeColor : sub ? T.subColor : T.itemColor,
          fontSize: sub ? 13 : 14,
          fontWeight: on ? 700 : 400,
          textAlign: "left",
        }}>
        <div style={{ flexShrink: 0, position: "relative", filter: on ? T.activeFilter : "none" }}>
          <Icon name={icon} size={sub ? 15 : 18} color={on ? T.activeIcon : sub ? T.subIcon : T.itemIcon} />
          {!isExpanded && badge > 0 && (
            <span style={{ position:"absolute", top:-4, right:-4, background:"#ef4444", color:"#fff", borderRadius:"50%", fontSize:8, fontWeight:700, minWidth:12, height:12, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>{badge > 9 ? "9+" : badge}</span>
          )}
        </div>
        {isExpanded && <span style={{ whiteSpace: "nowrap", overflow: "hidden", flex:1 }}>{label}</span>}
        {isExpanded && badge > 0 && (
          <span style={{ background:"#ef4444", color:"#fff", borderRadius:10, fontSize:10, fontWeight:700, minWidth:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px", flexShrink:0 }}>{badge > 99 ? "99+" : badge}</span>
        )}
      </button>
    );
  };

  const showDd = (key, el) => {
    clearTimeout(ddTimerRef.current);
    const rect = el.getBoundingClientRect();
    setDropdownPos({ top: rect.top, left: rect.right + 6 });
    setNavDropdown(key);
  };
  const hideDd = () => {
    ddTimerRef.current = setTimeout(() => setNavDropdown(null), 130);
  };
  const keepDd = () => clearTimeout(ddTimerRef.current);

  const ItemDropdown = ({ id, label, icon, items }) => {
    const on = active === id || items.some(it => it.id === active);
    const ref = React.useRef(null);
    return (
      <div ref={ref}
        onMouseEnter={() => showDd(id, ref.current)}
        onMouseLeave={hideDd}>
        <button
          className="rl-nav-btn"
          data-active={on}
          onClick={() => nav(id)}
          style={{
            width: "100%",
            padding: !isExpanded ? "10px 0" : "10px 12px",
            marginBottom: 1,
            background: on ? T.activeBg : "transparent",
            border: "none",
            borderLeft: on ? T.activeBorder : "2px solid transparent",
            borderRadius: on ? T.activeRadius : 8,
            cursor: "pointer",
            display: "flex", alignItems: "center",
            justifyContent: !isExpanded ? "center" : "flex-start",
            gap: 10,
            color: on ? T.activeColor : T.itemColor,
            fontSize: 14,
            fontWeight: on ? 700 : 400,
            textAlign: "left",
          }}>
          <div style={{ flexShrink: 0, filter: on ? T.activeFilter : "none" }}>
            <Icon name={icon} size={18} color={on ? T.activeIcon : T.itemIcon} />
          </div>
          {isExpanded && <span style={{ whiteSpace: "nowrap", overflow: "hidden", flex: 1 }}>{label}</span>}
          {isExpanded && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink:0, opacity:0.4 }}><path d="M3 2l4 3-4 3" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
        {navDropdown === id && ReactDOM.createPortal(
          <div
            onMouseEnter={keepDd}
            onMouseLeave={hideDd}
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              background: T.ddBg,
              border: `1px solid ${T.ddBorder}`,
              borderRadius: 12,
              padding: "8px 6px",
              zIndex: 9999,
              minWidth: 210,
              boxShadow: T.ddShadow,
              animation: "rl-slideDown 0.13s ease-out",
            }}>
            <div style={{ color: T.ddSecLabel, fontSize:9, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", padding:"2px 10px 8px" }}>
              {label}
            </div>
            {items.map(it => (
              <button key={it.id}
                onClick={() => { if (!it.disabled) { nav(it.id); setNavDropdown(null); } }}
                style={{
                  width:"100%", display:"flex", alignItems:"center", gap:10,
                  padding:"9px 10px",
                  background: active===it.id ? T.ddActiveBg : "transparent",
                  border:"none",
                  borderLeft: active===it.id ? T.ddActiveBorder : "2px solid transparent",
                  borderRadius: active===it.id ? "0 8px 8px 0" : 8,
                  color: it.disabled ? T.ddDisabled : (active===it.id ? T.ddActiveColor : T.ddItemColor),
                  fontSize:13, fontWeight: active===it.id ? 700 : 400,
                  cursor: it.disabled ? "default" : "pointer",
                  textAlign:"left",
                }}>
                <span style={{ fontSize:15, lineHeight:1 }}>{it.emoji}</span>
                <span style={{ flex:1 }}>{it.label}</span>
                {it.disabled && <span style={{ fontSize:9, color: T.ddBadgeColor, background: T.ddBadgeBg, borderRadius:4, padding:"1px 6px", fontWeight:600 }}>em breve</span>}
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>
    );
  };

  const Acc = ({ label, icon, accKey, children }) => {
    const open = isTouch || hoveredAcc === accKey;
    return (
      <div style={{ marginBottom: 6 }}
        onMouseEnter={!isTouch ? () => setHoveredAcc(accKey) : undefined}
        onMouseLeave={!isTouch ? () => setHoveredAcc(null) : undefined}>
        <div style={{
          padding: !isExpanded ? "10px 0" : "6px 12px 4px",
          display: "flex", alignItems: "center",
          justifyContent: !isExpanded ? "center" : "flex-start",
          gap: 8,
        }}>
          <Icon name={icon} size={16} color={T.secIcon} />
          {isExpanded && (
            <span style={{ color: T.secLabel, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              {label}
            </span>
          )}
        </div>
        {isExpanded && open && (
          <div style={{ paddingBottom: 4, animation: "rl-slideDown 0.15s ease-out" }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  const sideStyle = {
    width: isExpanded ? 248 : 60,
    display: "flex", flexDirection: "column",
    overflow: "hidden", flexShrink: 0,
    background: T.bg,
    backdropFilter: T.backdropFilter,
    WebkitBackdropFilter: T.backdropFilter,
    borderRight: T.borderRight(isExpanded),
    ...(isMobile
      ? { position: "fixed", left: 0, top: 0, bottom: 0, height: "100dvh", zIndex: 200,
          transition: "width 0.3s cubic-bezier(0.4,0,0.2,1), transform 0.3s cubic-bezier(0.4,0,0.2,1), box-shadow 0.3s, border-color 0.3s",
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          boxShadow: mobileOpen ? T.mobileShadow : "none" }
      : { position: "fixed", left: 0, top: 0, height: "100vh", zIndex: 100,
          transition: "width 0.28s cubic-bezier(0.4,0,0.2,1), box-shadow 0.3s, border-color 0.3s",
          boxShadow: sideHovered ? T.shadowHov : T.shadow }
    )
  };

  return (
    <div style={sideStyle}
      onMouseEnter={!isMobile && !isTablet ? () => setSideHovered(true) : undefined}
      onMouseLeave={!isMobile && !isTablet ? () => { setSideHovered(false); setHoveredAcc(null); } : undefined}
      onTouchStart={isTablet ? onTouchStart : undefined}
      onTouchMove={isTablet ? onTouchMove : undefined}
      onTouchEnd={isTablet ? onTouchEnd : undefined}>

      <div style={{ padding: !isExpanded ? "16px 12px" : "16px 18px", borderBottom: `1px solid ${T.divider}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0, minHeight: 68 }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="20" cy="20" r="15" stroke="#ffc200" strokeWidth="5.5" fill="none" />
        </svg>
        {isExpanded && (
          <div style={{ minWidth: 0 }}>
            <div style={{ color: T.userName, fontWeight: 800, fontSize: 15, letterSpacing: 0.2, lineHeight: 1.2 }}>
              Rely<span style={{ color: "#ffa619" }}>O</span>n
              <span style={{ color: T.logo360, fontWeight: 300, fontSize: 13 }}> 360</span>
            </div>
            <div style={{ color: T.scheduler, fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 1 }}>Scheduler</div>
          </div>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: T.secLabel, padding: 4, flexShrink: 0 }}>
            <Icon name="menu" size={20} color={T.secLabel} />
          </button>
        )}
        {isTablet && tabletOpen && setTabletSideOpen && (
          <button onClick={() => setTabletSideOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: T.secLabel, padding: 4, flexShrink: 0, borderRadius: 6 }}
            title="Recolher menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.secLabel} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}
      </div>

      <div style={{ padding: !isExpanded ? "10px 12px" : "10px 16px", borderBottom: `1px solid ${T.divider}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#ffa619,#b45309)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12, flexShrink: 0, boxShadow: "0 2px 8px rgba(255,166,25,0.25)" }}>
          {user.avatar}
        </div>
        {isExpanded && (
          <div style={{ overflow: "hidden", minWidth: 0, flex: 1 }}>
            <div style={{ color: T.userName, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
            <div style={{ color: T.userRole, fontSize: 11 }}>{ROLE_LABELS[user.role] || "Usuário"}</div>
            {/* Indicador / seletor de base */}
            {viewBase && !setAdminViewBase && (
              <div style={{ marginTop: 4, display:"inline-flex", alignItems:"center", gap:4, padding:"2px 8px", borderRadius:10, background:"#06b6d415", border:"1px solid #06b6d430" }}>
                <span style={{ color:"#06b6d4", fontSize:10, fontWeight:700 }}>📍 {viewBase}</span>
              </div>
            )}
            {setAdminViewBase && viewBase && (
              <div style={{ marginTop: 4, display:"inline-flex", alignItems:"center", gap:4, padding:"2px 8px", borderRadius:10, background:"#06b6d415", border:"1px solid #06b6d430" }}>
                <span style={{ color:"#06b6d4", fontSize:10, fontWeight:700 }}>{viewBase === "Offshore" ? "⛵" : "📍"} {viewBase}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto", overflowX: "hidden" }}>
        <Item id="dashboard" label="Dashboard" icon="dashboard" />

        {(isAdm || isPlan) && (
          <Acc label="Planejamento" icon="calendar" accKey="plan">
            <Item id="schedule"          label="Programação Base"  icon="calendar" sub />
            <Item id="incompany"         label="In Company"        icon="training" sub />
            <Item id="ead"               label="EAD / Online"      icon="module"   sub />
            <Item id="offshore"          label="Offshore"          icon="location" sub />
            <Item id="pool-batch"        label="Lote Piscina"      icon="location" sub />
            <Item id="cobertura"         label="Linha do Tempo"    icon="report"   sub />
            {(isAdm || hasPermission(user, "ai")) && <Item id="ai" label="IA — Sugerir Escala" icon="ai" sub />}
          </Acc>
        )}
        {(isAdm || isPlan || hasPermission(user, "reports_operacional") || hasPermission(user, "reports_financeiro")) && (
          <Acc label="Relatórios" icon="report" accKey="reports">
            {(isAdm || isPlan || hasPermission(user, "reports_financeiro")) && <Item id="reports-financeiro" label="Financeiro" icon="report" sub />}
            {(isAdm || isPlan || hasPermission(user, "reports_operacional")) && <Item id="reports-kpi" label="KPI Operacional" icon="report" sub />}
          </Acc>
        )}

        {isInstr && (
          <>
            <Item id="my-history" label="Meu Histórico" icon="report" />
            <Acc label="Configurações" icon="settings" accKey="conf">
              <Item id="my-profile" label="Meu Perfil" icon="settings" sub />
            </Acc>
          </>
        )}
        {(isAdm || isPlan || isInstr) && (() => {
          const pendingCrossbase = canPlan(user) && Array.isArray(crossbaseRequests)
            ? crossbaseRequests.filter(r => r.status === "pending" && r.targetBase === viewBase).length
            : 0;
          return <Item id="comunicacao" label="Comunicação" icon="module" badge={pendingCrossbase} />;
        })()}
        {/* Customer Service / DP agora usam o acordeão "Relatórios" acima (gate por permissão). */}

        {(isAdm || isPlan || hasPermission(user, "instr_view")) && (
          <Acc label="Configurações" icon="settings" accKey="conf">
            {(isAdm || isPlan || hasPermission(user, "instr_view")) && <Item id="instructors"  label="Instrutores"  icon="instructor" sub />}
            {(isAdm || isPlan) && <Item id="locals"       label="Locais"        icon="location"  sub />}
            {(isAdm || isPlan) && <Item id="trainings"    label="Treinamentos"  icon="training"  sub />}
            {(isAdm || isPlan) && <Item id="settings"     label="Áreas"         icon="module"    sub />}
            {isAdm && <Item id="offshore-clients" label="Clientes Offshore" icon="location" sub />}
            {isAdm && <Item id="users"       label="Usuários"    icon="settings" sub />}
            {isAdm && <Item id="absenteismo" label="Absenteísmo" icon="warning"  sub />}
            {isAdm && <Item id="holidays"    label="Feriados"    icon="calendar" sub />}
          </Acc>
        )}
      </nav>

      <div style={{ padding: "10px 8px", borderTop: `1px solid ${T.divider}`, flexShrink: 0 }}>
        <button
          onClick={() => setTheme && setTheme(theme === 'light' ? 'classic' : 'light')}
          title={theme === 'light' ? 'Modo Claro ativo' : 'Modo Clássico ativo'}
          style={{ width: "100%", padding: !isExpanded ? "10px 0" : "9px 12px", background: "transparent", border: "none", borderLeft: "2px solid transparent", borderRadius: 8, color: T.footerColor, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: !isExpanded ? "center" : "flex-start", gap: 10, fontSize: 13, marginBottom: 2 }}>
          {theme === 'light'
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.footerColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.footerColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          }
          {isExpanded && (
            <>
              <span style={{ whiteSpace: "nowrap", flex: 1 }}>{theme === 'light' ? 'Modo Claro' : 'Modo Clássico'}</span>
              <div style={{ width: 34, height: 19, borderRadius: 10, background: theme === 'light' ? '#ff9500' : T.toggleTrack, position: "relative", transition: "background 0.25s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 2, left: theme === 'light' ? 17 : 2, width: 15, height: 15, borderRadius: "50%", background: theme === 'light' ? '#fff' : T.toggleKnob, transition: "left 0.25s" }} />
              </div>
            </>
          )}
        </button>
        <Item id="sobre" label="Sobre" icon="settings" />
        <button onClick={onLogout}
          className="rl-nav-btn"
          style={{ width: "100%", padding: !isExpanded ? "10px 0" : "10px 12px", background: "transparent", border: "none", borderLeft: "2px solid transparent", borderRadius: 8, color: T.footerColor, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: !isExpanded ? "center" : "flex-start", gap: 10, fontSize: 14 }}>
          <Icon name="logout" size={18} color={T.footerColor} />
          {isExpanded && <span style={{ whiteSpace: "nowrap" }}>Sair</span>}
        </button>
        {isExpanded && <p style={{ color: T.devBy, fontSize: 10, textAlign: "center", margin: "8px 0 0", userSelect: "none" }}>Developed by Fritz</p>}
      </div>
    </div>
  );
};

