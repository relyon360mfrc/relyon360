const { useState, useEffect, useRef } = React;

// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://snpvqqsmwrlazawjknme.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucHZxcXNtd3JsYXphd2prbm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTg0MjAsImV4cCI6MjA5MDk5NDQyMH0.124Cybz_lv6Op1TM62kVUs87b60f4y5mIFhxwN09tlk';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const _DB_KEYS = ['relyon_trainings','relyon_areas','relyon_instructors','relyon_users','relyon_absences','relyon_locals','relyon_holidays','relyon_activities'];
// _DB_KEYS é a fonte autoritativa: __resetRelyOn360, _SYNC_LABELS e a RLS INSERT
// policy de app_state precisam estar alinhados a essa lista (RLS gerenciada via Supabase).
let _initialData = null;

// ── PASSWORD HASHING (bcryptjs) ──────────────────────────────────────────────
const _bc = dcodeIO.bcrypt;
const HASH_ROUNDS = 8;
const hashPw = (plain) => _bc.hashSync(plain, HASH_ROUNDS);
const checkPw = (plain, stored) => {
  if (!stored || !plain) return false;
  if (!stored.startsWith('$2')) return plain === stored; // legacy plaintext fallback
  return _bc.compareSync(plain, stored);
};

// ── SAVE EVENT BUS ────────────────────────────────────────────────────────────
const _saveListeners = [];
const onSaveEvent = (fn) => { _saveListeners.push(fn); return () => { const i = _saveListeners.indexOf(fn); if (i >= 0) _saveListeners.splice(i, 1); }; };
const _emitSave = (ev) => _saveListeners.forEach(fn => fn(ev));

// ── SYNC STATE (por chave) ────────────────────────────────────────────────────
const _syncState = {}; // key → { status: 'synced'|'pending'|'error'|'local', lastSync, error }
const _syncListeners = [];
const _emitSync = () => _syncListeners.forEach(fn => fn({ ..._syncState }));
const useSyncState = () => {
  const [s, setS] = useState(() => ({ ..._syncState }));
  useEffect(() => { const off = fn => { const i = _syncListeners.indexOf(fn); if (i >= 0) _syncListeners.splice(i, 1); }; const fn = v => setS(v); _syncListeners.push(fn); return () => off(fn); }, []);
  return s;
};

// ── PERSISTENT STATE HOOK (localStorage + Supabase) ──────────────────────────
const _LS_PREFIX = 'rl360_';

const usePersisted = (key, initialValue) => {
  const [state, setState] = useState(() => {
    // Prioridade: Supabase (carregado no AppLoader) > localStorage > default
    if (_initialData && _initialData[key] != null) {
      _liveData[key] = _initialData[key];
      return _initialData[key];
    }
    try {
      const ls = localStorage.getItem(_LS_PREFIX + key);
      if (ls != null) {
        const parsed = JSON.parse(ls);
        _liveData[key] = parsed;
        return parsed;
      }
    } catch {}
    _liveData[key] = initialValue;
    return initialValue;
  });
  const isFirst = useRef(true);
  useEffect(() => {
    _liveData[key] = state;
    if (isFirst.current) { isFirst.current = false; return; }
    // 1. localStorage — síncrono, sobrevive Ctrl+Shift+R e fechamento de aba
    try { localStorage.setItem(_LS_PREFIX + key, JSON.stringify(state)); } catch {}
    // 2. Supabase — assíncrono, fonte autoritativa entre dispositivos
    _syncState[key] = { status: 'pending', lastSync: _syncState[key]?.lastSync };
    _emitSync();
    _emitSave({ pending: true, key });
    sb.from('app_state').upsert({ key, value: state }, { onConflict: 'key' })
      .then(({ error }) => {
        if (error) {
          _syncState[key] = { status: 'error', lastSync: _syncState[key]?.lastSync, error: error.message };
          _emitSync();
          _emitSave({ ok: false, key, msg: error.message });
        } else {
          _syncState[key] = { status: 'synced', lastSync: Date.now() };
          _emitSync();
          _emitSave({ ok: true, key });
        }
      });
  }, [key, state]);
  return [state, setState];
};

// ── BACKUP EXPORT ─────────────────────────────────────────────────────────────
const _liveData = {};

const _triggerDownload = () => {
  const payload = _DB_KEYS.map(k => ({ key: k, value: _liveData[k], saved_at: new Date().toISOString() }));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = 'relyon360-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); URL.revokeObjectURL(url);
};

window.__exportBackup = _triggerDownload;
// Download manual disponível via window.__exportBackup() ou pelo botão na SobrePage

