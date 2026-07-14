// ── COBERTURA DIÁRIA ──────────────────────────────────────────────────────────
// Visualização de justificativas por instrutor por dia.
// CLT: precisa cobertura — buracos viram alerta vermelho.
// Freelancer: precisa decisão explícita — sem nada vira flag "Sem decisão".

// Janela visual da timeline (08:00 → 20:00 = 12h, mesma da Utilização Diária)
const COV_DAY_START_MIN = 8 * 60;
const COV_DAY_END_MIN   = 20 * 60;
const COV_DAY_SPAN_MIN  = COV_DAY_END_MIN - COV_DAY_START_MIN;

// CLT: expediente padrão 08:00-17:00 com almoço 12:00-13:00 = 480 min de trabalho
const COV_CLT_EXPECTED_MIN = 8 * 60;

const _covTimeToMins = (t) => {
  if (!t || !t.includes(":")) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Calcula minutos cobertos no expediente CLT (08-12 + 13-17), considerando os blocos
const coverageMinutesClt = (blocks) => {
  if (!blocks || !blocks.length) return 0;
  // Períodos do expediente
  const work = [[8*60, 12*60], [13*60, 17*60]];
  let total = 0;
  for (const [ws, we] of work) {
    // Linha de tempo de 1 minuto, marca true para cada minuto coberto
    const covered = new Array(we - ws).fill(false);
    blocks.forEach(b => {
      const bs = b.fullDay ? 0 : _covTimeToMins(b.startTime);
      const be = b.fullDay ? 24*60 : _covTimeToMins(b.endTime);
      const s = Math.max(bs, ws), e = Math.min(be, we);
      for (let i = s; i < e; i++) covered[i - ws] = true;
    });
    total += covered.filter(Boolean).length;
  }
  return total;
};

// ── PDF: Resumo da Linha do Tempo por Local / Tipo ───────────────────────────
// Lista "quem atua onde e em qual horário" no dia, agrupada por local ou por
// tipo de atividade — pronta pra enviar ao responsável de cada local.
const printCoverageSummary = ({ dateStr, dateLabel, groupBy, groups, filterLabel }) => {
  const w = window.open("", "_blank"); if (!w) return;
  const escH = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const COMPANY = "RELYON BRASIL TREINAMENTOS LTDA";
  const col1 = groupBy === "local" ? "TIPO" : "LOCAL";
  let h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Linha do Tempo ' + escH(dateStr) + '</title><style>\n';
  h += '@page{size:A4 portrait;margin:12mm}\n';
  h += '*{margin:0;padding:0;box-sizing:border-box}\n';
  h += 'body{font-family:Arial,Helvetica,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}\n';
  h += '.ph{background:#01323d;color:#fff;text-align:center;padding:14px 20px;border-bottom:3px solid #ffa619}\n';
  h += '.ph h1{font-size:18px;font-weight:800;letter-spacing:1px}\n';
  h += '.ph .sub{color:#ffa619;font-size:13px;font-weight:700;margin-top:3px}\n';
  h += '.ph .per{color:rgba(255,255,255,0.6);font-size:12px;margin-top:4px;text-transform:capitalize}\n';
  h += '.pbar{text-align:center;padding:10px}\n';
  h += '.pbtn{padding:7px 22px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700}\n';
  h += '.grp{margin:14px 16px 0}\n';
  h += '.gh{background:#0e3a45;color:#fff;font-size:14px;font-weight:800;padding:8px 12px;border-radius:6px 6px 0 0;border:1px solid #154753;display:flex;justify-content:space-between;align-items:center;gap:16px}\n';
  h += '.gh .cnt{color:#94a3b8;font-weight:600;font-size:12px;white-space:nowrap}\n';
  // width:100% alinha a borda direita de todos os blocos; table-layout:auto deixa as
  // colunas curtas (nowrap) abraçarem o conteúdo e só DETALHE/OBSERVAÇÃO absorverem a sobra.
  h += 'table{width:100%;border-collapse:collapse}\n';
  h += 'th{background:#f1f5f9;color:#475569;font-size:11px;font-weight:700;padding:5px 10px;border:1px solid #e2e8f0;text-align:left;white-space:nowrap}\n';
  h += 'td{padding:5px 10px;border:1px solid #e2e8f0;font-size:12px;color:#0f172a;vertical-align:top;white-space:nowrap}\n';
  h += '.tg{display:inline-block;font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px}\n';
  h += '.per2{font-weight:700;white-space:nowrap}\n';
  h += '.det{white-space:normal;color:#64748b;font-size:11px}\n';
  h += '.obs{white-space:normal;color:#475569;font-size:11px}\n';
  h += '.ft{margin:18px 16px 0;text-align:center;color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0;padding-top:8px}\n';
  h += '@media print{.pbar{display:none}}\n';
  h += '</style></head><body>';
  h += '<div class="ph"><h1>🗓 LINHA DO TEMPO</h1><div class="sub">' + escH(COMPANY) + '</div><div class="per">' + escH(dateLabel) + (filterLabel ? '  ·  ' + escH(filterLabel) : '') + '</div></div>';
  h += '<div class="pbar"><button class="pbtn" onclick="window.print()">🖨 Imprimir / Salvar PDF</button></div>';
  if (!groups.length) {
    h += '<p style="text-align:center;color:#64748b;padding:30px">Nada para mostrar com os filtros atuais.</p>';
  }
  // Coluna OBSERVAÇÃO só aparece quando há ao menos uma anotação (mantém a tabela enxuta).
  const showObs = groups.some(g => g.items.some(it => it.obs));
  groups.forEach(g => {
    h += '<div class="grp"><div class="gh"><span>' + (groupBy === "local" ? "📍 " : "▸ ") + escH(g.title) + '</span><span class="cnt">' + g.items.length + ' aloca' + (g.items.length !== 1 ? 'ções' : 'ção') + '</span></div>';
    h += '<table><thead><tr><th>' + col1 + '</th><th>INSTRUTOR</th><th>PERÍODO</th><th>DETALHE</th>' + (showObs ? '<th>OBSERVAÇÃO</th>' : '') + '</tr></thead><tbody>';
    g.items.forEach(it => {
      const c1 = groupBy === "local" ? it.typeLabel : (it.local || "Sem local");
      const c1color = it.color || "#64748b";
      const period = (it.startTime && it.endTime) ? (it.startTime + '–' + it.endTime) : "dia todo";
      const det = it.type === "training" ? (it.sub || "") : (it.label || "");
      h += '<tr><td><span class="tg" style="background:' + c1color + '22;color:' + c1color + ';border:1px solid ' + c1color + '55">' + escH(c1) + '</span></td>';
      h += '<td>' + escH(it.instrName) + '</td>';
      h += '<td class="per2">' + escH(period) + '</td>';
      h += '<td class="det">' + escH(det) + '</td>';
      if (showObs) h += '<td class="obs">' + escH(it.obs || "") + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  });
  h += '<div class="ft">' + escH(COMPANY) + '  ·  Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) + '</div>';
  h += '</body></html>';
  w.document.write(h); w.document.close();
};

const CoverageDailyPage = ({ schedules, instructors, activities, setActivities, absences, setAbsences, holidays, user, locals, trainings, setActive, setScheduleTabs, setActiveTabId }) => {
  const todayStr = new Date().toISOString().split("T")[0];
  const [date, setDate] = React.useState(todayStr);
  const [filterContract, setFilterContract] = React.useState("all"); // all | clt | clt_empty | clt_ok | freelancer | freelancer_ok | offshore | offshore_ok | issues
  const [search, setSearch] = React.useState("");
  const [activityModal, setActivityModal] = React.useState({ show: false, instr: null, editing: null });
  const [freeModal, setFreeModal] = React.useState({ show: false, instr: null });
  const [bankHoursModal, setBankHoursModal] = React.useState({ show: false, instr: null, editing: null });
  const [delGuard, setDelGuard] = React.useState({ show: false, action: null, pass: "", err: "" });
  // Filtro por tipo/local + lista para enviar ao responsável do local
  const [filterTypes, setFilterTypes]       = React.useState([]);   // multi-seleção de tipos de atividade/treinamento
  const [filterLocals, setFilterLocals]     = React.useState([]);   // multi-seleção de locais ("" = sem local)
  const [showSummary, setShowSummary]       = React.useState(false);
  const [summaryGroupBy, setSummaryGroupBy] = React.useState("local"); // "local" | "type"
  const [copied, setCopied]                 = React.useState(false);

  const openClassForEdit = (classId) => {
    if (!classId || !setScheduleTabs || !setActiveTabId || !setActive) return;
    const rows = schedules.filter(s => s.classId === classId)
      .slice().sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime));
    if (!rows.length) return;
    const cls = rows[0].className;
    const training = trainings?.find(t => String(t.id) === String(rows[0]?.trainingId));
    const grouped = [];
    rows.forEach(r => {
      const existing = grouped.find(g => g.module === r.module && g.date === r.date && g.startTime === r.startTime && g.endTime === r.endTime);
      if (existing) {
        existing.slots = [...existing.slots, { id: r.id, instructorId: String(r.instructorId||""), local: r.local||"", ...(r.role ? { role: r.role } : {}), ...(r.role === "Translator" ? { isTranslator: true } : {}) }];
      } else {
        grouped.push({ ...r, slots: [{ id: r.id, instructorId: String(r.instructorId||""), local: r.local||"", ...(r.role ? { role: r.role } : {}), ...(r.role === "Translator" ? { isTranslator: true } : {}) }] });
      }
    });
    const enriched = grouped.map(r => {
      const mod = training?.modules?.find(m => m.name === r.module);
      const rawDur = _covTimeToMins(r.endTime) - _covTimeToMins(r.startTime);
      return { ...r, _minutes: rawDur, mod: mod || { name: r.module, type: r.role?.includes("Practical") ? "PRÁTICA" : "TEORIA", minutes: rawDur } };
    });
    const BLANK_WIZ = { trainingId:"", className:"", date:"", startTime:"08:00", studentCount:"", observation:"", withTranslator:false, modeId:"", linkToOther:false, linkedClassNames:[] };
    const id = Date.now();
    setScheduleTabs(prev => {
      if (prev.length >= 5) { alert("Limite de 5 abas atingido. Feche uma aba para abrir outra."); return prev; }
      return [...prev, { id, title: cls, step: 3, wizForm: BLANK_WIZ, planItems: [], editCls: cls, editClassId: classId, editStudentCount: rows[0]?.studentCount || "", editObservation: rows[0]?.observation || "", editItems: enriched, returnTo: "cobertura" }];
    });
    setActiveTabId(id);
    setActive("schedule");
  };

  const prevDay = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); setDate(d.toISOString().split("T")[0]); };
  const nextDay = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); setDate(d.toISOString().split("T")[0]); };
  const isToday = date === todayStr;
  const fmtDay = ds => new Date(ds + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  // Coberturas por instrutor
  const allCov = React.useMemo(() => instructors
    .map(instr => {
      const cov = computeCoverage(instr, date, schedules, activities, absences, holidays);
      const inactive = instr.status === "Inativo";
      // Instrutor inativo só aparece neste dia se ainda tiver algo registrado nele (ex: turma a remarcar)
      if (inactive && cov.status === "empty") return null;
      const clt = isClt(instr);
      const free = isFreelancer(instr);
      const offshore = isOffshore(instr);
      let issue = null; // "empty" (CLT sem nada), "partial" (CLT cobertura < 100%), "undecided" (freelancer sem nada)
      if (!inactive) {
        if (clt) {
          if (cov.status === "empty") issue = "empty";
          else if (cov.status === "training" || cov.status === "activity") {
            const mins = coverageMinutesClt(cov.blocks);
            if (mins < COV_CLT_EXPECTED_MIN) issue = "partial";
          }
        } else if (free) {
          if (cov.status === "empty" || cov.status === "holiday") issue = "undecided";
        }
      }
      return { instr, cov, clt, free, offshore, issue, inactive };
    })
    .filter(Boolean), [instructors, date, schedules, activities, absences, holidays]);

  const issuesCLT = allCov.filter(r => r.clt && (r.issue === "empty" || r.issue === "partial"));
  const undecidedFL = allCov.filter(r => r.free && r.issue === "undecided");

  // ── Resumo por Local / Tipo ────────────────────────────────────────────────
  // Tipos "alocáveis" (têm local + horário): treinamento + atividades internas.
  // + feriado / banco de horas / vazio (sem local — entram em "Sem local").
  const SUMMARY_TYPES = ["training","maintenance","development","customer_service","almoxarifado","cenario","marketing","qsms","material_pdi","holiday_work","mandatory_training","emergency_drill","aso","complemento_modulo","embarque","holiday","bank_hours","vazio"];
  const typeLabelOf = (t) => {
    if (t === "training")   return "Treinamento";
    if (t === "holiday")    return "Feriado";
    if (t === "bank_hours") return "Banco de Horas";
    if (t === "vazio")      return "Vazio";
    return ACTIVITY_TYPES[t]?.label || t;
  };
  const typeColorOf = (t) => {
    if (t === "training")   return "#16a34a";
    if (t === "holiday")    return "#06b6d4";
    if (t === "bank_hours") return "#f59e0b";
    if (t === "vazio")      return "#ef4444";
    return ACTIVITY_TYPES[t]?.color || "#64748b";
  };

  // Achata todos os blocos alocáveis do dia em linhas (quem × tipo × local × horário)
  const dayBlocks = React.useMemo(() => {
    const out = [];
    allCov.forEach(({ instr, cov }) => {
      cov.blocks.forEach(b => {
        // Feriado e Banco de Horas só existem como conceito para CLT (inclui CLT Offshore).
        // Freelancer não tem feriado nem banco de horas — pra ele isso é só "Livre"/Vazio.
        if ((b.type === "holiday" || b.type === "absence") && !isClt(instr)) return;
        // Ausência: só entra como "Banco de Horas" (demais categorias ficam de fora)
        let vType = b.type;
        if (b.type === "absence") {
          const cat = (b.ref && b.ref.category) || b.label || "";
          if (/Folga\s+Banco/i.test(cat)) vType = "bank_hours";
          else return;
        }
        if (!SUMMARY_TYPES.includes(vType)) return;
        out.push({
          instrId: instr.id, instrName: instr.name,
          type: vType, typeLabel: typeLabelOf(vType), color: typeColorOf(vType),
          local: (b.ref && b.ref.local) || "",
          startTime: b.startTime || "", endTime: b.endTime || "",
          label: b.label || "", sub: b.sub || "",
          // Observação: atividade interna guarda em `obs`; turma guarda em `observation`.
          obs: (b.ref && (b.ref.obs || b.ref.observation)) || "",
        });
      });
      // Instrutor sem nenhuma justificativa no dia → entra como "Vazio"
      if (cov.status === "empty") {
        out.push({
          instrId: instr.id, instrName: instr.name,
          type: "vazio", typeLabel: typeLabelOf("vazio"), color: typeColorOf("vazio"),
          local: "", startTime: "", endTime: "", label: "Vazio", sub: "", obs: "",
        });
      }
    });
    return out;
  }, [allCov]);

  // Tipos e locais realmente presentes no dia (alimentam as chips — sem ruído de opções vazias)
  const typesInDay  = [...new Set(dayBlocks.map(b => b.type))].sort((a, b) => SUMMARY_TYPES.indexOf(a) - SUMMARY_TYPES.indexOf(b));
  const localsInDay = [...new Set(dayBlocks.map(b => b.local))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));

  // Blocos após aplicar os filtros de tipo/local
  const filteredBlocks = dayBlocks.filter(b =>
    (filterTypes.length === 0  || filterTypes.includes(b.type)) &&
    (filterLocals.length === 0 || filterLocals.includes(b.local)));
  const tlFilterActive  = filterTypes.length > 0 || filterLocals.length > 0;
  const matchingInstrIds = new Set(filteredBlocks.map(b => b.instrId));

  // Agrupa pra exibição/exportação (por local ou por tipo)
  const summaryGroups = React.useMemo(() => {
    const map = new Map();
    filteredBlocks.forEach(b => {
      const key = summaryGroupBy === "local" ? (b.local || "__none__") : b.type;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(b);
    });
    const arr = [...map.entries()].map(([key, items]) => ({
      key,
      title: summaryGroupBy === "local" ? (key === "__none__" ? "Sem local definido" : key) : typeLabelOf(key),
      items: items.slice().sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "") || a.instrName.localeCompare(b.instrName)),
    }));
    arr.sort((a, b) => a.title.localeCompare(b.title));
    return arr;
  }, [filteredBlocks, summaryGroupBy]);

  const toggleType    = (t) => setFilterTypes(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
  const toggleLocal   = (l) => setFilterLocals(p => p.includes(l) ? p.filter(x => x !== l) : [...p, l]);
  const clearTlFilters = () => { setFilterTypes([]); setFilterLocals([]); };

  const filterLabelText = () => {
    const parts = [];
    if (filterTypes.length)  parts.push(filterTypes.map(typeLabelOf).join(", "));
    if (filterLocals.length) parts.push(filterLocals.map(l => l || "Sem local").join(", "));
    return parts.join(" · ");
  };

  const buildSummaryText = () => {
    let t = "RelyOn 360 — Linha do Tempo\n" + fmtDay(date);
    const fl = filterLabelText();
    if (fl) t += "\nFiltro: " + fl;
    t += "\n";
    if (!summaryGroups.length) { t += "\n(nada para mostrar com os filtros atuais)\n"; return t; }
    summaryGroups.forEach(g => {
      t += "\n" + (summaryGroupBy === "local" ? "📍 " : "▸ ") + g.title + "\n";
      g.items.forEach(it => {
        const period = (it.startTime && it.endTime) ? `${it.startTime}–${it.endTime}` : "dia todo";
        const obsTxt = it.obs ? ` · obs: ${it.obs}` : "";
        if (summaryGroupBy === "local") {
          t += `  • ${it.typeLabel} — ${it.instrName} (${period})` + (it.type === "training" && it.sub ? ` · ${it.sub}` : "") + obsTxt + "\n";
        } else {
          t += `  • ${it.instrName} (${period})` + (it.local ? ` · ${it.local}` : "") + (it.type === "training" && it.sub ? ` · ${it.sub}` : "") + obsTxt + "\n";
        }
      });
    });
    return t;
  };

  const copySummary = async () => {
    const txt = buildSummaryText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(txt);
      } else {
        const ta = document.createElement("textarea");
        ta.value = txt; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      }
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (e) { alert("Não consegui copiar automaticamente. Segue o texto:\n\n" + txt); }
  };

  // Lista visível conforme filtros
  const filtered = allCov.filter(r => {
    const nameOk = search ? r.instr.name.toLowerCase().includes(search.toLowerCase()) : true;
    if (!nameOk) return false;
    if (tlFilterActive && !matchingInstrIds.has(r.instr.id)) return false;
    if (filterContract === "clt")           return r.clt && !r.offshore;
    if (filterContract === "clt_empty")     return r.clt && !r.offshore && r.issue === "empty";
    if (filterContract === "clt_ok")        return r.clt && !r.offshore && !r.issue;
    if (filterContract === "freelancer")       return r.free;
    if (filterContract === "freelancer_empty") return r.free && r.issue === "undecided";
    if (filterContract === "freelancer_ok")    return r.free && !r.issue;
    if (filterContract === "offshore")         return r.offshore;
    if (filterContract === "offshore_free")    return r.offshore && r.cov.status === "empty";
    if (filterContract === "offshore_ok")      return r.offshore && !r.issue;
    if (filterContract === "issues")        return !!r.issue;
    return true;
  }).sort((a, b) => {
    // Prioriza pendências, depois ordem alfabética
    const ra = a.issue ? 0 : 1, rb = b.issue ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return (a.instr.name || "").localeCompare(b.instr.name || "");
  });

  // Cores e legenda
  const legend = [
    { c: "#16a34a", l: "Treinamento" },
    { c: ACTIVITY_TYPES.maintenance.color, l: "Manutenção" },
    { c: ACTIVITY_TYPES.development.color, l: "Desenvolvimento" },
    { c: ACTIVITY_TYPES.customer_service.color, l: "Apoio CS" },
    { c: ACTIVITY_TYPES.almoxarifado.color, l: "Almoxarifado" },
    { c: ACTIVITY_TYPES.cenario.color, l: "Apoio Cenário" },
    { c: ACTIVITY_TYPES.marketing.color, l: "Apoio Marketing" },
    { c: ACTIVITY_TYPES.qsms.color, l: "Apoio QSMS" },
    { c: ACTIVITY_TYPES.material_pdi.color, l: "Material Didático - PDI" },
    { c: ACTIVITY_TYPES.holiday_work.color,       l: "Feriado" },
    { c: ACTIVITY_TYPES.mandatory_training.color, l: "Treinamento Obrigatório" },
    { c: ACTIVITY_TYPES.emergency_drill.color,    l: "Simulado de Emergência" },
    { c: ACTIVITY_TYPES.aso.color,                l: "ASO" },
    { c: ACTIVITY_TYPES.complemento_modulo.color, l: "Complemento de Módulo" },
    { c: ACTIVITY_TYPES.embarque.color,           l: "Embarque" },
    { c: ACTIVITY_TYPES.free.color,               l: "Livre (avaliado)" },
    { c: "#ef4444", l: "Ausência" },
    { c: "#f59e0b", l: "Folga BH" },
    { c: "#ef444450", l: "CLT sem cobertura", hatched: true },
    { c: "#64748b40", l: "Freelancer sem decisão" },
  ];

  // ── Renderização da timeline ──────────────────────────────────────────────
  // Posiciona um bloco em % na barra de 08-20h, clamping em ambas as bordas
  const blockBox = (b) => {
    // Horário ausente/malformado (ex: corrupção de horário em turma T-HUET noturno)
    // não pode virar 00:00 silenciosamente — isso faz o bloco colapsar (e<=s) e
    // sumir da timeline, disfarçando o registro de "instrutor livre". Em vez disso,
    // cai pro fallback dia-inteiro pra continuar visível como um alerta.
    const hasValidStart = b.startTime && b.startTime.includes(":");
    const hasValidEnd   = b.endTime   && b.endTime.includes(":");
    const useFullDay = b.fullDay || !hasValidStart || !hasValidEnd;
    const bs = useFullDay ? COV_DAY_START_MIN : _covTimeToMins(b.startTime);
    const be = useFullDay ? COV_DAY_END_MIN  : _covTimeToMins(b.endTime);
    const s = Math.max(bs, COV_DAY_START_MIN);
    const e = Math.min(be, COV_DAY_END_MIN);
    if (e <= s) return null;
    const left = ((s - COV_DAY_START_MIN) / COV_DAY_SPAN_MIN) * 100;
    const width = ((e - s) / COV_DAY_SPAN_MIN) * 100;
    return { left, width };
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:12, marginBottom:6 }}>
        <div>
          <h2 style={{ color:"#fff", fontWeight:800, margin:0, fontSize:24 }}>Linha do Tempo</h2>
          <p style={{ color:"#64748b", margin:"4px 0 0", fontSize:14, textTransform:"capitalize" }}>{fmtDay(date)}</p>
        </div>
        <p style={{ color:"#475569", margin:0, fontSize:12, maxWidth:380, lineHeight:1.4 }}>
          CLT precisa cobertura completa do expediente. Freelancer precisa <strong style={{color:"#94a3b8"}}>LIVRE</strong> ou alocação explícita.
        </p>
      </div>

      {/* Navegação por data */}
      <div style={{ display:"flex", alignItems:"center", gap:8, margin:"20px 0 18px", flexWrap:"wrap" }}>
        <button onClick={prevDay} style={{ padding:"8px 14px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", cursor:"pointer", fontSize:13 }}>
          ‹ Anterior
        </button>
        <button onClick={() => setDate(todayStr)} style={{ padding:"8px 16px", background: isToday ? "#ffa619" : "#073d4a", border:"1px solid " + (isToday ? "#ffa619" : "#154753"), borderRadius:8, color: isToday ? "#fff" : "#e2e8f0", cursor:"pointer", fontWeight: isToday ? 700 : 400, fontSize:13 }}>
          Hoje
        </button>
        <button onClick={nextDay} style={{ padding:"8px 14px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", cursor:"pointer", fontSize:13 }}>
          Próximo ›
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding:"7px 12px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none" }} />
      </div>

      {/* Banner de pendências */}
      {(issuesCLT.length > 0 || undecidedFL.length > 0) && (
        <div style={{ background:"#073d4a", border:"1px solid " + (issuesCLT.length > 0 ? "#ef444460" : "#d9780640"), borderRadius:14, padding:"14px 18px", marginBottom:18, display:"flex", gap:14, flexWrap:"wrap", alignItems:"center" }}>
          <Icon name="warning" size={20} color={issuesCLT.length > 0 ? "#ef4444" : "#d97806"} />
          <div style={{ display:"flex", gap:18, flexWrap:"wrap", flex:1 }}>
            {issuesCLT.length > 0 && (
              <button onClick={() => setFilterContract("issues")}
                style={{ background:"none", border:"none", padding:0, cursor:"pointer", color:"#ef4444", fontWeight:700, fontSize:14, textAlign:"left" }}>
                {issuesCLT.length} CLT pendente{issuesCLT.length > 1 ? "s" : ""} <span style={{ color:"#94a3b8", fontWeight:400, fontSize:12 }}>(clique para filtrar)</span>
              </button>
            )}
            {undecidedFL.length > 0 && (
              <button onClick={() => setFilterContract("issues")}
                style={{ background:"none", border:"none", padding:0, cursor:"pointer", color:"#d97806", fontWeight:700, fontSize:14, textAlign:"left" }}>
                {undecidedFL.length} freelancer{undecidedFL.length > 1 ? "s" : ""} sem decisão <span style={{ color:"#94a3b8", fontWeight:400, fontSize:12 }}>(clique para filtrar)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filtros */}
      {(() => {
        const _Btn = (v, l, c) => {
          const on = filterContract === v;
          return (
            <button key={v} onClick={() => setFilterContract(v)}
              style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${on ? c : "#154753"}`, background: on ? c + "20" : "transparent", color: on ? c : "#94a3b8", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
              {l}
            </button>
          );
        };
        const _Sep = () => <div style={{ width:1, height:22, background:"#154753", flexShrink:0, alignSelf:"center" }} />;
        return (
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
            {_Btn("all", "Todos", "#fff")}
            <_Sep />
            {_Btn("clt",       "Só CLT",      "#3b82f6")}
            {_Btn("clt_empty", "CLT Vazio",   "#ef4444")}
            {_Btn("clt_ok",    "CLT Ocupado", "#16a34a")}
            <_Sep />
            {_Btn("freelancer",       "Só Freelancer",      "#f59e0b")}
            {_Btn("freelancer_empty", "Freelancer Vazio",   "#ef4444")}
            {_Btn("freelancer_ok",    "Freelancer Ocupado", "#16a34a")}
            <_Sep />
            {_Btn("offshore",      "Só Offshore",      "#8b5cf6")}
            {_Btn("offshore_free", "Offshore Livre",   "#ef4444")}
            {_Btn("offshore_ok",   "Offshore Ocupado", "#16a34a")}
            <_Sep />
            {_Btn("issues", "Só pendentes", "#ef4444")}
            <div style={{ position:"relative", marginLeft:"auto" }}>
              <div style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
                <Icon name="search" size={14} color="#64748b" />
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar instrutor..."
                style={{ padding:"9px 12px 9px 32px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", width:220 }} />
            </div>
          </div>
        );
      })()}

      {/* Filtro por Tipo / Local + lista para enviar ao responsável do local */}
      {dayBlocks.length > 0 && (
        <div style={{ marginBottom:14, padding:"12px 14px", background:"#01323d", borderRadius:10, border:"1px solid #154753" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:10 }}>
            <span style={{ color:"#94a3b8", fontSize:12, fontWeight:700, letterSpacing:0.3 }}>FILTRAR POR TIPO / LOCAL</span>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              {tlFilterActive && (
                <button onClick={clearTlFilters} style={{ background:"none", border:"none", color:"#64748b", fontSize:12, cursor:"pointer", textDecoration:"underline" }}>limpar</button>
              )}
              <button onClick={() => setShowSummary(s => !s)}
                style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #ffa61960", background: showSummary ? "#ffa61920" : "#073d4a", color:"#ffa619", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                📋 {showSummary ? "Ocultar lista" : "Lista para enviar"}
              </button>
            </div>
          </div>

          {/* Chips de tipo */}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom: localsInDay.length ? 10 : 0 }}>
            {typesInDay.map(t => {
              const on = filterTypes.includes(t);
              const c = typeColorOf(t);
              return (
                <button key={t} onClick={() => toggleType(t)}
                  style={{ padding:"5px 12px", borderRadius:20, border:`1px solid ${on ? c : "#154753"}`, background: on ? c + "25" : "transparent", color: on ? c : "#94a3b8", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ width:9, height:9, borderRadius:3, background:c, display:"inline-block" }} />
                  {typeLabelOf(t)}
                </button>
              );
            })}
          </div>

          {/* Chips de local */}
          {localsInDay.length > 0 && (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {localsInDay.map(l => {
                const on = filterLocals.includes(l);
                return (
                  <button key={l || "__none__"} onClick={() => toggleLocal(l)}
                    style={{ padding:"5px 12px", borderRadius:20, border:`1px solid ${on ? "#06b6d4" : "#154753"}`, background: on ? "#06b6d425" : "transparent", color: on ? "#06b6d4" : "#94a3b8", fontSize:12, fontWeight: l ? 700 : 400, fontStyle: l ? "normal" : "italic", cursor:"pointer", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:5 }}>
                    <Icon name="location" size={11} color={on ? "#06b6d4" : "#64748b"} /> {l || "Sem local"}
                  </button>
                );
              })}
            </div>
          )}

          {/* Painel: lista agrupada pronta para enviar */}
          {showSummary && (
            <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #154753" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:10 }}>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <span style={{ color:"#64748b", fontSize:12 }}>Agrupar por:</span>
                  {[["local","Local"],["type","Tipo"]].map(([v, l]) => (
                    <button key={v} onClick={() => setSummaryGroupBy(v)}
                      style={{ padding:"4px 12px", borderRadius:14, border:`1px solid ${summaryGroupBy===v ? "#ffa619" : "#154753"}`, background: summaryGroupBy===v ? "#ffa61920" : "transparent", color: summaryGroupBy===v ? "#ffa619" : "#94a3b8", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      {l}
                    </button>
                  ))}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={copySummary}
                    style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #16a34a60", background:"#16a34a18", color:"#22c55e", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                    {copied ? "✓ Copiado!" : "📄 Copiar texto"}
                  </button>
                  <button onClick={() => printCoverageSummary({ dateStr: date, dateLabel: fmtDay(date), groupBy: summaryGroupBy, groups: summaryGroups, filterLabel: filterLabelText() })}
                    style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #3b82f660", background:"#3b82f618", color:"#60a5fa", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                    🖨 Gerar PDF
                  </button>
                </div>
              </div>

              {summaryGroups.length === 0 ? (
                <p style={{ color:"#64748b", fontSize:13, padding:"10px 0" }}>Nada para mostrar com os filtros atuais.</p>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {summaryGroups.map(g => (
                    <div key={g.key} style={{ background:"#073d4a", borderRadius:8, border:"1px solid #15475360", overflow:"hidden" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 12px", background:"#0e3a45", borderBottom:"1px solid #154753" }}>
                        <span style={{ color:"#e2e8f0", fontWeight:800, fontSize:13 }}>{summaryGroupBy === "local" ? "📍 " : "▸ "}{g.title}</span>
                        <span style={{ color:"#64748b", fontSize:11, fontWeight:600 }}>{g.items.length} alocaç{g.items.length !== 1 ? "ões" : "ão"}</span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column" }}>
                        {g.items.map((it, i) => {
                          const period = (it.startTime && it.endTime) ? `${it.startTime}–${it.endTime}` : "dia todo";
                          const badge = summaryGroupBy === "local" ? it.typeLabel : (it.local || "Sem local");
                          const badgeColor = summaryGroupBy === "local" ? it.color : "#06b6d4";
                          const det = it.type === "training" ? it.sub : "";
                          return (
                            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 12px", borderTop: i ? "1px solid #15475330" : "none" }}>
                              <span style={{ flexShrink:0, padding:"2px 9px", borderRadius:10, background: badgeColor + "22", color: badgeColor, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{badge}</span>
                              <span style={{ color:"#e2e8f0", fontSize:13, fontWeight:600, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {it.instrName}{det ? <span style={{ color:"#64748b", fontWeight:400 }}> · {det}</span> : null}{it.obs ? <span style={{ color:"#64748b", fontWeight:400, fontStyle:"italic" }}> · {it.obs}</span> : null}
                              </span>
                              <span style={{ flexShrink:0, color:"#94a3b8", fontSize:12, fontWeight:700, fontVariantNumeric:"tabular-nums" }}>{period}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Legenda */}
      <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:12, padding:"10px 14px", background:"#01323d", borderRadius:10, border:"1px solid #154753" }}>
        {legend.map((l, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:14, height:10, borderRadius:3,
              background: l.hatched
                ? "repeating-linear-gradient(135deg," + l.c + "," + l.c + " 3px,transparent 3px,transparent 6px)"
                : l.c }} />
            <span style={{ color:"#94a3b8", fontSize:11 }}>{l.l}</span>
          </div>
        ))}
      </div>

      {/* Header da timeline (horas) */}
      <div style={{ display:"flex", gap:0, alignItems:"center", padding:"6px 0", borderBottom:"1px solid #154753", marginBottom:6 }}>
        <div style={{ width:200, flexShrink:0, color:"#64748b", fontSize:11, fontWeight:700, paddingLeft:6 }}>INSTRUTOR</div>
        <div style={{ flex:1, position:"relative", height:18, marginRight:160 }}>
          {Array.from({ length: 13 }, (_, i) => {
            const h = 8 + i;
            const pct = (i / 12) * 100;
            return (
              <div key={i} style={{ position:"absolute", left:`${pct}%`, transform:"translateX(-50%)", color:"#64748b", fontSize:10, fontWeight:600 }}>
                {String(h).padStart(2, "0")}
              </div>
            );
          })}
        </div>
        <div style={{ width:160, flexShrink:0, color:"#64748b", fontSize:11, fontWeight:700, textAlign:"right", paddingRight:6 }}>AÇÕES</div>
      </div>

      {/* Lista de instrutores com timeline */}
      {filtered.length === 0 ? (
        <div style={{ padding:60, textAlign:"center", background:"#073d4a", borderRadius:12, border:"1px solid #154753" }}>
          <p style={{ color:"#64748b", fontSize:14 }}>Nenhum instrutor encontrado com esses filtros.</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          {filtered.map(({ instr, cov, clt, free, offshore, issue }) => {
            const contractLabel = offshore ? "Offshore" : clt ? "CLT" : free ? "Freelancer" : (instr.contract || "—");
            const contractColor = offshore ? "#8b5cf6" : clt ? "#3b82f6" : free ? "#f59e0b" : "#64748b";
            const issueColor = issue === "empty" ? "#ef4444" : issue === "partial" ? "#d97806" : issue === "undecided" ? "#d97806" : null;
            const issueLabel = issue === "empty" ? "VAZIO" : issue === "partial" ? "PARCIAL" : issue === "undecided" ? "SEM DECISÃO" : null;
            const minsClt = clt ? coverageMinutesClt(cov.blocks) : 0;
            const pctClt = clt ? Math.min(100, Math.round((minsClt / COV_CLT_EXPECTED_MIN) * 100)) : 0;

            // Detecta sobreposições de blocos (dois blocos com horários que se cruzam).
            // Moderador EAD é excluído: pode estar em várias turmas EAD ao mesmo tempo
            // (ambiente virtual único) — não é conflito de verdade, mesma regra de
            // checkSlotConflict em schedule.js.
            const overlapPairs = (() => {
              const tb = cov.blocks.filter(b => !b.fullDay && b.startTime && b.endTime && b.ref?.role !== EAD_MODERATOR_ROLE);
              const pairs = [];
              for (let i = 0; i < tb.length; i++) {
                for (let j = i + 1; j < tb.length; j++) {
                  const a = tb[i], b = tb[j];
                  const aS = _covTimeToMins(a.startTime), aE = _covTimeToMins(a.endTime);
                  const bS = _covTimeToMins(b.startTime), bE = _covTimeToMins(b.endTime);
                  if (aS < bE && bS < aE) pairs.push([a, b]);
                }
              }
              return pairs;
            })();
            const hasOverlap = overlapPairs.length > 0;
            const overlapTip = overlapPairs.map(([a, b]) =>
              `"${a.label}" (${a.startTime}–${a.endTime}) × "${b.label}" (${b.startTime}–${b.endTime})`
            ).join("\n");

            const rowBg = hasOverlap ? "#7f1d1d35" : (issue ? (issue === "empty" ? "#7f1d1d10" : "#d9780610") : "#073d4a40");
            const rowBorder = hasOverlap ? "1.5px solid #ef4444" : `1px solid ${issueColor ? issueColor + "30" : "#15475330"}`;

            return (
              <div key={instr.id} title={hasOverlap ? ("⚠ Conflito de horário:\n" + overlapTip) : undefined}
                style={{ display:"flex", alignItems:"center", gap:0, padding:"8px 6px", borderRadius:8, background: rowBg, border: rowBorder,
                  ...(hasOverlap ? { boxShadow:"0 0 0 1px #ef444430" } : {}) }}>
                {/* Nome + contrato */}
                <div style={{ width:200, flexShrink:0, paddingRight:8 }}>
                  <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:13, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{instr.name.split(" ").slice(0, 3).join(" ")}</div>
                  <div style={{ display:"flex", gap:5, alignItems:"center", marginTop:2, flexWrap:"wrap" }}>
                    <span style={{ padding:"1px 7px", borderRadius:10, background: contractColor + "20", color: contractColor, fontSize:10, fontWeight:700 }}>{contractLabel}</span>
                    {issueLabel && <span style={{ padding:"1px 7px", borderRadius:10, background: issueColor + "25", color: issueColor, fontSize:9, fontWeight:800, letterSpacing:0.4 }}>{issueLabel}</span>}
                    {hasOverlap && (
                      <span title={"Conflito de horário:\n" + overlapTip}
                        style={{ padding:"1px 7px", borderRadius:10, background:"#ef444430", color:"#ef4444", fontSize:9, fontWeight:800, letterSpacing:0.4, cursor:"help" }}>
                        ⚠ CONFLITO
                      </span>
                    )}
                    {clt && !issue && !hasOverlap && cov.status !== "absence" && cov.status !== "holiday" && (
                      <span style={{ color:"#16a34a", fontSize:10, fontWeight:700 }}>✓ {pctClt}%</span>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div style={{ flex:1, position:"relative", height:30, marginRight:8, background:"#01323d", borderRadius:6, overflow:"hidden",
                  border: clt && issue ? "1px solid #ef444440" : (free && issue ? "1px solid #64748b40" : "1px solid #15475360") }}>
                  {/* Fundo: hachura pra CLT pendente, cinza pra freelancer sem decisão */}
                  {clt && issue === "empty" && (
                    <div style={{ position:"absolute", inset:0, background:"repeating-linear-gradient(135deg,#ef444440,#ef444440 4px,transparent 4px,transparent 9px)" }} />
                  )}
                  {clt && issue === "partial" && (
                    <div style={{ position:"absolute", inset:0, background:"repeating-linear-gradient(135deg,#d9780620,#d9780620 4px,transparent 4px,transparent 9px)" }} />
                  )}
                  {free && issue === "undecided" && (
                    <div style={{ position:"absolute", inset:0, background:"#64748b15" }} />
                  )}
                  {/* Gridlines para cada hora */}
                  {Array.from({ length: 11 }, (_, i) => (
                    <div key={i} style={{ position:"absolute", left:`${((i+1)/12)*100}%`, top:0, bottom:0, width:1, background:"#15475360" }} />
                  ))}
                  {/* Linhas verticais especiais: 12:00 (almoço) e 17:00 (fim expediente CLT) */}
                  {clt && (
                    <>
                      <div style={{ position:"absolute", left:`${(4/12)*100}%`, top:0, bottom:0, width:1, background:"#ffa61980" }} title="Almoço" />
                      <div style={{ position:"absolute", left:`${(5/12)*100}%`, top:0, bottom:0, width:1, background:"#ffa61980" }} title="Almoço" />
                      <div style={{ position:"absolute", left:`${(9/12)*100}%`, top:0, bottom:0, width:1.5, background:"#ffa619" }} title="Fim do expediente" />
                    </>
                  )}
                  {/* Blocos */}
                  {cov.blocks.map((b, i) => {
                    const box = blockBox(b);
                    if (!box) return null;
                    const tip = `${b.label}${b.sub ? " · " + b.sub : ""} (${b.startTime}–${b.endTime})`;
                    const isFree = b.type === "free";
                    const isHoliday = b.type === "holiday";
                    const isTraining = b.type === "training";
                    const _editable = ["maintenance","development","customer_service","almoxarifado","cenario","marketing","qsms","holiday_work","mandatory_training","emergency_drill","aso","complemento_modulo","material_pdi","embarque"];
                    const isClickable = (b.ref && (_editable.includes(b.type) || isTraining)) || isFree || (b.type === "absence" && b.ref?.category === "Folga Banco de Horas");
                    const handleClick = () => {
                      if (b.ref && _editable.includes(b.type)) {
                        setActivityModal({ show: true, instr, editing: b.ref });
                      } else if (isTraining && b.ref) {
                        openClassForEdit(b.ref.classId);
                      } else if (isFree && b.ref) {
                        setFreeModal({ show: true, instr, editing: b.ref });
                      } else if (b.type === "absence" && b.ref?.category === "Folga Banco de Horas") {
                        setBankHoursModal({ show: true, instr, editing: b.ref });
                      }
                    };
                    return (
                      <div key={i} title={tip} onClick={handleClick}
                        style={{
                          position:"absolute", left:`${box.left}%`, width:`${box.width}%`, top:3, bottom:3,
                          background: b.color, borderRadius:4, cursor: isClickable ? "pointer" : "default",
                          display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden",
                          border: `1px solid ${b.color}`,
                          ...(isFree ? { background:"repeating-linear-gradient(135deg," + b.color + "," + b.color + " 5px," + b.color + "70 5px," + b.color + "70 10px)" } : {}),
                        }}>
                        <span style={{ color: isHoliday ? "#01323d" : "#fff", fontSize:9, fontWeight:700, textShadow:"0 1px 1px rgba(0,0,0,0.4)", whiteSpace:"nowrap", textOverflow:"ellipsis", overflow:"hidden", padding:"0 4px" }}>
                          {isFree ? "LIVRE" : (ACTIVITY_TYPES[b.type]?.short || b.label.slice(0, 14))}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Ações */}
                <div style={{ width:160, flexShrink:0, display:"flex", gap:4, justifyContent:"flex-end", flexWrap:"wrap" }}>
                  <button onClick={() => setActivityModal({ show: true, instr, editing: null })}
                    title="Adicionar atividade interna"
                    style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:6, padding:"5px 9px", color:"#94a3b8", cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", gap:4 }}>
                    <Icon name="plus" size={10} color="#94a3b8" /> Atividade
                  </button>
                  {clt && (
                    <button onClick={() => setBankHoursModal({ show: true, instr, editing: null })}
                      title="Registrar Folga Banco de Horas"
                      style={{ background:"#073d4a", border:"1px solid #f59e0b40", borderRadius:6, padding:"5px 9px", color:"#f59e0b", cursor:"pointer", fontSize:11 }}>
                      Folga BH
                    </button>
                  )}
                  {free && (
                    <button onClick={() => setFreeModal({ show: true, instr, editing: null })}
                      title="Marcar dia como LIVRE (avaliado e sem alocação)"
                      style={{ background: cov.status === "free" ? "#94a3b820" : "#073d4a", border:"1px solid " + (cov.status === "free" ? "#94a3b860" : "#154753"), borderRadius:6, padding:"5px 9px", color: cov.status === "free" ? "#94a3b8" : "#64748b", cursor:"pointer", fontSize:11, fontWeight: cov.status === "free" ? 700 : 400 }}>
                      {cov.status === "free" ? "✓ Livre" : "Livre"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: criar/editar atividade interna */}
      {activityModal.show && (
        <ActivityModal
          instr={activityModal.instr}
          date={date}
          editing={activityModal.editing}
          activities={activities}
          setActivities={setActivities}
          schedules={schedules}
          onClose={() => setActivityModal({ show: false, instr: null, editing: null })}
          onAskDelete={(action) => setDelGuard({ show: true, action, pass: "", err: "" })}
        />
      )}

      {/* Modal: marcar LIVRE */}
      {freeModal.show && (
        <FreeModal
          instr={freeModal.instr}
          date={date}
          editing={freeModal.editing}
          activities={activities}
          setActivities={setActivities}
          onClose={() => setFreeModal({ show: false, instr: null, editing: null })}
          onAskDelete={(action) => setDelGuard({ show: true, action, pass: "", err: "" })}
        />
      )}

      {bankHoursModal.show && (
        <BankHoursModal
          instr={bankHoursModal.instr}
          date={date}
          editing={bankHoursModal.editing}
          absences={absences}
          setAbsences={setAbsences}
          onClose={() => setBankHoursModal({ show: false, instr: null, editing: null })}
          onAskDelete={(action) => setDelGuard({ show: true, action, pass: "", err: "" })}
        />
      )}

      <DeleteGuardModal guard={delGuard} setGuard={setDelGuard} user={user} />
    </div>
  );
};

// ── MODAL: Atividade interna (manutenção/desenvolvimento) ────────────────────
const ActivityModal = ({ instr, date, editing, activities, setActivities, schedules, onClose, onAskDelete }) => {
  const isEdit = !!editing;
  const [type, setType]           = React.useState(editing?.type || "maintenance");
  const [startTime, setStartTime] = React.useState(editing?.startTime || "08:00");
  const [endTime, setEndTime]     = React.useState(editing?.endTime   || "12:00");
  const [local, setLocal]         = React.useState(editing?.local     || "");
  const [obs, setObs]             = React.useState(editing?.obs       || "");
  const [err, setErr]             = React.useState("");

  const internalLocals = LOCALS.filter(l => l.type === INTERNAL_LOCAL_TYPE);

  const save = () => {
    setErr("");
    if (!startTime || !endTime) { setErr("Informe início e fim."); return; }
    const sM = _covTimeToMins(startTime), eM = _covTimeToMins(endTime);
    if (eM <= sM) { setErr("O horário de fim deve ser maior que o de início."); return; }
    // Detecta sobreposição com treinamentos (que são fonte de receita — não pode misturar)
    const overlapsTraining = (schedules || []).some(s =>
      s.date === date && String(s.instructorId) === String(instr.id) &&
      _covTimeToMins(s.startTime) < eM && _covTimeToMins(s.endTime) > sM
    );
    if (overlapsTraining) { setErr("Este horário conflita com um treinamento já programado."); return; }
    // Sobreposição com outras atividades internas do mesmo instrutor no dia
    const overlapsActivity = (activities || []).some(a =>
      a.id !== (editing?.id) && a.date === date && String(a.instructorId) === String(instr.id) && a.type !== "free" &&
      _covTimeToMins(a.startTime || "00:00") < eM && _covTimeToMins(a.endTime || "23:59") > sM
    );
    if (overlapsActivity) { setErr("Este horário conflita com outra atividade interna do instrutor."); return; }

    const payload = {
      type, startTime, endTime, local: local || "", obs: obs || "",
      instructorId: instr.id, instructorName: instr.name, date,
    };
    if (isEdit) {
      setActivities(activities.map(a => a.id === editing.id ? { ...a, ...payload } : a));
    } else {
      setActivities([...activities, { id: Date.now(), ...payload }]);
    }
    onClose();
  };

  const del = () => {
    onAskDelete(() => {
      setActivities(activities.filter(a => a.id !== editing.id));
      onClose();
    });
  };

  const info = ACTIVITY_TYPES[type] || { color: "#64748b", label: type };

  return (
    <Modal title={isEdit ? "Editar Atividade Interna" : "Nova Atividade Interna"} onClose={onClose} width={520}>
      <p style={{ color:"#94a3b8", fontSize:13, marginBottom:14 }}>
        <strong style={{ color:"#e2e8f0" }}>{instr.name}</strong> · {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long" })}
      </p>

      <Sel label="Tipo" value={type} onChange={e => setType(e.target.value)}
        opts={[
          { v: "maintenance",      l: "🔧 Manutenção" },
          { v: "development",      l: "📚 Desenvolvimento" },
          { v: "customer_service", l: "🎧 Apoio Customer Service" },
          { v: "almoxarifado",     l: "📦 Apoio Almoxarifado" },
          { v: "cenario",             l: "🎬 Apoio Cenário" },
          { v: "marketing",           l: "📣 Apoio Marketing" },
          { v: "qsms",                l: "🦺 Apoio QSMS" },
          { v: "material_pdi",        l: "📖 Material Didático - PDI" },
          { v: "holiday_work",        l: "🏖 Feriado" },
          { v: "mandatory_training",  l: "🎓 Treinamento Obrigatório" },
          { v: "emergency_drill",     l: "🚨 Simulado de Emergência" },
          { v: "aso",                 l: "🩺 ASO" },
          { v: "complemento_modulo",  l: "🎓 Complemento de Módulo" },
          { v: "embarque",            l: "⛵ Embarque" },
        ]} />

      <div style={{ display:"flex", gap:10 }}>
        <div style={{ flex:1 }}>
          <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Início</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
            style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
        </div>
        <div style={{ flex:1 }}>
          <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Fim</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
            style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
        </div>
      </div>

      <div style={{ display:"flex", gap:6, marginTop:8, marginBottom:14, flexWrap:"wrap" }}>
        {[
          { l: "Manhã",     s: "08:00", e: "12:00" },
          { l: "Tarde",     s: "13:00", e: "17:00" },
          { l: "Dia todo",  s: "08:00", e: "17:00" },
          { l: "1h",        s: startTime, e: minsToTimeG(_covTimeToMins(startTime) + 60) },
          { l: "2h",        s: startTime, e: minsToTimeG(_covTimeToMins(startTime) + 120) },
        ].map(p => (
          <button key={p.l} onClick={() => { setStartTime(p.s); setEndTime(p.e); }}
            style={{ padding:"3px 10px", borderRadius:6, border:"1px solid #154753", background:"#073d4a", color:"#94a3b8", fontSize:11, cursor:"pointer" }}>
            {p.l}
          </button>
        ))}
      </div>

      <div style={{ marginBottom:14 }}>
        <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Local interno (opcional)</label>
        {internalLocals.length === 0 ? (
          <p style={{ color:"#d97806", fontSize:12, background:"#d9780615", border:"1px solid #d9780640", borderRadius:8, padding:"8px 12px", margin:0 }}>
            Nenhum local interno cadastrado. Cadastre em <strong>Locais</strong> com tipo "Interno" (ex: ALMOXARIFADO, OFICINA DE MERGULHO).
          </p>
        ) : (
          <select value={local} onChange={e => setLocal(e.target.value)}
            style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none" }}>
            <option value="">— sem local —</option>
            {internalLocals.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            {/* Opção fixa para atividades fora dos locais internos cadastrados (ex: ASO na clínica) */}
            {!internalLocals.some(l => /^outros$/i.test((l.name || "").trim())) && <option value="Outros">Outros</option>}
          </select>
        )}
      </div>

      <div style={{ marginBottom:18 }}>
        <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Observação (opcional)</label>
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} maxLength={200} placeholder="Ex: manutenção dos manequins de RCP"
          style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
      </div>

      {err && <p style={{ color:"#f87171", fontSize:13, marginBottom:12 }}>{err}</p>}

      <div style={{ display:"flex", gap:8, justifyContent: isEdit ? "space-between" : "flex-start" }}>
        <div style={{ display:"flex", gap:8 }}>
          <Btn onClick={save} label={isEdit ? "Salvar" : "Criar"} icon="check" color={info.color} />
          <Btn onClick={onClose} label="Cancelar" color="#154753" />
        </div>
        {isEdit && <Btn onClick={del} label="Excluir" icon="delete" color="#ef4444" />}
      </div>
    </Modal>
  );
};

// ── MODAL: Marcar dia LIVRE (freelancer) ─────────────────────────────────────
const FreeModal = ({ instr, date, editing, activities, setActivities, onClose, onAskDelete }) => {
  const isEdit = !!editing;
  const [obs, setObs] = React.useState(editing?.obs || "");
  const [fullDay, setFullDay] = React.useState(editing ? !editing.startTime : true);
  const [startTime, setStartTime] = React.useState(editing?.startTime || "08:00");
  const [endTime, setEndTime]     = React.useState(editing?.endTime   || "12:00");
  const [err, setErr] = React.useState("");

  const save = () => {
    setErr("");
    if (!fullDay) {
      if (!startTime || !endTime) { setErr("Informe início e fim."); return; }
      if (_covTimeToMins(endTime) <= _covTimeToMins(startTime)) { setErr("O horário de fim deve ser maior que o de início."); return; }
    }
    // Remove qualquer "free" pré-existente do instrutor naquele dia para evitar duplicatas
    const cleaned = activities.filter(a => !(a.date === date && String(a.instructorId) === String(instr.id) && a.type === "free" && a.id !== editing?.id));
    const timeFields = fullDay ? { startTime: undefined, endTime: undefined } : { startTime, endTime };
    if (isEdit) {
      setActivities(cleaned.map(a => a.id === editing.id ? { ...a, obs, ...timeFields } : a));
    } else {
      setActivities([...cleaned, { id: Date.now(), type: "free", instructorId: instr.id, instructorName: instr.name, date, obs, ...timeFields }]);
    }
    onClose();
  };

  const del = () => {
    onAskDelete(() => {
      setActivities(activities.filter(a => a.id !== editing.id));
      onClose();
    });
  };

  return (
    <Modal title={isEdit ? "Editar dia LIVRE" : "Marcar dia LIVRE"} onClose={onClose} width={460}>
      <p style={{ color:"#94a3b8", fontSize:13, marginBottom:14 }}>
        <strong style={{ color:"#e2e8f0" }}>{instr.name}</strong> · {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long" })}
      </p>
      <div style={{ background:"#01323d", border:"1px solid #15475380", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
        <p style={{ color:"#94a3b8", fontSize:13, lineHeight:1.5, margin:0 }}>
          Marca este dia como <strong style={{ color:"#94a3b8" }}>LIVRE</strong> — informa que o freelancer foi <em>avaliado</em> e está fora da programação. Diferente de VAZIO (que indica falta de avaliação).
        </p>
      </div>

      <div style={{ marginBottom:18 }}>
        <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Período</label>
        <div style={{ display:"flex", gap:16, marginBottom: fullDay ? 0 : 10 }}>
          <label style={{ display:"flex", alignItems:"center", gap:6, color:"#e2e8f0", fontSize:13, cursor:"pointer" }}>
            <input type="radio" checked={fullDay} onChange={() => setFullDay(true)} /> Dia todo
          </label>
          <label style={{ display:"flex", alignItems:"center", gap:6, color:"#e2e8f0", fontSize:13, cursor:"pointer" }}>
            <input type="radio" checked={!fullDay} onChange={() => setFullDay(false)} /> Período específico
          </label>
        </div>
        {!fullDay && (
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1 }}>
              <label style={{ color:"#94a3b8", fontSize:12, display:"block", marginBottom:4 }}>Início</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                style={{ width:"100%", padding:"8px 10px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", boxSizing:"border-box" }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ color:"#94a3b8", fontSize:12, display:"block", marginBottom:4 }}>Fim</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                style={{ width:"100%", padding:"8px 10px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", boxSizing:"border-box" }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom:18 }}>
        <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Observação (opcional)</label>
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} maxLength={200} placeholder="Ex: já alocado em outra empresa hoje"
          style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
      </div>

      {err && <p style={{ color:"#ef4444", fontSize:12, marginTop:-10, marginBottom:14 }}>{err}</p>}

      <div style={{ display:"flex", gap:8, justifyContent: isEdit ? "space-between" : "flex-start" }}>
        <div style={{ display:"flex", gap:8 }}>
          <Btn onClick={save} label={isEdit ? "Salvar" : "Marcar como Livre"} icon="check" color={ACTIVITY_TYPES.free.color} />
          <Btn onClick={onClose} label="Cancelar" color="#154753" />
        </div>
        {isEdit && <Btn onClick={del} label="Remover marcação" icon="delete" color="#ef4444" />}
      </div>
    </Modal>
  );
};

// ── MODAL: Folga Banco de Horas ──────────────────────────────────────────────
const BankHoursModal = ({ instr, date, editing, absences, setAbsences, onClose, onAskDelete }) => {
  const isEdit = !!editing;
  const [fullDay, setFullDay]     = React.useState(isEdit ? !editing.startTime : true);
  const [startTime, setStartTime] = React.useState(editing?.startTime || "08:00");
  const [endTime, setEndTime]     = React.useState(editing?.endTime   || "12:00");
  const [obs, setObs]             = React.useState(editing?.obs       || "");
  const [err, setErr]             = React.useState("");

  const save = () => {
    setErr("");
    if (!fullDay) {
      const sM = _covTimeToMins(startTime), eM = _covTimeToMins(endTime);
      if (eM <= sM) { setErr("O horário de fim deve ser maior que o de início."); return; }
    }
    const payload = {
      type: "planejada",
      category: "Folga Banco de Horas",
      instructorId: instr.id,
      instructorName: instr.name,
      startDate: date,
      endDate: date,
      obs: obs || "",
      ...(fullDay ? {} : { startTime, endTime }),
    };
    if (isEdit) {
      setAbsences(absences.map(a => a.id === editing.id ? { ...a, ...payload } : a));
    } else {
      setAbsences([...absences, { id: Date.now(), ...payload }]);
    }
    onClose();
  };

  const del = () => {
    onAskDelete(() => {
      setAbsences(absences.filter(a => a.id !== editing.id));
      onClose();
    });
  };

  return (
    <Modal title={isEdit ? "Editar Folga Banco de Horas" : "Registrar Folga Banco de Horas"} onClose={onClose} width={520}>
      <p style={{ color:"#94a3b8", fontSize:13, marginBottom:14 }}>
        <strong style={{ color:"#e2e8f0" }}>{instr.name}</strong> · {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long" })}
      </p>
      <div style={{ background:"#01323d", border:"1px solid #15475380", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
        <p style={{ color:"#94a3b8", fontSize:13, lineHeight:1.5, margin:0 }}>
          Registra que o instrutor está de <strong style={{ color:"#f59e0b" }}>Folga Banco de Horas</strong>. Aparece como ausência planejada na Linha do Tempo e no Absenteísmo.
        </p>
      </div>

      <label style={{ color:"#94a3b8", fontSize:13, display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:14 }}>
        <input type="checkbox" checked={fullDay} onChange={e => setFullDay(e.target.checked)}
          style={{ accentColor:"#f59e0b", width:15, height:15 }} />
        Dia inteiro
      </label>

      {!fullDay && (
        <>
          <div style={{ display:"flex", gap:10, marginBottom:8 }}>
            <div style={{ flex:1 }}>
              <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Início</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Fim</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" }} />
            </div>
          </div>
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
            {[
              { l: "Manhã",  s: "08:00", e: "12:00" },
              { l: "Tarde",  s: "13:00", e: "17:00" },
              { l: "Dia todo", s: "08:00", e: "17:00" },
            ].map(p => (
              <button key={p.l} onClick={() => { setStartTime(p.s); setEndTime(p.e); }}
                style={{ padding:"3px 10px", borderRadius:6, border:"1px solid #154753", background:"#073d4a", color:"#94a3b8", fontSize:11, cursor:"pointer" }}>
                {p.l}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ marginBottom:18 }}>
        <label style={{ color:"#94a3b8", fontSize:13, display:"block", marginBottom:6 }}>Observação (opcional)</label>
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} maxLength={200} placeholder="Ex: compensação de horas extras da semana passada"
          style={{ width:"100%", padding:"10px 12px", background:"#01323d", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
      </div>

      {err && <p style={{ color:"#f87171", fontSize:13, marginBottom:12 }}>{err}</p>}

      <div style={{ display:"flex", gap:8, justifyContent: isEdit ? "space-between" : "flex-start" }}>
        <div style={{ display:"flex", gap:8 }}>
          <Btn onClick={save} label={isEdit ? "Salvar" : "Registrar"} icon="check" color="#f59e0b" />
          <Btn onClick={onClose} label="Cancelar" color="#154753" />
        </div>
        {isEdit && <Btn onClick={del} label="Excluir" icon="delete" color="#ef4444" />}
      </div>
    </Modal>
  );
};
