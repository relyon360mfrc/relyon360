function App({ initialUser }) {
  const [user, setUser]       = useState(initialUser || null);
  const [active, setActive]   = useState("dashboard");
  const [schedules, setSchedules]     = useSchedules();
  const [trainings, setTrainings]     = usePersisted("relyon_trainings",   INITIAL_TRAININGS);
  const [areas, setAreas]             = usePersisted("relyon_areas",       INITIAL_AREAS);
  const [instructors, setInstructors] = usePersisted("relyon_instructors", INSTRUCTORS);
  const [users,       setUsers]       = usePersisted("relyon_users",       USERS);
  const [absences,    setAbsences]    = usePersisted("relyon_absences",    INITIAL_ABSENCES);
  const [locals,      setLocals]      = usePersisted("relyon_locals",      INITIAL_LOCALS);
  const [holidays,    setHolidays]    = usePersisted("relyon_holidays",    INITIAL_HOLIDAYS);
  const [activities,  setActivities]  = usePersisted("relyon_activities",  INITIAL_ACTIVITIES);
  const [requests,    setRequests]    = usePersisted("relyon_requests",    []);
  const [aiPackages,  setAiPackages]  = usePersisted("relyon_ai_packages", []);
  const [crossbaseRequests, setCrossbaseRequests] = usePersisted("relyon_crossbase_requests", []);
  const [offshoreClients,   setOffshoreClients]   = usePersisted("relyon_offshore_clients",   []);
  const [offshoreUnits,     setOffshoreUnits]      = usePersisted("relyon_offshore_units",     []);
  if (locals && locals.length) LOCALS = locals;
  const [scheduleTabs, setScheduleTabs] = useState(() => {
    try {
      const s = sessionStorage.getItem('relyon360_tabs');
      const tabs = s ? JSON.parse(s) : [];
      if (!Array.isArray(tabs)) return [];
      // ── FIX DEFINITIVO (2026-06-01): abas de EDIÇÃO não sobrevivem a reload ──
      // O `editItems` de uma aba é um snapshot CONGELADO da turma. Persistido em
      // sessionStorage, ele voltava STALE após o reload; ao salvar, o saveEditItems
      // reconstrói a turma inteira a partir desse snapshot e RESSUSCITA linhas que
      // já tinham sido apagadas no servidor (bug crônico do tradutor/turma que
      // "voltava"). Solução: descartar abas de edição na restauração — o usuário
      // reabre a turma pela lista e recebe os dados FRESCOS do servidor.
      // Abas de "nova turma" (wizard, sem editClassId) seguem sobrevivendo.
      return tabs.filter(t => t && !t.editClassId);
    } catch { return []; }
  });
  const [activeTabId, setActiveTabId] = useState(() => {
    try { const s = sessionStorage.getItem('relyon360_activeTabId'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  React.useEffect(() => { try { sessionStorage.setItem('relyon360_tabs', JSON.stringify(scheduleTabs)); } catch {} }, [scheduleTabs]);
  React.useEffect(() => { try { sessionStorage.setItem('relyon360_activeTabId', JSON.stringify(activeTabId)); } catch {} }, [activeTabId]);
  // Se a aba ativa apontava para uma aba de edição descartada no reload, reseta.
  React.useEffect(() => {
    setActiveTabId(prev => (prev != null && !scheduleTabs.some(t => t.id === prev)) ? null : prev);
  }, []);

  const isMobile = useIsMobile();
  const isTouch  = useIsTouch();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tabletSideOpen, setTabletSideOpen] = useState(true);

  const handleLogin = (u, keep = true) => {
    const cleanUser = { ...u }; delete cleanUser._source;
    // _sessionCreatedAt: marcador para o portão de sessão (session revoke gate).
    // Sessões criadas ANTES de um revoke remoto são derrubadas; novas escapam.
    // Preserva o valor se já veio do hidrate (restauração via LS), senão cria agora.
    if (cleanUser._sessionCreatedAt == null) cleanUser._sessionCreatedAt = Date.now();
    // Espelho global para o loop periódico em AppLoader conseguir ler sem prop drill.
    try { window.__sessionCreatedAt = cleanUser._sessionCreatedAt; } catch {}
    setUser(cleanUser);
    setActive("dashboard");
    if (keep) {
      try { localStorage.setItem('rl360_session', JSON.stringify(cleanUser)); } catch {}
    } else {
      try { localStorage.removeItem('rl360_session'); } catch {}
    }
  };
  const handleLogout = () => {
    sb.auth.signOut();
    setUser(null); setScheduleTabs([]); setActiveTabId(null);
    try {
      sessionStorage.removeItem('relyon360_tabs');
      sessionStorage.removeItem('relyon360_activeTabId');
      localStorage.removeItem('rl360_session');
    } catch {}
  };

  if (!user) return <Login onLogin={handleLogin} users={users} instructors={instructors} setUsers={setUsers} setInstructors={setInstructors} />;

  // ── BASE FILTERING ──
  // viewBase: admin/dev escolhem via seletor; demais usam a base do próprio usuário.
  const [adminViewBase, setAdminViewBase] = useState(() => {
    // Admin começa visualizando a mesma base que estiver no seu perfil (ou Macaé como padrão)
    return user.base || "Macaé";
  });
  const isAdminOrDev = canAdmin && canAdmin(user);
  const viewBase = isAdminOrDev ? adminViewBase : (user.base || null);

  // Instrutores filtrados pela base ativa (null = sem filtro — mostra todos)
  const visibleInstructors = viewBase
    ? instructors.filter(i => !i.base || i.base === viewBase)
    : instructors;

  // Schedules filtrados por base (null em schedules antigos = visível em todas as bases)
  const baseSchedules       = viewBase ? schedules.filter(s => !s.base || s.base === viewBase) : schedules;
  const incompanySchedules  = baseSchedules.filter(s => s.planningType === "incompany");
  const eadSchedules        = baseSchedules.filter(s => s.planningType === "ead");
  const offshoreSchedules   = baseSchedules.filter(s => s.planningType === "offshore");
  // Programação Base = sem planningType (legado) ou planningType="base"
  const mainBaseSchedules   = baseSchedules.filter(s => !s.planningType || s.planningType === "base");

  const schedProps = (filtered, ptFilter, ptDefault) => ({
    schedules: filtered, setSchedules, trainings, areas, user,
    instructors, absences, holidays,
    scheduleTabs, setScheduleTabs, activeTabId, setActiveTabId, setActive,
    planningTypeFilter: ptFilter, defaultPlanningType: ptDefault,
    allSchedules: baseSchedules,
    viewBase,
    crossbaseRequests, setCrossbaseRequests,
  });

  const pages = {
    dashboard:    user.role === "instructor" ? <InstructorDashboard schedules={schedules} setSchedules={setSchedules} trainings={trainings} user={user} /> : <Dashboard schedules={schedules} setSchedules={setSchedules} trainings={trainings} setActive={setActive} user={user} instructors={instructors} activities={activities} absences={absences} holidays={holidays} viewBase={viewBase} setAdminViewBase={isAdminOrDev ? setAdminViewBase : null} />,
    schedule:     <Schedule {...schedProps(mainBaseSchedules,  "base",      "base")}      />,
    incompany:    <Schedule {...schedProps(incompanySchedules, "incompany", "incompany")} key="incompany" />,
    ead:          <Schedule {...schedProps(eadSchedules,       "ead",       "ead")}       key="ead" />,
    offshore:     <Schedule {...schedProps(offshoreSchedules,  "offshore",  "offshore")}  key="offshore" />,
    "offshore-clients": <OffshoreClientsPage offshoreClients={offshoreClients} setOffshoreClients={setOffshoreClients} offshoreUnits={offshoreUnits} setOffshoreUnits={setOffshoreUnits} user={user} />,
    "pool-batch": <PoolBatchPage schedules={schedules} setSchedules={setSchedules} trainings={trainings} instructors={instructors} areas={areas} holidays={holidays} absences={absences} user={user} setActive={setActive} scheduleTabs={scheduleTabs} setScheduleTabs={setScheduleTabs} setActiveTabId={setActiveTabId} locals={locals} viewBase={viewBase} />,
    instructors:  <InstructorsPage instructors={visibleInstructors} setInstructors={setInstructors} trainings={trainings} user={user} users={users} areas={areas} schedules={schedules} setSchedules={setSchedules} />,
    trainings:    <TrainingsPage  trainings={trainings} setTrainings={setTrainings} areas={areas} user={user} instructors={instructors} setInstructors={setInstructors} schedules={schedules} />,
    locals:       <LocalsPage     schedules={schedules} locals={locals} setLocals={setLocals} user={user} />,
    ai:           <AiPage         schedules={schedules} setSchedules={setSchedules} trainings={trainings} instructors={visibleInstructors} absences={absences} holidays={holidays} areas={areas} user={user} aiPackages={aiPackages} setAiPackages={setAiPackages} viewBase={viewBase} />,
    reports:              <ReportsPage schedules={schedules} setSchedules={setSchedules} trainings={trainings} instructors={instructors} holidays={holidays} absences={absences} activities={activities} areas={areas} user={user} />,
    "reports-financeiro": <ReportsPage key="reports-financeiro" schedules={schedules} setSchedules={setSchedules} trainings={trainings} instructors={instructors} holidays={holidays} absences={absences} activities={activities} areas={areas} user={user} initialTab="financeiro" />,
    "reports-kpi":        <ReportsPage key="reports-kpi"        schedules={schedules} setSchedules={setSchedules} trainings={trainings} instructors={instructors} holidays={holidays} absences={absences} activities={activities} areas={areas} user={user} initialTab="utilizacao" />,
    cobertura:    <CoverageDailyPage schedules={schedules} instructors={instructors} activities={activities} setActivities={setActivities} absences={absences} setAbsences={setAbsences} holidays={holidays} user={user} locals={locals} trainings={trainings} setActive={setActive} setScheduleTabs={setScheduleTabs} setActiveTabId={setActiveTabId} />,
    settings:     <SettingsPage   areas={areas} setAreas={setAreas} user={user} />,
    holidays:     <HolidaysPage   holidays={holidays} setHolidays={setHolidays} user={user} />,
    users:        <UsersPage       users={users} setUsers={setUsers} currentUser={user} instructors={instructors} />,
    absenteismo:  <AbsenteismoPage instructors={instructors} absences={absences} setAbsences={setAbsences} user={user} />,
    "my-history": <ReportsPage    schedules={schedules} trainings={trainings} instructors={instructors} holidays={holidays} absences={absences} activities={activities} user={user} />,
    "my-confirmations": <MyConfirmations schedules={schedules} trainings={trainings} user={user} />,
    "my-profile":     <InstructorProfile user={user} instructors={instructors} setInstructors={setInstructors} setUser={setUser} />,
    "locals-report":  <LocalsReportPage schedules={schedules} />,
    issues:           <IssuesPage schedules={schedules} setSchedules={setSchedules} user={user} instructors={instructors} trainings={trainings} setActive={setActive} />,
    comunicacao:      <ComunicacaoPage user={user} instructors={instructors} requests={requests} setRequests={setRequests} absences={absences} setAbsences={setAbsences} crossbaseRequests={crossbaseRequests} setCrossbaseRequests={setCrossbaseRequests} viewBase={viewBase} />,
    sobre:            <SobrePage user={user} />,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#01323d", fontFamily: "'Segoe UI',sans-serif", position: "relative" }}>
      {isMobile && mobileMenuOpen && (
        <div onClick={() => setMobileMenuOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 199 }} />
      )}
      <Sidebar active={active} setActive={setActive} user={user} onLogout={handleLogout}
        isMobile={isMobile} mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen}
        tabletSideOpen={tabletSideOpen} setTabletSideOpen={setTabletSideOpen}
        viewBase={viewBase} setAdminViewBase={isAdminOrDev ? setAdminViewBase : null}
        crossbaseRequests={crossbaseRequests} />
      <main style={{ flex: 1, padding: isMobile ? 16 : 32, overflowY: "auto", minWidth: 0, marginLeft: isMobile ? 0 : isTouch ? (tabletSideOpen ? 248 : 60) : 60, transition: "margin-left 0.28s cubic-bezier(0.4,0,0.2,1)" }}>
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


// ── LOADING RING 360 ─────────────────────────────────────────────────────────
// Anel circular animado fechando até 360° conforme o progresso (0-100%).
// Substitui o "azul vazio" que parecia travado durante o boot. Reutilizado em:
//   - boot normal (pct sobe em estágios)
//   - portão de versão (recarregando para versão nova)
//   - logout forçado (revoke remoto)
// Mensagem dinâmica + subtítulo opcional. Halo laranja sutil ao redor do anel.
const LoadingRing360 = ({ pct, msg, sub, tone }) => {
  const r = 38;
  const C = 2 * Math.PI * r;                 // circunferência
  const dashOffset = C * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const palette = tone === 'warn'
    ? { stop1: '#ffd066', stop2: '#e8920a', text: '#ffa619', sub: '#94a3b8' }
    : { stop1: '#ffd066', stop2: '#e8920a', text: '#ffa619', sub: '#475569' };
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#011c22',flexDirection:'column',gap:28,padding:'0 24px',textAlign:'center'}}>
      <div style={{position:'relative',width:140,height:140}}>
        <svg width="140" height="140" viewBox="0 0 96 96" style={{position:'absolute',top:0,left:0,filter:'drop-shadow(0 0 24px rgba(255,166,25,0.18))'}}>
          <circle cx="48" cy="48" r={r} stroke="#0e3a45" strokeWidth="6" fill="none"/>
        </svg>
        <svg width="140" height="140" viewBox="0 0 96 96" style={{position:'absolute',top:0,left:0,transform:'rotate(-90deg)'}}>
          <defs>
            <linearGradient id="rl360-loader-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={palette.stop1}/>
              <stop offset="100%" stopColor={palette.stop2}/>
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r={r} stroke="url(#rl360-loader-grad)" strokeWidth="6" fill="none"
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)'}} />
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{fontSize:30,fontWeight:800,color:palette.text,letterSpacing:0.5,lineHeight:1}}>
            {Math.round(pct)}<span style={{fontSize:16,fontWeight:600,color:palette.stop2,marginLeft:1}}>%</span>
          </div>
        </div>
      </div>
      <div>
        <div style={{fontSize:24,fontWeight:800,color:'#e2e8f0',letterSpacing:0.5,lineHeight:1}}>
          Rely<span style={{color:'#ffa619'}}>O</span>n
          <span style={{color:'#475569',fontWeight:300,fontSize:18}}> 360</span>
        </div>
        <div style={{color:'#1e4a58',fontSize:11,marginTop:8,letterSpacing:3,textTransform:'uppercase'}}>Scheduler</div>
      </div>
      <div style={{maxWidth:380}}>
        <p style={{color:'#94a3b8',fontSize:14,margin:0,fontWeight:600}}>{msg}</p>
        {sub && <p style={{color:palette.sub,fontSize:12,margin:'8px 0 0',lineHeight:1.5}}>{sub}</p>}
      </div>
    </div>
  );
};

