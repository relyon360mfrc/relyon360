// ── IA — SUGESTÃO DE ESCALA (criação de turmas em lote a partir de Excel) ─────
// Lê um .xlsx exportado de outro sistema (colunas por POSIÇÃO: A=GCC, B=data de
// início, C=tradução SIM/NÃO). Cada linha vira uma turma; o GCC é mapeado para um
// treinamento. Instrutores são atribuídos automaticamente por algoritmo guloso +
// reinício aleatório (keep-best): tenta arranjos até zerar conflitos de instrutor;
// se for impossível, cria a turma mesmo com conflito (o dashboard já sinaliza).
// Numeração de turma reusa nextClassNameG — mesma regra do wizard (T-XX por semana).
// As regras de alocação espelham Schedule._doInitPlan; este caminho é PURO (recebe
// a ocupação como parâmetro) para poder planejar o lote inteiro fora do React.
// Acesso: developer / admin / planejador (canPlan).

// ── Helpers puros de alocação (espelham as closures do componente Schedule) ───

// Fisher-Yates (espelha shuffleArr de schedule.js).
const aiShuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Ordena pool de qualificados (espelha orderQualified de schedule.js).
// previousIds vazio → ordem estrita por score desc.
// previousIds com elementos → embaralha e prioriza quem NÃO estava no arranjo anterior
// (usado nos reinícios do lote para variar a escolha e fugir de conflitos).
const aiOrderQualified = (pool, scoreMap, previousIds) => {
  const byScore = (a, b) => (scoreMap[b.id] || 0) - (scoreMap[a.id] || 0);
  if (!previousIds || previousIds.size === 0) return [...pool].sort(byScore);
  const arr = aiShuffle(pool);
  arr.sort((a, b) => {
    const ap = previousIds.has(String(a.id)) ? 1 : 0;
    const bp = previousIds.has(String(b.id)) ? 1 : 0;
    if (ap !== bp) return ap - bp;
    return byScore(a, b);
  });
  return arr;
};

// Grade horária — usa recalcTimes global (config.js, fonte única).
// chunkFactory específico do ai.js: mantém id original (id do banco não muda
// porque ai.js só sugere; não persiste). uid distinto por chunk para não colidir
// como key React.
const _aiChunkFactory = (item, isFirst, curDate, startStr, endStr, chunkIdx) => {
  if (isFirst) return { ...item, date: curDate, startTime: startStr, endTime: endStr };
  return { ...item, uid: `${item.uid}__c${chunkIdx}`, date: curDate, startTime: startStr, endTime: endStr };
};
const aiRecalcTimes = (items, startDateStr, startMins, dayEnd = DEFAULT_DAY_END, training = null) => {
  const lunch = resolveLunch(items[0], training);
  return recalcTimes(items, startDateStr, startMins, dayEnd, lunch, _aiChunkFactory);
};

// Opções de local para um módulo (espelha getLocalOpts; recebe areas por parâmetro).
const aiGetLocalOpts = (mod, training, areas, viewBase) => {
  if (!mod) return LOCALS;
  if (mod.locals && mod.locals.length > 0) return LOCALS.filter(l => mod.locals.includes(l.name));
  if (training?.inCompany) return LOCALS.filter(l => l.type === "In Company");
  const area = (areas || []).find(a => a.id === training?.area);
  const isCbinc = area && /CBINC|INCENDIO|INCÊNDIO/i.test(area.name);
  const bType = baseLocalType(viewBase);   // só locais da base física ativa (Macaé ≠ Bangu)
  return LOCALS.filter(l => {
    if (bType && l.type !== bType) return false;
    if (mod.type === "TEORIA") return l.env === "Teórico";
    if (mod.type === "PRÁTICA") { if (isCbinc) return l.subtype === "incendio"; return l.env === "Prático"; }
    return true;
  });
};

// Teto do dia em minutos (espelha getDayEndMin).
const aiDayEndMin = (training) => {
  if (!training || training.defaultSchedule !== false) return 17 * 60;
  return training.horarioFim ? timeToMins(training.horarioFim) : 21 * 60;
};

