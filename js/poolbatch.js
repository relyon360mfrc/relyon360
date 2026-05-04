// ── POOL BATCH PAGE ───────────────────────────────────────────────────────────
// Grade (horário × módulo×turma) derivada dos schedules salvos para o dia.
// Linhas = horários únicos do dia. Colunas = (modLabel × className).
// Ver DESIGN §17.

const simplifyModuleName = name => {
  if (!name) return "";
  if (/ESCAPE|HELY/i.test(name))              return "ESCAPE";
  if (/SEA\s*SURVIVAL|SOBREVIV/i.test(name))  return "SOBREVIVÊNCIA";
  if (/CAEBS|SHALLOW/i.test(name))            return "CAEBS";
  return name;
};

const getModLabel = (modName, local) => {
  const simplified = simplifyModuleName(modName);
  const m = (local || "").match(/M[OÓ]DULO\s*(\d+)/i);
  return m ? `${simplified} - M${m[1]}` : simplified;
};

const PoolBatchPage = ({ schedules, setSchedules, trainings, instructors, areas, holidays, absences, user, setActive, scheduleTabs, setScheduleTabs, setActiveTabId }) => {
  const todayIso = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(() => {
    try { const s = sessionStorage.getItem("rl360_pool_batch_date"); return s || todayIso; }
    catch { return todayIso; }
  });
  React.useEffect(() => { try { sessionStorage.setItem("rl360_pool_batch_date", date); } catch {} }, [date]);

  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState({ trainingId: "", startTime: "08:00", studentCount: "", withTranslator: false });
  const [columnOrder, setColumnOrder] = useState([]);
  const [dragColKey, setDragColKey]   = useState(null);
  const [hoverColKey, setHoverColKey] = useState(null);

  // ── DATA ────────────────────────────────────────────────────────────────────
  const poolTrainings    = (trainings || []).filter(t => t.poolBatch);
  const poolTrainingIds  = new Set(poolTrainings.map(t => String(t.id)));
  const dayRows          = (schedules || []).filter(s => s.date === date && poolTrainingIds.has(String(s.trainingId)));

  // Colunas: pares únicos (modLabel × className), ordenados
  const rawCols = (() => {
    const map = new Map();
    dayRows.forEach(r => {
      const label = getModLabel(r.module, r.local);
      const key   = `${label}|${r.className}`;
      if (!map.has(key)) map.set(key, { label, className: r.className, key });
    });
    return [...map.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR") || a.className.localeCompare(b.className, "pt-BR")
    );
  })();

  const colPairs = columnOrder.length > 0
    ? [
        ...columnOrder.filter(k => rawCols.find(c => c.key === k)).map(k => rawCols.find(c => c.key === k)),
        ...rawCols.filter(c => !columnOrder.includes(c.key))
      ]
    : rawCols;

  // Linhas: horários únicos, ordenados
  const rowTimes = [...new Set(dayRows.map(r => r.startTime))].sort();

  // Dados de uma célula: leads (TEORIA) e todos os instrutores
  const getCellData = (label, className, startTime) => {
    const rows = dayRows.filter(r =>
      getModLabel(r.module, r.local) === label &&
      r.className === className &&
      r.startTime === startTime
    );
    if (!rows.length) return null;
    const seen = new Set();
    const leads = [], others = [];
    rows.forEach(r => {
      const uid = r.instructorId || r.instructorName;
      if (!uid || seen.has(uid)) return;
      seen.add(uid);
      const instr = (instructors || []).find(i => +i.id === +r.instructorId);
      const name  = shortName(instr?.name || r.instructorName || "");
      if (r.role === "Lead Instructor") leads.push(name);
      else others.push(name);
    });
    return { leads, all: [...leads, ...others] };
  };

  // ── COLUMN DRAG ─────────────────────────────────────────────────────────────
  const onColDragStart = (e, key) => {
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", key); } catch {}
    setDragColKey(key);
  };
  const onColDrop = (e, targetKey) => {
    e.preventDefault();
    if (!dragColKey || dragColKey === targetKey) { setDragColKey(null); setHoverColKey(null); return; }
    const keys = colPairs.map(c => c.key);
    const from = keys.indexOf(dragColKey), to = keys.indexOf(targetKey);
    if (from < 0 || to < 0)               { setDragColKey(null); setHoverColKey(null); return; }
    const arr = [...keys];
    const [item] = arr.splice(from, 1); arr.splice(to, 0, item);
    setColumnOrder(arr);
    setDragColKey(null);
    setHoverColKey(null);
  };

  // ── PDF EXPORT ──────────────────────────────────────────────────────────────
  const printPDF = () => {
    if (!rowTimes.length) { alert("Nenhuma turma neste dia."); return; }
    const dlabel = (() => {
      try { return new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); }
      catch { return date; }
    })();
    const stripe = "background:repeating-linear-gradient(45deg,#f5f5f5 0,#f5f5f5 4px,#ffffff 4px,#ffffff 8px);";
    const colHeaders = colPairs.map(col =>
      `<th style="border:1px solid #bbb;padding:7px 6px;background:#01323d;color:#fff;font-size:11px;min-width:110px;text-align:center;">
        <div style="font-weight:800;font-size:12px;color:#ffa619;">${col.label}</div>
        <div style="font-size:10px;color:#06b6d4;margin-top:2px;">${col.className}</div>
      </th>`
    ).join("");
    const bodyRows = rowTimes.map(t => {
      const cells = colPairs.map(col => {
        const data = getCellData(col.label, col.className, t);
        if (!data) return `<td style="border:1px solid #bbb;${stripe}"></td>`;
        const teoriaRow = data.leads.length
          ? `<div style="font-size:10px;margin-bottom:3px;"><span style="color:#c45f00;font-weight:800;">TEORIA</span>&nbsp;${data.leads.join(" // ")}</div>`
          : "";
        const slotRows = data.all.map((name, i) =>
          `<div style="font-size:10px;"><span style="color:#888;font-weight:700;">${i + 1}&nbsp;</span>${name}</div>`
        ).join("");
        return `<td style="border:1px solid #bbb;padding:6px 7px;vertical-align:top;background:#fff;">${teoriaRow}${slotRows}</td>`;
      }).join("");
      return `<tr><td style="border:1px solid #bbb;padding:7px 10px;font-weight:700;font-size:12px;background:#f0f0f0;white-space:nowrap;">${t}</td>${cells}</tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Lote Piscina — ${date}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body  { font-family: Arial, sans-serif; font-size: 12px; margin: 0; }
  table { border-collapse: collapse; width: 100%; }
  h2    { margin: 0 0 2px; font-size: 16px; }
  p     { margin: 0 0 10px; color: #555; font-size: 12px; text-transform: capitalize; }
  #printBtn { margin-bottom: 10px; }
  @media print { #printBtn { display: none; } }
</style></head><body>
<div id="printBtn">
  <button onclick="window.print()" style="padding:7px 16px;background:#06b6d4;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:13px;">🖨 Imprimir / Salvar PDF</button>
</div>
<h2>Lote Piscina</h2>
<p>${dlabel}</p>
<table>
  <thead><tr>
    <th style="border:1px solid #bbb;padding:8px 10px;background:#01323d;color:#fff;font-size:11px;text-align:left;white-space:nowrap;">HORÁRIO</th>
    ${colHeaders}
  </tr></thead>
  <tbody>${bodyRows}</tbody>
</table>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("Popup bloqueado — libere popups para este site."); return; }
    win.document.write(html);
    win.document.close();
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  if (!canPlan(user)) {
    return <div style={{ color: "#94a3b8", padding: 32 }}>Acesso restrito a planejadores.</div>;
  }

  const dateLabel = (() => {
    try { return new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); }
    catch { return date; }
  })();

  const handleAddSubmit = () => {
    if (!addForm.trainingId) { alert("Selecione um treinamento."); return; }
    if (!addForm.startTime)  { alert("Defina o horário de início."); return; }
    if (date < todayIso) { alert("Não é possível criar uma programação no passado."); return; }
    if ((scheduleTabs || []).length >= 5) { alert("Limite de 5 abas atingido na Programação. Feche uma aba para abrir outra."); return; }
    const id = Date.now();
    const newTab = {
      id, title: "Nova Turma (Lote)", step: 1,
      wizForm: {
        trainingId: addForm.trainingId, className: "", date,
        startTime: addForm.startTime, studentCount: addForm.studentCount,
        observation: "", withTranslator: !!addForm.withTranslator, modeId: "",
      },
      planItems: [], editCls: null, editStudentCount: "", editObservation: "", editItems: []
    };
    setScheduleTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    setActive("schedule");
  };

  return (
    <div>
      {/* ── Cabeçalho ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#fff", fontWeight: 800, margin: 0, fontSize: 24 }}>🏊 Lote Piscina</h2>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>Grade paralela de turmas — horários × módulos</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ padding: "8px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 10, color: "#e2e8f0", fontSize: 14, outline: "none" }} />
          <button onClick={() => setDate(new Date(new Date(date + "T12:00:00").getTime() - 86400000).toISOString().split("T")[0])}
            style={{ padding: "8px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 10, color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>◀</button>
          <button onClick={() => setDate(todayIso)}
            style={{ padding: "8px 14px", background: date === todayIso ? "#06b6d4" : "#073d4a", border: "1px solid #154753", borderRadius: 10, color: date === todayIso ? "#fff" : "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Hoje</button>
          <button onClick={() => setDate(new Date(new Date(date + "T12:00:00").getTime() + 86400000).toISOString().split("T")[0])}
            style={{ padding: "8px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 10, color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>▶</button>
          {rowTimes.length > 0 && (
            <button onClick={printPDF}
              style={{ padding: "8px 14px", background: "#073d4a", border: "1px solid #154753", borderRadius: 10, color: "#06b6d4", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🖨 PDF</button>
          )}
          {hasPermission(user, "plan_edit") && (
            <button onClick={() => setShowAdd(true)}
              style={{ padding: "8px 16px", background: "linear-gradient(135deg,#06b6d4,#0891b2)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Nova turma</button>
          )}
        </div>
      </div>

      <p style={{ color: "#06b6d4", fontSize: 13, margin: "0 0 16px", textTransform: "capitalize" }}>{dateLabel}</p>

      {/* ── Aviso: nenhum treinamento pool ── */}
      {poolTrainings.length === 0 && (
        <div style={{ background: "#073d4a", border: "1px solid #154753", borderRadius: 12, padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
          Nenhum treinamento marcado como <strong style={{ color: "#06b6d4" }}>Lote Piscina</strong>.<br />
          Vá em <strong>Treinamentos</strong> e ative a flag em THUET, THUET+CAEBS e CAEBS Shallow Water.
        </div>
      )}

      {/* ── Aviso: dia vazio ── */}
      {poolTrainings.length > 0 && colPairs.length === 0 && (
        <div style={{ background: "#073d4a", border: "1px solid #154753", borderRadius: 12, padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
          Nenhuma turma de piscina neste dia. Clique em <strong style={{ color: "#06b6d4" }}>+ Nova turma</strong> para começar.
        </div>
      )}

      {/* ── Grade ── */}
      {colPairs.length > 0 && (
        <div style={{ overflowX: "auto", background: "#073d4a", border: "1px solid #154753", borderRadius: 12 }}>
          <table style={{ borderCollapse: "collapse", minWidth: 100 + colPairs.length * 150 }}>
            <thead>
              <tr>
                <th style={{
                  padding: "10px 14px", textAlign: "left", color: "#64748b", fontSize: 11,
                  letterSpacing: 1, textTransform: "uppercase", borderBottom: "2px solid #154753",
                  background: "#01323d", position: "sticky", left: 0, zIndex: 2, minWidth: 70
                }}>HORÁRIO</th>
                {colPairs.map(col => (
                  <th key={col.key}
                    draggable
                    onDragStart={e => onColDragStart(e, col.key)}
                    onDragOver={e => { e.preventDefault(); setHoverColKey(col.key); }}
                    onDragLeave={() => setHoverColKey(null)}
                    onDrop={e => onColDrop(e, col.key)}
                    style={{
                      padding: "10px 10px", textAlign: "center",
                      borderBottom: "2px solid #154753", borderLeft: "1px solid #154753",
                      background: hoverColKey === col.key ? "#0e3a45" : "#01323d",
                      cursor: "grab", minWidth: 140, transition: "background 0.15s"
                    }}>
                    <div style={{ color: "#ffa619", fontWeight: 800, fontSize: 12 }}>{col.label}</div>
                    <div style={{ color: "#06b6d4", fontSize: 11, marginTop: 3, fontWeight: 600 }}>{col.className}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowTimes.map(t => (
                <tr key={t}>
                  <td style={{
                    padding: "10px 14px", color: "#fff", fontWeight: 700, fontSize: 12,
                    borderTop: "1px solid #154753", background: "#01323d",
                    position: "sticky", left: 0, zIndex: 1, whiteSpace: "nowrap"
                  }}>{t}</td>
                  {colPairs.map(col => {
                    const data = getCellData(col.label, col.className, t);
                    if (!data) {
                      return (
                        <td key={col.key} style={{
                          borderTop: "1px solid #154753", borderLeft: "1px solid #154753",
                          background: "repeating-linear-gradient(45deg,#01222a 0,#01222a 4px,#073d4a 4px,#073d4a 8px)",
                          minWidth: 140
                        }} />
                      );
                    }
                    return (
                      <td key={col.key} style={{
                        padding: "8px 10px", borderTop: "1px solid #154753",
                        borderLeft: "1px solid #154753", verticalAlign: "top",
                        background: "#0b3040", minWidth: 140
                      }}>
                        {data.leads.length > 0 && (
                          <div style={{ marginBottom: 4, lineHeight: 1.5 }}>
                            <span style={{ color: "#ffa619", fontWeight: 800, fontSize: 9, textTransform: "uppercase", marginRight: 4 }}>TEORIA</span>
                            <span style={{ color: "#e2e8f0", fontSize: 11 }}>{data.leads.join(" // ")}</span>
                          </div>
                        )}
                        {data.all.map((name, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 5, lineHeight: 1.5 }}>
                            <span style={{ color: "#64748b", fontWeight: 700, fontSize: 9, minWidth: 12 }}>{i + 1}</span>
                            <span style={{ color: "#e2e8f0", fontSize: 11 }}>{name}</span>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {colPairs.length > 0 && (
        <p style={{ color: "#1e4a56", fontSize: 11, marginTop: 10 }}>
          Arraste o cabeçalho da coluna para reordenar · TEORIA = instrutores líderes
        </p>
      )}

      {/* ── Modal: Nova turma ── */}
      {showAdd && (
        <Modal title="Nova turma de piscina" onClose={() => setShowAdd(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Treinamento</label>
              <select value={addForm.trainingId} onChange={e => setAddForm(f => ({ ...f, trainingId: e.target.value }))}
                style={{ width: "100%", padding: 10, background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14 }}>
                <option value="">— Selecione —</option>
                {poolTrainings.map(t => <option key={t.id} value={t.id}>{t.shortName || t.gcc} — {t.name}</option>)}
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
    </div>
  );
};
