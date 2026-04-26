const { useState, useEffect, useRef } = React;

// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://snpvqqsmwrlazawjknme.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucHZxcXNtd3JsYXphd2prbm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTg0MjAsImV4cCI6MjA5MDk5NDQyMH0.124Cybz_lv6Op1TM62kVUs87b60f4y5mIFhxwN09tlk';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const _DB_KEYS = ['relyon_trainings','relyon_areas','relyon_instructors','relyon_users','relyon_absences','relyon_locals'];
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

// ── PERSISTENT STATE HOOK (Supabase-backed) ───────────────────────────────────
const usePersisted = (key, initialValue) => {
  const [state, setState] = useState(() => {
    const v = (_initialData && _initialData[key] != null) ? _initialData[key] : initialValue;
    _liveData[key] = v;
    return v;
  });
  const isFirst = useRef(true);
  useEffect(() => {
    _liveData[key] = state;
    if (isFirst.current) { isFirst.current = false; return; }
    sb.from('app_state').upsert({ key, value: state }, { onConflict: 'key' })
      .then(({ error }) => {
        if (error) {
          _emitSave({ ok: false, key, msg: error.message });
        } else {
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
  ]).then(() => location.reload());
};

// ── SCHEDULES — tabela real no Supabase (não mais app_state) ─────────────────
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
  if (toInsert.length) await sb.from('relyon_schedules').insert(toInsert.map(strip));
  if (toDelete.length) await sb.from('relyon_schedules').delete().in('id', toDelete);
  for (const s of toUpdate) {
    const { id, created_at, updated_at, ...rest } = s;
    await sb.from('relyon_schedules').update(rest).eq('id', id);
  }
}

const useSchedules = () => {
  const [schedules, _setLocal] = useState([]);
  useEffect(() => {
    sb.from('relyon_schedules').select('*').order('date', { ascending: true })
      .then(({ data }) => { if (data) { _liveData.relyon_schedules = data; _setLocal(data); } });
    const ch = sb.channel('relyon_sched_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relyon_schedules' },
        ({ eventType, new: nw, old: od }) => {
          _setLocal(prev => {
            let next;
            if (eventType === 'INSERT') next = prev.find(s => s.id === nw.id) ? prev : [...prev, nw];
            else if (eventType === 'DELETE') next = prev.filter(s => s.id !== od.id);
            else if (eventType === 'UPDATE') next = prev.map(s => s.id === nw.id ? nw : s);
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
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      _liveData.relyon_schedules = next;
      _persistSchedules(prev, next).catch(err => _emitSave({ ok: false, key: 'relyon_schedules', msg: err.message }));
      return next;
    });
  }, []);
  return [schedules, setSchedules];
};



// ── UTILS ────────────────────────────────────────────────────────────────────
const timeToMins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
};

