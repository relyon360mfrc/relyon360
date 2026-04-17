function App() {
  const [user, setUser]       = useState(() => { try { const s = sessionStorage.getItem(SAVED_KEY); return s ? JSON.parse(s) : null; } catch { return null; } });
  const [active, setActive]   = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [schedules, setSchedules]     = usePersisted("relyon_schedules",   INITIAL_SCHEDULES);
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

  const handleLogin = (u, keep, changePassInfo) => {
    // If first-login triggered a password change, persist to the arrays
    if (changePassInfo) {
      const { id, password, source } = changePassInfo;
      if (source === "user") {
        setUsers(prev => prev.map(x => x.id === id ? { ...x, password, mustChangePass: false } : x));
      } else {
        setInstructors(prev => prev.map(x => x.id === id ? { ...x, password, mustChangePass: false } : x));
      }
    }
    const cleanUser = { ...u }; delete cleanUser._source;
    setUser(cleanUser);
    setActive("dashboard");
    try { sessionStorage.setItem(SAVED_KEY, JSON.stringify(cleanUser)); } catch {}
  };
  const handleLogout = () => {
    setUser(null); setScheduleTabs([]); setActiveTabId(null);
    try { sessionStorage.removeItem(SAVED_KEY); sessionStorage.removeItem('relyon360_tabs'); sessionStorage.removeItem('relyon360_activeTabId'); } catch {}
  };

  if (!user) return <Login onLogin={handleLogin} users={users} instructors={instructors} />;

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
  React.useEffect(() => {
    const DEFAULTS = {
      relyon_schedules: [],
      relyon_trainings: INITIAL_TRAININGS,
      relyon_areas: INITIAL_AREAS,
      relyon_instructors: INSTRUCTORS,
      relyon_users: USERS,
      relyon_absences: INITIAL_ABSENCES,
    };
    (async () => {
      try {
        const { data } = await sb.from('app_state').select('key,value').in('key', _DB_KEYS);
        _initialData = {};
        (data || []).forEach(r => { _initialData[r.key] = r.value; });
        // Migração de dados: normaliza skills de string[] → {name,canLead}[]
        if (_initialData.relyon_instructors) {
          _initialData.relyon_instructors = _initialData.relyon_instructors.map(i => ({
            ...i,
            skills: (i.skills || []).map(s => typeof s === 'string' ? { name: s, canLead: false } : s)
          }));
        }
        // Migração de dados: normaliza roles de schedules antigos
        // Se dois+ instrutores dividem mesma turma + módulo + data, o primeiro é o instrutor
        // e os demais são "Assistant Instructor" (a menos que já sejam "Translator")
        if (_initialData.relyon_schedules) {
          const scheds = _initialData.relyon_schedules;
          const grouped = {};
          scheds.forEach(s => {
            const key = `${s.className}|${s.module}|${s.date}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(s);
          });
          Object.values(grouped).forEach(group => {
            if (group.length < 2) return;
            // Apenas marca como Assistant se é um instrutor DIFERENTE do primeiro
            const leadId = group[0].instructorId;
            group.forEach((s, i) => {
              if (i === 0) return;
              if ((s.role || "").includes("Transl") || (s.role || "").includes("Tradutor")) return;
              if (String(s.instructorId) !== String(leadId) && s.role !== "Assistant Instructor") {
                s.role = "Assistant Instructor";
              }
            });
          });
          // Migração: converte issue (string) → issueLog (array) para schedules antigos
          scheds.forEach(s => {
            if (s.issue && !s.issueLog) {
              s.issueLog = [{ type: "report", text: s.issue, by: s.issueBy || "Instrutor", at: s.issueAt || new Date().toISOString() }];
            }
          });
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
        const missing = _DB_KEYS.filter(k => _initialData[k] == null)
          .map(k => ({ key: k, value: DEFAULTS[k] }));
        if (missing.length > 0) {
          missing.forEach(row => { _initialData[row.key] = row.value; });
          await sb.from('app_state').upsert(missing, { onConflict: 'key', ignoreDuplicates: true });
        }
      } catch(e) {
        if (!_initialData) _initialData = {};
      } finally {
        setReady(true);
      }
    })();
  }, []);
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
  return <App />;
};

ReactDOM.createRoot(document.getElementById('root')).render(<AppLoader />);
