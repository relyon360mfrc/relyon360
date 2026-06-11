// ── DADOS BASE ───────────────────────────────────────────────────────────────
// Seeds vazios — dados reais vivem no Supabase (tabela `app_state` + `relyon_schedules`).
// O usuário admin abaixo é apenas bootstrap de fresh install: `mustChangePass: true`
// força troca de senha no primeiro login, e `password` em plaintext é hasheado pelo
// AppLoader antes de ser persistido.
// Para repopular um ambiente novo: importar JSON gerado por `window.__exportBackup()`.
const INITIAL_AREAS = [];

const USERS = [
  { id: 1, name: "Admin", email: "", username: "admin", password: "relyon360!", role: "developer", avatar: "AD", mustChangePass: true },
];

const INSTRUCTORS = [];

let LOCALS = [];

const INITIAL_LOCALS = [...LOCALS];

const INITIAL_TRAININGS = [];

const INITIAL_SCHEDULES = [];

const INITIAL_HOLIDAYS = [];

const INITIAL_ACTIVITIES = [];

// ── CONSTANTS ────────────────────────────────────────────────────────────────
// Status "Rascunho" → turma criada pela IA em quarentena: invisível pro instrutor,
// sem push, planejador vê em cinza no calendário. Vira "Programado" ao aprovar pacote.
// "Programado" = turma real e ativa (não há mais conceito de ciência/confirmação).
// Confirmado/Pendente são legados em transição (migração os converte em Programado).
const STATUS_COLOR  = { Programado: "#16a34a", Confirmado: "#16a34a", Pendente: "#16a34a", Rascunho: "#64748b" };
const isDraftRow = (s) => s && s.status === "Rascunho";
const TYPE_COLOR    = { "RelyOn Macaé": "#ffa619", Offshore: "#e8920a", "In Company": "#f59e0b", Online: "#10b981", Interno: "#64748b" };

// Atividades internas (não-receita) e estado "livre" (freelancer avaliado).
// `maintenance` e `development` são blocos com horário; `free` cobre o dia inteiro.
const INTERNAL_LOCAL_TYPE = "Interno";
const ACTIVITY_TYPES = {
  maintenance:      { label: "Manutenção",            short: "Manut.", color: "#3b82f6", icon: "settings" },
  development:      { label: "Desenvolvimento",        short: "Dev.",   color: "#8b5cf6", icon: "training" },
  customer_service: { label: "Apoio Customer Service", short: "CS",     color: "#0ea5e9", icon: "people"   },
  almoxarifado:     { label: "Apoio Almoxarifado",     short: "ALM",    color: "#f97316", icon: "settings" },
  cenario:          { label: "Apoio Cenário",          short: "CEN",    color: "#a855f7", icon: "training" },
  material_pdi:     { label: "Material Didático - PDI", short: "PDI",    color: "#10b981", icon: "training" },
  holiday_work:       { label: "Feriado",                  short: "FER",    color: "#06b6d4", icon: "check"    },
  mandatory_training: { label: "Treinamento Obrigatório", short: "T.OBR", color: "#d97706", icon: "training" },
  free:               { label: "Livre",                  short: "Livre",  color: "#94a3b8", icon: "check"    },
  embarque:           { label: "Embarque",               short: "EMB",    color: "#0369a1", icon: "location" },
};

// Setores de locais Internos (Apoio) — alinhado às categorias de ACTIVITY_TYPES.
const INTERNAL_SECTOR_OPTS = [
  { v: "almoxarifado",     l: "Almoxarifado" },
  { v: "oficina",          l: "Oficina / Manutenção" },
  { v: "cenario",          l: "Apoio Cenário" },
  { v: "customer_service", l: "Customer Service (CS)" },
  { v: "material_pdi",     l: "Material Didático (PDI)" },
  { v: "outro",            l: "Outro" },
];
const INTERNAL_SECTOR_LABEL = Object.fromEntries(INTERNAL_SECTOR_OPTS.map(o => [o.v, o.l]));

