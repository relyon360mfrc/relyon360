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

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const STATUS_COLOR  = { Confirmado: "#16a34a", Pendente: "#d97706" };
const TYPE_COLOR    = { "RelyOn Macaé": "#ffa619", Offshore: "#e8920a", "In Company": "#f59e0b", Online: "#10b981" };
const ROLE_BADGE    = { "Lead Instructor": "#dc2626", "Theoretical Instructor": "#ffa619", "Practical Instructor": "#16a34a", "Support Instructor": "#f59e0b", "Assistant Instructor": "#8b5cf6", "Translator": "#06b6d4" };
const ROLE_PT       = { "Lead Instructor": "Inst. Líder", "Theoretical Instructor": "Inst. Teórico", "Practical Instructor": "Inst. Prático", "Support Instructor": "Inst. Apoio", "Translator": "Tradutor", "Assistant Instructor": "Assist. Instrução" };
const SUBTYPE_COLOR    = { piscina: "#ffa619", incendio: "#ef4444", industrial: "#f97316", manobra: "#8b5cf6" };
const TRANSLATOR_SKILL = "TRADUTOR";
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
    categories: ["Folga Banco de Horas", "Férias", "Treinamento/Evento Externo"]
  },
  feriado: {
    label: "Feriado", color: "#06b6d4",
    categories: ["Feriado Nacional", "Feriado Estadual", "Feriado Municipal"],
    noKpi: true  // não entra no cálculo de absenteísmo — é direito do trabalhador
  }
};

const INITIAL_ABSENCES = [];

// Categorias de ausência que cobrem o dia inteiro (sem campo de horário)
const FULL_DAY_CATEGORIES = [
  "Atestado Médico",
  "Férias",
  "Licença Paternidade/Maternidade",
  "Suspensão Disciplinar",
  "Feriado Nacional",
  "Feriado Estadual",
  "Feriado Municipal"
];
const isFullDayAbsence = (category) => FULL_DAY_CATEGORIES.includes(category);

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
  if (l.subtype === "piscina")    return SUBTYPE_COLOR.piscina;
  if (l.subtype === "incendio")   return SUBTYPE_COLOR.incendio;
  if (l.subtype === "industrial") return SUBTYPE_COLOR.industrial;
  if (l.subtype === "manobra")    return SUBTYPE_COLOR.manobra;
  if (l.env === "Teórico")        return "#ffa619";
  return "#64748b";
};

const fmtMin = (m) => { if (!m) return "—"; const h = Math.floor(m/60), r = m%60; return h > 0 ? `${h}h${r > 0 ? r+"min" : ""}` : `${r}min`; };
