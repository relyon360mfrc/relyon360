// ── REPORTS ───────────────────────────────────────────────────────────────────
const COMPANY_LEGAL_NAME = "RELYON BRASIL TREINAMENTOS LTDA";
const ReportsPage = ({ schedules, trainings, instructors, holidays, absences, activities, user, areas, initialTab }) => {
  const isInstr = user && user.role === "instructor";
  const instrId = isInstr && (user.linkedInstructorId || user.id);
  // ── Visão do Instrutor (My History) ──────────────────────────────────────
  const hoje = new Date();
  const trintaDiasAtras = new Date(hoje); trintaDiasAtras.setDate(hoje.getDate() - 30);
  const [periodoInicio, setPeriodoInicio] = useState(trintaDiasAtras.toISOString().split("T")[0]);
  const [periodoFim, setPeriodoFim] = useState(hoje.toISOString().split("T")[0]);
  // Aba ativa na visão do instrutor: "historico" (grade), "noturno" (CLT) ou "freelancer".
  // Disponibilidade das abas extras depende do contrato — calculado dentro do if(isInstr).
  const [instrTab, setInstrTab] = useState("historico");

  const generateRelFreePDF = (instrObj, aulasList, periodoInicio, periodoFim) => {
    const w = window.open("", "_blank"); if (!w) return;
    const PRACTICE_ROLES_PDF = new Set(["Practical Instructor","Lead Instructor","Scuba Diver","Crane Operator","Support Instructor","Assistant Instructor"]);
    const getRoleCat = role => {
      if (role === "Theoretical Instructor") return "theory";
      if (role === "Translator") return "translation";
      if (PRACTICE_ROLES_PDF.has(role)) return "practice";
      return null;
    };
    const parseMin = t => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return (h||0)*60+(m||0); };
    const calcDiarias = mins => mins <= 0 ? 0 : Math.ceil(mins/240)*240/480;
    const fmtBRL = v => Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
    const fmtDiar = n => n===Math.floor(n)?String(n):n.toFixed(1).replace(".",",");
    const fmtD = d => new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
    const fmtWd = d => { const w=new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long"}); return w.charAt(0).toUpperCase()+w.slice(1); };
    const esc = s => String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const PDF_CSS = `
      @page{size:A4 portrait;margin:10mm}
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .header{background:#01323d;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #ffa619}
      .hl .brand{color:#ffa619;font-size:15px;font-weight:900;letter-spacing:1.5px}
      .hl .co{color:rgba(255,255,255,.55);font-size:9px;margin-top:3px}
      .hr{text-align:right}
      .hr .rn{color:#fff;font-size:11px;font-weight:700}
      .hr .rp{color:rgba(255,255,255,.5);font-size:9px;margin-top:3px}
      .sbar{background:#f1f5f9;border-bottom:2px solid #e2e8f0;padding:8px 20px;display:flex;gap:20px;align-items:center;flex-wrap:wrap}
      .sv{font-size:15px;font-weight:800;color:#0f766e}
      .sl{font-size:9px;color:#64748b;margin-left:4px}
      .chips{padding:10px 20px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;gap:6px;flex-wrap:wrap}
      .chip{background:#f1f5f9;border:1px solid #cbd5e1;border-radius:14px;padding:3px 10px;font-size:10px;color:#475569}
      .chip b{color:#0f172a;margin-left:4px}
      .pbar{text-align:center;padding:12px}
      .pbtn{padding:8px 24px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-top:0}
      thead th{background:#01323d;color:#94a3b8;font-size:9px;font-weight:700;text-align:left;padding:8px 6px;border:1px solid #0d4a5a;letter-spacing:.4px}
      thead th.center{text-align:center}
      tbody td{border:1px solid #e9ecef;padding:6px 8px;font-size:10px;color:#1e293b;vertical-align:middle}
      td.cdt{font-weight:700;color:#0f172a;white-space:nowrap;text-align:center;vertical-align:middle}
      td.cwd{color:#64748b;font-size:9px;white-space:nowrap;text-align:center;vertical-align:middle}
      td.cn{font-weight:600;color:#1e293b}
      td.cc{color:#475569}
      td.cmd{color:#64748b;font-size:9px}
      td.ch{text-align:center;font-family:Consolas,monospace;font-size:9px;color:#475569;white-space:nowrap}
      td.cr{font-weight:600;font-size:9px;text-align:center;white-space:nowrap}
      td.cl{color:#475569;font-size:9px}
      tfoot td{background:#01323d!important;color:#ffa619!important;font-weight:800;font-size:11px;padding:10px 12px;border:1px solid #0d4a5a;text-align:left}
      .empty{text-align:center;padding:36px;color:#94a3b8;font-size:13px;background:#f8fafc;border:1px solid #e2e8f0;margin:20px}
      @media print{.pbar{display:none}}
      .subtotals{padding:12px 14px 0}
      .stbl{width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #e2e8f0}
      .stbl tbody tr{border-bottom:1px solid #f1f5f9}
      .stbl td{padding:8px 12px;font-size:11px}
      td.sc{color:#374151;font-weight:700;width:35%}
      td.sd{color:#64748b;width:20%}
      td.sr{color:#64748b;width:25%}
      td.sv2{color:#0f766e;font-weight:700;text-align:right;width:20%}
      .stbl tfoot td{background:#01323d!important;color:#ffa619!important;font-weight:800;padding:10px 12px;border:none!important}
      td.stl{font-size:12px}
      td.stv{font-size:15px;text-align:right!important;white-space:nowrap}
      .sig{margin:32px 14px 24px;display:flex;flex-direction:column;align-items:center;gap:6px;page-break-inside:avoid}
      .sig-date{font-size:11px;color:#64748b;align-self:flex-start;margin-bottom:8px}
      .sig-line{width:300px;border-bottom:1.5px solid #374151;margin-top:48px}
      .sig-name{font-size:12px;font-weight:700;color:#1e293b;letter-spacing:.5px;margin-top:6px}
      .sig-label{font-size:10px;color:#64748b}
    `;
    const aulasPorDia = {};
    aulasList.forEach(s => { (aulasPorDia[s.date] = aulasPorDia[s.date]||[]).push(s); });
    Object.keys(aulasPorDia).forEach(d => aulasPorDia[d].sort((a,b)=>a.startTime.localeCompare(b.startTime)));
    const diasTrabalhados = Object.keys(aulasPorDia).sort((a,b)=>a.localeCompare(b));
    const funcoesFreq = {};
    aulasList.forEach(s => { const k=ROLE_PT[s.role]||s.role||"—"; funcoesFreq[k]=(funcoesFreq[k]||0)+1; });
    let theoryDiarias=0, practiceDiarias=0, translationDiarias=0;
    const rows = diasTrabalhados.map((d,i) => {
      const aulas = aulasPorDia[d]||[];
      const rowBg = i%2===0?"#ffffff":"#f8fafc";
      let dayTheory=0, dayPractice=0, dayTranslation=0;
      aulas.forEach(s => {
        const cat=getRoleCat(s.role);
        const dur=parseMin(s.endTime)-parseMin(s.startTime);
        if (dur>0) { if(cat==="theory")dayTheory+=dur; else if(cat==="practice")dayPractice+=dur; else if(cat==="translation")dayTranslation+=dur; }
      });
      theoryDiarias+=calcDiarias(dayTheory); practiceDiarias+=calcDiarias(dayPractice); translationDiarias+=calcDiarias(dayTranslation);
      const subrows = aulas.map((s,j) => {
        const roleLabel=ROLE_PT[s.role]||s.role||"—";
        const isFirst=j===0;
        return `<tr style="background:${rowBg}">
          ${isFirst?`<td class="cdt" rowspan="${aulas.length}" style="background:#ffa61915">${esc(fmtD(d))}</td>`:""}
          ${isFirst?`<td class="cwd" rowspan="${aulas.length}" style="background:#ffa61908">${esc(fmtWd(d))}</td>`:""}
          <td class="cn">${esc(s.trainingName||"—")}</td>
          <td class="cc">${esc(s.className||"—")}</td>
          <td class="cmd">${esc(s.module||"—")}</td>
          <td class="ch">${esc(s.startTime||"")} – ${esc(s.endTime||"")}</td>
          <td class="cr" style="background:#06b6d415;color:#0e7490">${esc(roleLabel)}</td>
          <td class="cl">${esc(s.local||"—")}</td>
        </tr>`;
      }).join("");
      return subrows;
    }).join("");
    const theoryRate=instrObj.theoryRate||0, practiceRate=instrObj.practiceRate||0, translationRate=instrObj.translationRate||0;
    const theoryVal=theoryDiarias*theoryRate, practiceVal=practiceDiarias*practiceRate, translationVal=translationDiarias*translationRate;
    const totalVal=theoryVal+practiceVal+translationVal;
    const hasRates=theoryRate>0||practiceRate>0||translationRate>0;
    const stRows=[
      theoryDiarias>0?`<tr><td class="sc">Subtotal Teoria</td><td class="sd">${fmtDiar(theoryDiarias)} diária${theoryDiarias!==1?"s":""}</td><td class="sr">× R$ ${fmtBRL(theoryRate)}</td><td class="sv2">R$ ${fmtBRL(theoryVal)}</td></tr>`:"",
      practiceDiarias>0?`<tr><td class="sc">Subtotal Prática</td><td class="sd">${fmtDiar(practiceDiarias)} diária${practiceDiarias!==1?"s":""}</td><td class="sr">× R$ ${fmtBRL(practiceRate)}</td><td class="sv2">R$ ${fmtBRL(practiceVal)}</td></tr>`:"",
      translationDiarias>0&&translationRate>0?`<tr><td class="sc">Subtotal Tradução</td><td class="sd">${fmtDiar(translationDiarias)} diária${translationDiarias!==1?"s":""}</td><td class="sr">× R$ ${fmtBRL(translationRate)}</td><td class="sv2">R$ ${fmtBRL(translationVal)}</td></tr>`:"",
    ].filter(Boolean).join("");
    const subtotalsHtml=hasRates&&stRows?`<div class="subtotals"><table class="stbl"><tbody>${stRows}</tbody><tfoot><tr><td colspan="3" class="stl">TOTAL GERAL</td><td class="stv">R$ ${fmtBRL(totalVal)}</td></tr></tfoot></table></div>`:"";
    const sigHtml=`<div class="sig"><div class="sig-date">Data: _____ / _____ / ____________</div><div class="sig-line"></div><div class="sig-name">${esc(instrObj.name||"")}</div><div class="sig-label">Assinatura do Instrutor</div></div>`;
    const funcoesChips=Object.entries(funcoesFreq).sort((a,b)=>b[1]-a[1]).map(([nome,n])=>`<span class="chip">${esc(nome)} <b>${n}</b></span>`).join("");
    const periodoTxt=`${fmtD(periodoInicio)} → ${fmtD(periodoFim)}`;
    const numFuncoes=Object.keys(funcoesFreq).length;
    const empty=aulasList.length===0;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>RELATÓRIO DE DIAS TRABALHADOS</title><style>${PDF_CSS}</style></head><body>
    <div class="header">
      <div class="hl"><div class="brand">💼 RELATÓRIO DE DIAS TRABALHADOS</div><div class="co">${esc(COMPANY_LEGAL_NAME)} &nbsp;·&nbsp; ${esc(instrObj.name||"")} &nbsp;·&nbsp; ${esc(instrObj.contract||"Freelancer")}</div></div>
      <div class="hr"><div class="rn">${esc(periodoTxt)}</div><div class="rp">Apenas dias com trabalho registrado</div></div>
    </div>
    <div class="sbar">
      <span><span class="sv">${diasTrabalhados.length}</span><span class="sl">dia${diasTrabalhados.length!==1?"s":""} trabalhado${diasTrabalhados.length!==1?"s":""}</span></span>
      <span><span class="sv">${aulasList.length}</span><span class="sl">aula${aulasList.length!==1?"s":""} ministrada${aulasList.length!==1?"s":""}</span></span>
      <span><span class="sv">${numFuncoes}</span><span class="sl">função${numFuncoes!==1?"ões":""} exercida${numFuncoes!==1?"s":""}</span></span>
    </div>
    ${funcoesChips?`<div class="chips">${funcoesChips}</div>`:""}
    <div class="pbar"><button class="pbtn" onclick="window.print()">🖨 Imprimir / Salvar PDF</button></div>
    ${empty?`<div class="empty">Nenhum dia trabalhado registrado no período selecionado.</div>`:`<div style="padding:0 14px 14px">
    <table>
      <thead><tr>
        <th>DATA</th><th>DIA</th><th>TREINAMENTO</th><th>TURMA</th><th>MÓDULO</th><th class="center">HORÁRIO</th><th class="center">FUNÇÃO</th><th>LOCAL</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="8">TOTAL: ${diasTrabalhados.length} dia${diasTrabalhados.length!==1?"s":""} trabalhado${diasTrabalhados.length!==1?"s":""} · ${aulasList.length} aula${aulasList.length!==1?"s":""}</td></tr></tfoot>
    </table></div>
    ${subtotalsHtml}
    ${sigHtml}`}
    </body></html>`);
    w.document.close();
  };

  if (isInstr) {
    const INSTR_PERIODS = [
      { label: "MANHÃ",  color: "#f59e0b", slots: ["08:00","09:00","10:00","11:00"] },
      { label: "TARDE",  color: "#3b82f6", slots: ["13:00","14:00","15:00","16:00"] },
      { label: "NOITE",  color: "#8b5cf6", slots: ["17:00","18:00","19:00","20:00"] },
    ];
    const toMins = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };

    // Objeto completo do instrutor logado — necessário para checagem regional de feriado
    const myInstr = (instructors || []).find(i => String(i.id) === String(instrId)) || { id: instrId };

    const minhasAulas = schedules
      .filter(s => String(s.instructorId) === String(instrId) && s.date >= periodoInicio && s.date <= periodoFim)
      .sort((a, b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));

    // Eventos não-aula que também justificam o tempo do instrutor (regra: 100% do dia justificado)
    const myActivities = (activities || []).filter(a => String(a.instructorId) === String(instrId) && a.date >= periodoInicio && a.date <= periodoFim);
    const myAbsences   = (absences   || []).filter(a => String(a.instructorId) === String(instrId) && a.startDate <= periodoFim && (a.endDate || a.startDate) >= periodoInicio);

    // União de todas as datas do período que têm alguma coisa para o instrutor
    const dateSet = new Set();
    minhasAulas.forEach(s => dateSet.add(s.date));
    myActivities.forEach(a => dateSet.add(a.date));
    myAbsences.forEach(a => {
      const cur = new Date(a.startDate + "T12:00:00");
      const end = new Date((a.endDate || a.startDate) + "T12:00:00");
      while (cur <= end) {
        const ds = cur.toISOString().split("T")[0];
        if (ds >= periodoInicio && ds <= periodoFim) dateSet.add(ds);
        cur.setDate(cur.getDate() + 1);
      }
    });
    (holidays || []).forEach(h => {
      if (h.date < periodoInicio || h.date > periodoFim) return;
      if (h.scope === "national") dateSet.add(h.date);
      else if (h.scope === "base" && myInstr.base && myInstr.base === h.base) dateSet.add(h.date);
    });
    const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));

    // Cobertura consolidada por dia (precomputada para não recomputar por slot)
    const coverageByDate = {};
    sortedDates.forEach(d => {
      coverageByDate[d] = (typeof computeCoverage === "function")
        ? computeCoverage(myInstr, d, schedules || [], activities || [], absences || [], holidays || [])
        : { status: "empty", blocks: [] };
    });

    // Mantém helper antigo para o tooltip de aula
    const getSlot = (date, slotStart) => {
      const sS = toMins(slotStart), sE = sS + 60;
      return minhasAulas.filter(s => s.date === date && toMins(s.startTime) < sE && toMins(s.endTime) > sS);
    };
    // Novo helper: retorna { block, palette, schedules, busy } para um slot
    const getSlotInfo = (date, slotStart) => {
      const cov = coverageByDate[date];
      const block = (typeof getSlotPrimaryBlock === "function") ? getSlotPrimaryBlock(cov, slotStart) : null;
      const palette = (typeof paletteForBlock === "function") ? paletteForBlock(block) : { color: "#1e3a42", gradient: null, label: "Livre", short: "" };
      const sList = getSlot(date, slotStart);
      return { block, palette, schedules: sList, busy: !!block };
    };

    const [hoveredSlot, setHoveredSlot] = React.useState(null);
    const fmtDay = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

    // ── Abas extras (CLT Noturno, Freelancer Dias Trabalhados) ──────────────
    const contractRaw       = (myInstr.contract || "").trim().toUpperCase();
    const isCltInstr        = contractRaw === "CLT";              // CLT estrito — não inclui CLT OFFSHORE
    const isFreelancerInstr = /FREELANCER|PRESTADOR|PJ/.test(contractRaw);
    const effectiveTab =
      (instrTab === "noturno"    && !isCltInstr)        ? "historico" :
      (instrTab === "freelancer" && !isFreelancerInstr) ? "historico" :
      instrTab;

    // Aulas noturnas (CLT): começam às 17:00 ou depois — alinhado com o slot NOITE
    const aulasNoturnas = minhasAulas.filter(s => {
      const hr = parseInt((s.startTime || "00:00").split(":")[0], 10);
      return hr >= 17;
    }).slice().sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    const diasNoturnos  = [...new Set(aulasNoturnas.map(s => s.date))].sort();
    const turmasNoturnas = [...new Set(aulasNoturnas.map(s => `${s.trainingName || ""}|${s.className || ""}`))].length;

    // Dias trabalhados (freelancer): agrupar minhasAulas por dia
    const aulasPorDia = {};
    minhasAulas.forEach(s => { (aulasPorDia[s.date] = aulasPorDia[s.date] || []).push(s); });
    Object.keys(aulasPorDia).forEach(d => aulasPorDia[d].sort((a, b) => a.startTime.localeCompare(b.startTime)));
    const diasTrabalhados = Object.keys(aulasPorDia).sort((a, b) => a.localeCompare(b));
    const funcoesFreq = {};
    minhasAulas.forEach(s => {
      const k = ROLE_PT[s.role] || s.role || "—";
      funcoesFreq[k] = (funcoesFreq[k] || 0) + 1;
    });

    // ── Helpers de PDF (mesma linha visual do UTILIZATION) ──────────────────
    const fmtBRdt = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const fmtBRwd = d => {
      const wd = new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long" });
      return wd.charAt(0).toUpperCase() + wd.slice(1);
    };
    const escHtml = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const PDF_BASE_CSS = `
      @page{size:A4 portrait;margin:10mm}
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .header{background:#01323d;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #ffa619}
      .hl .brand{color:#ffa619;font-size:15px;font-weight:900;letter-spacing:1.5px}
      .hl .co{color:rgba(255,255,255,.55);font-size:9px;margin-top:3px}
      .hr{text-align:right}
      .hr .rn{color:#fff;font-size:11px;font-weight:700}
      .hr .rp{color:rgba(255,255,255,.5);font-size:9px;margin-top:3px}
      .sbar{background:#f1f5f9;border-bottom:2px solid #e2e8f0;padding:8px 20px;display:flex;gap:20px;align-items:center;flex-wrap:wrap}
      .sv{font-size:15px;font-weight:800;color:#0f766e}
      .sl{font-size:9px;color:#64748b;margin-left:4px}
      .chips{padding:10px 20px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;gap:6px;flex-wrap:wrap}
      .chip{background:#f1f5f9;border:1px solid #cbd5e1;border-radius:14px;padding:3px 10px;font-size:10px;color:#475569}
      .chip b{color:#0f172a;margin-left:4px}
      .pbar{text-align:center;padding:12px}
      .pbtn{padding:8px 24px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-top:0}
      thead th{background:#01323d;color:#94a3b8;font-size:9px;font-weight:700;text-align:left;padding:8px 6px;border:1px solid #0d4a5a;letter-spacing:.4px}
      thead th.center{text-align:center}
      tbody td{border:1px solid #e9ecef;padding:6px 8px;font-size:10px;color:#1e293b;vertical-align:middle}
      td.cdt{font-weight:700;color:#0f172a;white-space:nowrap;text-align:center;vertical-align:middle}
      td.cwd{color:#64748b;font-size:9px;white-space:nowrap;text-align:center;vertical-align:middle}
      td.cn{font-weight:600;color:#1e293b}
      td.cc{color:#475569}
      td.cmd{color:#64748b;font-size:9px}
      td.ch{text-align:center;font-family:Consolas,monospace;font-size:9px;color:#475569;white-space:nowrap}
      td.cr{font-weight:600;font-size:9px;text-align:center;white-space:nowrap}
      td.cl{color:#475569;font-size:9px}
      tfoot td{background:#01323d!important;color:#ffa619!important;font-weight:800;font-size:11px;padding:10px 12px;border:1px solid #0d4a5a;text-align:left}
      .empty{text-align:center;padding:36px;color:#94a3b8;font-size:13px;background:#f8fafc;border:1px solid #e2e8f0;margin:20px}
      @media print{.pbar{display:none}}
      .subtotals{padding:12px 14px 0}
      .stbl{width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #e2e8f0}
      .stbl tbody tr{border-bottom:1px solid #f1f5f9}
      .stbl td{padding:8px 12px;font-size:11px}
      td.sc{color:#374151;font-weight:700;width:35%}
      td.sd{color:#64748b;width:20%}
      td.sr{color:#64748b;width:25%}
      td.sv2{color:#0f766e;font-weight:700;text-align:right;width:20%}
      .stbl tfoot td{background:#01323d!important;color:#ffa619!important;font-weight:800;padding:10px 12px;border:none!important}
      td.stl{font-size:12px}
      td.stv{font-size:15px;text-align:right!important;white-space:nowrap}
      .sig{margin:32px 14px 24px;display:flex;flex-direction:column;align-items:center;gap:6px;page-break-inside:avoid}
      .sig-date{font-size:11px;color:#64748b;align-self:flex-start;margin-bottom:8px}
      .sig-line{width:300px;border-bottom:1.5px solid #374151;margin-top:48px}
      .sig-name{font-size:12px;font-weight:700;color:#1e293b;letter-spacing:.5px;margin-top:6px}
      .sig-label{font-size:10px;color:#64748b}
    `;

    const printRelNoturno = () => {
      const w = window.open("", "_blank"); if (!w) return;
      const linhas = aulasNoturnas;
      const rows = linhas.map((s, i) => {
        const rowBg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
        return `<tr style="background:${rowBg}">
          <td class="cdt" style="background:#ffa61915">${escHtml(fmtBRdt(s.date))}</td>
          <td class="cwd" style="background:#ffa61908">${escHtml(fmtBRwd(s.date))}</td>
          <td class="cn">${escHtml(s.trainingName || "—")}</td>
          <td class="cc">${escHtml(s.className || "—")}</td>
          <td class="cmd">${escHtml(s.module || "—")}</td>
          <td class="ch" style="background:#3b076410;color:#6d28d9">${escHtml(s.startTime || "")} – ${escHtml(s.endTime || "")}</td>
          <td class="cr" style="background:#8b5cf615;color:#6d28d9">${escHtml(ROLE_PT[s.role] || s.role || "—")}</td>
          <td class="cl">${escHtml(s.local || "—")}</td>
        </tr>`;
      }).join("");
      const periodoTxt = `${fmtBRdt(periodoInicio)} → ${fmtBRdt(periodoFim)}`;
      const empty = aulasNoturnas.length === 0;
      w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>RELATÓRIO DE TRABALHO NOTURNO</title><style>${PDF_BASE_CSS}</style></head><body>
      <div class="header">
        <div class="hl"><div class="brand">🌙 RELATÓRIO DE TRABALHO NOTURNO</div><div class="co">${escHtml(COMPANY_LEGAL_NAME)} &nbsp;·&nbsp; ${escHtml(myInstr.name || "")} &nbsp;·&nbsp; CLT</div></div>
        <div class="hr"><div class="rn">${escHtml(periodoTxt)}</div><div class="rp">Turmas com início a partir das 17:00</div></div>
      </div>
      <div class="sbar">
        <span><span class="sv">${diasNoturnos.length}</span><span class="sl">dia${diasNoturnos.length!==1?"s":""} com trabalho noturno</span></span>
        <span><span class="sv">${aulasNoturnas.length}</span><span class="sl">registro${aulasNoturnas.length!==1?"s":""} de aula</span></span>
        <span><span class="sv">${turmasNoturnas}</span><span class="sl">turma${turmasNoturnas!==1?"s":""} distinta${turmasNoturnas!==1?"s":""}</span></span>
      </div>
      <div class="pbar"><button class="pbtn" onclick="window.print()">🖨 Imprimir / Salvar PDF</button></div>
      ${empty ? `<div class="empty">Nenhuma aula noturna no período selecionado.</div>` : `<div style="padding:0 14px 14px">
      <table>
        <thead><tr>
          <th>DATA</th><th>DIA</th><th>TREINAMENTO</th><th>TURMA</th><th>MÓDULO</th><th class="center">HORÁRIO</th><th class="center">PAPEL</th><th>LOCAL</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="8">TOTAL: ${diasNoturnos.length} dia${diasNoturnos.length!==1?"s":""} de trabalho noturno · ${aulasNoturnas.length} aula${aulasNoturnas.length!==1?"s":""}</td></tr></tfoot>
      </table></div>`}
      </body></html>`);
      w.document.close();
    };

    const printRelFree = () => generateRelFreePDF(myInstr, minhasAulas, periodoInicio, periodoFim);
    // Botão de aba (compartilhado entre Histórico, Noturno e Freelancer)
    const TAB_BTN_INSTR = (id, label) => (
      <button key={id} onClick={() => setInstrTab(id)}
        style={{ padding: "7px 16px", borderRadius: 18, border: `1px solid ${effectiveTab===id ? "#ffa619" : "#154753"}`,
          background: effectiveTab===id ? "#ffa61920" : "transparent", color: effectiveTab===id ? "#ffa619" : "#94a3b8",
          fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        {label}
      </button>
    );

    return (
      <div>
        <h2 style={{ color: "#fff", fontWeight: 800, margin: "0 0 4px", fontSize: 24 }}>Meu Histórico</h2>
        <p style={{ color: "#64748b", margin: "0 0 16px", fontSize: 14 }}>Consulte suas aulas e gere relatórios por período</p>

        {/* Tabs (Histórico sempre; Noturno só CLT; Trabalhados só Freelancer) */}
        {(isCltInstr || isFreelancerInstr) && (
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            {TAB_BTN_INSTR("historico", "📊 Histórico")}
            {isCltInstr        && TAB_BTN_INSTR("noturno",    "🌙 Noturno")}
            {isFreelancerInstr && TAB_BTN_INSTR("freelancer", "💼 Dias Trabalhados")}
          </div>
        )}

        {/* Filtros DE/ATÉ + Stats (variam por aba) + botão PDF (nas abas extras) */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ color: "#94a3b8", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>DE</label>
            <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)}
              style={{ background: "#073d4a", border: "1px solid #154753", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, outline: "none" }} />
          </div>
          <div>
            <label style={{ color: "#94a3b8", fontSize: 11, display: "block", marginBottom: 4, fontWeight: 600 }}>ATÉ</label>
            <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
              style={{ background: "#073d4a", border: "1px solid #154753", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, outline: "none" }} />
          </div>

          {effectiveTab === "historico" && (
            <div style={{ padding: "10px 16px", background: "#01323d", borderRadius: 10, border: "1px solid #154753" }}>
              <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 700 }}>{minhasAulas.length}</span>
              <span style={{ color: "#64748b", fontSize: 12 }}> aula{minhasAulas.length !== 1 ? "s" : ""}</span>
              {(myAbsences.length > 0 || myActivities.length > 0) && (
                <>
                  <span style={{ color: "#64748b", fontSize: 12 }}> · </span>
                  <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 700 }}>{myAbsences.length}</span>
                  <span style={{ color: "#64748b", fontSize: 12 }}> ausência{myAbsences.length !== 1 ? "s" : ""}</span>
                </>
              )}
              <span style={{ color: "#64748b", fontSize: 12 }}> em </span>
              <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 700 }}>{sortedDates.length}</span>
              <span style={{ color: "#64748b", fontSize: 12 }}> dia{sortedDates.length !== 1 ? "s" : ""}</span>
            </div>
          )}

          {effectiveTab === "noturno" && (
            <>
              <div style={{ padding: "10px 16px", background: "#01323d", borderRadius: 10, border: "1px solid #154753" }}>
                <span style={{ color: "#8b5cf6", fontSize: 13, fontWeight: 700 }}>{diasNoturnos.length}</span>
                <span style={{ color: "#64748b", fontSize: 12 }}> dia{diasNoturnos.length !== 1 ? "s" : ""} noturno{diasNoturnos.length !== 1 ? "s" : ""}</span>
                <span style={{ color: "#64748b", fontSize: 12 }}> · </span>
                <span style={{ color: "#8b5cf6", fontSize: 13, fontWeight: 700 }}>{aulasNoturnas.length}</span>
                <span style={{ color: "#64748b", fontSize: 12 }}> aula{aulasNoturnas.length !== 1 ? "s" : ""}</span>
              </div>
              <button onClick={printRelNoturno}
                style={{ background:"#154753", border:"1px solid #1e6a7a", borderRadius:8, padding:"10px 16px", color:"#e2e8f0", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                🖨 PDF
              </button>
            </>
          )}

          {effectiveTab === "freelancer" && (
            <>
              <div style={{ padding: "10px 16px", background: "#01323d", borderRadius: 10, border: "1px solid #154753" }}>
                <span style={{ color: "#06b6d4", fontSize: 13, fontWeight: 700 }}>{diasTrabalhados.length}</span>
                <span style={{ color: "#64748b", fontSize: 12 }}> dia{diasTrabalhados.length !== 1 ? "s" : ""} trabalhado{diasTrabalhados.length !== 1 ? "s" : ""}</span>
                <span style={{ color: "#64748b", fontSize: 12 }}> · </span>
                <span style={{ color: "#06b6d4", fontSize: 13, fontWeight: 700 }}>{minhasAulas.length}</span>
                <span style={{ color: "#64748b", fontSize: 12 }}> aula{minhasAulas.length !== 1 ? "s" : ""}</span>
              </div>
              <button onClick={printRelFree}
                style={{ background:"#154753", border:"1px solid #1e6a7a", borderRadius:8, padding:"10px 16px", color:"#e2e8f0", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                🖨 PDF
              </button>
            </>
          )}
        </div>

        {/* ─── ABA: HISTÓRICO (grade MANHÃ / TARDE / NOITE) ─── */}
        {effectiveTab === "historico" && (
          sortedDates.length === 0 ? (
            <div style={{ background: "#073d4a", borderRadius: 16, padding: 48, border: "1px solid #154753", textAlign: "center" }}>
              <p style={{ color: "#64748b", fontSize: 15 }}>Nada encontrado neste período — sem aulas, ausências ou folgas.</p>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {/* Tooltip — mostra info do bloco prioritário (aula, ausência, atividade, feriado) */}
              {hoveredSlot && (() => {
                const info = getSlotInfo(hoveredSlot.date, hoveredSlot.slot);
                if (!info.busy) return null;
                const b = info.block;
                const sList = info.schedules;
                const accentColor = info.palette.color || "#ffa619";
                if (b.type === "training" && sList.length) {
                  const e = sList[0];
                  return (
                    <div style={{ position: "fixed", left: hoveredSlot.x + 12, top: hoveredSlot.y - 10, zIndex: 999,
                      background: "#0a2a34", border: `1px solid ${accentColor}60`, borderRadius: 10, padding: "10px 14px",
                      boxShadow: "0 8px 24px #00000080", minWidth: 220, pointerEvents: "none" }}>
                      <div style={{ color: accentColor, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{e.trainingName} · {e.className}</div>
                      <div style={{ color: "#e2e8f0", fontSize: 11, marginBottom: 2 }}>{e.module}</div>
                      {e.local && <div style={{ color: "#94a3b8", fontSize: 11 }}>📍 {e.local}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span style={{ color: "#64748b", fontSize: 10 }}>{e.startTime}–{e.endTime}</span>
                        <span style={{ padding: "1px 6px", borderRadius: 4, background: (ROLE_BADGE[e.role] || "#64748b") + "20", color: ROLE_BADGE[e.role] || "#64748b", fontSize: 9, fontWeight: 600 }}>{ROLE_PT[e.role] || e.role || "—"}</span>
                        <span style={{ padding: "1px 6px", borderRadius: 10, background: (STATUS_COLOR[e.status] || "#64748b") + "20", color: STATUS_COLOR[e.status] || "#64748b", fontSize: 9, fontWeight: 600 }}>{e.status}</span>
                      </div>
                    </div>
                  );
                }
                const interval = b.fullDay ? "Dia inteiro" : `${b.startTime || ""}${b.endTime ? " – " + b.endTime : ""}`;
                return (
                  <div style={{ position: "fixed", left: hoveredSlot.x + 12, top: hoveredSlot.y - 10, zIndex: 999,
                    background: "#0a2a34", border: `1px solid ${accentColor}60`, borderRadius: 10, padding: "10px 14px",
                    boxShadow: "0 8px 24px #00000080", minWidth: 220, pointerEvents: "none" }}>
                    <div style={{ color: accentColor, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{info.palette.label}</div>
                    {b.label && b.label !== info.palette.label && <div style={{ color: "#e2e8f0", fontSize: 11, marginBottom: 2 }}>{b.label}</div>}
                    {b.sub && <div style={{ color: "#94a3b8", fontSize: 11 }}>{b.sub}</div>}
                    <div style={{ color: "#64748b", fontSize: 10, marginTop: 4 }}>{interval}</div>
                  </div>
                );
              })()}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: "#01323d" }}>
                      <th rowSpan={2} style={{ padding: "10px 16px", color: "#94a3b8", fontSize: 12, fontWeight: 700, textAlign: "left", border: "1px solid #154753", minWidth: 130 }}>DATA</th>
                      {INSTR_PERIODS.map(p => (
                        <th key={p.label} colSpan={4}
                          style={{ padding: "8px", color: p.color, fontSize: 12, fontWeight: 800, textAlign: "center", border: "1px solid #154753", background: p.color + "15" }}>
                          {p.label}
                        </th>
                      ))}
                    </tr>
                    <tr style={{ background: "#01323d" }}>
                      {INSTR_PERIODS.map(p => p.slots.map(slot => (
                        <th key={`${p.label}-${slot}`}
                          style={{ padding: "6px 4px", color: "#64748b", fontSize: 11, fontWeight: 600, textAlign: "center", border: "1px solid #154753", minWidth: 70 }}>
                          {slot}
                        </th>
                      )))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDates.map((date, ri) => {
                      const hasAny = INSTR_PERIODS.some(p => p.slots.some(s => getSlotInfo(date, s).busy));
                      return (
                        <tr key={date} style={{ background: ri % 2 === 0 ? "#073d4a" : "#063540" }}>
                          <td style={{ padding: "8px 14px", border: "1px solid #154753", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 30, height: 30, borderRadius: 8, background: "#01323d", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>{new Date(date + "T12:00:00").getDate()}</span>
                                <span style={{ color: "#64748b", fontSize: 8 }}>{new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { month: "short" }).toUpperCase()}</span>
                              </div>
                              <span style={{ color: hasAny ? "#e2e8f0" : "#475569", fontSize: 11, fontWeight: 600 }}>
                                {fmtDay(date)}
                              </span>
                            </div>
                          </td>
                          {INSTR_PERIODS.map(p => p.slots.map(slot => {
                            const info = getSlotInfo(date, slot);
                            const busy = info.busy;
                            const slotKey = `${date}-${p.label}-${slot}`;
                            const dotBg = busy
                              ? (info.palette.gradient || info.palette.color)
                              : "#1e3a42";
                            const dotShadow = busy ? `0 0 6px ${info.palette.color}80` : "none";
                            return (
                              <td key={slotKey} style={{ padding: "6px 4px", border: "1px solid #154753", textAlign: "center", verticalAlign: "middle" }}>
                                <div
                                  onMouseEnter={e => busy && setHoveredSlot({ date, slot, x: e.clientX, y: e.clientY })}
                                  onMouseMove={e => busy && setHoveredSlot(h => h ? { ...h, x: e.clientX, y: e.clientY } : h)}
                                  onMouseLeave={() => setHoveredSlot(null)}
                                  style={{ width: 12, height: 12, borderRadius: "50%", margin: "auto", cursor: busy ? "pointer" : "default", transition: "transform 0.1s",
                                    background: dotBg,
                                    boxShadow: dotShadow,
                                    transform: hoveredSlot?.date === date && hoveredSlot?.slot === slot ? "scale(1.4)" : "scale(1)" }}
                                />
                              </td>
                            );
                          }))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Legenda global das bolinhas */}
              <div style={{ marginTop: 14, padding: "10px 14px", background: "#01323d", borderRadius: 10, border: "1px solid #154753" }}>
                <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>LEGENDA DAS BOLINHAS</div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                  {(typeof PALETTE_LEGEND !== "undefined" ? PALETTE_LEGEND : []).map((l, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 12, height: 12, borderRadius: "50%", background: l.gradient || l.color, boxShadow: `0 0 4px ${l.color}60` }} />
                      <span style={{ color: "#94a3b8", fontSize: 11 }}>{l.label}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#1e3a42" }} />
                    <span style={{ color: "#94a3b8", fontSize: 11 }}>Livre / Sem justificativa</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                {INSTR_PERIODS.map(p => (
                  <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color + "40", border: `1px solid ${p.color}60` }} />
                    <span style={{ color: "#64748b", fontSize: 12 }}>{p.label} ({p.slots[0]}–{String(+p.slots[3].split(":")[0] + 1).padStart(2, "0")}:00)</span>
                  </div>
                ))}
                <span style={{ color: "#475569", fontSize: 11, marginLeft: "auto" }}>Passe o mouse sobre uma bolinha colorida para ver detalhes</span>
              </div>
            </div>
          )
        )}

        {/* ─── ABA: NOTURNO (CLT) ─── */}
        {effectiveTab === "noturno" && (
          aulasNoturnas.length === 0 ? (
            <div style={{ background: "#073d4a", borderRadius: 16, padding: 48, border: "1px solid #154753", textAlign: "center" }}>
              <p style={{ color: "#64748b", fontSize: 15 }}>Nenhuma aula noturna no período (turmas que começam a partir das 17:00).</p>
            </div>
          ) : (
            <div style={{ background:"#073d4a", borderRadius:16, padding:0, border:"1px solid #154753", overflow:"hidden" }}>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth:800 }}>
                  <thead>
                    <tr style={{ background:"#01323d" }}>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>DATA</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>DIA</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>TREINAMENTO</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>TURMA</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>MÓDULO</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753", letterSpacing:0.4 }}>HORÁRIO</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753", letterSpacing:0.4 }}>PAPEL</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>LOCAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aulasNoturnas.map((s, ri) => {
                      const rowBg = ri % 2 === 0 ? "#073d4a" : "#063540";
                      const roleLabel = ROLE_PT[s.role] || s.role || "—";
                      const roleColor = ROLE_BADGE[s.role] || "#8b5cf6";
                      return (
                        <tr key={s.id || ri} style={{ background: rowBg }}>
                          <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#e2e8f0", fontWeight:700, fontSize:12, whiteSpace:"nowrap" }}>{fmtBRdt(s.date)}</td>
                          <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11, whiteSpace:"nowrap" }}>{fmtBRwd(s.date)}</td>
                          <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#e2e8f0", fontSize:12 }}>{s.trainingName || "—"}</td>
                          <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11 }}>{s.className || "—"}</td>
                          <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11 }}>{s.module || "—"}</td>
                          <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#c4b5fd", fontSize:11, fontFamily:"Consolas,monospace", textAlign:"center", background:"#3b076425", whiteSpace:"nowrap" }}>{s.startTime} – {s.endTime}</td>
                          <td style={{ padding:"8px 12px", border:"1px solid #154753", textAlign:"center" }}>
                            <span style={{ background: roleColor + "20", color: roleColor, padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{roleLabel}</span>
                          </td>
                          <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11 }}>{s.local || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:"#01323d" }}>
                      <td colSpan={8} style={{ padding:"10px 14px", border:"1px solid #154753", color:"#ffa619", fontWeight:800, fontSize:12 }}>
                        TOTAL: {diasNoturnos.length} dia{diasNoturnos.length !== 1 ? "s" : ""} de trabalho noturno · {aulasNoturnas.length} aula{aulasNoturnas.length !== 1 ? "s" : ""}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        )}

        {/* ─── ABA: FREELANCER (dias trabalhados detalhado) ─── */}
        {effectiveTab === "freelancer" && (
          minhasAulas.length === 0 ? (
            <div style={{ background: "#073d4a", borderRadius: 16, padding: 48, border: "1px solid #154753", textAlign: "center" }}>
              <p style={{ color: "#64748b", fontSize: 15 }}>Nenhum dia trabalhado registrado no período selecionado.</p>
            </div>
          ) : (
            <div style={{ background:"#073d4a", borderRadius:16, padding:0, border:"1px solid #154753", overflow:"hidden" }}>
              {/* Chips de funções exercidas */}
              <div style={{ padding:"12px 16px", borderBottom:"1px solid #154753", display:"flex", gap:6, flexWrap:"wrap" }}>
                <span style={{ color:"#64748b", fontSize:11, alignSelf:"center", marginRight:6 }}>Funções no período:</span>
                {Object.entries(funcoesFreq).sort((a,b)=>b[1]-a[1]).map(([nome, n]) => (
                  <span key={nome} style={{ background:"#01323d", border:"1px solid #154753", borderRadius:14, padding:"3px 10px", fontSize:11, color:"#94a3b8" }}>
                    {nome} <strong style={{ color:"#06b6d4", marginLeft:4 }}>{n}</strong>
                  </span>
                ))}
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth:800 }}>
                  <thead>
                    <tr style={{ background:"#01323d" }}>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>DATA</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>DIA</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>TREINAMENTO</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>TURMA</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>MÓDULO</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753", letterSpacing:0.4 }}>HORÁRIO</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753", letterSpacing:0.4 }}>FUNÇÃO</th>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>LOCAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diasTrabalhados.map((d, ri) => {
                      const aulas = aulasPorDia[d] || [];
                      const rowBg = ri % 2 === 0 ? "#073d4a" : "#063540";
                      return aulas.map((s, j) => {
                        const isFirst = j === 0;
                        const roleLabel = ROLE_PT[s.role] || s.role || "—";
                        const roleColor = ROLE_BADGE[s.role] || "#06b6d4";
                        return (
                          <tr key={`${d}-${s.id || j}`} style={{ background: rowBg }}>
                            {isFirst && (
                              <td rowSpan={aulas.length} style={{ padding:"8px 12px", border:"1px solid #154753", color:"#e2e8f0", fontWeight:700, fontSize:12, whiteSpace:"nowrap", background:"#ffa61915", verticalAlign:"middle", textAlign:"center" }}>
                                {fmtBRdt(d)}
                              </td>
                            )}
                            {isFirst && (
                              <td rowSpan={aulas.length} style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11, whiteSpace:"nowrap", background:"#ffa61908", verticalAlign:"middle", textAlign:"center" }}>
                                {fmtBRwd(d)}
                              </td>
                            )}
                            <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#e2e8f0", fontSize:12 }}>{s.trainingName || "—"}</td>
                            <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11 }}>{s.className || "—"}</td>
                            <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11 }}>{s.module || "—"}</td>
                            <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11, fontFamily:"Consolas,monospace", textAlign:"center", whiteSpace:"nowrap" }}>{s.startTime} – {s.endTime}</td>
                            <td style={{ padding:"8px 12px", border:"1px solid #154753", textAlign:"center" }}>
                              <span style={{ background: roleColor + "20", color: roleColor, padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{roleLabel}</span>
                            </td>
                            <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11 }}>{s.local || "—"}</td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:"#01323d" }}>
                      <td colSpan={8} style={{ padding:"10px 14px", border:"1px solid #154753", color:"#ffa619", fontWeight:800, fontSize:12 }}>
                        TOTAL: {diasTrabalhados.length} dia{diasTrabalhados.length !== 1 ? "s" : ""} trabalhado{diasTrabalhados.length !== 1 ? "s" : ""} · {minhasAulas.length} aula{minhasAulas.length !== 1 ? "s" : ""}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        )}
      </div>
    );
  }

  const [tab, setTab] = useState(initialTab || "utilizacao");
  const [category, setCategory] = useState(initialTab === "financeiro" ? "financeiro" : "kpi");
  const today = new Date().toISOString().split("T")[0];
  const [utilDate, setUtilDate] = useState(today);
  // ── Estado das abas Salas e Turmas ─────────────────────────────────────────
  const [salaDate, setSalaDate] = useState(today);
  const [salaSearch, setSalaSearch] = useState("");
  const [trmFrom, setTrmFrom] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0]; });
  const [trmTo, setTrmTo] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().split("T")[0]; });
  const [trmTraining, setTrmTraining] = useState("");
  const [trmClass, setTrmClass] = useState("");
  const [horasMonth, setHorasMonth] = useState(() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0"); });
  const [cpFrom, setCpFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1)); return d.toISOString().split("T")[0]; });
  const [cpTo, setCpTo]   = useState(() => { const d = new Date(); d.setDate(d.getDate() + (d.getDay() === 0 ? 0 : 7 - d.getDay())); return d.toISOString().split("T")[0]; });
  const [cpTraining, setCpTraining] = useState("");
  const [clpDate, setClpDate] = useState(today);
  const [ipDate, setIpDate] = useState(today);
  const [marinhaWeekOffset, setMarinhaWeekOffset] = useState(0);
  const [fteDate, setFteDate] = useState(today);
  const [utilFrom, setUtilFrom] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0]; });
  const [utilTo,   setUtilTo]   = useState(today);
  const [utilSelInstr, setUtilSelInstr] = useState("");
  // ── Hooks da aba Utilização (precisam ficar no nível raiz — regra dos hooks) ──
  const [somenteLivres, setSomenteLivres]         = React.useState(false);
  const [somenteCLT, setSomenteCLT]               = React.useState(false);
  const [somenteCLTOFFSHORE, setSomenteCLTOFFSHORE] = React.useState(false);
  const [somenteFreelancer, setSomenteFreelancer] = React.useState(false);
  const [somenteOcupados, setSomenteOcupados]     = React.useState(false);
  const [utilAtivos, setUtilAtivos]               = React.useState(false);
  const [utilLivres, setUtilLivres]               = React.useState(false);
  const [hoveredSlot, setHoveredSlot]             = React.useState(null);
  const [busca, setBusca]                         = React.useState("");
  const buscaRef                                  = React.useRef(null);
  const [finInstrId, setFinInstrId]               = useState("");
  const [finFrom, setFinFrom]                      = useState(() => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1).toISOString().split("T")[0]; });
  const [finTo, setFinTo]                          = useState(() => new Date().toISOString().split("T")[0]);

  // ── Relatório de Utilização ───────────────────────────────────────────────
  // Slots: cada slot representa o início da hora. 08:00 = 08:00–09:00, 20:00 = 20:00–21:00
  const PERIODS = [
    { label: "MANHÃ",  color: "#f59e0b", slots: ["08:00","09:00","10:00","11:00"] },
    { label: "TARDE",  color: "#3b82f6", slots: ["13:00","14:00","15:00","16:00"] },
    { label: "NOITE",  color: "#8b5cf6", slots: ["17:00","18:00","19:00","20:00"] },
  ];

  const getSlotOccupation = (instructorId, slotStart) => {
    const slotS = timeToMins(slotStart);
    const slotE = slotS + 60; // cada slot = 1 hora
    return schedules.filter(s =>
      s.instructorId === instructorId &&
      s.date === utilDate &&
      timeToMins(s.startTime) < slotE &&
      timeToMins(s.endTime)   > slotS
    );
  };

  // Cobertura consolidada (treinos + atividades + ausências + feriados) por instrutor para o dia selecionado.
  // Memoizada para não recomputar 12x (uma vez por slot) por instrutor.
  const coverageByInstr = React.useMemo(() => {
    const map = {};
    (instructors || []).forEach(i => {
      map[i.id] = (typeof computeCoverage === "function")
        ? computeCoverage(i, utilDate, schedules || [], activities || [], absences || [], holidays || [])
        : { status: "empty", blocks: [] };
    });
    return map;
  }, [instructors, utilDate, schedules, activities, absences, holidays]);

  // Retorna o block prioritário cobrindo o slot + palette + lista de schedules naquele slot.
  // Usado pela bolinha, tooltip e legenda.
  const getSlotInfo = (instructorId, slotStart) => {
    const cov = coverageByInstr[instructorId];
    const block = (typeof getSlotPrimaryBlock === "function") ? getSlotPrimaryBlock(cov, slotStart) : null;
    const palette = (typeof paletteForBlock === "function") ? paletteForBlock(block) : { color: "#1e3a42", gradient: null, label: "Livre", short: "" };
    const sList = getSlotOccupation(instructorId, slotStart);
    return { block, palette, schedules: sList, busy: !!block };
  };

  const daySchedules = schedules.filter(s => s.date === utilDate);
  // "Ativo no dia" agora considera qualquer tipo de bloco (treino, ausência, atividade, feriado),
  // para refletir a regra de justificar 100% do tempo do colaborador.
  const activeInstructors = instructors.filter(i => {
    const cov = coverageByInstr[i.id];
    return cov && cov.blocks && cov.blocks.length > 0;
  });

  // ── Carga por Instrutor ───────────────────────────────────────────────────
  const byI = instructors.map(i => ({ ...i, count: schedules.filter(s => s.instructorId === i.id).length })).sort((a, b) => b.count - a.count);
  const byT = trainings.map(t => ({ ...t, count: schedules.filter(s => String(s.trainingId) === String(t.id)).length })).sort((a, b) => b.count - a.count);
  const maxI = Math.max(...byI.map(x => x.count), 1), maxT = Math.max(...byT.map(x => x.count), 1);

  const TAB_BTN = (id, label) => (
    <button key={id} onClick={() => setTab(id)}
      style={{ padding: "8px 18px", borderRadius: 20, border: `1px solid ${tab===id ? "#ffa619" : "#154753"}`,
        background: tab===id ? "#ffa61920" : "transparent", color: tab===id ? "#ffa619" : "#64748b",
        fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:"#fff", fontWeight:800, margin:0, fontSize:24 }}>
            {category === "financeiro" ? "Relatórios Financeiros" : "KPI Operacional"}
          </h2>
          <p style={{ color:"#64748b", margin:"4px 0 0", fontSize:14 }}>Análise de desempenho e utilização</p>
        </div>
      </div>
      {category === "kpi" && (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
          {TAB_BTN("utilizacao", "📊 Utilização Diária")}
          {TAB_BTN("carga", "🏆 Carga por Instrutor")}
          {TAB_BTN("cursos", "📚 Cursos Programados")}
          {TAB_BTN("classplanning", "📅 Class Planning")}
          {TAB_BTN("instructorplanning", "👨‍🏫 Instructor Planning")}
          {TAB_BTN("marinha", "⚓ MARINHA")}
          {TAB_BTN("salas", "📋 Plano Individual")}
          {TAB_BTN("turmas", "📋 Programação da Turma")}
          {TAB_BTN("horas", "⏱ Horas por Instrutor")}
          {TAB_BTN("fte", "👥 FTE*")}
          {TAB_BTN("utilization", "📈 UTILIZATION")}
        </div>
      )}

      {/* ── ABA: UTILIZAÇÃO DIÁRIA ── */}
      {tab === "utilizacao" && (() => {
        const listaFiltrada = instructors.filter(i => {
          const nomeOk = busca ? i.name.toLowerCase().includes(busca.toLowerCase()) : true;
          // Ocupado agora considera qualquer tipo de bloco (treino + ausência + atividade + feriado),
          // refletindo a regra de justificar 100% do tempo do colaborador.
          const isOcupado = PERIODS.some(p => p.slots.some(s => getSlotInfo(i.id, s).busy));
          const livreOk  = somenteLivres   ? !isOcupado : true;
          const ocupOk   = somenteOcupados ?  isOcupado : true;
          const contratoOk = (!somenteCLT && !somenteCLTOFFSHORE && !somenteFreelancer) ||
            (somenteCLT && (i.contract || "").toLowerCase() === "clt") ||
            (somenteCLTOFFSHORE && /offshore/i.test(i.contract || "")) ||
            (somenteFreelancer && /freelancer/i.test(i.contract || ""));
          return nomeOk && livreOk && ocupOk && contratoOk;
        });

        const exportUtilExcel = () => {
          if (typeof XLSX === "undefined") { alert("Biblioteca Excel ainda carregando, tente novamente."); return; }
          const allSlots = PERIODS.flatMap(p => p.slots);
          const header = ["INSTRUTOR", "CONTRATO", ...allSlots.map(s => s.replace(":00","h"))];
          // Agora exporta também ausências/atividades/feriados — não só treinamentos —
          // para refletir 100% do tempo do colaborador.
          const aoa = [header, ...listaFiltrada.map(instr => {
            const cells = allSlots.map(slot => {
              const info = getSlotInfo(instr.id, slot);
              if (!info.busy) return "";
              const b = info.block;
              if (b.type === "training" && info.schedules.length) {
                const e = info.schedules[0];
                return e.trainingName || e.className || "Treinamento";
              }
              return info.palette.label;
            });
            return [instr.name, instr.contract || "—", ...cells];
          })];
          const ws = XLSX.utils.aoa_to_sheet(aoa);
          ws["!cols"] = [{wch:32},{wch:16},...allSlots.map(()=>({wch:14}))];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Utilização Diária");
          XLSX.writeFile(wb, `Utilizacao_Diaria_${utilDate}.xlsx`);
        };

        const printUtil = () => {
          const PERIOD_CLS = { "MANHÃ":"manha", "TARDE":"tarde", "NOITE":"noite" };
          const dateLabel = new Date(utilDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
          let html = `<html><head><title>Utilização Diária</title><style>
            @page{size:A4 landscape;margin:10mm}
            *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif}
            .ph{background:#01323d;color:#fff;text-align:center;padding:14px 20px}
            .ph h1{font-size:13px;font-weight:800;letter-spacing:1px}
            .ph .sub{color:#ffa619;font-size:11px;font-weight:700;margin-top:3px}
            .ph .per{color:rgba(255,255,255,0.5);font-size:9px;margin-top:3px}
            table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed}
            th{padding:4px 2px;font-size:8px;border:1px solid #ccc;text-align:center;font-weight:700}
            th.instr{text-align:left;background:#01323d;color:#fff;padding:6px 8px;width:44mm}
            th.manha{background:#92400e;color:#fde68a}th.tarde{background:#1e3a8a;color:#bfdbfe}th.noite{background:#3b0764;color:#e9d5ff}
            th.slot{background:#f5f5f5;color:#555;font-weight:600;font-size:7px}
            td{padding:3px 2px;font-size:7px;border:1px solid #ddd;text-align:center;vertical-align:middle;color:#333}
            td.ic{text-align:left;font-weight:600;font-size:8px;padding:4px 6px;background:#fafafa}
            td.busy{font-size:7px;line-height:1.3;font-weight:600}
            tr:nth-child(even) td.ic{background:#f0f4f8}
            .lg{display:flex;gap:10px;flex-wrap:wrap;padding:6px 10px;margin-top:8px;font-size:8px;border:1px solid #ddd;border-radius:4px}
            .lg .it{display:flex;align-items:center;gap:4px}
            .lg .sw{width:9px;height:9px;border-radius:50%;display:inline-block}
            @media print{button{display:none}}
          </style></head><body>`;
          html += `<div class="ph"><h1>RELATÓRIO DE UTILIZAÇÃO DIÁRIA</h1><div class="sub">${COMPANY_LEGAL_NAME}</div><div class="per">${dateLabel}</div></div>`;
          html += `<div style="text-align:center;padding:8px 0"><button onclick="window.print()" style="padding:5px 18px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px">🖨 Imprimir / Salvar PDF</button></div>`;
          // Texto contrastante p/ cores escuras vs claras
          const textOn = bg => {
            const c = (bg || "").replace("#", "");
            if (c.length < 6) return "#111";
            const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), bl = parseInt(c.slice(4,6),16);
            return (r*0.299 + g*0.587 + bl*0.114) > 160 ? "#111" : "#fff";
          };
          html += `<table><colgroup><col style="width:44mm">${PERIODS.flatMap(p => p.slots.map(() => `<col>`)).join("")}</colgroup>`;
          html += `<thead><tr><th class="instr" rowspan="2">INSTRUTOR</th>`;
          html += PERIODS.map(p => `<th class="${PERIOD_CLS[p.label]}" colspan="4">${p.label}</th>`).join("");
          html += `</tr><tr>${PERIODS.flatMap(p => p.slots.map(s => `<th class="slot">${s}</th>`)).join("")}</tr></thead><tbody>`;
          listaFiltrada.forEach(instr => {
            html += `<tr><td class="ic">${instr.name.split(" ").slice(0,3).join(" ")}</td>`;
            PERIODS.forEach(p => p.slots.forEach(slot => {
              const info = getSlotInfo(instr.id, slot);
              if (!info.busy) { html += `<td></td>`; return; }
              const b = info.block;
              const bg = info.palette.color;
              const fg = textOn(bg);
              if (b.type === "training" && info.schedules.length) {
                const e = info.schedules[0];
                html += `<td class="busy" style="background:${bg};color:${fg}">${(e.trainingName||"")}${e.className ? "<br><span style='opacity:.85'>"+e.className+"</span>" : ""}</td>`;
              } else {
                html += `<td class="busy" style="background:${bg};color:${fg}">${info.palette.label}</td>`;
              }
            }));
            html += `</tr>`;
          });
          html += `</tbody></table>`;
          // Legenda
          const legendItems = (typeof PALETTE_LEGEND !== "undefined" ? PALETTE_LEGEND : []);
          html += `<div class="lg">`;
          legendItems.forEach(l => {
            html += `<div class="it"><span class="sw" style="background:${l.color}"></span>${l.label}</div>`;
          });
          html += `</div>`;
          html += `</body></html>`;
          const w = window.open("", "_blank");
          if (!w) return;
          w.document.write(html);
          w.document.close();
        };

        return (
        <div style={{ position:"relative" }}>
          {/* Tooltip flutuante — mostra info do bloco prioritário (treino, ausência, atividade, feriado). */}
          {hoveredSlot && (() => {
            const info = getSlotInfo(hoveredSlot.instrId, hoveredSlot.slot);
            if (!info.busy) return null;
            const b = info.block;
            const sList = info.schedules;
            const accentColor = info.palette.color || "#ffa619";
            // Quando há treinamento, mantém o detalhamento clássico (turma/módulo/local)
            if (b.type === "training" && sList.length) {
              const e = sList[0];
              return (
                <div style={{ position:"fixed", left: hoveredSlot.x+12, top: hoveredSlot.y-10, zIndex:999,
                  background:"#0a2a34", border:`1px solid ${accentColor}60`, borderRadius:10, padding:"10px 14px",
                  boxShadow:"0 8px 24px #00000080", minWidth:200, pointerEvents:"none" }}>
                  <div style={{ color: accentColor, fontSize:12, fontWeight:700, marginBottom:4 }}>{e.trainingName} · {e.className}</div>
                  <div style={{ color:"#e2e8f0", fontSize:11, marginBottom:2 }}>{e.module}</div>
                  {e.local && <div style={{ color:"#94a3b8", fontSize:11 }}>📍 {e.local}</div>}
                  <div style={{ color:"#64748b", fontSize:10, marginTop:4 }}>{e.startTime} – {e.endTime}</div>
                </div>
              );
            }
            // Demais tipos: mostra label da paleta + sub do bloco + intervalo
            const interval = b.fullDay ? "Dia inteiro" : `${b.startTime || ""}${b.endTime ? " – " + b.endTime : ""}`;
            return (
              <div style={{ position:"fixed", left: hoveredSlot.x+12, top: hoveredSlot.y-10, zIndex:999,
                background:"#0a2a34", border:`1px solid ${accentColor}60`, borderRadius:10, padding:"10px 14px",
                boxShadow:"0 8px 24px #00000080", minWidth:200, pointerEvents:"none" }}>
                <div style={{ color: accentColor, fontSize:12, fontWeight:700, marginBottom:4 }}>{info.palette.label}</div>
                {b.label && b.label !== info.palette.label && <div style={{ color:"#e2e8f0", fontSize:11, marginBottom:2 }}>{b.label}</div>}
                {b.sub && <div style={{ color:"#94a3b8", fontSize:11 }}>{b.sub}</div>}
                <div style={{ color:"#64748b", fontSize:10, marginTop:4 }}>{interval}</div>
              </div>
            );
          })()}

          {/* Barra de controles */}
          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16, flexWrap:"wrap" }}>
            <div>
              <label style={{ color:"#94a3b8", fontSize:12, display:"block", marginBottom:4 }}>Selecionar dia</label>
              <input type="date" value={utilDate} onChange={e => setUtilDate(e.target.value)}
                style={{ padding:"8px 12px", background:"#073d4a", border:"1px solid #154753", borderRadius:8, color:"#e2e8f0", fontSize:14, outline:"none" }} />
            </div>
            <div style={{ padding:"10px 16px", background:"#01323d", borderRadius:10, border:"1px solid #154753" }}>
              <div style={{ color:"#64748b", fontSize:12 }}>
                {new Date(utilDate+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
                <span style={{ color:"#16a34a", fontSize:13, fontWeight:700 }}>{activeInstructors.length}/{instructors.length}</span>
                <span style={{ color:"#64748b", fontSize:12 }}>instrutor(es) com programação</span>
                {/* Filtros de contrato */}
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", marginLeft:8,
                  padding:"3px 10px", borderRadius:6, background: somenteCLT ? "#3b82f620" : "#154753",
                  border:`1px solid ${somenteCLT ? "#3b82f660" : "#1e5a6a"}` }}>
                  <input type="checkbox" checked={somenteCLT} onChange={e => { setSomenteCLT(e.target.checked); if (e.target.checked) setSomenteCLTOFFSHORE(false); }}
                    style={{ accentColor:"#3b82f6", width:13, height:13 }} />
                  <span style={{ color: somenteCLT ? "#3b82f6" : "#94a3b8", fontSize:11, fontWeight:600 }}>Somente CLT</span>
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer",
                  padding:"3px 10px", borderRadius:6, background: somenteCLTOFFSHORE ? "#f59e0b20" : "#154753",
                  border:`1px solid ${somenteCLTOFFSHORE ? "#f59e0b60" : "#1e5a6a"}` }}>
                  <input type="checkbox" checked={somenteCLTOFFSHORE} onChange={e => { setSomenteCLTOFFSHORE(e.target.checked); if (e.target.checked) { setSomenteCLT(false); setSomenteFreelancer(false); } }}
                    style={{ accentColor:"#f59e0b", width:13, height:13 }} />
                  <span style={{ color: somenteCLTOFFSHORE ? "#f59e0b" : "#94a3b8", fontSize:11, fontWeight:600 }}>Somente CLT Offshore</span>
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer",
                  padding:"3px 10px", borderRadius:6, background: somenteFreelancer ? "#a855f720" : "#154753",
                  border:`1px solid ${somenteFreelancer ? "#a855f760" : "#1e5a6a"}` }}>
                  <input type="checkbox" checked={somenteFreelancer} onChange={e => { setSomenteFreelancer(e.target.checked); if (e.target.checked) { setSomenteCLT(false); setSomenteCLTOFFSHORE(false); } }}
                    style={{ accentColor:"#a855f7", width:13, height:13 }} />
                  <span style={{ color: somenteFreelancer ? "#a855f7" : "#94a3b8", fontSize:11, fontWeight:600 }}>Somente Freelancer</span>
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", marginLeft:8,
                  padding:"3px 10px", borderRadius:6, background: somenteLivres ? "#16a34a20" : "#154753",
                  border:`1px solid ${somenteLivres ? "#16a34a60" : "#1e5a6a"}` }}>
                  <input type="checkbox" checked={somenteLivres} onChange={e => { setSomenteLivres(e.target.checked); if (e.target.checked) setSomenteOcupados(false); }}
                    style={{ accentColor:"#16a34a", width:13, height:13 }} />
                  <span style={{ color: somenteLivres ? "#16a34a" : "#94a3b8", fontSize:11, fontWeight:600 }}>Somente Livres</span>
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer",
                  padding:"3px 10px", borderRadius:6, background: somenteOcupados ? "#ef444420" : "#154753",
                  border:`1px solid ${somenteOcupados ? "#ef444460" : "#1e5a6a"}` }}>
                  <input type="checkbox" checked={somenteOcupados} onChange={e => { setSomenteOcupados(e.target.checked); if (e.target.checked) setSomenteLivres(false); }}
                    style={{ accentColor:"#ef4444", width:13, height:13 }} />
                  <span style={{ color: somenteOcupados ? "#ef4444" : "#94a3b8", fontSize:11, fontWeight:600 }}>Somente Ocupados</span>
                </label>
              </div>
            </div>
            {/* Campo de busca com ESC para cancelar */}
            <div style={{ position:"relative" }}>
              <div style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
                <Icon name="search" size={14} color="#64748b" />
              </div>
              <input
                ref={buscaRef}
                value={busca}
                onChange={e => setBusca(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") { setBusca(""); buscaRef.current?.blur(); } }}
                placeholder="Filtrar instrutor..."
                style={{ padding:"9px 12px 9px 32px", background:"#073d4a", border:`1px solid ${busca ? "#ffa619" : "#154753"}`,
                  borderRadius:8, color:"#e2e8f0", fontSize:13, outline:"none", width:200, transition:"border 0.2s" }} />
              {busca && (
                <button onClick={() => { setBusca(""); buscaRef.current?.focus(); }}
                  style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#64748b", fontSize:14, lineHeight:1 }}>
                  ×
                </button>
              )}
            </div>
            <button onClick={printUtil}
              style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"9px 18px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer", alignSelf:"center", whiteSpace:"nowrap" }}>
              🖨 PDF
            </button>
            <button onClick={exportUtilExcel}
              style={{ background:"#14532d", border:"1px solid #15803d", borderRadius:8, padding:"9px 18px", color:"#86efac", fontSize:12, fontWeight:700, cursor:"pointer", alignSelf:"center", whiteSpace:"nowrap" }}>
              📊 Excel
            </button>
          </div>

          {/* Tabela */}
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
              <thead>
                <tr style={{ background:"#01323d" }}>
                  <th rowSpan={2} style={{ padding:"10px 16px", color:"#94a3b8", fontSize:12, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:180 }}>INSTRUTOR</th>
                  {PERIODS.map(p => (
                    <th key={p.label} colSpan={4}
                      style={{ padding:"8px", color:p.color, fontSize:12, fontWeight:800, textAlign:"center", border:"1px solid #154753", background:p.color+"15" }}>
                      {p.label}
                    </th>
                  ))}
                </tr>
                <tr style={{ background:"#01323d" }}>
                  {PERIODS.map(p => p.slots.map(slot => (
                    <th key={`${p.label}-${slot}`}
                      style={{ padding:"6px 4px", color:"#64748b", fontSize:11, fontWeight:600, textAlign:"center", border:"1px solid #154753", minWidth:70 }}>
                      {slot}
                    </th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((instr, ri) => {
                  const hasAny = PERIODS.some(p => p.slots.some(s => getSlotInfo(instr.id, s).busy));
                  return (
                    <tr key={instr.id} style={{ background: ri%2===0 ? "#073d4a" : "#063540" }}>
                      <td style={{ padding:"8px 14px", border:"1px solid #154753", whiteSpace:"nowrap" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,#ffa619,#e8920a)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:9, fontWeight:700, flexShrink:0 }}>
                            {instr.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
                          </div>
                          <span style={{ color: hasAny ? "#e2e8f0" : "#475569", fontSize:12, fontWeight: hasAny ? 600 : 400 }}>
                            {instr.name.split(" ").slice(0,3).join(" ")}
                          </span>
                        </div>
                      </td>
                      {PERIODS.map(p => p.slots.map(slot => {
                        const info = getSlotInfo(instr.id, slot);
                        const busy = info.busy;
                        const slotKey = `${instr.id}-${p.label}-${slot}`;
                        // Cor da bolinha: vem da paleta global do tipo do bloco prioritário
                        const dotBg = busy
                          ? (info.palette.gradient || info.palette.color)
                          : "#1e3a42";
                        const dotShadow = busy ? `0 0 6px ${info.palette.color}80` : "none";
                        return (
                          <td key={slotKey} style={{ padding:"6px 4px", border:"1px solid #154753", textAlign:"center", verticalAlign:"middle" }}>
                            <div
                              onMouseEnter={e => busy && setHoveredSlot({ instrId:instr.id, slot, x:e.clientX, y:e.clientY })}
                              onMouseMove={e => busy && setHoveredSlot(h => h ? { ...h, x:e.clientX, y:e.clientY } : h)}
                              onMouseLeave={() => setHoveredSlot(null)}
                              style={{ width:12, height:12, borderRadius:"50%", margin:"auto", cursor: busy ? "pointer" : "default", transition:"transform 0.1s",
                                background: dotBg,
                                boxShadow: dotShadow,
                                transform: hoveredSlot?.instrId===instr.id && hoveredSlot?.slot===slot ? "scale(1.4)" : "scale(1)" }}
                            />
                          </td>
                        );
                      }))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {listaFiltrada.length === 0 && (
            <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>
              {somenteLivres ? "Todos os instrutores têm programação neste dia." : "Nenhuma programação encontrada para este dia."}
            </p>
          )}

          {/* Legenda global das bolinhas (paleta consolidada) */}
          <div style={{ marginTop:14, padding:"10px 14px", background:"#01323d", borderRadius:10, border:"1px solid #154753" }}>
            <div style={{ color:"#94a3b8", fontSize:11, fontWeight:700, marginBottom:6, letterSpacing:0.5 }}>LEGENDA DAS BOLINHAS</div>
            <div style={{ display:"flex", gap:14, flexWrap:"wrap", alignItems:"center" }}>
              {(typeof PALETTE_LEGEND !== "undefined" ? PALETTE_LEGEND : []).map((l, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:12, height:12, borderRadius:"50%", background: l.gradient || l.color, boxShadow:`0 0 4px ${l.color}60` }} />
                  <span style={{ color:"#94a3b8", fontSize:11 }}>{l.label}</span>
                </div>
              ))}
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:12, height:12, borderRadius:"50%", background:"#1e3a42" }} />
                <span style={{ color:"#94a3b8", fontSize:11 }}>Livre / Sem justificativa</span>
              </div>
            </div>
          </div>
          {/* Período do dia (cabeçalho de cor) */}
          <div style={{ display:"flex", gap:20, marginTop:10, flexWrap:"wrap", alignItems:"center" }}>
            {PERIODS.map(p => (
              <div key={p.label} style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:10, height:10, borderRadius:2, background:p.color+"40", border:`1px solid ${p.color}60` }} />
                <span style={{ color:"#64748b", fontSize:12 }}>{p.label} ({p.slots[0]}–{String(+p.slots[3].split(":")[0]+1).padStart(2,"0")}:00)</span>
              </div>
            ))}
            <span style={{ color:"#475569", fontSize:11, marginLeft:"auto" }}>Passe o mouse sobre uma bolinha colorida para ver detalhes</span>
          </div>
        </div>
        );
      })()}

      {/* ── ABA: CARGA POR INSTRUTOR ── */}
      {tab === "carga" && (
        <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
          <h3 style={{ color:"#fff", fontWeight:700, margin:"0 0 16px", fontSize:15 }}>🏆 Carga por Instrutor</h3>
          {byI.filter(i => i.count > 0).map(i => (
            <div key={i.id} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
              <div style={{ width:30, height:30, borderRadius:"50%", background:"linear-gradient(135deg,#ffa619,#e8920a)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:10, fontWeight:700, flexShrink:0 }}>
                {i.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"#e2e8f0", fontSize:13 }}>{i.name}</span>
                  <span style={{ color:"#64748b", fontSize:13 }}>{i.count} disciplina(s)</span>
                </div>
                <div style={{ height:4, background:"#154753", borderRadius:2, marginTop:4 }}>
                  <div style={{ height:"100%", width:`${(i.count/maxI)*100}%`, background:"linear-gradient(90deg,#ffa619,#e8920a)", borderRadius:2 }} />
                </div>
              </div>
            </div>
          ))}
          {byI.every(i => i.count === 0) && <p style={{ color:"#64748b", textAlign:"center", padding:24 }}>Nenhuma programação cadastrada.</p>}
        </div>
      )}

      {/* ── ABA: CURSOS PROGRAMADOS ── */}
      {tab === "cursos" && (
        <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
          <h3 style={{ color:"#fff", fontWeight:700, margin:"0 0 16px", fontSize:15 }}>📚 Cursos Mais Programados</h3>
          {byT.filter(t => t.count > 0).slice(0,15).map(t => (
            <div key={t.id} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
              <span style={{ padding:"2px 8px", borderRadius:6, background:"#ffa61920", color:"#ffa619", fontSize:11, fontWeight:700, flexShrink:0, minWidth:60, textAlign:"center" }}>{t.gcc}</span>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"#e2e8f0", fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:200 }}>{t.name.slice(0,35)}</span>
                  <span style={{ color:"#64748b", fontSize:13 }}>{t.count}</span>
                </div>
                <div style={{ height:4, background:"#154753", borderRadius:2, marginTop:4 }}>
                  <div style={{ height:"100%", width:`${(t.count/maxT)*100}%`, background:"linear-gradient(90deg,#f59e0b,#ef4444)", borderRadius:2 }} />
                </div>
              </div>
            </div>
          ))}
          {byT.every(t => t.count === 0) && <p style={{ color:"#64748b", textAlign:"center", padding:24 }}>Nenhuma programação cadastrada.</p>}
        </div>
      )}

      {/* ── ABA: CLASS PLANNING (visão semanal a partir de um dia) ── */}
      {tab === "classplanning" && (() => {
        const fmtBR = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });
        const toMins = t => { const [h,m] = (t||"00:00").split(":").map(Number); return h*60+m; };

        // Resolve a semana Segunda→Domingo que contém o dia selecionado
        const getWeekRange = (dateStr) => {
          const d = new Date(dateStr + "T12:00:00");
          const dow = d.getDay(); // 0=Dom..6=Sab
          const offsetToMon = dow === 0 ? 6 : dow - 1;
          const mon = new Date(d); mon.setDate(d.getDate() - offsetToMon);
          const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
          const fmt = x => x.toISOString().split("T")[0];
          return { weekStart: fmt(mon), weekEnd: fmt(sun) };
        };
        const { weekStart, weekEnd } = getWeekRange(clpDate);

        const allItems = schedules.filter(s => s.date === clpDate);

        // Agrupa por classId (turma é identificada por UUID; nomes podem repetir entre cohortes).
        // Fallback para className em dados legados sem classId.
        const keyOf = s => s.classId || `name:${s.className}`;
        const byClass = {};
        allItems.forEach(s => {
          const k = keyOf(s);
          if (!byClass[k]) byClass[k] = { classId: s.classId, className: s.className, trainingName: s.trainingName, studentCount: "", items: [] };
          if (!byClass[k].studentCount && s.studentCount) byClass[k].studentCount = s.studentCount;
          byClass[k].items.push(s);
        });
        const classes = Object.keys(byClass).sort((a, b) =>
          (byClass[a].className || "").localeCompare(byClass[b].className || "")
        );

        // PERÍODO real da turma: considera todas as datas em schedules (mesmo fora da semana filtrada)
        const allClassDates = {};
        schedules.forEach(s => {
          const k = keyOf(s);
          if (!byClass[k]) return;
          if (!allClassDates[k]) allClassDates[k] = [];
          allClassDates[k].push(s.date);
        });

        // Agrupa por (módulo + local) e acumula instrutores únicos para o período
        const getPeriodGroups = (items, fn) => {
          const seen = {};
          items.filter(fn).forEach(s => {
            const key = (s.module || "") + "|" + (s.local || "");
            if (!seen[key]) seen[key] = { module: s.module || "—", local: s.local || "", instrs: [], minStart: s.startTime, maxEnd: s.endTime };
            const instr = instructors.find(i => String(i.id) === String(s.instructorId));
            const name = instr ? instr.name : s.instructorName;
            // A4 — Scuba/Crane são apoio operacional, não contam como lead nos
            // relatórios de Carga/IP. Só Lead Instructor (e variantes legadas
            // Theoretical/Practical Instructor) entra como lead.
            const isLeadRole = !["Assistant Instructor","Translator","Scuba Diver","Crane Operator"].includes(s.role);
            if (name && isLeadRole && !seen[key].instrs.includes(name)) seen[key].instrs.push(name);
            if (s.startTime < seen[key].minStart) seen[key].minStart = s.startTime;
            if (s.endTime   > seen[key].maxEnd)   seen[key].maxEnd   = s.endTime;
          });
          return Object.values(seen);
        };

        const fmtH = t => t ? t.split(":")[0] + "H" : "";
        const renderPeriodGroups = (groups) => {
          const validGroups = groups.filter(g => g.local);
          if (!validGroups.length) return <span style={{ color:"#475569", fontSize:15 }}>—</span>;
          return validGroups.map((g, i) => (
            <div key={i} style={{ marginBottom: i < validGroups.length-1 ? 6 : 0 }}>
              <span style={{ color:"#94a3b8", fontSize:11, fontWeight:700 }}>{fmtH(g.minStart)}-{fmtH(g.maxEnd)}</span>
              <span style={{ color:"#e2e8f0", fontSize:14, marginLeft:6 }}>{g.local}</span>
            </div>
          ));
        };

        const printClp = () => {
          const renderGroupsHtml = (groups) => {
            const fmtHp = t => t ? t.split(":")[0] + "H" : "";
            const valid = groups.filter(g => g.local);
            if (!valid.length) return "—";
            return valid.map(g => `<div style="font-size:12px"><span style="color:#888;font-size:10px">${fmtHp(g.minStart)}-${fmtHp(g.maxEnd)}</span> ${g.local}</div>`).join("");
          };
          const rows = classes.map(k => {
            const { className, studentCount, items } = byClass[k];
            const dates = [...new Set(allClassDates[k] || items.map(s => s.date))].sort();
            const manha = getPeriodGroups(items, s => toMins(s.startTime) < 13*60);
            const tarde = getPeriodGroups(items, s => toMins(s.startTime) >= 13*60 && toMins(s.startTime) < 17*60);
            const noite = getPeriodGroups(items, s => toMins(s.startTime) >= 17*60);
            return `<tr>
              <td>${className || "—"}</td>
              <td>${fmtBR(dates[0])}<br><small>até ${fmtBR(dates[dates.length-1])}</small></td>
              <td style="text-align:center;font-weight:700">${studentCount||"—"}</td>
              <td>${renderGroupsHtml(manha)}</td>
              <td>${renderGroupsHtml(tarde)}</td>
              <td>${renderGroupsHtml(noite)}</td>
            </tr>`;
          }).join("");
          const w = window.open("", "_blank");
          if (!w) return;
          w.document.write(`<html><head><title>Class Planning</title><style>
            @page{size:A4 landscape;margin:10mm}
            *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif}
            .ph{background:#01323d;color:#fff;text-align:center;padding:20px 32px}
            .ph h1{font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:4px}
            .ph .sub{color:#ffa619;font-size:12px;font-weight:700}
            .ph .per{color:rgba(255,255,255,0.5);font-size:10px;margin-top:4px}
            table{width:100%;border-collapse:collapse;margin:20px 0;table-layout:fixed}
            col.turma{width:40mm}col.periodo{width:32mm}col.alunos{width:18mm}col.p3{width:56mm}
            th{background:#01323d;color:#fff;padding:8px 10px;border:1px solid #ccc;font-size:12px;text-align:left}
            th.manha{background:#92400e;color:#fde68a}th.tarde{background:#1e3a8a;color:#bfdbfe}th.noite{background:#3b0764;color:#e9d5ff}
            td{padding:7px 10px;border:1px solid #ddd;font-size:12px;vertical-align:top}
            tr:nth-child(even) td{background:#f8f8f8}small{color:#888}
            @media print{button{display:none}}
          </style></head><body>
          <div class="ph"><h1>CLASS PLANNING</h1><div class="sub">${COMPANY_LEGAL_NAME}</div>
          <div class="per">SEMANA: ${fmtBR(weekStart)} → ${fmtBR(weekEnd)} · DIA SELECIONADO: ${fmtBR(clpDate)}</div></div>
          <div style="text-align:center;padding:12px"><button onclick="window.print()" style="padding:7px 20px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Imprimir / PDF</button></div>
          <table><colgroup><col class="turma"><col class="periodo"><col class="alunos"><col class="p3"><col class="p3"><col class="p3"></colgroup><thead><tr>
            <th>TURMA</th><th>PERÍODO</th><th>ALUNOS</th>
            <th class="manha">☀️ MANHÃ</th><th class="tarde">🌤 TARDE</th><th class="noite">🌙 NOITE</th>
          </tr></thead><tbody>${rows}</tbody></table>
          </body></html>`);
          w.document.close();
        };

        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-end", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15, alignSelf:"center" }}>📅 Class Planning</h3>
              <div style={{ display:"flex", gap:10, alignItems:"flex-end", marginLeft:"auto", flexWrap:"wrap" }}>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>DIA</label>
                  <input type="date" value={clpDate} onChange={e => setClpDate(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                  <div style={{ color:"#64748b", fontSize:10, marginTop:4 }}>Semana: {fmtBR(weekStart)} → {fmtBR(weekEnd)}</div>
                </div>
                <button onClick={printClp} style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"8px 18px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>🖨 PDF</button>
              </div>
            </div>

            {classes.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>Nenhuma turma encontrada na semana selecionada.</p>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
                  <thead>
                    <tr style={{ background:"#01323d" }}>
                      <th style={{ padding:"12px 16px", color:"#94a3b8", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:160 }}>TURMA</th>
                      <th style={{ padding:"12px 16px", color:"#94a3b8", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:140 }}>PERÍODO</th>
                      <th style={{ padding:"12px 16px", color:"#94a3b8", fontSize:13, fontWeight:700, textAlign:"center", border:"1px solid #154753", minWidth:80 }}>ALUNOS</th>
                      <th style={{ padding:"12px 16px", color:"#f59e0b", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#f59e0b08" }}>☀️ MANHÃ</th>
                      <th style={{ padding:"12px 16px", color:"#60a5fa", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#3b82f608" }}>🌤 TARDE</th>
                      <th style={{ padding:"12px 16px", color:"#a78bfa", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#8b5cf608" }}>🌙 NOITE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((k, ri) => {
                      const { className, studentCount, items } = byClass[k];
                      const dates = [...new Set(allClassDates[k] || items.map(s => s.date))].sort();
                      const manha = getPeriodGroups(items, s => toMins(s.startTime) < 13*60);
                      const tarde = getPeriodGroups(items, s => toMins(s.startTime) >= 13*60 && toMins(s.startTime) < 17*60);
                      const noite = getPeriodGroups(items, s => toMins(s.startTime) >= 17*60);
                      return (
                        <tr key={k} style={{ background: ri%2===0 ? "#073d4a" : "#063540" }}>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", color:"#fff", fontWeight:700, fontSize:16 }}>{className || "—"}</td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753" }}>
                            <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{fmtBR(dates[0])}</div>
                            <div style={{ color:"#64748b", fontSize:12 }}>até {fmtBR(dates[dates.length-1])}</div>
                          </td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", textAlign:"center", color: studentCount ? "#ffa619" : "#475569", fontWeight: studentCount ? 700 : 400, fontSize:16 }}>
                            {studentCount || "—"}
                          </td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>
                            {renderPeriodGroups(manha, "#f59e0b")}
                          </td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>
                            {renderPeriodGroups(tarde, "#60a5fa")}
                          </td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>
                            {renderPeriodGroups(noite, "#a78bfa")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ABA: INSTRUCTOR PLANNING (visão semanal de instrutor por turma) ── */}
      {tab === "instructorplanning" && (() => {
        const fmtBR = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });
        const toMins = t => { const [h,m] = (t||"00:00").split(":").map(Number); return h*60+m; };

        const getWeekRange = (dateStr) => {
          const d = new Date(dateStr + "T12:00:00");
          const dow = d.getDay();
          const offsetToMon = dow === 0 ? 6 : dow - 1;
          const mon = new Date(d); mon.setDate(d.getDate() - offsetToMon);
          const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
          const fmt = x => x.toISOString().split("T")[0];
          return { weekStart: fmt(mon), weekEnd: fmt(sun) };
        };
        const { weekStart, weekEnd } = getWeekRange(ipDate);

        const allItems = schedules.filter(s => s.date === ipDate);
        const keyOf = s => s.classId || `name:${s.className}`;
        const byClass = {};
        allItems.forEach(s => {
          const k = keyOf(s);
          if (!byClass[k]) byClass[k] = { className: s.className, items: [] };
          byClass[k].items.push(s);
        });
        const classes = Object.keys(byClass).sort((a, b) =>
          (byClass[a].className || "").localeCompare(byClass[b].className || "")
        );

        const getIPGroups = (items, fn) => {
          const seen = {};
          items.filter(fn).forEach(s => {
            const key = s.module || "";
            if (!seen[key]) seen[key] = { module: s.module || "—", lead: null, minStart: s.startTime, maxEnd: s.endTime };
            // A4 — Scuba/Crane são apoio, não lead (alinhado com getPeriodGroups acima)
            const isLead = !["Assistant Instructor","Translator","Scuba Diver","Crane Operator"].includes(s.role);
            if (isLead && !seen[key].lead) {
              const instr = instructors.find(i => String(i.id) === String(s.instructorId));
              seen[key].lead = instr ? instr.name : (s.instructorName || null);
            }
            if (s.startTime < seen[key].minStart) seen[key].minStart = s.startTime;
            if (s.endTime   > seen[key].maxEnd)   seen[key].maxEnd   = s.endTime;
          });
          return Object.values(seen);
        };

        const fmtH = t => t ? t.split(":")[0] + "H" : "";

        const renderIPGroups = (groups) => {
          if (!groups.length) return <span style={{ color:"#475569", fontSize:15 }}>—</span>;
          return groups.map((g, i) => (
            <div key={i} style={{ marginBottom: i < groups.length-1 ? 8 : 0, paddingBottom: i < groups.length-1 ? 8 : 0, borderBottom: i < groups.length-1 ? "1px solid #154753" : "none" }}>
              <div style={{ color:"#94a3b8", fontSize:11, fontWeight:700, marginBottom:2 }}>{fmtH(g.minStart)}–{fmtH(g.maxEnd)}</div>
              <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600, marginBottom:2 }}>{g.module}</div>
              <div style={{ color:"#ffa619", fontSize:12 }}>{g.lead || <span style={{ color:"#475569", fontStyle:"italic" }}>—</span>}</div>
            </div>
          ));
        };

        const printIP = () => {
          const renderIPHtml = (groups) => {
            if (!groups.length) return "—";
            return groups.map((g, i) => `<div style="margin-bottom:${i < groups.length-1 ? 8 : 0}px;padding-bottom:${i < groups.length-1 ? 8 : 0}px;border-bottom:${i < groups.length-1 ? "1px solid #eee" : "none"}">
              <div style="color:#888;font-size:10px;font-weight:700">${fmtH(g.minStart)}–${fmtH(g.maxEnd)}</div>
              <div style="font-size:12px;font-weight:600">${g.module}</div>
              <div style="color:#b45309;font-size:11px">${g.lead || "—"}</div>
            </div>`).join("");
          };
          const rows = classes.map(k => {
            const { className, items } = byClass[k];
            const manha = getIPGroups(items, s => toMins(s.startTime) < 13*60);
            const tarde = getIPGroups(items, s => toMins(s.startTime) >= 13*60 && toMins(s.startTime) < 17*60);
            const noite = getIPGroups(items, s => toMins(s.startTime) >= 17*60);
            return `<tr>
              <td>${className || "—"}</td>
              <td>${renderIPHtml(manha)}</td>
              <td>${renderIPHtml(tarde)}</td>
              <td>${renderIPHtml(noite)}</td>
            </tr>`;
          }).join("");
          const w = window.open("", "_blank");
          if (!w) return;
          w.document.write(`<html><head><title>Instructor Planning</title><style>
            @page{size:A4 landscape;margin:10mm}
            *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif}
            .ph{background:#01323d;color:#fff;text-align:center;padding:20px 32px}
            .ph h1{font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:4px}
            .ph .sub{color:#ffa619;font-size:12px;font-weight:700}
            .ph .per{color:rgba(255,255,255,0.5);font-size:10px;margin-top:4px}
            table{width:100%;border-collapse:collapse;margin:20px 0;table-layout:fixed}
            col.turma{width:44mm}col.p3{width:75mm}
            th{background:#01323d;color:#fff;padding:8px 10px;border:1px solid #ccc;font-size:12px;text-align:left}
            th.manha{background:#92400e;color:#fde68a}th.tarde{background:#1e3a8a;color:#bfdbfe}th.noite{background:#3b0764;color:#e9d5ff}
            td{padding:7px 10px;border:1px solid #ddd;font-size:12px;vertical-align:top}
            tr:nth-child(even) td{background:#f8f8f8}
            @media print{button{display:none}}
          </style></head><body>
          <div class="ph"><h1>INSTRUCTOR PLANNING</h1><div class="sub">${COMPANY_LEGAL_NAME}</div>
          <div class="per">SEMANA: ${fmtBR(weekStart)} → ${fmtBR(weekEnd)} · DIA SELECIONADO: ${fmtBR(ipDate)}</div></div>
          <div style="text-align:center;padding:12px"><button onclick="window.print()" style="padding:7px 20px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer">🖨 Imprimir / PDF</button></div>
          <table><colgroup><col class="turma"><col class="p3"><col class="p3"><col class="p3"></colgroup>
          <thead><tr>
            <th>TURMA</th>
            <th class="manha">☀️ MANHÃ</th><th class="tarde">🌤 TARDE</th><th class="noite">🌙 NOITE</th>
          </tr></thead><tbody>${rows}</tbody></table>
          </body></html>`);
          w.document.close();
        };

        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-end", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15, alignSelf:"center" }}>👨‍🏫 Instructor Planning</h3>
              <div style={{ display:"flex", gap:10, alignItems:"flex-end", marginLeft:"auto", flexWrap:"wrap" }}>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>DIA</label>
                  <input type="date" value={ipDate} onChange={e => setIpDate(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                  <div style={{ color:"#64748b", fontSize:10, marginTop:4 }}>Semana: {fmtBR(weekStart)} → {fmtBR(weekEnd)}</div>
                </div>
                <button onClick={printIP} style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"8px 18px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>🖨 PDF</button>
              </div>
            </div>

            {classes.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>Nenhuma turma encontrada no dia selecionado.</p>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth:800 }}>
                  <thead>
                    <tr style={{ background:"#01323d" }}>
                      <th style={{ padding:"12px 16px", color:"#94a3b8", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:160 }}>TURMA</th>
                      <th style={{ padding:"12px 16px", color:"#f59e0b", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#f59e0b08" }}>☀️ MANHÃ</th>
                      <th style={{ padding:"12px 16px", color:"#60a5fa", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#3b82f608" }}>🌤 TARDE</th>
                      <th style={{ padding:"12px 16px", color:"#a78bfa", fontSize:13, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:240, background:"#8b5cf608" }}>🌙 NOITE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((k, ri) => {
                      const { className, items } = byClass[k];
                      const manha = getIPGroups(items, s => toMins(s.startTime) < 13*60);
                      const tarde = getIPGroups(items, s => toMins(s.startTime) >= 13*60 && toMins(s.startTime) < 17*60);
                      const noite = getIPGroups(items, s => toMins(s.startTime) >= 17*60);
                      return (
                        <tr key={k} style={{ background: ri%2===0 ? "#073d4a" : "#063540" }}>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", color:"#fff", fontWeight:700, fontSize:15, verticalAlign:"top" }}>{className || "—"}</td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>{renderIPGroups(manha)}</td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>{renderIPGroups(tarde)}</td>
                          <td style={{ padding:"12px 16px", border:"1px solid #154753", verticalAlign:"top" }}>{renderIPGroups(noite)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ABA: PLANO INDIVIDUAL ── */}
      {tab === "salas" && (() => {
        const trainingOpts = [...new Set(schedules.map(s => s.trainingName).filter(Boolean))].sort();
        const fmtBR = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });

        const getInstrName = s => {
          if (s.instructorName) return s.instructorName;
          const i = instructors.find(x => String(x.id) === String(s.instructorId));
          return i ? i.name : null;
        };

        const allItems = schedules.filter(s =>
          s.date >= cpFrom && s.date <= cpTo &&
          (!cpTraining || s.trainingName === cpTraining)
        );

        const byClass = {};
        allItems.forEach(s => {
          if (!byClass[s.className]) byClass[s.className] = { trainingName: s.trainingName, entries: {} };
          const key = `${s.module}|${s.date}|${s.startTime}|${s.endTime}|${s.local||""}`;
          if (!byClass[s.className].entries[key]) byClass[s.className].entries[key] = { ...s, instrNames: [] };
          const n = getInstrName(s);
          if (n && !byClass[s.className].entries[key].instrNames.includes(n))
            byClass[s.className].entries[key].instrNames.push(n);
        });
        const classes = Object.keys(byClass).sort();

        const classDates = cls => {
          const ds = Object.values(byClass[cls].entries).map(e => e.date).sort();
          return { start: ds[0], end: ds[ds.length-1] };
        };

        const printCP = () => {
          const fmtD = d => fmtBR(d);
          let html = `<html><head><title>Class Planning</title><style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial,sans-serif;background:#fff}
            .ph{background:#01323d;color:#fff;text-align:center;padding:22px 32px 18px}
            .ph h1{font-size:17px;font-weight:800;letter-spacing:1px;margin-bottom:5px}
            .ph .sub{color:#ffa619;font-size:12px;font-weight:700;letter-spacing:1px}
            .ph .per{color:rgba(255,255,255,0.5);font-size:10px;margin-top:5px;letter-spacing:.5px}
            .cb{margin:20px 24px}
            .ch{display:flex;border:1px solid #ccc;border-bottom:none}
            .cn{padding:10px 16px;font-weight:800;font-size:13px;border-right:1px solid #ccc;min-width:130px}
            .cm{display:flex;flex:1}
            .cm span{padding:10px 16px;font-size:11px;border-right:1px solid #ccc}
            .cm span:last-child{border-right:none}
            .lbl{color:#888;font-size:10px;display:block}
            table{width:100%;border-collapse:collapse;border:1px solid #ccc}
            thead tr{background:#f5f5f5}
            th{padding:7px 12px;text-align:left;font-size:10px;color:#666;font-weight:700;border:1px solid #ddd;text-transform:uppercase}
            td{padding:6px 12px;font-size:11px;border:1px solid #ddd;vertical-align:top;color:#333}
            tr:nth-child(even) td{background:#fafafa}
            .pf{margin-top:28px;background:#01323d;color:rgba(255,255,255,0.45);text-align:center;padding:12px;font-size:9px;letter-spacing:1px}
            @media print{button{display:none}.cb{page-break-inside:avoid}}
          </style></head><body>`;
          html += `<div class="ph"><h1>PROGRAMAÇÃO SEMANAL DE CURSOS E TREINAMENTOS</h1><div class="sub">${COMPANY_LEGAL_NAME}</div><div class="per">PROGRAMAÇÃO SEMANAL DE CURSOS E TREINAMENTOS &nbsp;|&nbsp; PERÍODO: ${fmtD(cpFrom)} - ${fmtD(cpTo)}</div></div>`;
          html += `<div style="text-align:center;padding:16px 0"><button onclick="window.print()" style="padding:8px 24px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨 Imprimir / Salvar PDF</button></div>`;
          classes.forEach(cls => {
            const { start, end } = classDates(cls);
            const rows = Object.values(byClass[cls].entries).sort((a,b) => a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
            html += `<div class="cb"><div class="ch"><div class="cn">${cls}</div><div class="cm"><span><span class="lbl">INÍCIO</span>${fmtD(start)}</span><span><span class="lbl">TÉRMINO</span>${fmtD(end)}</span></div></div>`;
            html += `<table><thead><tr><th>Name</th><th>PlanDate</th><th>Start</th><th>End</th><th>Local</th><th>Instructors</th></tr></thead><tbody>`;
            rows.forEach(r => {
              html += `<tr><td>${r.module||"—"}</td><td>${fmtD(r.date)}</td><td>${r.startTime||"—"}</td><td>${r.endTime||"—"}</td><td>${r.local||"—"}</td><td>${r.instrNames.join("<br>")||"—"}</td></tr>`;
            });
            html += `</tbody></table></div>`;
          });
          html += `<div class="pf">PROGRAMAÇÃO SEMANAL DE CURSOS E TREINAMENTOS &nbsp;|&nbsp; PERÍODO: ${fmtD(cpFrom)} - ${fmtD(cpTo)}</div><div style="text-align:center;padding:10px 24px 14px;font-size:8px;color:#666;letter-spacing:0.5px;margin-top:4px;font-style:italic">SUJEITO A ALTERAÇÃO SEM COMUNICAÇÃO PRÉVIA — PORTANTO VENHA PREPARADO PARA AS PRÁTICAS TODOS OS DIAS!</div></body></html>`;
          const w = window.open("", "_blank");
          w.document.write(html);
          w.document.close();
        };

        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-end", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15, alignSelf:"center" }}>📋 Plano Individual</h3>
              <div style={{ display:"flex", alignItems:"flex-end", gap:10, marginLeft:"auto", flexWrap:"wrap" }}>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>DE</label>
                  <input type="date" value={cpFrom} onChange={e => setCpFrom(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                </div>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>ATÉ</label>
                  <input type="date" value={cpTo} onChange={e => setCpTo(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                </div>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>TREINAMENTO</label>
                  <select value={cpTraining} onChange={e => setCpTraining(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none", minWidth:160 }}>
                    <option value="">Todos</option>
                    {trainingOpts.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button onClick={printCP} style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"8px 18px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>🖨 PDF</button>
              </div>
            </div>

            {classes.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>Nenhuma turma encontrada para o período selecionado.</p>
            ) : classes.map(cls => {
              const entry = byClass[cls];
              const rows = Object.values(entry.entries).sort((a,b) => a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
              const { start, end } = classDates(cls);
              return (
                <div key={cls} style={{ marginBottom:20, background:"#01323d", borderRadius:12, border:"1px solid #154753", overflow:"hidden" }}>
                  {/* Cabeçalho da turma */}
                  <div style={{ display:"flex", flexWrap:"wrap", alignItems:"stretch", borderBottom:"1px solid #154753" }}>
                    <div style={{ padding:"12px 20px", borderRight:"1px solid #154753", display:"flex", alignItems:"center", minWidth:140 }}>
                      <span style={{ color:"#fff", fontWeight:800, fontSize:15 }}>{cls}</span>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", flex:1 }}>
                      <div style={{ padding:"8px 20px", borderRight:"1px solid #154753" }}>
                        <div style={{ color:"#64748b", fontSize:10, fontWeight:700, marginBottom:2 }}>INÍCIO</div>
                        <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{fmtBR(start)}</div>
                      </div>
                      <div style={{ padding:"8px 20px", borderRight:"1px solid #154753" }}>
                        <div style={{ color:"#64748b", fontSize:10, fontWeight:700, marginBottom:2 }}>TÉRMINO</div>
                        <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{fmtBR(end)}</div>
                      </div>
                      <div style={{ padding:"8px 20px", color:"#64748b", fontSize:12, marginLeft:"auto" }}>{entry.trainingName || ""}</div>
                    </div>
                  </div>
                  {/* Tabela de módulos */}
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", minWidth:680 }}>
                      <thead>
                        <tr style={{ background:"#073d4a" }}>
                          {["Name","PlanDate","Start","End","Local","Instructors"].map((h,i) => (
                            <th key={h} style={{ padding:"8px 14px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:[200,100,70,70,120,200][i] }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, ri) => (
                          <tr key={ri} style={{ background: ri%2===0 ? "#01323d" : "#02293a" }}>
                            <td style={{ padding:"8px 14px", color:"#e2e8f0", fontSize:12, border:"1px solid #154753" }}>{r.module||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#94a3b8", fontSize:12, border:"1px solid #154753" }}>{fmtBR(r.date)}</td>
                            <td style={{ padding:"8px 14px", color:"#f59e0b", fontSize:12, fontWeight:600, border:"1px solid #154753" }}>{r.startTime||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#f59e0b", fontSize:12, fontWeight:600, border:"1px solid #154753" }}>{r.endTime||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#94a3b8", fontSize:12, border:"1px solid #154753" }}>{r.local||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#e2e8f0", fontSize:12, border:"1px solid #154753", lineHeight:1.6 }}>
                              {r.instrNames.length > 0 ? r.instrNames.map((n,ni) => <div key={ni}>{n}</div>) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── ABA: PROGRAMAÇÃO DA TURMA ── */}
      {tab === "turmas" && (() => {
        const trainingOpts = [...new Set(schedules.map(s => s.trainingName).filter(Boolean))].sort();
        const classOpts = [...new Set(
          schedules.filter(s => !trmTraining || s.trainingName === trmTraining).map(s => s.className).filter(Boolean)
        )].sort();
        const filtered2 = schedules.filter(s =>
          s.date >= trmFrom && s.date <= trmTo &&
          (!trmTraining || s.trainingName === trmTraining) &&
          (!trmClass || s.className === trmClass)
        );
        const byClass = {};
        filtered2.forEach(s => {
          if (!byClass[s.className]) byClass[s.className] = { trainingName: s.trainingName, days: {} };
          if (!byClass[s.className].days[s.date]) byClass[s.className].days[s.date] = [];
          byClass[s.className].days[s.date].push(s);
        });
        const classes = Object.keys(byClass).sort();
        const fmtD = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"short", day:"2-digit", month:"2-digit" });
        const printTurma = (cls) => {
          const entry = byClass[cls];
          const days = Object.keys(entry.days).sort();
          const rowsHtml = days.map(d => {
            const items = entry.days[d].sort((a,b) => a.startTime.localeCompare(b.startTime));
            return items.map((s,i) =>
              "<tr>" + (i === 0 ? "<td rowspan='" + items.length + "' style='padding:6px 12px;border:1px solid #ddd;vertical-align:top;font-weight:600'>" + new Date(d + "T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"}) + "</td>" : "") +
              "<td style='padding:6px 12px;border:1px solid #ddd'>" + (s.startTime||"") + " – " + (s.endTime||"") + "</td>" +
              "<td style='padding:6px 12px;border:1px solid #ddd'>" + (s.module||"") + "</td>" +
              "<td style='padding:6px 12px;border:1px solid #ddd'>" + (s.local||"—") + "</td>" +
              "<td style='padding:6px 12px;border:1px solid #ddd'>" + (s.instructorName||"—") + "</td>" +
              "</tr>"
            ).join("");
          }).join("");
          const w = window.open("", "_blank");
          w.document.write("<html><head><title>" + cls + "</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{background:#01323d;color:#fff;padding:8px 12px;border:1px solid #ccc}@media print{button{display:none}}</style></head><body>");
          w.document.write("<h2 style='margin:0 0 2px'>Programação da Turma</h2>");
          w.document.write("<h3 style='margin:0 0 4px;color:#555'>" + cls + " — " + (entry.trainingName||"") + "</h3>");
          w.document.write("<button onclick='window.print()' style='margin-bottom:16px;padding:8px 18px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer'>🖨 Imprimir / PDF</button>");
          w.document.write("<table><thead><tr><th>Dia</th><th>Horário</th><th>Módulo</th><th>Local</th><th>Instrutor</th></tr></thead><tbody>" + rowsHtml + "</tbody></table>");
          w.document.write("</body></html>");
          w.document.close();
        };
        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <h3 style={{ color:"#fff", fontWeight:700, margin:"0 0 16px", fontSize:15 }}>📋 Programação da Turma</h3>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, marginBottom:20, alignItems:"flex-end" }}>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:4, fontWeight:600 }}>DE</label>
                <input type="date" value={trmFrom} onChange={e => setTrmFrom(e.target.value)}
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
              </div>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:4, fontWeight:600 }}>ATÉ</label>
                <input type="date" value={trmTo} onChange={e => setTrmTo(e.target.value)}
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
              </div>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:4, fontWeight:600 }}>TREINAMENTO</label>
                <select value={trmTraining} onChange={e => { setTrmTraining(e.target.value); setTrmClass(""); }}
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:13, outline:"none", minWidth:180 }}>
                  <option value="">Todos</option>
                  {trainingOpts.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:4, fontWeight:600 }}>TURMA</label>
                <select value={trmClass} onChange={e => setTrmClass(e.target.value)}
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:13, outline:"none", minWidth:160 }}>
                  <option value="">Todas</option>
                  {classOpts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {classes.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:32 }}>Nenhuma turma encontrada para os filtros selecionados.</p>
            ) : classes.map(cls => {
              const entry = byClass[cls];
              const days = Object.keys(entry.days).sort();
              return (
                <div key={cls} style={{ marginBottom:20, background:"#01323d", borderRadius:12, border:"1px solid #154753", overflow:"hidden" }}>
                  <div style={{ background:"#0a4a5a", padding:"12px 16px", borderBottom:"1px solid #154753", display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ color:"#ffa619", fontWeight:800, fontSize:14 }}>{cls}</span>
                    <span style={{ color:"#64748b", fontSize:12 }}>— {entry.trainingName||""}</span>
                    <span style={{ color:"#94a3b8", fontSize:11, marginLeft:"auto" }}>{days.length} dia{days.length !== 1 ? "s" : ""}</span>
                    <button onClick={() => printTurma(cls)} style={{ background:"#ffa619", border:"none", borderRadius:6, padding:"4px 10px", color:"#000", fontSize:11, fontWeight:700, cursor:"pointer" }}>🖨 PDF</button>
                  </div>
                  {days.map(d => {
                    const items = entry.days[d].sort((a,b) => a.startTime.localeCompare(b.startTime));
                    return (
                      <div key={d} style={{ borderBottom:"1px solid #0f3a48" }}>
                        <div style={{ background:"#073d4a", padding:"6px 16px" }}>
                          <span style={{ color:"#64748b", fontSize:11, fontWeight:700, textTransform:"uppercase" }}>{fmtD(d)}</span>
                        </div>
                        {items.map((s,i) => (
                          <div key={i} style={{ display:"flex", flexWrap:"wrap", gap:8, padding:"8px 16px", alignItems:"center", borderTop: i>0 ? "1px solid #0f3a48" : "none" }}>
                            <span style={{ color:"#f59e0b", fontSize:12, fontWeight:700, minWidth:110 }}>{s.startTime} – {s.endTime}</span>
                            <span style={{ color:"#e2e8f0", fontSize:12, flex:1, minWidth:140 }}>{s.module || "—"}</span>
                            {s.local && <span style={{ color:"#94a3b8", fontSize:11, background:"#073d4a", padding:"2px 8px", borderRadius:6 }}>📍 {s.local}</span>}
                            {s.instructorName && <span style={{ color:"#64748b", fontSize:11 }}>👤 {s.instructorName}</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── ABA: HORAS POR INSTRUTOR ── */}
      {tab === "horas" && (() => {
        const [hmFrom, hmTo] = (() => {
          const [y, m] = horasMonth.split("-").map(Number);
          const from = new Date(y, m-1, 1).toISOString().split("T")[0];
          const to   = new Date(y, m,   0).toISOString().split("T")[0];
          return [from, to];
        })();
        const toMinsH = t => { if (!t) return 0; const [h,mn] = t.split(":").map(Number); return h*60+(mn||0); };
        const fmtHM = mins => { const h = Math.floor(mins/60); const m = mins%60; return h + "h" + (m ? String(m).padStart(2,"0")+"min" : ""); };
        const monthItems = schedules.filter(s => s.date >= hmFrom && s.date <= hmTo);
        const byInstr = instructors.map(instr => {
          const items = monthItems.filter(s => s.instructorId === instr.id);
          const totalMins = items.reduce((acc, s) => acc + Math.max(0, toMinsH(s.endTime) - toMinsH(s.startTime)), 0);
          const teoriaMins = items.filter(s => (s.type||"").toUpperCase() === "TEORIA").reduce((acc,s) => acc + Math.max(0, toMinsH(s.endTime) - toMinsH(s.startTime)), 0);
          const praticaMins = items.filter(s => (s.type||"").toUpperCase() === "PRÁTICA").reduce((acc,s) => acc + Math.max(0, toMinsH(s.endTime) - toMinsH(s.startTime)), 0);
          const outrasMins = totalMins - teoriaMins - praticaMins;
          // Horas trabalhadas em feriado (regional ou nacional) — separadas para futura bonificação
          const holidayMins = items.filter(s => isHoliday(s.date, instr, holidays || []))
            .reduce((acc, s) => acc + Math.max(0, toMinsH(s.endTime) - toMinsH(s.startTime)), 0);
          const trainings2 = [...new Set(items.map(s => s.trainingName).filter(Boolean))];
          return { ...instr, totalMins, teoriaMins, praticaMins, outrasMins, holidayMins, items, trainings2 };
        }).filter(i => i.totalMins > 0).sort((a,b) => b.totalMins - a.totalMins);
        const maxMins = Math.max(...byInstr.map(i => i.totalMins), 1);
        const fmtMonthLabel = () => { const [y,m] = horasMonth.split("-").map(Number); return new Date(y, m-1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); };
        const printHoras = () => {
          const rowsHtml = byInstr.map(i =>
            "<tr><td style='padding:6px 12px;border:1px solid #ddd'>" + i.name + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;text-align:center'>" + fmtHM(i.totalMins) + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;text-align:center'>" + fmtHM(i.teoriaMins) + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;text-align:center'>" + fmtHM(i.praticaMins) + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;text-align:center;color:" + (i.holidayMins > 0 ? "#06b6d4" : "#999") + ";font-weight:" + (i.holidayMins > 0 ? "700" : "400") + "'>" + (i.holidayMins > 0 ? fmtHM(i.holidayMins) : "—") + "</td>" +
            "<td style='padding:6px 12px;border:1px solid #ddd;font-size:11px;color:#555'>" + i.trainings2.join(", ") + "</td></tr>"
          ).join("");
          const totalGeral = byInstr.reduce((a,i) => a + i.totalMins, 0);
          const totalFeriado = byInstr.reduce((a,i) => a + i.holidayMins, 0);
          const w = window.open("", "_blank");
          w.document.write("<html><head><title>Horas por Instrutor – " + fmtMonthLabel() + "</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{background:#01323d;color:#fff;padding:8px 12px;border:1px solid #ccc}@media print{button{display:none}}</style></head><body>");
          w.document.write("<h2 style='margin:0 0 4px'>Relatório de Horas por Instrutor</h2>");
          w.document.write("<p style='color:#555;margin:0 0 6px'>" + fmtMonthLabel().toUpperCase() + " &nbsp;·&nbsp; Total geral: " + fmtHM(totalGeral) + " em " + byInstr.length + " instrutor(es)</p>");
          if (totalFeriado > 0) w.document.write("<p style='color:#06b6d4;margin:0 0 16px;font-weight:700'>🏖 Horas em feriado: " + fmtHM(totalFeriado) + " — sujeitas a bonificação</p>");
          w.document.write("<button onclick='window.print()' style='margin-bottom:16px;padding:8px 18px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer'>🖨 Imprimir / PDF</button>");
          w.document.write("<table><thead><tr><th>Instrutor</th><th>Total</th><th>Teoria</th><th>Prática</th><th>🏖 Feriado</th><th>Treinamentos</th></tr></thead><tbody>" + rowsHtml + "</tbody></table>");
          w.document.write("</body></html>");
          w.document.close();
        };
        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"center", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15 }}>⏱ Horas por Instrutor — Fechamento Mensal</h3>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
                <input type="month" value={horasMonth} onChange={e => setHorasMonth(e.target.value)}
                  style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 12px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                <button onClick={printHoras} style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"7px 14px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>🖨 PDF</button>
              </div>
            </div>
            {byInstr.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:32 }}>Nenhuma aula registrada em {fmtMonthLabel()}.</p>
            ) : (
              <>
                <div style={{ background:"#01323d", borderRadius:10, padding:"10px 16px", marginBottom:16, display:"flex", gap:24, flexWrap:"wrap" }}>
                  <div><span style={{ color:"#ffa619", fontWeight:800, fontSize:16 }}>{fmtHM(byInstr.reduce((a,i)=>a+i.totalMins,0))}</span><span style={{ color:"#64748b", fontSize:12 }}> total</span></div>
                  <div><span style={{ color:"#f59e0b", fontWeight:700, fontSize:15 }}>{fmtHM(byInstr.reduce((a,i)=>a+i.teoriaMins,0))}</span><span style={{ color:"#64748b", fontSize:12 }}> teoria</span></div>
                  <div><span style={{ color:"#16a34a", fontWeight:700, fontSize:15 }}>{fmtHM(byInstr.reduce((a,i)=>a+i.praticaMins,0))}</span><span style={{ color:"#64748b", fontSize:12 }}> prática</span></div>
                  {byInstr.reduce((a,i)=>a+i.holidayMins,0) > 0 && (
                    <div title="Horas trabalhadas em feriado — sujeitas a bonificação">
                      <span style={{ color:"#06b6d4", fontWeight:700, fontSize:15 }}>🏖 {fmtHM(byInstr.reduce((a,i)=>a+i.holidayMins,0))}</span>
                      <span style={{ color:"#64748b", fontSize:12 }}> em feriado</span>
                    </div>
                  )}
                  <div><span style={{ color:"#e2e8f0", fontWeight:700, fontSize:15 }}>{byInstr.length}</span><span style={{ color:"#64748b", fontSize:12 }}> instrutor(es)</span></div>
                </div>
                {byInstr.map((instr, ri) => (
                  <div key={instr.id} style={{ marginBottom:10, background:"#01323d", borderRadius:12, padding:"12px 16px", border:"1px solid #154753" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#ffa619,#e8920a)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:11, fontWeight:700, flexShrink:0 }}>
                        {instr.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:13 }}>{instr.name.split(" ").slice(0,3).join(" ")}</div>
                        <div style={{ display:"flex", gap:10, marginTop:2, flexWrap:"wrap" }}>
                          <span style={{ color:"#ffa619", fontSize:12, fontWeight:700 }}>{fmtHM(instr.totalMins)}</span>
                          {instr.teoriaMins > 0 && <span style={{ color:"#f59e0b", fontSize:11 }}>T: {fmtHM(instr.teoriaMins)}</span>}
                          {instr.praticaMins > 0 && <span style={{ color:"#16a34a", fontSize:11 }}>P: {fmtHM(instr.praticaMins)}</span>}
                          {instr.outrasMins > 0 && <span style={{ color:"#64748b", fontSize:11 }}>?: {fmtHM(instr.outrasMins)}</span>}
                          {instr.holidayMins > 0 && <span title="Horas em feriado — sujeitas a bonificação" style={{ color:"#06b6d4", fontSize:11, fontWeight:700 }}>🏖 {fmtHM(instr.holidayMins)}</span>}
                        </div>
                      </div>
                      <span style={{ color:"#64748b", fontSize:11, textAlign:"right" }}>{instr.items.length} aula{instr.items.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ background:"#073d4a", borderRadius:6, height:8, overflow:"hidden" }}>
                      <div style={{ display:"flex", height:"100%" }}>
                        {instr.teoriaMins > 0 && <div style={{ width: (instr.teoriaMins/maxMins*100) + "%", background:"#f59e0b", transition:"width 0.3s" }} />}
                        {instr.praticaMins > 0 && <div style={{ width: (instr.praticaMins/maxMins*100) + "%", background:"#16a34a", transition:"width 0.3s" }} />}
                        {instr.outrasMins > 0 && <div style={{ width: (instr.outrasMins/maxMins*100) + "%", background:"#64748b", transition:"width 0.3s" }} />}
                      </div>
                    </div>
                    {instr.trainings2.length > 0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:8 }}>
                        {instr.trainings2.map(t => (
                          <span key={t} style={{ padding:"1px 7px", borderRadius:20, background:"#ffa61915", color:"#ffa619", fontSize:10, fontWeight:600 }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        );
      })()}

      {/* ── ABA: MARINHA ── */}
      {tab === "marinha" && (() => {
        const toMins = t => { const [h,m] = (t||"00:00").split(":").map(Number); return h*60+m; };
        const fmtBR = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });

        const getWeekBounds = (offset) => {
          const now = new Date();
          const day = now.getDay(); // 0=Dom … 6=Sáb
          const diff = day === 0 ? -6 : 1 - day; // dias até segunda
          const pad = n => String(n).padStart(2, "0");
          const toISO = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
          const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff + offset * 7);
          const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
          return { start: toISO(mon), end: toISO(sun) };
        };
        const getISOWeek = (dateStr) => {
          const d = new Date(dateStr + "T12:00:00");
          d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
          const yearStart = new Date(d.getFullYear(), 0, 4);
          return 1 + Math.round(((d - yearStart) / 86400000 - 3 + (yearStart.getDay() + 6) % 7) / 7);
        };
        const { start: marinhaFrom, end: marinhaTo } = getWeekBounds(marinhaWeekOffset);
        const semanaNum = getISOWeek(marinhaFrom);

        const marinhaTrainingIds = new Set(
          trainings.filter(t => {
            const areaName = (areas || []).find(a => a.id === t.area)?.name || "";
            return /marinha/i.test(areaName) || /marinha/i.test(t.name || "");
          }).map(t => String(t.id))
        );

        const getInstrName = s => {
          if (s.instructorName) return s.instructorName;
          const i = instructors.find(x => String(x.id) === String(s.instructorId));
          return i ? i.name : null;
        };

        const allMarinhaItems = schedules.filter(s => marinhaTrainingIds.has(String(s.trainingId)));

        // Turmas cujo PRIMEIRO dia cai dentro da semana selecionada
        const classFirstDate = {};
        allMarinhaItems.forEach(s => {
          if (!classFirstDate[s.className] || s.date < classFirstDate[s.className])
            classFirstDate[s.className] = s.date;
        });
        const startingClasses = new Set(
          Object.entries(classFirstDate)
            .filter(([, d]) => d >= marinhaFrom && d <= marinhaTo)
            .map(([cls]) => cls)
        );
        // Mostra TODOS os itens dessas turmas (visão completa do curso)
        const weekItems = allMarinhaItems.filter(s => startingClasses.has(s.className));

        const byClass = {};
        weekItems.forEach(s => {
          if (!byClass[s.className]) byClass[s.className] = { trainingName: s.trainingName, studentCount: "", entries: {} };
          if (!byClass[s.className].studentCount && s.studentCount) byClass[s.className].studentCount = s.studentCount;
          const key = `${s.module}|${s.date}|${s.startTime}|${s.endTime}|${s.local||""}`;
          if (!byClass[s.className].entries[key]) byClass[s.className].entries[key] = { ...s, instrNames: [] };
          const n = getInstrName(s);
          if (n && !byClass[s.className].entries[key].instrNames.includes(n))
            byClass[s.className].entries[key].instrNames.push(n);
        });
        const classes = Object.keys(byClass).sort();

        const allClassDates = {};
        allMarinhaItems.forEach(s => {
          if (!allClassDates[s.className]) allClassDates[s.className] = [];
          allClassDates[s.className].push(s.date);
        });
        const classDates = cls => {
          const ds = [...new Set(allClassDates[cls] || [])].sort();
          return { start: ds[0], end: ds[ds.length - 1] };
        };

        const printMarinha = () => {
          const fmtD = d => fmtBR(d);
          let html = `<html><head><title>MARINHA</title><style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial,sans-serif;background:#fff}
            .ph{background:#01323d;color:#fff;text-align:center;padding:22px 32px 18px}
            .ph h1{font-size:17px;font-weight:800;letter-spacing:1px;margin-bottom:5px}
            .ph .sub{color:#ffa619;font-size:12px;font-weight:700;letter-spacing:1px}
            .ph .per{color:rgba(255,255,255,0.5);font-size:10px;margin-top:5px;letter-spacing:.5px}
            .cb{margin:20px 24px}
            .ch{display:flex;border:1px solid #ccc;border-bottom:none;background:#e8f0f5}
            .cn{padding:10px 16px;font-weight:800;font-size:13px;border-right:1px solid #ccc;min-width:130px}
            .cm{display:flex;flex:1}
            .cm span{padding:10px 16px;font-size:11px;border-right:1px solid #ccc}
            .cm span:last-child{border-right:none}
            .lbl{color:#888;font-size:10px;display:block}
            table{width:100%;border-collapse:collapse;border:1px solid #ccc}
            thead tr{background:#f5f5f5}
            th{padding:7px 12px;text-align:left;font-size:10px;color:#666;font-weight:700;border:1px solid #ddd;text-transform:uppercase}
            td{padding:6px 12px;font-size:11px;border:1px solid #ddd;vertical-align:top;color:#333}
            tr:nth-child(even) td{background:#fafafa}
            .pf{margin-top:28px;background:#01323d;color:rgba(255,255,255,0.45);text-align:center;padding:12px;font-size:9px;letter-spacing:1px}
            @media print{button{display:none}.cb{page-break-inside:avoid}}
          </style></head><body>`;
          html += `<div class="ph"><h1>PROGRAMAÇÃO SEMANAL DE CURSOS E TREINAMENTOS</h1><div class="sub">${COMPANY_LEGAL_NAME}</div><div class="per">PERÍODO: ${fmtD(marinhaFrom)} - ${fmtD(marinhaTo)} (Semana ${semanaNum})</div></div>`;
          html += `<div style="text-align:center;padding:16px 0"><button onclick="window.print()" style="padding:8px 24px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨 Imprimir / Salvar PDF</button></div>`;
          classes.forEach(cls => {
            const { start, end } = classDates(cls);
            const sc = byClass[cls].studentCount;
            const rows = Object.values(byClass[cls].entries).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
            html += `<div class="cb"><div class="ch"><div class="cn">${cls}</div><div class="cm">`;
            html += `<span><span class="lbl">INÍCIO</span>${start ? fmtD(start) : "—"}</span>`;
            html += `<span><span class="lbl">TÉRMINO</span>${end ? fmtD(end) : "—"}</span>`;
            if (sc) html += `<span><span class="lbl">N ALUNOS</span>${sc}</span>`;
            html += `</div></div>`;
            html += `<table><thead><tr><th>Name</th><th>PlanDate</th><th>Start</th><th>End</th><th>Local</th><th>Instructors</th></tr></thead><tbody>`;
            rows.forEach(r => {
              html += `<tr><td>${r.module||"—"}</td><td>${fmtD(r.date)}</td><td>${r.startTime||"—"}</td><td>${r.endTime||"—"}</td><td>${r.local||"—"}</td><td>${r.instrNames.join("<br>")||"—"}</td></tr>`;
            });
            html += `</tbody></table></div>`;
          });
          html += `<div class="pf">PROGRAMAÇÃO SEMANAL DE CURSOS E TREINAMENTOS &nbsp;|&nbsp; PERÍODO: ${fmtD(marinhaFrom)} - ${fmtD(marinhaTo)} (Semana ${semanaNum})</div></body></html>`;
          const w = window.open("", "_blank");
          if (!w) return;
          w.document.write(html);
          w.document.close();
        };

        const navBtn = (dir, label) => (
          <button onClick={() => setMarinhaWeekOffset(o => o + dir)}
            style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:8, padding:"7px 14px", color:"#e2e8f0", fontSize:18, cursor:"pointer", lineHeight:1 }}>
            {label}
          </button>
        );

        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-end", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15, alignSelf:"center" }}>⚓ MARINHA</h3>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto", flexWrap:"wrap" }}>
                {navBtn(-1, "◀")}
                <span style={{ color:"#e2e8f0", fontSize:13, fontWeight:600, minWidth:260, textAlign:"center" }}>
                  {fmtBR(marinhaFrom)} – {fmtBR(marinhaTo)}
                  <span style={{ color:"#64748b", fontWeight:400, fontSize:12 }}> (Semana {semanaNum})</span>
                </span>
                {navBtn(1, "▶")}
                {marinhaWeekOffset !== 0 && (
                  <button onClick={() => setMarinhaWeekOffset(0)}
                    style={{ background:"#154753", border:"1px solid #1e6a7a", borderRadius:8, padding:"7px 14px", color:"#ffa619", fontSize:12, cursor:"pointer" }}>
                    Semana Atual
                  </button>
                )}
                <button onClick={printMarinha}
                  style={{ background:"#ffa619", border:"none", borderRadius:8, padding:"8px 18px", color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  🖨 PDF
                </button>
              </div>
            </div>

            {classes.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>Nenhuma turma da área MARINHA nesta semana.</p>
            ) : classes.map(cls => {
              const entry = byClass[cls];
              const rows = Object.values(entry.entries).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
              const { start, end } = classDates(cls);
              return (
                <div key={cls} style={{ marginBottom:20, background:"#01323d", borderRadius:12, border:"1px solid #154753", overflow:"hidden" }}>
                  <div style={{ display:"flex", flexWrap:"wrap", alignItems:"stretch", borderBottom:"1px solid #154753" }}>
                    <div style={{ padding:"12px 20px", borderRight:"1px solid #154753", display:"flex", alignItems:"center", minWidth:140 }}>
                      <span style={{ color:"#fff", fontWeight:800, fontSize:15 }}>{cls}</span>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", flex:1 }}>
                      <div style={{ padding:"8px 20px", borderRight:"1px solid #154753" }}>
                        <div style={{ color:"#64748b", fontSize:10, fontWeight:700, marginBottom:2 }}>INÍCIO</div>
                        <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{start ? fmtBR(start) : "—"}</div>
                      </div>
                      <div style={{ padding:"8px 20px", borderRight:"1px solid #154753" }}>
                        <div style={{ color:"#64748b", fontSize:10, fontWeight:700, marginBottom:2 }}>TÉRMINO</div>
                        <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{end ? fmtBR(end) : "—"}</div>
                      </div>
                      {entry.studentCount && (
                        <div style={{ padding:"8px 20px", borderRight:"1px solid #154753" }}>
                          <div style={{ color:"#64748b", fontSize:10, fontWeight:700, marginBottom:2 }}>N ALUNOS</div>
                          <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{entry.studentCount}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", minWidth:680 }}>
                      <thead>
                        <tr style={{ background:"#073d4a" }}>
                          {["Name","PlanDate","Start","End","Local","Instructors"].map((h, i) => (
                            <th key={h} style={{ padding:"8px 14px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", minWidth:[200,100,70,70,120,200][i] }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, ri) => (
                          <tr key={ri} style={{ background: ri%2===0 ? "#01323d" : "#02293a" }}>
                            <td style={{ padding:"8px 14px", color:"#e2e8f0", fontSize:12, border:"1px solid #154753" }}>{r.module||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#94a3b8", fontSize:12, border:"1px solid #154753" }}>{fmtBR(r.date)}</td>
                            <td style={{ padding:"8px 14px", color:"#f59e0b", fontSize:12, fontWeight:600, border:"1px solid #154753" }}>{r.startTime||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#f59e0b", fontSize:12, fontWeight:600, border:"1px solid #154753" }}>{r.endTime||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#94a3b8", fontSize:12, border:"1px solid #154753" }}>{r.local||"—"}</td>
                            <td style={{ padding:"8px 14px", color:"#e2e8f0", fontSize:12, border:"1px solid #154753", lineHeight:1.6 }}>
                              {r.instrNames.length > 0 ? r.instrNames.map((n, ni) => <div key={ni}>{n}</div>) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── ABA: FTE* ── */}
      {tab === "fte" && (() => {
        const toMins = t => { const [h,m] = (t||"00:00").split(":").map(Number); return h*60+m; };
        const fmtBR = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });

        const freelancers = instructors.filter(i => i.contract === "Freelancer");

        const manhaFn = s => toMins(s.startTime) < 13 * 60;
        const tardeFn = s => toMins(s.startTime) >= 13 * 60 && toMins(s.startTime) < 17 * 60;
        const noiteFn = s => toMins(s.startTime) >= 17 * 60;

        const getShiftData = (instrId, shiftFn) => {
          const items = schedules.filter(s => s.date === fteDate && String(s.instructorId) === String(instrId) && shiftFn(s));
          const seen = new Set();
          const labels = [];
          const areas = new Set();
          items.forEach(s => {
            if (!seen.has(s.className)) {
              seen.add(s.className);
              labels.push(s.role === "Translator" ? `Tradutor · ${s.className}` : `${s.trainingName} · ${s.className}`);
            }
            const t = trainings.find(tr => String(tr.id) === String(s.trainingId));
            if (t?.area) areas.add(t.area);
          });
          return { labels, areas: [...areas], active: items.length > 0 };
        };

        const rows = freelancers.map(instr => {
          const manha = getShiftData(instr.id, manhaFn);
          const tarde = getShiftData(instr.id, tardeFn);
          const noite = getShiftData(instr.id, noiteFn);
          const fte = (manha.active ? 0.5 : 0) + (tarde.active ? 0.5 : 0) + (noite.active ? 0.5 : 0);
          return { ...instr, manha, tarde, noite, fte };
        }).filter(r => r.fte > 0).sort((a, b) => b.fte - a.fte || a.name.localeCompare(b.name));

        const areaSummary = {};
        rows.forEach(r => {
          if (r.manha.active) { const a = r.manha.areas[0] || "—"; areaSummary[a] = (areaSummary[a] || 0) + 0.5; }
          if (r.tarde.active) { const a = r.tarde.areas[0] || "—"; areaSummary[a] = (areaSummary[a] || 0) + 0.5; }
          if (r.noite.active) { const a = r.noite.areas[0] || "—"; areaSummary[a] = (areaSummary[a] || 0) + 0.5; }
        });
        const totalFte = rows.reduce((s, r) => s + r.fte, 0);

        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            {/* Controles */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-end", marginBottom:20 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15, alignSelf:"center" }}>👥 FTE*</h3>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginLeft:"auto", flexWrap:"wrap" }}>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>DATA</label>
                  <input type="date" value={fteDate} onChange={e => setFteDate(e.target.value)}
                    style={{ background:"#01323d", border:"1px solid #154753", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
                </div>
                <div style={{ padding:"10px 16px", background:"#01323d", borderRadius:10, border:"1px solid #154753", alignSelf:"flex-end" }}>
                  <span style={{ color:"#64748b", fontSize:12 }}>Total FTE: </span>
                  <span style={{ color:"#ffa619", fontSize:16, fontWeight:800 }}>{totalFte.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* Resumo por área */}
            {Object.keys(areaSummary).length > 0 && (
              <div style={{ background:"#01323d", borderRadius:12, padding:"16px 20px", marginBottom:20, border:"1px solid #154753" }}>
                <div style={{ color:"#94a3b8", fontSize:11, fontWeight:700, marginBottom:10, letterSpacing:1 }}>RESUMO POR ÁREA</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {Object.entries(areaSummary).sort((a, b) => b[1] - a[1]).map(([area, fte]) => (
                    <div key={area} style={{ background:"#073d4a", borderRadius:8, padding:"8px 16px", border:"1px solid #154753", display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ color:"#94a3b8", fontSize:12 }}>{area}</span>
                      <span style={{ color:"#ffa619", fontSize:16, fontWeight:800 }}>{fte.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabela */}
            {rows.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:40 }}>
                {freelancers.length === 0
                  ? "Nenhum instrutor com contrato Freelancer cadastrado."
                  : "Nenhum freelancer com programação nesta data."}
              </p>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth:600 }}>
                  <thead>
                    <tr style={{ background:"#01323d" }}>
                      <th style={{ padding:"10px 16px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753" }}>INSTRUTOR</th>
                      <th style={{ padding:"10px 16px", color:"#f59e0b", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753", background:"#92400e18" }}>☀️ MANHÃ</th>
                      <th style={{ padding:"10px 16px", color:"#3b82f6", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753", background:"#1e3a8a18" }}>🌤 TARDE</th>
                      <th style={{ padding:"10px 16px", color:"#8b5cf6", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753", background:"#3b076418" }}>🌙 NOITE</th>
                      <th style={{ padding:"10px 16px", color:"#ffa619", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753" }}>FTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => (
                      <tr key={r.id} style={{ background: ri%2===0 ? "#01323d" : "#02293a" }}>
                        <td style={{ padding:"10px 16px", color:"#e2e8f0", fontSize:13, fontWeight:600, border:"1px solid #154753" }}>{r.name}</td>
                        <td style={{ padding:"10px 16px", color: r.manha.active ? "#f59e0b" : "#334155", fontSize:12, textAlign:"left", border:"1px solid #154753" }}>
                          {r.manha.labels.length > 0 ? r.manha.labels.map((l, li) => <div key={li} style={{lineHeight:1.6}}>{l}</div>) : "—"}
                        </td>
                        <td style={{ padding:"10px 16px", color: r.tarde.active ? "#3b82f6" : "#334155", fontSize:12, textAlign:"left", border:"1px solid #154753" }}>
                          {r.tarde.labels.length > 0 ? r.tarde.labels.map((l, li) => <div key={li} style={{lineHeight:1.6}}>{l}</div>) : "—"}
                        </td>
                        <td style={{ padding:"10px 16px", color: r.noite.active ? "#8b5cf6" : "#334155", fontSize:12, textAlign:"left", border:"1px solid #154753" }}>
                          {r.noite.labels.length > 0 ? r.noite.labels.map((l, li) => <div key={li} style={{lineHeight:1.6}}>{l}</div>) : "—"}
                        </td>
                        <td style={{ padding:"10px 16px", color:"#ffa619", fontSize:14, fontWeight:800, textAlign:"center", border:"1px solid #154753" }}>
                          {r.fte.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background:"#01323d", borderTop:"2px solid #1e6a7a" }}>
                      <td colSpan={4} style={{ padding:"10px 16px", color:"#94a3b8", fontSize:11, fontWeight:700, border:"1px solid #154753", textAlign:"right" }}>TOTAL FTE DO DIA</td>
                      <td style={{ padding:"10px 16px", color:"#ffa619", fontSize:16, fontWeight:800, textAlign:"center", border:"1px solid #154753" }}>{totalFte.toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ color:"#475569", fontSize:11, marginTop:14 }}>* FTE = Full-Time Equivalent. Cada turno (Manhã / Tarde / Noite) = 0,5 FTE. Exibe apenas instrutores com contrato <strong style={{color:"#64748b"}}>Freelancer</strong>.</p>
          </div>
        );
      })()}


      {/* ── ABA: UTILIZATION (matriz instrutores × período) ── */}
      {tab === "utilization" && (() => {
        const fmtDD   = d => { const [,mm,dd] = d.split("-"); return `${dd}/${mm}`; };
        const fmtBR2  = d => new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
        const toMins2 = t => { const [h,m]=(t||"00:00").split(":").map(Number); return h*60+m; };
        const WD_LONG = ["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];

        const getDatesInRange = (from, to) => {
          const out=[]; const end=new Date(to+"T12:00:00"); let cur=new Date(from+"T12:00:00");
          while(cur<=end && out.length<90){ out.push(cur.toISOString().split("T")[0]); cur.setDate(cur.getDate()+1); }
          return out;
        };
        const dates = getDatesInRange(utilFrom, utilTo);

        const listaFilt = instructors.filter(i => {
          const nOk = busca ? i.name.toLowerCase().includes(busca.toLowerCase()) : true;
          const cOk = (!somenteCLT&&!somenteCLTOFFSHORE&&!somenteFreelancer) ||
            (somenteCLT&&(i.contract||"").toLowerCase()==="clt") ||
            (somenteCLTOFFSHORE&&/offshore/i.test(i.contract||"")) ||
            (somenteFreelancer&&/freelancer/i.test(i.contract||""));
          const iOk = !utilSelInstr || String(i.id)===String(utilSelInstr);
          return nOk&&cOk&&iOk;
        }).sort((a,b)=>a.name.localeCompare(b.name));

        const schedIdx = {};
        schedules.forEach(s => {
          if(s.date>=utilFrom && s.date<=utilTo){
            const k=`${s.instructorId}|${s.date}`;
            if(!schedIdx[k]) schedIdx[k]=[];
            schedIdx[k].push(s);
          }
        });
        const getTrainLabel = s => {
          const t = trainings.find(tr => String(tr.id) === String(s.trainingId));
          return (t && t.shortName) || s.trainingName || "?";
        };
        const getOcc = (instrId, date) => {
          const items = schedIdx[`${instrId}|${date}`]||[];
          const getLabels = fn => [...new Set(items.filter(fn).map(getTrainLabel))];
          return {
            manha: getLabels(s => toMins2(s.startTime) < 13*60),
            tarde: getLabels(s => toMins2(s.startTime) >= 13*60 && toMins2(s.startTime) < 17*60),
            noite: getLabels(s => toMins2(s.startTime) >= 17*60),
          };
        };

        const instrData = listaFilt.map(instr => {
          let total=0;
          const dayOccs = dates.map(d=>{ const o=getOcc(instr.id,d); if(o.manha.length||o.tarde.length||o.noite.length) total++; return o; });
          return {instr, dayOccs, total};
        });
        const instrDataFiltrado = instrData.filter(r => {
          if (utilAtivos) return r.total > 0;
          if (utilLivres) return r.total === 0;
          return true;
        });
        const totalAtivos = instrData.filter(r=>r.total>0).length;

        const exportExcel = () => {
          const fmtDDMM = d => { const [,mm,dd] = d.split("-"); return `${dd}/${mm}`; };
          const headerRow = `<tr>
            <td style="background:#01323d;color:#94a3b8;font-weight:bold;padding:6px 12px;font-size:10pt;white-space:nowrap;border:1px solid #0d4a5a">INSTRUTOR</td>
            <td style="background:#01323d;color:#64748b;font-weight:bold;padding:6px 8px;font-size:9pt;border:1px solid #0d4a5a">CONTRATO</td>
            ${dates.map(d=>{
              const dd=new Date(d+"T12:00:00"); const isW=dd.getDay()===0||dd.getDay()===6; const wd=WD_LONG[dd.getDay()];
              return `<td style="background:${isW?"#fef2f2":"#f1f5f9"};color:${isW?"#dc2626":"#475569"};font-weight:bold;text-align:center;font-size:8pt;padding:4px 3px;border:1px solid #d1d5db">${fmtDDMM(d)}<br>${wd}</td>`;
            }).join("")}
          </tr>`;
          const bodyRows = instrDataFiltrado.map(({instr,dayOccs},ri)=>{
            const rowBg = ri%2===0?"#ffffff":"#f8fafc";
            const cells = dayOccs.map((occ,di)=>{
              const dow=new Date(dates[di]+"T12:00:00").getDay(); const wknd=dow===0||dow===6;
              const hM=occ.manha.length>0; const hT=occ.tarde.length>0; const hN=occ.noite.length>0;
              const multi=(hM?1:0)+(hT?1:0)+(hN?1:0)>1;
              const cellBg = wknd?"#fef2f2":multi?"#f0fdf4":hM?"#fffbeb":hT?"#eff6ff":hN?"#f5f3ff":rowBg;
              const content=[
                ...occ.manha.map(l=>`<span style="color:#92400e;font-weight:bold">${l}</span>`),
                ...occ.tarde.map(l=>`<span style="color:#1d4ed8;font-weight:bold">${l}</span>`),
                ...occ.noite.map(l=>`<span style="color:#6d28d9;font-weight:bold">${l}</span>`),
              ].join("<br>");
              return `<td style="background:${cellBg};text-align:center;padding:4px 3px;vertical-align:middle;border:1px solid #e9ecef;font-size:9pt">${content}</td>`;
            }).join("");
            return `<tr>
              <td style="background:${rowBg};font-weight:bold;color:#1e293b;padding:5px 12px;white-space:nowrap;font-size:10pt;border:1px solid #e9ecef">${instr.name}</td>
              <td style="background:${rowBg};color:#94a3b8;padding:5px 8px;font-size:9pt;border:1px solid #e9ecef">${instr.contract||"—"}</td>
              ${cells}
            </tr>`;
          }).join("");
          const occupied = instrDataFiltrado.filter(r=>r.total>0).length;
          const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
            <head><meta charset="UTF-8">
            <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
            <x:Name>UTILIZATION</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
            </head><body>
            <table border="0" style="border-collapse:collapse;font-family:Calibri,Arial">
            <tr><td colspan="${dates.length+2}" style="background:#01323d;color:#ffa619;font-size:13pt;font-weight:900;padding:10px 14px;letter-spacing:2px">UTILIZATION REPORT</td></tr>
            <tr><td colspan="${dates.length+2}" style="background:#01323d;color:rgba(255,255,255,.5);font-size:8pt;padding:3px 14px 8px">${COMPANY_LEGAL_NAME} &nbsp;·&nbsp; ${fmtBR2(utilFrom)} → ${fmtBR2(utilTo)} &nbsp;·&nbsp; ${instrDataFiltrado.length} instrutores · ${occupied} com aulas · ${dates.length} dias</td></tr>
            ${headerRow}${bodyRows}
            </table></body></html>`;
          const blob=new Blob(["﻿"+html],{type:"application/vnd.ms-excel;charset=utf-8"});
          const url=URL.createObjectURL(blob);
          const a=document.createElement("a"); a.href=url; a.download=`UTILIZATION_${utilFrom}_${utilTo}.xls`; a.click();
          URL.revokeObjectURL(url);
        };

        const printUtil2 = () => {
          const n = dates.length;
          const chipFs  = n > 45 ? 5   : n > 30 ? 5.5 : n > 14 ? 6.5 : 8;
          const instrFs = n > 45 ? 7.5 : n > 30 ? 8   : n > 14 ? 9   : 10;
          const hdFs    = n > 45 ? 5.5 : n > 30 ? 6   : n > 14 ? 6.5 : 7.5;
          const instrMm = 46; const contMm = 15;
          const dayMm   = Math.max(6, Math.floor((281 - instrMm - contMm) / n));
          const colgroup = `<col style="width:${instrMm}mm"><col style="width:${contMm}mm">${dates.map(()=>`<col style="width:${dayMm}mm">`).join("")}`;
          const occupied = instrDataFiltrado.filter(r=>r.total>0).length;

          const dateHdrs = dates.map(d=>{
            const dd=new Date(d+"T12:00:00"); const wd=WD_LONG[dd.getDay()]; const isW=dd.getDay()===0||dd.getDay()===6;
            return `<th class="hd${isW?" hw":""}" style="font-size:${hdFs}px">${fmtDD(d)}<br><span style="font-size:${hdFs-1}px;opacity:.65">${wd}</span></th>`;
          }).join("");

          const bodyRows = instrDataFiltrado.map(({instr,dayOccs},ri)=>{
            const cells = dayOccs.map((occ,di)=>{
              const dow=new Date(dates[di]+"T12:00:00").getDay(); const wknd=dow===0||dow===6;
              const active=occ.manha.length||occ.tarde.length||occ.noite.length;
              const cls=`cd${active?" co":""}${wknd?" cw":""}`;
              const chips=[
                ...occ.manha.map(l=>`<span class="chip m" style="font-size:${chipFs}px">${l}</span>`),
                ...occ.tarde.map(l=>`<span class="chip t" style="font-size:${chipFs}px">${l}</span>`),
                ...occ.noite.map(l=>`<span class="chip n" style="font-size:${chipFs}px">${l}</span>`),
              ].join("");
              return `<td class="${cls}">${chips?`<div class="ci">${chips}</div>`:""}</td>`;
            }).join("");
            const rowBg = ri%2===0?"#fff":"#f8fafc";
            return `<tr style="background:${rowBg}">
              <td class="cn" style="font-size:${instrFs}px;background:${rowBg}">${instr.name}</td>
              <td class="cc" style="font-size:${Math.max(6,instrFs-2)}px;background:${rowBg}">${instr.contract||"—"}</td>
              ${cells}
            </tr>`;
          }).join("");

          const w=window.open("","_blank"); if(!w) return;
          w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>UTILIZATION REPORT</title><style>
            @page{size:A4 landscape;margin:8mm}
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial,Helvetica,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
            .header{background:#01323d;padding:10px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #ffa619}
            .hl .brand{color:#ffa619;font-size:14px;font-weight:900;letter-spacing:2px}
            .hl .co{color:rgba(255,255,255,.45);font-size:7.5px;margin-top:3px}
            .hr{text-align:right}
            .hr .rn{color:#fff;font-size:10px;font-weight:700}
            .hr .rp{color:rgba(255,255,255,.5);font-size:7px;margin-top:3px}
            .sbar{background:#f1f5f9;border-bottom:2px solid #e2e8f0;padding:5px 18px;display:flex;gap:16px;align-items:center}
            .sv{font-size:11px;font-weight:800;color:#0f766e}
            .sl{font-size:7px;color:#64748b;margin-left:3px}
            .leg{display:flex;gap:10px;margin-left:auto;align-items:center}
            .cs{border-radius:3px;padding:1px 5px;font-size:7px;font-weight:700;display:inline-block}
            .cs.m{background:#7c2d12;color:#fcd34d}
            .cs.t{background:#1e3a8a;color:#93c5fd}
            .cs.n{background:#3b0764;color:#c4b5fd}
            .cls{font-size:7px;color:#64748b;margin-right:4px}
            .wb{background:#fef2f2;border:1px solid #fecaca;border-radius:3px;padding:1px 5px;font-size:7px;color:#dc2626;font-weight:600}
            .pbar{text-align:center;padding:7px}
            table{width:100%;border-collapse:collapse;table-layout:fixed}
            th.hi{background:#01323d;color:#94a3b8;text-align:left;padding:7px 10px;font-size:8px;font-weight:700;border:1px solid #0d4a5a;letter-spacing:.4px}
            th.hc{background:#01323d;color:#64748b;text-align:left;padding:7px 5px;font-size:7px;border:1px solid #0d4a5a}
            th.hd{background:#f1f5f9;color:#475569;font-weight:700;text-align:center;padding:4px 1px;line-height:1.4;border:1px solid #d1d5db}
            th.hw{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
            td{border:1px solid #e9ecef;padding:2px 1px;text-align:center;vertical-align:middle}
            td.cn{text-align:left;padding:5px 10px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;border-right:2px solid #d1d5db}
            td.cc{text-align:left;padding:5px 5px;color:#94a3b8}
            td.co{background:#f0fdf4!important}
            td.cw{background:#fef9f9!important}
            td.co.cw{background:#fef5f0!important}
            .ci{display:flex;flex-direction:column;gap:1px;align-items:center}
            .chip{border-radius:3px;padding:0 3px;font-weight:700;line-height:1.7;white-space:nowrap;display:block}
            .chip.m{background:#7c2d12;color:#fcd34d}
            .chip.t{background:#1e3a8a;color:#93c5fd}
            .chip.n{background:#3b0764;color:#c4b5fd}
            @media print{.pbar{display:none}}
          </style></head><body>
          <div class="header">
            <div class="hl"><div class="brand">UTILIZATION REPORT</div><div class="co">${COMPANY_LEGAL_NAME}</div></div>
            <div class="hr"><div class="rn">${fmtBR2(utilFrom)} &rarr; ${fmtBR2(utilTo)}</div><div class="rp">${n} dia${n!==1?"s":""} &nbsp;·&nbsp; ${instrDataFiltrado.length} instrutor${instrDataFiltrado.length!==1?"es":""} &nbsp;·&nbsp; ${occupied} com aulas</div></div>
          </div>
          <div class="sbar">
            <span class="sv">${instrDataFiltrado.length}</span><span class="sl">instrutores</span>
            <span class="sv">${occupied}</span><span class="sl">com aulas no período</span>
            <span class="sv">${instrDataFiltrado.length-occupied}</span><span class="sl">sem programação</span>
            <span class="sv">${n}</span><span class="sl">dias</span>
            <div class="leg">
              <span class="cs m">TREIN</span><span class="cls"> Manhã</span>
              <span class="cs t">TREIN</span><span class="cls"> Tarde</span>
              <span class="cs n">TREIN</span><span class="cls"> Noite</span>
              <span class="wb">FDS</span><span class="cls"> fim de semana</span>
            </div>
          </div>
          <div class="pbar"><button onclick="window.print()" style="padding:5px 20px;background:#01323d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700">🖨 Imprimir / Salvar PDF</button></div>
          <table><colgroup>${colgroup}</colgroup>
          <thead><tr><th class="hi">INSTRUTOR</th><th class="hc">CONTRATO</th>${dateHdrs}</tr></thead>
          <tbody>${bodyRows}</tbody></table>
          </body></html>`);
          w.document.close();
        };

        const colW = dates.length > 45 ? 24 : dates.length > 30 ? 28 : dates.length > 15 ? 34 : 46;

        return (
          <div style={{ background:"#073d4a", borderRadius:16, padding:24, border:"1px solid #154753" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center", marginBottom:16 }}>
              <h3 style={{ color:"#fff", fontWeight:700, margin:0, fontSize:15 }}>📈 UTILIZATION</h3>
              <div style={{ display:"flex", gap:8, marginLeft:"auto" }}>
                <button onClick={printUtil2} style={{ background:"#154753", border:"1px solid #1e6a7a", borderRadius:8, padding:"7px 14px", color:"#e2e8f0", fontSize:12, fontWeight:600, cursor:"pointer" }}>🖨 PDF</button>
                <button onClick={exportExcel} style={{ background:"#14532d", border:"1px solid #15803d", borderRadius:8, padding:"7px 14px", color:"#86efac", fontSize:12, fontWeight:600, cursor:"pointer" }}>📊 Excel</button>
              </div>
            </div>

            <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"flex-end", marginBottom:14, background:"#01323d", borderRadius:10, padding:"12px 16px", border:"1px solid #154753" }}>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>DE</label>
                <input type="date" value={utilFrom} onChange={e=>setUtilFrom(e.target.value)}
                  style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:8, padding:"6px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
              </div>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>ATÉ</label>
                <input type="date" value={utilTo} onChange={e=>setUtilTo(e.target.value)}
                  style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:8, padding:"6px 10px", color:"#e2e8f0", fontSize:13, outline:"none" }} />
              </div>
              <div style={{ width:1, height:32, background:"#154753", alignSelf:"center" }} />
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>INSTRUTOR</label>
                <select value={utilSelInstr} onChange={e=>setUtilSelInstr(e.target.value)}
                  style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:8, padding:"6px 10px", color:"#e2e8f0", fontSize:13, outline:"none", minWidth:180 }}>
                  <option value="">Todos</option>
                  {instructors.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(i=>(
                    <option key={i.id} value={String(i.id)}>{i.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ width:1, height:32, background:"#154753", alignSelf:"center" }} />
              <div style={{ display:"flex", gap:6, alignItems:"flex-end", flexWrap:"wrap" }}>
                <div>
                  <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:3, fontWeight:600 }}>BUSCA</label>
                  <input placeholder="🔍 Nome..." value={busca} onChange={e=>setBusca(e.target.value)}
                    style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:8, padding:"6px 10px", color:"#e2e8f0", fontSize:13, outline:"none", width:130 }} />
                </div>
                {[
                  ["CLT",somenteCLT,setSomenteCLT],
                  ["CLT OFFSHORE",somenteCLTOFFSHORE,setSomenteCLTOFFSHORE],
                  ["FREELANCER",somenteFreelancer,setSomenteFreelancer],
                  ["SÓ UTILIZADOS", utilAtivos, v => { setUtilAtivos(v); if(v) setUtilLivres(false); }],
                  ["SÓ LIVRES", utilLivres, v => { setUtilLivres(v); if(v) setUtilAtivos(false); }],
                ].map(([lbl,val,set])=>(
                  <button key={lbl} onClick={()=>set(v=>!v)}
                    style={{ padding:"6px 11px", borderRadius:8, border:`1px solid ${val?"#ffa619":"#154753"}`,
                      background:val?"#ffa61920":"transparent", color:val?"#ffa619":"#64748b",
                      fontSize:11, fontWeight:600, cursor:"pointer", alignSelf:"flex-end" }}>{lbl}</button>
                ))}
              </div>
              <div style={{ marginLeft:"auto", textAlign:"right", alignSelf:"center" }}>
                <div style={{ color:"#64748b", fontSize:11 }}>{dates.length} dia{dates.length!==1?"s":""} · {listaFilt.length} instrutor{listaFilt.length!==1?"es":""}</div>
                <div style={{ color:"#94a3b8", fontSize:10, marginTop:2 }}>{totalAtivos} com aulas no período</div>
              </div>
            </div>

            <div style={{ display:"flex", gap:12, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
              {[["#7c2d12","#fcd34d","☀️ Manhã"],["#1e3a8a","#93c5fd","🌤 Tarde"],["#3b0764","#c4b5fd","🌙 Noite"]].map(([bg,c,lbl])=>(
                <div key={lbl} style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{ background:bg, color:c, borderRadius:4, padding:"1px 8px", fontWeight:700, fontSize:10, lineHeight:1.6 }}>TREIN</span>
                  <span style={{ color:"#64748b", fontSize:11 }}>{lbl}</span>
                </div>
              ))}
              <span style={{ color:"#475569", fontSize:11 }}>· fundo vermelho = fim de semana</span>
              {dates.length >= 90 && <span style={{ color:"#f59e0b", fontSize:11 }}>⚠ Máximo 90 dias</span>}
            </div>

            {dates.length === 0 ? (
              <p style={{ color:"#ef4444", textAlign:"center", padding:24 }}>Período inválido — DE deve ser anterior a ATÉ.</p>
            ) : listaFilt.length === 0 ? (
              <p style={{ color:"#64748b", textAlign:"center", padding:24 }}>Nenhum instrutor encontrado para os filtros selecionados.</p>
            ) : (
              <div style={{ overflowX:"auto", borderRadius:10, border:"1px solid #154753" }}>
                <table style={{ borderCollapse:"collapse", tableLayout:"fixed", minWidth: 310 + dates.length*colW }}>
                  <colgroup>
                    <col style={{ width:200 }} />
                    <col style={{ width:110 }} />
                    {dates.map(d=><col key={d} style={{ width:colW }} />)}
                  </colgroup>
                  <thead>
                    <tr style={{ background:"#01323d" }}>
                      <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:12, fontWeight:700, textAlign:"left", border:"1px solid #154753", position:"sticky", left:0, background:"#01323d", zIndex:2 }}>INSTRUTOR</th>
                      <th style={{ padding:"8px", color:"#64748b", fontSize:11, fontWeight:600, textAlign:"left", border:"1px solid #154753" }}>CONTRATO</th>
                      {dates.map(d=>{
                        const dd=new Date(d+"T12:00:00"); const wd=WD_LONG[dd.getDay()]; const isW=dd.getDay()===0||dd.getDay()===6;
                        return (
                          <th key={d} style={{ padding:"4px 2px", color:isW?"#f87171":"#64748b", fontSize:9, fontWeight:700, textAlign:"center", border:"1px solid #154753", background:isW?"#1a0808":"#01323d", lineHeight:1.4 }}>
                            {fmtDD(d)}<br/><span style={{ fontSize:7, opacity:0.7 }}>{wd}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {instrDataFiltrado.map(({instr, dayOccs, total}, ri)=>(
                      <tr key={instr.id} style={{ background:ri%2===0?"#073d4a":"#052f3a" }}>
                        <td style={{ padding:"7px 12px", border:"1px solid #154753", color:"#e2e8f0", fontWeight:600, fontSize:12, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", position:"sticky", left:0, background:ri%2===0?"#073d4a":"#052f3a", zIndex:1 }}>{instr.name}</td>
                        <td style={{ padding:"6px 8px", border:"1px solid #154753", color:"#64748b", fontSize:10 }}>{instr.contract||"—"}</td>
                        {dayOccs.map((occ, di)=>{
                          const dow=new Date(dates[di]+"T12:00:00").getDay(); const wknd=dow===0||dow===6;
                          const active=occ.manha.length||occ.tarde.length||occ.noite.length;
                          return (
                            <td key={dates[di]}
                              style={{ padding:"2px 2px", border:"1px solid #154753", textAlign:"center", verticalAlign:"middle",
                                background:wknd?"#160e0e":active?"#0d2e14":undefined }}>
                              <div style={{ display:"flex", flexDirection:"column", gap:1, alignItems:"center" }}>
                                {occ.manha.map((lbl,i)=><span key={i} style={{ background:"#7c2d12", color:"#fcd34d", borderRadius:3, padding:"0 3px", fontSize:7, fontWeight:700, lineHeight:1.6, whiteSpace:"nowrap" }}>{lbl}</span>)}
                                {occ.tarde.map((lbl,i)=><span key={i} style={{ background:"#1e3a8a", color:"#93c5fd", borderRadius:3, padding:"0 3px", fontSize:7, fontWeight:700, lineHeight:1.6, whiteSpace:"nowrap" }}>{lbl}</span>)}
                                {occ.noite.map((lbl,i)=><span key={i} style={{ background:"#3b0764", color:"#c4b5fd", borderRadius:3, padding:"0 3px", fontSize:7, fontWeight:700, lineHeight:1.6, whiteSpace:"nowrap" }}>{lbl}</span>)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ABA: RELATÓRIOS FINANCEIROS ── */}
      {tab === "financeiro" && (() => {
        const finSelInstr = (instructors||[]).find(i => String(i.id)===String(finInstrId));
        const finAulas = finInstrId
          ? (schedules||[]).filter(s => String(s.instructorId)===String(finInstrId) && s.date>=finFrom && s.date<=finTo)
              .sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime))
          : [];
        const finAulasPorDia = {};
        finAulas.forEach(s => { (finAulasPorDia[s.date]=finAulasPorDia[s.date]||[]).push(s); });
        const finDias = Object.keys(finAulasPorDia).sort();
        const fmtD = d => new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
        const fmtWd = d => { const w=new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long"}); return w.charAt(0).toUpperCase()+w.slice(1); };
        return (
          <div>
            <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap", alignItems:"flex-end" }}>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:4, fontWeight:600 }}>INSTRUTOR</label>
                <select value={finInstrId} onChange={e => setFinInstrId(e.target.value)}
                  style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:10, padding:"10px 14px", color:finInstrId?"#e2e8f0":"#64748b", fontSize:14, outline:"none", minWidth:240 }}>
                  <option value="">Selecione um instrutor...</option>
                  {[...(instructors||[])].sort((a,b)=>a.name.localeCompare(b.name)).map(i => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:4, fontWeight:600 }}>DE</label>
                <input type="date" value={finFrom} onChange={e => setFinFrom(e.target.value)}
                  style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:10, padding:"10px 14px", color:"#e2e8f0", fontSize:14, outline:"none" }} />
              </div>
              <div>
                <label style={{ color:"#94a3b8", fontSize:11, display:"block", marginBottom:4, fontWeight:600 }}>ATÉ</label>
                <input type="date" value={finTo} onChange={e => setFinTo(e.target.value)}
                  style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:10, padding:"10px 14px", color:"#e2e8f0", fontSize:14, outline:"none" }} />
              </div>
              {finSelInstr && (
                <div style={{ padding:"10px 16px", background:"#01323d", borderRadius:10, border:"1px solid #154753" }}>
                  <span style={{ color:"#06b6d4", fontSize:13, fontWeight:700 }}>{finDias.length}</span>
                  <span style={{ color:"#64748b", fontSize:12 }}> dia{finDias.length!==1?"s":""} · </span>
                  <span style={{ color:"#06b6d4", fontSize:13, fontWeight:700 }}>{finAulas.length}</span>
                  <span style={{ color:"#64748b", fontSize:12 }}> aula{finAulas.length!==1?"s":""}</span>
                </div>
              )}
              <button onClick={() => finSelInstr && generateRelFreePDF(finSelInstr, finAulas, finFrom, finTo)}
                disabled={!finInstrId||finAulas.length===0}
                style={{ background:finInstrId&&finAulas.length>0?"#ffa619":"#154753", border:"none", borderRadius:8,
                  padding:"10px 18px", color:finInstrId&&finAulas.length>0?"#000":"#64748b",
                  fontSize:13, fontWeight:700, cursor:finInstrId&&finAulas.length>0?"pointer":"not-allowed", alignSelf:"flex-end" }}>
                🖨 PDF
              </button>
            </div>

            {!finInstrId ? (
              <div style={{ background:"#073d4a", borderRadius:16, padding:48, border:"1px solid #154753", textAlign:"center" }}>
                <p style={{ color:"#64748b", fontSize:15 }}>Selecione um instrutor para visualizar o relatório financeiro.</p>
              </div>
            ) : finAulas.length===0 ? (
              <div style={{ background:"#073d4a", borderRadius:16, padding:48, border:"1px solid #154753", textAlign:"center" }}>
                <p style={{ color:"#64748b", fontSize:15 }}>Nenhum dia trabalhado no período selecionado.</p>
              </div>
            ) : (
              <div style={{ background:"#073d4a", borderRadius:16, padding:0, border:"1px solid #154753", overflow:"hidden" }}>
                {finSelInstr && (
                  <div style={{ padding:"12px 16px", borderBottom:"1px solid #154753", display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ color:"#64748b", fontSize:11 }}>Instrutor:</span>
                    <span style={{ color:"#e2e8f0", fontSize:13, fontWeight:700 }}>{finSelInstr.name}</span>
                    {finSelInstr.contract && <span style={{ background:"#01323d", border:"1px solid #154753", borderRadius:10, padding:"2px 10px", fontSize:11, color:"#94a3b8" }}>{finSelInstr.contract}</span>}
                    {(finSelInstr.theoryRate||finSelInstr.practiceRate||finSelInstr.translationRate) && (
                      <span style={{ background:"#01323d", border:"1px solid #154753", borderRadius:10, padding:"2px 10px", fontSize:11, color:"#06b6d4" }}>
                        {finSelInstr.theoryRate?`Teoria: R$ ${Number(finSelInstr.theoryRate).toFixed(2)}`:""}
                        {finSelInstr.theoryRate&&(finSelInstr.practiceRate||finSelInstr.translationRate)?" · ":""}
                        {finSelInstr.practiceRate?`Prática: R$ ${Number(finSelInstr.practiceRate).toFixed(2)}`:""}
                        {finSelInstr.practiceRate&&finSelInstr.translationRate?" · ":""}
                        {finSelInstr.translationRate?`Tradução: R$ ${Number(finSelInstr.translationRate).toFixed(2)}`:""}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", minWidth:800 }}>
                    <thead>
                      <tr style={{ background:"#01323d" }}>
                        {["DATA","DIA","TREINAMENTO","TURMA","MÓDULO"].map(h=>(
                          <th key={h} style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>{h}</th>
                        ))}
                        {["HORÁRIO","FUNÇÃO"].map(h=>(
                          <th key={h} style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"center", border:"1px solid #154753", letterSpacing:0.4 }}>{h}</th>
                        ))}
                        <th style={{ padding:"10px 12px", color:"#94a3b8", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #154753", letterSpacing:0.4 }}>LOCAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finDias.map((d,ri) => {
                        const aulas=finAulasPorDia[d]||[];
                        const rowBg=ri%2===0?"#073d4a":"#063540";
                        return aulas.map((s,j) => {
                          const isFirst=j===0;
                          const roleLabel=ROLE_PT[s.role]||s.role||"—";
                          const roleColor=ROLE_BADGE[s.role]||"#06b6d4";
                          return (
                            <tr key={`${d}-${s.id||j}`} style={{ background:rowBg }}>
                              {isFirst&&<td rowSpan={aulas.length} style={{ padding:"8px 12px", border:"1px solid #154753", color:"#e2e8f0", fontWeight:700, fontSize:12, whiteSpace:"nowrap", background:"#ffa61915", verticalAlign:"middle", textAlign:"center" }}>{fmtD(d)}</td>}
                              {isFirst&&<td rowSpan={aulas.length} style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11, whiteSpace:"nowrap", background:"#ffa61908", verticalAlign:"middle", textAlign:"center" }}>{fmtWd(d)}</td>}
                              <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#e2e8f0", fontSize:12 }}>{s.trainingName||"—"}</td>
                              <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11 }}>{s.className||"—"}</td>
                              <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11 }}>{s.module||"—"}</td>
                              <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11, fontFamily:"Consolas,monospace", textAlign:"center", whiteSpace:"nowrap" }}>{s.startTime} – {s.endTime}</td>
                              <td style={{ padding:"8px 12px", border:"1px solid #154753", textAlign:"center" }}>
                                <span style={{ background:roleColor+"20", color:roleColor, padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{roleLabel}</span>
                              </td>
                              <td style={{ padding:"8px 12px", border:"1px solid #154753", color:"#94a3b8", fontSize:11 }}>{s.local||"—"}</td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:"#01323d" }}>
                        <td colSpan={8} style={{ padding:"10px 14px", border:"1px solid #154753", color:"#ffa619", fontWeight:800, fontSize:12 }}>
                          TOTAL: {finDias.length} dia{finDias.length!==1?"s":""} trabalhado{finDias.length!==1?"s":""} · {finAulas.length} aula{finAulas.length!==1?"s":""}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}


    </div>
  );
};