// Helpers de contrato: CLT (e CLT Offshore) exigem 100% de cobertura no dia.
// Freelancer/PJ não exigem — mas precisam decisão explícita (LIVRE) pra
// distinguir "ainda não avaliei" de "avaliei e está fora do dia".
const isClt        = (instr) => instr && /^CLT(\s|$)/i.test(instr.contract || "");
const isFreelancer = (instr) => instr && /freelancer|prestador|pj/i.test(instr.contract || "");
const isOffshore   = (instr) => instr && /offshore/i.test(instr.contract || "");
const ROLE_BADGE    = { "Lead Instructor": "#dc2626", "Theoretical Instructor": "#ffa619", "Practical Instructor": "#16a34a", "Support Instructor": "#f59e0b", "Assistant Instructor": "#8b5cf6", "Translator": "#06b6d4", "Scuba Diver": "#0ea5e9", "Crane Operator": "#f59e0b" };
const ROLE_PT       = { "Lead Instructor": "Inst. Líder", "Theoretical Instructor": "Inst. Teórico", "Practical Instructor": "Inst. Prático", "Support Instructor": "Inst. Apoio", "Translator": "Tradutor", "Assistant Instructor": "Assist. Instrução", "Scuba Diver": "Scuba Diver", "Crane Operator": "Crane Operator" };
const SUBTYPE_COLOR    = { piscina: "#ffa619", incendio: "#ef4444", industrial: "#f97316", manobra: "#8b5cf6" };
const TRANSLATOR_SKILL = "TRADUTOR";

// Competências especiais — não vinculadas a uma disciplina de treinamento.
// `hasMetadata: true` indica que o item aceita acquiredAt/validUntil (controle de validade).
// LEAD_INSTRUCTOR e ASSISTANT_INSTRUCTOR pressupõem SCUBA_DIVER como pré-requisito
// (a validação fica como aviso soft, não bloqueio).
const SPECIAL_COMPETENCIES = [
  { code: "TRADUTOR",             label: "Tradutor",             icon: "🌐", color: "#06b6d4", hasMetadata: false },
  { code: "LEAD_INSTRUCTOR",      label: "Lead Instructor",      icon: "👑", color: "#dc2626", hasMetadata: true  },
  { code: "ASSISTANT_INSTRUCTOR", label: "Assistant Instructor", icon: "🎯", color: "#8b5cf6", hasMetadata: true  },
  { code: "SCUBA_DIVER",          label: "Scuba Diver",          icon: "🤿", color: "#0ea5e9", hasMetadata: true  },
  { code: "CRANE_OPERATOR",       label: "Crane Operator",       icon: "🏗",  color: "#f59e0b", hasMetadata: true  },
];
const SPECIAL_COMPETENCY_CODES = new Set(SPECIAL_COMPETENCIES.map(c => c.code));
const isSpecialCompetency = (name) => SPECIAL_COMPETENCY_CODES.has(name);
const getSpecialCompetency = (name) => SPECIAL_COMPETENCIES.find(c => c.code === name);

// Papéis da equipe HUET prático ("pool team"), em ordem dos slots.
// HUET prático precisa de 5 pessoas com 4 funções: Lead + Assistant + 2× Scuba + Crane.
// `requiresCompetency` = competência exigida no cadastro do instrutor.
// `requiresDisciplineSkill` = também precisa ter a skill da disciplina
//   (Lead/Assistant ministram a aula; Scuba/Crane são apoio operacional).
const POOL_TEAM_ROLES = [
  { code: "Lead Instructor",      requiresCompetency: "LEAD_INSTRUCTOR",      requiresDisciplineSkill: true  },
  { code: "Assistant Instructor", requiresCompetency: "ASSISTANT_INSTRUCTOR", requiresDisciplineSkill: true  },
  { code: "Scuba Diver",          requiresCompetency: "SCUBA_DIVER",          requiresDisciplineSkill: false },
  { code: "Scuba Diver",          requiresCompetency: "SCUBA_DIVER",          requiresDisciplineSkill: false },
  { code: "Crane Operator",       requiresCompetency: "CRANE_OPERATOR",       requiresDisciplineSkill: false },
];
// Detecta módulos que usam a equipe HUET. Critério: flag `isHuet` no cadastro do
// módulo (independente do training.poolBatch — este último é só filtro do modal
// Lote Piscina e não dita regra de alocação de instrutor).
const isHuetModule = (mod) => !!(mod && mod.isHuet);
// Compat: assinatura antiga (training, mod) — ignora training, delega pra isHuetModule.
// Mantida pra não quebrar call-sites legados; novos chamadores devem usar isHuetModule.
const isPoolTeamModule = (_training, mod) => isHuetModule(mod);
const getPoolTeamRole = (slotIdx) => POOL_TEAM_ROLES[slotIdx] || null;
// Verifica se o instrutor tem a competência marcada e ainda válida.
// Sem validUntil = sem expiração; com validUntil = compara com a data de hoje.
const hasValidCompetency = (instr, code) => {
  if (!instr || !instr.skills || !code) return false;
  const today = new Date().toISOString().split("T")[0];
  return instr.skills.some(s => {
    if ((s.name || s) !== code) return false;
    if (!s.validUntil) return true;
    return s.validUntil >= today;
  });
};

