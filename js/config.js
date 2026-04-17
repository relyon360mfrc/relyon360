const { useState, useEffect, useRef } = React;

// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://snpvqqsmwrlazawjknme.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucHZxcXNtd3JsYXphd2prbm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTg0MjAsImV4cCI6MjA5MDk5NDQyMH0.124Cybz_lv6Op1TM62kVUs87b60f4y5mIFhxwN09tlk';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const _DB_KEYS = ['relyon_schedules','relyon_trainings','relyon_areas','relyon_instructors','relyon_users','relyon_absences','relyon_locals'];
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
    if (_initialData && _initialData[key] != null) return _initialData[key];
    return initialValue;
  });
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    sb.from('app_state').upsert({ key, value: state }, { onConflict: 'key' })
      .then(({ error }) => {
        if (error) {
          console.error('[RelyOn] Erro ao salvar "' + key + '":', error.message);
          _emitSave({ ok: false, key, msg: error.message });
        } else {
          _emitSave({ ok: true, key });
        }
      });
  }, [key, state]);
  return [state, setState];
};

// ── BACKUP EXPORT ─────────────────────────────────────────────────────────────
window.__exportBackup = async () => {
  const { data } = await sb.from('app_state').select('key,value,updated_at');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = 'relyon360-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(url);
};

// ── RESET STORAGE (dev helper exposed to browser console) ─────────────────────
window.__resetRelyOn360 = () => {
  sb.from('app_state').delete().in('key', _DB_KEYS).then(() => location.reload());
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

