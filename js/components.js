// ── ICON ─────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18, color = "currentColor" }) => {
  const p = {
    dashboard:   <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>,
    calendar:    <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>,
    instructor:  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>,
    training:    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>,
    location:    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>,
    ai:          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 17.93V18a1 1 0 0 0-2 0v1.93A8 8 0 0 1 4.07 13H6a1 1 0 0 0 0-2H4.07A8 8 0 0 1 11 4.07V6a1 1 0 0 0 2 0V4.07A8 8 0 0 1 19.93 11H18a1 1 0 0 0 0 2h1.93A8 8 0 0 1 13 19.93z"/>,
    logout:      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>,
    plus:        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>,
    edit:        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>,
    delete:      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>,
    check:       <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>,
    warning:     <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>,
    search:      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>,
    menu:        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>,
    close:       <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>,
    report:      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>,
    star:        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>,
    back:        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>,
    settings:    <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>,
    module:      <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>{p[name]}</svg>;
};

// ── SHARED COMPONENTS ─────────────────────────────────────────────────────────
const Input = ({ label, value, onChange, type = "text", placeholder, onKeyDown, autoComplete }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>{label}</label>}
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} onKeyDown={onKeyDown}
      autoComplete={autoComplete || (type === "password" ? "new-password" : "off")}
      style={{ width: "100%", padding: "10px 12px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
  </div>
);

const Sel = ({ label, value, onChange, opts, placeholder = "Selecionar..." }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>{label}</label>}
    <select value={value} onChange={onChange}
      style={{ width: "100%", padding: "10px 12px", background: "#01323d", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none" }}>
      <option value="">{placeholder}</option>
      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  </div>
);

const SearchSel = ({ label, value, onChange, opts, placeholder = "Buscar ou selecionar..." }) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const ref = React.useRef(null);
  const listRef = React.useRef(null);
  const selected = opts.find(o => String(o.v) === String(value));
  const filtered = query ? opts.filter(o => (o.keywords || o.l).toLowerCase().includes(query.toLowerCase())) : opts;

  // Reset highlight to 0 whenever filter changes
  React.useEffect(() => { setHi(0); }, [query, open]);

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[hi];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [hi]);

  // Close on outside click
  React.useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(""); } };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = o => { onChange({ target: { value: o.v } }); setOpen(false); setQuery(""); };

  const onKeyDown = e => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[hi]) select(filtered[hi]); }
    else if (e.key === "Escape") { setOpen(false); setQuery(""); }
  };

  return (
    <div style={{ marginBottom: 14, position: "relative" }} ref={ref}>
      {label && <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 6 }}>{label}</label>}
      <div onClick={() => { setOpen(v => !v); setQuery(""); }}
        style={{ width: "100%", padding: "10px 12px", background: "#01323d", border: `1px solid ${open ? "#ffa619" : "#154753"}`, borderRadius: 8, color: selected ? "#e2e8f0" : "#475569", fontSize: 14, cursor: "pointer", boxSizing: "border-box", display: "flex", justifyContent: "space-between", alignItems: "center", userSelect: "none" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{selected ? selected.l : placeholder}</span>
        <span style={{ color: "#475569", fontSize: 10, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200, background: "#073d4a", border: "1px solid #ffa61940", borderRadius: 8, boxShadow: "0 8px 28px #00000070", overflow: "hidden" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #154753" }}>
            <input autoFocus value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              onClick={e => e.stopPropagation()}
              placeholder="Filtrar..."
              style={{ width: "100%", background: "#01323d", border: "1px solid #154753", borderRadius: 6, padding: "7px 10px", color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div ref={listRef} style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0
              ? <p style={{ color: "#475569", fontSize: 13, padding: "10px 14px", margin: 0 }}>Nenhum resultado.</p>
              : filtered.map((o, idx) => {
                const isSelected = String(o.v) === String(value);
                const isHi = idx === hi;
                return (
                  <div key={o.v} onClick={() => select(o)} onMouseEnter={() => setHi(idx)}
                    style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #01323d30",
                      color: isSelected ? "#ffa619" : "#e2e8f0",
                      background: isHi ? "#1e5a6a" : isSelected ? "#ffa61915" : "transparent" }}>
                    {o.l}
                  </div>
                );
              })}
          </div>
          {filtered.length > 0 && <p style={{ color: "#475569", fontSize: 11, padding: "4px 10px 6px", margin: 0 }}>↑↓ navegar · Enter selecionar · Esc fechar</p>}
        </div>
      )}
    </div>
  );
};

const Btn = ({ onClick, label, icon, color = "#ffa619", sm, disabled }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ padding: sm ? "6px 12px" : "10px 20px", background: disabled ? "#154753" : color, border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: sm ? 12 : 14, flexShrink: 0, opacity: disabled ? 0.6 : 1 }}>
    {icon && <Icon name={icon} size={sm ? 14 : 16} color="#fff" />}{label}
  </button>
);