// Retorna { label, color, bg, border, minWidth } para o chip do papel ao lado do dropdown de instrutor.
// - Translator: cyan, "Trad."
// - Pool team (LOTE PISCINA + PRÁTICA): label longo do POOL_TEAM_ROLES (Lead Instructor / Assistant
//   Instructor / Scuba Diver / Crane Operator) — alinhado com a imagem de referência da operação
// - Módulo comum: slot 0 = "Instr." (amarelo), demais = "Assist." (cinza) — renomeação de "Lead"
//   para "Instr." conforme decisão de produto (Lead vira termo exclusivo do contexto piscina)
// `ntIdx` = índice entre slots não-tradutores (translator é sempre o último).
const getSlotChip = (slot, ntIdx, mod, training) => {
  if (slot && slot.isTranslator) {
    return { label: "Trad.", color: "#06b6d4", bg: "#06b6d415", border: "1px solid #06b6d440", minWidth: 38 };
  }
  if (isHuetModule(mod)) {
    const roleCode = (slot && slot.role) || ((getPoolTeamRole(ntIdx) || {}).code);
    if (roleCode) {
      const color = ROLE_BADGE[roleCode] || "#475569";
      return {
        label: roleCode,
        color,
        bg: color + "20",
        border: "1px solid " + color + "40",
        minWidth: 118
      };
    }
  }
  if (ntIdx === 0) {
    return { label: "Instr.", color: "#ffa619", bg: "#ffa61920", border: "1px solid #ffa61940", minWidth: 38 };
  }
  return { label: "Assist.", color: "#475569", bg: "#15475320", border: "1px solid #15475360", minWidth: 38 };
};

const SAVED_KEY        = "relyon360_user";

const PERMISSIONS_LIST = [
  { id: "plan_view",     label: "Visualizar Programação",          group: "Planejamento"    },
  { id: "plan_edit",     label: "Criar / Editar Programação",      group: "Planejamento"    },
  { id: "events_turmas", label: "Criar Eventos — Turmas",          group: "Planejamento"    },
  { id: "events_manut",  label: "Criar Eventos — Manutenção",      group: "Planejamento"    },
  { id: "events_desenv", label: "Criar Eventos — Desenvolvimento", group: "Planejamento"    },
  { id: "skills_edit",   label: "Editar Competências",             group: "Configuração"    },
  { id: "locals_edit",   label: "Editar Locais",                   group: "Configuração"    },
  { id: "train_edit",    label: "Editar Treinamentos",             group: "Configuração"    },
  { id: "instr_view",    label: "Consultar Instrutores",           group: "Configuração"    },
  { id: "reports",       label: "Acessar Relatórios",              group: "Relatórios"      },
  { id: "ai",            label: "IA — Sugerir Escala",             group: "Relatórios"      },
];

const ABSENCE_TYPES = {
  involuntario: {
    label: "Absenteísmo Involuntário", color: "#ef4444",
    categories: ["Atestado Médico", "Licença Paternidade/Maternidade", "Consultas e Exames (com declaração)"]
  },
  voluntario: {
    label: "Absenteísmo Voluntário", color: "#f97316",
    categories: ["Falta", "Atrasos e Saídas Antecipadas", "Suspensão Disciplinar"]
  },
  planejada: {
    label: "Ausência Planejada", color: "#16a34a",
    categories: ["Folga Banco de Horas", "Folga Abonada", "Férias", "Embarque", "Treinamento/Evento Externo"]
  }
  // NOTA: feriado deixou de ser tipo de ausência — agora é entidade global em relyon_holidays.
};

const INITIAL_ABSENCES = [];

