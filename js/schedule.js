// ── SCHEDULE ──────────────────────────────────────────────────────────────────
const Schedule = ({ schedules, setSchedules, trainings, areas, user, instructors, absences, holidays, scheduleTabs, setScheduleTabs, activeTabId, setActiveTabId, setActive, planningTypeFilter, defaultPlanningType, allSchedules, viewBase, crossbaseRequests, setCrossbaseRequests, eadConfig, setEadConfig }) => {

  // ── Time helpers ─────────────────────────────────────────────────────────
  const minsToTime = m => { const mm = Math.max(0, m); return `${String(Math.floor(mm/60)).padStart(2,"0")}:${String(mm%60).padStart(2,"0")}`; };
  const addDays = (ds, n) => { const d = new Date(ds+"T12:00:00"); d.setDate(d.getDate()+n); return d.toISOString().split("T")[0]; };
  const fmtDate = ds => ds ? new Date(ds+"T12:00:00").toLocaleDateString("pt-BR", { weekday:"short", day:"2-digit", month:"short" }) : "";
  
  // ── Grade horária — usa lógica única de config.js (recalcTimes/applyDaySchedule).
  // Chunks de continuação (manhã→tarde) precisam de uid único + _chunkOf, senão
  // findIndex por uid retorna sempre o mestre e edições da tarde sobrescrevem
  // a manhã (e React reclama de keys duplicadas).
  const _wizardChunkFactory = (item, isFirst, curDate, startStr, endStr, chunkIdx) => ({
    ...item,
    ...(isFirst
      ? { date: curDate }
      : { id: newScheduleId(), uid: `${item.uid}__c${chunkIdx}`, _chunkOf: item.uid, date: curDate, slots: (item.slots || []).map(s => ({ ...s })) }),
    startTime: startStr,
    endTime: endStr
  });
  // Wrapper: resolve lunch só pelo training (override por turma foi descartado).
  const _recalcWizard = (items, startDateStr, startMins, dayEnd = DEFAULT_DAY_END, training = selTraining) => {
    const lunch = lunchFromSchedule(training?.lunchSchedule);
    return recalcTimes(items, startDateStr, startMins, dayEnd, lunch, _wizardChunkFactory);
  };

  const getLocalOpts = (mod, training) => {
    if (!mod) return LOCALS;
    // Se o modulo tem locals cadastrados, usa apenas esses
    if (mod.locals && mod.locals.length > 0) {
      return LOCALS.filter(l => mod.locals.includes(l.name));
    }
    // O tipo de programação (rota) define a FAMÍLIA de locais — independe da base física
    if (defaultPlanningType === "incompany" || training?.inCompany) return LOCALS.filter(l => l.type === "In Company");
    if (defaultPlanningType === "ead")      return LOCALS.filter(l => l.type === "Online");
    if (defaultPlanningType === "offshore") return LOCALS.filter(l => l.type === "Offshore");
    // Programação base: SÓ locais da base física ativa (Macaé ≠ Bangu), depois por teórico/prático
    const area = areas.find(a => a.id === training?.area);
    const isCbinc = area && /CBINC|INCENDIO|INCÊNDIO/i.test(area.name);
    const bType = baseLocalType(viewBase);
    return LOCALS.filter(l => {
      if (bType && l.type !== bType) return false;   // exclui locais de outra base
      if (mod.type === "TEORIA") return l.env === "Teórico";
      if (mod.type === "PRÁTICA") {
        if (isCbinc) return l.subtype === "incendio";
        return l.env === "Prático";
      }
      return true;
    });
  };

  // ── Random helpers para variação de instrutor no recálculo ───────────────
  // Fisher-Yates puro. Usado quando "↺ Recalcular" é acionado para gerar uma
  // sugestão diferente da anterior preservando os critérios (skill, ausência,
  // conflito, score).
  const shuffleArr = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Ordena pool de qualificados para seleção de instrutor.
  // Modo normal (previousIds vazio): ordem estrita por score desc.
  // Modo variação (previousIds com elementos): prioriza quem NÃO estava no
  // plano anterior; tiebreak por score desc; em empate final, ordem aleatória
  // (preservada pelo sort estável após shuffle inicial).
  const orderQualified = (pool, scoreMap, previousIds) => {
    const sortByScore = (a, b) => (scoreMap[b.id]||0) - (scoreMap[a.id]||0);
    if (!previousIds || previousIds.size === 0) {
      return [...pool].sort(sortByScore);
    }
    const arr = shuffleArr(pool);
    arr.sort((a, b) => {
      const aPrev = previousIds.has(String(a.id)) ? 1 : 0;
      const bPrev = previousIds.has(String(b.id)) ? 1 : 0;
      if (aPrev !== bPrev) return aPrev - bPrev;
      return sortByScore(a, b);
    });
    return arr;
  };

  // ── List-view state (local to Schedule mount) ────────────────────────────
  const [viewMode,    setViewMode]    = useState("week");
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [dateOffset,  setDateOffset]  = useState(0);
  const [search,      setSearch]      = useState("");
  const [expandCls,   setExpandCls]   = useState({});
  const [delGuard,    setDelGuard]    = useState({ show: false, action: null, pass: "", err: "" });
  const [dateGuard,   setDateGuard]   = useState({ show: false, action: null, pass: "", err: "", msg: "" });
  const [editGuard,   setEditGuard]   = useState({ show: false, action: null, pass: "", err: "", summary: [], header: "" });
  const [conflictGuard, setConflictGuard] = useState({ show: false, conflicts: [], onConfirm: null });
  const [crossbaseModal, setCrossbaseModal] = useState(null); // { item, targetBase } — requisição de instrutor cross-base
  const [notifyModal,     setNotifyModal]     = useState(false);
  const [notifyEditModal, setNotifyEditModal] = useState(false);
  const [showLinkPicker,  setShowLinkPicker]  = useState(false);
  const DELETION_REASONS = ["ALUNO NÃO VEIO", "FALTA DE INSTRUTOR PARA ATENDER", "SOLICITADO PELO PRÓPRIO CLIENTE INTERNO", "SOLICITADO PELO PRÓPRIO CLIENTE EXTERNO", "TURMA CANCELADA PELO SOLICITANTE", "CANCELAMENTO NA CRIAÇÃO (SEM IMPACTO)"];
  const askDelete = (fn, archived, reasonOptions) => setDelGuard({ show: true, action: fn, pass: "", err: "", archived: !!archived, reasonOptions: reasonOptions || null });
  // Drag state (ephemeral, no need to persist in tab)
  const [dragIdx,     setDragIdx]     = useState(null);
  const [dragOver,    setDragOver]    = useState(null);
  const [dragEditId,  setDragEditId]  = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  // List-view quick-edit drag & inline edit
  const [listDragSrcId, setListDragSrcId] = useState(null);
  const [listEditId,    setListEditId]    = useState(null);
  const [splitMode,   setSplitMode]   = useState(() => sessionStorage.getItem('relyon_splitMode') === '1');
  const toggleSplit   = () => setSplitMode(p => { const n=!p; sessionStorage.setItem('relyon_splitMode', n?'1':'0'); return n; });

  // ── Tab-based state ───────────────────────────────────────────────────────
  const BLANK_WIZ = { trainingId:"", className:"", date:"", startTime:"08:00", studentCount:"", observation:"", withTranslator:false, modeId:"", linkToOther:false, linkedClassNames:[], planningType: defaultPlanningType || "base" };
  const activeTab = scheduleTabs.find(t => t.id === activeTabId);
  const step = activeTab ? (activeTab.step || 1) : 0;
  const setStep = v => setScheduleTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, step: v } : t));
  const { wizForm=BLANK_WIZ, planItems=[], editCls=null, editClassId=null, editStudentCount="", editObservation="", editItems=[] } = activeTab || {};
  const updTab = patch => setScheduleTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...patch } : t));
  const setWizForm          = v => updTab({ wizForm:          typeof v === 'function' ? v(wizForm)          : v });
  const setPlanItems        = v => updTab({ planItems:        typeof v === 'function' ? v(planItems)        : v });
  const setEditCls          = v => updTab({ editCls:          v });
  const setEditStudentCount = v => updTab({ editStudentCount: v });
  const setEditObservation  = v => updTab({ editObservation:  v });
  const setEditItems        = v => updTab({ editItems:        typeof v === 'function' ? v(editItems)        : v });
  const closeActiveTab = () => {
    const returnTo = activeTab?.returnTo;
    setScheduleTabs(prev => prev.filter(t => t.id !== activeTabId));
    setActiveTabId(null);
    if (returnTo && setActive) setActive(returnTo);
  };
  const openNewTab = () => {
    if (scheduleTabs.length >= 5) { alert("Limite de 5 abas atingido. Feche uma aba para abrir outra."); return; }
    const id = Date.now();
    setScheduleTabs(prev => [...prev, { id, title:"Nova Turma", step:1, wizForm:BLANK_WIZ, planItems:[], editCls:null, editStudentCount:"", editObservation:"", editItems:[] }]);
    setActiveTabId(id);
  };

  const selTraining = trainings.find(t => t.id === +wizForm.trainingId);
  const useDefault  = selTraining?.defaultSchedule !== false;

  // Teto do dia em minutos. defaultSchedule:true => 17h fixo. defaultSchedule:false =>
  // horarioFim do treinamento (default "21:00" garantido pela migração 4 em app.js).
  // Fallback 21*60 protege contra trainings recém-criados antes da migração rodar.
  const getDayEndMin = (training) => {
    if (!training || training.defaultSchedule !== false) return DEFAULT_DAY_END;
    return training.horarioFim ? timeToMins(training.horarioFim) : 21 * 60;
  };

  // ── Edit mode — chunkFactory: id novo + slots clonados sem slot.id, pra cada
  // chunk virar sua própria row no save (em vez de duplicar id da row-mestre e
  // perder os minutos da tarde no diff). _chunkOf usa item.id (row id, não uid).
  const _editChunkFactory = (item, isFirst, curDate, startStr, endStr, _chunkIdx) => ({
    ...item,
    ...(isFirst
      ? { date: curDate }
      : {
          id: newScheduleId(),
          _chunkOf: item.id,
          date: curDate,
          slots: (item.slots || []).map(({ id: _slotId, ...s }) => s)
        }),
    startTime: startStr,
    endTime: endStr
  });
  // Mescla fragmentos adjacentes do mesmo módulo (ex: manhã+tarde split por almoço,
  // carregados como items separados por loadClassForEdit) antes de re-chunkar. Sem isso,
  // reorder/recalcular processa cada fragmento com sua própria _minutes isolada — se o
  // fragmento não cair mais numa fronteira limpa (08h/13h) após mudar de posição, o
  // algoritmo o refragmenta de novo, piorando a cada reorder (bug 2026-07-03: 1 módulo
  // de 8h virando 4 blocos de 3h/1h/3h/1h em vez de 2 blocos de 4h/4h).
  const _mergeModuleFragments = (base) => {
    const merged = [];
    for (const item of base) {
      const prev = merged[merged.length - 1];
      if (prev && prev.mod?.id != null && item.mod?.id != null && prev.mod.id === item.mod.id) {
        prev._minutes = (prev._minutes || 0) + (item._minutes || 0);
      } else {
        merged.push({ ...item });
      }
    }
    return merged;
  };

  // Wrapper: resolve lunch só pelo training (override por turma foi descartado).
  const _applyEdit = (items, training) => {
    if (!items.length) return items;
    const lunch = lunchFromSchedule(training?.lunchSchedule);
    return applyDaySchedule(_mergeModuleFragments(items), DEFAULT_DAY_END, lunch, _editChunkFactory);
  };

  const deChunkEdit = (items) => items.filter(it => !it._chunkOf);

  const loadClassForEdit = (classId) => {
    if (!classId) return;
    const existingTab = scheduleTabs.find(t => t.editClassId === classId);
    if (existingTab) { setActiveTabId(existingTab.id); return; }
    if (scheduleTabs.length >= 5) { alert("Limite de 5 abas atingido. Feche uma aba para abrir outra."); return; }
    const rows = schedules.filter(s => s.classId === classId)
      .slice().sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime));
    if (!rows.length) return;
    const cls = rows[0].className;
    const trainingId = rows[0]?.trainingId;
    const training = trainings.find(t => String(t.id) === String(trainingId));
    // Agrupa por (module, date, startTime, endTime) — apenas multi-instrutor mescla slots.
    // Chunks de um mesmo módulo (manhã + tarde após almoço) ficam como items separados
    // — antes a tarde era descartada silenciosamente (bug). Agora cada chunk vira sua linha.
    // Cada slot carrega o id da row original do banco — identidade estável usada por
    // saveEditItems pra fazer UPDATE granular em vez de DELETE+INSERT da turma inteira
    // (evitava notificar instrutores cuja row não mudou).
    const grouped = [];
    rows.forEach(r => {
      const existing = grouped.find(g =>
        g.module === r.module && g.date === r.date &&
        g.startTime === r.startTime && g.endTime === r.endTime
      );
      if (existing) {
        existing.slots = [...existing.slots,
          { id: r.id, instructorId: String(r.instructorId||""), local: r.local||"", ...(r.role ? { role: r.role } : {}), ...(r.role === "Translator" ? { isTranslator: true } : {}) }];
      } else {
        grouped.push({ ...r, slots: [{ id: r.id, instructorId: String(r.instructorId||""), local: r.local||"", ...(r.role ? { role: r.role } : {}), ...(r.role === "Translator" ? { isTranslator: true } : {}) }] });
      }
    });
    const enriched = grouped.map(r => {
      const mod = training?.modules?.find(m => m.name === r.module);
      // _minutes = duração deste chunk (não do módulo inteiro). Recalcular vai re-temporizar
      // os chunks individualmente; pra módulo que cruza almoço, isso ainda funciona pois os
      // chunks somam o tempo total e applyDaySchedule encadeia respeitando lunch break.
      const rawDur = timeToMins(r.endTime) - timeToMins(r.startTime);
      return { ...r, _minutes: rawDur, mod: mod || { name: r.module, type: r.role?.includes("Practical") ? "PRÁTICA" : "TEORIA", minutes: rawDur } };
    });
    // Turmas EAD criadas antes do slot de moderador existir não têm o slot no banco.
    // Injetar automaticamente ao abrir para edição se o moderador ativo estiver configurado.
    const isEadCls = enriched.some(it => it.planningType === "ead");
    const hasModSlot = enriched.some(it => (it.slots||[]).some(s => s.role === EAD_MODERATOR_ROLE));
    const finalEnriched = (isEadCls && !hasModSlot && eadConfig?.activeModeratorId)
      ? enriched.map(it => ({ ...it, slots: [...(it.slots || []), { instructorId: String(eadConfig.activeModeratorId), local: "", role: EAD_MODERATOR_ROLE }] }))
      : enriched;
    const id = Date.now();
    setScheduleTabs(prev => [...prev, { id, title: cls, step: 3, wizForm: BLANK_WIZ, planItems: [], editCls: cls, editClassId: classId, editStudentCount: rows[0]?.studentCount || "", editObservation: rows[0]?.observation || "", editItems: finalEnriched }]);
    setActiveTabId(id);
  };

  const recalcEdit = (opts = {}) => {
    const base = deChunkEdit(editItems);
    if (!base.length) return;
    const sorted = [...base].sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)
    );
    const _editTrn = trainings.find(t => String(t.id) === String(base[0]?.trainingId));
    let resequenced = _editTrn?.defaultSchedule === false ? sorted : _applyEdit(sorted, _editTrn);
    if (opts.varyInstructors) {
      const previousIds = new Set((opts.previousInstructorIds || []).map(String).filter(Boolean));
      resequenced = reassignInstructorsForEdit(resequenced, _editTrn, previousIds);
    }
    setEditItems(resequenced);
  };

  // Reatribui instrutor (lead, assistentes, tradutor) para cada item da edição.
  // Mesmo algoritmo do _doInitPlan: filtro de skill/ausência/conflito, score
  // por instrutor, continuidade via committedInstrs ao longo da turma.
  // previousIds não-vazio = modo variação (priorizar quem não estava antes).
  const reassignInstructorsForEdit = (items, training, previousIds) => {
    if (!training) return items;
    const allMods = training.modules || [];
    const instrScore = {};
    allMods.forEach(mod => {
      instructors.filter(i => (i.skills||[]).some(s => skillMatchesModule(s, mod))).forEach(i => {
        instrScore[i.id] = (instrScore[i.id]||0) + 1;
      });
    });
    const committedInstrs = [];
    const committedTrad = [];
    const links = getLinkedClassNames(editCls);
    const next = items.map(item => {
      const mod = item.mod || allMods.find(m => m.name === item.module);
      if (!mod || !item.date || !item.startTime || !item.endTime) return item;
      const isPoolTeam = isHuetModule(mod);
      // Camada A3 — Em módulo HUET, respeita os papéis remanescentes do slots[]
      // (usuário pode ter removido funções específicas via chip X). Se não há
      // slots, usa mod.instructorCount (turma novinha).
      const _oldSlotsBase = item.slots || [{ instructorId: String(item.instructorId||""), local: item.local||"" }];
      const _oldNonTradBase = _oldSlotsBase.filter(s => !s.isTranslator && s.role !== EAD_MODERATOR_ROLE);
      const count = (isPoolTeam && _oldNonTradBase.length > 0)
        ? _oldNonTradBase.length
        : (mod.instructorCount || 1);
      const estStart = timeToMins(item.startTime);
      const estEnd   = timeToMins(item.endTime);
      const qualified = orderQualified(
        instructors.filter(i =>
          i.status !== "Inativo" &&
          (i.skills||[]).some(s => skillMatchesModule(s, mod)) &&
          !isInstructorAbsent(i.id, item.date, estStart, estEnd, absences||[]) &&
          !isHoliday(item.date, i, holidays||[]) &&
          !checkSlotConflict(item.date, item.startTime, item.endTime, String(i.id), null, editClassId, links).instrConflict
        ),
        instrScore, previousIds
      );
      const leadPool = qualified.filter(q =>
        (q.skills||[]).some(s => skillMatchesModule(s, mod) && s.canLead)
      );
      const availableAll = isPoolTeam ? instructors.filter(i =>
        i.status !== "Inativo" &&
        !isInstructorAbsent(i.id, item.date, estStart, estEnd, absences||[]) &&
        !isHoliday(item.date, i, holidays||[]) &&
        !checkSlotConflict(item.date, item.startTime, item.endTime, String(i.id), null, editClassId, links).instrConflict
      ) : [];
      // Resolve o papel HUET de cada slot: usa slot.role salvo (preserva exclusões
      // feitas via chip X), com fallback pra posição (POOL_TEAM_ROLES[k]) quando
      // for slot novo sem role definido.
      const _resolveHuetRole = (k) => {
        const savedRole = _oldNonTradBase[k]?.role;
        if (savedRole) {
          const found = POOL_TEAM_ROLES.find(r => r.code === savedRole);
          if (found) return found;
        }
        return getPoolTeamRole(k);
      };
      const oldNonTradForFreeze = _oldNonTradBase;
      const assignedIds = new Array(count).fill(null);
      const slotRoles = new Array(count).fill(null);
      for (let k = 0; k < count; k++) {
        if (isPoolTeam) {
          // FREEZE (Camada B2): slot com instructorId já salvo é preservado —
          // desde que o instrutor ainda exista E esteja ativo (não congelar demitido)
          const existingId = oldNonTradForFreeze[k]?.instructorId;
          const stillExists = existingId && instructors.some(i => String(i.id) === String(existingId) && i.status !== "Inativo");
          const poolRole = _resolveHuetRole(k);
          if (stillExists) {
            assignedIds[k] = +existingId;
            if (poolRole) slotRoles[k] = poolRole.code;
            if (!committedInstrs.includes(+existingId)) committedInstrs.push(+existingId);
            continue;
          }
        }
        let pool;
        if (isPoolTeam) {
          const poolRole = _resolveHuetRole(k);
          if (poolRole) {
            slotRoles[k] = poolRole.code;
            pool = availableAll.filter(i =>
              hasValidCompetency(i, poolRole.requiresCompetency) &&
              (!poolRole.requiresDisciplineSkill || (i.skills||[]).some(s => skillMatchesModule(s, mod))) &&
              (poolRole.code !== "Lead Instructor" || (i.skills||[]).some(s => skillMatchesModule(s, mod) && s.canLead))
            );
            pool = orderQualified(pool, instrScore, previousIds);
          } else {
            pool = qualified;
          }
        } else {
          pool = k === 0 ? (leadPool.length > 0 ? leadPool : qualified) : qualified;
        }
        const pick =
          pool.find(q => committedInstrs.includes(q.id) && !assignedIds.includes(q.id)) ||
          pool.find(q => !assignedIds.includes(q.id));
        if (pick) {
          assignedIds[k] = pick.id;
          if (!committedInstrs.includes(pick.id)) committedInstrs.push(pick.id);
        }
      }
      const oldSlots = item.slots || [{ instructorId: String(item.instructorId||""), local: item.local||"" }];
      const oldModSlot = oldSlots.find(s => s.role === EAD_MODERATOR_ROLE);
      const oldSlotsNoMod = oldSlots.filter(s => s.role !== EAD_MODERATOR_ROLE);
      const sharedLocal = (oldSlotsNoMod[0] || oldSlots[0])?.local || "";
      // Slots antigas separadas por papel — preservamos o id de cada uma na slot
      // correspondente da nova alocação. Sem isso, recalcular gera ids novos pra
      // todas as rows e o diff vê DELETE+INSERT em vez de UPDATE, notificando
      // instrutores cuja row efetivamente não mudou.
      const oldNonTrad = oldSlotsNoMod.filter(s => !s.isTranslator);
      const oldTrad    = oldSlotsNoMod.find(s => s.isTranslator);
      const nonTradSlots = [];
      for (let k = 0; k < count; k++) {
        const carryId = oldNonTrad[k]?.id;
        const slot = {
          ...(carryId != null ? { id: carryId } : {}),
          instructorId: assignedIds[k] != null ? String(assignedIds[k]) : "",
          local: sharedLocal,
        };
        if (slotRoles[k]) slot.role = slotRoles[k];
        nonTradSlots.push(slot);
      }
      const hasTrad = oldSlotsNoMod.some(s => s.isTranslator);
      let newSlots = nonTradSlots;
      if (hasTrad) {
        const tradBase = instructors.filter(i =>
          i.status !== "Inativo" &&
          (i.skills||[]).some(s => (s.name||s) === TRANSLATOR_SKILL) &&
          !isInstructorAbsent(i.id, item.date, estStart, estEnd, absences||[]) &&
          !isHoliday(item.date, i, holidays||[]) &&
          !checkSlotConflict(item.date, item.startTime, item.endTime, String(i.id), null, editClassId, links).instrConflict
        );
        const tradPool = previousIds.size > 0 ? shuffleArr(tradBase) : tradBase;
        const tradPick =
          tradPool.find(i => committedTrad.includes(i.id)) ||
          (previousIds.size > 0 ? tradPool.find(i => !previousIds.has(String(i.id))) : null) ||
          tradPool[0] ||
          null;
        if (tradPick && !committedTrad.includes(tradPick.id)) committedTrad.push(tradPick.id);
        newSlots = [...nonTradSlots, {
          ...(oldTrad?.id != null ? { id: oldTrad.id } : {}),
          instructorId: tradPick ? String(tradPick.id) : "",
          local: sharedLocal,
          isTranslator: true,
        }];
      }
      if (oldModSlot) newSlots = [...newSlots, oldModSlot];
      return { ...item, slots: newSlots };
    });
    // REVISÃO/RESERVA herdam instrutor da PROVA — mesma regra do _doInitPlan
    const provaItem = next.find(it => isProva(it.mod?.name || it.module || ""));
    if (provaItem && provaItem.slots?.[0]?.instructorId) {
      const provaInstrId = provaItem.slots[0].instructorId;
      next.forEach(it => {
        const name = it.mod?.name || it.module || "";
        if (isRevisao(name) || isReserva(name)) {
          it.slots = it.slots.map(s => ({ ...s, instructorId: provaInstrId }));
        }
      });
    }
    return next;
  };

  const reorderEdit = (fromId, toId) => {
    const base = deChunkEdit(editItems);
    const arr = [...base];
    const fi = arr.findIndex(i => i.id === fromId);
    const ti = arr.findIndex(i => i.id === toId);
    if (fi < 0 || ti < 0 || fi === ti) return;
    // Âncora = início original da turma (item mais cedo ANTES do reorder), não o
    // item que ficou em 1º após o splice — arrastar um módulo de outro dia pro
    // topo fazia applyDaySchedule ancorar na data ANTIGA dele e re-encadear a
    // turma inteira um dia pra frente (bug 2026-07-17: THUET de terça no topo
    // jogava a segunda inteira pra terça).
    const anchor = base.reduce((a, b) =>
      (b.date < a.date || (b.date === a.date && (b.startTime || "") < (a.startTime || ""))) ? b : a);
    const [item] = arr.splice(fi, 1);
    arr.splice(ti, 0, item);
    arr[0] = { ...arr[0], date: anchor.date, startTime: anchor.startTime };
    // Sempre re-sequencia após drag — o gesto de arrastar é uma ação explícita
    // do usuário para reordenar, e os horários devem seguir a nova posição.
    // Funciona mesmo em defaultSchedule:false porque applyDaySchedule ancora no
    // startTime do primeiro item (preserva start customizado).
    const _reorderTrn = trainings.find(t => String(t.id) === String(arr[0]?.trainingId));
    setEditItems(_applyEdit(arr, _reorderTrn));
  };

  // Move um item da edição para outra data. Mesma semântica do movePlanToDay
  // do wizard: desloca o módulo inteiro (mestre + chunks) por um delta de
  // dias, preservando startTime/endTime. Outras disciplinas ficam intactas.
  // Para reorganização total use "↺ Recalcular".
  const moveToDay = (itemId, targetDay) => {
    if (!targetDay) return;
    const clicked = editItems.find(i => i.id === itemId);
    if (!clicked || clicked.date === targetDay) return;
    const masterId = clicked._chunkOf || clicked.id;
    const oldRef = new Date(clicked.date + "T12:00:00");
    const newRef = new Date(targetDay + "T12:00:00");
    const deltaDays = Math.round((newRef - oldRef) / 86400000);
    if (!deltaDays) return;
    setEditItems(editItems.map(i => {
      if ((i._chunkOf || i.id) !== masterId) return i;
      return { ...i, date: addDays(i.date, deltaDays) };
    }));
  };

  // ── LINKED CLASSES ────────────────────────────────────────────────────────
  // Turmas fundidas: duas turmas distintas que compartilham slots (mesmo instrutor,
  // local, dia/horário) sem disparar conflito. Migração 7 (2026-07-07): a fonte
  // autoritativa do vínculo é `linkedClassIds: string[]` — ids sobrevivem a rename,
  // e className NÃO é único (homônimas de meses diferentes tornavam o vínculo por
  // nome ambíguo: "EC 33 40H - 01" existia com 5+ classIds no banco). O campo
  // `linkedClassNames` continua gravado como ESPELHO de exibição e para os
  // consumidores por nome (MCP planner.ts, scripts de lote) + fallback de rows
  // legadas ainda sem ids.
  const _linkRowOf = (className) =>
    schedules.find(s => s.className === className && (Array.isArray(s.linkedClassIds) || Array.isArray(s.linkedClassNames)));

  // Fallback legado nome→id: entre homônimas, escolhe a de menor distância temporal
  // do span próprio (mesma regra do backfill SQL da Migração 7). ownSpan opcional
  // ([d0,d1]) cobre turma nova, que ainda não tem rows em `schedules`.
  const _resolveNameToId = (name, ownClassId, ownSpan) => {
    const cands = [...new Set(schedules.filter(s => s.className === name && s.classId && s.classId !== ownClassId).map(s => s.classId))];
    if (cands.length <= 1) return cands[0] || null;
    const spanOf = (cid) => {
      const ds = schedules.filter(s => s.classId === cid && s.date).map(s => s.date).sort();
      return ds.length ? [ds[0], ds[ds.length - 1]] : null;
    };
    const own = ownSpan || (ownClassId ? spanOf(ownClassId) : null);
    if (!own) return cands[0];
    const dist = (sp) => {
      if (!sp) return Infinity;
      if (sp[0] <= own[1] && own[0] <= sp[1]) return 0; // spans se sobrepõem
      const gapMs = sp[0] > own[1] ? (new Date(sp[0]) - new Date(own[1])) : (new Date(own[0]) - new Date(sp[1]));
      return gapMs / 86400000;
    };
    return cands.slice().sort((a, b) => dist(spanOf(a)) - dist(spanOf(b)))[0];
  };

  const getLinkedClassIds = (className) => {
    if (!className) return [];
    const row = _linkRowOf(className);
    if (!row) return [];
    if (Array.isArray(row.linkedClassIds)) return row.linkedClassIds.filter(Boolean);
    return (row.linkedClassNames || []).map(n => _resolveNameToId(n, row.classId)).filter(Boolean);
  };

  // Nomes SEMPRE atuais, derivados dos ids (parceira renomeada nunca mais
  // dessincroniza) — motores de conflito e UI consomem daqui. Fallback: espelho
  // de nomes das rows legadas. Parceira excluída some da lista (id não resolve).
  const getLinkedClassNames = (className) => {
    if (!className) return [];
    const row = _linkRowOf(className);
    if (!row) return [];
    if (Array.isArray(row.linkedClassIds)) {
      const names = [];
      row.linkedClassIds.forEach(id => {
        const other = schedules.find(s => s.classId === id && s.className);
        if (other && !names.includes(other.className)) names.push(other.className);
      });
      return names;
    }
    return row.linkedClassNames || [];
  };

  // Vincula/desvincula duas turmas já salvas (fora do wizard de criação), por ID,
  // bidirecionalmente, direto no schedules — não depende de "Salvar alterações".
  // ownClassId desambigua homônimas da turma em edição; otherName vem da lista da
  // mesma semana (resolvido para a homônima mais próxima no tempo).
  const toggleLinkClass = (className, otherName, ownClassId) => {
    if (!className || !otherName) return;
    const meId = ownClassId || _resolveNameToId(className, null) || schedules.find(s => s.className === className)?.classId;
    const otherId = _resolveNameToId(otherName, meId);
    if (!meId || !otherId) return;
    const cur = getLinkedClassIds(className);
    const isLinked = cur.includes(otherId);
    const nextCur = isLinked ? cur.filter(i => i !== otherId) : [...cur, otherId];
    const oth = (() => {
      const r = schedules.find(s => s.classId === otherId && (Array.isArray(s.linkedClassIds) || Array.isArray(s.linkedClassNames)));
      if (!r) return [];
      if (Array.isArray(r.linkedClassIds)) return r.linkedClassIds.filter(Boolean);
      return (r.linkedClassNames || []).map(n => _resolveNameToId(n, otherId)).filter(Boolean);
    })();
    const nextOth = isLinked ? oth.filter(i => i !== meId) : (oth.includes(meId) ? oth : [...oth, meId]);
    const nameOf = (cid) => cid === meId ? className : cid === otherId ? otherName : (schedules.find(s => s.classId === cid)?.className);
    const namesFor = (ids) => ids.map(nameOf).filter(Boolean);
    const nCur = namesFor(nextCur), nOth = namesFor(nextOth);
    setSchedules(prev => prev.map(s => {
      if (s.classId === meId) return { ...s, linkedClassIds: nextCur, linkedClassNames: nCur };
      if (s.classId === otherId) return { ...s, linkedClassIds: nextOth, linkedClassNames: nOth };
      return s;
    }));
  };

  // ── CONFLICT DETECTION ────────────────────────────────────────────────────
  // Detecta, para cada nova linha, se há outra linha já agendada no mesmo
  // horário (sobreposição) com mesmo instrutor OU mesmo local.
  // excludeClassName: ignora linhas da turma que está sendo editada.
  // linkedClassNames: nomes de turmas vinculadas — conflitos com elas são ignorados.
  // excludeKey: classId da turma sendo editada (ou null para nova turma).
  // linkedClassNames: vínculo é por nome (recurso semântico), permanece aqui.
  const detectConflicts = (newRows, excludeKey, linkedClassNames = []) => {
    const conflicts = [];
    const ignoreNames = new Set(linkedClassNames.filter(Boolean));
    const existing = schedules.filter(s => {
      if (excludeKey && s.classId === excludeKey) return false;
      if (ignoreNames.has(s.className)) return false;
      return true;
    });
    newRows.forEach(nr => {
      if (!nr.date || !nr.startTime || !nr.endTime) return;
      if (nr.role === EAD_MODERATOR_ROLE) return; // moderador EAD não tem conflito de horário
      const nS = timeToMins(nr.startTime), nE = timeToMins(nr.endTime);
      existing.forEach(ex => {
        if (ex.date !== nr.date) return;
        const eS = timeToMins(ex.startTime), eE = timeToMins(ex.endTime);
        // Sobreposição estrita (toca ≠ sobrepõe)
        const overlap = nS < eE && eS < nE;
        if (!overlap) return;
        if (nr.instructorId && ex.instructorId && +nr.instructorId === +ex.instructorId) {
          conflicts.push(`Instrutor ${ex.instructorName || nr.instructorName} — ${fmtDate(nr.date)} ${nr.startTime}-${nr.endTime} conflita com turma "${ex.className}" (${ex.module})`);
        }
        if (nr.local && ex.local && nr.local === ex.local) {
          conflicts.push(`Local "${nr.local}" — ${fmtDate(nr.date)} ${nr.startTime}-${nr.endTime} conflita com turma "${ex.className}" (${ex.module})`);
        }
      });
    });
    return conflicts;
  };

  // _schedForConflict: full base schedules across all planningTypes for accurate conflict detection
  const _schedForConflict = allSchedules || schedules;
  // excludeKey: classId da turma sendo editada (ou null). linkedClassNames: vínculo semântico por nome.
  const checkSlotConflict = (date, startTime, endTime, instructorId, local, excludeKey, linkedClassNames = []) => {
    if (!date || !startTime || !endTime) return { instrConflict: false, localConflict: false };
    const nS = timeToMins(startTime), nE = timeToMins(endTime);
    const ignoreNames = new Set(linkedClassNames.filter(Boolean));
    const existing = _schedForConflict.filter(s => {
      if (s.date !== date) return false;
      if (excludeKey && s.classId === excludeKey) return false;
      if (ignoreNames.has(s.className)) return false;
      return true;
    });
    let instrConflict = false, localConflict = false;
    for (const ex of existing) {
      const eS = timeToMins(ex.startTime), eE = timeToMins(ex.endTime);
      if (!(nS < eE && eS < nE)) continue;
      if (instructorId && ex.instructorId && +instructorId === +ex.instructorId) instrConflict = true;
      if (local && ex.local && local === ex.local) localConflict = true;
      if (instrConflict && localConflict) break;
    }
    return { instrConflict, localConflict };
  };

  const confirmConflicts = (conflicts, onConfirm) => {
    if (!conflicts.length) { onConfirm(); return; }
    setConflictGuard({ show: true, conflicts, onConfirm });
  };

  // Valida slots antes de salvar — bloqueia se slot de Tradutor estiver vazio (SPEC §4.3)
  const validateSlots = (items) => {
    for (const item of items) {
      const slots = item.slots || [];
      const translatorSlot = slots.find(s => s.isTranslator);
      if (translatorSlot && !translatorSlot.instructorId) {
        return `Módulo "${item.mod?.name || item.module}" tem slot de Tradutor vazio. Atribua um tradutor ou remova o slot antes de salvar.`;
      }
    }
    return null;
  };

  // Detecta módulos do treinamento que NÃO aparecem em items.
  // Defesa contra bug 2026-05-15 (CERR-01): turma salva com 3 de 6 módulos sem ação consciente.
  // Causa raiz ainda não localizada; este guard transforma o estado inconsistente em confirmação explícita.
  const getMissingModules = (items, training) => {
    if (!training || !Array.isArray(training.modules) || training.modules.length === 0) return [];
    const actual = new Set(items.map(it => String(it.mod?.id ?? it.moduleId ?? '')).filter(s => s && s !== 'undefined' && s !== 'null'));
    return training.modules.filter(m => !actual.has(String(m.id)));
  };

  // Bloqueia o save se faltar módulo do cadastro, exigindo confirmação explícita.
  // Retorna true para prosseguir, false para abortar.
  const confirmMissingModules = (items, training, className) => {
    const missing = getMissingModules(items, training);
    if (missing.length === 0) return true;
    const list = missing.map(m => `  • ${m.name}`).join('\n');
    console.warn('[save] módulos faltando em', className || '(sem nome)', '— treinamento', training?.gcc, ':', missing.map(m => m.name));
    return window.confirm(
      `⚠️ Atenção: o plano tem ${items.length} disciplina(s), mas o treinamento "${training?.gcc || ''}" ` +
      `tem ${training?.modules?.length || 0} módulo(s) cadastrado(s).\n\n` +
      `Módulo(s) faltando:\n${list}\n\nSalvar mesmo assim?`
    );
  };

  const saveEditItems = () => {
    // Defesa: nunca salvar uma aba de edição VAZIA. Sem isso, o save faria
    // [...prev.filter(classId≠X), ...[]] = APAGAR a turma inteira. Só ocorreria
    // com uma aba restaurada sem editItems — mas guardamos mesmo assim.
    if (!editItems || editItems.length === 0) {
      alert("Esta aba de edição está vazia (provavelmente recarregada). Feche-a e reabra a turma pela lista para carregar os dados atuais do servidor.");
      return;
    }
    const err = validateSlots(editItems);
    if (err) { alert(err); return; }
    // classId é a identidade da turma — recupera do tab ou faz fallback ao DB
    const classId = editClassId || schedules.find(s => s.className === editCls)?.classId;
    if (!classId) { alert("classId da turma não encontrado. Feche e reabra a turma."); return; }
    const _editTraining = trainings.find(t => String(t.id) === String(editItems[0]?.trainingId));
    if (!confirmMissingModules(editItems, _editTraining, editCls)) return;
    // Camada B6 — EditGuard: turma com data já passada exige senha pra mudar
    // local/horário/data. Compara editItems vs. schedules atuais (DB) e
    // reúne o resumo "*" de mudanças. Sem mudanças nesses campos → segue direto.
    const todayIso = new Date().toISOString().split("T")[0];
    const dbRowsByClass = schedules.filter(s => s.classId === classId);
    const _findOrig = (it) => {
      // Match por id da slot quando possível; fallback por uid/módulo+horário
      const slotIds = (it.slots || []).map(s => s.id).filter(v => v != null);
      if (slotIds.length) return dbRowsByClass.find(r => slotIds.includes(r.id));
      return dbRowsByClass.find(r => r.module === it.module && r.startTime === it.startTime && r.endTime === it.endTime && r.date === it.date)
          || dbRowsByClass.find(r => r.module === it.module);
    };
    const pastChanges = [];
    for (const it of editItems) {
      const orig = _findOrig(it);
      if (!orig) continue;
      const origDate = orig.date;
      if (!origDate || origDate >= todayIso) continue;
      const origLocal = orig.local || "";
      const newLocal  = (it.slots && it.slots[0]?.local) || it.local || "";
      const newDate   = it.date || "";
      const newStart  = it.startTime || "";
      const newEnd    = it.endTime || "";
      const tag = `${it.module || "—"} (${origDate})`;
      if (origLocal !== newLocal)        pastChanges.push(`${tag}: local "${origLocal || "—"}" → "${newLocal || "—"}"`);
      if (orig.date !== newDate)         pastChanges.push(`${tag}: data ${orig.date} → ${newDate}`);
      if (orig.startTime !== newStart)   pastChanges.push(`${tag}: início ${orig.startTime} → ${newStart}`);
      if (orig.endTime !== newEnd)       pastChanges.push(`${tag}: fim ${orig.endTime} → ${newEnd}`);
    }
    if (pastChanges.length > 0) {
      setEditGuard({
        show: true,
        action: () => _doSaveEditItems(classId, _editTraining),
        pass: "", err: "",
        header: `Esta turma tem ${pastChanges.length} alteração(ões) em local/horário/data de módulos que já ocorreram. Edições alteram registro histórico.`,
        summary: pastChanges,
      });
      return;
    }
    _doSaveEditItems(classId, _editTraining);
  };

  const _doSaveEditItems = (classId, _editTraining) => {
    // Salva cada item como sua própria row — INCLUSIVE chunks (_chunkOf) gerados por
    // recalcEdit/reorderEdit/applyDaySchedule. Antes filtrávamos chunks via deChunkEdit
    // achando que eram "artefatos", mas o mestre fica com startTime/endTime só do primeiro
    // pedaço; descartar os chunks perdia os minutos da tarde/próximo dia ao salvar.
    // Mesma semântica do savePlan no wizard. Cada slot preserva o id da row original do
    // banco (mestre) ou recebe novo via newScheduleId() (chunks têm slot.id stripado em
    // applyDaySchedule, slots novas adicionadas via UI também). Diff em _persistSchedules
    // produz UPDATE granular pras rows que mudaram e INSERT só pras realmente novas.
    const items = editItems;
    const rows = items.flatMap(({ _minutes, mod, slots, _chunkOf, _continuationChunks, id: itemId, ...item }) => {
      const itemSlots = slots || [{ instructorId: String(item.instructorId||""), local: item.local||"" }];
      const nonTrad = itemSlots.filter(s => !s.isTranslator);
      return itemSlots.map((slot, si) => {
        const instr = instructors.find(i => String(i.id) === String(slot.instructorId));
        const ntIdx = nonTrad.indexOf(slot);
        const modType = (item.role||"").includes("Practical") || (item.module||"").includes("PRÁTICA") ? "PRÁTICA" : "TEORIA";
        const slotRole = slot.isTranslator ? "Translator"
          : slot.role ? slot.role
          : ntIdx === 0 ? (modType === "PRÁTICA" ? "Practical Instructor" : "Theoretical Instructor")
          : "Assistant Instructor";
        return {
          ...item,
          id: slot.id != null ? slot.id : newScheduleId(),
          classId,
          instructorId: +slot.instructorId || null,
          instructorName: instr?.name || "",
          local: slot.local || "",
          role: slotRole,
          studentCount: editStudentCount || item.studentCount || "",
          observation: editObservation || item.observation || "",
        };
      });
    });
    const editLinkIds = getLinkedClassIds(editCls);
    const editLinks = getLinkedClassNames(editCls); // nomes ATUAIS (derivados dos ids)
    // Replicar o vínculo em todas as rows novas: ids (autoritativo) + espelho de nomes
    if (editLinkIds.length > 0) rows.forEach(r => { r.linkedClassIds = [...editLinkIds]; r.linkedClassNames = [...editLinks]; });
    const conflicts = detectConflicts(rows, classId, editLinks);
    confirmConflicts(conflicts, () => {
      // Diff granular em _persistSchedules cuida do INSERT/UPDATE/DELETE.
      // Antes havia um _deleteSchedulesByClassId aqui que apagava todas as rows
      // da turma antes de reinserir — fluxo correto pro caso antigo (ids sempre novos),
      // mas agora atrapalha: ids estáveis permitem diff cirúrgico e DELETE explícito
      // forçaria DELETE+INSERT de tudo, notificando todos os instrutores de novo.
      setSchedules(prev => {
        // Espelho de nomes das parceiras: se ESTA turma foi renomeada no save, o
        // linkedClassNames delas fica velho (os ids não mudam — só o display/MCP).
        // Recalcula o espelho de quem aponta pra cá via linkedClassIds.
        const _refreshPartnerMirrors = (arr) => {
          const myName = rows[0]?.className;
          if (!myName) return arr;
          return arr.map(s => {
            if (s.classId === classId) return s;
            if (!Array.isArray(s.linkedClassIds) || !s.linkedClassIds.includes(classId)) return s;
            const names = s.linkedClassIds
              .map(i => i === classId ? myName : (arr.find(p => p.classId === i && p.className)?.className))
              .filter(Boolean);
            const same = Array.isArray(s.linkedClassNames) && s.linkedClassNames.length === names.length && s.linkedClassNames.every((n, ix) => n === names[ix]);
            return same ? s : { ...s, linkedClassNames: names };
          });
        };
        // Propagate local and instructor changes to linked classes (turmas vinculadas)
        if (editLinks.length > 0) {
          const oldRowsA = prev.filter(s => s.classId === classId);
          // Build list of changes: key = date|startTime|oldInstructorId
          const changes = [];
          rows.forEach(newR => {
            const oldR = oldRowsA.find(o => o.id === newR.id);
            if (!oldR) return;
            if (oldR.local !== newR.local || String(oldR.instructorId) !== String(newR.instructorId)) {
              changes.push({
                date: newR.date,
                startTime: newR.startTime,
                oldInstrId: String(oldR.instructorId),
                newInstrId: newR.instructorId,
                newInstrName: newR.instructorName,
                newLocal: newR.local,
              });
            }
          });
          if (changes.length > 0) {
            const base = prev.map(s => {
              if (!editLinks.includes(s.className)) return s;
              const change = changes.find(c =>
                c.date === s.date &&
                c.startTime === s.startTime &&
                c.oldInstrId === String(s.instructorId)
              );
              if (!change) return s;
              return { ...s, local: change.newLocal, instructorId: change.newInstrId, instructorName: change.newInstrName };
            });
            return _refreshPartnerMirrors([...base.filter(s => s.classId !== classId), ...rows]);
          }
        }
        return _refreshPartnerMirrors([...prev.filter(s => s.classId !== classId), ...rows]);
      });
      closeActiveTab();
    });
  };

  const isRevisao   = name => /REVIS[ÃA]O/i.test(name);
  const isProva     = name => /PROVA/i.test(name) && !/TEMPO\s*RESERVA/i.test(name);
  const isReserva   = name => /TEMPO\s*RESERVA/i.test(name);

  const _doInitPlan = (opts = {}) => {
    if (!selTraining || !wizForm.date) return;
    // Variação de instrutor: quando o usuário aciona "↺ Recalcular", passamos
    // os instrutores escolhidos na rodada anterior. orderQualified usa essa
    // lista para priorizar quem NÃO estava no plano anterior.
    const previousIds = new Set((opts.previousInstructorIds || []).map(String).filter(Boolean));
    // Deduplica módulos pelo id antes de gerar o plano (evita duplicatas de cadastro)
    const seenIds = new Set();
    const uniqueModules = (selTraining.modules || []).filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
    // Se um modo foi escolhido, usa a ordem cadastrada nele; senão tenta auto-detectar
    // pelo número da turma (CBSP - 02 → Modo 2); senão, ordem default (sortModules)
    let selectedMode = null;
    if (wizForm.modeId) {
      selectedMode = (selTraining.modes || []).find(md => String(md.id) === String(wizForm.modeId));
    }
    const sorted = selectedMode
      ? (() => {
          const ordered = selectedMode.moduleOrder.map(id => uniqueModules.find(m => m.id === id)).filter(Boolean);
          // Módulos adicionados ao treinamento DEPOIS de o modo ter sido criado não
          // constam no moduleOrder (modo "obsoleto") — sem isto seriam silenciosamente
          // descartados, gerando turma com disciplina faltando e semana curta. Anexa os
          // ausentes na ordem padrão para NUNCA perder disciplina.
          const inMode = new Set(ordered.map(m => String(m.id)));
          const missing = sortModules(uniqueModules.filter(m => !inMode.has(String(m.id))));
          return [...ordered, ...missing];
        })()
      : sortModules(uniqueModules);
    const startMins = timeToMins(wizForm.startTime || "08:00");
    // Turmas vinculadas: slots delas serão ignorados nos conflitos de instrutor/local.
    // Vínculo é definido no Step 1 do wizard; uma vez gerado, é persistido em savePlan.
    const wizLinks = (wizForm.linkedClassNames || []).filter(Boolean);

    // Score: quantos módulos deste treinamento cada instrutor pode ministrar
    const instrScore = {};
    sorted.forEach(mod => {
      instructors.filter(i => (i.skills||[]).some(s => skillMatchesModule(s, mod))).forEach(i => {
        instrScore[i.id] = (instrScore[i.id]||0) + 1;
      });
    });

    // Passo 1: calcular horários (1 item por módulo)
    const moduleItems = sorted.map((mod, i) => ({ uid: `pi-${i}-${mod.id}`, mod, instructorId: "", local: "" }));
    const timed = _recalcWizard(moduleItems, wizForm.date, startMins, getDayEndMin(selTraining));

    // Passo 2: atribuir instrutores e locais
    // preferredLocals usa mod.id como chave — cada módulo mantém seu próprio local preferido
    // (antes usava mod.type, o que causava compartilhamento indevido entre PRÁTICA de cenários
    // diferentes como piscina vs. incêndio — ver SPEC §4.4)
    const preferredLocals = {}; // mod.id → local-name
    const committedInstrs = []; // instrutores já escolhidos para este treinamento (em ordem de prioridade)
    const committedTrad   = []; // tradutores já escolhidos — preferir o mesmo ao longo do treinamento

    const raw = timed.map((timedItem) => {
      const mod = timedItem.mod;
      const count = mod.instructorCount || 1;
      const localOpts = getLocalOpts(mod, selTraining);

      const estStart = timeToMins(timedItem.startTime);
      const estEnd   = timeToMins(timedItem.endTime);
      // Qualificados para esta disciplina (têm a skill + não estão ausentes + não em feriado + não ocupados em outra turma).
      // orderQualified aplica ordem por score, ou (no recálculo com variação)
      // prioriza quem não estava no plano anterior + tiebreak aleatório.
      const qualified = orderQualified(
        instructors.filter(i =>
          i.status !== "Inativo" &&
          i.type !== "moderador" &&
          (i.skills||[]).some(s => skillMatchesModule(s, mod)) &&
          !isInstructorAbsent(i.id, timedItem.date, estStart, estEnd, absences||[]) &&
          !isHoliday(timedItem.date, i, holidays||[]) &&
          !checkSlotConflict(timedItem.date, timedItem.startTime, timedItem.endTime, String(i.id), null, null, wizLinks).instrConflict
        ),
        instrScore, previousIds
      );

      // Pool de Leads: qualificados que têm canLead:true para esta disciplina específica
      // Se ninguém tiver canLead marcado, o Slot 0 aceita qualquer qualificado (fallback)
      const leadPool = qualified.filter(q =>
        (q.skills||[]).some(s => skillMatchesModule(s, mod) && s.canLead)
      );

      // Atribuição slot a slot. Em módulos pool team (LOTE PISCINA + PRÁTICA),
      // cada slot tem um papel fixo (Lead/Assistant/Scuba/Scuba/Crane); o pool de
      // candidatos é filtrado pela competência exigida do papel. Caso contrário,
      // mantém a lógica clássica (Slot 0 = Lead com canLead, demais = qualified).
      const isPoolTeam = isHuetModule(mod);
      const availableAll = isPoolTeam ? instructors.filter(i =>
        i.status !== "Inativo" &&
        i.type !== "moderador" &&
        !isInstructorAbsent(i.id, timedItem.date, estStart, estEnd, absences||[]) &&
        !isHoliday(timedItem.date, i, holidays||[]) &&
        !checkSlotConflict(timedItem.date, timedItem.startTime, timedItem.endTime, String(i.id), null, null, wizLinks).instrConflict
      ) : [];
      const assignedIds = new Array(count).fill(null);
      const slotRoles = new Array(count).fill(null);
      for (let k = 0; k < count; k++) {
        let pool;
        if (isPoolTeam) {
          const poolRole = getPoolTeamRole(k);
          if (poolRole) {
            slotRoles[k] = poolRole.code;
            pool = availableAll.filter(i =>
              hasValidCompetency(i, poolRole.requiresCompetency) &&
              (!poolRole.requiresDisciplineSkill || (i.skills||[]).some(s => skillMatchesModule(s, mod))) &&
              (poolRole.code !== "Lead Instructor" || (i.skills||[]).some(s => skillMatchesModule(s, mod) && s.canLead))
            );
            pool = orderQualified(pool, instrScore, previousIds);
          } else {
            pool = qualified;
          }
        } else {
          pool = k === 0 ? (leadPool.length > 0 ? leadPool : qualified) : qualified;
        }
        const pick =
          pool.find(q => committedInstrs.includes(q.id) && !assignedIds.includes(q.id)) ||
          pool.find(q => !assignedIds.includes(q.id));
        if (pick) {
          assignedIds[k] = pick.id;
          if (!committedInstrs.includes(pick.id)) committedInstrs.push(pick.id);
        }
      }

      // Slots: um por vaga de instrutor (instructorCount)
      // Local único para toda a equipe — mesmo cenário para todos os instrutores do mesmo módulo
      let sharedLocal;
      const prev = preferredLocals[mod.id];
      const isLocalLivre = (name) =>
        !checkSlotConflict(timedItem.date, timedItem.startTime, timedItem.endTime, null, name, null, wizLinks).localConflict;
      const prevLivre = prev && localOpts.some(l => l.name === prev) && isLocalLivre(prev);
      if (prevLivre) {
        sharedLocal = prev;
      } else {
        const freeLocal = localOpts.find(l => isLocalLivre(l.name));
        sharedLocal = freeLocal?.name || localOpts[0]?.name || "";
        preferredLocals[mod.id] = sharedLocal;
      }
      const slots = [];
      for (let k = 0; k < count; k++) {
        const slot = { instructorId: assignedIds[k] != null ? String(assignedIds[k]) : "", local: sharedLocal };
        if (slotRoles[k]) slot.role = slotRoles[k];
        slots.push(slot);
      }

      const hasTranslator = !!wizForm.withTranslator;
      if (hasTranslator) {
        const tradBase = instructors.filter(i =>
          i.status !== "Inativo" &&
          (i.skills||[]).some(s => (s.name||s) === TRANSLATOR_SKILL) &&
          !isInstructorAbsent(i.id, timedItem.date, estStart, estEnd, absences||[]) &&
          !isHoliday(timedItem.date, i, holidays||[]) &&
          !checkSlotConflict(timedItem.date, timedItem.startTime, timedItem.endTime, String(i.id), null, null, wizLinks).instrConflict
        );
        // No recálculo com variação, embaralha o pool e prefere quem não era tradutor antes.
        const tradPool = previousIds.size > 0 ? shuffleArr(tradBase) : tradBase;
        const tradPick =
          tradPool.find(i => committedTrad.includes(i.id)) ||
          (previousIds.size > 0 ? tradPool.find(i => !previousIds.has(String(i.id))) : null) ||
          tradPool[0] ||
          null;
        if (tradPick && !committedTrad.includes(tradPick.id)) committedTrad.push(tradPick.id);
        slots.push({ instructorId: tradPick ? String(tradPick.id) : "", local: sharedLocal, isTranslator: true });
      }
      // Slot de moderador EAD — injetado automaticamente em turmas EAD
      const isEad = (wizForm.planningType || defaultPlanningType) === "ead";
      if (isEad && eadConfig?.activeModeratorId) {
        slots.push({ instructorId: String(eadConfig.activeModeratorId), local: "", role: EAD_MODERATOR_ROLE });
      }
      // recalcTimes já garante uid único: master mantém uid do moduleItem; chunks de
      // continuação recebem `${master.uid}__cN` + _chunkOf. Não sobrescrever aqui —
      // sobrescrever quebra a referência _chunkOf → master.
      return { ...timedItem, slots, hasTranslator };
    });

    // Passo 3: REVISÃO/RESERVA → mesmo instrutor da PROVA
    const provaItem = raw.find(item => isProva(item.mod.name));
    if (provaItem && provaItem.slots[0]?.instructorId) {
      const provaInstrId = provaItem.slots[0].instructorId;
      raw.forEach(item => {
        if (isRevisao(item.mod.name) || isReserva(item.mod.name)) {
          item.slots = item.slots.map(s => ({ ...s, instructorId: provaInstrId }));
        }
      });
    }

    updTab({ planItems: raw, step: 2, title: wizForm.className || "Nova Turma" });
  };

  const initPlan = () => {
    if (!selTraining || !wizForm.date) return;
    const isEadWiz = (wizForm.planningType || defaultPlanningType) === "ead";
    if (isEadWiz && !eadConfig?.activeModeratorId) {
      alert("Nenhum moderador EAD ativo configurado. Cadastre e defina um moderador ativo na tela de Instrutores antes de criar turmas EAD.");
      return;
    }
    const todayIso = new Date().toISOString().split("T")[0];
    const maxFutureDate = new Date(); maxFutureDate.setDate(maxFutureDate.getDate() + 30);
    const maxFutureIso = maxFutureDate.toISOString().split("T")[0];
    if (wizForm.date < todayIso) {
      setDateGuard({ show: true, action: _doInitPlan, pass: "", err: "", msg: "A data de início está no passado. Isso é permitido apenas com confirmação de senha." });
      return;
    }
    if (wizForm.date > maxFutureIso) {
      setDateGuard({ show: true, action: _doInitPlan, pass: "", err: "", msg: "A data de início está a mais de 30 dias no futuro. Isso requer confirmação de senha." });
      return;
    }
    _doInitPlan();
  };

  // Remove chunks de continuação (marcados com _chunkOf) mantendo só o item-mestre.
  // Necessário antes de chamar recalcTimes novamente para evitar que cada chunk seja
  // re-expandido como se fosse um módulo completo, duplicando a duração total.
  const deChunk = (items) => items.filter(it => !it._chunkOf);

  const reorder = (from, to) => {
    if (from === to) return;
    const fromItem = planItems[from];
    const toItem   = planItems[to];
    if (!fromItem || !toItem) return;
    const fromMasterUid = fromItem._chunkOf || fromItem.uid;
    const toMasterUid   = toItem._chunkOf   || toItem.uid;
    if (fromMasterUid === toMasterUid) return;
    // Opera no nível do módulo (deChunk) para que recalcTimes reexpanda
    // corretamente os chunks de cada módulo após a reordenação.
    const base = deChunk(planItems);
    const fi = base.findIndex(i => i.uid === fromMasterUid);
    const ti = base.findIndex(i => i.uid === toMasterUid);
    if (fi < 0 || ti < 0) return;
    const arr = [...base];
    const [item] = arr.splice(fi, 1);
    arr.splice(ti, 0, item);
    const startM = timeToMins(wizForm.startTime || "08:00");
    setPlanItems(_recalcWizard(arr, wizForm.date, startM, getDayEndMin(selTraining)));
  };

  // Move um item do wizard para outra data.
  // Desloca o módulo inteiro (mestre + chunks) por um delta de dias,
  // preservando startTime/endTime. NÃO chama recalcTimes — as outras
  // disciplinas ficam intactas, igual o usuário pediu. Para reorganização
  // total + nova sugestão de instrutor, o usuário aciona "↺ Recalcular".
  const movePlanToDay = (uid, targetDate) => {
    if (!targetDate) return;
    const clicked = planItems.find(p => p.uid === uid);
    if (!clicked || clicked.date === targetDate) return;
    const masterUid = clicked._chunkOf || clicked.uid;
    // Delta calculado a partir da linha CLICADA (não do mestre) — assim ela
    // pousa exatamente na data escolhida, e chunks subsequentes do mesmo
    // módulo seguem com a mesma defasagem original.
    const oldRef = new Date(clicked.date + "T12:00:00");
    const newRef = new Date(targetDate + "T12:00:00");
    const deltaDays = Math.round((newRef - oldRef) / 86400000);
    if (!deltaDays) return;
    setPlanItems(planItems.map(p => {
      if ((p._chunkOf || p.uid) !== masterUid) return p;
      return { ...p, date: addDays(p.date, deltaDays) };
    }));
  };

  // Para operações que devem afetar o módulo inteiro (não só um chunk), resolve o
  // mestre a partir do uid clicado e retorna todos os uids do mesmo módulo (mestre + chunks).
  const sameMasterUids = (uid) => {
    const clicked = planItems.find(p => p.uid === uid);
    if (!clicked) return new Set([uid]);
    const masterUid = clicked._chunkOf || clicked.uid;
    return new Set(planItems.filter(p => (p._chunkOf || p.uid) === masterUid).map(p => p.uid));
  };

  const toggleTranslator = (uid) => {
    const targets = sameMasterUids(uid);
    const clicked = planItems.find(p => p.uid === uid);
    if (!clicked) return;
    const newHasT = !clicked.hasTranslator;
    setPlanItems(planItems.map(item => {
      if (!targets.has(item.uid)) return item;
      const baseSlots = (item.slots || []).filter(s => !s.isTranslator);
      const newSlots = newHasT
        ? [...baseSlots, { instructorId: "", local: baseSlots[0]?.local || "", isTranslator: true }]
        : baseSlots;
      return { ...item, hasTranslator: newHasT, slots: newSlots };
    }));
  };

  const addAssistant = (uid) => {
    setPlanItems(planItems.map(item => {
      if (item.uid !== uid) return item;
      const slots = item.slots || [];
      const sharedLocal = slots[0]?.local || "";
      const tradIdx = slots.findIndex(s => s.isTranslator);
      const nonTradCount = slots.filter(s => !s.isTranslator).length;
      const newSlot = { instructorId: "", local: sharedLocal };
      if (isHuetModule(item.mod)) {
        const pr = getPoolTeamRole(nonTradCount);
        if (pr) newSlot.role = pr.code;
      }
      const ns = [...slots];
      if (tradIdx >= 0) { ns.splice(tradIdx, 0, newSlot); }
      else { ns.push(newSlot); }
      return { ...item, slots: ns };
    }));
  };

  // Edição manual de data/hora — usado quando o treinamento não respeita o horário padrão
  const updatePlanItemField = (uid, patch) => {
    setPlanItems(prev => prev.map(p => p.uid === uid ? { ...p, ...patch } : p));
  };

  const removeAssistant = (uid) => {
    setPlanItems(planItems.map(item => {
      if (item.uid !== uid) return item;
      const slots = item.slots || [];
      const nonTradIdxs = slots.map((s, i) => (s.isTranslator || s.role === EAD_MODERATOR_ROLE) ? -1 : i).filter(i => i >= 0);
      if (nonTradIdxs.length <= 1) return item; // manter pelo menos o Lead
      const lastIdx = nonTradIdxs[nonTradIdxs.length - 1];
      return { ...item, slots: slots.filter((_, i) => i !== lastIdx) };
    }));
  };

  const deletePlanItem = (uid) => {
    if (!window.confirm("Excluir esta disciplina do planejamento?")) return;
    const clicked = planItems.find(p => p.uid === uid);
    if (!clicked) return;
    const masterUid = clicked._chunkOf || clicked.uid;
    const without = deChunk(planItems).filter(p => p.uid !== masterUid);
    setPlanItems(_recalcWizard(without.map(i => ({ ...i })), wizForm.date, startMins));
  };

  const savePlan = () => {
    const err = validateSlots(planItems);
    if (err) { alert(err); return; }
    if (!confirmMissingModules(planItems, selTraining, wizForm.className)) return;
    // Cada turma recebe um classId UUID único — identidade estável independente do nome.
    // Permite duas turmas com mesmo className em semanas diferentes coexistirem sem fusão.
    const classId = newClassId();
    // Cada chunk em planItems é uma row própria (uid único + _chunkOf marca continuação).
    // Com isso a tarde de um módulo de 8h gera sua própria row no DB em vez de ser
    // descartada pela dedup antiga por uid — ver bug "chunks da tarde sumiam ao salvar".
    const newRows = planItems.flatMap(item => {
      const slots = item.slots || [{ instructorId: item.instructorId||"", local: item.local||"" }];
      const nonTranslatorSlots = slots.filter(sl => !sl.isTranslator);
      return slots.map((slot, slotIdx) => {
        const instr = instructors.find(i => i.id === +slot.instructorId);
        const ntIdx = nonTranslatorSlots.indexOf(slot);
        const slotRole = slot.isTranslator
          ? "Translator"
          : slot.role
            ? slot.role
            : isHuetModule(item.mod)
              ? ((getPoolTeamRole(ntIdx) || {}).code || "Assistant Instructor")
              : ntIdx === 0
                ? (item.mod.type === "PRÁTICA" ? "Practical Instructor" : "Theoretical Instructor")
                : "Assistant Instructor";
        return {
          id: newScheduleId(),
          classId,
          trainingId: selTraining.id,
          trainingName: selTraining.gcc,
          className: wizForm.className,
          date: item.date,
          startTime: item.startTime,
          endTime: item.endTime,
          local: slot.local || "",
          instructorId: +slot.instructorId || null,
          instructorName: instr?.name || "",
          module: item.mod.name,
          moduleId: item.mod.id,
          role: slotRole,
          studentCount: wizForm.studentCount || "",
          observation: wizForm.observation || "",
          status: "Programado",
          // Base da turma = base ATIVA na visão (padroniza com ai.js). user.base era
          // bug: admin vendo Bangu criava turma null/errada. Admin em Geral grava
          // null = visível em todas (convenção legado, intencional).
          base: viewBase || null,
          planningType: wizForm.planningType || "base",
        };
      });
    });
    const linkedNames = (wizForm.linkedClassNames || []).filter(Boolean);
    // Seleção da UI é por nome (lista da mesma semana); a verdade gravada é por ID.
    // Homônimas: resolve para a mais próxima das datas da turma NOVA (newRows).
    const _newDates = newRows.map(r => r.date).filter(Boolean).sort();
    const _newSpan = _newDates.length ? [_newDates[0], _newDates[_newDates.length - 1]] : null;
    // `classId` = o UUID da turma nova (gerado no topo do savePlan). CUIDADO: não
    // criar aqui uma const chamada `newClassId` — colide (TDZ) com a função global.
    const linkedIds = [...new Set(linkedNames.map(n => _resolveNameToId(n, classId, _newSpan)).filter(Boolean))];
    if (linkedIds.length > 0) {
      newRows.forEach(r => { r.linkedClassIds = [...linkedIds]; r.linkedClassNames = [...linkedNames]; });
    }
    const conflicts = detectConflicts(newRows, null, linkedNames);
    confirmConflicts(conflicts, () => {
      setSchedules(prev => {
        if (linkedIds.length === 0) return [...prev, ...newRows];
        // Bidirecional por ID: cada parceira ganha o id da nova turma (e o espelho
        // de nomes re-derivado — sempre atual, imune a rename).
        const updated = prev.map(s => {
          if (!linkedIds.includes(s.classId)) return s;
          const curIds = Array.isArray(s.linkedClassIds)
            ? s.linkedClassIds.filter(Boolean)
            : (s.linkedClassNames || []).map(n => _resolveNameToId(n, s.classId)).filter(Boolean);
          const nextIds = curIds.includes(classId) ? curIds : [...curIds, classId];
          const nextNames = [];
          nextIds.forEach(i => {
            const nm = i === classId ? wizForm.className : (prev.find(p => p.classId === i)?.className);
            if (nm && !nextNames.includes(nm)) nextNames.push(nm);
          });
          return { ...s, linkedClassIds: nextIds, linkedClassNames: nextNames };
        });
        return [...updated, ...newRows];
      });
      closeActiveTab();
    });
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const isArchivedClass = (classId) => {
    const dates = schedules.filter(s => s.classId === classId).map(s => s.date);
    return dates.length > 0 && dates.every(d => d < todayStr);
  };
  const deleteClass = (classId) => {
    if (!classId) return;
    const archived = isArchivedClass(classId);
    const clsName = schedules.find(s => s.classId === classId)?.className || classId;
    askDelete((reason) => {
      // Fecha abas abertas desta turma ANTES de deletar — evita que saveEditItems
      // aberto numa aba ressuscite as rows depois do DELETE.
      setScheduleTabs(prev => {
        const hadActive = prev.some(t => t.id === activeTabId && t.editClassId === classId);
        if (hadActive) setActiveTabId(null);
        return prev.filter(t => t.editClassId !== classId);
      });
      // DELETE explícito por classId no banco — não afeta turmas distintas com mesmo nome.
      const meta = reason ? { reason, className: clsName, deletedBy: user?.username || user?.name || 'unknown' } : undefined;
      _deleteSchedulesByClassId(classId, meta);
      setSchedules(prev => prev.filter(s => s.classId !== classId));
    }, archived, DELETION_REASONS);
  };

  // ── Group existing schedules by classId ───────────────────────────────────
  // Uma turma é identificada pelo classId (UUID), não pelo className. Duas turmas
  // com mesmo nome em semanas diferentes são entidades distintas.
  const allClasses = (() => {
    const byId = new Map();
    for (const s of schedules) {
      if (!s.classId) continue;
      if (!byId.has(s.classId)) byId.set(s.classId, { classId: s.classId, className: s.className, trainingId: s.trainingId, trainingName: s.trainingName });
    }
    return [...byId.values()];
  })();
  const filteredClasses = allClasses.filter(c =>
    [c.className, c.trainingName||""].some(v => v.toLowerCase().includes(search.toLowerCase()))
  );

  // ── Group plan items by date ──────────────────────────────────────────────
  const planByDay = planItems.reduce((acc, item) => {
    const k = item.date || "—";
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});

  // ── Tab bar element (shared across all steps) ───────────────────────────
  const tabBarEl = scheduleTabs.length > 0 ? (
    <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:16, padding:"6px 10px", background:"#073d4a", borderRadius:10, border:"1px solid #154753", flexWrap:"wrap" }}>
      <button onClick={() => setActiveTabId(null)}
        style={{ padding:"5px 12px", borderRadius:7, border:`1px solid ${!activeTabId ? "#ffa619":"#154753"}`, background:!activeTabId ? "#ffa61920":"transparent", color:!activeTabId ? "#ffa619":"#64748b", fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
        ≡ Lista
      </button>
      {scheduleTabs.map(tab => (
        <div key={tab.id} style={{ display:"flex", alignItems:"center", borderRadius:7, border:`1px solid ${activeTabId===tab.id ? "#ffa619":"#154753"}`, background:activeTabId===tab.id ? "#ffa61920":"#01323d", overflow:"hidden" }}>
          <button onClick={() => setActiveTabId(tab.id)}
            style={{ padding:"5px 10px", background:"none", border:"none", color:activeTabId===tab.id ? "#ffa619":"#94a3b8", fontSize:12, fontWeight:600, cursor:"pointer", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {tab.step===1 ? "📝" : tab.step===2 ? "📋" : "✏"} {tab.title}
          </button>
          <button onClick={e => { e.stopPropagation(); setScheduleTabs(prev=>prev.filter(t=>t.id!==tab.id)); if(activeTabId===tab.id) setActiveTabId(null); }}
            style={{ padding:"4px 8px", background:"none", border:"none", borderLeft:"1px solid #154753", color:"#475569", cursor:"pointer", fontSize:15, lineHeight:1, flexShrink:0 }}>×</button>
        </div>
      ))}
      {scheduleTabs.length < 5 && (
        <button onClick={openNewTab}
          style={{ padding:"5px 10px", borderRadius:7, border:"1px dashed #154753", background:"transparent", color:"#64748b", fontSize:16, cursor:"pointer", lineHeight:1 }}>+</button>
      )}
      {(step === 2 || step === 3) && (
        <button onClick={toggleSplit} title={splitMode ? "Sair do split view" : "Split view: ver outra turma lado a lado"}
          style={{ marginLeft:"auto", padding:"5px 10px", borderRadius:7, border:`1px solid ${splitMode ? "#ffa619" : "#154753"}`, background: splitMode ? "#ffa61920" : "transparent", color: splitMode ? "#ffa619" : "#64748b", fontSize:13, cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}>⊞ Split</button>
      )}
    </div>
  ) : null;

  // ── STEP 0: List / Week view ─────────────────────────────────────────────
  if (step === 0) return (
    <div>
      {tabBarEl}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ color:"#fff", fontWeight:800, margin:0, fontSize:24 }}>
            {planningTypeFilter === "incompany" ? "Programação — In Company" : planningTypeFilter === "ead" ? "Programação — EAD" : "Programação"}
          </h2>
          <p style={{ color:"#64748b", margin:"4px 0 0", fontSize:14 }}>
            {planningTypeFilter === "incompany" ? "Turmas presenciais nas dependências do cliente" : planningTypeFilter === "ead" ? "Treinamentos remotos e online" : "Planejamento de turmas por treinamento"}
          </p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {hasPermission(user, "plan_edit") && <Btn onClick={openNewTab} label="Nova Turma" icon="plus" />}
        </div>
      </div>

      {canPlan(user) && (
        <WeeklyCalendarView
          schedules={schedules}
          setSchedules={setSchedules}
          areas={areas}
          trainings={trainings}
          holidays={holidays}
          weekOffset={weekOffset}
          setWeekOffset={setWeekOffset}
          onClickClass={classId => loadClassForEdit(classId)}
          canEdit={hasPermission(user, "plan_edit")}
        />
      )}
      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
      <DateGuardModal guard={dateGuard} setGuard={setDateGuard} user={user} />
      <EditGuardModal guard={editGuard} setGuard={setEditGuard} user={user} />
      <ConflictModal guard={conflictGuard} setGuard={setConflictGuard} />
    </div>
  );

  // ── Split sidebar (shared between step 2 and 3) ─────────────────────────────
  const splitSidebar = splitMode ? (() => {
    // Turmas da semana visualizada, ordenadas por área e nome
    const fmtSideDs = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const now = new Date();
    const dow = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow) + weekOffset * 7);
    mon.setHours(12, 0, 0, 0);
    const weekDates = new Set(Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); return fmtSideDs(d);
    }));
    const sideRank = (name) => {
      if (!name) return 99;
      const n = name.toUpperCase();
      if (/MARINHA/.test(n)) return 0;
      if (/CBINC|INCÊNDIO|INCENDIO/.test(n)) return 1;
      if (/INDUSTRIAL/.test(n)) return 2;
      if (/OPITO/.test(n)) return 3;
      if (/COORDENA/.test(n)) return 4;
      return 5;
    };
    const seen = new Map();
    for (const s of schedules) {
      if (!s.classId || !weekDates.has(s.date)) continue;
      if (!seen.has(s.classId)) seen.set(s.classId, { classId: s.classId, className: s.className, trainingId: s.trainingId });
    }
    const allCls = [...seen.values()].sort((a, b) => {
      const ta = trainings.find(tr => String(tr.id) === String(a.trainingId));
      const tb = trainings.find(tr => String(tr.id) === String(b.trainingId));
      const aa = areas.find(x => x.id === ta?.area);
      const ab = areas.find(x => x.id === tb?.area);
      const ra = sideRank(aa?.name), rb = sideRank(ab?.name);
      if (ra !== rb) return ra - rb;
      return (a.className||"").localeCompare(b.className||"");
    });
    return (
      <div style={{ width:200, flexShrink:0, background:"#073d4a", border:"1px solid #154753", borderRadius:12, padding:"10px 0", overflowY:"auto", maxHeight:"calc(100vh - 180px)", alignSelf:"flex-start", position:"sticky", top:0 }}>
        <div style={{ padding:"8px 14px 6px", borderBottom:"1px solid #154753", marginBottom:6 }}>
          <span style={{ color:"#94a3b8", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5 }}>Semana Atual</span>
        </div>
        {allCls.length === 0 && <p style={{ color:"#475569", fontSize:12, padding:"8px 14px" }}>Nenhuma turma</p>}
        {allCls.map(({ classId, className: cn, trainingId }) => {
          const t    = trainings.find(tr => String(tr.id) === String(trainingId));
          const area = areas.find(a => a.id === t?.area);
          const isActive = classId === editClassId;
          return (
            <div key={classId} onClick={() => loadClassForEdit(classId)}
              style={{ display:"flex", alignItems:"stretch", cursor:"pointer", background: isActive ? "#ffa61915" : "transparent", borderLeft: isActive ? "2px solid #ffa619" : "2px solid transparent", transition:"background 0.12s" }}>
              {area && <div style={{ width:3, background:area.color, flexShrink:0 }} />}
              <div style={{ padding:"7px 10px 7px 8px", flex:1, minWidth:0 }}>
                <div style={{ color: isActive ? "#ffa619" : "#e2e8f0", fontSize:12, fontWeight: isActive ? 700 : 500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cn}</div>
                {t && <div style={{ color:"#64748b", fontSize:10, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.gcc}</div>}
              </div>
            </div>
          );
        })}
      </div>
    );
  })() : null;

  // ── STEP 3: Edit saved class ─────────────────────────────────────────────
  if (step === 3) {
    const editByDay = editItems.reduce((acc, item) => {
      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      return acc;
    }, {});
    const editTraining = trainings.find(t => String(t.id) === String(editItems[0]?.trainingId));
    const editArea     = areas.find(a => a.id === editTraining?.area);
    const isCbincEdit  = editArea && /CBINC|INCÊNDIO|INCENDIO/i.test(editArea.name);
    const editUseDefault = editTraining?.defaultSchedule !== false;
    const updateEditItemField = (id, patch) => setEditItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    const deleteEditItem = (id) => {
      if (!window.confirm("Excluir esta disciplina do planejamento?")) return;
      setEditItems(prev => prev.filter(i => i.id !== id));
    };

    return (
      <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
        {splitSidebar}
        <div style={{ flex:1, minWidth:0 }}>
        {tabBarEl}
        <button onClick={() => { closeActiveTab(); setDragEditId(null); setDragOverDay(null); }}
          style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:14, marginBottom:20, padding:0 }}>
          <Icon name="back" size={18} color="#94a3b8" /> Fechar aba
        </button>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
              <input value={editCls} onChange={e => {
                const novo = e.target.value;
                setEditCls(novo);
                setEditItems(prev => prev.map(i => ({ ...i, className: novo })));
              }}
                style={{ background:"none", border:"none", borderBottom:"2px solid #ffa619", color:"#fff", fontWeight:800, fontSize:22, outline:"none", padding:"2px 4px", minWidth:120 }} />
              <span style={{ color:"#ffa619", fontWeight:400, fontSize:14 }}>— editando</span>
              {/* Badge "Rascunho" quando a turma sob edição veio da IA e ainda não foi aprovada.
                  Avisa o planejador que os ajustes aqui não disparam push até aprovar o pacote. */}
              {editItems.length > 0 && editItems.every(i => i.status === "Rascunho") && (
                <span title="Esta turma está em quarentena (criada pela IA). Aprove o pacote na tela IA — Sugestão de Escala para liberar pros instrutores."
                  style={{ background:"#64748b25", border:"1px solid #64748b80", borderRadius:20, padding:"3px 12px", color:"#cbd5e1", fontSize:12, fontWeight:700, display:"inline-flex", alignItems:"center", gap:5, flexShrink:0 }}>
                  🟡 Rascunho — não notifica até aprovar pacote
                </span>
              )}
              {(() => {
                const linked = getLinkedClassNames(editCls);
                return (
                  <button onClick={() => setShowLinkPicker(v => !v)}
                    style={{ background: linked.length > 0 ? "#06b6d415" : "transparent", border:`1px solid ${linked.length > 0 ? "#06b6d450" : "#154753"}`, borderRadius:20, padding:"3px 12px", color: linked.length > 0 ? "#06b6d4" : "#64748b", fontSize:12, fontWeight:600, display:"inline-flex", alignItems:"center", gap:5, flexShrink:0, cursor:"pointer" }}>
                    🔗 {linked.length > 0 ? `Vinculada com: ${linked.join(", ")}` : "Vincular turmas"}
                  </button>
                );
              })()}
            </div>
            {showLinkPicker && (() => {
              const linked = getLinkedClassNames(editCls);
              // Só faz sentido vincular turmas que rodam na MESMA semana (para que a(s)
              // disciplina(s) compartilhada(s) aconteçam juntas). A semana de cada turma
              // é a da sua data de INÍCIO (mesma definição de nextClassName). A turma sob
              // edição usa as datas ao vivo de editItems (pode ter datas ainda não salvas).
              const editDates = editItems.map(i => i.date).filter(Boolean).sort();
              const editWeekKey = editDates.length ? weekKeyG(editDates[0]) : null;
              // className → Set de chaves de semana (um mesmo nome pode existir em semanas
              // diferentes; cada classId contribui a semana da sua data de início).
              const startByClassId = {};
              for (const s of schedules) {
                if (!s.classId || !s.date) continue;
                if (!startByClassId[s.classId] || s.date < startByClassId[s.classId]) startByClassId[s.classId] = s.date;
              }
              const weekKeysByName = {};
              for (const c of allClasses) {
                const start = startByClassId[c.classId];
                if (!start) continue;
                if (!weekKeysByName[c.className]) weekKeysByName[c.className] = new Set();
                weekKeysByName[c.className].add(weekKeyG(start));
              }
              const candidates = allClasses
                .map(c => c.className)
                .filter((name, i, arr) => name && name !== editCls && arr.indexOf(name) === i)
                // Mantém sempre as já-vinculadas (permite desvincular), e além delas
                // só lista turmas da mesma semana. Sem semana determinável → não filtra.
                .filter(name => linked.includes(name) || !editWeekKey || (weekKeysByName[name] && weekKeysByName[name].has(editWeekKey)))
                .sort();
              return (
                <div style={{ marginTop:8, padding:"10px 14px", background:"#01323d", borderRadius:10, border:"1px solid #06b6d440", maxWidth:420 }}>
                  <p style={{ color:"#94a3b8", fontSize:12, margin:"0 0 8px" }}>
                    Selecione as turmas a vincular — instrutor e local poderão ser duplicados entre elas sem gerar conflito.
                    <span style={{ display:"block", color:"#64748b", marginTop:4 }}>Somente turmas da mesma semana são listadas.</span>
                  </p>
                  {candidates.length === 0 ? (
                    <p style={{ color:"#64748b", fontSize:12, textAlign:"center", padding:8, margin:0 }}>Nenhuma outra turma na mesma semana.</p>
                  ) : (
                    <div style={{ maxHeight:200, overflowY:"auto" }}>
                      {candidates.map(name => {
                        const isSel = linked.includes(name);
                        return (
                          <div key={name} onClick={() => toggleLinkClass(editCls, name, editClassId)}
                            style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:6, cursor:"pointer", background: isSel ? "#06b6d420" : "transparent", marginBottom:4 }}>
                            <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${isSel ? "#06b6d4" : "#475569"}`, background: isSel ? "#06b6d4" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              {isSel && <Icon name="check" size={10} color="#fff" />}
                            </div>
                            <span style={{ color: isSel ? "#06b6d4" : "#e2e8f0", fontSize:12, fontWeight: isSel ? 700 : 500 }}>{name}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
            <p style={{ color:"#64748b", fontSize:13, margin:"4px 0 0" }}>
              {editItems.length} módulos · {Object.keys(editByDay).length} dia(s)
              {editTraining && <span style={{ marginLeft:12, color:"#94a3b8" }}>{editTraining.name.slice(0,50)}</span>}
            </p>
            <div style={{ display:"flex", gap:12, marginTop:10, flexWrap:"wrap" }}>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3 }}>Qtd. Alunos</label>
                <input type="number" min="1" value={editStudentCount} onChange={e => setEditStudentCount(e.target.value)}
                  placeholder="Ex: 12"
                  style={{ padding:"6px 10px", background:"#073d4a", border:"1px solid #154753", borderRadius:7, color:"#e2e8f0", fontSize:13, outline:"none", width:100 }} />
              </div>
              <div style={{ flex:1, minWidth:200 }}>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3 }}>
                  Observação <span style={{ color:"#64748b" }}>{editObservation?.length||0}/500</span>
                </label>
                <textarea value={editObservation} onChange={e => setEditObservation(e.target.value.slice(0,500))}
                  placeholder="Aviso importante para o instrutor..."
                  rows={2} maxLength={500}
                  style={{ width:"100%", padding:"6px 10px", background:"#073d4a", border:"1px solid #154753", borderRadius:7, color:"#e2e8f0", fontSize:12, outline:"none", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {editUseDefault && <Btn onClick={() => {
              // Recalcular = re-sequenciar horários a partir do início + sugerir
              // instrutores diferentes. Datas customizadas via picker são
              // descartadas — é o reset deliberado da turma.
              const prevIds = editItems.flatMap(it => (it.slots||[]).map(s => s.instructorId)).filter(Boolean);
              recalcEdit({ varyInstructors: true, previousInstructorIds: prevIds });
            }} label="↺ Recalcular" color="#154753" sm />}
            {hasPermission(user, "plan_edit") && editClassId && (
              <button onClick={() => deleteClass(editClassId)}
                style={{ padding:"7px 14px", background:"#ef444415", border:"1px solid #ef444460", borderRadius:8, color:"#ef4444", fontSize:12, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                <Icon name="delete" size={13} color="#ef4444" /> Excluir turma
              </button>
            )}
            <button onClick={() => {
              const days = Object.entries(editByDay).sort(([a],[b]) => a.localeCompare(b));
              const fmtD = d => new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
              // esc: escapa texto controlado pelo usuário antes de injetar no HTML da janela
              // de impressão (mesma origem). Sem isso, nome de turma/módulo/local/instrutor com
              // "<script>" executaria no contexto do app (SEGURANCA.md §6.9 S4).
              const esc = s => String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
              const rowsHtml = days.map(([day, items]) => {
                const sorted = [...items].sort((a,b) => (a.startTime||"").localeCompare(b.startTime||""));
                const dayRows = sorted.map((it,i) => {
                  const localsTxt = (it.slots||[]).map(s=>s.local||"").filter(Boolean).map(esc).join(", ") || "—";
                  const instrTxt = (it.slots||[]).map(s=>{const instr=instructors.find(i=>String(i.id)===String(s.instructorId));return instr?esc(instr.name.split(" ").slice(0,2).join(" ")):"—";}).join(", ");
                  return "<tr>" + (i===0 ? "<td rowspan='"+sorted.length+"' style='padding:6px 12px;border:1px solid #ddd;vertical-align:top;font-weight:700;white-space:nowrap'>"+fmtD(day)+"</td>" : "") +
                  "<td style='padding:6px 12px;border:1px solid #ddd;white-space:nowrap'>"+(it.startTime||"")+" – "+(it.endTime||"")+"</td>"+
                  "<td style='padding:6px 12px;border:1px solid #ddd'>"+esc(it.mod?.name||it.module||"")+"</td>"+
                  "<td style='padding:6px 12px;border:1px solid #ddd'>"+localsTxt+"</td>"+
                  "<td style='padding:6px 12px;border:1px solid #ddd;font-size:11px'>"+instrTxt+"</td>"+
                  "</tr>";
                }).join("");
                return dayRows;
              }).join("");
              const w = window.open("","_blank");
              w.document.write("<html><head><title>"+esc(editCls)+"</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{background:#01323d;color:#fff;padding:8px 12px;border:1px solid #ccc}@media print{button{display:none}}</style></head><body>");
              w.document.write("<h2 style='margin:0 0 2px'>Programação da Turma</h2>");
              w.document.write("<h3 style='margin:0 0 4px;color:#555'>"+esc(editCls)+(editTraining?" — "+esc(editTraining.name.slice(0,60)):"")+"</h3>");
              if (editStudentCount) w.document.write("<p style='color:#555;margin:0 0 16px'>"+editStudentCount+" aluno(s)</p>");
              w.document.write("<button onclick='window.print()' style='margin-bottom:16px;padding:8px 18px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer'>🖨 Imprimir / PDF</button>");
              w.document.write("<table><thead><tr><th>Data</th><th>Horário</th><th>Módulo</th><th>Local</th><th>Instrutor(es)</th></tr></thead><tbody>"+rowsHtml+"</tbody></table>");
              w.document.write("</body></html>");
              w.document.close();
            }}
              style={{ padding:"7px 14px", background:"#0a4a5a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              🖨 PDF
            </button>
            <Btn onClick={() => setNotifyEditModal(true)} label="✓ Salvar alterações" color="linear-gradient(135deg,#16a34a,#15803d)" />
          </div>
        </div>
        <p style={{ color:"#475569", fontSize:12, marginBottom:16, padding:"8px 12px", background:"#073d4a", borderRadius:8, border:"1px solid #154753" }}>
          ⠿ Arraste módulos para reordenar dentro do dia · Arraste para o <strong style={{color:"#ffa619"}}>cabeçalho de outro dia</strong> ou use o <strong style={{color:"#ffa619"}}>calendário ao lado do horário</strong> para mover para qualquer data
        </p>

        {Object.entries(editByDay).sort(([a],[b]) => a.localeCompare(b)).map(([day, dayItems]) => {
          const isOver = dragOverDay === day;
          return (
            <div key={day} style={{ marginBottom:20 }}
              onDragOver={e => { e.preventDefault(); if (dragEditId) setDragOverDay(day); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverDay(null); }}
              onDrop={e => { e.preventDefault(); setDragOverDay(null); if (dragEditId) moveToDay(dragEditId, day); setDragEditId(null); }}>
              <div style={{ padding:"10px 16px", background: isOver ? "#1e4a5a" : "#01323d",
                borderRadius:"10px 10px 0 0", border:`2px solid ${isOver ? "#ffa619" : "#154753"}`,
                borderBottom:"none", display:"flex", alignItems:"center", gap:10, transition:"all 0.15s" }}>
                <span style={{ color:"#ffa619", fontSize:13, fontWeight:700 }}>{fmtDate(day)}</span>
                <span style={{ color:"#64748b", fontSize:12 }}>{dayItems.length} disciplina(s)</span>
                {isOver && (
                  <span style={{ marginLeft:"auto", color:"#ffa619", fontSize:12, fontWeight:600, animation:"pulse 1s infinite" }}>
                    ⤵ Soltar aqui para mover para {fmtDate(day)}
                  </span>
                )}
              </div>
              <div style={{ border:`1px solid ${isOver ? "#ffa619" : "#154753"}`, borderTop:"none", borderRadius:"0 0 10px 10px", overflow:"hidden", transition:"border-color 0.15s" }}>
                {dayItems.map((item, li) => {
                  const modType  = (item.role||"").includes("Practical") || (item.module||"").includes("PRÁTICA") ? "PRÁTICA" : "TEORIA";
                  const _editMod     = item.moduleId ? trainings.flatMap(t => t.modules||[]).find(m => String(m.id) === String(item.moduleId)) : null;
                  const _bTypeEdit = defaultPlanningType === "base" ? baseLocalType(viewBase) : null;
                  const localOpts2 = _editMod ? getLocalOpts(_editMod, editTraining) : LOCALS.filter(l => {
                    if (_bTypeEdit && l.type !== _bTypeEdit) return false;
                    if (modType === "TEORIA")   return l.env === "Teórico";
                    if (modType === "PRÁTICA")  return isCbincEdit ? l.subtype === "incendio" : l.env === "Prático";
                    return true;
                  });
                  const _ativosEdit  = instructors.filter(i => i.status !== "Inativo" && i.type !== "moderador");
                  const _habEdit     = item.module ? _ativosEdit.filter(i => _editMod ? (i.skills||[]).some(s => skillMatchesModule(s, _editMod)) : (i.skills||[]).some(s => skillMatchesModuleName(s, item.module, trainings))) : _ativosEdit;
                  const _habEditTrad = _ativosEdit.filter(i => (i.skills||[]).some(s => (s.name||s) === TRANSLATOR_SKILL));
                  const _iStartE = timeToMins(item.startTime||"00:00"), _iEndE = timeToMins(item.endTime||"00:00");
                  const _isUnavailEdit = (i) =>
                    checkSlotConflict(item.date, item.startTime, item.endTime, String(i.id), null, editClassId, getLinkedClassNames(editCls)).instrConflict
                    || isInstructorAbsent(i.id, item.date, _iStartE, _iEndE, absences||[])
                    || !!isHoliday(item.date, i, holidays||[]);
                  const _disponiveisEdit = _habEdit.filter(i => !_isUnavailEdit(i));
                  const _ocupadosEdit    = _habEdit.filter(i =>  _isUnavailEdit(i));
                  const _disponiveisTradEdit = _habEditTrad.filter(i => !_isUnavailEdit(i));
                  const _ocupadosTradEdit    = _habEditTrad.filter(i =>  _isUnavailEdit(i));
                  const _getOcupacaoLabelEdit = (instrId) => {
                    const nS = _iStartE, nE = _iEndE;
                    const schedRow = schedules.find(s =>
                      s.date === item.date && s.instructorId && +s.instructorId === +instrId &&
                      timeToMins(s.startTime) < nE && timeToMins(s.endTime) > nS &&
                      s.className !== editCls && !(getLinkedClassNames(editCls)||[]).includes(s.className)
                    );
                    return schedRow ? schedRow.className : "";
                  };
                  const _getFeriadoLabelEdit = (instrId) => {
                    const instr = instructors.find(x => String(x.id) === String(instrId));
                    if (!instr) return null;
                    const h = isHoliday(item.date, instr, holidays||[]);
                    return h ? h.name : null;
                  };
                  const isDragging = dragEditId === item.id;
                  return (
                    <div key={item.id}
                      draggable
                      onDragStart={e => { e.stopPropagation(); setDragEditId(item.id); setDragOverDay(null); }}
                      onDragEnd={() => { setDragEditId(null); setDragOverDay(null); }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={e => { e.stopPropagation(); if (dragEditId && dragEditId !== item.id) { reorderEdit(dragEditId, item.id); setDragEditId(null); } }}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                        background: isDragging ? "#1e5a6a" : li%2===0 ? "#073d4a" : "#063540",
                        borderBottom: li < dayItems.length-1 ? "1px solid #154753" : "none",
                        cursor:"grab", opacity: isDragging ? 0.4 : 1, transition:"opacity 0.15s" }}>
                      <span style={{ color:"#475569", fontSize:16, flexShrink:0, cursor:"grab" }}>⠿</span>
                      <div style={{ width: editUseDefault ? 120 : 200, flexShrink:0 }}>
                        {editUseDefault ? (
                          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                            <span style={{ color:"#94a3b8", fontSize:11 }}>{item.startTime}–{item.endTime}</span>
                            <p style={{ color:"#475569", fontSize:10, margin:0 }}>{item.startTime && item.endTime ? fmtMin(timeToMins(item.endTime) - timeToMins(item.startTime)) : ""}</p>
                            <input type="date" value={item.date||""}
                              onChange={e => { if (e.target.value) moveToDay(item.id, e.target.value); }}
                              title="Mover este módulo para qualquer data"
                              style={{ width:"100%", padding:"2px 4px", background:"#01323d", border:"1px solid #154753", borderRadius:5, color:"#94a3b8", fontSize:10, outline:"none", cursor:"pointer", boxSizing:"border-box" }} />
                          </div>
                        ) : (
                          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                            <input type="date" value={item.date||""} onChange={e => updateEditItemField(item.id, { date: e.target.value })}
                              style={{ width:"100%", padding:"3px 4px", background:"#01323d", border:"1px solid #154753", borderRadius:5, color:"#94a3b8", fontSize:10, outline:"none" }} />
                            <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                              <input type="time" value={item.startTime||""} onChange={e => updateEditItemField(item.id, { startTime: e.target.value })}
                                style={{ width:60, padding:"3px 4px", background:"#01323d", border:"1px solid #154753", borderRadius:5, color:"#e2e8f0", fontSize:10, outline:"none" }} />
                              <span style={{ color:"#475569", fontSize:10 }}>–</span>
                              <input type="time" value={item.endTime||""} onChange={e => updateEditItemField(item.id, { endTime: e.target.value })}
                                style={{ width:60, padding:"3px 4px", background:"#01323d", border:"1px solid #154753", borderRadius:5, color:"#e2e8f0", fontSize:10, outline:"none" }} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ color:"#e2e8f0", fontSize:13, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.module}</p>
                        <span style={{ padding:"1px 6px", borderRadius:4, background: modType==="PRÁTICA" ? "#16a34a20":"#ffa61920", color: modType==="PRÁTICA" ? "#16a34a":"#ffa619", fontSize:10, fontWeight:700 }}>{modType}</span>
                      </div>
                      {/* Local unico + instrutores por slot */}
                      {(() => {
                        const editSlots = item.slots || [{ instructorId: String(item.instructorId||""), local: item.local||"" }];
                        const updateSlots = (ns) => setEditItems(prev => prev.map(x => x.id===item.id ? {...x, slots: ns} : x));
                        return (
                          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                            {/* Local compartilhado */}
                            {(() => {
                              const _lCfl = !!(editSlots[0]?.local && checkSlotConflict(item.date, item.startTime, item.endTime, null, editSlots[0].local, editClassId, getLinkedClassNames(editCls)).localConflict);
                              return (
                                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                                  <div style={{ width:160 }}>
                                    <select value={editSlots[0]?.local||""} onChange={e => updateSlots(editSlots.map(s => ({...s, local: e.target.value})))}
                                      style={{ width:"100%", padding:"6px 8px", background:"#01323d", border:`1px solid ${_lCfl ? "#ef4444" : "#154753"}`, borderRadius:7, color: editSlots[0]?.local ? "#e2e8f0":"#475569", fontSize:12, outline:"none" }}>
                                      <option value="">📍 Local...</option>
                                      {(() => {
                                        const nS2 = timeToMins(item.startTime||"00:00"), nE2 = timeToMins(item.endTime||"00:00");
                                        const _getLocalCflEdit = (name) => {
                                          const row = schedules.find(s => s.date === item.date && s.local === name && timeToMins(s.startTime) < nE2 && timeToMins(s.endTime) > nS2 && s.className !== editCls && !(getLinkedClassNames(editCls)||[]).includes(s.className));
                                          return row ? row.className : "";
                                        };
                                        const livresL = localOpts2.filter(l => !checkSlotConflict(item.date, item.startTime, item.endTime, null, l.name, editClassId, getLinkedClassNames(editCls)).localConflict);
                                        const ocupdsL = localOpts2.filter(l =>  checkSlotConflict(item.date, item.startTime, item.endTime, null, l.name, editClassId, getLinkedClassNames(editCls)).localConflict);
                                        return (<>
                                          {livresL.map(l => <option key={l.id} value={l.name} style={{color:"#111"}}>{l.name}</option>)}
                                          {ocupdsL.length > 0 && <>
                                            <option value="" disabled>─── Ocupados ───</option>
                                            {ocupdsL.map(l => {
                                              const lbl = _getLocalCflEdit(l.name);
                                              return <option key={l.id} value={l.name} style={{color:"#ef4444"}}>⚠ {l.name}{lbl ? ` · ${lbl}` : ""}</option>;
                                            })}
                                          </>}
                                        </>);
                                      })()}
                                    </select>
                                  </div>
                                  {_lCfl && <span style={{ color:"#ef4444", fontSize:10, fontWeight:700 }}>⚠ Ocupado</span>}
                                </div>
                              );
                            })()}
                            {/* Um instrutor por slot */}
                            {editSlots.map((slot, k) => {
                              if (slot.role === EAD_MODERATOR_ROLE) {
                                const _mods = (instructors||[]).filter(i => i.type === "moderador" && i.status !== "Inativo");
                                return (
                                  <div key={k} style={{ display:"flex", alignItems:"center", gap:4 }}>
                                    <span style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, padding:"2px 6px", borderRadius:4, background:"#0ea5e920", color:"#0ea5e9", border:"1px solid #0ea5e940", flexShrink:0 }}>💻 Moderador</span>
                                    <div style={{ width:160 }}>
                                      <select value={String(slot.instructorId||"")} onChange={e => { const ns=[...editSlots]; ns[k]={...ns[k],instructorId:e.target.value}; updateSlots(ns); }}
                                        style={{ width:"100%", padding:"6px 8px", background:"#0ea5e910", border:"1px solid #0ea5e940", borderRadius:7, color: slot.instructorId ? "#e2e8f0":"#475569", fontSize:12, outline:"none" }}>
                                        <option value="">💻 Moderador EAD...</option>
                                        {(() => {
                                          const _smE = String(slot.instructorId||"");
                                          if (!_smE || _mods.some(i => String(i.id) === _smE)) return null;
                                          const _miE = (instructors||[]).find(i => String(i.id) === _smE);
                                          return <option value={_smE} disabled style={{color:"#94a3b8"}}>{_miE ? `${_miE.status === "Inativo" ? "⛔ " : ""}${_miE.name}${_miE.status === "Inativo" ? " · Inativo" : ""}` : `Moderador removido (#${_smE})`}</option>;
                                        })()}
                                        {_mods.map(i => <option key={i.id} value={i.id} style={{color:"#111"}}>{i.name}</option>)}
                                      </select>
                                    </div>
                                  </div>
                                );
                              }
                              return (
                              <div key={k} style={{ display:"flex", alignItems:"center", gap:4 }}>
                                {(() => {
                                  const nonTrad = editSlots.filter(s => !s.isTranslator);
                                  const ntIdx = slot.isTranslator ? -1 : nonTrad.indexOf(slot);
                                  const chip = getSlotChip(slot, ntIdx, _editMod, editTraining);
                                  const _huetRemovable = isHuetModule(_editMod) && !slot.isTranslator;
                                  if (_huetRemovable) {
                                    const _removeSlot = () => updateSlots(editSlots.filter((_, j) => j !== k));
                                    const _changeRoleEdit = (roleCode) => {
                                      const ns = [...editSlots]; ns[k] = { ...ns[k], role: roleCode }; updateSlots(ns);
                                    };
                                    return (
                                      <span style={{ display:"inline-flex", alignItems:"center", gap:0, borderRadius:4, background:chip.bg, border:chip.border, flexShrink:0, overflow:"hidden" }}>
                                        <select value={slot.role || chip.label} onChange={e => _changeRoleEdit(e.target.value)}
                                          title="Alterar papel deste slot"
                                          style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, padding:"2px 4px", background:"transparent", color:chip.color, border:"none", outline:"none", cursor:"pointer", minWidth:chip.minWidth }}>
                                          {POOL_TEAM_ROLES.map((r, ri) => <option key={ri} value={r.code} style={{ color:"#111", background:"#0a2a33", fontWeight:700 }}>{r.code}</option>)}
                                        </select>
                                        <button onClick={_removeSlot} title={`Remover ${chip.label} deste módulo`} style={{ background:"none", border:"none", borderLeft:`1px solid ${chip.color}40`, color:chip.color, padding:"2px 5px", cursor:"pointer", fontSize:11, lineHeight:1, fontWeight:700 }}>×</button>
                                      </span>
                                    );
                                  }
                                  return <span style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, minWidth:chip.minWidth, textAlign:"center", padding:"2px 4px", borderRadius:4, background:chip.bg, color:chip.color, border:chip.border, flexShrink:0 }}>{chip.label}</span>;
                                })()}
                                {(() => {
                                  const _iCfl = !!(slot.instructorId && !slot.isTranslator && checkSlotConflict(item.date, item.startTime, item.endTime, slot.instructorId, null, editClassId, getLinkedClassNames(editCls)).instrConflict);
                                  return (<>
                                    <div style={{ width:160 }}>
                                      <select value={String(slot.instructorId||"")} onChange={e => { const ns=[...editSlots]; ns[k]={...ns[k],instructorId:e.target.value}; updateSlots(ns); }}
                                        style={{ width:"100%", padding:"6px 8px", background: slot.isTranslator ? "#06b6d410" : "#01323d", border:`1px solid ${_iCfl ? "#ef4444" : slot.isTranslator ? "#06b6d440" : "#154753"}`, borderRadius:7, color: slot.instructorId ? "#e2e8f0":"#475569", fontSize:12, outline:"none" }}>
                                        <option value="">{slot.isTranslator ? "🌐 Tradutor..." : "👤 Instrutor..."}</option>
                                        {(() => {
                                          const _nonTradSI = editSlots.filter(s => !s.isTranslator);
                                          const _ntIdxSI = slot.isTranslator ? -1 : _nonTradSI.indexOf(slot);
                                          const _prSI = _editMod && isHuetModule(_editMod) && _ntIdxSI >= 0
                                            ? (slot.role ? POOL_TEAM_ROLES.find(r => r.code === slot.role) : getPoolTeamRole(_ntIdxSI))
                                            : null;
                                          const _otherSelEdit = editSlots.filter((_,j) => j!==k && !editSlots[j].isTranslator).map(s=>s.instructorId).filter(Boolean);
                                          let pool, poolOcp;
                                          if (slot.isTranslator) {
                                            pool = _disponiveisTradEdit; poolOcp = _ocupadosTradEdit;
                                          } else if (_prSI) {
                                            const _rf = (i) => !_otherSelEdit.includes(String(i.id)) && hasValidCompetency(i, _prSI.requiresCompetency) && (!_prSI.requiresDisciplineSkill || (i.skills||[]).some(s => skillMatchesModule(s, _editMod))) && (_prSI.code !== "Lead Instructor" || (i.skills||[]).some(s => skillMatchesModule(s, _editMod) && s.canLead));
                                            pool = _disponiveisEdit.filter(_rf); poolOcp = _ocupadosEdit.filter(_rf);
                                          } else if (_ntIdxSI === 0 && _editMod) {
                                            const _lf = (i) => !_otherSelEdit.includes(String(i.id)) && (i.skills||[]).some(s => skillMatchesModule(s, _editMod) && s.canLead);
                                            pool = _disponiveisEdit.filter(_lf); poolOcp = _ocupadosEdit.filter(_lf);
                                          } else {
                                            pool = _disponiveisEdit.filter(i => !_otherSelEdit.includes(String(i.id)));
                                            poolOcp = _ocupadosEdit.filter(i => !_otherSelEdit.includes(String(i.id)));
                                          }
                                          // Instrutor atribuído que saiu do pool (ex.: Inativo) precisa de uma opção
                                          // pinada — senão o select cai no placeholder e o histórico "some" da tela.
                                          const _selIdE = String(slot.instructorId||"");
                                          const _selMissE = _selIdE && ![...pool, ...poolOcp].some(i => String(i.id) === _selIdE);
                                          const _selInstrE = _selMissE ? (instructors||[]).find(i => String(i.id) === _selIdE) : null;
                                          return (<>
                                            {_selMissE && (
                                              <option value={_selIdE} disabled style={{color:"#94a3b8"}}>
                                                {_selInstrE ? `${_selInstrE.status === "Inativo" ? "⛔ " : ""}${_selInstrE.name}${_selInstrE.status === "Inativo" ? " · Inativo" : ""}` : `Instrutor removido (#${_selIdE})`}
                                              </option>
                                            )}
                                            <option value="" disabled>— {pool.length} disponível(eis) —</option>
                                            {pool.map(i => <option key={i.id} value={i.id} style={{color:"#111"}}>{i.name}</option>)}
                                            {poolOcp.length > 0 && <>
                                              <option value="" disabled>─── Indisponíveis ───</option>
                                              {poolOcp.map(i => {
                                                const feriado = _getFeriadoLabelEdit(i.id);
                                                return feriado
                                                  ? <option key={i.id} value={i.id} style={{color:"#06b6d4"}}>🏖 {i.name} · {feriado}</option>
                                                  : <option key={i.id} value={i.id} style={{color:"#ef4444"}}>⚠ {i.name} · {_getOcupacaoLabelEdit(i.id)}</option>;
                                              })}
                                            </>}
                                          </>);
                                        })()}
                                      </select>
                                    </div>
                                    {slot.isTranslator && <span style={{ color:"#06b6d4", fontSize:10, fontWeight:700 }}>🌐</span>}
                                    {_iCfl && (() => {
                                      const lbl = _getOcupacaoLabelEdit(slot.instructorId);
                                      return <span style={{ color:"#ef4444", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>⚠ Ocupado{lbl ? ` · ${lbl}` : ""}</span>;
                                    })()}
                                    {/* Camada B3 — Validação suave HUET na edição */}
                                    {!_iCfl && slot.instructorId && !slot.isTranslator && isHuetModule(_editMod) && (() => {
                                      const _nonTrad = editSlots.filter(s => !s.isTranslator);
                                      const _ntIdx = _nonTrad.indexOf(slot);
                                      const _role = getPoolTeamRole(_ntIdx);
                                      if (!_role) return null;
                                      const _instr = instructors.find(i => String(i.id) === String(slot.instructorId));
                                      if (!_instr || hasValidCompetency(_instr, _role.requiresCompetency)) return null;
                                      const _compLbl = (getSpecialCompetency(_role.requiresCompetency) || {}).label || _role.requiresCompetency;
                                      return <span title={`Instrutor sem competência ${_compLbl} cadastrada/válida`} style={{ color:"#f59e0b", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>⚠ Sem {_compLbl}</span>;
                                    })()}
                                  </>);
                                })()}
                              </div>
                            ); })}
                            {/* Botões + assistente / − assistente / tradutor */}
                            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                              <button onClick={() => {
                                const specialIdx = editSlots.findIndex(s => s.isTranslator || s.role === EAD_MODERATOR_ROLE);
                                const ns = [...editSlots];
                                if (specialIdx >= 0) ns.splice(specialIdx, 0, { instructorId: "", local: editSlots[0]?.local || "" });
                                else ns.push({ instructorId: "", local: editSlots[0]?.local || "" });
                                updateSlots(ns);
                              }}
                                title="Adicionar assistente"
                                style={{ fontSize:12, fontWeight:700, width:22, height:22, borderRadius:5, cursor:"pointer", border:"1px solid #154753", background:"transparent", color:"#475569", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>+</button>
                              <span style={{ fontSize:10, color:"#475569", minWidth:16, textAlign:"center" }}>{editSlots.filter(s=>!s.isTranslator && s.role !== EAD_MODERATOR_ROLE).length}</span>
                              <button onClick={() => {
                                const nonTradIdxs = editSlots.map((s, i) => (s.isTranslator || s.role === EAD_MODERATOR_ROLE) ? -1 : i).filter(i => i >= 0);
                                if (nonTradIdxs.length <= 1) return;
                                const lastIdx = nonTradIdxs[nonTradIdxs.length - 1];
                                updateSlots(editSlots.filter((_, i) => i !== lastIdx));
                              }}
                                title="Remover assistente"
                                style={{ fontSize:12, fontWeight:700, width:22, height:22, borderRadius:5, cursor:"pointer", border:"1px solid #154753", background:"transparent", color:"#475569", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>−</button>
                              <div style={{ width:1, height:16, background:"#154753" }} />
                              {(() => {
                                const hasT = editSlots.some(s => s.isTranslator);
                                return (
                                  <button onClick={() => {
                                    if (hasT) { updateSlots(editSlots.filter(s => !s.isTranslator)); }
                                    else { updateSlots([...editSlots, { instructorId: "", local: editSlots[0]?.local || "", isTranslator: true }]); }
                                  }}
                                    style={{ background: hasT ? "#06b6d415" : "none", border:`1px solid ${hasT ? "#06b6d440" : "#154753"}`, borderRadius:6, padding:"3px 8px", color: hasT ? "#06b6d4" : "#64748b", fontSize:10, fontWeight:600, cursor:"pointer" }}>
                                    {hasT ? "🌐 Remover tradutor" : "🌐 + Tradutor"}
                                  </button>
                                );
                              })()}
                              <div style={{ width:1, height:16, background:"#154753" }} />
                              <button onClick={() => deleteEditItem(item.id)}
                                title="Excluir disciplina"
                                style={{ fontSize:11, fontWeight:700, width:22, height:22, borderRadius:5, cursor:"pointer", border:"1px solid #7f1d1d60", background:"transparent", color:"#ef4444", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>✕</button>
                            </div>
                          </div>
                        );
                      })()}
                      <span style={{ padding:"3px 8px", borderRadius:10, background:(STATUS_COLOR[item.status]||"#64748b")+"20", color:STATUS_COLOR[item.status]||"#64748b", fontSize:11, fontWeight:600, flexShrink:0 }}>
                        {item.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
      <DateGuardModal guard={dateGuard} setGuard={setDateGuard} user={user} />
      <EditGuardModal guard={editGuard} setGuard={setEditGuard} user={user} />
        <ConflictModal guard={conflictGuard} setGuard={setConflictGuard} />
        {notifyEditModal && (
          <Modal title="Salvar Alterações da Turma" onClose={() => setNotifyEditModal(false)} width={420}>
            <p style={{ color:"#94a3b8", fontSize:14, marginBottom:20 }}>Deseja notificar os instrutores sobre as alterações nesta turma?</p>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <Btn onClick={() => { setNotifyEditModal(false); saveEditItems(); }} label="Salvar e notificar instrutores" icon="check" color="#16a34a" />
              <Btn onClick={() => { setNotifyEditModal(false); window.__skipNextNotifications(); saveEditItems(); }} label="Salvar sem notificar" color="#154753" />
            </div>
          </Modal>
        )}
        </div>
      </div>
    );
  }

    // ── STEP 1: Wizard — Select training ─────────────────────────────────────
  if (step === 1) return (
    <div>
      {tabBarEl}
      <button onClick={closeActiveTab} style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:14, marginBottom:20, padding:0 }}>
        <Icon name="back" size={18} color="#94a3b8" /> Fechar aba
      </button>
      <div style={{ background:"#073d4a", borderRadius:16, padding:28, border:"1px solid #154753", maxWidth:560 }}>
        <h2 style={{ color:"#fff", fontWeight:800, margin:"0 0 6px", fontSize:20 }}>Nova Turma</h2>
        <p style={{ color:"#64748b", fontSize:13, margin:"0 0 24px" }}>Selecione o treinamento e a data de início</p>
        <SearchSel label="Treinamento" value={wizForm.trainingId}
          onChange={e => setWizForm(prev => ({ ...prev, trainingId: e.target.value, className: "", modeId: "" }))}
          opts={trainings.map(t => ({ v: t.id, l: `${t.gcc} — ${t.name.slice(0,50)}`, keywords: `${t.gcc} ${t.shortName||''} ${t.name}` }))} />
        {selTraining && (
          <div style={{ marginBottom:14, padding:"10px 14px", background:"#01323d", borderRadius:10, border:"1px solid #154753" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <span style={{ color:"#ffa619", fontSize:12, fontWeight:700 }}>{selTraining.gcc}</span>
              {(() => { const a = areas.find(x => x.id === selTraining.area); return a ? <span style={{ padding:"1px 8px", borderRadius:10, background:a.color+"20", color:a.color, fontSize:11, fontWeight:600 }}>{a.name}</span> : null; })()}
              <span style={{ color:"#64748b", fontSize:12 }}>{selTraining.modules?.length||0} módulos</span>
              <span style={{ color: selTraining.defaultSchedule!==false ? "#ffa619" : "#94a3b8", fontSize:11 }}>
                {selTraining.defaultSchedule!==false
                  ? "⏰ Horário 08:00–17:00"
                  : `⏰ Horário personalizado · até ${selTraining.horarioFim || "21:00"}`}
              </span>
            </div>
            {selTraining.modules?.length === 0 && <p style={{ color:"#d97806", fontSize:12, margin:"6px 0 0" }}>⚠ Este treinamento não possui módulos cadastrados. Adicione módulos em Treinamentos antes de programar.</p>}
          </div>
        )}
        <Input label="Data de Início" type="date" value={wizForm.date} onChange={e => {
          const novaData = e.target.value;
          if (selTraining && novaData) {
            setWizForm(prev => ({ ...prev, date: novaData, className: nextClassNameG(selTraining, novaData, schedules) }));
          } else {
            setWizForm(prev => ({ ...prev, date: novaData }));
          }
        }} />
        {selTraining && selTraining.defaultSchedule === false && (
          <Input label="Horário de Início" type="time" value={wizForm.startTime} onChange={e => setWizForm({ ...wizForm, startTime: e.target.value })} />
        )}
        {selTraining && selTraining.defaultSchedule !== false && (() => {
          // Almoço efetivo do treinamento (override por turma foi removido — só o cadastro define).
          const eff = lunchFromSchedule(selTraining.lunchSchedule);
          const startStr = `${String(Math.floor(eff.start/60)).padStart(2,"0")}:${String(eff.start%60).padStart(2,"0")}`;
          const endStr   = `${String(Math.floor(eff.end/60)).padStart(2,"0")}:${String(eff.end%60).padStart(2,"0")}`;
          const fromTraining = !!selTraining.lunchSchedule;
          return (
            <p style={{ color:"#64748b", fontSize:12, margin:"-4px 0 14px", padding:"8px 12px", background:"#154753", borderRadius:8 }}>
              ⏰ Horário: <strong style={{color:"#ffa619"}}>08:00 → {startStr}</strong> (almoço) <strong style={{color:"#ffa619"}}>{endStr} → 17:00</strong>
              {fromTraining && <span style={{ marginLeft:8, color:"#94a3b8" }}>· almoço do treinamento</span>}
            </p>
          );
        })()}
        {(() => {
          if (!selTraining) return <Input label="Nome da Turma" value={wizForm.className} onChange={e => setWizForm({ ...wizForm, className: e.target.value })} placeholder="Ex: CBSP - 01" />;
          // Calcular semana do ano para a data selecionada (ou hoje)
          const refDate = wizForm.date ? new Date(wizForm.date + "T12:00:00") : new Date();
          const startOfYear = new Date(refDate.getFullYear(), 0, 1);
          const weekNum = Math.ceil(((refDate - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
          // Turmas da mesma semana para esse treinamento (usa data de início da turma)
          const startByClass2 = {};
          schedules.forEach(s => {
            if (String(s.trainingId) !== String(selTraining.id)) return;
            if (!startByClass2[s.className] || s.date < startByClass2[s.className]) startByClass2[s.className] = s.date;
          });
          const turmasSemana = Object.entries(startByClass2)
            .filter(([, startDate]) => {
              const d = new Date(startDate + "T12:00:00");
              const soy = new Date(d.getFullYear(), 0, 1);
              const wk = Math.ceil(((d - soy) / 86400000 + soy.getDay() + 1) / 7);
              return wk === weekNum && d.getFullYear() === refDate.getFullYear();
            })
            .map(([name]) => name);
          // Proximo nome sugerido (helper compartilhado com o import em lote)
          const proximoNome = nextClassNameG(selTraining, wizForm.date || new Date().toISOString().split("T")[0], schedules);
          // Turmas de outras semanas para reuso
          const outrasturmas = schedules
            .filter(s => String(s.trainingId) === String(selTraining.id))
            .map(s => s.className)
            .filter((v, i, a) => a.indexOf(v) === i && !turmasSemana.includes(v))
            .sort().reverse().slice(0, 5);
          const allSugestoes = [proximoNome, ...turmasSemana.filter(n => n !== proximoNome), ...outrasturmas];
          return (
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>
                Nome da Turma
                <span style={{ color: "#64748b", fontSize: 11, marginLeft: 8 }}>Sugerido: {proximoNome}</span>
              </label>
              <input
                type="text"
                list="wiz-turma-list"
                value={wizForm.className}
                onChange={e => {
                  const newName = e.target.value;
                  const nm = newName.match(/(\d+)$/);
                  const tn = nm ? parseInt(nm[1]) : 0;
                  const am = tn > 0 && (selTraining.modes?.length || 0) > 0 && tn <= selTraining.modes.length ? selTraining.modes[tn - 1] : null;
                  setWizForm(prev => ({ ...prev, className: newName }));
                }}
                placeholder={proximoNome}
                style={{ width: "100%", padding: "10px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 8, color: wizForm.className ? "#e2e8f0" : "#475569", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
              <datalist id="wiz-turma-list">
                {allSugestoes.map(n => <option key={n} value={n} />)}
              </datalist>
              <p style={{ color: "#64748b", fontSize: 11, margin: "4px 0 0" }}>
                Semana {weekNum}: {turmasSemana.length > 0 ? turmasSemana.join(", ") : "nenhuma turma"} · Digite livremente para criar outro número
              </p>
            </div>
          );
        })()}
        {/* Seletor de Modo de Sequência (quando o treinamento tem modos cadastrados) */}
        {selTraining && useDefault && (selTraining.modes?.length || 0) > 0 && (() => {
          const numMatch = (wizForm.className || "").match(/(\d+)$/);
          const turmaNum = numMatch ? parseInt(numMatch[1]) : 0;
          const autoMode = turmaNum > 0 && turmaNum <= selTraining.modes.length ? selTraining.modes[turmaNum - 1] : null;
          const isSuggested = autoMode && !wizForm.modeId;
          return (
            <div style={{ marginBottom:14 }}>
              <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>
                Modo de Sequência
                {isSuggested && <span style={{ color:"#64748b", fontSize:11, marginLeft:8 }}>· sugestão: {autoMode.label}</span>}
              </label>
              <select value={wizForm.modeId} onChange={e => setWizForm(prev => ({ ...prev, modeId: e.target.value }))}
                style={{ width:"100%", padding:"10px 12px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color: wizForm.modeId ? "#e2e8f0" : "#475569", fontSize:14, outline:"none" }}>
                <option value="">Ordem padrão (regulares → revisão → prova → reserva)</option>
                {selTraining.modes.map(md => (
                  <option key={md.id} value={String(md.id)}>{md.label} · {md.moduleOrder?.length || 0} módulo(s)</option>
                ))}
              </select>
            </div>
          );
        })()}
        {/* Tipo de Programação */}
        <div style={{ marginBottom:14 }}>
          <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:8 }}>Tipo de Programação</label>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {[
              { v:"base",      l:"🏢 Base",        desc:"Programação presencial na base" },
              { v:"incompany", l:"🏭 In Company",  desc:"Presencial na empresa do cliente" },
              { v:"ead",       l:"💻 EAD",          desc:"Treinamento remoto / online" },
            ].map(opt => (
              <button key={opt.v} onClick={() => setWizForm(prev => ({ ...prev, planningType: opt.v }))}
                title={opt.desc}
                style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${(wizForm.planningType||"base")===opt.v ? "#ffa619" : "#154753"}`, background:(wizForm.planningType||"base")===opt.v ? "#ffa61920" : "#01323d", color:(wizForm.planningType||"base")===opt.v ? "#ffa619" : "#94a3b8", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
          <div>
            <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Quantidade de Alunos</label>
            <input type="number" min="1" value={wizForm.studentCount} onChange={e => setWizForm({ ...wizForm, studentCount: e.target.value })}
              placeholder="Ex: 12"
              style={{ width:"100%", padding:"10px 12px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>
            Observação para o Instrutor
            <span style={{ color:"#64748b", fontSize:11, marginLeft:8 }}>(máx. 500 caracteres)</span>
          </label>
          <textarea value={wizForm.observation} onChange={e => setWizForm({ ...wizForm, observation: e.target.value.slice(0,500) })}
            placeholder="Ex: Turma com alunos internacionais. Atenção ao material bilíngue."
            rows={3} maxLength={500}
            style={{ width:"100%", padding:"10px 12px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
          <p style={{ color:"#64748b", fontSize:11, margin:"4px 0 0", textAlign:"right" }}>{wizForm.observation?.length||0}/500</p>
        </div>
        <label style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, cursor:"pointer", padding:"10px 14px", borderRadius:10, background: wizForm.withTranslator ? "#06b6d415" : "#01323d", border:`1px solid ${wizForm.withTranslator ? "#06b6d440" : "#154753"}`, transition:"all 0.15s" }}>
          <div onClick={() => setWizForm({ ...wizForm, withTranslator: !wizForm.withTranslator })}
            style={{ width:18, height:18, borderRadius:5, border:`2px solid ${wizForm.withTranslator ? "#06b6d4" : "#154753"}`, background: wizForm.withTranslator ? "#06b6d4" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s" }}>
            {wizForm.withTranslator && <Icon name="check" size={12} color="#fff" />}
          </div>
          <span style={{ color: wizForm.withTranslator ? "#06b6d4" : "#94a3b8", fontSize:13, fontWeight:600 }}>Turma requer tradutor?</span>
        </label>
        <label style={{ display:"flex", alignItems:"center", gap:10, marginBottom: wizForm.linkToOther ? 10 : 16, cursor:"pointer", padding:"10px 14px", borderRadius:10, background: wizForm.linkToOther ? "#06b6d415" : "#01323d", border:`1px solid ${wizForm.linkToOther ? "#06b6d440" : "#154753"}`, transition:"all 0.15s" }}>
          <div onClick={() => setWizForm(prev => ({ ...prev, linkToOther: !prev.linkToOther, linkedClassNames: !prev.linkToOther ? (prev.linkedClassNames||[]) : [] }))}
            style={{ width:18, height:18, borderRadius:5, border:`2px solid ${wizForm.linkToOther ? "#06b6d4" : "#154753"}`, background: wizForm.linkToOther ? "#06b6d4" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s" }}>
            {wizForm.linkToOther && <Icon name="check" size={12} color="#fff" />}
          </div>
          <span style={{ color: wizForm.linkToOther ? "#06b6d4" : "#94a3b8", fontSize:13, fontWeight:600 }}>Vincular a outro treinamento?</span>
        </label>
        {wizForm.linkToOther && (() => {
          if (!wizForm.date) {
            return (
              <div style={{ marginBottom:16, padding:"10px 14px", background:"#01323d", borderRadius:10, border:"1px solid #06b6d440" }}>
                <p style={{ color:"#64748b", fontSize:12, textAlign:"center", margin:0 }}>Informe a data de início para listar turmas da semana.</p>
              </div>
            );
          }
          const refDate = new Date(wizForm.date + "T12:00:00");
          const dow = refDate.getDay();
          const monday = new Date(refDate);
          monday.setDate(refDate.getDate() - ((dow + 6) % 7));
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          const wkStart = monday.toISOString().split("T")[0];
          const wkEnd = sunday.toISOString().split("T")[0];
          const turmasNoIntervalo = [...new Set(
            schedules
              .filter(s => s.date >= wkStart && s.date <= wkEnd && s.className && s.className !== wizForm.className)
              .map(s => s.className)
          )].sort();
          const selected = wizForm.linkedClassNames || [];
          const toggle = (name) => {
            const isSel = selected.includes(name);
            const next = isSel ? selected.filter(n => n !== name) : [...selected, name];
            setWizForm(prev => ({ ...prev, linkedClassNames: next }));
          };
          return (
            <div style={{ marginBottom:16, padding:"10px 14px", background:"#01323d", borderRadius:10, border:"1px solid #06b6d440" }}>
              <p style={{ color:"#94a3b8", fontSize:12, margin:"0 0 10px" }}>
                Turmas com aulas entre <strong style={{color:"#06b6d4"}}>{fmtDate(wkStart)}</strong> e <strong style={{color:"#06b6d4"}}>{fmtDate(wkEnd)}</strong>:
              </p>
              {turmasNoIntervalo.length === 0 ? (
                <p style={{ color:"#64748b", fontSize:12, textAlign:"center", padding:8, margin:0 }}>Nenhuma turma nessa semana.</p>
              ) : (
                <div style={{ maxHeight:200, overflowY:"auto" }}>
                  {turmasNoIntervalo.map(name => {
                    const isSel = selected.includes(name);
                    return (
                      <div key={name} onClick={() => toggle(name)}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:6, cursor:"pointer", background: isSel ? "#06b6d420" : "transparent", marginBottom:4 }}>
                        <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${isSel ? "#06b6d4" : "#475569"}`, background: isSel ? "#06b6d4" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          {isSel && <Icon name="check" size={10} color="#fff" />}
                        </div>
                        <span style={{ color: isSel ? "#06b6d4" : "#e2e8f0", fontSize:12, fontWeight: isSel ? 700 : 500 }}>{name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {selected.length > 0 && (
                <p style={{ color:"#06b6d4", fontSize:11, margin:"8px 0 0" }}>
                  ✓ Instrutor e local poderão ser duplicados nas turmas vinculadas.
                </p>
              )}
            </div>
          );
        })()}
        <Btn onClick={initPlan}
          disabled={!wizForm.trainingId || !wizForm.className || !wizForm.date || !selTraining?.modules?.length}
          label="Gerar Planejamento Automático →" color="linear-gradient(135deg,#ffa619,#e8920a)" />
      </div>
      <DateGuardModal guard={dateGuard} setGuard={setDateGuard} user={user} />
      <EditGuardModal guard={editGuard} setGuard={setEditGuard} user={user} />
    </div>
  );

  // ── STEP 2: Plan editing with drag & drop ─────────────────────────────────
  const startMins = timeToMins(wizForm.startTime || "08:00");

  return (
    <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
      {splitSidebar}
      <div style={{ flex:1, minWidth:0 }}>
      {tabBarEl}
      <button onClick={() => setStep(1)} style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:14, marginBottom:20, padding:0 }}>
        <Icon name="back" size={18} color="#94a3b8" /> Voltar às Configurações
      </button>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:"#fff", fontWeight:800, margin:0, fontSize:22 }}>{wizForm.className}</h2>
          <p style={{ color:"#64748b", fontSize:13, margin:"4px 0 0" }}>
            {selTraining?.name} · {planItems.length} disciplina(s) · {planItems.reduce((a,i) => a + (i.slots?.length||1), 0)} slot(s) de instrutor · {Object.keys(planByDay).length} dia(s)
          </p>
        </div>
        {useDefault && <Btn onClick={() => {
          // Recalcular = re-rodar o planejamento automático seguindo a configuração
          // do treinamento E sugerindo instrutores diferentes da rodada anterior.
          // Datas customizadas via picker são descartadas por design.
          const prevIds = planItems.flatMap(p => (p.slots||[]).map(s => s.instructorId)).filter(Boolean);
          _doInitPlan({ varyInstructors: true, previousInstructorIds: prevIds });
        }} label="↺ Recalcular" color="#154753" sm />}
      </div>
      <p style={{ color:"#475569", fontSize:12, marginBottom:16 }}>
        {useDefault
          ? "⠿ Arraste para reordenar · Use o calendário em cada disciplina para mover para qualquer data (preserva horário) · ↺ Recalcular reorganiza tudo e sugere novos instrutores"
          : "⏰ Horário personalizado · Edite a data e o horário de cada disciplina manualmente · Não há quebra automática de almoço"}
      </p>

      {Object.entries(planByDay).sort(([a],[b])=>a.localeCompare(b)).map(([day, dayItems]) => (
        <div key={day} style={{ marginBottom:20 }}>
          <div style={{ padding:"8px 16px", background:"#01323d", borderRadius:"10px 10px 0 0", border:"1px solid #154753", borderBottom:"none" }}>
            <span style={{ color:"#ffa619", fontSize:13, fontWeight:700 }}>{fmtDate(day)}</span>
            <span style={{ color:"#64748b", fontSize:12, marginLeft:12 }}>{dayItems.length} disciplina(s)</span>
          </div>
          <div style={{ border:"1px solid #154753", borderTop:"none", borderRadius:"0 0 10px 10px", overflow:"hidden" }}>
            {dayItems.map((item, localIdx) => {
              const globalIdx = planItems.findIndex(p => p.uid === item.uid);
              const freshMod  = selTraining?.modules?.find(m => m.id === item.mod?.id) || item.mod;
              const localOpts = getLocalOpts(freshMod, selTraining);
              const itemStart = timeToMins(item.startTime);
              const itemEnd   = timeToMins(item.endTime);
              // Instrutores habilitados por competência: módulo ou TRADUTOR
              const _ativos = instructors.filter(i => i.status !== "Inativo" && i.type !== "moderador");
              const habilitados = item.mod
                ? _ativos.filter(i => (i.skills||[]).some(s => skillMatchesModule(s, item.mod)))
                : _ativos;
              const habilitadosTrad = _ativos.filter(i =>
                (i.skills||[]).some(s => (s.name||s) === TRANSLATOR_SKILL)
              );
              // Verifica ocupacao nos planItems atuais (outro slot no mesmo horario)
              const isOcupado = (instrId) => {
                return planItems.some(p => {
                  if (p.uid === item.uid) return false;
                  if (p.date !== item.date) return false;
                  const pStart = timeToMins(p.startTime);
                  const pEnd   = timeToMins(p.endTime);
                  if (itemStart >= pEnd || itemEnd <= pStart) return false;
                  return (p.slots||[]).some(s => String(s.instructorId) === String(instrId));
                });
              };
              const getOcupacaoLabel = (instrId) => {
                // Conflito dentro dos planItems da sessão atual
                const conflict = planItems.find(p => {
                  if (p.uid === item.uid) return false;
                  if (p.date !== item.date) return false;
                  const pStart = timeToMins(p.startTime);
                  const pEnd   = timeToMins(p.endTime);
                  if (itemStart >= pEnd || itemEnd <= pStart) return false;
                  return (p.slots||[]).some(s => String(s.instructorId) === String(instrId));
                });
                if (conflict) return `${conflict.mod?.name||""} · ${conflict.startTime}–${conflict.endTime}`;
                // Conflito em turma já salva — retorna o nome da turma
                const nS = timeToMins(item.startTime), nE = timeToMins(item.endTime);
                const schedRow = schedules.find(s =>
                  s.date === item.date &&
                  s.instructorId && +s.instructorId === +instrId &&
                  timeToMins(s.startTime) < nE && timeToMins(s.endTime) > nS
                );
                if (schedRow) return schedRow.className;
                return "";
              };
              const getFeriadoLabel = (instrId) => {
                const instr = instructors.find(x => String(x.id) === String(instrId));
                if (!instr) return null;
                const h = isHoliday(item.date, instr, holidays || []);
                return h ? h.name : null;
              };
              const isUnavail = (i) => isOcupado(i.id)
                || checkSlotConflict(item.date, item.startTime, item.endTime, String(i.id), null, null).instrConflict
                || isInstructorAbsent(i.id, item.date, itemStart, itemEnd, absences||[])
                || !!isHoliday(item.date, i, holidays||[]);
              const disponiveis = habilitados.filter(i => !isUnavail(i));
              const ocupados    = habilitados.filter(i =>  isUnavail(i));
              const qualInstr   = disponiveis; // mantém compatibilidade
              const disponiveisTrad = habilitadosTrad.filter(i => !isUnavail(i));
              const ocupadosTrad    = habilitadosTrad.filter(i =>  isUnavail(i));
              const isDraggingOver = dragOver === globalIdx;
              const slots = item.slots || [{ instructorId: item.instructorId||"", local: item.local||"" }];
              const _localCfl = !!(slots[0]?.local && checkSlotConflict(item.date, item.startTime, item.endTime, null, slots[0].local, null).localConflict);
              return (
                <div key={item.uid}
                  draggable
                  onDragStart={() => setDragIdx(globalIdx)}
                  onDragOver={e => { e.preventDefault(); setDragOver(globalIdx); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => { e.preventDefault(); setDragOver(null); if (dragIdx !== null && dragIdx !== globalIdx) reorder(dragIdx, globalIdx); setDragIdx(null); }}
                  style={{ display:"flex", alignItems:"stretch",
                    background: isDraggingOver ? "#1e5a6a" : localIdx%2===0 ? "#073d4a" : "#063540",
                    borderBottom: localIdx < dayItems.length-1 ? "1px solid #154753" : "none",
                    cursor:"grab", transition:"background 0.15s", opacity: dragIdx===globalIdx ? 0.5 : 1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", flex:1, minWidth:0 }}>
                    <span style={{ color:"#475569", fontSize:16, flexShrink:0, cursor:"grab" }}>⠿</span>
                    <div style={{ width: useDefault ? 80 : 130, flexShrink:0 }}>
                      {useDefault ? (
                        <span style={{ color:"#94a3b8", fontSize:11 }}>{item.startTime}–{item.endTime}</span>
                      ) : (
                        <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                          <input type="time" value={item.startTime||""} onChange={e => updatePlanItemField(item.uid, { startTime: e.target.value })}
                            style={{ width:60, padding:"3px 4px", background:"#01323d", border:"1px solid #154753", borderRadius:5, color:"#e2e8f0", fontSize:10, outline:"none" }} />
                          <span style={{ color:"#475569", fontSize:10 }}>–</span>
                          <input type="time" value={item.endTime||""} onChange={e => updatePlanItemField(item.uid, { endTime: e.target.value })}
                            style={{ width:60, padding:"3px 4px", background:"#01323d", border:"1px solid #154753", borderRadius:5, color:"#e2e8f0", fontSize:10, outline:"none" }} />
                        </div>
                      )}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ color:"#e2e8f0", fontSize:13, fontWeight:600, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.mod?.name}</p>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
                        <span style={{ padding:"1px 6px", borderRadius:4, background: item.mod?.type==="PRÁTICA" ? "#16a34a20":"#ffa61920", color: item.mod?.type==="PRÁTICA" ? "#16a34a":"#ffa619", fontSize:10, fontWeight:700 }}>{item.mod?.type||"TEORIA"}</span>
                        <span style={{ color:"#64748b", fontSize:11 }}>{item.startTime && item.endTime ? fmtMin(timeToMins(item.endTime) - timeToMins(item.startTime)) : ""}</span>
                        {slots.length > 1 && <span style={{ color:"#94a3b8", fontSize:10 }}>({slots.length} instrutores)</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", borderLeft:"1px solid #154753", flexShrink:0 }}>
                    {/* Toolbar: mover dia + −/+ assistentes + toggle tradutor */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:4, padding:"4px 10px", borderBottom:"1px solid #1e3e47" }}>
                      <input type="date"
                        title={useDefault ? "Mover este módulo para qualquer data" : "Data do módulo"}
                        value={item.date||""}
                        onChange={e => {
                          if (!e.target.value) return;
                          if (useDefault) movePlanToDay(item.uid, e.target.value);
                          else updatePlanItemField(item.uid, { date: e.target.value });
                        }}
                        style={{ fontSize:10, padding:"2px 4px", borderRadius:5, border:"1px solid #154753", background:"#01323d", color:"#94a3b8", cursor:"pointer", outline:"none" }} />
                      <div style={{ width:1, height:16, background:"#154753", margin:"0 2px" }} />
                      <button onClick={() => removeAssistant(item.uid)}
                        title="Remover assistente"
                        style={{ fontSize:12, fontWeight:700, width:22, height:22, borderRadius:5, cursor:"pointer", border:"1px solid #154753", background:"transparent", color:"#475569", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>−</button>
                      <span style={{ fontSize:10, color:"#475569", minWidth:16, textAlign:"center" }}>{(item.slots||[]).filter(s=>!s.isTranslator && s.role !== EAD_MODERATOR_ROLE).length}</span>
                      <button onClick={() => addAssistant(item.uid)}
                        title="Adicionar assistente"
                        style={{ fontSize:12, fontWeight:700, width:22, height:22, borderRadius:5, cursor:"pointer", border:"1px solid #154753", background:"transparent", color:"#475569", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>+</button>
                      <div style={{ width:1, height:16, background:"#154753", margin:"0 2px" }} />
                      <button onClick={() => deletePlanItem(item.uid)}
                        title="Excluir disciplina"
                        style={{ fontSize:11, fontWeight:700, width:22, height:22, borderRadius:5, cursor:"pointer", border:"1px solid #7f1d1d60", background:"transparent", color:"#ef4444", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>✕</button>
                      <div style={{ width:1, height:16, background:"#154753", margin:"0 4px" }} />
                      <button onClick={() => toggleTranslator(item.uid)}
                        title={item.hasTranslator ? "Remover slot de tradutor" : "Adicionar slot de tradutor"}
                        style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:5, cursor:"pointer", border: item.hasTranslator ? "1px solid #06b6d440" : "1px solid #154753", background: item.hasTranslator ? "#06b6d415" : "transparent", color: item.hasTranslator ? "#06b6d4" : "#475569" }}>
                        🌐 Trad.
                      </button>
                    </div>
                    {/* Local unico compartilhado por todos os instrutores */}
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderBottom:"1px solid #1e3e47" }}>
                      <div style={{ width:180 }}>
                        <select value={slots[0]?.local||""} onChange={e => { const arr=[...planItems]; const ns=slots.map(s=>({...s,local:e.target.value})); arr[globalIdx]={...arr[globalIdx],slots:ns}; setPlanItems(arr); }}
                          style={{ width:"100%", padding:"6px 8px", background:"#01323d", border:`1px solid ${_localCfl ? "#ef4444" : "#154753"}`, borderRadius:7, color: slots[0]?.local ? "#e2e8f0":"#475569", fontSize:12, outline:"none" }}>
                          <option value="">📍 Local...</option>
                          {(() => {
                            const nS = timeToMins(item.startTime), nE = timeToMins(item.endTime);
                            const getLocalCflClass = (name) => {
                              const row = schedules.find(s => s.date === item.date && s.local === name && timeToMins(s.startTime) < nE && timeToMins(s.endTime) > nS);
                              return row ? row.className : "";
                            };
                            const livres  = localOpts.filter(l => !checkSlotConflict(item.date, item.startTime, item.endTime, null, l.name, null).localConflict);
                            const ocupds  = localOpts.filter(l =>  checkSlotConflict(item.date, item.startTime, item.endTime, null, l.name, null).localConflict);
                            return (<>
                              {livres.map(l => <option key={l.id} value={l.name} style={{color:"#111"}}>{l.name}</option>)}
                              {ocupds.length > 0 && <>
                                <option value="" disabled>─── Ocupados ───</option>
                                {ocupds.map(l => {
                                  const lbl = getLocalCflClass(l.name);
                                  return <option key={l.id} value={l.name} style={{color:"#ef4444"}}>⚠ {l.name}{lbl ? ` · ${lbl}` : ""}</option>;
                                })}
                              </>}
                            </>);
                          })()}
                        </select>
                      </div>
                      {_localCfl && (() => {
                        const nS = timeToMins(item.startTime), nE = timeToMins(item.endTime);
                        const row = schedules.find(s => s.date === item.date && s.local === slots[0]?.local && timeToMins(s.startTime) < nE && timeToMins(s.endTime) > nS);
                        return <span style={{ color:"#ef4444", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>⚠ Ocupado{row ? ` · ${row.className}` : ""}</span>;
                      })()}
                    </div>
                    {/* Um seletor de instrutor por slot */}
                    {slots.map((slot, k) => {
                      if (slot.role === EAD_MODERATOR_ROLE) {
                        const _wzMods = (instructors||[]).filter(i => i.type === "moderador" && i.status !== "Inativo");
                        return (
                          <div key={k} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderBottom: k < slots.length-1 ? "1px solid #1e3e47" : "none" }}>
                            <span style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, padding:"2px 6px", borderRadius:4, background:"#0ea5e920", color:"#0ea5e9", border:"1px solid #0ea5e940", flexShrink:0 }}>💻 Moderador</span>
                            <div style={{ width:180 }}>
                              <select value={String(slot.instructorId||"")} onChange={e => { const arr=[...planItems]; const ns=[...slots]; ns[k]={...ns[k],instructorId:e.target.value}; arr[globalIdx]={...arr[globalIdx],slots:ns}; setPlanItems(arr); }}
                                style={{ width:"100%", padding:"6px 8px", background:"#0ea5e910", border:"1px solid #0ea5e940", borderRadius:7, color: slot.instructorId ? "#e2e8f0":"#475569", fontSize:12, outline:"none" }}>
                                <option value="">💻 Moderador EAD...</option>
                                {(() => {
                                  const _smW = String(slot.instructorId||"");
                                  if (!_smW || _wzMods.some(i => String(i.id) === _smW)) return null;
                                  const _miW = (instructors||[]).find(i => String(i.id) === _smW);
                                  return <option value={_smW} disabled style={{color:"#94a3b8"}}>{_miW ? `${_miW.status === "Inativo" ? "⛔ " : ""}${_miW.name}${_miW.status === "Inativo" ? " · Inativo" : ""}` : `Moderador removido (#${_smW})`}</option>;
                                })()}
                                {_wzMods.map(i => <option key={i.id} value={i.id} style={{color:"#111"}}>{i.name}</option>)}
                              </select>
                            </div>
                          </div>
                        );
                      }
                      return (
                      <div key={k} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderBottom: k < slots.length-1 ? "1px solid #1e3e47" : "none" }}>
                        {(() => {
                          const nonTrad = slots.filter(s => !s.isTranslator);
                          const ntIdx = slot.isTranslator ? -1 : nonTrad.indexOf(slot);
                          const chip = getSlotChip(slot, ntIdx, item.mod, selTraining);
                          // Camada A3 — chip editável + removível em módulos HUET (exceto tradutor)
                          const _huetRemovable = isHuetModule(item.mod) && !slot.isTranslator;
                          if (_huetRemovable) {
                            const _removeSlot = () => {
                              const arr = [...planItems];
                              const ns  = slots.filter((_, j) => j !== k);
                              arr[globalIdx] = { ...arr[globalIdx], slots: ns };
                              setPlanItems(arr);
                            };
                            const _changeRole = (roleCode) => {
                              const arr = [...planItems]; const ns = [...slots];
                              ns[k] = { ...ns[k], role: roleCode };
                              arr[globalIdx] = { ...arr[globalIdx], slots: ns };
                              setPlanItems(arr);
                            };
                            return (
                              <span style={{ display:"inline-flex", alignItems:"center", gap:0, borderRadius:4, background:chip.bg, border:chip.border, flexShrink:0, overflow:"hidden" }}>
                                <select value={slot.role || chip.label} onChange={e => _changeRole(e.target.value)}
                                  title="Alterar papel deste slot"
                                  style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, padding:"2px 4px", background:"transparent", color:chip.color, border:"none", outline:"none", cursor:"pointer", minWidth:chip.minWidth }}>
                                  {POOL_TEAM_ROLES.map((r, ri) => <option key={ri} value={r.code} style={{ color:"#111", background:"#0a2a33", fontWeight:700 }}>{r.code}</option>)}
                                </select>
                                <button onClick={_removeSlot} title={`Remover ${chip.label} deste módulo`} style={{ background:"none", border:"none", borderLeft:`1px solid ${chip.color}40`, color:chip.color, padding:"2px 5px", cursor:"pointer", fontSize:11, lineHeight:1, fontWeight:700 }}>×</button>
                              </span>
                            );
                          }
                          return <span style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, minWidth:chip.minWidth, textAlign:"center", padding:"2px 4px", borderRadius:4, background:chip.bg, color:chip.color, border:chip.border, flexShrink:0 }}>{chip.label}</span>;
                        })()}
                        {(() => {
                          const _instrCfl = !!(slot.instructorId && checkSlotConflict(item.date, item.startTime, item.endTime, slot.instructorId, null, null).instrConflict);
                          return (<>
                            <div style={{ width:180 }}>
                              <select value={slot.instructorId} onChange={e => { const arr=[...planItems]; const ns=[...slots]; ns[k]={...ns[k],instructorId:e.target.value}; arr[globalIdx]={...arr[globalIdx],slots:ns}; setPlanItems(arr); }}
                                style={{ width:"100%", padding:"6px 8px", background: slot.isTranslator ? "#06b6d410" : "#01323d", border:`1px solid ${_instrCfl ? "#ef4444" : slot.isTranslator ? "#06b6d440" : "#154753"}`, borderRadius:7, color: slot.instructorId ? "#e2e8f0":"#475569", fontSize:12, outline:"none" }}>
                                <option value="">{slot.isTranslator ? "🌐 Tradutor..." : "👤 Instrutor..."}</option>
                                {(() => {
                                  const otherSelected = slots.filter((_,j) => j!==k && !slots[j].isTranslator).map(s=>s.instructorId).filter(Boolean);
                                  const _nonTradS2 = slots.filter(s => !s.isTranslator);
                                  const _ntIdxS2 = slot.isTranslator ? -1 : _nonTradS2.indexOf(slot);
                                  const _prS2 = item.mod && isHuetModule(item.mod) && _ntIdxS2 >= 0
                                    ? (slot.role ? POOL_TEAM_ROLES.find(r => r.code === slot.role) : getPoolTeamRole(_ntIdxS2))
                                    : null;
                                  let pool, poolOcp;
                                  if (slot.isTranslator) {
                                    pool = disponiveisTrad; poolOcp = ocupadosTrad;
                                  } else if (_prS2) {
                                    const _rf2 = (i) => hasValidCompetency(i, _prS2.requiresCompetency) && (!_prS2.requiresDisciplineSkill || (i.skills||[]).some(s => skillMatchesModule(s, item.mod))) && (_prS2.code !== "Lead Instructor" || (i.skills||[]).some(s => skillMatchesModule(s, item.mod) && s.canLead));
                                    pool = disponiveis.filter(i => !otherSelected.includes(String(i.id)) && _rf2(i));
                                    poolOcp = ocupados.filter(i => !otherSelected.includes(String(i.id)) && _rf2(i));
                                  } else if (_ntIdxS2 === 0 && item.mod) {
                                    const _lf2 = (i) => (i.skills||[]).some(s => skillMatchesModule(s, item.mod) && s.canLead);
                                    pool = disponiveis.filter(i => !otherSelected.includes(String(i.id)) && _lf2(i));
                                    poolOcp = ocupados.filter(i => !otherSelected.includes(String(i.id)) && _lf2(i));
                                  } else {
                                    pool = disponiveis.filter(i => !otherSelected.includes(String(i.id)));
                                    poolOcp = ocupados.filter(i => !otherSelected.includes(String(i.id)));
                                  }
                                  // Mesma proteção da grade de edição: valor atribuído fora do pool
                                  // (ex.: instrutor inativado) ganha opção pinada em vez de placeholder.
                                  const _selIdW = String(slot.instructorId||"");
                                  const _selMissW = _selIdW && ![...pool, ...poolOcp].some(i => String(i.id) === _selIdW);
                                  const _selInstrW = _selMissW ? (instructors||[]).find(i => String(i.id) === _selIdW) : null;
                                  return (<>
                                    {_selMissW && (
                                      <option value={_selIdW} disabled style={{color:"#94a3b8"}}>
                                        {_selInstrW ? `${_selInstrW.status === "Inativo" ? "⛔ " : ""}${_selInstrW.name}${_selInstrW.status === "Inativo" ? " · Inativo" : ""}` : `Instrutor removido (#${_selIdW})`}
                                      </option>
                                    )}
                                    <option value="" disabled>— {pool.length} disponível(eis) —</option>
                                    {pool.map(i => <option key={i.id} value={i.id} style={{color:"#111"}}>{i.name}</option>)}
                                    {poolOcp.length > 0 && <>
                                      <option value="" disabled>─── Indisponíveis ───</option>
                                      {poolOcp.map(i => {
                                        const feriado = getFeriadoLabel(i.id);
                                        return feriado
                                          ? <option key={i.id} value={i.id} style={{color:"#06b6d4"}}>🏖 {i.name} · {feriado}</option>
                                          : <option key={i.id} value={i.id} style={{color:"#ef4444"}}>⚠ {i.name} · {getOcupacaoLabel(i.id)}</option>;
                                      })}
                                    </>}
                                  </>);
                                })()}
                              </select>
                            </div>
                            {_instrCfl && (() => {
                              const lbl = getOcupacaoLabel(slot.instructorId);
                              return <span style={{ color:"#ef4444", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>⚠ Ocupado{lbl ? ` · ${lbl}` : ""}</span>;
                            })()}
                            {!slot.instructorId && !_instrCfl && (slot.isTranslator ? disponiveisTrad : disponiveis).length === 0 && (
                              <span style={{ color:"#ef4444", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>⚠ Indisponível</span>
                            )}
                            {/* Botão cross-base: aparece quando não há instrutores disponíveis e o slot não é tradutor */}
                            {!slot.isTranslator && !slot.instructorId && disponiveis.length === 0 && setCrossbaseRequests && viewBase && PHYSICAL_BASES.includes(viewBase) && (() => {
                              const otherBase = PHYSICAL_BASES.find(b => b !== viewBase);
                              return (
                                <button onClick={() => setCrossbaseModal({ item, targetBase: otherBase })}
                                  title={`Solicitar instrutor da base ${otherBase}`}
                                  style={{ padding:"2px 8px", borderRadius:6, border:"1px solid #3b82f640", background:"#3b82f615", color:"#60a5fa", fontSize:10, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                                  🔀 Pedir da {otherBase}
                                </button>
                              );
                            })()}
                            {/* Camada B3 — Validação suave HUET: instrutor sem competência exigida */}
                            {!_instrCfl && slot.instructorId && !slot.isTranslator && isHuetModule(item.mod) && (() => {
                              const _nonTrad = slots.filter(s => !s.isTranslator);
                              const _ntIdx = _nonTrad.indexOf(slot);
                              const _role = getPoolTeamRole(_ntIdx);
                              if (!_role) return null;
                              const _instr = instructors.find(i => String(i.id) === String(slot.instructorId));
                              if (!_instr || hasValidCompetency(_instr, _role.requiresCompetency)) return null;
                              const _compLbl = (getSpecialCompetency(_role.requiresCompetency) || {}).label || _role.requiresCompetency;
                              return <span title={`Instrutor sem competência ${_compLbl} cadastrada/válida`} style={{ color:"#f59e0b", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>⚠ Sem {_compLbl}</span>;
                            })()}
                          </>);
                        })()}
                      </div>
                    ); })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {(() => {
        const semTrad      = planItems.filter(i => i.hasTranslator && (i.slots||[]).some(s => s.isTranslator && !s.instructorId));
        const semInstrutor = planItems.filter(i => (i.slots||[]).some(s => !s.isTranslator && s.role !== EAD_MODERATOR_ROLE && !s.instructorId));
        const semLocal     = planItems.filter(i => (i.slots||[]).some(s => !s.local));
        const temErro      = semTrad.length > 0 || semInstrutor.length > 0 || semLocal.length > 0;
        return (
          <>
            {semTrad.length > 0 && (
              <div style={{ padding:"10px 16px", background:"#ef444420", border:"1px solid #ef444440", borderRadius:10, marginBottom:10 }}>
                <span style={{ color:"#ef4444", fontSize:13 }}>⛔ {semTrad.length} disciplina(s) requer(em) tradutor obrigatório não atribuído. Atribua um tradutor ou desative o slot 🌐.</span>
              </div>
            )}
            {semInstrutor.length > 0 && (
              <div style={{ padding:"10px 16px", background:"#ef444420", border:"1px solid #ef444440", borderRadius:10, marginBottom:10 }}>
                <span style={{ color:"#ef4444", fontSize:13 }}>⛔ {semInstrutor.length} disciplina(s) sem instrutor atribuído. Obrigatório para salvar.</span>
              </div>
            )}
            {semLocal.length > 0 && (
              <div style={{ padding:"10px 16px", background:"#ef444420", border:"1px solid #ef444440", borderRadius:10, marginBottom:10 }}>
                <span style={{ color:"#ef4444", fontSize:13 }}>⛔ {semLocal.length} disciplina(s) sem local atribuído. Obrigatório para salvar.</span>
              </div>
            )}
            <div style={{ display:"flex", gap:8 }}>
              <Btn onClick={() => setNotifyModal(true)} disabled={temErro} label="✓ Confirmar e Salvar Planejamento" color={temErro ? "#154753" : "linear-gradient(135deg,#16a34a,#15803d)"} />
              <Btn onClick={closeActiveTab} label="Cancelar" color="#154753" />
            </div>
          </>
        );
      })()}
      {notifyModal && (
        <Modal title="Salvar Programacao" onClose={() => setNotifyModal(false)} width={420}>
          <p style={{ color:"#94a3b8", fontSize:14, marginBottom:20 }}>Deseja notificar os instrutores sobre esta programacao?</p>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <Btn onClick={() => { setNotifyModal(false); savePlan(); }} label="Salvar e notificar instrutores" icon="check" color="#16a34a" />
            <Btn onClick={() => { setNotifyModal(false); window.__skipNextNotifications(); savePlan(); }} label="Salvar sem notificar" color="#154753" />
          </div>
        </Modal>
      )}
      {notifyEditModal && (
        <Modal title="Salvar Alterações da Turma" onClose={() => setNotifyEditModal(false)} width={420}>
          <p style={{ color:"#94a3b8", fontSize:14, marginBottom:20 }}>Deseja notificar os instrutores sobre as alterações nesta turma?</p>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <Btn onClick={() => { setNotifyEditModal(false); saveEditItems(); }} label="Salvar e notificar instrutores" icon="check" color="#16a34a" />
            <Btn onClick={() => { setNotifyEditModal(false); window.__skipNextNotifications(); saveEditItems(); }} label="Salvar sem notificar" color="#154753" />
          </div>
        </Modal>
      )}
      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
      <DateGuardModal guard={dateGuard} setGuard={setDateGuard} user={user} />
      <EditGuardModal guard={editGuard} setGuard={setEditGuard} user={user} />
      <ConflictModal guard={conflictGuard} setGuard={setConflictGuard} />

      {/* Modal de requisição cross-base */}
      {crossbaseModal && (
        <Modal title={`Solicitar instrutor da base ${crossbaseModal.targetBase}`} onClose={() => setCrossbaseModal(null)} width={460}>
          <p style={{ color:"#94a3b8", fontSize:13, marginBottom:12 }}>
            Cria uma requisição para a base <strong style={{ color:"#ffa619" }}>{crossbaseModal.targetBase}</strong> indicar um instrutor disponível para:
          </p>
          <div style={{ background:"#01323d", borderRadius:8, padding:"10px 14px", marginBottom:16, border:"1px solid #154753" }}>
            <p style={{ color:"#e2e8f0", fontWeight:700, margin:"0 0 4px", fontSize:14 }}>{crossbaseModal.item?.mod?.name || "—"}</p>
            <p style={{ color:"#94a3b8", fontSize:12, margin:0 }}>{crossbaseModal.item?.date || ""} · {crossbaseModal.item?.startTime || ""}–{crossbaseModal.item?.endTime || ""}</p>
          </div>
          <p style={{ color:"#64748b", fontSize:12, marginBottom:16 }}>
            A requisição ficará visível em <strong>Comunicação → Req. de Escala</strong> para os planejadores da base {crossbaseModal.targetBase}.
          </p>
          <div style={{ display:"flex", gap:8 }}>
            <Btn label="Enviar Requisição" color="#3b82f6" onClick={() => {
              if (!setCrossbaseRequests) { setCrossbaseModal(null); return; }
              const item = crossbaseModal.item;
              const req = {
                id: Date.now(),
                requestingBase: viewBase,
                targetBase: crossbaseModal.targetBase,
                className: item?.className || wizForm?.className || editCls || "",
                trainingName: item?.trainingName || selTraining?.name || "",
                moduleName: item?.mod?.name || "",
                date: item?.date || "",
                startTime: item?.startTime || "",
                endTime: item?.endTime || "",
                requestedAt: new Date().toISOString(),
                requestedBy: user?.name || "",
                status: "pending",
                selectedInstructorId: null,
                selectedInstructorName: null,
              };
              setCrossbaseRequests(prev => [...(prev || []), req]);
              setCrossbaseModal(null);
            }} />
            <Btn label="Cancelar" color="#154753" onClick={() => setCrossbaseModal(null)} />
          </div>
        </Modal>
      )}
      </div>
    </div>
  );
};

