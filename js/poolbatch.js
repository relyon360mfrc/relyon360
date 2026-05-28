// ── POOL BATCH PAGE ───────────────────────────────────────────────────────────
// Planejamento paralelo de eventos de piscina (THUET, THUET+CAEBS, CAEBS SW).
// Grade 2h × turmas do dia. CRUD completo inline:
// - Edita instrutor por slot (click → select)
// - Edita local do módulo (click no chip 📍)
// - +/− Assistente · +/Remover Tradutor por módulo
// - Excluir módulo · Excluir turma (com senha)
// - Renomear turma · editar nº de alunos
// - Arrastar módulo entre slots de horário (mesma turma) e entre turmas
// Ver DESIGN §17.

const PoolBatchPage = ({ schedules, setSchedules, trainings, instructors, areas, holidays, absences, user, setActive, scheduleTabs, setScheduleTabs, setActiveTabId, locals }) => {
  const todayIso = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(() => {
    try { const s = sessionStorage.getItem("rl360_pool_batch_date"); return s || todayIso; }
    catch { return todayIso; }
  });
  React.useEffect(() => { try { sessionStorage.setItem("rl360_pool_batch_date", date); } catch {} }, [date]);

  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState({ trainingId: "", startTime: "08:00", studentCount: "", withTranslator: false });
  const [columnOrder, setColumnOrder] = useState([]);
  const [dragState, setDragState] = useState(null);
  const [hoverDrop, setHoverDrop] = useState(null);
  // Edição inline
  const [editingSlot, setEditingSlot]     = useState(null); // rowId
  const [editingLocal, setEditingLocal]   = useState(null); // moduleKey (rowIds[0])
  const [editingHeader, setEditingHeader] = useState(null); // { cls, field: "name"|"students" }
  const [headerDraft, setHeaderDraft]     = useState("");
  const [delGuard, setDelGuard]           = useState({ show: false, action: null, pass: "", err: "" });

  const canEdit = hasPermission(user, "plan_edit");

  // ── SLOT GRID (turnos fixos de 2h) ──────────────────────────────────────────
  const SLOTS = [
    { label: "08:00 — 10:00", start: 480,  end: 600  },
    { label: "10:00 — 12:00", start: 600,  end: 720  },
    { label: "13:00 — 15:00", start: 780,  end: 900  },
    { label: "15:00 — 17:00", start: 900,  end: 1020 },
    { label: "17:00 — 19:00", start: 1020, end: 1140 },
    { label: "19:00 — 21:00", start: 1140, end: 1260 },
  ];

  // ── DATA ────────────────────────────────────────────────────────────────────
  const poolTrainings = (trainings || []).filter(t => t.poolBatch);
  const poolTrainingIds = new Set(poolTrainings.map(t => String(t.id)));
  const dayRows = (schedules || []).filter(s => s.date === date && poolTrainingIds.has(String(s.trainingId)));
  const discoveredClasses = [...new Set(dayRows.map(r => r.className))].sort();
  const classNames = columnOrder.length > 0
    ? [...columnOrder.filter(c => discoveredClasses.includes(c)), ...discoveredClasses.filter(c => !columnOrder.includes(c))]
    : discoveredClasses;

  const classMeta = classNames.map(cls => {
    const rows = dayRows.filter(r => r.className === cls);
    const trainingId = rows[0]?.trainingId;
    const training = trainings.find(t => String(t.id) === String(trainingId));
    return { cls, classId: rows[0]?.classId, training, studentCount: rows[0]?.studentCount || "", rows };
  });

  // Agrupa rows por (módulo, startTime, endTime) — cada grupo expõe slots[] ordenado
  // por função (Lead → Assist → Scuba → Crane → Translator) preservando rows vazias.
  const ROLE_ORDER = {
    "Lead Instructor": 0,
    "Theoretical Instructor": 1,
    "Practical Instructor": 1,
    "Support Instructor": 1,
    "Assistant Instructor": 2,
    "Scuba Diver": 3,
    "Crane Operator": 4,
    "Translator": 99,
  };
  const getCellModules = (cls, slot) => {
    const rows = dayRows.filter(r => {
      if (r.className !== cls) return false;
      const rs = timeToMins(r.startTime), re = timeToMins(r.endTime);
      return rs < slot.end && slot.start < re;
    });
    const byKey = {};
    rows.forEach(r => {
      const key = `${r.module}|${r.startTime}|${r.endTime}|${r.local || ""}`;
      if (!byKey[key]) byKey[key] = {
        module: r.module, moduleId: r.moduleId, startTime: r.startTime, endTime: r.endTime,
        local: r.local || "", slots: [], rows: [],
        startsHere: timeToMins(r.startTime) >= slot.start,
      };
      const instr = instructors.find(i => +i.id === +r.instructorId);
      const name  = instr?.name || r.instructorName || "";
      byKey[key].slots.push({
        rowId: r.id,
        role: r.role || "",
        instructorId: r.instructorId,
        instructorName: name,
        isTranslator: r.role === "Translator",
      });
      byKey[key].rows.push(r);
    });
    Object.values(byKey).forEach(group => {
      group.slots.sort((a, b) => {
        const pa = ROLE_ORDER[a.role] ?? 50;
        const pb = ROLE_ORDER[b.role] ?? 50;
        if (pa !== pb) return pa - pb;
        return (a.rowId || 0) - (b.rowId || 0);
      });
    });
    return Object.values(byKey);
  };

  // Conflito de local: outra turma usa mesmo local em módulo que sobrepõe este slot
  const cellLocalConflict = (cls, slot) => {
    const myMods = getCellModules(cls, slot);
    if (!myMods.length) return null;
    for (const m of myMods) {
      if (!m.local) continue;
      for (const other of classNames) {
        if (other === cls) continue;
        const otherMods = getCellModules(other, slot);
        const hit = otherMods.find(om => om.local === m.local);
        if (hit) return { withClass: other, local: m.local };
      }
    }
    return null;
  };

  // ── CRUD HELPERS ────────────────────────────────────────────────────────────
  const askDelete = (action) => setDelGuard({ show: true, action, pass: "", err: "" });

  // Atualiza instrutor de um slot (rowId). Vazio = limpar instrutor.
  const updateSlotInstructor = (rowId, newInstructorId) => {
    setSchedules(prev => prev.map(s => {
      if (String(s.id) !== String(rowId)) return s;
      const idNum = newInstructorId ? +newInstructorId : null;
      const instr = idNum ? instructors.find(i => +i.id === idNum) : null;
      return { ...s, instructorId: idNum, instructorName: instr?.name || "" };
    }));
  };

  // Atualiza local de TODAS as rows de uma instância de módulo.
  const updateModuleLocal = (moduleRows, newLocal) => {
    const ids = new Set(moduleRows.map(r => String(r.id)));
    setSchedules(prev => prev.map(s => ids.has(String(s.id)) ? { ...s, local: newLocal || "" } : s));
  };

  // Adiciona uma nova row de assistente ao módulo (instrutor vazio).
  const addAssistant = (moduleRows) => {
    const first = moduleRows[0];
    if (!first) return;
    const newRow = {
      id: newScheduleId(),
      classId: first.classId,
      trainingId: first.trainingId,
      trainingName: first.trainingName,
      className: first.className,
      date: first.date,
      startTime: first.startTime,
      endTime: first.endTime,
      local: first.local || "",
      instructorId: null,
      instructorName: "",
      module: first.module,
      moduleId: first.moduleId,
      role: "Assistant Instructor",
      studentCount: first.studentCount || "",
      observation: first.observation || "",
      status: "Pendente",
    };
    setSchedules(prev => [...prev, newRow]);
  };

  // Remove a última row não-tradutora do módulo (mantém pelo menos 1 não-tradutor).
  const removeLastAssistant = (moduleRows) => {
    const nonTrad = moduleRows.filter(r => r.role !== "Translator");
    if (nonTrad.length <= 1) { alert("Mantenha pelo menos um instrutor no módulo."); return; }
    // Última: maior id entre não-tradutores; se houver Lead, preserva
    const removable = nonTrad.filter(r => r.role !== "Lead Instructor");
    const target = (removable.length > 0 ? removable : nonTrad).reduce((a, b) => (b.id > a.id ? b : a));
    setSchedules(prev => prev.filter(s => String(s.id) !== String(target.id)));
  };

  // Adiciona/remove a row de tradutor no módulo.
  const toggleTranslator = (moduleRows) => {
    const tradRow = moduleRows.find(r => r.role === "Translator");
    if (tradRow) {
      setSchedules(prev => prev.filter(s => String(s.id) !== String(tradRow.id)));
    } else {
      const first = moduleRows[0];
      if (!first) return;
      const newRow = {
        id: newScheduleId(),
        classId: first.classId,
        trainingId: first.trainingId,
        trainingName: first.trainingName,
        className: first.className,
        date: first.date,
        startTime: first.startTime,
        endTime: first.endTime,
        local: first.local || "",
        instructorId: null,
        instructorName: "",
        module: first.module,
        moduleId: first.moduleId,
        role: "Translator",
        studentCount: first.studentCount || "",
        observation: first.observation || "",
        status: "Pendente",
      };
      setSchedules(prev => [...prev, newRow]);
    }
  };

  // Remove um slot específico por rowId (sem manter mínimo — usado para Tradutor).
  const removeSlot = (rowId) => {
    setSchedules(prev => prev.filter(s => String(s.id) !== String(rowId)));
  };

  // Exclui todas as rows de um módulo (mesmo classId + module + startTime + endTime).
  const deleteModule = (moduleRows) => {
    if (!moduleRows.length) return;
    const ids = new Set(moduleRows.map(r => String(r.id)));
    askDelete(() => {
      setSchedules(prev => prev.filter(s => !ids.has(String(s.id))));
    });
  };

  // Exclui todas as rows de uma turma (classId).
  const deleteClass = (cls) => {
    const meta = classMeta.find(m => m.cls === cls);
    if (!meta) return;
    const cid = meta.classId;
    askDelete(() => {
      // Fecha abas abertas dessa turma para não ressuscitar via saveEditItems
      setScheduleTabs(prev => prev.filter(t => t.editClassId !== cid));
      if (cid && typeof _deleteSchedulesByClassId === "function") {
        try { _deleteSchedulesByClassId(cid); } catch {}
      }
      setSchedules(prev => prev.filter(s => cid ? s.classId !== cid : s.className !== cls || s.date !== date));
    });
  };

  // Renomeia a turma (todas as rows com mesmo classId no dia).
  const renameClass = (cls, newName) => {
    const trimmed = (newName || "").trim();
    if (!trimmed || trimmed === cls) return;
    if (classNames.includes(trimmed)) { alert("Já existe outra turma com este nome."); return; }
    const meta = classMeta.find(m => m.cls === cls);
    if (!meta) return;
    const cid = meta.classId;
    setSchedules(prev => prev.map(s => {
      if (cid ? s.classId === cid : (s.className === cls && s.date === date)) {
        return { ...s, className: trimmed };
      }
      return s;
    }));
  };

  const updateStudentCount = (cls, count) => {
    const meta = classMeta.find(m => m.cls === cls);
    if (!meta) return;
    const cid = meta.classId;
    const v = String(count || "").trim();
    setSchedules(prev => prev.map(s => {
      if (cid ? s.classId === cid : (s.className === cls && s.date === date)) {
        return { ...s, studentCount: v };
      }
      return s;
    }));
  };

  // ── HANDLERS ────────────────────────────────────────────────────────────────
  const handleAddSubmit = () => {
    if (!addForm.trainingId) { alert("Selecione um treinamento."); return; }
    if (!addForm.startTime)  { alert("Defina o horário de início."); return; }
    if (date < todayIso) { alert("Não é possível criar uma programação no passado."); return; }
    if ((scheduleTabs || []).length >= 5) { alert("Limite de 5 abas atingido na Programação. Feche uma aba para abrir outra."); return; }
    const id = Date.now();
    const newTab = {
      id, title: "Nova Turma (Lote)", step: 1,
      wizForm: {
        trainingId: addForm.trainingId,
        className: "",
        date,
        startTime: addForm.startTime,
        studentCount: addForm.studentCount,
        observation: "",
        withTranslator: !!addForm.withTranslator,
        modeId: "",
      },
      planItems: [], editCls: null, editStudentCount: "", editObservation: "", editItems: []
    };
    setScheduleTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    setActive("schedule");
  };

  const onColDragStart = (e, cls) => {
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", "col:" + cls); } catch {}
    setDragState({ kind: "col", cls });
  };
  const onColDrop = (e, targetCls) => {
    e.preventDefault();
    if (!dragState || dragState.kind !== "col" || dragState.cls === targetCls) { setDragState(null); return; }
    const arr = [...classNames];
    const from = arr.indexOf(dragState.cls), to = arr.indexOf(targetCls);
    if (from < 0 || to < 0) { setDragState(null); return; }
    const [item] = arr.splice(from, 1); arr.splice(to, 0, item);
    setColumnOrder(arr);
    setDragState(null);
    setHoverDrop(null);
  };

  const onModuleDragStart = (e, cls, m) => {
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", `mod:${cls}:${m.module}`); } catch {}
    setDragState({ kind: "module", cls, module: m.module, startTime: m.startTime, endTime: m.endTime, rowIds: m.rows.map(r => r.id) });
    e.stopPropagation();
  };

  const onCellDrop = (e, targetCls, slot) => {
    e.preventDefault();
    if (!dragState || dragState.kind !== "module") { setHoverDrop(null); return; }
    const moduleStartMins = timeToMins(dragState.startTime);
    const moduleEndMins = timeToMins(dragState.endTime);
    const slotStart = slot.start;
    const delta = slotStart - moduleStartMins;
    const sameClass = dragState.cls === targetCls;

    // Sem deslocamento horário E mesma turma → no-op
    if (sameClass && delta === 0) { setDragState(null); setHoverDrop(null); return; }

    // Limites da janela do dia (08:00 — 22:00)
    if (moduleStartMins + delta < 480 || moduleEndMins + delta > 1320) {
      alert("Horário fora da janela do dia (08:00 — 22:00).");
      setDragState(null); setHoverDrop(null); return;
    }

    // Cross-class: precisa adotar identidade da turma destino (classId/trainingId/etc.)
    const targetMeta = classMeta.find(m => m.cls === targetCls);
    if (!sameClass && !targetMeta) {
      alert("Turma de destino não encontrada.");
      setDragState(null); setHoverDrop(null); return;
    }

    const rowIdSet = new Set((dragState.rowIds || []).map(String));
    setSchedules(prev => prev.map(s => {
      if (!rowIdSet.has(String(s.id))) return s;
      const ns = timeToMins(s.startTime) + delta;
      const ne = timeToMins(s.endTime)   + delta;
      const next = { ...s, startTime: minsToTimeG(ns), endTime: minsToTimeG(ne) };
      if (!sameClass && targetMeta) {
        next.className   = targetCls;
        next.classId     = targetMeta.classId   || s.classId;
        next.trainingId  = targetMeta.training?.id   || s.trainingId;
        next.trainingName = targetMeta.training?.gcc || s.trainingName;
        next.studentCount = targetMeta.studentCount || s.studentCount || "";
      }
      return next;
    }));
    setDragState(null);
    setHoverDrop(null);
  };

  // ── LOCAIS / INSTRUTORES disponíveis para um slot ───────────────────────────
  // Considera ausência (relyon_absences), feriado e conflito com outras rows.
  const getInstructorAvailability = (mod, currentRowId, isTranslator) => {
    // Reutiliza checkSlotConflictG (global, em constants.js).
    // currentRowId é excluído da contagem (não conflita consigo mesmo).
    const otherSchedules = (schedules || []).filter(s => String(s.id) !== String(currentRowId));
    const available = [];
    const busy = [];
    instructors.forEach(i => {
      if (i.status === "Inativo") return;
      // Tradutor precisa da skill TRADUTOR
      if (isTranslator) {
        const hasTrad = (i.skills || []).some(sk => (sk.name || sk) === TRANSLATOR_SKILL);
        if (!hasTrad) return;
      }
      const conflict = checkSlotConflictG(otherSchedules, date, mod.startTime, mod.endTime, String(i.id), null, null, []).instrConflict;
      // Ausência: relyon_absences (filtra por data + hora)
      const absent = (absences || []).some(a => {
        if (String(a.instructorId) !== String(i.id)) return false;
        if (date < a.startDate || date > a.endDate) return false;
        return true;
      });
      // Feriado: instrutor de base em região com feriado
      const onHoliday = (holidays || []).some(h => h.date === date && (h.scope === "all" || (h.bases || []).includes(i.base)));
      if (conflict) busy.push({ instr: i, reason: "ocupado" });
      else if (absent) busy.push({ instr: i, reason: "ausente" });
      else if (onHoliday) busy.push({ instr: i, reason: "feriado" });
      else available.push(i);
    });
    return { available, busy };
  };

  const getLocalAvailability = (mod, moduleRows) => {
    const moduleRowIds = new Set(moduleRows.map(r => String(r.id)));
    const otherSchedules = (schedules || []).filter(s => !moduleRowIds.has(String(s.id)));
    const free = [];
    const busy = [];
    (locals || []).forEach(l => {
      const conflict = checkSlotConflictG(otherSchedules, date, mod.startTime, mod.endTime, null, l.name, null, []).localConflict;
      if (conflict) busy.push(l);
      else free.push(l);
    });
    return { free, busy };
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  if (!canPlan(user)) {
    return <div style={{ color: "#94a3b8", padding: 32 }}>Acesso restrito a planejadores.</div>;
  }

  const dateLabel = (() => {
    try { return new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); }
    catch { return date; }
  })();

  // Renderer de um slot individual (linha dentro do card de módulo)
  const renderSlot = (s, mod, moduleRows) => {
    const roleColor = ROLE_BADGE[s.role] || "#475569";
    const roleLabel = ROLE_PT[s.role] || s.role || "—";
    const isEmpty = !s.instructorName;
    const isEditing = canEdit && editingSlot === s.rowId;
    return (
      <div key={s.rowId} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, minWidth: 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", padding: "1px 5px", borderRadius: 3, background: roleColor + "22", color: roleColor, fontSize: 9, fontWeight: 700, letterSpacing: 0.2, whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${roleColor}40` }}>
          {roleLabel}
        </span>
        {isEditing ? (() => {
          const { available, busy } = getInstructorAvailability(mod, s.rowId, s.isTranslator);
          return (
            <select autoFocus value={String(s.instructorId || "")}
              onChange={e => { updateSlotInstructor(s.rowId, e.target.value); setEditingSlot(null); }}
              onBlur={() => setEditingSlot(null)}
              style={{ flex: 1, minWidth: 0, padding: "2px 4px", background: "#01323d", border: "1px solid #06b6d4", borderRadius: 4, color: "#e2e8f0", fontSize: 10, outline: "none" }}>
              <option value="">— Vazio —</option>
              {available.length > 0 && (
                <optgroup label={`Disponíveis (${available.length})`}>
                  {available.map(i => <option key={i.id} value={i.id} style={{ color: "#111" }}>{i.name}</option>)}
                </optgroup>
              )}
              {busy.length > 0 && (
                <optgroup label="Indisponíveis">
                  {busy.map(({ instr, reason }) => (
                    <option key={instr.id} value={instr.id} style={{ color: "#111" }}>⚠ {instr.name} · {reason}</option>
                  ))}
                </optgroup>
              )}
            </select>
          );
        })() : (
          <>
            <span onClick={() => canEdit && setEditingSlot(s.rowId)}
              style={{ color: isEmpty ? "#f59e0b" : "#e2e8f0", fontStyle: isEmpty ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1, cursor: canEdit ? "pointer" : "default", textDecoration: canEdit ? "underline dotted #154753" : "none" }}
              title={canEdit ? "Clique para alterar instrutor" : (isEmpty ? "Slot sem instrutor designado" : s.instructorName)}>
              {isEmpty ? "— a designar" : s.instructorName}
            </span>
            {canEdit && !isEmpty && (
              <button onClick={() => updateSlotInstructor(s.rowId, "")}
                title="Desvincular instrutor"
                style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 10, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</button>
            )}
            {canEdit && s.isTranslator && (
              <button onClick={() => { if (window.confirm("Remover tradutor deste módulo?")) removeSlot(s.rowId); }}
                title="Remover tradutor"
                style={{ background: "none", border: "1px solid #06b6d440", color: "#06b6d4", cursor: "pointer", fontSize: 9, padding: "0 4px", borderRadius: 3, lineHeight: 1.4, flexShrink: 0 }}>−</button>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#fff", fontWeight: 800, margin: 0, fontSize: 24 }}>🏊 Lote Piscina</h2>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>Planejamento paralelo de eventos por dia · turnos de 2h</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ padding: "8px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 10, color: "#e2e8f0", fontSize: 14, outline: "none" }} />
          <button onClick={() => setDate(new Date(new Date(date+"T12:00:00").getTime() - 86400000).toISOString().split("T")[0])}
            style={{ padding: "8px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 10, color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>◀</button>
          <button onClick={() => setDate(todayIso)}
            style={{ padding: "8px 14px", background: date===todayIso ? "#06b6d4" : "#073d4a", border: "1px solid #154753", borderRadius: 10, color: date===todayIso ? "#fff" : "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Hoje</button>
          <button onClick={() => setDate(new Date(new Date(date+"T12:00:00").getTime() + 86400000).toISOString().split("T")[0])}
            style={{ padding: "8px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 10, color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>▶</button>
          {canEdit && (
            <button onClick={() => setShowAdd(true)}
              style={{ padding: "8px 16px", background: "linear-gradient(135deg, #06b6d4, #0891b2)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>+ Nova turma</button>
          )}
        </div>
      </div>

      <p style={{ color: "#06b6d4", fontSize: 13, margin: "0 0 16px", textTransform: "capitalize" }}>{dateLabel}</p>

      {poolTrainings.length === 0 && (
        <div style={{ background: "#073d4a", border: "1px solid #154753", borderRadius: 12, padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
          Nenhum treinamento marcado como <strong style={{ color: "#06b6d4" }}>Lote Piscina</strong>.<br />
          Vá em <strong>Treinamentos</strong> e ative a flag em THUET, THUET+CAEBS e CAEBS Shallow Water.
        </div>
      )}

      {poolTrainings.length > 0 && classNames.length === 0 && (
        <div style={{ background: "#073d4a", border: "1px solid #154753", borderRadius: 12, padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
          Nenhuma turma de piscina neste dia. Clique em <strong style={{ color: "#06b6d4" }}>+ Nova turma</strong> para começar.
        </div>
      )}

      {classNames.length > 0 && (
        <div style={{ overflow: "auto", background: "#073d4a", border: "1px solid #154753", borderRadius: 12 }}>
          <table style={{ width: "100%", minWidth: 200 + classNames.length * 240, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ width: 130, padding: 12, textAlign: "left", color: "#64748b", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", borderBottom: "2px solid #154753", background: "#01323d", position: "sticky", left: 0, zIndex: 2 }}>TURNO</th>
                {classMeta.map(({ cls, training, studentCount }) => {
                  const isEditingName = editingHeader && editingHeader.cls === cls && editingHeader.field === "name";
                  const isEditingSC   = editingHeader && editingHeader.cls === cls && editingHeader.field === "students";
                  return (
                    <th key={cls}
                      draggable={canEdit && !isEditingName && !isEditingSC}
                      onDragStart={e => onColDragStart(e, cls)}
                      onDragOver={e => { e.preventDefault(); }}
                      onDrop={e => onColDrop(e, cls)}
                      style={{ minWidth: 240, padding: 12, textAlign: "left", borderBottom: "2px solid #154753", borderLeft: "1px solid #154753", background: "#01323d", cursor: canEdit ? "grab" : "default" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        {isEditingName ? (
                          <input autoFocus type="text" value={headerDraft}
                            onChange={e => setHeaderDraft(e.target.value)}
                            onBlur={() => { renameClass(cls, headerDraft); setEditingHeader(null); }}
                            onKeyDown={e => {
                              if (e.key === "Enter") { renameClass(cls, headerDraft); setEditingHeader(null); }
                              if (e.key === "Escape") setEditingHeader(null);
                            }}
                            style={{ flex: 1, padding: "4px 6px", background: "#01323d", border: "1px solid #06b6d4", borderRadius: 6, color: "#fff", fontSize: 14, fontWeight: 800, outline: "none" }} />
                        ) : (
                          <span onClick={() => { if (!canEdit) return; setHeaderDraft(cls); setEditingHeader({ cls, field: "name" }); }}
                            style={{ color: "#fff", fontWeight: 800, fontSize: 14, cursor: canEdit ? "pointer" : "default", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            title={canEdit ? "Clique para renomear" : cls}>{cls}</span>
                        )}
                        {canEdit && !isEditingName && (
                          <button onClick={() => deleteClass(cls)}
                            title="Excluir turma"
                            style={{ background: "transparent", border: "1px solid #7f1d1d60", color: "#ef4444", borderRadius: 5, fontSize: 11, fontWeight: 700, padding: "2px 6px", cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>✕</button>
                        )}
                      </div>
                      <div style={{ color: "#06b6d4", fontSize: 11, marginTop: 2 }}>{training?.shortName || training?.gcc || training?.name || "—"}</div>
                      {isEditingSC ? (
                        <input autoFocus type="number" min="0" value={headerDraft}
                          onChange={e => setHeaderDraft(e.target.value)}
                          onBlur={() => { updateStudentCount(cls, headerDraft); setEditingHeader(null); }}
                          onKeyDown={e => {
                            if (e.key === "Enter") { updateStudentCount(cls, headerDraft); setEditingHeader(null); }
                            if (e.key === "Escape") setEditingHeader(null);
                          }}
                          style={{ marginTop: 4, width: 80, padding: "2px 6px", background: "#01323d", border: "1px solid #06b6d4", borderRadius: 5, color: "#e2e8f0", fontSize: 11, outline: "none" }} />
                      ) : (
                        <div onClick={() => { if (!canEdit) return; setHeaderDraft(String(studentCount || "")); setEditingHeader({ cls, field: "students" }); }}
                          style={{ color: "#94a3b8", fontSize: 11, marginTop: 2, cursor: canEdit ? "pointer" : "default" }}
                          title={canEdit ? "Clique para editar nº de alunos" : ""}>
                          {studentCount ? `👥 ${studentCount} alunos` : (canEdit ? "👥 + alunos" : "")}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((slot, slotIdx) => (
                <tr key={slot.label}>
                  <td style={{ padding: 12, color: "#94a3b8", fontWeight: 700, fontSize: 12, borderTop: "1px solid #154753", background: "#01323d", position: "sticky", left: 0, zIndex: 1, verticalAlign: "top" }}>{slot.label}</td>
                  {classMeta.map(({ cls }) => {
                    const mods = getCellModules(cls, slot);
                    const conflict = cellLocalConflict(cls, slot);
                    const isHover = hoverDrop && hoverDrop.cls === cls && hoverDrop.slotIdx === slotIdx;
                    return (
                      <td key={cls + slot.label}
                        onDragOver={e => { e.preventDefault(); if (dragState?.kind === "module") setHoverDrop({ cls, slotIdx }); }}
                        onDragLeave={() => { if (isHover) setHoverDrop(null); }}
                        onDrop={e => onCellDrop(e, cls, slot)}
                        style={{ padding: 6, borderTop: "1px solid #154753", borderLeft: "1px solid #154753", verticalAlign: "top", minWidth: 240, background: isHover ? "rgba(6,182,212,0.12)" : (conflict ? "rgba(239,68,68,0.06)" : "transparent") }}>
                        {mods.length === 0 && <div style={{ color: "#1e4a56", fontSize: 11, textAlign: "center", padding: "12px 0" }}>—</div>}
                        {mods.map((m, mi) => {
                          const continues = !m.startsHere;
                          const localCol = localColor(m.local);
                          const moduleKey = m.rows[0]?.id;
                          const isEditingThisLocal = canEdit && editingLocal === moduleKey;
                          const hasTranslator = m.slots.some(s => s.isTranslator);
                          return (
                            <div key={mi}
                              draggable={m.startsHere && canEdit}
                              onDragStart={e => onModuleDragStart(e, cls, m)}
                              style={{ background: continues ? "rgba(255,255,255,0.03)" : "#0e3a45", border: `1px solid ${conflict ? "#ef4444" : "#154753"}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, cursor: m.startsHere && canEdit ? "grab" : "default", opacity: continues ? 0.5 : 1 }}>
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4, marginBottom: 2 }}>
                                <div style={{ color: "#fff", fontWeight: 700, fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.module}>
                                  {continues ? "↓ " : ""}{m.module}
                                </div>
                                {canEdit && m.startsHere && (
                                  <button onClick={() => deleteModule(m.rows)}
                                    title="Excluir este módulo da turma"
                                    style={{ background: "transparent", border: "1px solid #7f1d1d60", color: "#ef4444", borderRadius: 4, fontSize: 10, fontWeight: 700, padding: "1px 5px", cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>✕</button>
                                )}
                              </div>
                              <div style={{ color: "#64748b", fontSize: 10, marginBottom: 4 }}>{m.startTime}–{m.endTime}</div>
                              {isEditingThisLocal ? (() => {
                                const { free, busy } = getLocalAvailability(m, m.rows);
                                return (
                                  <select autoFocus value={m.local || ""}
                                    onChange={e => { updateModuleLocal(m.rows, e.target.value); setEditingLocal(null); }}
                                    onBlur={() => setEditingLocal(null)}
                                    style={{ marginBottom: 4, width: "100%", padding: "2px 4px", background: "#01323d", border: "1px solid #06b6d4", borderRadius: 4, color: "#e2e8f0", fontSize: 10, outline: "none" }}>
                                    <option value="">📍 — sem local —</option>
                                    {free.length > 0 && (
                                      <optgroup label={`Livres (${free.length})`}>
                                        {free.map(l => <option key={l.id} value={l.name} style={{ color: "#111" }}>{l.name}</option>)}
                                      </optgroup>
                                    )}
                                    {busy.length > 0 && (
                                      <optgroup label="Ocupados">
                                        {busy.map(l => <option key={l.id} value={l.name} style={{ color: "#111" }}>⚠ {l.name}</option>)}
                                      </optgroup>
                                    )}
                                  </select>
                                );
                              })() : (
                                <div onClick={() => canEdit && setEditingLocal(moduleKey)}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 4, background: (m.local ? localCol : "#475569") + "22", color: m.local ? localCol : "#94a3b8", fontSize: 10, fontWeight: 700, marginRight: 4, cursor: canEdit ? "pointer" : "default", border: `1px solid ${(m.local ? localCol : "#475569")}40` }}
                                  title={canEdit ? "Clique para alterar local" : (m.local || "Sem local")}>
                                  📍 {m.local || "— sem local —"}
                                </div>
                              )}
                              {m.slots.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                                  {m.slots.map(s => renderSlot(s, m, m.rows))}
                                </div>
                              )}
                              {canEdit && m.startsHere && (
                                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 6, paddingTop: 6, borderTop: "1px dashed #154753" }}>
                                  <button onClick={() => addAssistant(m.rows)} title="Adicionar slot de assistente"
                                    style={{ background: "transparent", border: "1px solid #154753", color: "#94a3b8", borderRadius: 4, fontSize: 9, fontWeight: 700, padding: "2px 6px", cursor: "pointer", lineHeight: 1.4 }}>+ Assist</button>
                                  <button onClick={() => removeLastAssistant(m.rows)} title="Remover último slot não-tradutor"
                                    style={{ background: "transparent", border: "1px solid #154753", color: "#94a3b8", borderRadius: 4, fontSize: 9, fontWeight: 700, padding: "2px 6px", cursor: "pointer", lineHeight: 1.4 }}>− Assist</button>
                                  <button onClick={() => toggleTranslator(m.rows)} title={hasTranslator ? "Remover tradutor" : "Adicionar tradutor"}
                                    style={{ background: hasTranslator ? "#06b6d420" : "transparent", border: `1px solid ${hasTranslator ? "#06b6d440" : "#154753"}`, color: hasTranslator ? "#06b6d4" : "#94a3b8", borderRadius: 4, fontSize: 9, fontWeight: 700, padding: "2px 6px", cursor: "pointer", lineHeight: 1.4 }}>{hasTranslator ? "🌐 −" : "🌐 +"}</button>
                                </div>
                              )}
                              {conflict && m.startsHere && (
                                <div style={{ color: "#ef4444", fontSize: 10, marginTop: 4, fontWeight: 700 }} title={`Local também usado por ${conflict.withClass}`}>⚠ Local em conflito com {conflict.withClass}</div>
                              )}
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {classNames.length > 0 && (
        <p style={{ color: "#1e4a56", fontSize: 11, marginTop: 12 }}>
          Clique nos nomes para editar instrutores · clique no 📍 para trocar o local · clique no nome da turma para renomear · use ✕ para excluir · arraste módulos entre turnos e turmas · arraste cabeçalhos para reordenar colunas. Borda vermelha = mesmo local em duas turmas no mesmo intervalo.
        </p>
      )}

      {showAdd && (
        <Modal title="Nova turma de piscina" onClose={() => setShowAdd(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Treinamento</label>
              <select value={addForm.trainingId} onChange={e => setAddForm(f => ({ ...f, trainingId: e.target.value }))}
                style={{ width: "100%", padding: 10, background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14 }}>
                <option value="">— Selecione —</option>
                {poolTrainings.map(t => (
                  <option key={t.id} value={t.id}>{t.shortName || t.gcc} — {t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Horário de início</label>
              <input type="time" value={addForm.startTime} onChange={e => setAddForm(f => ({ ...f, startTime: e.target.value }))}
                style={{ width: "100%", padding: 10, background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14 }} />
            </div>
            <div>
              <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Número de alunos</label>
              <input type="number" min="0" value={addForm.studentCount} onChange={e => setAddForm(f => ({ ...f, studentCount: e.target.value }))}
                style={{ width: "100%", padding: 10, background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14 }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={addForm.withTranslator} onChange={e => setAddForm(f => ({ ...f, withTranslator: e.target.checked }))} />
              🌐 Com tradutor
            </label>
            <div style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 8, padding: 10, fontSize: 12, color: "#94a3b8" }}>
              ℹ️ Você será levado ao wizard da Programação com os campos preenchidos. Avance pelo Step 2 e clique em Salvar para confirmar a turma. Ela aparecerá automaticamente no Lote ao voltar.
            </div>
            <Btn onClick={handleAddSubmit} label="Continuar no wizard" icon="check" color="#06b6d4" />
          </div>
        </Modal>
      )}

      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
    </div>
  );
};