// ── RESET STORAGE (dev helper — exige senha de developer) ───────────────────────
window.__resetRelyOn360 = () => {
  const pw = prompt('⚠️ Esta ação apaga TODOS os dados de todos os usuários.\nDigite a senha do developer para confirmar:');
  if (!pw) return;
  const devUsers = (_liveData.relyon_users || []).filter(u => u.role === 'developer');
  const ok = devUsers.some(u => checkPw(pw, u.password));
  if (!ok) { alert('Senha incorreta. Reset cancelado.'); return; }
  Promise.all([
    sb.from('app_state').delete().in('key', _DB_KEYS),
    sb.from('relyon_schedules').delete().gt('id', 0),
    sb.from('relyon_notifications').delete().gt('id', 0),
  ]).then(() => location.reload());
};

// ── SCHEDULES — tabela real no Supabase (não mais app_state) ─────────────────
// Fila serial: evita race condition entre INSERT e DELETE concorrentes.
// Ex: savePlan → INSERT; deleteClass → DELETE logo depois.
// Sem fila, o INSERT pode terminar APÓS o DELETE e re-inserir as linhas.
let _persistQueue = Promise.resolve();
const _enqueuePersist = (prev, next) => {
  _persistQueue = _persistQueue
    .then(() => _persistSchedules(prev, next))
    .catch(err => _emitSave({ ok: false, key: 'relyon_schedules', msg: err.message }));
};

// Gera id bigint-safe para schedule rows.
// Antes: Date.now() + Math.random() → float64 com perda de precisão no transit
//        JS↔Postgres↔Realtime; coluna era double precision sem PK; DELETE por id
//        falhava silenciosamente. Migração 2026-05-02 trocou id para bigint + PK.
// Agora: Date.now() * 1000 + counter — inteiro puro, fits em bigint e Number.MAX_SAFE_INTEGER.
let _scheduleIdCounter = 0;
const newScheduleId = () => Date.now() * 1000 + ((_scheduleIdCounter++) % 1000);
window.__newScheduleId = newScheduleId;