// Planeja UMA turma (puro). Mirror fiel de Schedule._doInitPlan, com duas diferenças:
//  1) recebe a ocupação (occupancyRows) por parâmetro e usa checkSlotConflictG;
//  2) quando não há instrutor livre+qualificado, NÃO deixa o slot vazio à toa —
//     primeiro tenta livre (sem conflito); só se ninguém estiver livre, força a
//     escolha de um qualificado ocupado (gera conflito proposital → dashboard sinaliza).
// Retorna { planItems, unstaffed } onde unstaffed = slots sem NENHUM instrutor com a
// skill (nem ignorando conflito) — esses ficam realmente vazios ("A definir").
const aiPlanTurma = (cfg) => {
  const { training, date, instructors = [], absences = [], holidays = [], areas = [], occupancyRows = [], viewBase = null } = cfg;
  if (!training || !date) return { planItems: [], unstaffed: 0, warnings: [] };
  const startTime = cfg.startTime || "08:00";
  const withTranslator = !!cfg.withTranslator;
  const wizLinks = (cfg.linkedClassNames || []).filter(Boolean);
  const previousIds = new Set((cfg.previousInstructorIds || []).map(String).filter(Boolean));
  // Preferências soft (lead/tradutor). Se o instrutor passa por TODOS os filtros (skill,
  // canLead p/ lead, ausência, feriado, conflito), ele entra direto. Senão segue greedy.
  // Cada preferência é consumida no PRIMEIRO módulo em que o respectivo slot existe.
  const preferredLeadId = cfg.preferredLeadId != null && cfg.preferredLeadId !== "" ? String(cfg.preferredLeadId) : null;
  const preferredTradId = cfg.preferredTradId != null && cfg.preferredTradId !== "" ? String(cfg.preferredTradId) : null;
  const preferredLeadInstr = preferredLeadId ? instructors.find(i => String(i.id) === preferredLeadId) : null;
  const preferredTradInstr = preferredTradId ? instructors.find(i => String(i.id) === preferredTradId) : null;
  let leadPreferenceConsumed = false;
  let tradPreferenceConsumed = false;
  const warnings = [];

  // Deduplica módulos pelo id
  const seen = new Set();
  const uniqueModules = (training.modules || []).filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });

  // Ordem: modo escolhido > ordem default (sortModules)
  let selectedMode = null;
  if (cfg.modeId) selectedMode = (training.modes || []).find(md => String(md.id) === String(cfg.modeId));
  const sorted = selectedMode
    ? selectedMode.moduleOrder.map(id => uniqueModules.find(m => m.id === id)).filter(Boolean)
    : sortModules(uniqueModules);

  const startMins = timeToMins(startTime);

  // Score: quantos módulos deste treinamento cada instrutor pode ministrar
  const instrScore = {};
  sorted.forEach(mod => {
    instructors.filter(i => (i.skills || []).some(s => skillMatchesModule(s, mod)))
      .forEach(i => { instrScore[i.id] = (instrScore[i.id] || 0) + 1; });
  });

  const moduleItems = sorted.map((mod, i) => ({ uid: `bi-${i}-${mod.id}`, mod, instructorId: "", local: "" }));
  const timed = aiRecalcTimes(moduleItems, date, startMins, aiDayEndMin(training), training);

  const preferredLocals = {};
  const committedInstrs = [];
  const committedTrad = [];
  let unstaffed = 0;

  const conflictFree = (d, st, et, instrId) =>
    !checkSlotConflictG(occupancyRows, d, st, et, String(instrId), null, null, wizLinks).instrConflict;

  const raw = timed.map((timedItem) => {
    const mod = timedItem.mod;
    const count = mod.instructorCount || 1;
    const localOpts = aiGetLocalOpts(mod, training, areas, viewBase);
    const estStart = timeToMins(timedItem.startTime);
    const estEnd = timeToMins(timedItem.endTime);

    // Elegíveis = não-ausente + não-feriado (conflito tratado depois).
    const baseEligible = instructors.filter(i =>
      !isInstructorAbsent(i.id, timedItem.date, estStart, estEnd, absences) &&
      !isHoliday(timedItem.date, i, holidays)
    );
    const skilled = baseEligible.filter(i => (i.skills || []).some(s => skillMatchesModule(s, mod)));
    const qualifiedFree = aiOrderQualified(skilled.filter(i => conflictFree(timedItem.date, timedItem.startTime, timedItem.endTime, i.id)), instrScore, previousIds);
    const qualifiedAny = aiOrderQualified(skilled, instrScore, previousIds);
    const leadFree = qualifiedFree.filter(q => (q.skills || []).some(s => skillMatchesModule(s, mod) && s.canLead));
    const leadAny = qualifiedAny.filter(q => (q.skills || []).some(s => skillMatchesModule(s, mod) && s.canLead));

    const isPoolTeam = isHuetModule(mod);
    const assignedIds = new Array(count).fill(null);
    const slotRoles = new Array(count).fill(null);

    for (let k = 0; k < count; k++) {
      let poolFree, poolAny;
      if (isPoolTeam) {
        const poolRole = getPoolTeamRole(k);
        if (poolRole) {
          slotRoles[k] = poolRole.code;
          const roleFilter = (i) =>
            hasValidCompetency(i, poolRole.requiresCompetency) &&
            (!poolRole.requiresDisciplineSkill || (i.skills || []).some(s => skillMatchesModule(s, mod))) &&
            (poolRole.code !== "Lead Instructor" || (i.skills || []).some(s => skillMatchesModule(s, mod) && s.canLead));
          const roleBase = baseEligible.filter(roleFilter);
          poolFree = aiOrderQualified(roleBase.filter(i => conflictFree(timedItem.date, timedItem.startTime, timedItem.endTime, i.id)), instrScore, previousIds);
          poolAny = aiOrderQualified(roleBase, instrScore, previousIds);
        } else {
          poolFree = qualifiedFree; poolAny = qualifiedAny;
        }
      } else {
        poolFree = k === 0 ? (leadFree.length > 0 ? leadFree : qualifiedFree) : qualifiedFree;
        poolAny = k === 0 ? (leadAny.length > 0 ? leadAny : qualifiedAny) : qualifiedAny;
      }
      let pick = null;
      // Soft preference: lead preferido entra no PRIMEIRO slot lead disponível (k=0,
      // não-pool). Tenta uma vez; se falha por qualquer motivo, segue greedy e marca aviso.
      if (k === 0 && !isPoolTeam && preferredLeadInstr && !leadPreferenceConsumed) {
        leadPreferenceConsumed = true;
        const p = preferredLeadInstr;
        const hasModSkill = (p.skills || []).some(s => skillMatchesModule(s, mod));
        const canLeadMod  = (p.skills || []).some(s => skillMatchesModule(s, mod) && s.canLead);
        const notAbsent   = !isInstructorAbsent(p.id, timedItem.date, estStart, estEnd, absences);
        const notHoliday  = !isHoliday(timedItem.date, p, holidays);
        const free        = conflictFree(timedItem.date, timedItem.startTime, timedItem.endTime, p.id);
        if (hasModSkill && canLeadMod && notAbsent && notHoliday && free && !assignedIds.includes(p.id)) {
          pick = p;
        } else {
          let reason = "indisponível";
          if (!hasModSkill) reason = "sem competência neste treinamento";
          else if (!canLeadMod) reason = "sem habilitação Lead";
          else if (!notAbsent) reason = "em ausência no dia";
          else if (!notHoliday) reason = "feriado para ele";
          else if (!free) reason = "horário ocupado";
          warnings.push({ kind: "lead-ignored", wantedName: p.name, reason });
        }
      }
      if (!pick) pick =
        poolFree.find(q => committedInstrs.includes(q.id) && !assignedIds.includes(q.id)) ||
        poolFree.find(q => !assignedIds.includes(q.id));
      if (!pick) {
        // fallback forçado: aceita conflito (mantém skill + disponibilidade de calendário)
        pick =
          poolAny.find(q => committedInstrs.includes(q.id) && !assignedIds.includes(q.id)) ||
          poolAny.find(q => !assignedIds.includes(q.id));
      }
      if (pick) {
        assignedIds[k] = pick.id;
        if (!committedInstrs.includes(pick.id)) committedInstrs.push(pick.id);
      } else {
        unstaffed++;
      }
    }

    // Local único para toda a equipe do módulo. Prefere o local já usado por este
    // módulo (preferredLocals) se ainda livre; senão o primeiro livre; senão o 1º da lista.
    let sharedLocal;
    const prev = preferredLocals[mod.id];
    const isLocalLivre = (name) => !checkSlotConflictG(occupancyRows, timedItem.date, timedItem.startTime, timedItem.endTime, null, name, null, wizLinks).localConflict;
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

    if (withTranslator) {
      const tradBase = baseEligible.filter(i => (i.skills || []).some(s => (s.name || s) === TRANSLATOR_SKILL));
      const tradFree = tradBase.filter(i => conflictFree(timedItem.date, timedItem.startTime, timedItem.endTime, i.id));
      const tradPoolFree = previousIds.size > 0 ? aiShuffle(tradFree) : tradFree;
      const tradPoolAny = previousIds.size > 0 ? aiShuffle(tradBase) : tradBase;
      let tradPick = null;
      // Soft preference: tradutor preferido entra no PRIMEIRO módulo da turma. Tenta
      // uma vez; se ele não tem skill TRADUTOR ou não está livre, segue greedy e marca aviso.
      if (preferredTradInstr && !tradPreferenceConsumed) {
        tradPreferenceConsumed = true;
        const p = preferredTradInstr;
        const hasTrad   = (p.skills || []).some(s => (s.name || s) === TRANSLATOR_SKILL);
        const notAbsent = !isInstructorAbsent(p.id, timedItem.date, estStart, estEnd, absences);
        const notHoliday = !isHoliday(timedItem.date, p, holidays);
        const free      = conflictFree(timedItem.date, timedItem.startTime, timedItem.endTime, p.id);
        if (hasTrad && notAbsent && notHoliday && free) {
          tradPick = p;
        } else {
          let reason = "indisponível";
          if (!hasTrad) reason = "sem competência TRADUTOR";
          else if (!notAbsent) reason = "em ausência no dia";
          else if (!notHoliday) reason = "feriado para ele";
          else if (!free) reason = "horário ocupado";
          warnings.push({ kind: "trad-ignored", wantedName: p.name, reason });
        }
      }
      if (!tradPick) tradPick =
        tradPoolFree.find(i => committedTrad.includes(i.id)) ||
        (previousIds.size > 0 ? tradPoolFree.find(i => !previousIds.has(String(i.id))) : null) ||
        tradPoolFree[0] || null;
      if (!tradPick) tradPick = tradPoolAny.find(i => committedTrad.includes(i.id)) || tradPoolAny[0] || null;
      if (tradPick && !committedTrad.includes(tradPick.id)) committedTrad.push(tradPick.id);
      if (!tradPick) unstaffed++;
      slots.push({ instructorId: tradPick ? String(tradPick.id) : "", local: sharedLocal, isTranslator: true });
    }

    return { ...timedItem, slots, hasTranslator: withTranslator };
  });

  // PROVA → REVISÃO/RESERVA herdam o instrutor da prova (espelha _doInitPlan passo 3)
  const provaItem = raw.find(item => /PROVA/i.test(item.mod.name) && !/TEMPO\s*RESERVA/i.test(item.mod.name));
  if (provaItem && provaItem.slots[0]?.instructorId) {
    const provaInstrId = provaItem.slots[0].instructorId;
    raw.forEach(item => {
      if (/REVIS[ÃA]O/i.test(item.mod.name) || /TEMPO\s*RESERVA/i.test(item.mod.name)) {
        item.slots = item.slots.map(s => ({ ...s, instructorId: provaInstrId }));
      }
    });
  }

  // Preferência informada mas nunca consumida = não havia slot adequado (módulo só pool team).
  if (preferredLeadInstr && !leadPreferenceConsumed) {
    warnings.push({ kind: "lead-ignored", wantedName: preferredLeadInstr.name, reason: "treinamento sem slot lead aplicável (módulos especiais)" });
  }
  if (preferredTradInstr && !tradPreferenceConsumed && !withTranslator) {
    warnings.push({ kind: "trad-ignored", wantedName: preferredTradInstr.name, reason: "linha sem tradução marcada" });
  }
  return { planItems: raw, unstaffed, warnings };
};