// Categorias de ausência que cobrem o dia inteiro (sem campo de horário)
const FULL_DAY_CATEGORIES = [
  "Atestado Médico",
  "Férias",
  "Folga Abonada",
  "Embarque",
  "Licença Paternidade/Maternidade",
  "Suspensão Disciplinar"
];

// Helper: feriado é regional. scope="national" aplica a todos; "base" exige
// instr.base igual à base do feriado.
const HOLIDAY_SCOPES = {
  national: { label: "Nacional", color: "#06b6d4" },
  base:     { label: "Por Base", color: "#0891b2" }
};
const INSTRUCTOR_BASES = ["Macaé", "Bangu", "Offshore"];
// Mapeia a base física ativa → tipo de local correspondente. Locais NÃO têm campo
// `base`: a base é derivada do `type`. In Company / Online (EAD) / Interno não
// pertencem a uma base física, então retornam null (não filtram por base).
const baseLocalType = b => b === "Bangu" ? "RelyOn Bangu" : b === "Macaé" ? "RelyOn Macaé" : b === "Offshore" ? "Offshore" : null;
const isHoliday = (date, instr, holidays) => {
  if (!holidays || !holidays.length) return null;
  for (const h of holidays) {
    if (h.date !== date) continue;
    if (h.scope === "national") return h;
    if (!instr) continue;
    if (h.scope === "base" && instr.base && instr.base === h.base) return h;
  }
  return null;
};
const isFullDayAbsence = (category) => FULL_DAY_CATEGORIES.includes(category);

// Ordena módulos: regulares → revisão → prova → tempo reserva
const sortModules = mods => {
  if (!mods || !mods.length) return [];
  const isReserva = m => /TEMPO\s*RESERVA/i.test(m.name);
  const isProva   = m => /\bPROVA\b/i.test(m.name) && !isReserva(m);
  const isRevisao = m => /REVIS[AÃ]O/i.test(m.name) && !isProva(m) && !isReserva(m);
  const regular = mods.filter(m => !isProva(m) && !isReserva(m) && !isRevisao(m));
  regular.sort((a, b) => {
    const at = /CBINC/i.test(a.name), bt = /CBINC/i.test(b.name);
    if (at && bt) {
      if (a.type === "TEORIA"  && b.type === "PRÁTICA") return -1;
      if (a.type === "PRÁTICA" && b.type === "TEORIA")  return  1;
    }
    return (a.priority || 99) - (b.priority || 99);
  });
  return [...regular, ...mods.filter(isRevisao), ...mods.filter(isProva), ...mods.filter(isReserva)];
};

// Verifica se instrutor está ausente em um determinado dia/horário
const isInstructorAbsent = (instructorId, date, startMins, endMins, absences) => {
  return absences.some(a => {
    if (String(a.instructorId) !== String(instructorId)) return false;
    const aStart = a.startDate, aEnd = a.endDate || a.startDate;
    if (date < aStart || date > aEnd) return false;
    if (isFullDayAbsence(a.category)) return true;
    if (!a.startTime || !a.endTime) return false;
    const absS = timeToMins(a.startTime), absE = timeToMins(a.endTime);
    return startMins < absE && endMins > absS;
  });
};
const canAdmin = u => u && (u.role === "developer" || u.role === "admin");
const canPlan  = u => canAdmin(u) || (u && u.role === "planejador");
const shortName = n => { if (!n) return ''; const p = n.trim().split(/\s+/); return p.length > 2 ? p[0] + ' ' + p[p.length - 1] : n; };
// hasPermission: developer/admin têm tudo; planejador precisa ter o permId no seu array permissions[]
const hasPermission = (u, permId) => {
  if (!u) return false;
  if (u.role === "developer" || u.role === "admin") return true;
  if (u.role === "planejador") return (u.permissions || []).includes(permId);
  return false;
};
const ROLE_LABELS = { developer: "Desenvolvedor", admin: "Administrador", planejador: "Planejador", instructor: "Instrutor", customer_service: "Customer Service" };

const localColor = (name) => {
  const l = LOCALS.find(x => x.name === name);
  if (!l) return "#64748b";
  if (l.type === INTERNAL_LOCAL_TYPE) return TYPE_COLOR.Interno;
  if (l.subtype === "piscina")    return SUBTYPE_COLOR.piscina;
  if (l.subtype === "incendio")   return SUBTYPE_COLOR.incendio;
  if (l.subtype === "industrial") return SUBTYPE_COLOR.industrial;
  if (l.subtype === "manobra")    return SUBTYPE_COLOR.manobra;
  if (l.env === "Teórico")        return "#ffa619";
  return "#64748b";
};