// ── APP LOADER (fetches all data from Supabase before rendering) ──────────────
const AppLoader = () => {
  const [ready, setReady] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [initialUser, setInitialUser] = React.useState(null);
  const [updating, setUpdating]         = React.useState(false);  // portão de versão: recarregando p/ versão nova
  const [staleManual, setStaleManual]   = React.useState(false);  // auto-reload desistiu → instrução manual
  const [updateTarget, setUpdateTarget] = React.useState(0);      // versão nova detectada com a aba aberta (banner)
  const [progress, setProgress]         = React.useState({ pct: 8, msg: 'Iniciando…' });
  // Flag set por _forceLogoutAndReload: mostra mensagem amigável no loading
  // logo após revogação remota de sessão. Lido uma vez e mantido em ref.
  const revokeMsgRef = React.useRef((() => {
    try {
      const v = sessionStorage.getItem('rl360_revoke_msg');
      return v || null;
    } catch { return null; }
  })());
  // Limpa o flag depois que o boot completar (no setReady) — evita reaparecer
  // em reloads subsequentes não relacionados.
  const _clearRevokeMsg = () => { try { sessionStorage.removeItem('rl360_revoke_msg'); } catch {} };
  React.useEffect(() => {
    const DEFAULTS = {
      relyon_trainings: INITIAL_TRAININGS,
      relyon_areas: INITIAL_AREAS,
      relyon_instructors: INSTRUCTORS,
      relyon_users: USERS,
      relyon_absences: INITIAL_ABSENCES,
      relyon_holidays: INITIAL_HOLIDAYS,
      relyon_activities: INITIAL_ACTIVITIES,
      relyon_ai_packages: [],
    };
    (async () => {
      setProgress({ pct: 15, msg: 'Verificando atualizações…' });
      // ── PORTÃO DE VERSÃO: um cliente em código VELHO recarrega ANTES de ler/gravar
      // dados — senão ele reempurra seu snapshot stale e reverte o trabalho da frota.
      const _gate = await checkVersionGate();
      if (_gate === 'reloading') { setUpdating(true); return; }
      if (_gate === 'manual')    { setStaleManual(true); return; }
      setProgress({ pct: 30, msg: 'Conectando ao banco de dados…' });
      let loadOk = false;
      try {
        const { data, error: fetchError } = await sb.from('app_state').select('key,value').in('key', _DB_KEYS);
        if (fetchError) throw fetchError;
        setProgress({ pct: 50, msg: 'Carregando dados…' });
        _initialData = {};
        (data || []).forEach(r => {
          _initialData[r.key] = r.value;
          _syncState[r.key] = { status: 'synced', lastSync: Date.now() };
        });
        // Hidrata tombstones globais (turmas excluídas) ANTES do useSchedules rodar.
        // Sem isso, a reconciliação inicial não saberia que classIds foram deletados
        // em outro dispositivo e re-inseriria as rows que ainda estão no LS local.
        if (typeof window !== 'undefined' && typeof window.__hydrateTombstones === 'function') {
          window.__hydrateTombstones();
        }
        // Migração 1: normaliza skills de string[] → {name,canLead}[]
        if (_initialData.relyon_instructors) {
          _initialData.relyon_instructors = _initialData.relyon_instructors.map(i => ({
            ...i,
            skills: (i.skills || []).map(s => typeof s === 'string' ? { name: s, canLead: false } : s)
          }));
        }
        // Migração 2: hash senhas plaintext → bcrypt
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
        // Migração 3: skills {name,canLead} → {moduleId,trainingId,canLead}
        // Skills TRANSLATOR_SKILL e órfãs (não encontradas no catálogo) mantêm o campo name.
        let skillsMigrated = false;
        if (_initialData.relyon_instructors && _initialData.relyon_trainings) {
          _initialData.relyon_instructors = _initialData.relyon_instructors.map(instr => {
            const newSkills = (instr.skills || []).map(s => {
              if (!s || s.moduleId != null) return s;
              const name = typeof s === 'string' ? s : s.name;
              const canLead = typeof s === 'string' ? false : (s.canLead || false);
              if (name === TRANSLATOR_SKILL) return { name: TRANSLATOR_SKILL, canLead };
              let foundMod = null, foundTraining = null;
              for (const t of _initialData.relyon_trainings) {
                const m = (t.modules || []).find(m => m.name === name);
                if (m) { foundMod = m; foundTraining = t; break; }
              }
              if (foundMod) {
                skillsMigrated = true;
                return { moduleId: foundMod.id, trainingId: foundTraining.id, canLead };
              }
              return { name, canLead };
            });
            return { ...instr, skills: newSkills };
          });
        }
        // Migração 4: trainings com defaultSchedule:false sem horarioFim recebem "21:00".
        // Preserva semântica atual (Não = até 21:00) e elimina campo nulo no banco.
        // Treinamentos com defaultSchedule:true (ou undefined) NÃO recebem horarioFim —
        // o teto 17:00 continua implícito pela flag.
        let trainingsMigrated = false;
        if (Array.isArray(_initialData.relyon_trainings)) {
          _initialData.relyon_trainings = _initialData.relyon_trainings.map(t => {
            if (t.defaultSchedule === false && !t.horarioFim) {
              trainingsMigrated = true;
              return { ...t, horarioFim: "21:00" };
            }
            return t;
          });
        }
        if (pwMigrated || skillsMigrated || trainingsMigrated) {
          setProgress({ pct: 70, msg: 'Aplicando atualizações…' });
          const upsertRows = [];
          if (pwMigrated) upsertRows.push({ key: 'relyon_users', value: _initialData.relyon_users });
          if (pwMigrated || skillsMigrated) upsertRows.push({ key: 'relyon_instructors', value: _initialData.relyon_instructors });
          if (trainingsMigrated) upsertRows.push({ key: 'relyon_trainings', value: _initialData.relyon_trainings });
          await sb.from('app_state').upsert(upsertRows, { onConflict: 'key' });
        }
        // Migração one-shot: tipo `feriado` (FASE 1) → entidade global `relyon_holidays` (FASE 6)
        // Cada absence com type:"feriado" vira um holiday nacional (scope:"national"),
        // deduplicado por data. Os absences de feriado são removidos do array.
        if (Array.isArray(_initialData.relyon_absences)) {
          const feriadoAbsences = _initialData.relyon_absences.filter(a => a.type === "feriado");
          if (feriadoAbsences.length > 0) {
            const existingHolidays = Array.isArray(_initialData.relyon_holidays) ? _initialData.relyon_holidays : [];
            const existingDates = new Set(existingHolidays.map(h => h.date));
            const newHolidays = [];
            feriadoAbsences.forEach(a => {
              const start = a.startDate, end = a.endDate || a.startDate;
              const cur = new Date(start + "T12:00:00");
              const stop = new Date(end + "T12:00:00");
              while (cur <= stop) {
                const ds = cur.toISOString().split("T")[0];
                if (!existingDates.has(ds)) {
                  existingDates.add(ds);
                  newHolidays.push({
                    id: Date.now() + Math.floor(Math.random() * 100000) + newHolidays.length,
                    date: ds,
                    name: a.category || "Feriado",
                    scope: "national", state: "", city: ""
                  });
                }
                cur.setDate(cur.getDate() + 1);
              }
            });
            const cleanedAbsences = _initialData.relyon_absences.filter(a => a.type !== "feriado");
            _initialData.relyon_absences = cleanedAbsences;
            _initialData.relyon_holidays = [...existingHolidays, ...newHolidays];
            await sb.from('app_state').upsert([
              { key: 'relyon_absences', value: cleanedAbsences },
              { key: 'relyon_holidays', value: _initialData.relyon_holidays }
            ], { onConflict: 'key' });
          }
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
            if (ls != null) {
              _initialData[k] = JSON.parse(ls);
              _syncState[k] = { status: 'local', lastSync: null };
            }
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
      setProgress({ pct: 88, msg: 'Restaurando sessão…' });
      let foundSession = false;
      let _sessionCreatedAt = 0;       // 0 = legacy, qualquer revoke derruba
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
          // Sessão Supabase Auth: extrai created_at do JWT issued (epoch s → ms).
          const supaIat = sData.session.user && sData.session.user.created_at
            ? new Date(sData.session.user.created_at).getTime() : 0;
          const fullUser = record
            ? { ...record, role: meta.role || record.role, avatar: av, _sessionCreatedAt: supaIat || Date.now() }
            : { username: meta.username, name: meta.name || meta.username, role: meta.role || "user", avatar: av, _sessionCreatedAt: supaIat || Date.now() };
          _sessionCreatedAt = fullUser._sessionCreatedAt;
          setInitialUser(fullUser);
          foundSession = true;
        }
      } catch {}
      // Fallback: sessão local (instrutores e usuários sem conta Supabase Auth)
      if (!foundSession) {
        try {
          const saved = localStorage.getItem('rl360_session');
          if (saved) {
            const sv = JSON.parse(saved);
            const iList = (_initialData || {}).relyon_instructors || [];
            const uList = (_initialData || {}).relyon_users || [];
            const found = sv.role === 'instructor'
              ? iList.find(i => i.username === sv.username)
              : uList.find(u => u.username === sv.username);
            if (found) {
              const av = found.avatar || found.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
              // Preserva _sessionCreatedAt da sessão LS (criado em handleLogin).
              // Sessão legacy sem o campo = 0 → qualquer revoke remoto derruba.
              const cAt = Number(sv._sessionCreatedAt) || 0;
              setInitialUser({ ...found, role: sv.role || found.role, avatar: av, _sessionCreatedAt: cAt });
              _sessionCreatedAt = cAt;
            }
          }
        } catch {}
      }
      // ── PORTÃO DE SESSÃO: revoga sessão antes de montar o App.
      // Se _sessionCreatedAt < ts publicado no servidor → _forceLogoutAndReload
      // (limpa LS, recarrega). NÃO setamos ready nesse caso: o reload toma conta.
      if (foundSession || _sessionCreatedAt) {
        const revoked = await checkSessionRevoke(_sessionCreatedAt);
        if (revoked) return;
        try { window.__sessionCreatedAt = _sessionCreatedAt; } catch {}
      }
      setProgress({ pct: 100, msg: 'Pronto!' });
      _clearRevokeMsg();
      setReady(true);
    })();
  }, []);
  // ── PORTÃO DE VERSÃO + SESSÃO (abas já abertas): re-checa a cada 2 min e ao
  // focar/voltar. Se este cliente ficou velho: recarrega na hora se a aba está
  // OCULTA (não interrompe ninguém); se visível, mostra um banner e deixa o
  // usuário aplicar quando quiser. Se a sessão foi revogada remotamente:
  // dispara _forceLogoutAndReload (limpa LS e recarrega, em qualquer visibilidade).
  // Se ficou oculto > 5 min: re-fetcha estado do Supabase (convergência multi-device).
  React.useEffect(() => {
    let alive = true;
    const REVAL_THRESHOLD_MS = 5 * 60 * 1000; // 5 min oculto → revalida
    let hiddenAt = 0;
    const check = async () => {
      // Session revoke check primeiro: se foi revogada, _forceLogoutAndReload
      // já dispara o reload, então não precisamos checar version gate.
      try {
        const cAt = Number(window.__sessionCreatedAt) || 0;
        const revoked = await checkSessionRevoke(cAt);
        if (revoked) return;
      } catch {}
      if (!alive) return;
      let target = 0;
      try { target = await serverVersionAhead(); } catch {}
      if (!alive || !target) return;
      if (document.visibilityState === 'hidden') {
        const ok = await _applyUpdate(target);
        if (!ok && alive) setStaleManual(true);
      } else if (alive) {
        setUpdateTarget(target);
      }
    };
    const onRevalidate = async () => {
      if (hiddenAt > 0 && (Date.now() - hiddenAt) >= REVAL_THRESHOLD_MS) {
        hiddenAt = 0;
        if (typeof window.__revalidateFromSupabase === 'function') {
          await window.__revalidateFromSupabase();
        }
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        check();
      } else {
        onRevalidate();
      }
    };
    const onFocus = () => { check(); onRevalidate(); };
    const iv = setInterval(check, 120000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onFocus); };
  }, []);
  if (updating) return (
    <LoadingRing360 pct={75} msg="Atualizando para a nova versão…" sub="Pegando a versão mais recente do RelyOn 360." />
  );
  if (staleManual) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#011c22',flexDirection:'column',gap:20}}>
      <div style={{fontSize:44}}>🔄</div>
      <div style={{textAlign:'center',maxWidth:400}}>
        <div style={{fontSize:18,fontWeight:700,color:'#e2e8f0',marginBottom:8}}>Há uma versão mais recente</div>
        <div style={{color:'#64748b',fontSize:14,lineHeight:1.6}}>
          Não consegui atualizar sozinho. Feche o app e abra de novo, ou faça um
          recarregamento forçado: <strong style={{color:'#ffa619'}}>Ctrl+Shift+R</strong>
          {' '}(no iPad: Ajustes → Safari → Limpar Histórico e Dados de Sites).
        </div>
      </div>
      <button onClick={() => { try { sessionStorage.removeItem('rl360_vgate'); } catch {} location.reload(); }}
        style={{background:'linear-gradient(135deg,#ffa619,#e8920a)',border:'none',borderRadius:10,padding:'12px 32px',color:'#011c22',fontWeight:700,fontSize:15,cursor:'pointer'}}>
        ↻ Recarregar agora
      </button>
    </div>
  );
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
  if (!ready) {
    const isRevoked = revokeMsgRef.current === 'session_revoked';
    return (
      <LoadingRing360
        pct={progress.pct}
        msg={isRevoked ? 'Sua sessão foi encerrada pelo desenvolvedor' : progress.msg}
        sub={isRevoked
          ? 'Pode demorar um pouco mais que o normal para recarregar. Quando aparecer a tela de login, entre novamente com sua senha.'
          : null}
      />
    );
  }
  return (
    <>
      {updateTarget > 0 && (
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:10000,background:'linear-gradient(135deg,#ffa619,#e8920a)',color:'#011c22',padding:'9px 16px',display:'flex',alignItems:'center',justifyContent:'center',gap:14,fontWeight:700,fontSize:13.5,boxShadow:'0 4px 18px rgba(0,0,0,0.45)'}}>
          <span>🔄 Nova versão do RelyOn 360 disponível.</span>
          <button onClick={async () => { const ok = await _applyUpdate(updateTarget); if (!ok) setStaleManual(true); }}
            style={{background:'#011c22',color:'#ffa619',border:'none',borderRadius:8,padding:'6px 16px',fontWeight:700,fontSize:13,cursor:'pointer',whiteSpace:'nowrap'}}>
            Atualizar agora
          </button>
        </div>
      )}
      <App initialUser={initialUser} />
      <SaveMonitor />
    </>
  );
};