// Converte planItems → rows do schedule (espelha o flatMap de savePlan, incluindo a
// derivação de role por slot). studentCount fica vazio (preenchido depois pelo usuário).
const aiBuildRows = ({ planItems, training, className, classId, instructors, studentCount, viewBase = null }) => {
  const sc = studentCount != null && studentCount !== "" ? String(studentCount) : "";
  return planItems.flatMap(item => {
    const slots = item.slots || [{ instructorId: item.instructorId || "", local: item.local || "" }];
    const ntSlots = slots.filter(sl => !sl.isTranslator);
    return slots.map((slot) => {
      const instr = instructors.find(i => i.id === +slot.instructorId);
      const ntIdx = ntSlots.indexOf(slot);
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
        trainingId: training.id,
        trainingName: training.gcc,
        className,
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        local: slot.local || "",
        instructorId: +slot.instructorId || null,
        instructorName: instr?.name || "",
        module: item.mod.name,
        moduleId: item.mod.id,
        role: slotRole,
        studentCount: sc,
        base: viewBase || null,
        observation: "",
        // Status "Rascunho" = quarentena: instrutor não vê, sem push, planejador ajusta no calendário.
        // Vira "Programado" só ao aprovar pacote no histórico (aí dispara notificações).
        status: "Rascunho",
      };
    });
  });
};

// Planeja o LOTE inteiro: greedy + reinício aleatório (Opção A, keep-best).
// `rows` = linhas parseadas [{ rowNum, gcc, date, translate }]. Resolve o treinamento
// por GCC; linhas sem treinamento / sem data / sem módulos não são criadas. As demais
// são planejadas em ordem (data asc, depois escassez de instrutores) acumulando ocupação;
// a numeração (nextClassNameG) conta turmas já salvas + as do próprio lote. Reinicia até
// `restarts` vezes variando a escolha de instrutor; mantém o arranjo com menos conflitos.
const aiPlanBatch = ({ rows, trainings, instructors, absences = [], holidays = [], areas = [], existingSchedules = [], restarts = 8, viewBase = null }) => {
  const resolveT = (gcc) => trainings.find(t => String(t.gcc || "").trim().toUpperCase() === String(gcc || "").trim().toUpperCase());

  // Resolve nomes preferidos → instrutor.id (uma vez por linha). Marcas resolveWarnings
  // ficam pra anexar no result (ex: "nome ambíguo", "instrutor inativo/não cadastrado").
  const prepared = rows.map(line => {
    const training = resolveT(line.gcc);
    let preStatus = null;
    if (!training) preStatus = "no_training";
    else if (!line.date) preStatus = "no_date";
    else if (!(training.modules || []).length) preStatus = "no_modules";
    const resolveWarnings = [];
    let preferredLeadId = "", preferredTradId = "";
    if (line.preferredLeadName) {
      const { instructor, ambiguous } = aiResolveInstructorByName(line.preferredLeadName, instructors);
      if (instructor) preferredLeadId = String(instructor.id);
      else resolveWarnings.push({ kind: "lead-ignored", wantedName: line.preferredLeadName, reason: ambiguous ? "nome ambíguo (vários instrutores casam)" : "instrutor não encontrado no cadastro" });
    }
    if (line.preferredTradName) {
      const { instructor, ambiguous } = aiResolveInstructorByName(line.preferredTradName, instructors);
      if (instructor) preferredTradId = String(instructor.id);
      else resolveWarnings.push({ kind: "trad-ignored", wantedName: line.preferredTradName, reason: ambiguous ? "nome ambíguo (vários instrutores casam)" : "instrutor não encontrado no cadastro" });
    }
    return { line, training, preStatus, preferredLeadId, preferredTradId, resolveWarnings };
  });

  const plannable = prepared.filter(p => !p.preStatus);

  // Escassez: nº de instrutores que conseguem ministrar algum módulo do treinamento.
  // Menor escassez primeiro = turmas difíceis de montar pegam instrutor antes (greedy).
  const scarcity = (t) => {
    const ids = new Set();
    (t.modules || []).forEach(m => instructors.forEach(i => { if ((i.skills || []).some(s => skillMatchesModule(s, m))) ids.add(i.id); }));
    return ids.size;
  };
  const order = [...plannable].sort((a, b) => {
    if (a.line.date !== b.line.date) return a.line.date < b.line.date ? -1 : 1;
    return scarcity(a.training) - scarcity(b.training);
  });

  const buildAttempt = (lastPicks) => {
    let occupancy = [...existingSchedules];
    const out = [];
    const newLastPicks = {};
    order.forEach((p) => {
      const key = String(p.line.rowNum);
      const className = nextClassNameG(p.training, p.line.date, occupancy);
      const prevIds = lastPicks ? (lastPicks[key] || []) : [];
      const { planItems, unstaffed, warnings: planWarnings } = aiPlanTurma({
        training: p.training, date: p.line.date, startTime: "08:00",
        withTranslator: p.line.translate, instructors, absences, holidays, areas,
        occupancyRows: occupancy, previousInstructorIds: prevIds,
        preferredLeadId: p.preferredLeadId, preferredTradId: p.preferredTradId, viewBase,
      });
      const classId = newClassId();
      // studentCount vem da própria linha (col D ou form manual) — propaga pra cada row.
      const builtRows = aiBuildRows({ planItems, training: p.training, className, classId, instructors, studentCount: p.line.studentCount, viewBase });
      newLastPicks[key] = builtRows.map(r => r.instructorId).filter(Boolean).map(String);
      occupancy = occupancy.concat(builtRows);
      // Junta avisos: erro de resolução de nome (resolveWarnings) + algoritmo (planWarnings).
      // Dedup por kind+wantedName — se já avisamos que nome não foi encontrado, não precisa avisar de novo do algoritmo.
      const allWarnings = [...(p.resolveWarnings || []), ...(planWarnings || [])];
      const seen = new Set();
      const warnings = allWarnings.filter(w => {
        const k = w.kind + "|" + (w.wantedName || "");
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      out.push({ p, className, classId, builtRows, unstaffed, warnings });
    });

    // Conta conflitos de instrutor: cada row com instrutor vs. ocupação final (exceto ela mesma)
    const allBuilt = out.flatMap(o => o.builtRows);
    const finalOccupancy = existingSchedules.concat(allBuilt);
    let totalConflicts = 0;
    out.forEach(o => {
      let c = 0;
      o.builtRows.forEach(r => {
        if (!r.instructorId) return;
        const others = finalOccupancy.filter(x => x !== r);
        if (checkSlotConflictG(others, r.date, r.startTime, r.endTime, r.instructorId, r.local, null, null).instrConflict) c++;
      });
      o.conflicts = c;
      totalConflicts += c;
    });
    return { out, totalConflicts, lastPicks: newLastPicks };
  };

  let best = buildAttempt(null);
  for (let r = 1; r <= restarts && best.totalConflicts > 0; r++) {
    const cand = buildAttempt(best.lastPicks);
    if (cand.totalConflicts < best.totalConflicts) best = cand;
  }

  const planByRow = {};
  best.out.forEach(o => { planByRow[String(o.p.line.rowNum)] = o; });
  const results = prepared.map(p => {
    if (p.preStatus) return { line: p.line, training: p.training || null, status: p.preStatus, className: "", rows: [], conflicts: 0, unstaffed: 0, warnings: p.resolveWarnings || [] };
    const o = planByRow[String(p.line.rowNum)];
    const status = o.conflicts > 0 ? "conflict" : (o.unstaffed > 0 ? "unstaffed" : "ok");
    return { line: p.line, training: p.training, status, className: o.className, rows: o.builtRows, conflicts: o.conflicts, unstaffed: o.unstaffed, warnings: o.warnings || [] };
  });

  const created = results.filter(r => r.status === "ok" || r.status === "conflict" || r.status === "unstaffed");
  return {
    results,
    totalCreated: created.length,
    totalConflicts: best.totalConflicts,
    totalSkipped: results.length - created.length,
    allRows: created.flatMap(r => r.rows),
  };
};

// ── Parser da planilha (SheetJS global XLSX) ──────────────────────────────────
// Lê por POSIÇÃO de coluna (A=0 GCC, B=1 data, C=2 tradução) — os headers do relatório
// têm acento e variam, então não confiamos no nome. A primeira linha é cabeçalho.
const aiCellToISO = (v) => {
  if (v == null || v === "") return "";
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return "";
};

const aiNormalizeYesNo = (v) => {
  if (v == null) return false;
  const s = String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
  if (!s) return false;
  return s === "SIM" || s === "S" || s === "YES" || s === "Y" || s === "TRUE" || s === "1";
};

// Normaliza texto pra fuzzy match (sem acento, lowercase, trim).
const aiNorm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Resolve "nome" → instrutor por nome cheio, primeiro+último, primeiro só, ou apelido.
// Retorna { instructor, ambiguous } — ambiguous=true quando match único não foi possível.
const aiResolveInstructorByName = (raw, instructors) => {
  if (!raw || !instructors || !instructors.length) return { instructor: null, ambiguous: false };
  const q = aiNorm(raw);
  if (!q) return { instructor: null, ambiguous: false };
  const candidates = instructors.filter(i => i && i.status !== "Inativo");
  const exact = candidates.filter(i => aiNorm(i.name) === q);
  if (exact.length === 1) return { instructor: exact[0], ambiguous: false };
  if (exact.length > 1) return { instructor: null, ambiguous: true };
  // Primeiro + último (ex: "joao silva" casa "Joao Carlos da Silva")
  const parts = q.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0], last = parts[parts.length - 1];
    const fl = candidates.filter(i => {
      const p = aiNorm(i.name).split(/\s+/);
      return p.length > 0 && p[0] === first && p[p.length - 1] === last;
    });
    if (fl.length === 1) return { instructor: fl[0], ambiguous: false };
    if (fl.length > 1) return { instructor: null, ambiguous: true };
  }
  // Contains (último recurso — só se único)
  const contains = candidates.filter(i => aiNorm(i.name).includes(q));
  if (contains.length === 1) return { instructor: contains[0], ambiguous: false };
  if (contains.length > 1) return { instructor: null, ambiguous: true };
  return { instructor: null, ambiguous: false };
};