const Modal = ({ title, onClose, children, width = 520 }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
    <div style={{ background: "#073d4a", borderRadius: 20, padding: 32, width: "100%", maxWidth: width, border: "1px solid #154753", maxHeight: "90vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h3 style={{ color: "#fff", margin: 0, fontWeight: 700, fontSize: 18 }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><Icon name="close" size={20} /></button>
      </div>
      {children}
    </div>
  </div>
);

const DeleteGuardModal = ({ guard, setGuard, user }) => {
  if (!guard.show) return null;
  const confirm = () => {
    if (!checkPw(guard.pass, user?.password)) { setGuard({ ...guard, err: "Senha incorreta." }); return; }
    guard.action();
    setGuard({ show: false, action: null, pass: "", err: "" });
  };
  return (
    <Modal title="⚠️ Confirmar Exclusão" onClose={() => setGuard({ show: false, action: null, pass: "", err: "" })} width={400}>
      {guard.archived && (
        <div style={{ background: "#d9780620", border: "1px solid #d9780640", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <p style={{ color: "#fb923c", fontSize: 13, margin: 0 }}>⚠ Esta turma está arquivada (todas as datas já passaram). Você ainda pode excluí-la com sua senha.</p>
        </div>
      )}
      <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>
        Esta ação é <strong style={{ color: "#ef4444" }}>irreversível</strong>. Digite sua senha para confirmar.
      </p>
      <Input label="Senha do Administrador" type="password" value={guard.pass}
        onChange={e => setGuard({ ...guard, pass: e.target.value, err: "" })} placeholder="••••••••" />
      {guard.err && <p style={{ color: "#f87171", fontSize: 13, margin: "-4px 0 12px" }}>{guard.err}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={confirm} label="Confirmar Exclusão" color="#ef4444" icon="delete" />
        <Btn onClick={() => setGuard({ show: false, action: null, pass: "", err: "" })} label="Cancelar" color="#154753" />
      </div>
    </Modal>
  );
};

const ConflictModal = ({ guard, setGuard }) => {
  if (!guard.show) return null;
  const unique = [...new Set(guard.conflicts || [])];
  return (
    <Modal title="⚠️ Conflitos Detectados" onClose={() => setGuard({ show: false, conflicts: [], onConfirm: null })} width={480}>
      <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 12 }}>
        {unique.length} conflito(s) de instrutor ou local foram encontrados:
      </p>
      <div style={{ background: "#01323d", borderRadius: 8, border: "1px solid #ef444440", padding: "10px 14px", marginBottom: 16, maxHeight: 240, overflowY: "auto" }}>
        {unique.slice(0, 10).map((c, i) => (
          <p key={i} style={{ color: "#fca5a5", fontSize: 13, margin: i > 0 ? "6px 0 0" : 0 }}>• {c}</p>
        ))}
        {unique.length > 10 && <p style={{ color: "#64748b", fontSize: 12, margin: "6px 0 0" }}>…e mais {unique.length - 10} conflito(s).</p>}
      </div>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>Deseja salvar mesmo assim?</p>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={() => { guard.onConfirm(); setGuard({ show: false, conflicts: [], onConfirm: null }); }} label="Salvar mesmo assim" color="#d97706" icon="warning" />
        <Btn onClick={() => setGuard({ show: false, conflicts: [], onConfirm: null })} label="Cancelar" color="#154753" />
      </div>
    </Modal>
  );
};

const IssueModal = ({ issue, setIssue, onSubmit }) => {
  if (!issue.show) return null;
  return (
    <Modal title="Relatar Problema" onClose={() => setIssue({ show: false, scheduleId: null, text: "" })} width={480}>
      <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 12 }}>
        Descreva o problema. O responsável será notificado.
      </p>
      <textarea
        value={issue.text}
        onChange={e => setIssue({ ...issue, text: e.target.value })}
        placeholder="Ex: local nao disponivel, instrutor nao compareceu, equipamento com defeito..."
        rows={5}
        maxLength={600}
        style={{ width: "100%", padding: "10px 12px", background: "#073d4a", border: "1px solid #154753", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
      />
      <p style={{ color: "#64748b", fontSize: 11, margin: "4px 0 12px", textAlign: "right" }}>{issue.text.length}/600</p>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={() => { if (issue.text.trim()) { onSubmit(issue.scheduleId, issue.text.trim()); setIssue({ show: false, scheduleId: null, text: "" }); } }} label="Enviar Relato" color="#d97706" icon="warning" disabled={!issue.text.trim()} />
        <Btn onClick={() => setIssue({ show: false, scheduleId: null, text: "" })} label="Cancelar" color="#154753" />
      </div>
    </Modal>
  );
};

const StatCard = ({ label, value, icon, color, sub }) => (
  <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753", flex: 1, minWidth: 140 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 8px" }}>{label}</p>
        <p style={{ color: "#fff", fontSize: 32, fontWeight: 800, margin: 0 }}>{value}</p>
        {sub && <p style={{ color: "#64748b", fontSize: 12, margin: "4px 0 0" }}>{sub}</p>}
      </div>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: color + "20", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={24} color={color} />
      </div>
    </div>
  </div>
);