// ── SAVE STATUS MONITOR — badge persistente com 5 estados ────────────────────
// Lê window.__outboxStats() (Fase 2) via polling 2s + reage a onSaveEvent.
// Estados, em ordem de prioridade visual:
//   1. offline      → cinza, há N pendentes
//   2. failed-rls   → vermelho forte, alerta permanente (não retry automático)
//   3. pending>0    → vermelho discreto, clicável para forçar sync
//   4. inflight>0   → amarelo com spinner
//   5. synced       → verde discreto, "Sincronizado · há Xs"
// Clicar abre painel com lista das ops pendentes e botão "Sincronizar agora".
const _opLabel = (o) => {
  if (o.op === 'insert') return `Criar ${o.rows ? o.rows.length : 0} turma(s)`;
  if (o.op === 'delete') return `Excluir ${o.ids ? o.ids.length : 0} linha(s)`;
  if (o.op === 'update') return `Alterar turma ${o.row && o.row.className ? o.row.className : ''}`.trim();
  if (o.op === 'delete-by-class') return `Excluir turma inteira`;
  return o.op;
};
const _fmtAgo = (ts) => {
  if (!ts || ts === Infinity) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `há ${sec}s`;
  if (sec < 3600) return `há ${Math.floor(sec/60)}min`;
  return `há ${Math.floor(sec/3600)}h`;
};

