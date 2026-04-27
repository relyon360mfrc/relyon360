function App({ initialUser }) {
  const [user, setUser]       = useState(initialUser || null);
  const [active, setActive]   = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [schedules, setSchedules]     = useSchedules();
  const [trainings, setTrainings]     = usePersisted("relyon_trainings",   INITIAL_TRAININGS);
  const [areas, setAreas]             = usePersisted("relyon_areas",       INITIAL_AREAS);
  const [instructors, setInstructors] = usePersisted("relyon_instructors", INSTRUCTORS);
  const [users,       setUsers]       = usePersisted("relyon_users",       USERS);
  const [absences,    setAbsences]    = usePersisted("relyon_absences",    INITIAL_ABSENCES);
  const [locals,      setLocals]      = usePersisted("relyon_locals",      INITIAL_LOCALS);
  LOCALS = locals;
  const [scheduleTabs, setScheduleTabs] = useState(() => {
    try { const s = sessionStorage.getItem('relyon360_tabs'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [activeTabId, setActiveTabId] = useState(() => {
    try { const s = sessionStorage.getItem('relyon360_activeTabId'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  React.useEffect(() => { try { sessionStorage.setItem('relyon360_tabs', JSON.stringify(scheduleTabs)); } catch {} }, [scheduleTabs]);
  React.useEffect(() => { try { sessionStorage.setItem('relyon360_activeTabId', JSON.stringify(activeTabId)); } catch {} }, [activeTabId]);

  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogin = (u) => {
    const cleanUser = { ...u }; delete cleanUser._source;
    setUser(cleanUser);
    setActive("dashboard");
  };
  const handleLogout = () => {
    sb.auth.signOut();
    setUser(null); setScheduleTabs([]); setActiveTabId(null);
    try { sessionStorage.removeItem('relyon360_tabs'); sessionStorage.removeItem('relyon360_activeTabId'); } catch {}
  };

  if (!user) return <Login onLogin={handleLogin} users={users} instructors={instructors} setUsers={setUsers} setInstructors={setInstructors} />;

  const pages = {
    dashboard:    user.role === "instructor" ? <InstructorDashboard schedules={schedules} setSchedules={setSchedules} user={user} /> : <Dashboard schedules={schedules} setSchedules={setSchedules} trainings={trainings} setActive={setActive} user={user} />,
    schedule:     <Schedule     schedules={schedules} setSchedules={setSchedules} trainings={trainings} areas={areas} user={user} instructors={instructors} absences={absences} scheduleTabs={scheduleTabs} setScheduleTabs={setScheduleTabs} activeTabId={activeTabId} setActiveTabId={setActiveTabId} />,
    instructors:  <InstructorsPage instructors={instructors} setInstructors={setInstructors} trainings={trainings} user={user} users={users} areas={areas} />,
    trainings:    <TrainingsPage  trainings={trainings} setTrainings={setTrainings} areas={areas} user={user} instructors={instructors} setInstructors={setInstructors} />,
    locals:       <LocalsPage     schedules={schedules} locals={locals} setLocals={setLocals} user={user} />,
    ai:           <AiPage         schedules={schedules} setSchedules={setSchedules} trainings={trainings} instructors={instructors} />,
    reports:      <ReportsPage    schedules={schedules} trainings={trainings} instructors={instructors} />,
    settings:     <SettingsPage   areas={areas} setAreas={setAreas} user={user} />,
    users:        <UsersPage       users={users} setUsers={setUsers} currentUser={user} instructors={instructors} />,
    absenteismo:  <AbsenteismoPage instructors={instructors} absences={absences} setAbsences={setAbsences} user={user} />,
    "my-history": <ReportsPage    schedules={schedules} trainings={trainings} instructors={instructors} user={user} />,
    "my-profile":     <InstructorProfile user={user} instructors={instructors} setInstructors={setInstructors} setUser={setUser} />,
    "locals-report":  <LocalsReportPage schedules={schedules} />,
    sobre:            <SobrePage />,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#01323d", fontFamily: "'Segoe UI',sans-serif", position: "relative" }}>
      {isMobile && mobileMenuOpen && (
        <div onClick={() => setMobileMenuOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 199 }} />
      )}
      <Sidebar active={active} setActive={setActive} user={user} onLogout={handleLogout}
        collapsed={collapsed} setCollapsed={setCollapsed}
        isMobile={isMobile} mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />
      <main style={{ flex: 1, padding: isMobile ? 16 : 32, overflowY: "auto", minWidth: 0 }}>
        {isMobile && (
          <button onClick={() => setMobileMenuOpen(true)}
            style={{ marginBottom: 16, background: "#073d4a", border: "1px solid #154753", borderRadius: 10, padding: "8px 14px", color: "#ffa619", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}>
            <Icon name="menu" size={18} color="#ffa619" /> Menu
          </button>
        )}
        {pages[active] || <Dashboard schedules={schedules} setSchedules={setSchedules} trainings={trainings} user={user} />}
      </main>
    </div>
  );
}


// ── APP LOADER (fetches all data from Supabase before rendering) ──────────────
const AppLoader = () => {
  const [ready, setReady] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [initialUser, setInitialUser] = React.useState(null);
  React.useEffect(() => {
    const DEFAULTS = {
      relyon_trainings: INITIAL_TRAININGS,
      relyon_areas: INITIAL_AREAS,
      relyon_instructors: INSTRUCTORS,
      relyon_users: USERS,
      relyon_absences: INITIAL_ABSENCES,
    };
    (async () => {
      let loadOk = false;
      try {
        const { data, error: fetchError } = await sb.from('app_state').select('key,value').in('key', _DB_KEYS);
        if (fetchError) throw fetchError;
        _initialData = {};
        (data || []).forEach(r => { _initialData[r.key] = r.value; });
        // Migração de dados: normaliza skills de string[] → {name,canLead}[]
        if (_initialData.relyon_instructors) {
          _initialData.relyon_instructors = _initialData.relyon_instructors.map(i => ({
            ...i,
            skills: (i.skills || []).map(s => typeof s === 'string' ? { name: s, canLead: false } : s)
          }));
        }
        // Migração: hash senhas plaintext → bcrypt
        const hashIfPlain = pw => (pw && !pw.startsWith('$2')) ? hashPw(pw) : pw;
        let pwMigrated = false;
        if (_initialData.relyon_users) {
          _initialData.relyon_users = _initialData.relyon_users.map(u => {
            const h = hashIfPlain(u.password);
            if (h !== u.password) pwMigrated = true;
            return { ...u, password: h };
          });
        }
        if (_initialData.relyon_instructors) {
          _initialData.relyon_instructors = _initialData.relyon_instructors.map(i => {
            const h = hashIfPlain(i.password);
            if (h !== i.password) pwMigrated = true;
            return { ...i, password: h };
          });
        }
        if (pwMigrated) {
          await sb.from('app_state').upsert([
            { key: 'relyon_users', value: _initialData.relyon_users },
            { key: 'relyon_instructors', value: _initialData.relyon_instructors }
          ], { onConflict: 'key' });
        }
        // Migração: renomear/adicionar locais
        if (_initialData.relyon_locals) {
          let localsMigrated = false;
          let locs = _initialData.relyon_locals.map(l => {
            if (l.name === "CBINC 05") { localsMigrated = true; return { ...l, name: "CBINC 05(AVANÇADO)" }; }
            if (l.name === "COXSWAIN BALEEIRA") { localsMigrated = true; return { ...l, name: "COXSWAIN - BALEEIRA" }; }
            return l;
          });
          // Locais de manobra adicionados após a versão inicial do DB
          const missingManobra = [
            { name: "COXSWAIN - BALEEIRA", type: "RelyOn Macaé", env: "Prático", subtype: "manobra" },
            { name: "COXSWAIN BOTE",        type: "RelyOn Macaé", env: "Prático", subtype: "manobra" },
            { name: "BALEEIRA 01 (TURCO)",  type: "RelyOn Macaé", env: "Prático", subtype: "manobra" },
          ];
          missingManobra.forEach(m => {
            if (!locs.find(l => l.name === m.name)) {
              const maxId = Math.max(0, ...locs.map(l => l.id || 0));
              locs = [...locs, { id: maxId + 1, ...m }];
              localsMigrated = true;
            }
          });
          if (localsMigrated) {
            _initialData.relyon_locals = locs;
            await sb.from('app_state').upsert({ key: 'relyon_locals', value: locs }, { onConflict: 'key' });
          }
        }
        // Fallback para localStorage para chaves ausentes no Supabase (ex: Ctrl+Shift+R antes do upsert completar)
        _DB_KEYS.filter(k => _initialData[k] == null).forEach(k => {
          try {
            const ls = localStorage.getItem(_LS_PREFIX + k);
            if (ls != null) _initialData[k] = JSON.parse(ls);
          } catch {}
        });
        const missing = _DB_KEYS.filter(k => _initialData[k] == null)
          .map(k => ({ key: k, value: DEFAULTS[k] }));
        if (missing.length > 0) {
          missing.forEach(row => { _initialData[row.key] = row.value; });
          await sb.from('app_state').upsert(missing, { onConflict: 'key', ignoreDuplicates: true });
        }
        loadOk = true;
      } catch(e) {
        setLoadError(true);
      }
      if (!loadOk) return;
      try {
        const { data: sData } = await sb.auth.getSession();
        if (sData && sData.session) {
          const meta = sData.session.user.user_metadata || {};
          const source = meta.source || "user";
          const uList = (_initialData || {}).relyon_users || [];
          const iList = (_initialData || {}).relyon_instructors || [];
          const record = source === "instructor"
            ? iList.find(i => i.username === meta.username)
            : uList.find(u => u.username === meta.username);
          const av = record
            ? (record.avatar || record.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase())
            : (meta.name || meta.username || "?").slice(0, 2).toUpperCase();
          const fullUser = record
            ? { ...record, role: meta.role || record.role, avatar: av }
            : { username: meta.username, name: meta.name || meta.username, role: meta.role || "user", avatar: av };
          setInitialUser(fullUser);
        }
      } catch {}
      setReady(true);
    })();
  }, []);
  if (loadError) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#011c22',flexDirection:'column',gap:24}}>
      <div style={{fontSize:48}}>⚠️</div>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:20,fontWeight:700,color:'#e2e8f0',marginBottom:8}}>Não foi possível conectar ao banco de dados</div>
        <div style={{color:'#64748b',fontSize:14,maxWidth:360,lineHeight:1.6}}>
          O banco pode estar iniciando após um período inativo.<br/>
          <strong style={{color:'#ffa619'}}>Seus dados estão seguros.</strong> Tente novamente em alguns segundos.
        </div>
      </div>
      <button
        onClick={() => location.reload()}
        style={{background:'linear-gradient(135deg,#ffa619,#e8920a)',border:'none',borderRadius:10,padding:'12px 32px',color:'#011c22',fontWeight:700,fontSize:15,cursor:'pointer',letterSpacing:0.5}}>
        ↻ Tentar novamente
      </button>
    </div>
  );
  if (!ready) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#011c22',flexDirection:'column',gap:32}}>
      <div style={{position:'relative',width:96,height:96}}>
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none" style={{position:'absolute',top:0,left:0}}>
          <circle cx="48" cy="48" r="38" stroke="#0e3a45" strokeWidth="8" fill="none"/>
        </svg>
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none" style={{position:'absolute',top:0,left:0,animation:'spin 1.1s linear infinite',transformOrigin:'48px 48px'}}>
          <defs>
            <linearGradient id="arc-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffd066"/>
              <stop offset="100%" stopColor="#e8920a"/>
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r="38" stroke="url(#arc-grad)" strokeWidth="8" fill="none"
            strokeDasharray="180 58" strokeLinecap="round" transform="rotate(-90 48 48)"/>
        </svg>
      </div>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:24,fontWeight:800,color:'#e2e8f0',letterSpacing:0.5,lineHeight:1}}>
          Rely<span style={{color:'#ffa619'}}>O</span>n
          <span style={{color:'#475569',fontWeight:300,fontSize:18}}> 360</span>
        </div>
        <div style={{color:'#1e4a58',fontSize:11,marginTop:8,letterSpacing:3,textTransform:'uppercase'}}>Scheduler</div>
      </div>
      <p style={{color:'#1e4a58',fontSize:12,margin:0,letterSpacing:0.5}}>Conectando ao banco de dados...</p>
    </div>
  );
  return (
    <>
      <App initialUser={initialUser} />
      <SaveMonitor />
    </>
  );
};

// ── SAVE STATUS MONITOR ───────────────────────────────────────────────────────
const SaveMonitor = () => {
  const [pending, setPending] = React.useState(0);
  const [errors,  setErrors]  = React.useState([]);
  React.useEffect(() => {
    const unsub = onSaveEvent(ev => {
      if (ev.pending) { setPending(p => p + 1); return; }
      setPending(p => Math.max(0, p - 1));
      if (!ev.ok) {
        const id = Date.now();
        setErrors(t => [...t, { id, msg: ev.msg }]);
        setTimeout(() => setErrors(t => t.filter(x => x.id !== id)), 10000);
      }
    });
    return unsub;
  }, []);
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
      {pending > 0 && (
        <div style={{ background: '#073d4a', border: '1px solid #154753', borderRadius: 8, padding: '6px 12px', color: '#94a3b8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}><circle cx="6" cy="6" r="4.5" stroke="#ffa619" strokeWidth="1.5" fill="none" strokeDasharray="14 8" /></svg>
          Salvando…
        </div>
      )}
      {errors.map(t => (
        <div key={t.id} style={{ background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 10, padding: '12px 16px', color: '#fca5a5', fontSize: 13, maxWidth: 340, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Falha ao salvar no banco de dados</div>
            <div style={{ fontSize: 11, color: '#f87171', opacity: 0.8 }}>{t.msg}</div>
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>Dado salvo localmente — será sincronizado na próxima abertura.</div>
          </div>
        </div>
      ))}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<AppLoader />);