// Calcula o "status de cobertura" de um instrutor em uma data.
// Retorna:
//   { status: "training", blocks: [...] }    — tem pelo menos uma aula
//   { status: "activity", blocks: [...] }   — tem manutenção/desenvolvimento (sem aula)
//   { status: "free",     blocks: [...] }   — marcado LIVRE (freelancer)
//   { status: "absence",  blocks: [...] }   — tem ausência cobrindo o dia
//   { status: "holiday",  blocks: [...] }   — feriado regional
//   { status: "empty",    blocks: [] }      — sem nada (CLT = pendência; freelancer = não avaliado)
// `blocks` sempre lista todos os intervalos cobertos no dia (ordenados por startTime),
// permitindo desenhar a timeline. Cada block: { type, startTime, endTime, label, color }.
const computeCoverage = (instr, date, schedules, activities, absences, holidays) => {
  const blocks = [];
  // 1. Treinamentos
  (schedules || []).forEach(s => {
    if (s.date !== date) return;
    if (String(s.instructorId) !== String(instr.id)) return;
    blocks.push({
      type: "training", startTime: s.startTime, endTime: s.endTime,
      label: s.module || s.trainingName || s.className || "Treinamento",
      sub: s.className || "", color: "#16a34a", ref: s,
    });
  });
  // 2. Atividades internas (manutenção / desenvolvimento) — exclui "free" (tratado abaixo)
  (activities || []).forEach(a => {
    if (a.date !== date) return;
    if (String(a.instructorId) !== String(instr.id)) return;
    if (a.type === "free") return;
    const info = ACTIVITY_TYPES[a.type] || { label: a.type, color: "#64748b" };
    blocks.push({
      type: a.type, startTime: a.startTime, endTime: a.endTime,
      label: info.label, sub: a.local || "", color: info.color, ref: a,
    });
  });
  // 3. Ausências
  let absenceBlock = null;
  (absences || []).forEach(a => {
    if (String(a.instructorId) !== String(instr.id)) return;
    const aStart = a.startDate, aEnd = a.endDate || a.startDate;
    if (date < aStart || date > aEnd) return;
    const fullDay = isFullDayAbsence(a.category);
    const info = ABSENCE_TYPES[a.type] || { color: "#ef4444", label: a.type };
    absenceBlock = {
      type: "absence",
      startTime: fullDay ? "00:00" : (a.startTime || "08:00"),
      endTime:   fullDay ? "23:59" : (a.endTime   || "17:00"),
      label: a.category || info.label, sub: info.label, color: info.color, ref: a, fullDay,
    };
    blocks.push(absenceBlock);
  });
  // 4. LIVRE explícito (freelancer)
  let freeBlock = null;
  (activities || []).forEach(a => {
    if (a.date !== date) return;
    if (String(a.instructorId) !== String(instr.id)) return;
    if (a.type !== "free") return;
    freeBlock = {
      type: "free",
      startTime: a.startTime || "00:00",
      endTime:   a.endTime   || "23:59",
      label: "Livre", sub: "", color: ACTIVITY_TYPES.free.color, ref: a, fullDay: !a.startTime,
    };
    blocks.push(freeBlock);
  });
  // 5. Feriado regional
  const h = isHoliday(date, instr, holidays);
  const holidayBlock = h ? { type: "holiday", startTime: "00:00", endTime: "23:59", label: h.name, sub: "Feriado", color: "#06b6d4", ref: h, fullDay: true } : null;
  if (holidayBlock) blocks.push(holidayBlock);

  blocks.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

  // Status sumário (prioridade: holiday > absence > training > activity > free > empty)
  const _ACT_KEYS = ["maintenance","development","customer_service","almoxarifado","cenario","holiday_work","material_pdi","mandatory_training"];
  let status = "empty";
  if (holidayBlock && !isFreelancer(instr)) status = "holiday";
  else if (absenceBlock) status = "absence";
  else if (blocks.some(b => b.type === "training")) status = "training";
  else if (blocks.some(b => _ACT_KEYS.includes(b.type))) status = "activity";
  else if (freeBlock) status = "free";
  return { status, blocks };
};

