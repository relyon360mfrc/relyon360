// ── OFFSHORE CLIENTS & UNITS ──────────────────────────────────────────────────
// Gerenciamento de clientes offshore (operadoras / empresas) e suas unidades
// (plataformas, embarcações, instalações). Admin-only.
// Estrutura:
//   relyon_offshore_clients: [{ id, name, cnpj, contact, active }]
//   relyon_offshore_units:   [{ id, clientId, name, type, location }]

const OFFSHORE_UNIT_TYPES = [
  { v: "plataforma",   l: "Plataforma" },
  { v: "embarcacao",   l: "Embarcação" },
  { v: "instalacao",   l: "Instalação" },
  { v: "outro",        l: "Outro" },
];

function OffshoreClientsPage({ offshoreClients, setOffshoreClients, offshoreUnits, setOffshoreUnits, user }) {
  const [tab,          setTab]          = useState("clients"); // "clients" | "units"
  const [expandedId,   setExpandedId]   = useState(null);
  const [clientForm,   setClientForm]   = useState(null); // null | {} (create) | {...existing} (edit)
  const [unitForm,     setUnitForm]     = useState(null); // null | {} | {...existing}
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: "client"|"unit", id }

  const clients = offshoreClients || [];
  const units   = offshoreUnits   || [];

  const clientUnits = (clientId) => units.filter(u => String(u.clientId) === String(clientId));

  // ── Client CRUD ──
  const saveClient = () => {
    if (!clientForm?.name?.trim()) return;
    if (clientForm.id) {
      setOffshoreClients(prev => prev.map(c => c.id === clientForm.id ? { ...c, ...clientForm } : c));
    } else {
      setOffshoreClients(prev => [...prev, { ...clientForm, id: Date.now(), active: true }]);
    }
    setClientForm(null);
  };
  const deleteClient = (id) => {
    setOffshoreClients(prev => prev.filter(c => c.id !== id));
    setOffshoreUnits(prev => prev.filter(u => String(u.clientId) !== String(id)));
    setDeleteTarget(null);
  };

  // ── Unit CRUD ──
  const saveUnit = () => {
    if (!unitForm?.name?.trim() || !unitForm?.clientId) return;
    if (unitForm.id) {
      setOffshoreUnits(prev => prev.map(u => u.id === unitForm.id ? { ...u, ...unitForm } : u));
    } else {
      setOffshoreUnits(prev => [...prev, { ...unitForm, id: Date.now() }]);
    }
    setUnitForm(null);
  };
  const deleteUnit = (id) => {
    setOffshoreUnits(prev => prev.filter(u => u.id !== id));
    setDeleteTarget(null);
  };

  const isAdmin = canAdmin && canAdmin(user);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ color:"#fff", fontWeight:800, margin:0, fontSize:24 }}>Offshore</h2>
          <p style={{ color:"#64748b", margin:"4px 0 0", fontSize:13 }}>Clientes e unidades para programação offshore</p>
        </div>
        {isAdmin && tab === "clients" && (
          <button onClick={() => setClientForm({ name:"", cnpj:"", contact:"" })}
            style={{ padding:"9px 18px", background:"linear-gradient(135deg,#ffa619,#e8920a)", border:"none", borderRadius:10, color:"#01323d", fontWeight:700, fontSize:14, cursor:"pointer" }}>
            + Novo Cliente
          </button>
        )}
        {isAdmin && tab === "units" && (
          <button onClick={() => setUnitForm({ clientId:"", name:"", type:"plataforma", location:"" })}
            style={{ padding:"9px 18px", background:"linear-gradient(135deg,#ffa619,#e8920a)", border:"none", borderRadius:10, color:"#01323d", fontWeight:700, fontSize:14, cursor:"pointer" }}>
            + Nova Unidade
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:20, borderBottom:"1px solid #154753", paddingBottom:0 }}>
        {[
          { key:"clients", label:`Clientes (${clients.length})` },
          { key:"units",   label:`Unidades (${units.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding:"8px 16px", background:"transparent", border:"none", borderBottom: tab===t.key ? "2px solid #ffa619" : "2px solid transparent", color: tab===t.key ? "#ffa619" : "#64748b", fontWeight: tab===t.key ? 700 : 400, fontSize:14, cursor:"pointer", marginBottom:-1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Clients tab */}
      {tab === "clients" && (
        <div>
          {clients.length === 0 ? (
            <div style={{ textAlign:"center", color:"#475569", padding:"40px 0" }}>Nenhum cliente cadastrado.</div>
          ) : clients.map(c => (
            <div key={c.id} style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:12, marginBottom:10, overflow:"hidden" }}>
              <div style={{ display:"flex", alignItems:"center", padding:"14px 16px", cursor:"pointer", gap:12 }}
                onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ color:"#e2e8f0", fontWeight:700, margin:0, fontSize:15 }}>{c.name}</p>
                  <p style={{ color:"#64748b", fontSize:12, margin:"2px 0 0" }}>
                    {c.cnpj ? `CNPJ: ${c.cnpj} · ` : ""}{clientUnits(c.id).length} unidade(s)
                  </p>
                </div>
                <span style={{ fontSize:12, padding:"2px 8px", borderRadius:10, background: c.active !== false ? "#16a34a15" : "#ef444415", color: c.active !== false ? "#16a34a" : "#ef4444", fontWeight:700, border:`1px solid ${c.active !== false ? "#16a34a30" : "#ef444430"}` }}>
                  {c.active !== false ? "Ativo" : "Inativo"}
                </span>
                <span style={{ color:"#475569", fontSize:16 }}>{expandedId === c.id ? "▲" : "▼"}</span>
              </div>
              {expandedId === c.id && (
                <div style={{ padding:"0 16px 16px", borderTop:"1px solid #154753" }}>
                  {c.contact && <p style={{ color:"#94a3b8", fontSize:12, margin:"10px 0 8px" }}>Contato: {c.contact}</p>}
                  {/* Units of this client */}
                  <div style={{ marginBottom:10 }}>
                    <p style={{ color:"#64748b", fontSize:12, fontWeight:700, margin:"10px 0 6px", textTransform:"uppercase", letterSpacing:0.5 }}>Unidades</p>
                    {clientUnits(c.id).length === 0 ? (
                      <p style={{ color:"#475569", fontSize:12 }}>Nenhuma unidade cadastrada.</p>
                    ) : clientUnits(c.id).map(u => (
                      <div key={u.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"#01323d", borderRadius:8, marginBottom:6 }}>
                        <span style={{ color:"#e2e8f0", fontSize:13, fontWeight:600, flex:1 }}>{u.name}</span>
                        <span style={{ fontSize:10, padding:"1px 6px", borderRadius:6, background:"#154753", color:"#94a3b8" }}>
                          {OFFSHORE_UNIT_TYPES.find(t => t.v === u.type)?.l || u.type}
                        </span>
                        {u.location && <span style={{ color:"#64748b", fontSize:11 }}>📍 {u.location}</span>}
                        {isAdmin && (
                          <>
                            <button onClick={() => setUnitForm({ ...u })}
                              style={{ padding:"3px 10px", borderRadius:6, border:"1px solid #154753", background:"transparent", color:"#94a3b8", fontSize:11, cursor:"pointer" }}>Editar</button>
                            <button onClick={() => setDeleteTarget({ type:"unit", id: u.id })}
                              style={{ padding:"3px 10px", borderRadius:6, border:"1px solid #7f1d1d60", background:"transparent", color:"#ef4444", fontSize:11, cursor:"pointer" }}>Excluir</button>
                          </>
                        )}
                      </div>
                    ))}
                    {isAdmin && (
                      <button onClick={() => setUnitForm({ clientId: c.id, name:"", type:"plataforma", location:"" })}
                        style={{ padding:"5px 12px", borderRadius:8, border:"1px dashed #154753", background:"transparent", color:"#64748b", fontSize:12, cursor:"pointer", marginTop:4 }}>
                        + Adicionar unidade
                      </button>
                    )}
                  </div>
                  {isAdmin && (
                    <div style={{ display:"flex", gap:8, marginTop:8 }}>
                      <button onClick={() => setClientForm({ ...c })}
                        style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #154753", background:"transparent", color:"#94a3b8", fontSize:12, cursor:"pointer" }}>Editar cliente</button>
                      <button onClick={() => setDeleteTarget({ type:"client", id: c.id })}
                        style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #7f1d1d60", background:"transparent", color:"#ef4444", fontSize:12, cursor:"pointer" }}>Excluir</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Units tab — visão global de todas as unidades */}
      {tab === "units" && (
        <div>
          {units.length === 0 ? (
            <div style={{ textAlign:"center", color:"#475569", padding:"40px 0" }}>Nenhuma unidade cadastrada.</div>
          ) : units.map(u => {
            const client = clients.find(c => String(c.id) === String(u.clientId));
            return (
              <div key={u.id} style={{ background:"#073d4a", border:"1px solid #154753", borderRadius:10, padding:"12px 16px", marginBottom:8, display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ color:"#e2e8f0", fontWeight:700, margin:0, fontSize:14 }}>{u.name}</p>
                  <p style={{ color:"#64748b", fontSize:12, margin:"2px 0 0" }}>
                    {client?.name || "—"} · {OFFSHORE_UNIT_TYPES.find(t => t.v === u.type)?.l || u.type}
                    {u.location ? ` · 📍 ${u.location}` : ""}
                  </p>
                </div>
                {isAdmin && (
                  <>
                    <button onClick={() => setUnitForm({ ...u })}
                      style={{ padding:"5px 12px", borderRadius:7, border:"1px solid #154753", background:"transparent", color:"#94a3b8", fontSize:12, cursor:"pointer" }}>Editar</button>
                    <button onClick={() => setDeleteTarget({ type:"unit", id: u.id })}
                      style={{ padding:"5px 12px", borderRadius:7, border:"1px solid #7f1d1d60", background:"transparent", color:"#ef4444", fontSize:12, cursor:"pointer" }}>Excluir</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal cliente */}
      {clientForm && (
        <Modal title={clientForm.id ? "Editar Cliente" : "Novo Cliente Offshore"} onClose={() => setClientForm(null)} width={460}>
          <Input label="Nome do cliente *" value={clientForm.name || ""} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} placeholder="Ex: Petrobras, TotalEnergies..." />
          <Input label="CNPJ (opcional)" value={clientForm.cnpj || ""} onChange={e => setClientForm({ ...clientForm, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
          <Input label="Contato (opcional)" value={clientForm.contact || ""} onChange={e => setClientForm({ ...clientForm, contact: e.target.value })} placeholder="Nome ou e-mail do responsável" />
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <input type="checkbox" id="activeCheck" checked={clientForm.active !== false} onChange={e => setClientForm({ ...clientForm, active: e.target.checked })} style={{ cursor:"pointer" }} />
            <label htmlFor="activeCheck" style={{ color:"#94a3b8", fontSize:13, cursor:"pointer" }}>Cliente ativo</label>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <Btn onClick={saveClient} label={clientForm.id ? "Salvar" : "Criar cliente"} color="#16a34a" />
            <Btn onClick={() => setClientForm(null)} label="Cancelar" color="#154753" />
          </div>
        </Modal>
      )}

      {/* Modal unidade */}
      {unitForm && (
        <Modal title={unitForm.id ? "Editar Unidade" : "Nova Unidade"} onClose={() => setUnitForm(null)} width={460}>
          <Sel label="Cliente *" value={unitForm.clientId || ""} onChange={e => setUnitForm({ ...unitForm, clientId: e.target.value })}
            opts={clients.map(c => ({ v: c.id, l: c.name }))} />
          <Input label="Nome da unidade *" value={unitForm.name || ""} onChange={e => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="Ex: P-58, FPSO Cidade de Mangaratiba..." />
          <Sel label="Tipo" value={unitForm.type || "plataforma"} onChange={e => setUnitForm({ ...unitForm, type: e.target.value })} opts={OFFSHORE_UNIT_TYPES} />
          <Input label="Localização (opcional)" value={unitForm.location || ""} onChange={e => setUnitForm({ ...unitForm, location: e.target.value })} placeholder="Ex: Bacia de Campos, Bloco BM-S-9..." />
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <Btn onClick={saveUnit} label={unitForm.id ? "Salvar" : "Criar unidade"} color="#16a34a" />
            <Btn onClick={() => setUnitForm(null)} label="Cancelar" color="#154753" />
          </div>
        </Modal>
      )}

      {/* Confirm delete */}
      {deleteTarget && (
        <Modal title="Confirmar exclusão" onClose={() => setDeleteTarget(null)} width={400}>
          <p style={{ color:"#94a3b8", fontSize:14, marginBottom:16 }}>
            {deleteTarget.type === "client"
              ? "Excluir este cliente irá remover também todas as suas unidades. Esta ação não pode ser desfeita."
              : "Confirmar exclusão desta unidade?"}
          </p>
          <div style={{ display:"flex", gap:8 }}>
            <Btn onClick={() => deleteTarget.type === "client" ? deleteClient(deleteTarget.id) : deleteUnit(deleteTarget.id)} label="Excluir" color="#ef4444" />
            <Btn onClick={() => setDeleteTarget(null)} label="Cancelar" color="#154753" />
          </div>
        </Modal>
      )}
    </div>
  );
}