// classId UUID por turma — toda row de uma mesma turma compartilha esse id.
// Identifica a turma de forma única e estável, mesmo quando classNames colidem
// entre semanas (ex: duas "MCIA - 01" em semanas diferentes).
const newClassId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback: timestamp + random — bom o bastante para ambiente sem crypto.randomUUID
  return `cls-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};
window.__newClassId = newClassId;

// Helper defensivo: DELETE explícito por classId (UUID único por turma).
// Usado por deleteClass e saveEditItems para garantir que rows velhas vão embora
// mesmo se o diff falhar por qualquer motivo (precisão, race, realtime fora de sync).
// Antes era por className, mas isso apagava turmas distintas com mesmo nome.
const _deleteSchedulesByClassId = (classId) => {
  _persistQueue = _persistQueue
    .then(async () => {
      const { error } = await sb.from('relyon_schedules').delete().eq('classId', classId);
      if (error) throw new Error(error.message);
    })
    .catch(err => _emitSave({ ok: false, key: 'relyon_schedules', msg: err.message }));
  return _persistQueue;
};
window.__deleteSchedulesByClassId = _deleteSchedulesByClassId;

async function _persistSchedules(prev, next) {
  const prevMap = new Map(prev.map(s => [String(s.id), s]));
  const nextMap = new Map(next.map(s => [String(s.id), s]));
  const strip = ({ created_at, updated_at, ...r }) => r;
  const toInsert = next.filter(s => !prevMap.has(String(s.id)));
  const toDelete = prev.filter(s => !nextMap.has(String(s.id))).map(s => s.id);
  const toUpdate = next.filter(s => {
    if (!prevMap.has(String(s.id))) return false;
    return JSON.stringify(prevMap.get(String(s.id))) !== JSON.stringify(s);
  });
  if (toInsert.length) {
    const { error } = await sb.from('relyon_schedules').insert(toInsert.map(strip));
    if (error) throw new Error(error.message);
  }
  if (toDelete.length) {
    const { error } = await sb.from('relyon_schedules').delete().in('id', toDelete);
    if (error) throw new Error(error.message);
  }
  for (const s of toUpdate) {
    const { id, created_at, updated_at, ...rest } = s;
    const { error } = await sb.from('relyon_schedules').update(rest).eq('id', id);
    if (error) throw new Error(error.message);
  }
}

const useSchedules = () => {
  const [schedules, _setLocal] = useState([]);
  useEffect(() => {
    // .range(0, 49999) bypassa o limite default de 1000 rows do Supabase.
    // Sem isso, a partir de ~1000 schedules cumulativos, datas mais recentes
    // ficavam de fora — calendário aparecia truncado (ver bug 2026-05-19).
    sb.from('relyon_schedules').select('*').order('date', { ascending: true }).range(0, 49999)
      .then(({ data }) => { if (data) { _liveData.relyon_schedules = data; _setLocal(data); } });
    const ch = sb.channel('relyon_sched_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relyon_schedules' },
        ({ eventType, new: nw, old: od }) => {
          _setLocal(prev => {
            let next;
            const sid = r => String(r.id);
            if (eventType === 'INSERT') next = prev.find(s => sid(s) === sid(nw)) ? prev : [...prev, nw];
            else if (eventType === 'DELETE') next = prev.filter(s => sid(s) !== sid(od));
            else if (eventType === 'UPDATE') next = prev.map(s => sid(s) === sid(nw) ? nw : s);
            else next = prev;
            _liveData.relyon_schedules = next;
            return next;
          });
        })
      .subscribe();
    return () => sb.removeChannel(ch);
  }, []);
  const setSchedules = React.useCallback(valOrFn => {
    _setLocal(prev => {
      let next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      // Frente 3 (DESIGN §18.3): se campo crítico mudou em row confirmada → invalida ciência
      next = _invalidateConfirmationOnCriticalChange(prev, next);
      _liveData.relyon_schedules = next;
      _enqueuePersist(prev, next);
      // Frente 3: gera notificações para os instrutores afetados por inserções/alterações/cancelamentos
      try { generateNotificationsFromScheduleDiff(prev, next); } catch (e) { console.error('notif diff err', e); }
      return next;
    });
  }, []);
  return [schedules, setSchedules];
};

// Invalida ciência (volta status para Pendente) se campo crítico mudou em row já confirmada.
function _invalidateConfirmationOnCriticalChange(prev, next) {
  const prevMap = new Map((prev || []).map(s => [String(s.id), s]));
  return next.map(n => {
    const p = prevMap.get(String(n.id));
    if (!p) return n;
    const changed = _CRITICAL_SCHEDULE_FIELDS.some(k => p[k] !== n[k]);
    if (!changed) return n;
    if (n.status === 'Confirmado') {
      return { ...n, status: 'Pendente', confirmedAt: null, confirmedBy: null };
    }
    return n;
  });
}



// ── NOTIFICATIONS — Central de notificações do instrutor (DESIGN §18.2) ───────
// Tabela: relyon_notifications. Realtime habilitado. Geração client-side por savePlan/saveEditItems/deleteClass.

const _CRITICAL_SCHEDULE_FIELDS = ['date', 'startTime', 'endTime', 'local'];

// Helper externo — usado pelo schedule.js para criar notificações ao mudar agendas.
async function createNotification({ instructorId, type, title, body, linkClassId, linkScheduleId }) {
  if (!instructorId || !type || !title) return;
  try {
    const { error } = await sb.from('relyon_notifications').insert({
      instructor_id: String(instructorId),
      type,
      title,
      body: body || null,
      link_class_id: linkClassId || null,
      link_schedule_id: linkScheduleId != null ? Number(linkScheduleId) : null,
    });
    if (error) console.error('createNotification error:', error.message);
  } catch (e) { console.error('createNotification exception:', e); }
}
window.__createNotification = createNotification;

// Diff entre prev e next de schedules → gera notificações por instrutor afetado.
// Detecta: new_module (inserções), module_changed (campos críticos alterados), module_cancelled (deleções).
// Filtra alterações irrelevantes (status, confirmedAt, issueLog) — só campos críticos disparam aviso.
function generateNotificationsFromScheduleDiff(prev, next) {
  const prevMap = new Map((prev || []).map(s => [String(s.id), s]));
  const nextMap = new Map((next || []).map(s => [String(s.id), s]));
  const fmtDate = d => {
    try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
    catch { return d; }
  };

  // INSERTs — só notifica se a linha não estava em prev e tem instructorId
  for (const s of nextMap.values()) {
    if (prevMap.has(String(s.id))) continue;
    if (!s.instructorId) continue;
    createNotification({
      instructorId: s.instructorId,
      type: 'new_module',
      title: `Novo módulo: ${s.module || s.trainingName || 'Treinamento'}`,
      body: `${s.className} · ${fmtDate(s.date)} · ${s.startTime}–${s.endTime} · ${s.local || ''}`,
      linkClassId: s.classId,
      linkScheduleId: s.id,
    });
  }

  // DELETEs — só notifica se tinha instructorId
  for (const s of prevMap.values()) {
    if (nextMap.has(String(s.id))) continue;
    if (!s.instructorId) continue;
    createNotification({
      instructorId: s.instructorId,
      type: 'module_cancelled',
      title: `Cancelamento: ${s.module || s.trainingName || 'Treinamento'}`,
      body: `${s.className} · ${fmtDate(s.date)} · ${s.startTime}–${s.endTime}`,
      linkClassId: s.classId,
      linkScheduleId: s.id,
    });
  }

  // UPDATEs — só notifica quando um campo crítico mudou
  for (const next of nextMap.values()) {
    const prev = prevMap.get(String(next.id));
    if (!prev) continue;
    if (!next.instructorId) continue;
    const changed = _CRITICAL_SCHEDULE_FIELDS.some(k => prev[k] !== next[k]);
    if (!changed) continue;
    const changes = _CRITICAL_SCHEDULE_FIELDS
      .filter(k => prev[k] !== next[k])
      .map(k => `${k}: ${prev[k] || '—'} → ${next[k] || '—'}`)
      .join('; ');
    createNotification({
      instructorId: next.instructorId,
      type: 'module_changed',
      title: `Alteração: ${next.module || next.trainingName || 'Treinamento'}`,
      body: `${next.className} · ${fmtDate(next.date)} · ${changes}`,
      linkClassId: next.classId,
      linkScheduleId: next.id,
    });
    // Invalida a ciência: campo crítico mudou após confirmação → volta a Pendente
    if (prev.status === 'Confirmado' && next.status === 'Confirmado' && next.confirmedAt) {
      // o invalidamento real é feito por _invalidateConfirmationOnCriticalChange,
      // que retorna o objeto next ajustado. Aqui apenas geramos a notificação.
    }
  }
}
window.__generateNotificationsFromScheduleDiff = generateNotificationsFromScheduleDiff;

// Hook que carrega notifs do instrutor logado + Realtime updates.
const useNotifications = (instructorId) => {
  const [notifs, setNotifs] = useState([]);
  useEffect(() => {
    if (!instructorId) return;
    const idStr = String(instructorId);
    let mounted = true;
    sb.from('relyon_notifications')
      .select('*')
      .eq('instructor_id', idStr)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => { if (mounted && data) setNotifs(data); });
    const ch = sb.channel('relyon_notif_rt_' + idStr)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'relyon_notifications', filter: `instructor_id=eq.${idStr}` },
          ({ eventType, new: nw, old: od }) => {
            setNotifs(prev => {
              if (eventType === 'INSERT') {
                if (prev.find(n => n.id === nw.id)) return prev;
                return [nw, ...prev];
              }
              if (eventType === 'UPDATE') return prev.map(n => n.id === nw.id ? nw : n);
              if (eventType === 'DELETE') return prev.filter(n => n.id !== od.id);
              return prev;
            });
          })
      .subscribe();
    return () => { mounted = false; sb.removeChannel(ch); };
  }, [instructorId]);

  const markRead = React.useCallback(async (id) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    await sb.from('relyon_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  }, []);

  const markAllRead = React.useCallback(async () => {
    const ids = notifs.filter(n => !n.read_at).map(n => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    setNotifs(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }));
    await sb.from('relyon_notifications').update({ read_at: now }).in('id', ids);
  }, [notifs]);

  return { notifs, markRead, markAllRead };
};

// ── UTILS ────────────────────────────────────────────────────────────────────
const timeToMins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

// Resolve se uma skill do instrutor cobre um módulo pelo id (novo formato)
// ou pelo nome (formato legado / órfãs). Suporta ambos para retrocompatibilidade.
const skillMatchesModule = (skill, mod) => {
  if (!skill || !mod) return false;
  if (skill.moduleId != null) return String(skill.moduleId) === String(mod.id);
  const name = typeof skill === 'string' ? skill : skill.name;
  return name === mod.name;
};

// Variante para schedule rows históricos onde só temos o nome do módulo (string).
// Usa item.moduleId se disponível; senão faz lookup no catálogo pelo nome.
const skillMatchesModuleName = (skill, moduleName, trainings) => {
  if (!skill || !moduleName) return false;
  if (skill.moduleId != null) {
    for (const t of trainings) {
      const m = (t.modules || []).find(m => String(m.id) === String(skill.moduleId));
      if (m) return m.name === moduleName;
    }
    return false;
  }
  const name = typeof skill === 'string' ? skill : skill.name;
  return name === moduleName;
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    const touch = window.matchMedia('(hover: none)').matches;
    return window.innerWidth < 768 || (touch && window.innerWidth < 1024);
  });
  useEffect(() => {
    const check = () => {
      const touch = window.matchMedia('(hover: none)').matches;
      setIsMobile(window.innerWidth < 768 || (touch && window.innerWidth < 1024));
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
};

const useIsTouch = () => {
  const [isTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(hover: none)').matches;
  });
  return isTouch;
};