// Paleta global das bolinhas de ocupação. Recebe um block do computeCoverage
// e devolve { color, gradient, label, short } para renderização.
// Definição de cores acordada com o usuário (2026-05-22):
//   Treinamento          → verde brilhante (#16a34a)
//   Folga Banco Horas    → amarelo (#f59e0b)
//   Férias               → amarelo + verde hachurado
//   Atestado / Consulta  → vermelho brilhante (#ef4444)
//   Licença Pat/Mat      → cyan hachurado
//   Falta / Atrasos      → laranja (#f97316)
//   Suspensão            → marrom escuro (#7c2d12)
//   Treinamento Externo  → lilás (#a855f7)
//   Manutenção           → azul (#3b82f6)
//   Desenvolvimento      → roxo (#8b5cf6)
//   Livre (freelancer)   → cinza hachurado
//   Feriado              → cyan (#06b6d4)
const paletteForBlock = (block) => {
  if (!block) return { color: "#1e3a42", gradient: null, label: "Livre", short: "" };
  if (block.type === "training")    return { color: "#16a34a", gradient: null, label: "Treinamento", short: "TRN" };
  if (block.type === "holiday")     return { color: "#06b6d4", gradient: null, label: block.label || "Feriado", short: "FER" };
  if (block.type === "maintenance")      return { color: "#3b82f6", gradient: null, label: "Manutenção",            short: "MAN" };
  if (block.type === "development")      return { color: "#8b5cf6", gradient: null, label: "Desenvolvimento",         short: "DEV" };
  if (block.type === "customer_service") return { color: "#0ea5e9", gradient: null, label: "Apoio Customer Service",  short: "CS"  };
  if (block.type === "almoxarifado")     return { color: "#f97316", gradient: null, label: "Apoio Almoxarifado",      short: "ALM" };
  if (block.type === "cenario")          return { color: "#a855f7", gradient: null, label: "Apoio Cenário",           short: "CEN" };
  if (block.type === "material_pdi")     return { color: "#10b981", gradient: null, label: "Material Didático - PDI",  short: "PDI" };
  if (block.type === "holiday_work")       return { color: "#06b6d4", gradient: null, label: "Feriado",                  short: "FER"   };
  if (block.type === "mandatory_training") return { color: "#d97706", gradient: null, label: "Treinamento Obrigatório",  short: "T.OBR" };
  if (block.type === "embarque")  return { color: "#0369a1", gradient: null, label: "Embarque",          short: "EMB" };
  if (block.type === "free")        return { color: "#94a3b8", gradient: "repeating-linear-gradient(45deg, #94a3b8 0 3px, #64748b 3px 6px)", label: "Livre (avaliado)", short: "LIV" };
  if (block.type === "absence") {
    const cat = (block.label || (block.ref && block.ref.category) || "").toString();
    if (/F[eé]rias/i.test(cat))                              return { color: "#f59e0b", gradient: "repeating-linear-gradient(45deg, #f59e0b 0 3px, #16a34a 3px 6px)", label: "Férias", short: "FER" };
    if (/Folga\s+Banco/i.test(cat))                          return { color: "#f59e0b", gradient: null, label: "Folga Banco de Horas", short: "FBH" };
    if (/Folga\s+Abonada/i.test(cat))                        return { color: "#22c55e", gradient: null, label: "Folga Abonada", short: "FAB" };
    if (/^Embarque$/i.test(cat))                             return { color: "#0369a1", gradient: null, label: "Embarque", short: "EMB" };
    if (/Atestado/i.test(cat))                               return { color: "#ef4444", gradient: null, label: "Atestado Médico", short: "ATM" };
    if (/Consultas?\s+e\s+Exames?/i.test(cat))               return { color: "#ef4444", gradient: null, label: "Consulta/Exame", short: "CON" };
    if (/Licen[çc]a\s+(Paternidade|Maternidade)/i.test(cat)) return { color: "#06b6d4", gradient: "repeating-linear-gradient(45deg, #06b6d4 0 3px, #7dd3fc 3px 6px)", label: "Licença Pat./Maternidade", short: "LIC" };
    if (/^Falta$/i.test(cat))                                return { color: "#f97316", gradient: null, label: "Falta", short: "FLT" };
    if (/Atrasos|Sa[íi]das/i.test(cat))                      return { color: "#f97316", gradient: null, label: "Atrasos/Saídas", short: "ATR" };
    if (/Suspens[ãa]o/i.test(cat))                           return { color: "#7c2d12", gradient: null, label: "Suspensão Disciplinar", short: "SUS" };
    if (/Treinamento.*Externo|Evento\s+Externo/i.test(cat))  return { color: "#a855f7", gradient: null, label: "Treinamento Externo", short: "EXT" };
    return { color: "#ef4444", gradient: null, label: cat || "Ausência", short: "AUS" };
  }
  return { color: "#1e3a42", gradient: null, label: "Livre", short: "" };
};