const SaveMonitor = () => {
  const [stats,         setStats]         = React.useState(() => (typeof window !== 'undefined' && window.__outboxStats ? window.__outboxStats() : { total: 0, pending: 0, failedRls: 0, oldestQueuedAt: Infinity }));
  const [inflight,      setInflight]      = React.useState(0);
  const [online,        setOnline]        = React.useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastSuccessAt, setLastSuccessAt] = React.useState(Date.now());
  const [lastError,     setLastError]     = React.useState(null);
  const [expanded,      setExpanded]      = React.useState(false);
  const [, _tick]                         = React.useState(0);
  const [verifying,     setVerifying]     = React.useState(false);
  const [verifyResult,  setVerifyResult]  = React.useState(null);
  const [flushing,      setFlushing]      = React.useState(false);
  const [flushResult,   setFlushResult]   = React.useState(null); // {status:'idle'|'empty'|'done'|'partial', before, after, msg}

  const refreshStats = React.useCallback(() => {
    if (typeof window !== 'undefined' && window.__outboxStats) setStats(window.__outboxStats());
  }, []);

  React.useEffect(() => {
    const unsub = onSaveEvent(ev => {
      if (ev.pending) { setInflight(p => p + 1); return; }
      setInflight(p => Math.max(0, p - 1));
      if (ev.ok) { setLastSuccessAt(Date.now()); setLastError(null); }
      else { setLastError(ev.msg || 'Erro desconhecido'); }
      refreshStats();
    });
    const on = () => { setOnline(true); refreshStats(); };
    const off = () => { setOnline(false); refreshStats(); };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    // Polling pra refletir mudanças que não passam por onSaveEvent (ex: timer
    // de backoff atualizou attempts, mas a op ainda não progrediu).
    const poll = setInterval(() => { refreshStats(); _tick(t => t + 1); }, 2000);
    return () => { unsub(); window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(poll); };
  }, [refreshStats]);

  // Compute mode em ordem de prioridade.
  let mode;
  if (!online && stats.pending > 0) mode = 'offline';
  else if (stats.failedRls > 0) mode = 'failed-rls';
  else if (stats.pending > 0) mode = 'pending';
  else if (inflight > 0) mode = 'saving';
  else mode = 'synced';

  // flushNow agora é async com feedback visual: estado de carregamento, resultado
  // ("nada pendente", "X ops aplicadas", ou falha por RLS). Garante que o clique
  // nunca seja um no-op silencioso (bug 2026-05-21).
  const flushNow = React.useCallback(async () => {
    if (typeof window === 'undefined' || !window.__outboxFlush || !window.__outboxStats) return;
    setFlushing(true);
    setFlushResult(null);
    const before = window.__outboxStats();
    try {
      await window.__outboxFlush();
    } catch (e) {
      setFlushResult({ status: 'partial', msg: e?.message || String(e) });
      setFlushing(false);
      refreshStats();
      return;
    }
    // Reconciliação completa: detecta e empurra rows em LS ausentes no banco,
    // mesmo que a outbox esteja vazia. Cobre falhas silenciosas anteriores.
    let reconciled = 0;
    let reconcileErr = null;
    if (typeof window.__fullReconcile === 'function') {
      try {
        const r = await window.__fullReconcile();
        reconciled = r?.inserted || 0;
      } catch (e) {
        reconcileErr = e?.message || String(e);
      }
    }
    const after = window.__outboxStats();
    refreshStats();
    if (after.failedRls > 0 || after.total > 0) {
      setFlushResult({ status: 'partial', before: before.total, after: after.total, failedRls: after.failedRls, reconciled });
    } else if (before.total === 0 && reconciled === 0 && !reconcileErr) {
      setFlushResult({ status: 'empty' });
    } else {
      setFlushResult({ status: 'done', cleared: before.total, reconciled, reconcileErr });
    }
    setFlushing(false);
    setTimeout(() => setFlushResult(null), 8000);
  }, [refreshStats]);
  const ops = (typeof window !== 'undefined' && window.__outboxList) ? window.__outboxList() : [];

  const removeOp = React.useCallback((id) => {
    if (typeof window !== 'undefined' && window.__outboxRemove) {
      window.__outboxRemove(id);
      refreshStats();
    }
  }, [refreshStats]);

  const verifyDb = React.useCallback(async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { count, error } = await sb.from('relyon_schedules').select('*', { count: 'exact', head: true });
      if (error) throw error;
      const local = JSON.parse(localStorage.getItem('rl360_relyon_schedules') || '[]').length;
      setVerifyResult({ ok: true, supabase: count, local });
    } catch (e) {
      setVerifyResult({ ok: false, msg: e.message || String(e) });
    } finally {
      setVerifying(false);
    }
  }, []);

  // Paleta por modo.
  const palette = {
    offline:     { bg: '#1f2937', border: '#475569', fg: '#cbd5e1', accent: '#94a3b8' },
    'failed-rls':{ bg: '#7f1d1d', border: '#ef4444', fg: '#fecaca', accent: '#fca5a5' },
    pending:     { bg: '#3f1d1d', border: '#b91c1c', fg: '#fca5a5', accent: '#ef4444' },
    saving:      { bg: '#422006', border: '#d97706', fg: '#fcd34d', accent: '#ffa619' },
    synced:      { bg: '#073d4a', border: '#154753', fg: '#94a3b8', accent: '#16a34a' },
  }[mode];

  const label = (() => {
    if (mode === 'offline')     return `Offline · ${stats.pending} pendente${stats.pending > 1 ? 's' : ''}`;
    if (mode === 'failed-rls')  return `${stats.failedRls} falha${stats.failedRls > 1 ? 's' : ''} de permissão — clique`;
    if (mode === 'pending')     return `${stats.pending} alteração${stats.pending > 1 ? 'ões' : ''} pendente${stats.pending > 1 ? 's' : ''} · sincronizar`;
    if (mode === 'saving')      return inflight > 1 ? `Salvando ${inflight}…` : 'Salvando…';
    return `Sincronizado · ${_fmtAgo(lastSuccessAt)}`;
  })();

  const icon = (() => {
    if (mode === 'saving') return <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}><circle cx="6" cy="6" r="4.5" stroke={palette.accent} strokeWidth="1.5" fill="none" strokeDasharray="14 8" /></svg>;
    if (mode === 'offline') return <span style={{ fontSize: 11, color: palette.accent }}>⊘</span>;
    if (mode === 'failed-rls') return <span style={{ fontSize: 13 }}>⛔</span>;
    if (mode === 'pending') return <span style={{ fontSize: 13 }}>⚠</span>;
    return <span style={{ fontSize: 11, color: palette.accent }}>●</span>;
  })();

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
      {expanded && (
        <div style={{ background: '#0b1220', border: '1px solid #334155', borderRadius: 10, padding: 12, color: '#e2e8f0', fontSize: 12, width: 320, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {stats.total > 0 ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Fila de sincronização</div>
              {ops.slice(0, 8).map(o => (
                <div key={o.id} style={{ padding: '6px 0', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: o.status === 'failed-rls' ? '#fca5a5' : '#e2e8f0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{_opLabel(o)}</div>
                    <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>{_fmtAgo(o.queuedAt)} · {o.attempts} tentativa{o.attempts !== 1 ? 's' : ''}{o.status === 'failed-rls' ? ' · permissão negada' : ''}</div>
                  </div>
                  <button
                    title="Descartar esta operação"
                    onClick={() => removeOp(o.id)}
                    style={{ flexShrink: 0, background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#94a3b8', fontSize: 13, lineHeight: 1, padding: '2px 6px', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#374151'; e.currentTarget.style.color = '#94a3b8'; }}
                  >×</button>
                </div>
              ))}
              {ops.length > 8 && <div style={{ marginTop: 6, fontSize: 10, color: '#64748b' }}>+ {ops.length - 8} outra(s)</div>}
              {lastError && <div style={{ marginTop: 8, padding: 6, background: '#1f0a0a', border: '1px solid #7f1d1d', borderRadius: 6, color: '#fca5a5', fontSize: 10 }}>Último erro: {lastError}</div>}
              {flushResult && (
                <div style={{ marginTop: 8, padding: 6, borderRadius: 6, fontSize: 11,
                  background: flushResult.status === 'done' ? '#052e16' : (flushResult.status === 'partial' ? '#3f1d1d' : '#1e293b'),
                  border: `1px solid ${flushResult.status === 'done' ? '#16a34a' : (flushResult.status === 'partial' ? '#b91c1c' : '#475569')}`,
                  color: flushResult.status === 'done' ? '#86efac' : (flushResult.status === 'partial' ? '#fca5a5' : '#94a3b8')
                }}>
                  {flushResult.status === 'done' && (
                    flushResult.cleared > 0 && flushResult.reconciled > 0
                      ? `✓ ${flushResult.cleared} op(s) e ${flushResult.reconciled} registro(s) sincronizados`
                      : flushResult.cleared > 0
                        ? `✓ ${flushResult.cleared} operação(ões) sincronizada(s)`
                        : flushResult.reconciled > 0
                          ? `✓ ${flushResult.reconciled} registro(s) reempurrado(s) ao banco`
                          : '✓ Banco sincronizado'
                  )}
                  {flushResult.status === 'partial' && (flushResult.failedRls > 0
                    ? `${flushResult.after} pendente(s) — ${flushResult.failedRls} com erro de permissão (RLS)`
                    : `${flushResult.after} pendente(s) ainda em retry · ${flushResult.msg || ''}`)}
                  {flushResult.status === 'empty' && '✓ Banco já estava sincronizado'}
                </div>
              )}
              <button onClick={flushNow} disabled={flushing}
                style={{ marginTop: 10, width: '100%', padding: '6px 10px',
                  background: flushing ? '#1e293b' : '#ffa619',
                  color: flushing ? '#64748b' : '#0b1220',
                  border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 12,
                  cursor: flushing ? 'default' : 'pointer' }}>
                {flushing ? 'Sincronizando…' : 'Sincronizar agora'}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Status do banco de dados</div>
              <div style={{ padding: '4px 0 8px', color: '#64748b', fontSize: 11, borderBottom: '1px solid #1e293b' }}>Último save: {_fmtAgo(lastSuccessAt)}</div>
              {verifyResult && (
                <div style={{ marginTop: 8, padding: 8, background: verifyResult.ok ? '#052e16' : '#1f0a0a', border: `1px solid ${verifyResult.ok ? '#16a34a' : '#7f1d1d'}`, borderRadius: 6 }}>
                  {verifyResult.ok ? (
                    <>
                      <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 12 }}>Banco respondeu corretamente</div>
                      <div style={{ color: '#86efac', fontSize: 11, marginTop: 4 }}>Supabase: {verifyResult.supabase} registros de programação</div>
                      <div style={{ color: verifyResult.supabase === verifyResult.local ? '#86efac' : '#fbbf24', fontSize: 11, marginTop: 2 }}>
                        Local (cache): {verifyResult.local} {verifyResult.supabase !== verifyResult.local ? '⚠ divergência — normal se houver outras abas abertas' : '✓ igual'}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#fca5a5', fontSize: 11 }}>Erro: {verifyResult.msg}</div>
                  )}
                </div>
              )}
              <button
                onClick={verifyDb}
                disabled={verifying}
                style={{ marginTop: 10, width: '100%', padding: '6px 10px', background: verifying ? '#1e293b' : '#0e7490', color: verifying ? '#64748b' : '#e0f2fe', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: verifying ? 'default' : 'pointer' }}
              >
                {verifying ? 'Verificando…' : 'Verificar banco de dados'}
              </button>
              {flushResult && (
                <div style={{ marginTop: 8, padding: 6, borderRadius: 6, fontSize: 11,
                  background: flushResult.status === 'done' ? '#052e16' : (flushResult.status === 'partial' ? '#3f1d1d' : '#1e293b'),
                  border: `1px solid ${flushResult.status === 'done' ? '#16a34a' : (flushResult.status === 'partial' ? '#b91c1c' : '#475569')}`,
                  color: flushResult.status === 'done' ? '#86efac' : (flushResult.status === 'partial' ? '#fca5a5' : '#94a3b8')
                }}>
                  {flushResult.status === 'done' && (
                    flushResult.cleared > 0 && flushResult.reconciled > 0
                      ? `✓ ${flushResult.cleared} op(s) e ${flushResult.reconciled} registro(s) sincronizados`
                      : flushResult.cleared > 0
                        ? `✓ ${flushResult.cleared} operação(ões) sincronizada(s)`
                        : flushResult.reconciled > 0
                          ? `✓ ${flushResult.reconciled} registro(s) reempurrado(s) ao banco`
                          : '✓ Banco sincronizado'
                  )}
                  {flushResult.status === 'partial' && `${flushResult.after} pendente(s) — verifique o painel`}
                  {flushResult.status === 'empty' && '✓ Banco já estava sincronizado'}
                </div>
              )}
              <button onClick={flushNow} disabled={flushing}
                style={{ marginTop: 6, width: '100%', padding: '6px 10px',
                  background: flushing ? '#0a1420' : '#1e293b',
                  color: flushing ? '#475569' : '#e2e8f0',
                  border: `1px solid ${flushing ? '#1e293b' : '#475569'}`, borderRadius: 6, fontWeight: 700, fontSize: 12,
                  cursor: flushing ? 'default' : 'pointer' }}>
                {flushing ? 'Sincronizando…' : 'Forçar sincronização'}
              </button>
            </>
          )}
        </div>
      )}
      <div
        onClick={() => setExpanded(x => !x)}
        style={{ background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 8, padding: '6px 12px', color: palette.fg, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
      >
        {icon}
        <span>{label}</span>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<AppLoader />);