// Converte célula → quantidade de alunos (inteiro >=0). Vazio/inválido → "".
const aiCellToStudents = (v) => {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? String(n) : "";
};

const aiParseSheet = (data) => {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });
  const out = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r) continue;
    const gccRaw = r[0];
    if (gccRaw == null || String(gccRaw).trim() === "") continue;
    out.push({
      rowNum: i + 1,
      gcc: String(gccRaw).trim().toUpperCase(),
      date: aiCellToISO(r[1]),
      translate: aiNormalizeYesNo(r[2]),
      // Novos campos opcionais (D, E, F). Resolução de nome → instructor acontece no plan batch.
      studentCount: aiCellToStudents(r[3]),
      preferredLeadName: r[4] != null && String(r[4]).trim() !== "" ? String(r[4]).trim() : "",
      preferredTradName: r[5] != null && String(r[5]).trim() !== "" ? String(r[5]).trim() : "",
    });
  }
  return out;
};

// ── Página ────────────────────────────────────────────────────────────────────

// Formata data ISO (YYYY-MM-DD) → pt-BR (DD/MM/AAAA). Tolerante a vazio/inválido.
const fmtDateBR = (d) => {
  if (!d) return "";
  try {
    const dt = new Date(d + "T12:00:00");
    if (isNaN(dt)) return String(d);
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return String(d); }
};

// Formata timestamp ISO completo → "DD/MM/AAAA HH:MM". Tolerante a vazio/inválido.
const fmtDateTimeBR = (iso) => {
  if (!iso) return "";
  try {
    const dt = new Date(iso);
    if (isNaN(dt)) return String(iso);
    return dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return String(iso); }
};

// Rótulo da origem do pacote (planilha xlsx, criação manual ou misto).
const AI_PKG_SOURCE_LABEL = { xlsx: "📂 Planilha", manual: "✍️ Manual", mixed: "Planilha + Manual" };

