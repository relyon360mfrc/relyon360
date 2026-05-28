// ── INSTRUCTOR DASHBOARD (7.10.1) ────────────────────────────────────────────
// ── TRUNCATED TEXT WITH EXPAND BUTTON ────────────────────────────────────────
const TruncText = ({ text, maxLen, textStyle }) => {
  const [expanded, setExpanded] = React.useState(false);
  if (!text) return <span style={{ color: "#64748b" }}>—</span>;
  const needs = text.length > maxLen;
  return (
    <span>
      <span style={textStyle}>{expanded || !needs ? text : text.slice(0, maxLen) + "…"}</span>
      {needs && (
        <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          style={{ marginLeft: 3, padding: "0 5px", background: "#154753", border: "none",
            borderRadius: 4, color: "#ffa619", fontSize: 9, cursor: "pointer",
            lineHeight: "1.8", verticalAlign: "middle" }}>
          {expanded ? "▲" : "+"}
        </button>
      )}
    </span>
  );
};

// ── INSTRUCTOR SCHEDULE CARD ──────────────────────────────
// Definido fora do InstructorDashboard para evitar remount (ver CLAUDE.md)
// Refator 2026-05-18 (DESIGN §18.3): compacto + expandido inline; botão
// "Confirmar ciência" vive DENTRO do expandido para forçar leitura antes do aceite.
const InstructorScheduleCard = ({ s, schedules, trainings, user, onConfirm, onReport, dayCtx, showDate }) => {
  const [expanded, setExpanded] = React.useState(false);
  const isConfirmed = s.status === "Confirmado";

  // Equipe completa: TODOS os instrutores deste módulo/turma/dia (inclusive o próprio).
  // Dedup por instructorId+role para não duplicar quando há rows duplicadas no LS
  // (ver memory: project_null_id_sync_bug — LS pode acumular phantom rows até o fix de sync).
  const teamRaw = (schedules || []).filter(other =>
    other.className === s.className &&
    other.module    === s.module &&
    other.date      === s.date
  );
  const teamSeen = new Set();
  const teamAll = teamRaw.filter(o => {
    const k = String(o.instructorId) + "|" + (o.role || "");
    if (teamSeen.has(k)) return false;
    teamSeen.add(k);
    return true;
  });
  const siblings = teamAll.filter(o => String(o.instructorId) !== String(user.id));

  // Nome completo do treinamento (cai no GCC se trainings não vier).
  const train = (trainings || []).find(t => String(t.id) === String(s.trainingId));
  const trainingFullName = train ? train.name : s.trainingName;

  const fmtFull  = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR",
    { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const fmtShort = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR",
    { day: "2-digit", month: "2-digit" });
  const myRole = ROLE_PT[s.role] || s.role || "Instrutor";

  // Estado visual sutil: borda fina amarela à esquerda = pendente; neutro = ciente.
  // Frente 4: permite dar ciência em qualquer dia futuro (antes só hoje/amanhã)
  const isPendingActionable = !isConfirmed && dayCtx !== "past";

  return (
    <div style={{
      background: "#01323d",
      border: "1px solid " + (isConfirmed ? "#16a34a40" : "#154753"),
      borderLeft: isPendingActionable ? "3px solid #f59e0b" : ("1px solid " + (isConfirmed ? "#16a34a40" : "#154753")),
      borderRadius: 12,
      padding: expanded ? "14px 16px" : "11px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      transition: "padding 0.18s ease, border-color 0.18s ease",
    }}>

      {/* HEADER COMPACTO */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          {showDate && (
            <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
              📅 {fmtShort(s.date)}
            </span>
          )}
          <span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {s.startTime}–{s.endTime}
          </span>
          <span style={{ color: "#ffa619", fontSize: 12, fontWeight: 700 }}>{s.className}</span>
          <span style={{ color: "#475569", fontSize: 11 }}>·</span>
          <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {s.module}
          </span>
        </div>

        {isConfirmed ? (
          <span style={{ color: "#16a34a", fontSize: 11, fontWeight: 700, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
            ✓ Ciente{s.confirmedAt ? " · " + new Date(s.confirmedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""}
          </span>
        ) : isPendingActionable ? (
          <button onClick={() => setExpanded(v => !v)}
            style={{
              padding: "6px 14px",
              background: expanded ? "transparent" : "#ffa619",
              border: expanded ? "1px solid #ffa619" : "1px solid transparent",
              borderRadius: 8,
              color: expanded ? "#ffa619" : "#fff",
              fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0,
              WebkitTapHighlightColor: "transparent",
              transition: "background 0.18s ease, color 0.18s ease",
            }}>
            {expanded ? "Recolher ▲" : "Ciente ▾"}
          </button>
        ) : null}
      </div>

      {/* RESUMO em uma linha extra com colegas (compacto, não expandido) */}
      {!expanded && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ padding: "2px 8px", borderRadius: 6, background: "#f59e0b20", color: "#f59e0b", fontSize: 11, fontWeight: 700 }}>
            Você: {myRole}
          </span>
          <span style={{ color: "#64748b", fontSize: 11 }}>· {s.local}</span>
          {siblings.map(si => {
            const firstName = (si.instructorName || "").split(" ")[0];
            const siRole = ROLE_PT[si.role] || si.role || "Instrutor";
            return (
              <span key={si.id} style={{ color: "#94a3b8", fontSize: 11 }}>
                👥 {firstName} · {siRole}
              </span>
            );
          })}
        </div>
      )}

      {/* EXPANDIDO — detalhes completos + botão de confirmação (DESIGN §18.3) */}
      {expanded && !isConfirmed && (
        <div style={{
          marginTop: 4, paddingTop: 14, borderTop: "1px solid #154753",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          <DetailRow label="Treinamento" value={trainingFullName} />
          <DetailRow label="Data e horário" value={fmtFull(s.date) + " · " + s.startTime + "–" + s.endTime} />
          <DetailRow label="Disciplina" value={s.module} />
          <DetailRow label="Turma" value={s.className} />
          <DetailRow label="Local" value={s.local} />

          <div>
            <span style={{ color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>Equipe</span>
            <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {teamAll.map(t => {
                const isMe = String(t.instructorId) === String(user.id);
                const r = ROLE_PT[t.role] || t.role || "Instrutor";
                return (
                  <li key={t.id} style={{
                    background: isMe ? "#ffa61918" : "#073d4a",
                    border: "1px solid " + (isMe ? "#ffa61940" : "#154753"),
                    borderRadius: 8, padding: "8px 12px",
                    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                  }}>
                    <span style={{ color: isMe ? "#ffa619" : "#e2e8f0", fontWeight: isMe ? 700 : 600, fontSize: 14 }}>
                      {t.instructorName || "—"}
                    </span>
                    <span style={{ color: isMe ? "#ffa619" : "#64748b", fontSize: 12 }}>· {r}</span>
                    {isMe && <span style={{ marginLeft: "auto", color: "#ffa619", fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>VOCÊ</span>}
                  </li>
                );
              })}
            </ul>
          </div>

          <button onClick={() => { setExpanded(false); onConfirm(s.id); }}
            style={{
              marginTop: 4,
              padding: "13px 18px",
              background: "linear-gradient(135deg,#16a34a,#15803d)",
              border: "none",
              borderRadius: 10,
              color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
              boxShadow: "0 4px 14px rgba(22,163,74,0.25)",
            }}>
            Confirmar ciência ✓
          </button>
        </div>
      )}

      {/* Ações secundárias — reportar problema (só quando não expandido) */}
      {!expanded && dayCtx !== "past" && onReport && !s.issue && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => onReport(s.id)}
            style={{ fontSize: 11, color: "#64748b", background: "none", border: "1px solid #154753",
              borderRadius: 8, padding: "3px 10px", cursor: "pointer" }}>
            Relatar Problema
          </button>
        </div>
      )}
      {s.issue && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 11, color: "#d97806", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="warning" size={12} color="#d97806" /> Problema relatado
          </span>
        </div>
      )}
    </div>
  );
};

// Helper visual para linhas de detalhe no expandido.
const DetailRow = ({ label, value }) => (
  <div>
    <span style={{ color: "#64748b", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
    <p style={{ color: "#e2e8f0", margin: "3px 0 0", fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{value}</p>
  </div>
);

// ── NOTIFICATION BELL — Central de notificações (DESIGN §18.2) ─────────────
// Definido fora do InstructorDashboard para evitar remount.
const NotificationBell = ({ user }) => {
  const { notifs, markRead, markAllRead } = useNotifications(user.id);
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState('unread'); // 'unread' | 'all'
  const isMobileDevice = useIsMobile();
  const unreadCount = notifs.filter(n => !n.read_at).length;

  // Ao abrir, marca todas as visíveis como lidas após pequeno atraso (deixa o usuário ver o badge antes)
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { markAllRead(); }, 1200);
    return () => clearTimeout(t);
  }, [open]);

  const visible = filter === 'unread' ? notifs.filter(n => !n.read_at) : notifs;

  const typeMeta = {
    new_module:      { icon: '✨', color: '#16a34a', label: 'Novo módulo' },
    module_changed:  { icon: '✏️', color: '#f59e0b', label: 'Alteração' },
    module_cancelled:{ icon: '❌', color: '#ef4444', label: 'Cancelamento' },
    broadcast:       { icon: '📢', color: '#3b82f6', label: 'Aviso' },
  };

  const fmtRel = iso => {
    if (!iso) return '';
    const d = new Date(iso); const now = Date.now();
    const diffMin = Math.round((now - d.getTime()) / 60000);
    if (diffMin < 1) return 'agora';
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 7) return `${diffD}d`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        title="Notificações"
        aria-label={unreadCount > 0 ? `${unreadCount} notificações não lidas` : 'Notificações'}
        style={{
          position: 'relative',
          background: 'transparent',
          border: '1px solid ' + (unreadCount > 0 ? '#ffa619' : '#154753'),
          borderRadius: 10,
          padding: '6px 10px',
          color: unreadCount > 0 ? '#ffa619' : '#94a3b8',
          cursor: 'pointer',
          fontSize: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          WebkitTapHighlightColor: 'transparent',
        }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>🔔</span>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6,
            minWidth: 18, height: 18, padding: '0 5px',
            background: '#ef4444', color: '#fff', borderRadius: 9,
            fontSize: 10, fontWeight: 800, lineHeight: '18px',
            textAlign: 'center', border: '2px solid #01323d',
          }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'stretch', justifyContent: isMobileDevice ? 'stretch' : 'flex-end',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#01323d',
            borderLeft: isMobileDevice ? 'none' : '1px solid #154753',
            width: isMobileDevice ? '100%' : 420,
            maxWidth: '100%',
            height: '100%',
            display: 'flex', flexDirection: 'column',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
            animation: 'rl-slideDown 0.2s ease',
          }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #154753',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🔔</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>Notificações</h3>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Fechar"
                style={{ background: 'transparent', border: 'none', color: '#94a3b8',
                  fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
            </div>

            <div style={{ padding: '10px 18px', borderBottom: '1px solid #154753',
              display: 'flex', gap: 8 }}>
              {['unread', 'all'].map(k => (
                <button key={k} onClick={() => setFilter(k)}
                  style={{
                    flex: 1, padding: '6px 10px',
                    background: filter === k ? '#ffa61920' : 'transparent',
                    border: '1px solid ' + (filter === k ? '#ffa619' : '#154753'),
                    borderRadius: 8,
                    color: filter === k ? '#ffa619' : '#94a3b8',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                  {k === 'unread' ? `Não lidas (${unreadCount})` : `Todas (${notifs.length})`}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {visible.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
                  {filter === 'unread' ? 'Nenhuma notificação nova.' : 'Nenhuma notificação ainda.'}
                </div>
              ) : (
                visible.map(n => {
                  const meta = typeMeta[n.type] || { icon: '📌', color: '#94a3b8', label: 'Notificação' };
                  return (
                    <div key={n.id} onClick={() => markRead(n.id)}
                      style={{
                        padding: '12px 18px',
                        borderBottom: '1px solid #073d4a',
                        background: n.read_at ? 'transparent' : '#07303a',
                        cursor: 'pointer',
                        display: 'flex', gap: 12,
                      }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: meta.color + '22', border: '1px solid ' + meta.color + '55',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, flexShrink: 0,
                      }}>{meta.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{ color: meta.color, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                            {meta.label}
                          </span>
                          <span style={{ color: '#475569', fontSize: 11 }}>{fmtRel(n.created_at)}</span>
                        </div>
                        <p style={{ color: n.read_at ? '#94a3b8' : '#e2e8f0', margin: '4px 0 2px',
                          fontSize: 13, fontWeight: n.read_at ? 600 : 700, lineHeight: 1.35 }}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p style={{ color: '#64748b', margin: 0, fontSize: 12, lineHeight: 1.4 }}>
                            {n.body}
                          </p>
                        )}
                      </div>
                      {!n.read_at && (
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffa619',
                          flexShrink: 0, marginTop: 14, alignSelf: 'flex-start' }} />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};


// ── INSTRUCTOR DASHBOARD ──────────────────────────────────────────────────────
const InstructorDashboard = ({ schedules: schedulesRaw, setSchedules, trainings, user }) => {
  // Barreira anti-duplicata (defesa em profundidade): espelha a UNIQUE constraint
  // relyon_schedules_unique_slot. Protege a UI enquanto o bug null-id sync deixa
  // phantom rows no LS (ver memory: project_null_id_sync_bug).
  const schedules = React.useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const s of (schedulesRaw || [])) {
      const k = [s.className, s.module, s.date, s.startTime, s.instructorId, s.role].join("|");
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  }, [schedulesRaw]);
  const today    = new Date().toISOString().split("T")[0];
  const tomorrow = (() => {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  })();
  const fmt     = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  const fmtLong = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long",  day: "2-digit", month: "long" });

  const mine = schedules
    .filter(s => String(s.instructorId) === String(user.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const todayItems    = mine.filter(s => s.date === today);
  const tomorrowItems = mine.filter(s => s.date === tomorrow);
  const pendingToday  = todayItems.filter(s => s.status === "Pendente");
  const pendingAll    = mine.filter(s => s.date >= today && s.status === "Pendente");

  const confirm = id => setSchedules(prev => prev.map(s =>
    s.id === id
      ? { ...s, status: "Confirmado", confirmedAt: new Date().toISOString(), confirmedBy: user.name }
      : s
  ));
  const confirmAll = () => setSchedules(prev => prev.map(s =>
    String(s.instructorId) === String(user.id) && s.date === today
      ? { ...s, status: "Confirmado", confirmedAt: new Date().toISOString(), confirmedBy: user.name }
      : s
  ));

  const reportIssue = (id, text) => setSchedules(prev => prev.map(s =>
    s.id === id ? { ...s, issue: text, issueAt: new Date().toISOString(), issueBy: user.name,
      issueLog: [...(s.issueLog || []), { type: "report", text, by: user.name, at: new Date().toISOString() }] } : s
  ));
  const [issueModal, setIssueModal] = useState({ show: false, scheduleId: null, text: "" });
  const [pendingOpen, setPendingOpen] = useState(false);
  const [queryDate, setQueryDate] = useState("");
  // Frente 1 — linha "agora" (DESIGN §18.5): tick a cada 60s; ref para scroll
  const [nowTick, setNowTick] = useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNowTick(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const nowLineRef = React.useRef(null);
  const isMobileDevice = useIsMobile();
  // Scroll silencioso até a linha "agora" no mount (mobile/iPad)
  React.useEffect(() => {
    if (!isMobileDevice) return;
    const t = setTimeout(() => {
      if (nowLineRef.current && nowLineRef.current.scrollIntoView) {
        nowLineRef.current.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    }, 350); // espera layout assentar (timeline depende de todayItems carregarem)
    return () => clearTimeout(t);
  }, []);
  const [notifState, setNotifState] = useState('default');
  const [notifMsg, setNotifMsg] = useState(null);
  const [showPwaHint, setShowPwaHint] = useState(false);
  const [autoPromptReady, setAutoPromptReady] = useState(false);
  const [autoPromptDismissedAt, setAutoPromptDismissedAt] = useState(() => {
    try { return parseInt(localStorage.getItem(`rl360_notif_prompt_${user.id}`)) || 0; }
    catch { return 0; }
  });

  // iOS exige PWA instalado na tela inicial para receber push (limitação Apple).
  const isIOS = typeof navigator !== 'undefined'
    && /iPhone|iPad|iPod/i.test(navigator.userAgent)
    && !window.MSStream;
  const isStandalone = typeof window !== 'undefined' && (
    window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  );
  const iosNeedsInstall = isIOS && !isStandalone;

  React.useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotifState('unsupported');
      setAutoPromptReady(true);
      return;
    }
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => {
        setNotifState(sub ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'default');
        // pequeno delay evita modal piscando antes do estado chegar
        setTimeout(() => setAutoPromptReady(true), 900);
      })
    );
  }, []);

  const showTempMsg = (text, kind = 'info', ms = 6000) => {
    setNotifMsg({ text, kind });
    setTimeout(() => setNotifMsg(curr => (curr && curr.text === text ? null : curr)), ms);
  };

  const dismissAutoPrompt = () => {
    const now = Date.now();
    try { localStorage.setItem(`rl360_notif_prompt_${user.id}`, String(now)); } catch {}
    setAutoPromptDismissedAt(now);
  };

  // Convite automático: mostrado quando notificação ainda não foi decidida
  // e o usuário não dispensou nos últimos 7 dias. É o jeito de capturar
  // os instrutores que já tinham o PWA instalado antes do recurso existir.
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const shouldAutoPrompt = autoPromptReady
    && notifState === 'default'
    && (Date.now() - autoPromptDismissedAt > SEVEN_DAYS);

  const toggleNotifications = async () => {
    if (notifState === 'denied') {
      showTempMsg('Notificações bloqueadas. Habilite nas configurações do navegador para este site.', 'error');
      return;
    }
    if (iosNeedsInstall && notifState !== 'granted') {
      setShowPwaHint(true);
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      if (notifState === 'granted') {
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await sub.unsubscribe(); await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); }
        setNotifState('default');
        showTempMsg('Notificações desativadas.', 'info');
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          setNotifState(perm);
          showTempMsg(perm === 'denied'
            ? 'Você negou a permissão. Habilite nas configurações do navegador.'
            : 'Permissão não concedida.', 'error');
          return;
        }
        const b64 = s => { const p='='.repeat((4-s.length%4)%4); const b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from([...b].map(c=>c.charCodeAt(0))); };
        const vapid = 'BHrvNl82jm0ouUIwXQfZquDtVOGlF5TRKiHSAENt7KYUYZLDNlomFQVUTsbixhiI_C-_yXewX1xL5kBzrIWTdFA';
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(vapid) });
        const j = sub.toJSON();
        const { error } = await sb.from('push_subscriptions').upsert(
          { instructor_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
          { onConflict: 'endpoint' }
        );
        if (error) throw new Error(error.message);
        setNotifState('granted');
        showTempMsg('🔔 Notificações ativadas! Você receberá alertas no celular.', 'success');
      }
    } catch(e) {
      console.error('push subscription error', e);
      if (isIOS && !isStandalone) {
        setShowPwaHint(true);
      } else {
        showTempMsg('Não foi possível ativar: ' + (e.message || 'erro desconhecido'), 'error');
      }
    }
  };
  const queryItems = queryDate ? mine.filter(s => s.date === queryDate) : [];

  // Nome do líder responsável (vem do cadastro do instrutor)
  const leaderName = user.leader || "seu líder";

  // Frente 4 (DESIGN §18.4): semana navegável com auto-foco quinta 18h+
  const [weekOffset, setWeekOffset] = useState(() => {
    const now = new Date();
    const dow = now.getDay(); // 0=dom 1=seg ... 6=sab
    // Quinta-feira a partir das 18:00 → próxima semana por padrão
    if (dow === 4 && now.getHours() >= 18) return 1;
    // Sex/sáb/dom: próxima semana por padrão (a semana atual já "acabou" para o instrutor)
    if (dow === 5 || dow === 6 || dow === 0) return 1;
    return 0;
  });
  // Semana = segunda a domingo, deslocada por weekOffset
  const getWeekDays = (offset = 0) => {
    const d = new Date(today + "T12:00:00");
    const dow = d.getDay() || 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - (dow - 1) + (offset * 7));
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(mon); x.setDate(mon.getDate() + i);
      return x.toISOString().split("T")[0];
    });
  };
  const week      = getWeekDays(weekOffset);
  const weekItems = mine.filter(s => week.includes(s.date));
  const fmtDM     = ds => new Date(ds + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const weekLabel = weekOffset === 0 ? "Esta semana"
                  : weekOffset === 1 ? "Próxima semana"
                  : weekOffset === -1 ? "Semana anterior"
                  : weekOffset > 0 ? `Daqui ${weekOffset} semanas`
                  : `${Math.abs(weekOffset)} semanas atrás`;

  // Configuração da timeline do dia
  const SLOT_H = 52, START_HOUR = 8, END_HOUR = 17;
  const totalH = END_HOUR - START_HOUR;
  const toFrac = t => { const [h,m] = t.split(":").map(Number); return (h + m/60 - START_HOUR) / totalH; };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:4 }}>
        <h2 style={{ color: "#fff", fontWeight: 800, margin: 0, fontSize: 24 }}>Dashboard</h2>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <NotificationBell user={user} />
        {notifState !== 'unsupported' && (
          <button onClick={toggleNotifications}
            title={notifState === 'denied' ? 'Desbloqueie nas configurações do navegador' : iosNeedsInstall && notifState !== 'granted' ? 'Como ativar no iPhone' : notifState === 'granted' ? 'Desativar notificações' : 'Ativar notificações'}
            style={{ background:"transparent", border:`1px solid ${notifState==='granted'?'#16a34a':iosNeedsInstall&&notifState!=='granted'?'#ffa619':'#154753'}`, borderRadius:8, padding:"5px 12px", color:notifState==='granted'?'#16a34a':iosNeedsInstall&&notifState!=='granted'?'#ffa619':'#475569', cursor:'pointer', fontSize:12, display:"inline-flex", alignItems:"center", gap:5, whiteSpace:"nowrap" }}>
            {iosNeedsInstall && notifState !== 'granted' ? '📲 Como ativar' : notifState === 'granted' ? '🔔 Notificações ativas' : notifState === 'denied' ? '🔕 Bloqueado' : '🔔 Ativar notificações'}
          </button>
        )}
        </div>
      </div>

      {notifMsg && (
        <div role="status" style={{
          marginTop: 8, marginBottom: 8,
          background: notifMsg.kind === 'success' ? '#16a34a15' : notifMsg.kind === 'error' ? '#ef444415' : '#15475330',
          border: `1px solid ${notifMsg.kind === 'success' ? '#16a34a' : notifMsg.kind === 'error' ? '#ef4444' : '#154753'}`,
          borderRadius: 8, padding: '8px 12px',
          color: notifMsg.kind === 'success' ? '#16a34a' : notifMsg.kind === 'error' ? '#ef4444' : '#94a3b8',
          fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ flex: 1 }}>{notifMsg.text}</span>
          <button onClick={() => setNotifMsg(null)} style={{ background:'transparent', border:'none', color:'inherit', fontSize:16, cursor:'pointer', padding:0, lineHeight:1 }}>×</button>
        </div>
      )}

      {shouldAutoPrompt && !showPwaHint && (
        <div style={{
          position:'fixed', inset:0, background:'#000a', zIndex:998,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20,
          animation:'rl-slideDown 0.25s ease',
        }}>
          <div style={{
            background:'#01323d', border:'1px solid #ffa619', borderRadius:14,
            padding:'24px 22px', maxWidth:440, width:'100%', color:'#fff',
            boxShadow:'0 10px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              <div style={{ fontSize:32 }}>🔔</div>
              <h3 style={{ margin:0, fontSize:18, fontWeight:800, color:'#ffa619' }}>
                Ative as notificações
              </h3>
            </div>
            <p style={{ margin:'0 0 10px', fontSize:14, color:'#e2e8f0', lineHeight:1.55 }}>
              Olá, {user.name.split(" ")[0]}! Agora o RelyOn 360 envia avisos no seu celular
              sempre que sua programação for atualizada.
            </p>
            <p style={{ margin:'0 0 18px', fontSize:13, color:'#94a3b8', lineHeight:1.55 }}>
              Você nunca mais perde uma confirmação de última hora.
              Toque em <strong style={{color:'#ffa619'}}>Ativar agora</strong> e aceite o pedido
              do navegador.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <button onClick={() => { dismissAutoPrompt(); toggleNotifications(); }} style={{
                background:'linear-gradient(135deg,#ffa619,#e8920a)', border:'none', borderRadius:10,
                padding:'13px 16px', color:'#01323d', fontWeight:800, fontSize:14, cursor:'pointer',
                WebkitTapHighlightColor:'transparent',
              }}>🔔 Ativar agora</button>
              <button onClick={dismissAutoPrompt} style={{
                background:'transparent', border:'1px solid #154753', borderRadius:10,
                padding:'10px 16px', color:'#94a3b8', fontWeight:600, fontSize:13, cursor:'pointer',
                WebkitTapHighlightColor:'transparent',
              }}>Lembrar depois</button>
            </div>
          </div>
        </div>
      )}

      {showPwaHint && (
        <div onClick={() => setShowPwaHint(false)} style={{
          position:'fixed', inset:0, background:'#0008', zIndex:999,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'#01323d', border:'1px solid #ffa619', borderRadius:14,
            padding:'20px 22px', maxWidth:420, width:'100%', color:'#fff',
          }}>
            <h3 style={{ margin:'0 0 12px', fontSize:17, fontWeight:800, color:'#ffa619' }}>
              📲 Para receber notificações no iPhone
            </h3>
            <p style={{ margin:'0 0 14px', fontSize:13, color:'#94a3b8', lineHeight:1.5 }}>
              O iOS só envia notificações se o app estiver instalado na tela inicial. É rápido:
            </p>
            <ol style={{ margin:'0 0 16px 18px', padding:0, fontSize:13, color:'#e2e8f0', lineHeight:1.7 }}>
              <li>Toque no botão <strong>Compartilhar</strong> (ícone <span style={{color:'#ffa619'}}>⬆️</span> na barra inferior do Safari)</li>
              <li>Role e escolha <strong>"Adicionar à Tela de Início"</strong></li>
              <li>Toque em <strong>"Adicionar"</strong> no canto superior</li>
              <li>Abra o app pelo novo ícone na tela inicial e volte aqui para ativar</li>
            </ol>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={() => setShowPwaHint(false)} style={{
                background:'#ffa619', border:'none', borderRadius:8,
                padding:'8px 16px', color:'#01323d', fontWeight:700, fontSize:13, cursor:'pointer',
              }}>Entendi</button>
            </div>
          </div>
        </div>
      )}
      <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 14 }}>
        Olá, {user.name.split(" ")[0]}! Sua programação está aqui.
      </p>

      {/* ── Barra de alertas de pendências — clicável ── */}
      {pendingAll.length > 0 ? (
        <div style={{ marginBottom: 20 }}>
          <div onClick={() => setPendingOpen(v => !v)} style={{
            background: "#ef444415", border: "1px solid #ef4444",
            borderRadius: pendingOpen ? "12px 12px 0 0" : 12,
            padding: "12px 16px", display: "flex", alignItems: "center",
            gap: 10, flexWrap: "wrap", cursor: "pointer", userSelect: "none" }}>
            <Icon name="warning" size={18} color="#ef4444" />
            <p style={{ color: "#ef4444", margin: 0, fontSize: 14, fontWeight: 600, flex: 1 }}>
              {pendingAll.length} {pendingAll.length === 1 ? "programação aguarda" : "programações aguardam"} sua confirmação!
            </p>
            <span style={{ color: "#ef4444", fontSize: 12, fontWeight: 700 }}>
              {pendingOpen ? "▲ Ocultar" : "▼ Ver quais"}
            </span>
          </div>
          {pendingOpen && (
            <div style={{ background: "#0a1a1f", border: "1px solid #ef4444", borderTop: "none",
              borderRadius: "0 0 12px 12px", padding: "12px 16px",
              display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingAll.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12,
                  background: "#073d4a", borderRadius: 8, padding: "10px 14px", border: "1px solid #154753" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "#e2e8f0", fontWeight: 700, margin: 0, fontSize: 13 }}>
                      {s.trainingName} — {s.className}
                    </p>
                    <p style={{ color: "#94a3b8", fontSize: 12, margin: "3px 0 0" }}>
                      {s.module} · {new Date(s.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })} · {s.startTime}–{s.endTime}
                    </p>
                  </div>
                  {/* Frente 2: lista de pendências é só aviso — confirmar exige expandir o card abaixo */}
                  <span style={{ padding: "4px 10px", background: "#f59e0b20", color: "#f59e0b",
                    borderRadius: 6, fontSize: 11, fontWeight: 700, flexShrink: 0, letterSpacing: 0.3 }}>
                    AGUARDA CIÊNCIA
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: "#16a34a15", border: "1px solid #16a34a", borderRadius: 12,
          padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="check" size={18} color="#16a34a" />
          <p style={{ color: "#16a34a", margin: 0, fontSize: 14, fontWeight: 700 }}>
            PARABÉNS, todas as programações estão confirmadas!
          </p>
        </div>
      )}

      {/* ── HOJE — timeline visual ── */}
      <div style={{ background: "#073d4a", borderRadius: 16, padding: 24,
        border: "1px solid #154753", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ color: "#fff", fontWeight: 700, margin: 0, fontSize: 16 }}>
            🕗 Hoje — {fmtLong(today)}
          </h3>
          {todayItems.length > 0 && pendingToday.length === 0 && (
            <span style={{ color: "#16a34a", fontWeight: 700, fontSize: 12,
              background: "#16a34a20", padding: "4px 12px", borderRadius: 20 }}>
              ✅ Tudo confirmado
            </span>
          )}
        </div>
        {todayItems.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: 14 }}>
            Você está livre! Procure {leaderName}.
          </p>
        ) : (
          <div style={{ position: "relative", height: totalH * SLOT_H + 16 }}>
            {/* Grade de horas */}
            {Array.from({ length: totalH + 1 }, (_, i) => (
              <div key={i} style={{ position: "absolute", top: i * SLOT_H, left: 0, right: 0,
                borderTop: "1px solid #154753", display: "flex", alignItems: "flex-start" }}>
                <span style={{ color: "#64748b", fontSize: 10, width: 36, paddingTop: 2, flexShrink: 0 }}>
                  {String(START_HOUR + i).padStart(2,"0")}h
                </span>
              </div>
            ))}
            {/* Faixa de almoço */}
            <div style={{ position: "absolute", top: 4 * SLOT_H, left: 36, right: 0,
              height: SLOT_H, background: "#01323d60", borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#64748b", fontSize: 11 }}>Almoço</span>
            </div>
            {/* Linha "agora" — só renderiza se a hora atual cair na janela 08-17h (DESIGN §18.5) */}
            {(() => {
              const h = nowTick.getHours(), m = nowTick.getMinutes();
              if (h < START_HOUR || h >= END_HOUR) return null;
              const topPx = (((h - START_HOUR) * 60 + m) / 60) * SLOT_H;
              return (
                <div ref={nowLineRef} style={{
                  position: "absolute", top: topPx, left: 36, right: 0, height: 0,
                  borderTop: "1.5px solid #ef4444", zIndex: 10, pointerEvents: "none",
                }}>
                  <div style={{ position: "absolute", left: -5, top: -5, width: 9, height: 9,
                    borderRadius: "50%", background: "#ef4444",
                    boxShadow: "0 0 0 3px rgba(239,68,68,0.18)" }} />
                </div>
              );
            })()}
            {/* Blocos de disciplina */}
            {todayItems.map(s => {
              const top    = toFrac(s.startTime) * totalH * SLOT_H;
              const [hs,ms] = s.startTime.split(":").map(Number);
              const [he,me] = s.endTime.split(":").map(Number);
              const durH   = (he*60+me - hs*60-ms) / 60;
              const height = Math.max(durH * SLOT_H - 4, 28);
              const siblings = schedules.filter(other =>
                other.className === s.className && other.module === s.module &&
                other.date === s.date && String(other.instructorId) !== String(user.id)
              );
              return (
                <div key={s.id} style={{
                  position: "absolute", top: top + 2, left: 40, right: 0, height,
                  background: s.status === "Confirmado" ? "#16a34a20" : "#ffa61920",
                  border: `1px solid ${s.status === "Confirmado" ? "#16a34a" : "#ffa619"}`,
                  borderRadius: 8, padding: "4px 10px",
                  display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "#e2e8f0", margin: 0, fontSize: 12, fontWeight: 700,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.module}
                    </p>
                    <p style={{ color: "#64748b", margin: 0, fontSize: 10 }}>
                      {s.startTime}–{s.endTime} · {s.local}
                      {siblings.length > 0 && (
                        <span style={{ color: "#94a3b8" }}>
                          {" · "}👥 {siblings.map(si => (si.instructorName || "").split(" ")[0]).join(", ")}
                        </span>
                      )}
                    </p>
                  </div>
                  {/* Frente 2: timeline é só visualização — ciência se dá ao expandir o card abaixo */}
                  {s.status === "Pendente"
                    ? <span style={{ padding: "2px 8px", background: "#f59e0b20", color: "#f59e0b",
                        borderRadius: 12, fontSize: 10, fontWeight: 700, flexShrink: 0,
                        letterSpacing: 0.3 }}>PENDENTE</span>
                    : <Icon name="check" size={14} color="#16a34a" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── CONSULTAR DATA ── */}
      <div style={{ background: "#073d4a", borderRadius: 16, padding: 20,
        border: "1px solid #154753", marginBottom: 20 }}>
        <h3 style={{ color: "#e2e8f0", fontWeight: 700, margin: "0 0 12px", fontSize: 15 }}>
          🔍 Consultar outra data
        </h3>
        <input type="date" value={queryDate} onChange={e => setQueryDate(e.target.value)}
          style={{ background: "#01323d", border: "1px solid #154753", borderRadius: 8,
            color: "#e2e8f0", padding: "8px 12px", fontSize: 14,
            marginBottom: 12, width: "100%", maxWidth: 220 }} />
        {queryDate && (
          queryItems.length === 0 ? (
            <p style={{ color: "#475569", fontSize: 13 }}>
              Você está livre! Procure {leaderName}.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {queryItems.map(s => {
                const qCtx = queryDate < today ? "past" : queryDate === today ? "today" : queryDate === tomorrow ? "tomorrow" : "future";
                return (
                  <InstructorScheduleCard
                    key={s.id} s={s} schedules={schedules} trainings={trainings} user={user}
                    onConfirm={confirm} onReport={id => setIssueModal({ show: true, scheduleId: id, text: "" })}
                    dayCtx={qCtx} showDate={true} />
                );
              })}
            </div>
          )
        )}
      </div>

      {/* ── SEMANA NAVEGÁVEL (Frente 4) ── */}
      <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <button onClick={() => setWeekOffset(o => o - 1)}
            aria-label="Semana anterior"
            style={{ background: "transparent", border: "1px solid #154753", borderRadius: 8,
              padding: "6px 14px", color: "#94a3b8", cursor: "pointer", fontSize: 16,
              fontWeight: 700, lineHeight: 1, WebkitTapHighlightColor: "transparent" }}>◀</button>
          <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
            <h3 style={{ color: "#fff", fontWeight: 700, margin: 0, fontSize: 16 }}>
              📅 {weekLabel}
            </h3>
            <p style={{ color: "#94a3b8", fontSize: 12, margin: "3px 0 0" }}>
              {fmtDM(week[0])} – {fmtDM(week[6])}
              {weekOffset !== 0 && (
                <>{" · "}<button onClick={() => setWeekOffset(0)}
                  style={{ background: "transparent", border: "none", color: "#ffa619",
                    fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0,
                    textDecoration: "underline", WebkitTapHighlightColor: "transparent" }}>
                  Voltar para hoje
                </button></>
              )}
            </p>
          </div>
          <button onClick={() => setWeekOffset(o => o + 1)}
            aria-label="Próxima semana"
            style={{ background: "transparent", border: "1px solid #154753", borderRadius: 8,
              padding: "6px 14px", color: "#94a3b8", cursor: "pointer", fontSize: 16,
              fontWeight: 700, lineHeight: 1, WebkitTapHighlightColor: "transparent" }}>▶</button>
        </div>
        {week.map(day => {
          const dayItems = weekItems.filter(s => s.date === day);
          const isPast   = day < today;
          const isToday  = day === today;
          const isTomorrow = day === tomorrow;
          const dayCtx   = isPast ? "past" : isToday ? "today" : isTomorrow ? "tomorrow" : "future";
          return (
            <div key={day} style={{ marginBottom: 14 }}>
              {/* Cabeçalho do dia */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  color: isToday ? "#ffa619" : isPast ? "#475569" : "#e2e8f0",
                  fontWeight: isToday ? 800 : 600, fontSize: 13, minWidth: 100 }}>
                  {fmt(day)}
                </span>
                {isToday && (
                  <span style={{ background: "#ffa61920", color: "#ffa619", fontSize: 10,
                    padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>HOJE</span>
                )}
                {dayItems.some(s => s.status === "Pendente") && (
                  <span style={{ background: "#ef444420", color: "#ef4444", fontSize: 10,
                    padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>● Pendente</span>
                )}
              </div>
              {dayItems.length === 0 ? (
                <p style={{ color: "#475569", fontSize: 12, margin: "0 0 0 8px" }}>
                  Sem treinamentos
                </p>
              ) : (
                <div style={{
                  display: "flex", flexDirection: "column", gap: 6,
                  paddingLeft: 8,
                  borderLeft: `3px solid ${isToday ? "#ffa619" : "#154753"}`,
                  opacity: isPast ? 0.7 : 1 }}>
                  {dayItems.map(s => (
                    <InstructorScheduleCard
                      key={s.id} s={s} schedules={schedules} trainings={trainings} user={user}
                      onConfirm={confirm} onReport={id => setIssueModal({ show: true, scheduleId: id, text: "" })}
                      dayCtx={dayCtx} showDate={false} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <IssueModal issue={issueModal} setIssue={setIssueModal} onSubmit={reportIssue} />
    </div>
  );
};

// ── MY CONFIRMATIONS — histórico de ciências do instrutor (DESIGN §18.6) ──────
// Tela read-only: lista cronológica decrescente de schedules confirmados pelo instrutor.
const MyConfirmations = ({ schedules, trainings, user }) => {
  const [monthFilter, setMonthFilter] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const mine = (schedules || [])
    .filter(s => String(s.instructorId) === String(user.id))
    .filter(s => s.status === "Confirmado" && s.confirmedAt);

  // Filtra por mês do confirmedAt (quando o aceite foi dado)
  const filtered = monthFilter === "all"
    ? mine
    : mine.filter(s => {
        const d = new Date(s.confirmedAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === monthFilter;
      });

  filtered.sort((a, b) => (b.confirmedAt || "").localeCompare(a.confirmedAt || ""));

  // Lista de meses únicos (dos confirmedAt) para o seletor
  const monthOptions = Array.from(new Set(mine.map(s => {
    const d = new Date(s.confirmedAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }))).sort().reverse();

  const fmtMonth = key => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };
  const fmtDate = ds => new Date(ds + "T12:00:00").toLocaleDateString("pt-BR",
    { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });
  const fmtConfirmedAt = iso => new Date(iso).toLocaleString("pt-BR",
    { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <h2 style={{ color: "#fff", fontWeight: 800, margin: "0 0 4px", fontSize: 24 }}>Minhas Confirmações</h2>
      <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 14 }}>
        Histórico de tudo que você já confirmou — para consultar a qualquer momento.
      </p>

      <div style={{ background: "#073d4a", borderRadius: 14, padding: "12px 16px",
        border: "1px solid #154753", marginBottom: 16, display: "flex",
        alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>Filtrar por mês:</label>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
          style={{ background: "#01323d", border: "1px solid #154753", borderRadius: 8,
            color: "#e2e8f0", padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>
          {!monthOptions.includes(monthFilter) && monthFilter !== "all" && (
            <option value={monthFilter}>{fmtMonth(monthFilter)} (sem registros)</option>
          )}
          {monthOptions.map(k => (
            <option key={k} value={k}>{fmtMonth(k)}</option>
          ))}
          <option value="all">Todos os meses</option>
        </select>
        <span style={{ color: "#64748b", fontSize: 12 }}>
          · {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: "#073d4a", borderRadius: 14, padding: 30,
          border: "1px solid #154753", textAlign: "center", color: "#475569", fontSize: 14 }}>
          Nenhuma confirmação registrada {monthFilter === "all" ? "ainda" : "neste mês"}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(s => {
            const train = (trainings || []).find(t => String(t.id) === String(s.trainingId));
            const trainingFullName = train ? train.name : s.trainingName;
            const team = (schedules || []).filter(o =>
              o.className === s.className && o.module === s.module && o.date === s.date
            );
            return (
              <div key={s.id} style={{
                background: "#073d4a",
                border: "1px solid #16a34a40",
                borderLeft: "3px solid #16a34a",
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
                    <span style={{ color: "#ffa619", fontSize: 13, fontWeight: 700 }}>{s.className}</span>
                    <span style={{ color: "#475569" }}>·</span>
                    <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{s.module}</span>
                  </div>
                  <span style={{ color: "#16a34a", fontSize: 11, fontWeight: 700, flexShrink: 0,
                    display: "inline-flex", alignItems: "center", gap: 4 }}>
                    ✓ Confirmado em {fmtConfirmedAt(s.confirmedAt)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#94a3b8", flexWrap: "wrap" }}>
                  <span>📅 {fmtDate(s.date)}</span>
                  <span>🕐 {s.startTime}–{s.endTime}</span>
                  <span>📍 {s.local}</span>
                </div>
                <p style={{ color: "#64748b", margin: 0, fontSize: 11 }}>{trainingFullName}</p>
                {team.length > 1 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    <span style={{ color: "#475569", fontSize: 11, fontWeight: 700 }}>Equipe:</span>
                    {team.map(t => {
                      const isMe = String(t.instructorId) === String(user.id);
                      return (
                        <span key={t.id} style={{
                          background: isMe ? "#ffa61918" : "#01323d",
                          border: "1px solid " + (isMe ? "#ffa61940" : "#154753"),
                          borderRadius: 6, padding: "2px 8px",
                          color: isMe ? "#ffa619" : "#94a3b8",
                          fontSize: 11, fontWeight: isMe ? 700 : 500,
                        }}>
                          {(t.instructorName || "—").split(" ")[0]}{isMe ? " (você)" : ""}
                        </span>
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
  );
};

// ── INSTRUCTOR PROFILE (7.10.2) ───────────────────────────────────────────────
const InstructorProfile = ({ user, instructors, setInstructors, setUser }) => {
  const instr = instructors.find(i => String(i.id) === String(user.id));
  const [changing, setChanging] = useState(false);
  const [oldPass, setOldPass]   = useState("");
  const [newPass, setNewPass]   = useState("");
  const [conf,    setConf]      = useState("");
  const [passErr, setPassErr]   = useState("");
  const [passOk,  setPassOk]    = useState(false);

  const changePass = async () => {
    setPassErr("");
    if (newPass.length < 6) { setPassErr("Nova senha precisa ter pelo menos 6 caracteres."); return; }
    if (newPass !== conf)   { setPassErr("As senhas não coincidem."); return; }
    const email = `${user.username}@relyon360.app`;
    const { error: authErr } = await sb.auth.signInWithPassword({ email, password: oldPass });
    if (authErr) { setPassErr("Senha atual incorreta."); return; }
    const { error } = await sb.auth.updateUser({ password: newPass, data: { mustChangePass: false } });
    if (error) { setPassErr("Erro: " + error.message); return; }
    setChanging(false); setOldPass(""); setNewPass(""); setConf(""); setPassOk(true);
    setTimeout(() => setPassOk(false), 3000);
  };

  if (!instr) return <p style={{ color: "#64748b" }}>Perfil não encontrado.</p>;
  return (
    <div>
      <h2 style={{ color: "#fff", fontWeight: 800, margin: "0 0 4px", fontSize: 24 }}>Meu Perfil</h2>
      <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 14 }}>Visualize seus dados e competências. Você pode alterar sua senha.</p>

      {passOk && (
        <div style={{ background: "#16a34a20", border: "1px solid #16a34a", borderRadius: 12, padding: "12px 16px", marginBottom: 20, color: "#16a34a", fontWeight: 600, fontSize: 14 }}>
          ✅ Senha alterada com sucesso!
        </div>
      )}

      {/* Personal data (read-only) */}
      <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,#ffa619,#e8920a)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20, flexShrink: 0 }}>
            {instr.avatar || instr.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div>
            <p style={{ color: "#e2e8f0", fontWeight: 800, margin: 0, fontSize: 18 }}>{instr.name}</p>
            <p style={{ color: "#64748b", fontSize: 13, margin: "3px 0 0" }}>{instr.contract} · {instr.base}</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            ["Usuário", "@" + (instr.username || "—")],
            ["E-mail",  instr.email  || "—"],
            ["Telefone",instr.phone  || "—"],
            ["Status",  instr.status || "—"],
            ["Líder",   instr.leader || "—"],
            ["Contrato",instr.contract || "—"],
          ].map(([k, v]) => (
            <div key={k} style={{ background: "#01323d", borderRadius: 10, padding: "10px 14px" }}>
              <p style={{ color: "#64748b", fontSize: 11, margin: "0 0 3px", fontWeight: 700, textTransform: "uppercase" }}>{k}</p>
              <p style={{ color: "#e2e8f0", fontSize: 14, margin: 0, fontWeight: 600 }}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Competencies (read-only) */}
      <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753", marginBottom: 20 }}>
        <h3 style={{ color: "#fff", fontWeight: 700, margin: "0 0 12px", fontSize: 16 }}>🎯 Competências</h3>
        {(instr.skills || []).length === 0 ? (
          <p style={{ color: "#64748b" }}>Nenhuma competência cadastrada.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(instr.skills || []).map(s => (
              <span key={s.name || s} style={{ padding: "5px 12px", borderRadius: 20, background: "#ffa61918", border: "1px solid #ffa61930", color: "#f59e0b", fontSize: 12 }}>{s.name || s}</span>
            ))}
          </div>
        )}
      </div>

      {/* Freelancer rates (read-only self-view) */}
      {instr.contract === "Freelancer" && (
        <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753", marginBottom: 20 }}>
          <h3 style={{ color: "#fff", fontWeight: 700, margin: "0 0 12px", fontSize: 16 }}>💰 Minhas Diárias</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: "#01323d", borderRadius: 10, padding: "10px 14px" }}>
              <p style={{ color: "#64748b", fontSize: 11, margin: "0 0 3px", fontWeight: 700, textTransform: "uppercase" }}>Teoria</p>
              <p style={{ color: "#e2e8f0", fontSize: 14, margin: 0, fontWeight: 600 }}>{instr.theoryRate != null ? `R$ ${Number(instr.theoryRate).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</p>
            </div>
            <div style={{ background: "#01323d", borderRadius: 10, padding: "10px 14px" }}>
              <p style={{ color: "#64748b", fontSize: 11, margin: "0 0 3px", fontWeight: 700, textTransform: "uppercase" }}>Prática</p>
              <p style={{ color: "#e2e8f0", fontSize: 14, margin: 0, fontWeight: 600 }}>{instr.practiceRate != null ? `R$ ${Number(instr.practiceRate).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</p>
            </div>
            {(instr.skills || []).some(s => s.name === "TRADUTOR") && (
              <div style={{ background: "#01323d", borderRadius: 10, padding: "10px 14px" }}>
                <p style={{ color: "#64748b", fontSize: 11, margin: "0 0 3px", fontWeight: 700, textTransform: "uppercase" }}>Tradução</p>
                <p style={{ color: "#e2e8f0", fontSize: 14, margin: 0, fontWeight: 600 }}>{instr.translationRate != null ? `R$ ${Number(instr.translationRate).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Password change */}
      <div style={{ background: "#073d4a", borderRadius: 16, padding: 24, border: "1px solid #154753" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ color: "#fff", fontWeight: 700, margin: 0, fontSize: 16 }}>🔒 Alterar Senha</h3>
          {!changing && <button onClick={() => setChanging(true)} style={{ padding: "8px 16px", background: "#ffa619", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Solicitar Alteração</button>}
        </div>
        {changing && (
          <div style={{ marginTop: 16 }}>
            <Input label="Senha Atual"    type="password" value={oldPass} onChange={e => { setOldPass(e.target.value); setPassErr(""); }} placeholder="Digite sua senha atual" />
            <Input label="Nova Senha"     type="password" value={newPass} onChange={e => { setNewPass(e.target.value); setPassErr(""); }} placeholder="Mínimo 6 caracteres" />
            <Input label="Confirmar Nova" type="password" value={conf}    onChange={e => { setConf(e.target.value);    setPassErr(""); }} placeholder="Repita a nova senha" />
            {passErr && <p style={{ color: "#f87171", fontSize: 13, margin: "-8px 0 12px" }}>{passErr}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={changePass} label="Salvar Nova Senha" icon="check" color="#16a34a" />
              <Btn onClick={() => { setChanging(false); setOldPass(""); setNewPass(""); setConf(""); setPassErr(""); }} label="Cancelar" color="#475569" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