// Dado um coverage (resultado de computeCoverage) e o início do slot (HH:MM),
// devolve o block prioritário que cobre aquele slot (1h) ou null se vazio.
// Prioridade: holiday > absence > training > maintenance/development > free.
const getSlotPrimaryBlock = (cov, slotStart) => {
  if (!cov || !cov.blocks || !cov.blocks.length) return null;
  const slotS = timeToMins(slotStart);
  const slotE = slotS + 60;
  const inSlot = cov.blocks.filter(b => {
    const bs = b.fullDay ? 0 : timeToMins(b.startTime);
    const be = b.fullDay ? 24 * 60 : timeToMins(b.endTime);
    return bs < slotE && be > slotS;
  });
  if (!inSlot.length) return null;
  const PRIO = { holiday: 5, absence: 4, training: 3, maintenance: 2, development: 2, free: 1 };
  inSlot.sort((a, b) => (PRIO[b.type] || 0) - (PRIO[a.type] || 0));
  return inSlot[0];
};

// Lista completa de itens da paleta (para legendas). Não inclui o "vazio".
const PALETTE_LEGEND = [
  { color: "#16a34a", gradient: null, label: "Treinamento" },
  { color: "#f59e0b", gradient: null, label: "Folga Banco de Horas" },
  { color: "#f59e0b", gradient: "repeating-linear-gradient(45deg, #f59e0b 0 3px, #16a34a 3px 6px)", label: "Férias" },
  { color: "#ef4444", gradient: null, label: "Atestado / Consulta" },
  { color: "#06b6d4", gradient: "repeating-linear-gradient(45deg, #06b6d4 0 3px, #7dd3fc 3px 6px)", label: "Licença Pat./Maternidade" },
  { color: "#f97316", gradient: null, label: "Falta / Atrasos" },
  { color: "#7c2d12", gradient: null, label: "Suspensão" },
  { color: "#a855f7", gradient: null, label: "Treinamento Externo" },
  { color: "#3b82f6", gradient: null, label: "Manutenção" },
  { color: "#8b5cf6", gradient: null, label: "Desenvolvimento" },
  { color: "#94a3b8", gradient: "repeating-linear-gradient(45deg, #94a3b8 0 3px, #64748b 3px 6px)", label: "Livre (avaliado)" },
  { color: "#06b6d4", gradient: null, label: "Feriado" },
];

const fmtMin = (m) => { if (!m) return "—"; const h = Math.floor(m/60), r = m%60; return h > 0 ? `${h}h${r > 0 ? r+"min" : ""}` : `${r}min`; };

// ── Helpers globais de agendamento ─────────────────────────────────────────
// Versões puras (sem closure) usadas pelo PoolBatchPage e disponíveis para
// outros módulos. O componente Schedule mantém suas próprias versões locais
// (idênticas em comportamento) por estabilidade do código testado.

const minsToTimeG = (m) => { const mm = Math.max(0, m); return `${String(Math.floor(mm/60)).padStart(2,"0")}:${String(mm%60).padStart(2,"0")}`; };