// Spinner inline reutilizável (usa @keyframes spin definido no index.html).
const InlineSpinner = ({ text, color = "#ffa619" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "#01323d", border: "1px solid #154753", borderRadius: 10, marginTop: 14 }}>
    <span style={{ width: 20, height: 20, border: "2.5px solid " + color + "33", borderTopColor: color, borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
    <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{text}</span>
  </div>
);

const AI_STATUS_META = {
  ok:          { label: "✅ Pronta",             color: "#16a34a" },
  conflict:    { label: "⚠ Com conflito",        color: "#ef4444" },
  unstaffed:   { label: "⚠ Sem instrutor",       color: "#f59e0b" },
  no_training: { label: "❌ GCC não encontrado",  color: "#64748b" },
  no_date:     { label: "❌ Data inválida",       color: "#64748b" },
  no_modules:  { label: "❌ Sem módulos",         color: "#64748b" },
};

const AiPage = ({ schedules, setSchedules, trainings, instructors, absences, holidays, areas, user, aiPackages = [], setAiPackages, viewBase = null }) => {
  const [linhas, setLinhas] = useState([]);
  const [fileName, setFileName] = useState("");
  const [parseErr, setParseErr] = useState("");
  const [batch, setBatch] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [reading, setReading] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [guard, setGuard] = useState({ show: false, action: null, pass: "", err: "", msg: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ gcc: "", date: "", translate: false, studentCount: "", preferredLeadName: "", preferredTradName: "" });
  const [addedFlash, setAddedFlash] = useState(0);
  const [expandedPkg, setExpandedPkg] = useState(null);
  const [editPkg, setEditPkg]   = useState(null);
  const [editName, setEditName] = useState("");
  const [editNote, setEditNote] = useState("");
  const [removeIds, setRemoveIds] = useState([]);
  const [delGuard, setDelGuard] = useState({ show: false, action: null, pass: "", err: "" });

  if (!canPlan(user)) {
    return (
      <div>
        <h2 style={{ color: "#fff", fontWeight: 800, margin: "0 0 4px", fontSize: 24 }}>IA — Sugestão de Escala</h2>
        <p style={{ color: "#f87171", margin: "16px 0", fontSize: 14 }}>Você não tem permissão para criar escalas. Esta função é restrita a planejadores e administradores.</p>
      </div>
    );
  }

  const handleFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFileName(f.name); setParseErr(""); setBatch(null); setCommitted(false); setLinhas([]);
    setReading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      // Adia o parse um tick para o spinner renderizar antes de a thread travar (planilhas grandes).
      setTimeout(() => {
        try {
          const parsed = aiParseSheet(new Uint8Array(ev.target.result));
          if (!parsed.length) setParseErr("Nenhuma linha de turma encontrada. Confira se os dados começam na linha 2 e se a coluna A (GCC) está preenchida.");
          else setLinhas(parsed);
        } catch (err) {
          setParseErr("Falha ao ler a planilha: " + (err && err.message ? err.message : String(err)));
        }
        setReading(false);
      }, 50);
    };
    reader.onerror = () => { setParseErr("Erro ao ler o arquivo."); setReading(false); };
    reader.readAsArrayBuffer(f);
    e.target.value = "";
  };

  const gerar = () => {
    if (!linhas.length) return;
    setPlanning(true); setBatch(null); setCommitted(false); setParseErr("");
    setTimeout(() => {
      try {
        const result = aiPlanBatch({ rows: linhas, trainings, instructors, absences: absences || [], holidays: holidays || [], areas: areas || [], existingSchedules: schedules, restarts: 8, viewBase });
        setBatch(result);
      } catch (err) {
        setParseErr("Falha ao gerar a escala: " + (err && err.message ? err.message : String(err)));
      }
      setPlanning(false);
    }, 50);
  };

  const resolveTraining = (gcc) => trainings.find(t => String(t.gcc || "").trim().toUpperCase() === String(gcc || "").trim().toUpperCase());

  const openCreate = () => { setForm({ gcc: "", date: "", translate: false, studentCount: "", preferredLeadName: "", preferredTradName: "" }); setAddedFlash(0); setShowCreate(true); };

  const addManualLine = () => {
    if (!form.gcc || !form.date) return;
    const nextNum = (linhas.length ? Math.max(...linhas.map(l => l.rowNum)) : 1) + 1;
    setLinhas(prev => [...prev, {
      rowNum: nextNum,
      gcc: String(form.gcc).trim().toUpperCase(),
      date: form.date,
      translate: !!form.translate,
      studentCount: form.studentCount || "",
      preferredLeadName: form.preferredLeadName || "",
      preferredTradName: form.preferredTradName || "",
      manual: true,
    }]);
    setBatch(null); setCommitted(false); setParseErr("");
    // Mantém data e preferências entre adições — geralmente são as mesmas pra um mesmo dia/instrutor.
    setForm(prev => ({ gcc: "", date: prev.date, translate: false, studentCount: "", preferredLeadName: prev.preferredLeadName, preferredTradName: prev.preferredTradName }));
    setAddedFlash(f => f + 1);
  };

  const removeLine = (rowNum) => {
    setLinhas(prev => prev.filter(l => l.rowNum !== rowNum));
    setBatch(null); setCommitted(false);
  };

  const clearLines = () => { setLinhas([]); setFileName(""); setBatch(null); setCommitted(false); setParseErr(""); };

  const doCommit = () => {
    if (!batch || !batch.allRows.length) return;
    // Rascunho é quarentena: instrutor não vê, push só dispara ao aprovar o pacote
    // (no histórico abaixo). Silencia o diff automático do setSchedules.
    if (typeof window.__skipNextNotifications === 'function') window.__skipNextNotifications();
    setSchedules(prev => [...prev, ...batch.allRows]);
    // Registra o pacote (lote) no LOG persistido.
    const created = batch.results.filter(r => (r.status === "ok" || r.status === "conflict" || r.status === "unstaffed") && r.rows && r.rows.length);
    const classes = created.map(r => ({
      classId: r.rows[0].classId,
      className: r.className || "",
      trainingId: r.training ? r.training.id : null,
      trainingName: r.training ? (r.training.name || r.training.gcc || "") : "",
      gcc: r.line.gcc || (r.training ? r.training.gcc : "") || "",
      date: r.line.date || "",
      status: r.status,
      rowCount: r.rows.length,
      conflicts: r.conflicts || 0,
      unstaffed: r.unstaffed || 0,
      withTranslator: !!r.line.translate,
    })).filter(c => c.classId);
    if (classes.length) {
      const srcSet = new Set(created.map(r => r.line.manual ? "manual" : "xlsx"));
      const nextVersion = (aiPackages || []).reduce((m, p) => Math.max(m, p.version || 0), 0) + 1;
      const pkg = {
        id: `pkg-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        version: nextVersion,
        createdAt: new Date().toISOString(),
        createdBy: user?.name || user?.username || "—",
        createdById: user?.id != null ? String(user.id) : null,
        name: "", note: "",
        source: srcSet.size > 1 ? "mixed" : (srcSet.values().next().value || "xlsx"),
        fileName: fileName || "",
        totalCreated: classes.length,
        totalConflicts: batch.totalConflicts || 0,
        totalUnstaffed: created.filter(r => r.status === "unstaffed").length,
        classes,
      };
      setAiPackages(prev => [pkg, ...(prev || [])]);
    }
    setCommitted(true);
  };

  const commit = () => {
    if (!batch || !batch.allRows.length) return;
    const todayIso = new Date().toISOString().split("T")[0];
    const max = new Date(); max.setDate(max.getDate() + 30);
    const maxIso = max.toISOString().split("T")[0];
    const needPass = batch.results.some(r => (r.status === "ok" || r.status === "conflict" || r.status === "unstaffed") && r.line.date && (r.line.date < todayIso || r.line.date > maxIso));
    if (needPass) {
      setGuard({ show: true, action: doCommit, pass: "", err: "", msg: "Há turmas com data no passado ou a mais de 30 dias no futuro. Digite sua senha para confirmar a criação em lote." });
      return;
    }
    doCommit();
  };

  // ——— LOG de pacotes: editar / excluir / desfazer lote ———
  const existingClassIds = new Set(schedules.map(s => s.classId));
  const removeClasses = (classIds) => {
    const ids = [...new Set((classIds || []).filter(Boolean))];
    if (!ids.length) return;
    ids.forEach(cid => { try { _deleteSchedulesByClassId(cid); } catch {} });
    setSchedules(prev => prev.filter(s => !ids.includes(s.classId)));
  };
  const openEdit = (pkg) => { setEditPkg(pkg); setEditName(pkg.name || ""); setEditNote(pkg.note || ""); setRemoveIds([]); };
  const closeEdit = () => { setEditPkg(null); setRemoveIds([]); };
  const toggleRemove = (cid) => setRemoveIds(prev => prev.includes(cid) ? prev.filter(x => x !== cid) : [...prev, cid]);
  const applyEdit = () => {
    const ids = [...removeIds];
    if (ids.length) removeClasses(ids);
    setAiPackages(prev => (prev || []).map(p => p.id === editPkg.id
      ? { ...p, name: editName.trim(), note: editNote.trim(), classes: (p.classes || []).filter(c => !ids.includes(c.classId)) }
      : p));
    closeEdit();
  };
  const saveEdit = () => { if (!editPkg) return; if (removeIds.length) setDelGuard({ show: true, pass: "", err: "", action: applyEdit }); else applyEdit(); };
  const askDeletePackage = (pkg) => setDelGuard({ show: true, pass: "", err: "", action: () => {
    removeClasses((pkg.classes || []).map(c => c.classId));
    setAiPackages(prev => (prev || []).filter(p => p.id !== pkg.id));
    if (expandedPkg === pkg.id) setExpandedPkg(null);
  }});

  // ——— APROVAÇÃO DE PACOTE (sai da quarentena) ———
  // Rows ainda em Rascunho do pacote, agrupadas por classId.
  const draftRowsByPkg = (pkg) => {
    const classIds = new Set((pkg.classes || []).map(c => c.classId));
    if (!classIds.size) return [];
    return schedules.filter(s => classIds.has(s.classId) && isDraftRow(s));
  };
  // Aprova: Rascunho → Pendente em massa + dispara notificações "Novo módulo".
  // O setSchedules vai diffar status (não campo crítico), então o gerador automático
  // não dispara — mandamos manualmente via createNotification.
  const _doApprovePackage = (pkg) => {
    const drafts = draftRowsByPkg(pkg);
    if (!drafts.length) return;
    const classIds = new Set((pkg.classes || []).map(c => c.classId));
    const todayIso = new Date().toISOString().split("T")[0];
    setSchedules(prev => prev.map(s =>
      (classIds.has(s.classId) && isDraftRow(s))
        ? { ...s, status: "Programado" }
        : s
    ));
    setAiPackages(prev => (prev || []).map(p => p.id === pkg.id
      ? { ...p, approvedAt: new Date().toISOString(), approvedBy: user?.name || user?.username || "—" }
      : p));
    // Notifica cada instrutor (uma notif por row futura — espelha o que generateNotificationsFromScheduleDiff faria pra INSERT novo).
    if (typeof window.__createNotification === 'function') {
      drafts.forEach(r => {
        if (!r.instructorId || r.date < todayIso) return;
        const fmt = d => { try { return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }); } catch { return d; } };
        window.__createNotification({
          instructorId: r.instructorId,
          type: 'new_module',
          title: `Novo módulo: ${r.module || r.trainingName || 'Treinamento'}`,
          body: `${r.className} · ${fmt(r.date)} · ${r.startTime}–${r.endTime} · ${r.local || ''}`,
          linkClassId: r.classId,
          linkScheduleId: r.id,
        });
      });
    }
  };
  // Guard de senha quando o pacote tem turma fora da janela [hoje, hoje+30d].
  const askApprovePackage = (pkg) => {
    const drafts = draftRowsByPkg(pkg);
    if (!drafts.length) return;
    const todayIso = new Date().toISOString().split("T")[0];
    const max = new Date(); max.setDate(max.getDate() + 30);
    const maxIso = max.toISOString().split("T")[0];
    const needPass = drafts.some(r => r.date && (r.date < todayIso || r.date > maxIso));
    if (needPass) {
      setGuard({ show: true, action: () => _doApprovePackage(pkg), pass: "", err: "", msg: "Há turmas com data no passado ou a mais de 30 dias no futuro. Digite sua senha para aprovar o pacote e notificar os instrutores." });
      return;
    }
    _doApprovePackage(pkg);
  };

  const td = { padding: "10px 12px", fontSize: 13, color: "#e2e8f0", borderBottom: "1px solid #154753", textAlign: "left", verticalAlign: "top" };
  const th = { padding: "10px 12px", fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left", borderBottom: "1px solid #154753" };

  return (
    <div>
      <h2 style={{ color: "#fff", fontWeight: 800, margin: "0 0 4px", fontSize: 24 }}>IA — Sugestão de Escala</h2>
      <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 14 }}>Cria turmas em lote a partir de uma planilha Excel, atribuindo instrutores automaticamente e evitando conflitos</p>

      {/* Passo 1 — upload */}
      <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", background: "linear-gradient(135deg,#ffa619,#e8920a)", color: "#01323d", fontWeight: 700, fontSize: 14, padding: "11px 18px", borderRadius: 10 }}>
            📂 Escolher planilha (.xlsx)
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
          </label>
          {fileName && <span style={{ color: "#e2e8f0", fontSize: 13 }}>{fileName} · <strong style={{ color: "#ffa619" }}>{linhas.length}</strong> linha(s)</span>}
          <span style={{ color: "#475569", fontSize: 13 }}>ou</span>
          <Btn onClick={openCreate} label="Criar turma manualmente" icon="plus" color="#0891b2" />
        </div>
        <div style={{ marginTop: 14, background: "#01323d", border: "1px solid #154753", borderRadius: 8, padding: "10px 14px" }}>
          <p style={{ color: "#94a3b8", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
            Formato esperado (a partir da linha 2): <strong style={{ color: "#e2e8f0" }}>A</strong> = GCC ·
            <strong style={{ color: "#e2e8f0" }}> B</strong> = data início ·
            <strong style={{ color: "#e2e8f0" }}> C</strong> = tradução (SIM/NÃO) ·
            <strong style={{ color: "#e2e8f0" }}> D</strong> = alunos (opcional) ·
            <strong style={{ color: "#e2e8f0" }}> E</strong> = lead preferido (nome, opcional) ·
            <strong style={{ color: "#e2e8f0" }}> F</strong> = tradutor preferido (nome, opcional).
            <br />Turmas criadas ficam em <strong style={{ color: "#cbd5e1" }}>🟡 Rascunho</strong> — instrutor só vê depois de você aprovar o pacote.
          </p>
        </div>
        {reading && <InlineSpinner text="Lendo planilha..." />}
        {parseErr && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14, padding: "12px 14px", background: "#7f1d1d33", border: "1px solid #ef444466", borderRadius: 10 }}>
            <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.4 }}>⚠️</span>
            <p style={{ color: "#fca5a5", fontSize: 13, margin: 0, lineHeight: 1.5 }}>{parseErr}</p>
          </div>
        )}
        {linhas.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Turmas na fila ({linhas.length})</span>
              <button onClick={clearLines} style={{ background: "none", border: "1px solid #154753", borderRadius: 6, color: "#94a3b8", fontSize: 12, padding: "4px 10px", cursor: "pointer" }}>Limpar lista</button>
            </div>
            <div style={{ background: "#01323d", border: "1px solid #154753", borderRadius: 8, maxHeight: 260, overflowY: "auto" }}>
              {linhas.map((l) => {
                const t = resolveTraining(l.gcc);
                return (
                  <div key={l.rowNum} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid #0c2f39" }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ color: t ? "#e2e8f0" : "#f87171", fontSize: 13, fontWeight: 600 }}>{l.gcc}</span>
                      {t && <span style={{ color: "#64748b", fontSize: 12 }}> · {t.name || ""}</span>}
                      {!t && <span style={{ color: "#f87171", fontSize: 11 }}> · GCC não encontrado</span>}
                    </span>
                    <span style={{ color: "#94a3b8", fontSize: 12, flexShrink: 0 }}>{l.date ? fmtDateBR(l.date) : <span style={{ color: "#f87171" }}>sem data</span>}</span>
                    {l.studentCount && <span title="Alunos" style={{ color: "#94a3b8", fontSize: 12, flexShrink: 0 }}>👥 {l.studentCount}</span>}
                    {l.preferredLeadName && <span title={`Lead preferido: ${l.preferredLeadName}`} style={{ color: "#ffa619", fontSize: 11, flexShrink: 0, background: "#ffa61915", padding: "2px 6px", borderRadius: 4 }}>★ {l.preferredLeadName.split(" ")[0]}</span>}
                    {l.translate && <span title="Com tradução" style={{ color: "#0891b2", fontSize: 12, flexShrink: 0 }}>🌐</span>}
                    {l.preferredTradName && <span title={`Tradutor preferido: ${l.preferredTradName}`} style={{ color: "#06b6d4", fontSize: 11, flexShrink: 0, background: "#06b6d415", padding: "2px 6px", borderRadius: 4 }}>★ {l.preferredTradName.split(" ")[0]}</span>}
                    <button onClick={() => removeLine(l.rowNum)} title="Remover da fila" style={{ flexShrink: 0, background: "none", border: "1px solid #154753", borderRadius: 4, color: "#94a3b8", fontSize: 13, lineHeight: 1, padding: "2px 8px", cursor: "pointer" }}>×</button>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 16 }}>
              <Btn onClick={gerar} label={planning ? "Gerando escala..." : "Gerar Sugestão de Escala"} icon="ai" color={planning ? "#154753" : "linear-gradient(135deg,#ffa619,#e8920a)"} disabled={planning} />
              {planning && <InlineSpinner text="Montando a escala e distribuindo instrutores… isto pode levar alguns segundos." />}
            </div>
          </div>
        )}
      </div>

      {/* Passo 2 — preview / resolução */}
      {batch && (
        <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3 style={{ color: "#fff", margin: 0, fontWeight: 700 }}>✨ Pré-visualização</h3>
              <p style={{ color: "#94a3b8", fontSize: 13, margin: "6px 0 0" }}>
                <strong style={{ color: "#16a34a" }}>{batch.totalCreated}</strong> turma(s) a criar ·
                {batch.totalConflicts > 0
                  ? <strong style={{ color: "#ef4444" }}> {batch.totalConflicts} conflito(s) de instrutor</strong>
                  : <strong style={{ color: "#16a34a" }}> sem conflitos</strong>} ·
                <strong style={{ color: "#64748b" }}> {batch.totalSkipped} ignorada(s)</strong>
              </p>
            </div>
            {!committed
              ? <Btn onClick={commit} label={`Criar ${batch.totalCreated} turma(s)`} color="#16a34a" icon="check" disabled={batch.totalCreated === 0} />
              : <span style={{ color: "#16a34a", fontWeight: 700, fontSize: 14 }}>✅ {batch.totalCreated} turma(s) criada(s)!</span>}
          </div>

          {committed && (() => {
            const nUnstaffed = batch.results.filter(r => r.status === "unstaffed").length;
            const hasIssues = batch.totalConflicts > 0 || nUnstaffed > 0;
            if (!hasIssues) {
              return (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#16a34a20", border: "1px solid #16a34a55", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
                  <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.3 }}>✅</span>
                  <p style={{ color: "#4ade80", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                    <strong>{batch.totalCreated} turma(s) criada(s) com sucesso!</strong> Lembre-se de preencher a <strong>quantidade de alunos</strong> de cada turma na Programação.
                  </p>
                </div>
              );
            }
            return (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#f59e0b20", border: "1px solid #f59e0b66", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
                <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.3 }}>⚠️</span>
                <p style={{ color: "#fcd34d", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                  <strong>{batch.totalCreated} turma(s) criada(s)</strong> — mas com pendências:{" "}
                  {batch.totalConflicts > 0 && <span>{batch.totalConflicts} conflito(s) de instrutor não resolvido(s)</span>}
                  {batch.totalConflicts > 0 && nUnstaffed > 0 && <span> · </span>}
                  {nUnstaffed > 0 && <span>{nUnstaffed} turma(s) com slot sem instrutor</span>}.
                  {" "}Revise no <strong>Dashboard</strong> e preencha a quantidade de alunos de cada turma.
                </p>
              </div>
            );
          })()}

          <div className="tbl-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={th}>Linha</th>
                  <th style={th}>GCC</th>
                  <th style={th}>Treinamento</th>
                  <th style={th}>Data</th>
                  <th style={th}>Alunos</th>
                  <th style={th}>Trad.</th>
                  <th style={th}>Turma</th>
                  <th style={th}>Status</th>
                  <th style={th}>Avisos</th>
                </tr>
              </thead>
              <tbody>
                {batch.results.map((r, i) => {
                  const meta = AI_STATUS_META[r.status] || { label: r.status, color: "#64748b" };
                  const warnings = r.warnings || [];
                  // Para cada warning, busca quem foi escolhido no slot afetado (lead = primeiro slot não-trad; trad = slot isTranslator).
                  // Mensagem fica "Lead X ocupado → caiu para Y".
                  const firstRow = (r.rows || [])[0];
                  const tradRow = (r.rows || []).find(rw => rw.role === "Translator");
                  const fallbackLeadName = firstRow ? (firstRow.instructorName || "—") : "ninguém";
                  const fallbackTradName = tradRow ? (tradRow.instructorName || "—") : "ninguém";
                  return (
                    <tr key={i}>
                      <td style={td}>{r.line.rowNum}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.line.gcc}</td>
                      <td style={td}>{r.training ? (r.training.name || r.training.gcc) : <span style={{ color: "#64748b" }}>—</span>}</td>
                      <td style={td}>{r.line.date ? fmtDateBR(r.line.date) : <span style={{ color: "#f87171" }}>—</span>}</td>
                      <td style={td}>{r.line.studentCount ? <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{r.line.studentCount}</span> : <span style={{ color: "#475569" }}>—</span>}</td>
                      <td style={td}>{r.line.translate ? "🌐 Sim" : "Não"}</td>
                      <td style={td}>{r.className || <span style={{ color: "#64748b" }}>—</span>}</td>
                      <td style={td}>
                        <span style={{ color: meta.color, fontWeight: 600, fontSize: 12 }}>{meta.label}</span>
                        {r.status === "conflict" && <span style={{ color: "#94a3b8", fontSize: 11, display: "block" }}>{r.conflicts} slot(s) em conflito</span>}
                        {r.status === "unstaffed" && <span style={{ color: "#94a3b8", fontSize: 11, display: "block" }}>{r.unstaffed} slot(s) sem instrutor</span>}
                      </td>
                      <td style={td}>
                        {warnings.length === 0 ? <span style={{ color: "#475569", fontSize: 11 }}>—</span> : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {warnings.map((w, wi) => {
                              const isLead = w.kind === "lead-ignored";
                              const fallback = isLead ? fallbackLeadName : fallbackTradName;
                              return (
                                <span key={wi} style={{ color: "#f59e0b", fontSize: 11, lineHeight: 1.3 }}>
                                  {isLead ? "Lead" : "Trad."}: <strong>{w.wantedName}</strong> {w.reason} → <strong>{fallback}</strong>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Passo 4 — LOG / histórico de pacotes (lotes) criados */}
      <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: (aiPackages && aiPackages.length) ? 16 : 0 }}>
          <h3 style={{ color: "#fff", fontWeight: 700, margin: 0, fontSize: 16 }}>📦 Histórico de pacotes</h3>
          {aiPackages && aiPackages.length > 0 && (
            <span style={{ color: "#64748b", fontSize: 12 }}>{aiPackages.length} pacote(s) registrado(s)</span>
          )}
        </div>
        {(!aiPackages || aiPackages.length === 0) ? (
          <p style={{ color: "#64748b", fontSize: 13, margin: "8px 0 0" }}>Nenhum pacote criado ainda. Cada lote criado pela IA aparece aqui, com versão, data, autor e a lista de turmas lançadas.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {aiPackages.map(pkg => {
              const isOpen = expandedPkg === pkg.id;
              const cls = pkg.classes || [];
              const liveCount = cls.filter(c => existingClassIds.has(c.classId)).length;
              const removedCount = cls.length - liveCount;
              const drafts = draftRowsByPkg(pkg);
              const draftClassIds = new Set(drafts.map(s => s.classId));
              const draftClassCount = draftClassIds.size;
              const isAwaiting = draftClassCount > 0;
              const wasApproved = !!pkg.approvedAt;
              return (
                <div key={pkg.id} style={{ background: "#01323d", border: "1px solid " + (isAwaiting ? "#64748b80" : "#154753"), borderRadius: 12, overflow: "hidden" }}>
                  <div onClick={() => setExpandedPkg(isOpen ? null : pkg.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}>
                    <span style={{ color: "#475569", fontSize: 12, flexShrink: 0, width: 14 }}>{isOpen ? "▼" : "▶"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{pkg.name || `Pacote #${pkg.version}`}</span>
                        <span style={{ background: "#ffa61920", color: "#ffa619", fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 6 }}>v{pkg.version}</span>
                        <span style={{ color: "#64748b", fontSize: 12 }}>{AI_PKG_SOURCE_LABEL[pkg.source] || pkg.source}</span>
                        {isAwaiting && (
                          <span title="Pacote em quarentena — instrutores ainda não veem essas turmas" style={{ background: "#64748b30", color: "#cbd5e1", fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid #64748b80" }}>
                            🟡 Aguardando aprovação ({draftClassCount})
                          </span>
                        )}
                        {!isAwaiting && wasApproved && (
                          <span style={{ background: "#16a34a20", color: "#4ade80", fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 6 }}>
                            ✅ Aprovado em {fmtDateTimeBR(pkg.approvedAt)}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>🕒 {fmtDateTimeBR(pkg.createdAt)}</span>
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>👤 {pkg.createdBy}</span>
                        <span style={{ color: "#4ade80", fontSize: 12 }}>{liveCount} turma(s)</span>
                        {removedCount > 0 && <span style={{ color: "#64748b", fontSize: 12 }}>· {removedCount} removida(s)</span>}
                        {pkg.totalConflicts > 0 && <span style={{ color: "#f87171", fontSize: 12 }}>⚠ {pkg.totalConflicts} conflito(s)</span>}
                      </div>
                      {pkg.note ? <p style={{ color: "#cbd5e1", fontSize: 12, margin: "6px 0 0", fontStyle: "italic" }}>“{pkg.note}”</p> : null}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                      {isAwaiting && (
                        <Btn sm onClick={() => askApprovePackage(pkg)} label="Aprovar pacote" color="#16a34a" icon="check" />
                      )}
                      <Btn sm onClick={() => openEdit(pkg)} label="Editar" color="#0891b2" icon="edit" />
                      <Btn sm onClick={() => askDeletePackage(pkg)} label={isAwaiting ? "Descartar" : "Excluir"} color="#dc2626" icon="delete" />
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: "1px solid #154753" }}>
                      {cls.length === 0 ? (
                        <p style={{ color: "#64748b", fontSize: 13, padding: "12px 16px", margin: 0 }}>Nenhuma turma neste pacote.</p>
                      ) : cls.map((c, i) => {
                        const live = existingClassIds.has(c.classId);
                        const meta = AI_STATUS_META[c.status] || AI_STATUS_META.ok;
                        return (
                          <div key={c.classId || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: i < cls.length - 1 ? "1px solid #0b3a45" : "none", opacity: live ? 1 : 0.55 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
                                {c.className || "—"}
                                {!live && <span style={{ color: "#f87171", fontSize: 11, fontWeight: 600, marginLeft: 8 }}>(removida)</span>}
                              </div>
                              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>
                                {c.trainingName || c.gcc || "—"}{c.gcc && c.trainingName ? ` · ${c.gcc}` : ""} · {fmtDateBR(c.date)}{c.withTranslator ? " · 🌐" : ""}
                              </div>
                            </div>
                            <span style={{ color: meta.color, fontWeight: 600, fontSize: 12, flexShrink: 0 }}>{meta.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editPkg && (
        <Modal title="✏️ Editar pacote" onClose={closeEdit} width={560}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Nome do pacote</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder={`Pacote #${editPkg.version}`}
              style={{ width: "100%", padding: "10px 12px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Nota (opcional)</label>
            <textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={2} placeholder="Ex.: lote de novembro, turmas do cliente X..."
              style={{ width: "100%", padding: "10px 12px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <label style={{ color: "#94a3b8", fontSize: 13 }}>Turmas do pacote</label>
            {removeIds.length > 0 && <span style={{ color: "#f87171", fontSize: 12 }}>{removeIds.length} marcada(s) para remover</span>}
          </div>
          <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 10px" }}>Marque uma turma para removê-la da Programação ao salvar. Esta ação exige senha.</p>
          <div style={{ border: "1px solid #154753", borderRadius: 10, maxHeight: 320, overflowY: "auto" }}>
            {(editPkg.classes || []).length === 0 ? (
              <p style={{ color: "#64748b", fontSize: 13, padding: "12px 14px", margin: 0 }}>Nenhuma turma neste pacote.</p>
            ) : (editPkg.classes || []).map((c, i) => {
              const live = existingClassIds.has(c.classId);
              const marked = removeIds.includes(c.classId);
              return (
                <label key={c.classId || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: i < editPkg.classes.length - 1 ? "1px solid #0b3a45" : "none", cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.5, background: marked ? "#dc262615" : "transparent" }}>
                  <input type="checkbox" disabled={!live} checked={marked} onChange={() => toggleRemove(c.classId)} style={{ width: 16, height: 16, accentColor: "#dc2626", cursor: live ? "pointer" : "default", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, textDecoration: marked ? "line-through" : "none" }}>
                      {c.className || "—"}
                      {!live && <span style={{ color: "#f87171", fontSize: 11, marginLeft: 8 }}>(já removida)</span>}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>{c.trainingName || c.gcc || "—"} · {fmtDateBR(c.date)}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <Btn onClick={saveEdit} label="Salvar alterações" color="#16a34a" icon="check" />
            <Btn onClick={closeEdit} label="Cancelar" color="#475569" icon="close" />
          </div>
        </Modal>
      )}

      {showCreate && (
        <Modal title="➕ Criar turma" onClose={() => setShowCreate(false)} width={480}>
          <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 16px" }}>
            Adicione turmas à fila de criação em lote. Os instrutores são atribuídos automaticamente ao gerar a escala.
          </p>
          <SearchSel
            label="Treinamento"
            value={form.gcc}
            onChange={e => setForm({ ...form, gcc: e.target.value })}
            opts={[...trainings].sort((a, b) => (a.name || a.gcc || "").localeCompare(b.name || b.gcc || "")).map(t => ({ v: t.gcc, l: `${t.name || t.gcc}${t.gcc ? ` (${t.gcc})` : ""}`, keywords: `${t.name || ""} ${t.gcc || ""} ${t.shortName || ""}` }))}
            placeholder="Buscar por nome ou GCC..."
          />
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Data de início</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 14 }}>
            <input type="checkbox" checked={form.translate} onChange={e => setForm({ ...form, translate: e.target.checked })} style={{ width: 18, height: 18, accentColor: "#0891b2", cursor: "pointer" }} />
            <span style={{ color: "#e2e8f0", fontSize: 14 }}>Turma com tradução 🌐</span>
          </label>
          {/* Campos opcionais — equivalentes às colunas D/E/F da planilha. */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>Quantidade de alunos <span style={{ color: "#475569" }}>(opcional)</span></label>
            <input type="number" min="0" value={form.studentCount} onChange={e => setForm({ ...form, studentCount: e.target.value.replace(/\D/g, "") })}
              placeholder="Pode preencher depois turma a turma"
              style={{ width: "100%", padding: "10px 12px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          </div>
          <SearchSel
            label={<span>Instrutor Lead preferido <span style={{ color: "#475569" }}>(opcional — preferência soft)</span></span>}
            value={form.preferredLeadName}
            onChange={e => setForm({ ...form, preferredLeadName: e.target.value })}
            opts={[{ v: "", l: "— Sem preferência —", keywords: "" }, ...[...instructors].filter(i => i && i.status !== "Inativo").sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(i => ({ v: i.name, l: i.name, keywords: i.name || "" }))]}
            placeholder="Buscar por nome..."
          />
          {form.translate && (
            <SearchSel
              label={<span>Tradutor preferido <span style={{ color: "#475569" }}>(opcional — preferência soft)</span></span>}
              value={form.preferredTradName}
              onChange={e => setForm({ ...form, preferredTradName: e.target.value })}
              opts={[{ v: "", l: "— Sem preferência —", keywords: "" }, ...[...instructors].filter(i => i && i.status !== "Inativo" && (i.skills || []).some(s => (s.name || s) === TRANSLATOR_SKILL)).sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(i => ({ v: i.name, l: i.name, keywords: i.name || "" }))]}
              placeholder="Buscar por nome..."
            />
          )}
          {addedFlash > 0 && (
            <div style={{ background: "#16a34a20", border: "1px solid #16a34a40", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
              <p style={{ color: "#4ade80", fontSize: 12, margin: 0 }}>✅ {addedFlash} turma(s) adicionada(s) à fila. Adicione mais ou clique em Concluir.</p>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={addManualLine} label="Adicionar à fila" color="#0891b2" icon="plus" disabled={!form.gcc || !form.date} />
            <Btn onClick={() => setShowCreate(false)} label="Concluir" color="#16a34a" icon="check" />
          </div>
        </Modal>
      )}

      <DateGuardModal guard={guard} setGuard={setGuard} user={user} />
      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
    </div>
  );
};
