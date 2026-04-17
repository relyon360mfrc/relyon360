// ── SCHEDULE ──────────────────────────────────────────────────────────────────
const Schedule = ({ schedules, setSchedules, trainings, areas, user, instructors, absences, scheduleTabs, setScheduleTabs, activeTabId, setActiveTabId }) => {

  // ── Time helpers ─────────────────────────────────────────────────────────
  const minsToTime = m => { const mm = Math.max(0, m); return `${String(Math.floor(mm/60)).padStart(2,"0")}:${String(mm%60).padStart(2,"0")}`; };
  const addDays = (ds, n) => { const d = new Date(ds+"T12:00:00"); d.setDate(d.getDate()+n); return d.toISOString().split("T")[0]; };
  const fmtDate = ds => ds ? new Date(ds+"T12:00:00").toLocaleDateString("pt-BR", { weekday:"short", day:"2-digit", month:"short" }) : "";

  const sortModules = mods => {
    if (!mods || !mods.length) return [];
    const isReserva = m => /TEMPO\s*RESERVA/i.test(m.name);
    const isProva   = m => /\bPROVA\b/i.test(m.name) && !isReserva(m);
    const regular = mods.filter(m => !isProva(m) && !isReserva(m));
    regular.sort((a,b) => {
      const at = /CBINC/i.test(a.name), bt = /CBINC/i.test(b.name);
      if (at && bt) { if (a.type==="TEORIA" && b.type==="PRÁTICA") return -1; if (a.type==="PRÁTICA" && b.type==="TEORIA") return 1; }
      return (a.priority||99)-(b.priority||99);
    });
    return [...regular, ...mods.filter(isProva), ...mods.filter(isReserva)];
  };

  const recalcTimes = (items, startDateStr, startMins) => {
    // Regra: 08:00-12:00 manha · 13:00-17:00 tarde · quebra nos dias seguintes
    const LUNCH_S = 12*60, LUNCH_E = 13*60, DAY_END = 17*60, DAY_START = 8*60;
    const USEFUL_MINS = (LUNCH_S - DAY_START) + (DAY_END - LUNCH_E); // 480 min uteis por dia
    let curDate = startDateStr, cur = startMins;
    const result = [];
    for (const item of items) {
      let remaining = item.mod?.minutes || 60;
      let isFirst = true;
      while (remaining > 0) {
        // Pular almoco se estamos nele
        if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
        // Se ja passamos do fim do dia, avancar para proximo dia
        if (cur >= DAY_END) { curDate = addDays(curDate, 1); cur = DAY_START; }
        // Calcular quanto cabe no periodo atual (manha ou tarde)
        let periodEnd = cur < LUNCH_S ? LUNCH_S : DAY_END;
        let available = periodEnd - cur;
        if (available <= 0) {
          // Pular para proximo periodo
          if (cur < LUNCH_E) { cur = LUNCH_E; periodEnd = DAY_END; available = DAY_END - LUNCH_E; }
          else { curDate = addDays(curDate, 1); cur = DAY_START; periodEnd = LUNCH_S; available = LUNCH_S - DAY_START; }
        }
        const chunk = Math.min(remaining, available);
        const endM = cur + chunk;
        if (isFirst) {
          // Primeira parte do modulo: usa o item original
          result.push({ ...item, date: curDate, startTime: minsToTime(cur), endTime: minsToTime(endM) });
          isFirst = false;
        } else {
          // Partes seguintes: mesmo modulo, novo dia
          result.push({ ...item, id: item.id + '_' + curDate, date: curDate, startTime: minsToTime(cur), endTime: minsToTime(endM) });
        }
        remaining -= chunk;
        cur = endM;
        // Pular almoco apos bloco
        if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
        if (cur >= DAY_END && remaining > 0) { curDate = addDays(curDate, 1); cur = DAY_START; }
      }
    }
    return result;
  };

  const getLocalOpts = (mod, training) => {
    if (!mod) return LOCALS;
    // Se o modulo tem locals cadastrados, usa apenas esses
    if (mod.locals && mod.locals.length > 0) {
      return LOCALS.filter(l => mod.locals.includes(l.name));
    }
    // Fallback: filtra por tipo e area
    const area = areas.find(a => a.id === training?.area);
    const isCbinc = area && /CBINC|INCENDIO|INCÊNDIO/i.test(area.name);
    return LOCALS.filter(l => {
      if (mod.type === "TEORIA") return l.env === "Teórico";
      if (mod.type === "PRÁTICA") {
        if (isCbinc) return l.subtype === "incendio";
        return l.env === "Prático";
      }
      return true;
    });
  };

  // ── List-view state (local to Schedule mount) ────────────────────────────
  const [viewMode,    setViewMode]    = useState("list");
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [search,      setSearch]      = useState("");
  const [expandCls,   setExpandCls]   = useState({});
  const [delGuard,    setDelGuard]    = useState({ show: false, action: null, pass: "", err: "" });
  const [conflictGuard, setConflictGuard] = useState({ show: false, conflicts: [], onConfirm: null });
  const askDelete = (fn, archived) => setDelGuard({ show: true, action: fn, pass: "", err: "", archived: !!archived });
  // Drag state (ephemeral, no need to persist in tab)
  const [dragIdx,     setDragIdx]     = useState(null);
  const [dragOver,    setDragOver]    = useState(null);
  const [dragEditId,  setDragEditId]  = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [splitMode,   setSplitMode]   = useState(() => sessionStorage.getItem('relyon_splitMode') === '1');
  const toggleSplit   = () => setSplitMode(p => { const n=!p; sessionStorage.setItem('relyon_splitMode', n?'1':'0'); return n; });

  // ── Tab-based state ───────────────────────────────────────────────────────
  const BLANK_WIZ = { trainingId:"", className:"", date:"", startTime:"08:00", studentCount:"", observation:"", withTranslator:false };
  const activeTab = scheduleTabs.find(t => t.id === activeTabId);
  const step = activeTab ? (activeTab.step || 1) : 0;
  const setStep = v => setScheduleTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, step: v } : t));
  const { wizForm=BLANK_WIZ, planItems=[], editCls=null, editStudentCount="", editObservation="", editItems=[] } = activeTab || {};
  const updTab = patch => setScheduleTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...patch } : t));
  const setWizForm          = v => updTab({ wizForm:          typeof v === 'function' ? v(wizForm)          : v });
  const setPlanItems        = v => updTab({ planItems:        typeof v === 'function' ? v(planItems)        : v });
  const setEditCls          = v => updTab({ editCls:          v });
  const setEditStudentCount = v => updTab({ editStudentCount: v });
  const setEditObservation  = v => updTab({ editObservation:  v });
  const setEditItems        = v => updTab({ editItems:        typeof v === 'function' ? v(editItems)        : v });
  const closeActiveTab = () => { setScheduleTabs(prev => prev.filter(t => t.id !== activeTabId)); setActiveTabId(null); };
  const openNewTab = () => {
    if (scheduleTabs.length >= 5) { alert("Limite de 5 abas atingido. Feche uma aba para abrir outra."); return; }
    const id = Date.now();
    setScheduleTabs(prev => [...prev, { id, title:"Nova Turma", step:1, wizForm:BLANK_WIZ, planItems:[], editCls:null, editStudentCount:"", editObservation:"", editItems:[] }]);
    setActiveTabId(id);
  };

  const selTraining = trainings.find(t => t.id === +wizForm.trainingId);
  const useDefault  = selTraining?.defaultSchedule !== false;

  // ── Edit mode helpers ────────────────────────────────────────────────────
  const applyDaySchedule = (items) => {
    if (!items.length) return items;
    const LUNCH_S = 12*60, LUNCH_E = 13*60, DAY_END = 17*60, DAY_START = 8*60;
    let curDate = items[0].date, cur = DAY_START;
    const result = [];
    for (const item of items) {
      let remaining = item._minutes || 60;
      let isFirst = true;
      while (remaining > 0) {
        if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
        if (cur >= DAY_END) { curDate = addDays(curDate, 1); cur = DAY_START; }
        let periodEnd = cur < LUNCH_S ? LUNCH_S : DAY_END;
        let available = periodEnd - cur;
        if (available <= 0) {
          if (cur < LUNCH_E) { cur = LUNCH_E; periodEnd = DAY_END; available = DAY_END - LUNCH_E; }
          else { curDate = addDays(curDate, 1); cur = DAY_START; periodEnd = LUNCH_S; available = LUNCH_S - DAY_START; }
        }
        const chunk = Math.min(remaining, available);
        const endM = cur + chunk;
        if (isFirst) {
          result.push({ ...item, date: curDate, startTime: minsToTime(cur), endTime: minsToTime(endM) });
          isFirst = false;
        } else {
          result.push({ ...item, id: item.id + '_' + curDate, date: curDate, startTime: minsToTime(cur), endTime: minsToTime(endM) });
        }
        remaining -= chunk;
        cur = endM;
        if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
        if (cur >= DAY_END && remaining > 0) { curDate = addDays(curDate, 1); cur = DAY_START; }
      }
    }
    return result;
  };

  const loadClassForEdit = (cls) => {
    const existingTab = scheduleTabs.find(t => t.editCls === cls);
    if (existingTab) { setActiveTabId(existingTab.id); return; }
    if (scheduleTabs.length >= 5) { alert("Limite de 5 abas atingido. Feche uma aba para abrir outra."); return; }
    const rows = schedules.filter(s => s.className === cls)
      .slice().sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime));
    const trainingId = rows[0]?.trainingId;
    const training = trainings.find(t => t.id === trainingId);
    const grouped = [];
    rows.forEach(r => {
      const existing = grouped.find(g =>
        g.module === r.module &&
        g.date === r.date &&
        g.startTime === r.startTime &&
        g.endTime === r.endTime
      );
      if (existing) {
        existing.slots = [...(existing.slots||[{ instructorId: String(existing.instructorId||""), local: existing.local||"" }]),
          { instructorId: String(r.instructorId||""), local: r.local||"" }];
      } else {
        grouped.push({ ...r, slots: [{ instructorId: String(r.instructorId||""), local: r.local||"" }] });
      }
    });
    const enriched = grouped.map(r => {
      const mod = training?.modules?.find(m => m.name === r.module);
      const rawDur = timeToMins(r.endTime) - timeToMins(r.startTime);
      const lunchOverlap = Math.max(0, Math.min(timeToMins(r.endTime), 13*60) - Math.max(timeToMins(r.startTime), 12*60));
      const dur = mod?.minutes || Math.max(30, rawDur - lunchOverlap);
      return { ...r, _minutes: dur, mod: mod || { name: r.module, type: r.role?.includes("Practical") ? "PRÁTICA" : "TEORIA", minutes: dur } };
    });
    const id = Date.now();
    setScheduleTabs(prev => [...prev, { id, title: cls, step: 3, wizForm: BLANK_WIZ, planItems: [], editCls: cls, editStudentCount: rows[0]?.studentCount || "", editObservation: rows[0]?.observation || "", editItems: enriched }]);
    setActiveTabId(id);
  };

  const recalcEdit = () => {
    const sorted = [...editItems].sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)
    );
    setEditItems(applyDaySchedule(sorted));
  };

  const reorderEdit = (fromId, toId) => {
    const arr = [...editItems];
    const fi = arr.findIndex(i => i.id === fromId);
    const ti = arr.findIndex(i => i.id === toId);
    if (fi < 0 || ti < 0 || fi === ti) return;
    const [item] = arr.splice(fi, 1);
    arr.splice(ti, 0, item);
    setEditItems(applyDaySchedule(arr));
  };

  const moveToDay = (itemId, targetDay) => {
    const item = editItems.find(i => i.id === itemId);
    if (!item) return;
    const others = editItems.filter(i => i.id !== itemId);
    const lastInDayIdx = [...others].map((x,idx) => x.date === targetDay ? idx : -1).filter(x => x >= 0).pop();
    const insertIdx = lastInDayIdx !== undefined ? lastInDayIdx + 1 : (others.findIndex(i => i.date > targetDay) >= 0 ? others.findIndex(i => i.date > targetDay) : others.length);
    const arr = [...others];
    arr.splice(insertIdx, 0, { ...item, date: targetDay });
    setEditItems(applyDaySchedule(arr));
  };

  // ── CONFLICT DETECTION ────────────────────────────────────────────────────
  // Detecta, para cada nova linha, se há outra linha já agendada no mesmo
  // horário (sobreposição) com mesmo instrutor OU mesmo local.
  // excludeClassName: ignora linhas da turma que está sendo editada.
  const detectConflicts = (newRows, excludeClassName) => {
    const conflicts = [];
    const existing = schedules.filter(s =>
      !excludeClassName || s.className !== excludeClassName
    );
    newRows.forEach(nr => {
      if (!nr.date || !nr.startTime || !nr.endTime) return;
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

  const confirmConflicts = (conflicts, onConfirm) => {
    if (!conflicts.length) { onConfirm(); return; }
    setConflictGuard({ show: true, conflicts, onConfirm });
  };

  const saveEditItems = () => {
    // Expandir slots de volta para uma linha por instrutor
    const rows = editItems.flatMap(({ _minutes, mod, slots, ...item }) => {
      const itemSlots = slots || [{ instructorId: String(item.instructorId||""), local: item.local||"" }];
      const nonTrad = itemSlots.filter(s => !s.isTranslator);
      return itemSlots.map((slot, si) => {
        const instr = instructors.find(i => String(i.id) === String(slot.instructorId));
        const ntIdx = nonTrad.indexOf(slot);
        const modType = (item.role||"").includes("Practical") || (item.module||"").includes("PRÁTICA") ? "PRÁTICA" : "TEORIA";
        const slotRole = slot.isTranslator ? "Translator"
          : ntIdx === 0 ? (modType === "PRÁTICA" ? "Practical Instructor" : "Theoretical Instructor")
          : "Assistant Instructor";
        return {
          ...item,
          id: si === 0 ? item.id : Date.now() + Math.random(),
          instructorId: +slot.instructorId || null,
          instructorName: instr?.name || "",
          local: slot.local || "",
          role: slotRole,
          studentCount: editStudentCount || item.studentCount || "",
          observation: editObservation || item.observation || "",
        };
      });
    });
    const conflicts = detectConflicts(rows, editCls);
    confirmConflicts(conflicts, () => {
      setSchedules([...schedules.filter(s => s.className !== editCls), ...rows]);
      closeActiveTab();
    });
  };

  const isRevisao   = name => /REVIS[ÃA]O/i.test(name);
  const isProva     = name => /PROVA/i.test(name) && !/TEMPO\s*RESERVA/i.test(name);
  const isReserva   = name => /TEMPO\s*RESERVA/i.test(name);

  const initPlan = () => {
    if (!selTraining || !wizForm.date) return;
    const todayIso = new Date().toISOString().split("T")[0];
    if (wizForm.date < todayIso) {
      alert("Não é possível criar uma programação com data de início no passado.");
      return;
    }
    // Deduplica módulos pelo id antes de gerar o plano (evita duplicatas de cadastro)
    const seenIds = new Set();
    const uniqueModules = (selTraining.modules || []).filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
    const sorted = sortModules(uniqueModules);
    const startMins = timeToMins(wizForm.startTime || "08:00");

    // Score: quantos módulos deste treinamento cada instrutor pode ministrar
    const instrScore = {};
    sorted.forEach(mod => {
      instructors.filter(i => (i.skills||[]).some(s => (s.name||s) === mod.name)).forEach(i => {
        instrScore[i.id] = (instrScore[i.id]||0) + 1;
      });
    });

    // Passo 1: calcular horários (1 item por módulo)
    const moduleItems = sorted.map((mod, i) => ({ uid: `pi-${i}-${mod.id}`, mod, instructorId: "", local: "" }));
    const timed = recalcTimes(moduleItems, wizForm.date, startMins);

    // Passo 2: atribuir instrutores e locais
    // preferredLocals usa mod.id como chave — cada módulo mantém seu próprio local preferido
    // (antes usava mod.type, o que causava compartilhamento indevido entre PRÁTICA de cenários
    // diferentes como piscina vs. incêndio — ver SPEC §4.4)
    const preferredLocals = {}; // mod.id → local-name
    const committedInstrs = []; // instrutores já escolhidos para este treinamento (em ordem de prioridade)

    const raw = timed.map((timedItem, idx) => {
      const mod = timedItem.mod;
      const count = mod.instructorCount || 1;
      const localOpts = getLocalOpts(mod, selTraining);

      const estStart = timeToMins(timedItem.startTime);
      const estEnd   = timeToMins(timedItem.endTime);
      // Qualificados para esta disciplina (têm a skill + não estão ausentes), ordenados por score
      const qualified = instructors.filter(i =>
        (i.skills||[]).some(s => (s.name||s) === mod.name) &&
        !isInstructorAbsent(i.id, timedItem.date, estStart, estEnd, absences||[])
      ).sort((a,b) => (instrScore[b.id]||0) - (instrScore[a.id]||0));

      // Pool de Leads: qualificados que têm canLead:true para esta disciplina específica
      // Se ninguém tiver canLead marcado, o Slot 0 aceita qualquer qualificado (fallback)
      const leadPool = qualified.filter(q =>
        (q.skills||[]).some(s => (s.name||s) === mod.name && s.canLead)
      );

      // Atribuição slot a slot
      // Slot 0 (Lead)  → leadPool (committed > não-committed); se leadPool vazio → fallback para qualified
      // Slots 1+ (Assist.) → qualified (committed > não-committed)
      const assignedIds = [];
      for (let k = 0; k < count; k++) {
        const pool = k === 0 ? leadPool : qualified;
        const pick =
          pool.find(q => committedInstrs.includes(q.id) && !assignedIds.includes(q.id)) ||
          pool.find(q => !assignedIds.includes(q.id));
        if (pick) {
          assignedIds.push(pick.id);
          if (!committedInstrs.includes(pick.id)) committedInstrs.push(pick.id);
        }
      }

      // Slots: um por vaga de instrutor (instructorCount)
      // Local único para toda a equipe — mesmo cenário para todos os instrutores do mesmo módulo
      let sharedLocal;
      const prev = preferredLocals[mod.id];
      if (prev && localOpts.some(l => l.name === prev)) {
        sharedLocal = prev;
      } else {
        sharedLocal = localOpts[0]?.name || "";
        preferredLocals[mod.id] = sharedLocal;
      }
      const slots = [];
      for (let k = 0; k < count; k++) {
        slots.push({ instructorId: assignedIds[k] != null ? String(assignedIds[k]) : "", local: sharedLocal });
      }

      // Slot de tradutor: sempre vazio (escolha manual), mesmo local do módulo
      const hasTranslator = !!wizForm.withTranslator;
      if (hasTranslator) slots.push({ instructorId: "", local: sharedLocal, isTranslator: true });
      return { ...timedItem, uid: `pi-${idx}-${mod.id}`, slots, hasTranslator };
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

  const reorder = (from, to) => {
    if (from === to) return;
    const arr = [...planItems];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    const startMins = timeToMins(wizForm.startTime || "08:00");
    setPlanItems(recalcTimes(arr, wizForm.date, startMins));
  };

  // Move um item do wizard para outro dia
  const movePlanToDay = (uid, targetDate) => {
    if (!targetDate) return;
    const fromIdx = planItems.findIndex(p => p.uid === uid);
    if (fromIdx < 0) return;
    const arr = [...planItems];
    const [item] = arr.splice(fromIdx, 1);
    const lastInDay = arr.reduce((last, p, i) => p.date === targetDate ? i : last, -1);
    const insertAt = lastInDay >= 0 ? lastInDay + 1 : arr.length;
    arr.splice(insertAt, 0, item);
    const startMins = timeToMins(wizForm.startTime || "08:00");
    setPlanItems(recalcTimes(arr, wizForm.date, startMins));
  };

  const toggleTranslator = (uid) => {
    setPlanItems(planItems.map(item => {
      if (item.uid !== uid) return item;
      const hasT = !item.hasTranslator;
      const baseSlots = (item.slots || []).filter(s => !s.isTranslator);
      const newSlots = hasT
        ? [...baseSlots, { instructorId: "", local: baseSlots[0]?.local || "", isTranslator: true }]
        : baseSlots;
      return { ...item, hasTranslator: hasT, slots: newSlots };
    }));
  };

  const addAssistant = (uid) => {
    setPlanItems(planItems.map(item => {
      if (item.uid !== uid) return item;
      const slots = item.slots || [];
      const sharedLocal = slots[0]?.local || "";
      const tradIdx = slots.findIndex(s => s.isTranslator);
      const ns = [...slots];
      if (tradIdx >= 0) { ns.splice(tradIdx, 0, { instructorId: "", local: sharedLocal }); }
      else { ns.push({ instructorId: "", local: sharedLocal }); }
      return { ...item, slots: ns };
    }));
  };

  const removeAssistant = (uid) => {
    setPlanItems(planItems.map(item => {
      if (item.uid !== uid) return item;
      const slots = item.slots || [];
      const nonTradIdxs = slots.map((s, i) => s.isTranslator ? -1 : i).filter(i => i >= 0);
      if (nonTradIdxs.length <= 1) return item; // manter pelo menos o Lead
      const lastIdx = nonTradIdxs[nonTradIdxs.length - 1];
      return { ...item, slots: slots.filter((_, i) => i !== lastIdx) };
    }));
  };

  const savePlan = () => {
    const newRows = planItems.flatMap(item => {
      const slots = item.slots || [{ instructorId: item.instructorId||"", local: item.local||"" }];
      const nonTranslatorSlots = slots.filter(sl => !sl.isTranslator);
      return slots.map((slot, slotIdx) => {
        const instr = instructors.find(i => i.id === +slot.instructorId);
        const ntIdx = nonTranslatorSlots.indexOf(slot);
        const slotRole = slot.isTranslator
          ? "Translator"
          : ntIdx === 0
            ? (item.mod.type === "PRÁTICA" ? "Practical Instructor" : "Theoretical Instructor")
            : "Assistant Instructor";
        return {
          id: Date.now() + Math.random(),
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
          role: slotRole,
          studentCount: wizForm.studentCount || "",
          observation: wizForm.observation || "",
          status: "Pendente",
        };
      });
    });
    const conflicts = detectConflicts(newRows, null);
    confirmConflicts(conflicts, () => {
      setSchedules([...schedules, ...newRows]);
      closeActiveTab();
    });
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const isArchivedClass = cls => {
    const dates = schedules.filter(s => s.className === cls).map(s => s.date);
    return dates.length > 0 && dates.every(d => d < todayStr);
  };
  const deleteClass = cls => {
    const archived = isArchivedClass(cls);
    askDelete(() => setSchedules(schedules.filter(s => s.className !== cls)), archived);
  };

  // ── Group existing schedules by className ─────────────────────────────────
  const allClasses = [...new Set(schedules.map(s => s.className))];
  const filteredClasses = allClasses.filter(cls =>
    [cls, ...schedules.filter(s=>s.className===cls).map(s=>s.trainingName||"")].some(v=>v.toLowerCase().includes(search.toLowerCase()))
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
        <div><h2 style={{ color:"#fff", fontWeight:800, margin:0, fontSize:24 }}>Programação</h2>
             <p style={{ color:"#64748b", margin:"4px 0 0", fontSize:14 }}>Planejamento de turmas por treinamento</p></div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {canPlan(user) && (
            <div style={{ display:"flex", borderRadius:8, overflow:"hidden", border:"1px solid #154753" }}>
              <button onClick={() => setViewMode("list")}
                style={{ padding:"6px 14px", background: viewMode==="list" ? "#154753" : "transparent", color: viewMode==="list" ? "#ffa619" : "#64748b", border:"none", cursor:"pointer", fontSize:13, fontWeight: viewMode==="list" ? 700 : 400 }}>
                Lista
              </button>
              <button onClick={() => setViewMode("week")}
                style={{ padding:"6px 14px", background: viewMode==="week" ? "#154753" : "transparent", color: viewMode==="week" ? "#ffa619" : "#64748b", border:"none", cursor:"pointer", fontSize:13, fontWeight: viewMode==="week" ? 700 : 400 }}>
                Semana
              </button>
            </div>
          )}
          {hasPermission(user, "plan_edit") && <Btn onClick={openNewTab} label="Nova Turma" icon="plus" />}
        </div>
      </div>

      {viewMode === "week" && canPlan(user) && (
        <WeeklyCalendarView
          schedules={schedules}
          areas={areas}
          trainings={trainings}
          weekOffset={weekOffset}
          setWeekOffset={setWeekOffset}
          onClickClass={cls => loadClassForEdit(cls)}
          canEdit={hasPermission(user, "plan_edit")}
        />
      )}

      {viewMode === "list" && <>
      <div style={{ position:"relative", marginBottom:16 }}>
        <div style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)" }}><Icon name="search" size={16} color="#64748b" /></div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar turma ou treinamento..."
          style={{ width:"100%", padding:"10px 10px 10px 40px", background:"#073d4a", border:"1px solid #154753", borderRadius:10, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
      </div>
      {filteredClasses.length === 0 && <p style={{ color:"#64748b", textAlign:"center", padding:48 }}>Nenhuma turma programada. Clique em "Nova Turma" para começar.</p>}
      <div style={{ display:"grid", gap:10 }}>
        {filteredClasses.map(cls => {
          const rows = schedules.filter(s => s.className === cls);
          const t = trainings.find(t => t.id === rows[0]?.trainingId);
          const area = areas.find(a => a.id === t?.area);
          const dates = [...new Set(rows.map(r=>r.date))].sort();
          const expanded = !!expandCls[cls];
          const pending = rows.filter(r => r.status === "Pendente").length;
          const confirmed = rows.filter(r => r.status === "Confirmado").length;
          return (
            <div key={cls} style={{ background:"#073d4a", borderRadius:14, border:`1px solid ${area ? area.color+"40" : "#154753"}`, overflow:"hidden" }}>
              <div onClick={() => setExpandCls(p => ({ ...p, [cls]: !p[cls] }))}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 20px", cursor:"pointer" }}>
                {area && <div style={{ width:4, height:44, borderRadius:4, background:area.color, flexShrink:0 }} />}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ color:"#fff", fontWeight:700, fontSize:15 }}>{cls}</span>
                    {t && <span style={{ padding:"2px 8px", borderRadius:6, background:"#ffa61920", color:"#ffa619", fontSize:11, fontWeight:700 }}>{t.gcc}</span>}
                    {area && <span style={{ padding:"2px 8px", borderRadius:6, background:area.color+"20", color:area.color, fontSize:11, fontWeight:600 }}>{area.name}</span>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:4, flexWrap:"wrap" }}>
                    <span style={{ color:"#64748b", fontSize:12 }}>{rows.length} disciplinas · {dates.length} dia(s)</span>
                    {dates.length > 0 && <span style={{ color:"#94a3b8", fontSize:12 }}>{fmtDate(dates[0])}{dates.length>1 ? ` → ${fmtDate(dates[dates.length-1])}` : ""}</span>}
                    {confirmed > 0 && <span style={{ padding:"1px 8px", borderRadius:10, background:"#16a34a20", color:"#16a34a", fontSize:11 }}>{confirmed} confirmado(s)</span>}
                  {rows.some(r => r.issue) && <span style={{ padding:"1px 8px", borderRadius:10, background:"#d9780620", color:"#d97806", fontSize:11, display:"flex", alignItems:"center", gap:3 }}><Icon name="warning" size={10} color="#d97806" /> {rows.filter(r=>r.issue).length} problema(s)</span>}
                    {pending > 0 && <span style={{ padding:"1px 8px", borderRadius:10, background:"#d9780620", color:"#d97806", fontSize:11 }}>{pending} pendente(s)</span>}
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <button onClick={e => {
                    e.stopPropagation();
                    const fmtD2 = d => new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
                    const rowsHtml = dates.map(d => {
                      const dRows = rows.filter(r=>r.date===d).sort((a,b)=>a.startTime.localeCompare(b.startTime));
                      return dRows.map((r,i) =>
                        "<tr>"+(i===0?"<td rowspan='"+dRows.length+"' style='padding:6px 12px;border:1px solid #ddd;vertical-align:top;font-weight:700;white-space:nowrap'>"+fmtD2(d)+"</td>":"")+
                        "<td style='padding:6px 12px;border:1px solid #ddd;white-space:nowrap'>"+(r.startTime||"")+"–"+(r.endTime||"")+"</td>"+
                        "<td style='padding:6px 12px;border:1px solid #ddd'>"+(r.module||"")+"</td>"+
                        "<td style='padding:6px 12px;border:1px solid #ddd'>"+(r.local||"—")+"</td>"+
                        "<td style='padding:6px 12px;border:1px solid #ddd'>"+(r.instructorName||"—")+"</td>"+
                        "</tr>"
                      ).join("");
                    }).join("");
                    const w = window.open("","_blank");
                    w.document.write("<html><head><title>"+cls+"</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{background:#01323d;color:#fff;padding:8px 12px;border:1px solid #ccc}@media print{button{display:none}}</style></head><body>");
                    w.document.write("<h2 style='margin:0 0 2px'>Programação da Turma</h2>");
                    w.document.write("<h3 style='margin:0 0 16px;color:#555'>"+cls+(t?" — "+t.name.slice(0,60):"")+"</h3>");
                    w.document.write("<button onclick='window.print()' style='margin-bottom:16px;padding:8px 18px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer'>🖨 Imprimir / PDF</button>");
                    w.document.write("<table><thead><tr><th>Data</th><th>Horário</th><th>Módulo</th><th>Local</th><th>Instrutor</th></tr></thead><tbody>"+rowsHtml+"</tbody></table>");
                    w.document.write("</body></html>");
                    w.document.close();
                  }}
                    style={{ background:"#0a4a5a", border:"1px solid #154753", borderRadius:8, cursor:"pointer", padding:"5px 10px", color:"#94a3b8", fontSize:12, fontWeight:600 }}>
                    🖨
                  </button>
                  {hasPermission(user, "plan_edit") && (
                    <button onClick={e => { e.stopPropagation(); loadClassForEdit(cls); }}
                      style={{ background:"#154753", border:"1px solid #1e6a7a", borderRadius:8, cursor:"pointer", padding:"5px 10px", display:"flex", alignItems:"center", gap:5, color:"#ffa619", fontSize:12, fontWeight:600 }}>
                      <Icon name="edit" size={13} color="#ffa619" /> Editar
                    </button>
                  )}
                  {hasPermission(user, "plan_edit") && <button onClick={e => { e.stopPropagation(); deleteClass(cls); }}
                    style={{ background:"none", border:"1px solid #ef444440", borderRadius:8, cursor:"pointer", padding:"5px 8px" }}>
                    <Icon name="delete" size={14} color="#ef4444" />
                  </button>}
                  <span style={{ color:"#64748b", fontSize:14 }}>{expanded ? "▲" : "▼"}</span>
                </div>
              </div>
              {expanded && (
                <div style={{ borderTop:"1px solid #154753" }}>
                  {dates.map(d => (
                    <div key={d}>
                      <div style={{ padding:"8px 20px", background:"#01323d", borderBottom:"1px solid #154753" }}>
                        <span style={{ color:"#94a3b8", fontSize:12, fontWeight:600 }}>{fmtDate(d)}</span>
                      </div>
                      {rows.filter(r=>r.date===d).sort((a,b)=>a.startTime.localeCompare(b.startTime)).map(r => (
                        <div key={r.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 20px", borderBottom:"1px solid #07385040" }}>
                          <span style={{ color:"#64748b", fontSize:12, width:80, flexShrink:0 }}>{r.startTime}–{r.endTime}</span>
                          <span style={{ flex:1, color:"#e2e8f0", fontSize:13, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.module}</span>
                          <span style={{ padding:"2px 7px", borderRadius:5, background:"#ffa61915", color:"#ffa619", fontSize:11, flexShrink:0 }}>{r.local || "—"}</span>
                          <span style={{ color:"#94a3b8", fontSize:12, flexShrink:0, maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.instructorName || <span style={{color:"#ef4444"}}>⚠ Sem instrutor</span>}</span>
                          <span style={{ padding:"2px 7px", borderRadius:5, background:(ROLE_BADGE[r.role]||"#64748b")+"20", color:ROLE_BADGE[r.role]||"#64748b", fontSize:10, fontWeight:600, flexShrink:0 }}>{ROLE_PT[r.role]||r.role||"—"}</span>
                          <span style={{ padding:"3px 8px", borderRadius:10, background:(STATUS_COLOR[r.status]||"#64748b")+"20", color:STATUS_COLOR[r.status]||"#64748b", fontSize:11, fontWeight:600, flexShrink:0 }}>{r.status}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>}
      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
      <ConflictModal guard={conflictGuard} setGuard={setConflictGuard} />
    </div>
  );

  // ── Split sidebar (shared between step 2 and 3) ─────────────────────────────
  const splitSidebar = splitMode ? (() => {
    const allCls = [...new Set(schedules.map(s => s.className))].sort();
    const activeCls = editCls || wizForm.className || null;
    return (
      <div style={{ width:200, flexShrink:0, background:"#073d4a", border:"1px solid #154753", borderRadius:12, padding:"10px 0", overflowY:"auto", maxHeight:"calc(100vh - 180px)", alignSelf:"flex-start", position:"sticky", top:0 }}>
        <div style={{ padding:"8px 14px 6px", borderBottom:"1px solid #154753", marginBottom:6 }}>
          <span style={{ color:"#94a3b8", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5 }}>Turmas</span>
        </div>
        {allCls.length === 0 && <p style={{ color:"#475569", fontSize:12, padding:"8px 14px" }}>Nenhuma turma</p>}
        {allCls.map(cn => {
          const rows = schedules.filter(s => s.className === cn);
          const t    = trainings.find(tr => tr.id === rows[0]?.trainingId);
          const area = areas.find(a => a.id === t?.area);
          const isActive = cn === activeCls;
          return (
            <div key={cn} onClick={() => loadClassForEdit(cn)}
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
    const editTraining = trainings.find(t => t.id === editItems[0]?.trainingId);
    const editArea     = areas.find(a => a.id === editTraining?.area);
    const isCbincEdit  = editArea && /CBINC|INCÊNDIO|INCENDIO/i.test(editArea.name);

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
            </div>
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
            <Btn onClick={recalcEdit} label="↺ Recalcular horários" color="#154753" sm />
            <button onClick={() => {
              const days = Object.entries(editByDay).sort(([a],[b]) => a.localeCompare(b));
              const fmtD = d => new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
              const rowsHtml = days.map(([day, items]) => {
                const sorted = [...items].sort((a,b) => (a.startTime||"").localeCompare(b.startTime||""));
                const dayRows = sorted.map((it,i) =>
                  "<tr>" + (i===0 ? "<td rowspan='"+sorted.length+"' style='padding:6px 12px;border:1px solid #ddd;vertical-align:top;font-weight:700;white-space:nowrap'>"+fmtD(day)+"</td>" : "") +
                  "<td style='padding:6px 12px;border:1px solid #ddd;white-space:nowrap'>"+(it.startTime||"")+" – "+(it.endTime||"")+"</td>"+
                  "<td style='padding:6px 12px;border:1px solid #ddd'>"+(it.mod?.name||it.module||"")+"</td>"+
                  "<td style='padding:6px 12px;border:1px solid #ddd'>"+(it.slots||[]).map(s=>s.local||"").filter(Boolean).join(", ")||"—"+"</td>"+
                  "<td style='padding:6px 12px;border:1px solid #ddd;font-size:11px'>"+(it.slots||[]).map(s=>{const instr=instructors.find(i=>String(i.id)===String(s.instructorId));return instr?instr.name.split(" ").slice(0,2).join(" "):"—";}).join(", ")+"</td>"+
                  "</tr>"
                ).join("");
                return dayRows;
              }).join("");
              const w = window.open("","_blank");
              w.document.write("<html><head><title>"+editCls+"</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{background:#01323d;color:#fff;padding:8px 12px;border:1px solid #ccc}@media print{button{display:none}}</style></head><body>");
              w.document.write("<h2 style='margin:0 0 2px'>Programação da Turma</h2>");
              w.document.write("<h3 style='margin:0 0 4px;color:#555'>"+editCls+(editTraining?" — "+editTraining.name.slice(0,60):"")+"</h3>");
              if (editStudentCount) w.document.write("<p style='color:#555;margin:0 0 16px'>"+editStudentCount+" aluno(s)</p>");
              w.document.write("<button onclick='window.print()' style='margin-bottom:16px;padding:8px 18px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer'>🖨 Imprimir / PDF</button>");
              w.document.write("<table><thead><tr><th>Data</th><th>Horário</th><th>Módulo</th><th>Local</th><th>Instrutor(es)</th></tr></thead><tbody>"+rowsHtml+"</tbody></table>");
              w.document.write("</body></html>");
              w.document.close();
            }}
              style={{ padding:"7px 14px", background:"#0a4a5a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              🖨 PDF
            </button>
            <Btn onClick={saveEditItems} label="✓ Salvar alterações" color="linear-gradient(135deg,#16a34a,#15803d)" />
          </div>
        </div>
        <p style={{ color:"#475569", fontSize:12, marginBottom:16, padding:"8px 12px", background:"#073d4a", borderRadius:8, border:"1px solid #154753" }}>
          ⠿ Arraste módulos para reordenar dentro do dia · Arraste para o <strong style={{color:"#ffa619"}}>cabeçalho de outro dia</strong> para mover aquele módulo
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
                  const localOpts2 = LOCALS.filter(l => {
                    if (modType === "TEORIA")   return l.env === "Teórico";
                    if (modType === "PRÁTICA")  return isCbincEdit ? l.subtype === "incendio" : l.env === "Prático";
                    return true;
                  });
                  const qualInstr = item.module
                    ? instructors.filter(i => (i.skills||[]).some(s => (s.name||s) === item.module))
                    : instructors;
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
                      <div style={{ width:88, flexShrink:0 }}>
                        <span style={{ color:"#94a3b8", fontSize:11 }}>{item.startTime}–{item.endTime}</span>
                        <p style={{ color:"#475569", fontSize:10, margin:0 }}>{item.startTime && item.endTime ? fmtMin(timeToMins(item.endTime) - timeToMins(item.startTime)) : ""}</p>
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
                            <div style={{ width:160 }}>
                              <select value={editSlots[0]?.local||""} onChange={e => updateSlots(editSlots.map(s => ({...s, local: e.target.value})))}
                                style={{ width:"100%", padding:"6px 8px", background:"#01323d", border:"1px solid #154753", borderRadius:7, color: editSlots[0]?.local ? "#e2e8f0":"#475569", fontSize:12, outline:"none" }}>
                                <option value="">📍 Local...</option>
                                {localOpts2.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                              </select>
                            </div>
                            {/* Um instrutor por slot */}
                            {editSlots.map((slot, k) => (
                              <div key={k} style={{ display:"flex", alignItems:"center", gap:4 }}>
                                <div style={{ width:160 }}>
                                  <select value={String(slot.instructorId||"")} onChange={e => { const ns=[...editSlots]; ns[k]={...ns[k],instructorId:e.target.value}; updateSlots(ns); }}
                                    style={{ width:"100%", padding:"6px 8px", background: slot.isTranslator ? "#06b6d410" : "#01323d", border:`1px solid ${slot.isTranslator ? "#06b6d440" : "#154753"}`, borderRadius:7, color: slot.instructorId ? "#e2e8f0":"#475569", fontSize:12, outline:"none" }}>
                                    <option value="">{slot.isTranslator ? "🌐 Tradutor..." : "👤 Instrutor..."}</option>
                                    {(slot.isTranslator ? instructors.filter(i => (i.skills||[]).some(s => (s.name||s) === TRANSLATOR_SKILL)) : qualInstr).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                  </select>
                                </div>
                                {slot.isTranslator && <span style={{ color:"#06b6d4", fontSize:10, fontWeight:700 }}>🌐</span>}
                              </div>
                            ))}
                            {/* Botão adicionar/remover tradutor */}
                            {(() => {
                              const hasT = editSlots.some(s => s.isTranslator);
                              return (
                                <button onClick={() => {
                                  if (hasT) { updateSlots(editSlots.filter(s => !s.isTranslator)); }
                                  else { updateSlots([...editSlots, { instructorId: "", local: editSlots[0]?.local || "", isTranslator: true }]); }
                                }}
                                  style={{ background: hasT ? "#06b6d415" : "none", border:`1px solid ${hasT ? "#06b6d440" : "#154753"}`, borderRadius:6, padding:"3px 8px", color: hasT ? "#06b6d4" : "#64748b", fontSize:10, fontWeight:600, cursor:"pointer", alignSelf:"flex-start" }}>
                                  {hasT ? "🌐 Remover tradutor" : "🌐 + Tradutor"}
                                </button>
                              );
                            })()}
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
        <ConflictModal guard={conflictGuard} setGuard={setConflictGuard} />
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
          onChange={e => setWizForm({ ...wizForm, trainingId: e.target.value, className: "" })}
          opts={trainings.map(t => ({ v: t.id, l: `${t.gcc} — ${t.name.slice(0,50)}`, keywords: `${t.gcc} ${t.shortName||''} ${t.name}` }))} />
        {selTraining && (
          <div style={{ marginBottom:14, padding:"10px 14px", background:"#01323d", borderRadius:10, border:"1px solid #154753" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <span style={{ color:"#ffa619", fontSize:12, fontWeight:700 }}>{selTraining.gcc}</span>
              {(() => { const a = areas.find(x => x.id === selTraining.area); return a ? <span style={{ padding:"1px 8px", borderRadius:10, background:a.color+"20", color:a.color, fontSize:11, fontWeight:600 }}>{a.name}</span> : null; })()}
              <span style={{ color:"#64748b", fontSize:12 }}>{selTraining.modules?.length||0} módulos</span>
              <span style={{ color: selTraining.defaultSchedule!==false ? "#ffa619" : "#94a3b8", fontSize:11 }}>
                {selTraining.defaultSchedule!==false ? "⏰ Horário 08:00–17:00" : "⏰ Horário personalizado"}
              </span>
            </div>
            {selTraining.modules?.length === 0 && <p style={{ color:"#d97806", fontSize:12, margin:"6px 0 0" }}>⚠ Este treinamento não possui módulos cadastrados. Adicione módulos em Treinamentos antes de programar.</p>}
          </div>
        )}
        <Input label="Data de Início" type="date" value={wizForm.date} onChange={e => {
          const novaData = e.target.value;
          if (selTraining && novaData) {
            const refDate = new Date(novaData + "T12:00:00");
            const startOfYear = new Date(refDate.getFullYear(), 0, 1);
            const weekNum = Math.ceil(((refDate - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
            const turmasSemana = schedules
              .filter(s => {
                if (s.trainingId !== selTraining.id) return false;
                const d = new Date(s.date + "T12:00:00");
                const soy = new Date(d.getFullYear(), 0, 1);
                const wk = Math.ceil(((d - soy) / 86400000 + soy.getDay() + 1) / 7);
                return wk === weekNum && d.getFullYear() === refDate.getFullYear();
              })
              .map(s => s.className)
              .filter((v, i, a) => a.indexOf(v) === i);
            const nums = turmasSemana.map(n => { const m = n.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
            const proximo = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
            const proximoNome = `${selTraining.shortName || selTraining.gcc} - ${String(proximo).padStart(2, "0")}`;
            setWizForm(prev => ({ ...prev, date: novaData, className: proximoNome }));
          } else {
            setWizForm(prev => ({ ...prev, date: novaData }));
          }
        }} />
        {selTraining && selTraining.defaultSchedule === false && (
          <Input label="Horário de Início" type="time" value={wizForm.startTime} onChange={e => setWizForm({ ...wizForm, startTime: e.target.value })} />
        )}
        {selTraining && selTraining.defaultSchedule !== false && (
          <p style={{ color:"#64748b", fontSize:12, margin:"-4px 0 14px", padding:"8px 12px", background:"#154753", borderRadius:8 }}>
            ⏰ Horário padrão: <strong style={{color:"#ffa619"}}>08:00 → 12:00</strong> (almoço) <strong style={{color:"#ffa619"}}>13:00 → 17:00</strong>
          </p>
        )}
        {(() => {
          if (!selTraining) return <Input label="Nome da Turma" value={wizForm.className} onChange={e => setWizForm({ ...wizForm, className: e.target.value })} placeholder="Ex: CBSP - 01" />;
          const gcc = selTraining.shortName || selTraining.gcc;
          // Calcular semana do ano para a data selecionada (ou hoje)
          const refDate = wizForm.date ? new Date(wizForm.date + "T12:00:00") : new Date();
          const startOfYear = new Date(refDate.getFullYear(), 0, 1);
          const weekNum = Math.ceil(((refDate - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
          // Turmas da mesma semana para esse treinamento
          const turmasSemana = schedules
            .filter(s => {
              if (s.trainingId !== selTraining.id) return false;
              const d = new Date(s.date + "T12:00:00");
              const soy = new Date(d.getFullYear(), 0, 1);
              const wk = Math.ceil(((d - soy) / 86400000 + soy.getDay() + 1) / 7);
              return wk === weekNum && d.getFullYear() === refDate.getFullYear();
            })
            .map(s => s.className)
            .filter((v, i, a) => a.indexOf(v) === i);
          // Proximo numero disponivel na semana
          const nums = turmasSemana.map(n => {
            const m = n.match(/(\d+)$/);
            return m ? parseInt(m[1]) : 0;
          });
          const proximo = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
          const proximoNome = `${gcc} - ${String(proximo).padStart(2, "0")}`;
          // Turmas de outras semanas para reuso
          const outrasturmas = schedules
            .filter(s => s.trainingId === selTraining.id)
            .map(s => s.className)
            .filter((v, i, a) => a.indexOf(v) === i && !turmasSemana.includes(v))
            .sort().reverse().slice(0, 5);
          return (
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Nome da Turma</label>
              <select value={wizForm.className} onChange={e => setWizForm({ ...wizForm, className: e.target.value })}
                style={{ width: "100%", padding: "10px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 8, color: wizForm.className ? "#e2e8f0" : "#475569", fontSize: 14, outline: "none" }}>
                <option value="">Selecionar turma...</option>
                <optgroup label={"── Semana " + weekNum + " (atual) ──"}>
                  <option value={proximoNome}>{proximoNome}</option>
                  {turmasSemana.map(n => <option key={n} value={n}>{n}</option>)}
                </optgroup>
                {outrasturmas.length > 0 && (
                  <optgroup label="── Semanas anteriores ──">
                    {outrasturmas.map(n => <option key={n} value={n}>{n}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
          );
        })()}
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
        <Btn onClick={initPlan}
          disabled={!wizForm.trainingId || !wizForm.className || !wizForm.date || !selTraining?.modules?.length}
          label="Gerar Planejamento Automático →" color="linear-gradient(135deg,#ffa619,#e8920a)" />
      </div>
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
        <Btn onClick={() => { setPlanItems(recalcTimes(planItems.map(i=>({...i})), wizForm.date, startMins)); }} label="↺ Recalcular" color="#154753" sm />
      </div>
      <p style={{ color:"#475569", fontSize:12, marginBottom:16 }}>⠿ Arraste para reordenar · Use o seletor de data para mover entre dias · Edite instrutor e local em cada linha</p>

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
              const habilitados = item.mod
                ? instructors.filter(i => (i.skills||[]).some(s => (s.name||s) === item.mod.name))
                : instructors;
              const habilitadosTrad = instructors.filter(i =>
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
                const conflict = planItems.find(p => {
                  if (p.uid === item.uid) return false;
                  if (p.date !== item.date) return false;
                  const pStart = timeToMins(p.startTime);
                  const pEnd   = timeToMins(p.endTime);
                  if (itemStart >= pEnd || itemEnd <= pStart) return false;
                  return (p.slots||[]).some(s => String(s.instructorId) === String(instrId));
                });
                if (!conflict) return "";
                return `${conflict.mod?.name||""} · ${conflict.startTime}–${conflict.endTime}`;
              };
              const disponiveis = habilitados.filter(i => !isOcupado(i.id) && !isInstructorAbsent(i.id, item.date, itemStart, itemEnd, absences||[]));
              const ocupados    = habilitados.filter(i => isOcupado(i.id) || isInstructorAbsent(i.id, item.date, itemStart, itemEnd, absences||[]));
              const qualInstr   = disponiveis; // mantém compatibilidade
              const disponiveisTrad = habilitadosTrad.filter(i => !isOcupado(i.id) && !isInstructorAbsent(i.id, item.date, itemStart, itemEnd, absences||[]));
              const ocupadosTrad    = habilitadosTrad.filter(i => isOcupado(i.id) || isInstructorAbsent(i.id, item.date, itemStart, itemEnd, absences||[]));
              const isDraggingOver = dragOver === globalIdx;
              const slots = item.slots || [{ instructorId: item.instructorId||"", local: item.local||"" }];
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
                    <div style={{ width:80, flexShrink:0 }}>
                      <span style={{ color:"#94a3b8", fontSize:11 }}>{item.startTime}–{item.endTime}</span>
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
                      <select
                        title="Mover para outro dia"
                        value={item.date}
                        onChange={e => movePlanToDay(item.uid, e.target.value)}
                        style={{ fontSize:10, padding:"2px 4px", borderRadius:5, border:"1px solid #154753", background:"#01323d", color:"#94a3b8", cursor:"pointer", outline:"none" }}>
                        {Object.keys(planByDay).sort().map(d => (
                          <option key={d} value={d}>{fmtDate(d)}</option>
                        ))}
                      </select>
                      <div style={{ width:1, height:16, background:"#154753", margin:"0 2px" }} />
                      <button onClick={() => removeAssistant(item.uid)}
                        title="Remover assistente"
                        style={{ fontSize:12, fontWeight:700, width:22, height:22, borderRadius:5, cursor:"pointer", border:"1px solid #154753", background:"transparent", color:"#475569", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>−</button>
                      <span style={{ fontSize:10, color:"#475569", minWidth:16, textAlign:"center" }}>{(item.slots||[]).filter(s=>!s.isTranslator).length}</span>
                      <button onClick={() => addAssistant(item.uid)}
                        title="Adicionar assistente"
                        style={{ fontSize:12, fontWeight:700, width:22, height:22, borderRadius:5, cursor:"pointer", border:"1px solid #154753", background:"transparent", color:"#475569", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>+</button>
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
                          style={{ width:"100%", padding:"6px 8px", background:"#01323d", border:"1px solid #154753", borderRadius:7, color: slots[0]?.local ? "#e2e8f0":"#475569", fontSize:12, outline:"none" }}>
                          <option value="">📍 Local...</option>
                          {localOpts.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {/* Um seletor de instrutor por slot */}
                    {slots.map((slot, k) => (
                      <div key={k} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderBottom: k < slots.length-1 ? "1px solid #1e3e47" : "none" }}>
                        {(() => {
                          const isTrad = slot.isTranslator;
                          const bg    = isTrad ? "#06b6d415" : k===0 ? "#ffa61920" : "#15475320";
                          const color = isTrad ? "#06b6d4"   : k===0 ? "#ffa619"   : "#475569";
                          const bdr   = isTrad ? "1px solid #06b6d440" : k===0 ? "1px solid #ffa61940" : "1px solid #15475360";
                          const lbl   = isTrad ? "Trad."  : k===0 ? "Lead" : "Assist.";
                          return <span style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, minWidth:34, textAlign:"center", padding:"2px 4px", borderRadius:4, background:bg, color, border:bdr, flexShrink:0 }}>{lbl}</span>;
                        })()}
                        <div style={{ width:180 }}>
                          <select value={slot.instructorId} onChange={e => { const arr=[...planItems]; const ns=[...slots]; ns[k]={...ns[k],instructorId:e.target.value}; arr[globalIdx]={...arr[globalIdx],slots:ns}; setPlanItems(arr); }}
                            style={{ width:"100%", padding:"6px 8px", background:"#01323d", border:"1px solid #154753", borderRadius:7, color: slot.instructorId ? "#e2e8f0":"#475569", fontSize:12, outline:"none" }}>
                            <option value="">👤 Instrutor...</option>
                            {(() => {
                              const pool    = slot.isTranslator ? disponiveisTrad : disponiveis;
                              const poolOcp = slot.isTranslator ? ocupadosTrad    : ocupados;
                              return (<>
                                <option value="" disabled>— {pool.length} disponível(eis) —</option>
                                {pool.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                {poolOcp.length > 0 && <>
                                  <option value="" disabled>─── Ocupados ───</option>
                                  {poolOcp.map(i => <option key={i.id} value={i.id} style={{color:"#ef4444"}}>⚠ {i.name} · {getOcupacaoLabel(i.id)}</option>)}
                                </>}
                              </>);
                            })()}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {(() => {
        const semTrad      = planItems.filter(i => i.hasTranslator && (i.slots||[]).some(s => s.isTranslator && !s.instructorId));
        const semInstrutor = planItems.filter(i => (i.slots||[]).some(s => !s.isTranslator && !s.instructorId));
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
              <Btn onClick={savePlan} disabled={temErro} label="✓ Confirmar e Salvar Planejamento" color={temErro ? "#154753" : "linear-gradient(135deg,#16a34a,#15803d)"} />
              <Btn onClick={closeActiveTab} label="Cancelar" color="#154753" />
            </div>
          </>
        );
      })()}
      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
      <ConflictModal guard={conflictGuard} setGuard={setConflictGuard} />
      </div>
    </div>
  );
};