// Verifica conflito de instrutor/local em uma data+intervalo, ignorando turmas
// excluídas e vinculadas. `schedules` é o array completo (vem como parâmetro).
const checkSlotConflictG = (schedules, date, startTime, endTime, instructorId, local, excludeClassName, linkedClassNames) => {
  if (!date || !startTime || !endTime) return { instrConflict: false, localConflict: false };
  const linked = linkedClassNames || [];
  const nS = timeToMins(startTime), nE = timeToMins(endTime);
  const ignoreNames = new Set([excludeClassName, ...linked].filter(Boolean));
  const existing = schedules.filter(s => s.date === date && !ignoreNames.has(s.className));
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

// Sugere o próximo nome de turma: "{shortName||gcc} - NN", NN = (maior número
// de turma na mesma semana+ano, mesmo trainingId) + 1. occupancyRows pode incluir
// linhas ainda-não-salvas (usado pelo import em lote para numerar turmas em sequência).
// Espelha logic.js#nextClassName — mantenha as duas idênticas.
const nextClassNameG = (training, date, occupancyRows) => {
  if (!training || !date) return "";
  const label = training.shortName || training.gcc || "";
  const weekOf = ds => {
    const d = new Date(ds + "T12:00:00");
    const soy = new Date(d.getFullYear(), 0, 1);
    return { wk: Math.ceil(((d - soy) / 86400000 + soy.getDay() + 1) / 7), year: d.getFullYear() };
  };
  const target = weekOf(date);
  const startByClass = {};
  (occupancyRows || []).forEach(s => {
    if (String(s.trainingId) !== String(training.id)) return;
    if (!s.className) return;
    if (!startByClass[s.className] || s.date < startByClass[s.className]) startByClass[s.className] = s.date;
  });
  const sameWeek = Object.entries(startByClass).filter(([, startDate]) => {
    const w = weekOf(startDate);
    return w.wk === target.wk && w.year === target.year;
  }).map(([name]) => name);
  const nums = sameWeek.map(n => { const m = n.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; });
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${label} - ${String(next).padStart(2, "0")}`;
};

// ── Helpers do Ticket de Problema (chat bidirecional turma↔planejador) ─────
// Status derivado: deriva de issueLog quando issueStatus ausente (compat legado).
// Convenções do log: type "report" (abertura, instrutor) · "ack" (planejador deu ciente)
// · "message" (qualquer parte) · "resolved" (encerrado). from: "instructor" | "planner".
const ISSUE_STATUS = { ABERTO: "aberto", EM_ANDAMENTO: "em_andamento", RESOLVIDO: "resolvido" };

const getIssueStatus = (s) => {
  if (!s || !s.issue) return null;
  if (s.issueStatus) return s.issueStatus;
  const log = s.issueLog || [];
  if (log.some(e => e.type === "resolved")) return ISSUE_STATUS.RESOLVIDO;
  if (log.some(e => e.type === "ack"))      return ISSUE_STATUS.EM_ANDAMENTO;
  return ISSUE_STATUS.ABERTO;
};

const isIssueOpen        = (s) => getIssueStatus(s) === ISSUE_STATUS.ABERTO;
const isIssueInProgress  = (s) => getIssueStatus(s) === ISSUE_STATUS.EM_ANDAMENTO;
const isIssueResolved    = (s) => getIssueStatus(s) === ISSUE_STATUS.RESOLVIDO;
const isIssueActive      = (s) => { const st = getIssueStatus(s); return st === ISSUE_STATUS.ABERTO || st === ISSUE_STATUS.EM_ANDAMENTO; };

// Data/hora de abertura — prefere primeiro "report" no log; fallback para s.issueAt.
const getIssueOpenedAt = (s) => {
  if (!s) return null;
  const log = s.issueLog || [];
  const first = log.find(e => e.type === "report");
  return (first && first.at) || s.issueAt || null;
};
const getIssueOpener = (s) => {
  if (!s) return "";
  const log = s.issueLog || [];
  const first = log.find(e => e.type === "report");
  return (first && first.by) || s.issueBy || "";
};

// Normaliza issueLog: sintetiza entry inicial quando legado tinha só s.issue;
// adiciona `from` em entries antigas (report=instructor, ack=planner).
const getIssueMessages = (s) => {
  if (!s) return [];
  const log = s.issueLog || [];
  if (log.length === 0 && s.issue) {
    return [{ type: "report", from: "instructor", text: s.issue, by: s.issueBy || "", at: s.issueAt || null }];
  }
  return log.map(e => ({
    ...e,
    from: e.from || (e.type === "ack" || e.type === "resolved" ? "planner" : "instructor"),
  }));
};

// Conta tickets ativos (aberto+em_andamento) — usado no card do dashboard.
const countActiveIssues = (schedules) => (schedules || []).filter(isIssueActive).length;

const fmtTicketDt = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
};
