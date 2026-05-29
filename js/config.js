const { useState, useEffect, useRef } = React;

// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://snpvqqsmwrlazawjknme.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucHZxcXNtd3JsYXphd2prbm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTg0MjAsImV4cCI6MjA5MDk5NDQyMH0.124Cybz_lv6Op1TM62kVUs87b60f4y5mIFhxwN09tlk';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const _DB_KEYS = ['relyon_trainings','relyon_areas','relyon_instructors','relyon_users','relyon_absences','relyon_locals','relyon_holidays','relyon_activities','relyon_requests','relyon_ai_packages','relyon_class_tombstones'];
// _DB_KEYS é a fonte autoritativa: __resetRelyOn360, _SYNC_LABELS e a RLS INSERT
// policy de app_state precisam estar alinhados a essa lista (RLS gerenciada via Supabase).
// 'relyon_class_tombstones' é especial: gravado fora do usePersisted (via _markClassDeleted)
// porque vive em memória + LS + Supabase, não num useState React.
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
    .then(() => {
      // Fase 2: aproveita janela quente de conexão para drenar a outbox.
      if (_outboxStats().pending > 0) _outboxFlush();
    })
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

// ── TOMBSTONE DE CLASSES EXCLUÍDAS ────────────────────────────────────────────
// Problema: quando o usuário exclui uma turma, o DELETE corre no Supabase, mas
// eventos Realtime INSERT de saves anteriores (ainda em trânsito) chegam depois
// do DELETE e ressuscitam as rows no estado local. Na reconciliação do próximo boot,
// essas rows são tratadas como "pendentes" e re-inseridas no banco — ciclo eterno.
// Solução: ao deletar uma turma, gravamos o classId num tombstone:
//   1. Memória do processo (_deletedClassIdsMemory) — guard imediato
//   2. localStorage (_LS_DELETED_CLASSES_KEY) — sobrevive ao F5 single-device
//   3. Supabase (app_state[key='relyon_class_tombstones']) — GLOBAL,
//      fecha o gap multi-device. Se a aba A apaga e B estava offline,
//      no próximo boot B busca os tombstones e bloqueia a ressurreição.
const _LS_DELETED_CLASSES_KEY = _LS_PREFIX + 'deleted_classes';
const _TOMBSTONE_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas (limpeza local)
const _TOMBSTONE_DB_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias (limpeza global)
const _TOMBSTONE_DB_KEY = 'relyon_class_tombstones';
const _deletedClassIdsMemory = new Set();

const _readDeletedClasses = () => {
  try {
    const raw = localStorage.getItem(_LS_DELETED_CLASSES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
};

// Fila serial para upserts no app_state — evita race condition em deletes rápidos consecutivos.
let _tombstoneSyncQueue = Promise.resolve();
const _syncTombstoneToSupabase = (map) => {
  _tombstoneSyncQueue = _tombstoneSyncQueue.then(async () => {
    try {
      const { error } = await sb.from('app_state')
        .upsert({ key: _TOMBSTONE_DB_KEY, value: map }, { onConflict: 'key' });
      if (error) console.warn('[tombstone] upsert falhou:', error.message);
    } catch (e) {
      console.warn('[tombstone] upsert exception:', e?.message || e);
    }
  });
  return _tombstoneSyncQueue;
};

const _markClassDeleted = (classId) => {
  if (!classId) return;
  _deletedClassIdsMemory.add(classId);
  const map = _readDeletedClasses();
  const now = Date.now();
  map[classId] = now;
  // Limpa entradas expiradas (TTL local — não invalida o tombstone no Supabase)
  for (const id of Object.keys(map)) {
    if (now - map[id] > _TOMBSTONE_TTL_MS) delete map[id];
  }
  try { localStorage.setItem(_LS_DELETED_CLASSES_KEY, JSON.stringify(map)); } catch {}
  // Espelha no Supabase para fechar gap multi-device.
  _syncTombstoneToSupabase(map);
};

const _isClassDeleted = (classId) => {
  if (!classId) return false;
  if (_deletedClassIdsMemory.has(classId)) return true;
  const map = _readDeletedClasses();
  const ts = map[classId];
  if (!ts) return false;
  if ((Date.now() - ts) >= _TOMBSTONE_TTL_MS) return false;
  _deletedClassIdsMemory.add(classId); // popula memória no boot
  return true;
};
window.__isClassDeleted = _isClassDeleted;

// Populador chamado pelo AppLoader assim que _initialData chega.
// Hidrata _deletedClassIdsMemory com os tombstones globais (Supabase),
// garantindo que a reconciliação do useSchedules já saiba o que está deletado.
const _hydrateTombstonesFromInitialData = () => {
  const dbMap = _initialData && _initialData[_TOMBSTONE_DB_KEY];
  if (!dbMap || typeof dbMap !== 'object') return;
  const now = Date.now();
  const merged = _readDeletedClasses();
  for (const [cid, ts] of Object.entries(dbMap)) {
    if (typeof ts !== 'number') continue;
    // TTL global de 7 dias — depois disso ignora.
    if (now - ts > _TOMBSTONE_DB_TTL_MS) continue;
    _deletedClassIdsMemory.add(cid);
    // Atualiza LS local se ainda não tem (ou tem timestamp mais antigo)
    if (!merged[cid] || merged[cid] < ts) merged[cid] = ts;
  }
  try { localStorage.setItem(_LS_DELETED_CLASSES_KEY, JSON.stringify(merged)); } catch {}
};
window.__hydrateTombstones = _hydrateTombstonesFromInitialData;

// Helper defensivo: DELETE explícito por classId (UUID único por turma).
// Usado por deleteClass e saveEditItems para garantir que rows velhas vão embora
// mesmo se o diff falhar por qualquer motivo (precisão, race, realtime fora de sync).
// Antes era por className, mas isso apagava turmas distintas com mesmo nome.
const _deleteSchedulesByClassId = (classId) => {
  _markClassDeleted(classId); // tombstone imediato — bloqueia eco Realtime e reconciliação
  _persistQueue = _persistQueue
    .then(async () => {
      const { error } = await sb.from('relyon_schedules').delete().eq('classId', classId);
      if (error) throw new Error(error.message);
    })
    .catch(err => {
      _outboxEnqueue({ op: 'delete-by-class', classId }, err);
      _emitSave({ ok: false, key: 'relyon_schedules', msg: 'Exclusão enfileirada para retry: ' + err.message });
    });
  return _persistQueue;
};
window.__deleteSchedulesByClassId = _deleteSchedulesByClassId;

// ── OUTBOX DE relyon_schedules ────────────────────────────────────────────────
// Fila de operações que falharam no Supabase (rede / RLS / 5xx). Persistida em
// localStorage para sobreviver a refresh. Flush automático em: boot, evento
// 'online', sucesso de outra escrita, timer de backoff. Estratégia LWW por
// decisão explícita: UPDATE bate na row mesmo se outro cliente editou depois;
// DELETE em row já apagada vira no-op silencioso (PostgREST retorna sucesso 0
// rows). Conflitos multi-usuário são tratados via console.warn — não há merge.
const _OUTBOX_KEY = _LS_PREFIX + 'schedules_outbox';
// Backoff em ms: 2s → 8s → 30s → 2min → 10min → 30min (clamp em 30min).
const _OUTBOX_BACKOFF_MS = [2000, 8000, 30000, 120000, 600000, 1800000];
const _OUTBOX_MAX_OPS_WARN = 50;

const _outboxRead = () => {
  try {
    const raw = localStorage.getItem(_OUTBOX_KEY);
    if (!raw) return { ops: [] };
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.ops) ? parsed : { ops: [] };
  } catch { return { ops: [] }; }
};
const _outboxWrite = (state) => {
  try { localStorage.setItem(_OUTBOX_KEY, JSON.stringify(state)); } catch {}
};
const _outboxStats = () => {
  const ops = _outboxRead().ops;
  return {
    total: ops.length,
    pending: ops.filter(o => o.status === 'pending').length,
    failedRls: ops.filter(o => o.status === 'failed-rls').length,
    oldestQueuedAt: ops.reduce((min, o) => Math.min(min, o.queuedAt), Infinity),
  };
};
window.__outboxStats = _outboxStats;
window.__outboxList = () => _outboxRead().ops;
window.__outboxClear = () => { _outboxWrite({ ops: [] }); _emitSave({ ok: true, key: 'relyon_schedules' }); };
window.__outboxRemove = (id) => {
  const state = _outboxRead();
  state.ops = state.ops.filter(o => o.id !== id);
  _outboxWrite(state);
  _emitSave({ ok: true, key: 'relyon_schedules' });
};

// Detecta erros de RLS / autorização — esses não devem fazer retry automático
// (vão ficar pingando sem chance de sucesso). Marcamos failed-rls; a Fase 3 mostra
// alerta vermelho permanente para investigação manual.
const _isRlsError = (err) => {
  const msg = ((err && err.message) || '').toLowerCase();
  return msg.includes('row-level security') || msg.includes('row level security') ||
         msg.includes('permission denied') || msg.includes('not authorized') ||
         msg.includes('jwt') || msg.includes('rls');
};

// Detecta violação do UNIQUE INDEX relyon_schedules_unique_slot (criado 2026-05-26
// pós-incidente de duplicação). Postgres devolve "duplicate key value violates
// unique constraint". Quando isso aparece em INSERT, a row equivalente já existe
// no SB — tratar como sucesso silencioso em vez de enfileirar retry eterno.
const _isUniqueViolation = (err) => {
  const msg = ((err && err.message) || '').toLowerCase();
  return msg.includes('duplicate key value') ||
         msg.includes('violates unique constraint') ||
         msg.includes('23505');
};

function _outboxEnqueue(op, err) {
  const state = _outboxRead();
  const entry = {
    id: `obx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    op: op.op,
    rows: op.rows || null,
    ids: op.ids || null,
    row: op.row || null,
    classId: op.classId || null,
    attempts: 0,
    queuedAt: Date.now(),
    lastAttemptAt: null,
    lastError: err ? err.message : null,
    status: _isRlsError(err) ? 'failed-rls' : 'pending',
  };
  state.ops.push(entry);
  _outboxWrite(state);
  if (state.ops.length >= _OUTBOX_MAX_OPS_WARN) {
    console.error(`[outbox] ${state.ops.length} ops pendentes — investigar causa.`);
  }
  console.warn(`[outbox] enfileirado ${entry.op} (status=${entry.status}, erro="${entry.lastError}")`);
  if (entry.status === 'pending') _scheduleOutboxFlush();
  return entry;
}

async function _executeOutboxOp(entry) {
  // Reexecuta a op original contra o Supabase. LWW: usa upsert para insert
  // (cobre o caso raríssimo do id já existir por reentrada), e simples update/
  // delete por id para os outros — update em row inexistente retorna 0 rows sem
  // erro, delete idem.
  if (entry.op === 'insert' && entry.rows && entry.rows.length) {
    const { error } = await sb.from('relyon_schedules').upsert(entry.rows, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  } else if (entry.op === 'delete' && entry.ids && entry.ids.length) {
    const { error } = await sb.from('relyon_schedules').delete().in('id', entry.ids);
    if (error) throw new Error(error.message);
  } else if (entry.op === 'update' && entry.row && entry.row.id != null) {
    // Strip issueStatus: coluna não existe na tabela (status derivado de issueLog).
    // Sem strip, ops antigas em LS continuam falhando com PGRST204 mesmo após o fix do dashboard.
    const { id, issueStatus, ...rest } = entry.row;
    const { error } = await sb.from('relyon_schedules').update(rest).eq('id', id);
    if (error) throw new Error(error.message);
  } else if (entry.op === 'delete-by-class' && entry.classId) {
    const { error } = await sb.from('relyon_schedules').delete().eq('classId', entry.classId);
    if (error) throw new Error(error.message);
  } else {
    throw new Error(`Op inválida na outbox: ${entry.op}`);
  }
}

let _outboxFlushing = false;
let _outboxFlushTimer = null;

const _backoffMs = (attempts) =>
  _OUTBOX_BACKOFF_MS[Math.min(attempts, _OUTBOX_BACKOFF_MS.length - 1)];

async function _outboxFlush() {
  if (_outboxFlushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  _outboxFlushing = true;
  let progressed = false;
  try {
    // Purga ops zumbi: inserts com qualquer row sem id são lixo. Tentar patchá-las
    // (ids novos) e reenviar foi MAU CAMINHO (2026-05-26): as rows já existiam no
    // SB com ids originais e o reinsert criou duplicatas. Manter o purge original.
    {
      const raw = _outboxRead();
      const cleaned = raw.ops.filter(o => {
        if (o.op === 'insert' && Array.isArray(o.rows) && o.rows.some(r => !r || r.id == null)) {
          console.warn(`[outbox] descartando op zumbi ${o.id} (insert com ${o.rows.length} row(s), alguma sem id).`);
          return false;
        }
        return true;
      });
      if (cleaned.length !== raw.ops.length) {
        _outboxWrite({ ops: cleaned });
        progressed = true;
      }
    }
    const state = _outboxRead();
    const now = Date.now();
    const ready = state.ops.filter(o =>
      o.status === 'pending' &&
      (o.lastAttemptAt == null || (o.lastAttemptAt + _backoffMs(o.attempts)) <= now)
    );
    for (const entry of ready) {
      try {
        await _executeOutboxOp(entry);
        // Sucesso: remove da outbox (re-ler porque algo pode ter mudado no meio).
        const fresh = _outboxRead();
        fresh.ops = fresh.ops.filter(o => o.id !== entry.id);
        _outboxWrite(fresh);
        progressed = true;
        console.info(`[outbox] op ${entry.op} aplicada após ${entry.attempts + 1} tentativa(s)`);
      } catch (err) {
        // Violação do UNIQUE INDEX em INSERT replay = row já existe no SB.
        // Remove a op da outbox em vez de continuar tentando.
        if (entry.op === 'insert' && _isUniqueViolation(err)) {
          const fresh = _outboxRead();
          fresh.ops = fresh.ops.filter(o => o.id !== entry.id);
          _outboxWrite(fresh);
          progressed = true;
          console.warn(`[outbox] op ${entry.id} removida: row(s) já existem no SB (unique violation).`);
          continue;
        }
        const fresh = _outboxRead();
        const target = fresh.ops.find(o => o.id === entry.id);
        if (target) {
          target.attempts++;
          target.lastAttemptAt = Date.now();
          target.lastError = err.message;
          if (_isRlsError(err)) target.status = 'failed-rls';
          _outboxWrite(fresh);
        }
        console.warn(`[outbox] op ${entry.op} falhou (tentativa ${entry.attempts + 1}): ${err.message}`);
      }
    }
  } finally {
    _outboxFlushing = false;
  }
  if (progressed) _emitSave({ ok: true, key: 'relyon_schedules' });
  _scheduleOutboxFlush();
}
window.__outboxFlush = _outboxFlush;

// Reconciliação on-demand: empurra ao Supabase todas as rows que estão em
// localStorage mas não no banco. Cobre o gap onde a outbox está vazia mas
// o banco está desatualizado (falha silenciosa em escrita anterior sem registro
// de outbox). É o mesmo algoritmo da reconciliação de boot em useSchedules,
// mas acionável pelo usuário via botão "Forçar sincronização".
window.__fullReconcile = async () => {
  const _stripRow = ({ created_at, updated_at, issueStatus, ...r }) => r;
  const ls = _readLocalSchedules() || [];
  const PAGE = 1000;
  const sbIds = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('relyon_schedules')
      .select('id').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    data.forEach(r => sbIds.add(String(r.id)));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  const missing = ls.filter(s =>
    s && s.id != null &&
    !sbIds.has(String(s.id)) &&
    !_isClassDeleted(s.classId)
  );
  if (missing.length === 0) return { inserted: 0 };
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH).map(_stripRow);
    const { error } = await sb.from('relyon_schedules').insert(batch);
    if (error && !_isUniqueViolation(error)) throw new Error(error.message);
    if (!error) inserted += batch.length;
  }
  return { inserted, total: missing.length };
};

function _scheduleOutboxFlush() {
  if (_outboxFlushTimer) { clearTimeout(_outboxFlushTimer); _outboxFlushTimer = null; }
  const ops = _outboxRead().ops.filter(o => o.status === 'pending');
  if (ops.length === 0) return;
  const now = Date.now();
  const nextRun = ops
    .map(o => (o.lastAttemptAt || 0) + _backoffMs(o.attempts))
    .reduce((min, t) => Math.min(min, t), Infinity);
  const delay = Math.max(0, nextRun - now);
  _outboxFlushTimer = setTimeout(() => { _outboxFlushTimer = null; _outboxFlush(); }, delay);
}

// Listeners de ciclo de vida — disparam flush quando a conexão volta ou quando
// o usuário reabre a aba. Boot delay de 3s evita correr contra o fetch inicial
// do useSchedules (que pode fazer reconciliação que já cobre algumas pendências).
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { console.info('[outbox] online detectado — flushing'); _outboxFlush(); });
  window.addEventListener('focus', () => _outboxFlush());
  setTimeout(() => _outboxFlush(), 3000);
  // Guard: avisa antes de fechar a aba quando há pendências reais. O Chrome
  // ignora a mensagem custom desde 2017, mas o prompt nativo aparece. Em uso
  // normal (outbox vazia) nem dispara — silencioso por padrão.
  window.addEventListener('beforeunload', (e) => {
    if (_outboxStats().pending > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

async function _persistSchedules(prev, next) {
  const prevMap = new Map(prev.map(s => [String(s.id), s]));
  const nextMap = new Map(next.map(s => [String(s.id), s]));
  // issueStatus: coluna não existe (derivado de issueLog) — stripa defensivamente.
  const strip = ({ created_at, updated_at, issueStatus, ...r }) => r;
  const toInsert = next.filter(s => !prevMap.has(String(s.id)));
  const toDelete = prev.filter(s => !nextMap.has(String(s.id))).map(s => s.id);
  // Comparação ignora created_at/updated_at — eles vêm do banco em prev mas não em
  // next (objetos gerados no cliente), o que marcaria rows idênticas como UPDATE
  // espúrio. Com diff cirúrgico no saveEditItems, isso disparava push pra
  // instrutores cuja row não havia mudado de fato.
  const toUpdate = next.filter(s => {
    if (!prevMap.has(String(s.id))) return false;
    return JSON.stringify(strip(prevMap.get(String(s.id)))) !== JSON.stringify(strip(s));
  });
  // Fase 2 offline-first: cada bloco tenta isoladamente e, em falha, enfileira na
  // outbox em vez de abortar o resto do diff. Sem isso, um INSERT que falha por
  // RLS impediria os UPDATEs do mesmo diff de rodarem, deixando o estado do banco
  // mais inconsistente do que o do cliente.
  const failed = [];
  if (toInsert.length) {
    // Rede de segurança: rows que chegam aqui sem id são bug upstream. Antes
    // esse INSERT virava 400 ("null value in column id") e perdia o batch
    // inteiro porque a outbox tratava como op zumbi. Sintoma 2026-05-26:
    // 62 rows ficaram presas em LS sem nunca subir pro Supabase.
    let _insertIdPatched = 0;
    const toInsertFixed = toInsert.map(s => {
      if (s && s.id != null) return s;
      _insertIdPatched++;
      return { ...s, id: newScheduleId() };
    });
    if (_insertIdPatched > 0) {
      console.warn(`[_persistSchedules] ${_insertIdPatched} insert row(s) sem id — ids atribuídos antes do envio.`);
    }
    try {
      const { error } = await sb.from('relyon_schedules').insert(toInsertFixed.map(strip));
      if (error) throw new Error(error.message);
    } catch (err) {
      // Violação do UNIQUE INDEX = row equivalente já existe no SB. Não enfileirar
      // retry: a outbox ficaria entupida com ops que nunca passariam. Apenas loga.
      if (_isUniqueViolation(err)) {
        console.warn(`[_persistSchedules] INSERT ignorado (${toInsertFixed.length} row(s)): já existe equivalente no SB. ${err.message}`);
      } else {
        _outboxEnqueue({ op: 'insert', rows: toInsertFixed.map(strip) }, err);
        failed.push(`insert(${toInsertFixed.length})`);
      }
    }
  }
  if (toDelete.length) {
    try {
      const { error } = await sb.from('relyon_schedules').delete().in('id', toDelete);
      if (error) throw new Error(error.message);
    } catch (err) {
      _outboxEnqueue({ op: 'delete', ids: toDelete }, err);
      failed.push(`delete(${toDelete.length})`);
    }
  }
  for (const s of toUpdate) {
    const { id, created_at, updated_at, issueStatus, ...rest } = s;
    try {
      const { error } = await sb.from('relyon_schedules').update(rest).eq('id', id);
      if (error) throw new Error(error.message);
    } catch (err) {
      _outboxEnqueue({ op: 'update', row: strip(s) }, err);
      failed.push(`update(${id})`);
    }
  }
  if (failed.length) throw new Error(`Enfileirado para retry automático: ${failed.join(', ')}`);
}

// ── ESPELHO LOCAL DE relyon_schedules ─────────────────────────────────────────
// Sem isso, falhas de Supabase causam perda total no Ctrl+Shift+R: o state React
// zera, o fetch paginado relê o banco (sem as rows não-persistidas) e o trabalho
// some. Estratégia: toda mutação grava JSON sincronamente em LS antes do upsert.
// Boot lê LS primeiro (paint imediato) e depois reconcilia com o fetch Supabase.
const _LS_SCHEDULES_KEY = _LS_PREFIX + 'relyon_schedules';
const _writeLocalSchedules = (next) => {
  try { localStorage.setItem(_LS_SCHEDULES_KEY, JSON.stringify(next)); } catch {}
};
const _readLocalSchedules = () => {
  try {
    const raw = localStorage.getItem(_LS_SCHEDULES_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Defensive: row sem id em LS é herança do bug pré-2026-05-19. A rede de
    // segurança em setSchedules cobre saves novos via React, mas não cura LS
    // já contaminado — a reconciliação no boot (linha ~559) chama
    // _enqueuePersist direto e o Supabase rejeita com "null value in column id"
    // eternamente. Patchear na leitura fecha o gap.
    let _patched = 0;
    const fixed = parsed.map(r => {
      if (r && r.id != null) return r;
      _patched++;
      return { ...r, id: newScheduleId() };
    });
    if (_patched > 0) {
      console.warn(`[_readLocalSchedules] ${_patched} row(s) sem id em LS — patcheadas defensivamente.`);
      try { localStorage.setItem(_LS_SCHEDULES_KEY, JSON.stringify(fixed)); } catch {}
    }
    return fixed;
  } catch { return null; }
};

const useSchedules = () => {
  const [schedules, _setLocal] = useState(() => {
    const ls = _readLocalSchedules();
    if (ls) { _liveData.relyon_schedules = ls; return ls; }
    return [];
  });
  useEffect(() => {
    // Paginação obrigatória: o PostgREST do Supabase tem db-max-rows=1000 a nível
    // de servidor — .range(0, 49999) sozinho não passa disso. A partir de ~1000
    // schedules cumulativos, datas mais recentes sumiam do calendário (bug 2026-05-19).
    // Solução: ler em chunks de 1000 até esgotar.
    (async () => {
      const PAGE = 1000;
      let all = [];
      let from = 0;
      while (true) {
        const { data, error } = await sb.from('relyon_schedules')
          .select('*')
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) { console.error('useSchedules load error:', error.message); break; }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      _setLocal(prev => {
        // Reconciliação: Supabase é autoritativo para rows que ambos conhecem.
        // Rows que estão SÓ em prev (LS) e não no Supabase são pendentes — preservar
        // e reempurrar pro banco (cobre o caso "Supabase falhou na escrita anterior",
        // origem do bug 2026-05-20 onde Matheus perdeu a programação após hard refresh).
        //
        // GUARD TOMBSTONE: rows com classId tombstoned são fantasmas — turmas que o
        // usuário deletou mas cujo DELETE async no Supabase ainda não foi concluído
        // (ou foi descartado por um erro intermediário). Filtramos do `all` E
        // re-disparamos o DELETE para limpar o banco. Sem isso, qualquer F5 logo
        // após apagar uma turma traz ela de volta (bug 2026-05-21).
        const ghosts = all.filter(s => _isClassDeleted(s.classId));
        const cleanAll = all.filter(s => !_isClassDeleted(s.classId));
        if (ghosts.length > 0) {
          const ghostClassIds = [...new Set(ghosts.map(s => s.classId))];
          console.warn(`[useSchedules] ${ghosts.length} ghost row(s) (classId tombstoned) ainda no Supabase. Re-deletando ${ghostClassIds.length} classId(s).`);
          ghostClassIds.forEach(cid => _deleteSchedulesByClassId(cid));
        }
        const sbIds = new Set(cleanAll.map(s => String(s.id)));
        // Excluir do "pendingLocal" rows cujo classId foi tombstoned (turma deletada).
        // Sem esse guard, o LS contaminado pelo eco Realtime re-empurra as rows ao banco.
        // Excluir também rows sem id: tentar patchar e reinserir (commit anterior)
        // criou duplicatas porque as rows já existiam no SB com ids originais que
        // o LS perdeu (sintoma 2026-05-26: SB foi de 1614 → 1744). Drop é mais seguro
        // que recriar — perde-se no máximo o dado de LS, mas sem corromper o SB.
        const pendingLocalRaw = prev.filter(s => !sbIds.has(String(s.id)) && !_isClassDeleted(s.classId));
        const pendingLocal = pendingLocalRaw.filter(s => s && s.id != null);
        const droppedNullId = pendingLocalRaw.length - pendingLocal.length;
        if (droppedNullId > 0) {
          console.warn(`[useSchedules] ${droppedNullId} pending row(s) com id null descartadas (provavelmente já existem no SB com id original perdido).`);
        }
        const merged = pendingLocal.length > 0 ? [...cleanAll, ...pendingLocal] : cleanAll;
        _writeLocalSchedules(merged);
        _liveData.relyon_schedules = merged;
        if (pendingLocal.length > 0) {
          console.warn(`[useSchedules] ${pendingLocal.length} row(s) locais não estavam no Supabase. Reempurrando.`);
          // Insert direto e cirúrgico: evita que o diff de _enqueuePersist inclua
          // rows com id null de outras mutações pendentes no mesmo batch (bug 2026-05-26).
          const _stripRow = ({ created_at, updated_at, issueStatus, ...r }) => r;
          sb.from('relyon_schedules').insert(pendingLocal.map(_stripRow)).then(({ error }) => {
            if (!error) {
              console.info(`[useSchedules] ${pendingLocal.length} row(s) reempurradas com sucesso.`);
            } else if (_isUniqueViolation(error)) {
              console.warn('[useSchedules] rows já existem no SB (unique) — ignorando.');
            } else {
              console.warn('[useSchedules] insert direto falhou, usando _enqueuePersist:', error.message);
              _enqueuePersist(cleanAll, merged);
            }
          });
        }
        return merged;
      });
    })();
    const ch = sb.channel('relyon_sched_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relyon_schedules' },
        ({ eventType, new: nw, old: od }) => {
          _setLocal(prev => {
            let next;
            const sid = r => String(r.id);
            if (eventType === 'INSERT') {
              // Ignorar eco Realtime de INSERT para turmas já excluídas localmente.
              // Sem esse guard, o eco de um save anterior ao DELETE ressuscita as rows
              // no estado local → LS contaminado → reconciliação re-insere no banco.
              if (nw.classId && _isClassDeleted(nw.classId)) next = prev;
              else next = prev.find(s => sid(s) === sid(nw)) ? prev : [...prev, nw];
            }
            else if (eventType === 'DELETE') next = prev.filter(s => sid(s) !== sid(od));
            else if (eventType === 'UPDATE') next = prev.map(s => sid(s) === sid(nw) ? nw : s);
            else next = prev;
            _liveData.relyon_schedules = next;
            _writeLocalSchedules(next);
            return next;
          });
        })
      .subscribe();
    return () => sb.removeChannel(ch);
  }, []);
  const setSchedules = React.useCallback(valOrFn => {
    _setLocal(prev => {
      let next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      // Rede de segurança: garantir que toda row tem id antes de persistir.
      // Sem isso, o INSERT no Supabase falha com "null value in column id" e o
      // usuário vê o toast vermelho ("Falha ao salvar no banco de dados").
      // Causa raiz exata desconhecida (bug 2026-05-19); este guard impede a falha
      // em todos os caminhos (savePlan, saveEditItems, updates parciais via map etc.).
      let _idPatched = 0;
      next = next.map(s => {
        if (s && s.id != null) return s;
        _idPatched++;
        return { ...s, id: newScheduleId() };
      });
      if (_idPatched > 0) {
        console.warn(`[setSchedules] ${_idPatched} row(s) sem id detectadas; ids atribuídos defensivamente.`);
      }
      // Frente 3 (DESIGN §18.3): se campo crítico mudou em row confirmada → invalida ciência
      next = _invalidateConfirmationOnCriticalChange(prev, next);
      _liveData.relyon_schedules = next;
      // Fase 1 offline-first: LS gravado ANTES do upsert Supabase.
      // Se _enqueuePersist falhar, o dado sobrevive a Ctrl+Shift+R e será reempurrado
      // no boot pelo passo de reconciliação acima.
      _writeLocalSchedules(next);
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
let _skipNotifications = false;
window.__skipNextNotifications = () => { _skipNotifications = true; };

function generateNotificationsFromScheduleDiff(prev, next) {
  // Chamado com flag "sem notificar": limpa e sai
  if (_skipNotifications) { _skipNotifications = false; return; }

  const today = new Date().toISOString().split('T')[0];
  const prevMap = new Map((prev || []).map(s => [String(s.id), s]));
  const nextMap = new Map((next || []).map(s => [String(s.id), s]));
  const fmtDate = d => {
    try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
    catch { return d; }
  };

  // Separa insercoes e delecoes brutas
  const deleted  = (prev || []).filter(s => !nextMap.has(String(s.id)) && s.instructorId);
  const inserted = (next || []).filter(s => !prevMap.has(String(s.id)) && s.instructorId);

  // Pareia DELETE + INSERT do mesmo instrutor/data/modulo (padrao re-save de savePlan).
  // Se campos criticos nao mudaram: silencio. Se mudaram: notifica como alteracao.
  const matchedDelIds = new Set();
  const matchedInsIds = new Set();
  const reSaveChanged = [];

  for (const del of deleted) {
    if (del.date < today) { matchedDelIds.add(String(del.id)); continue; }
    const match = inserted.find(ins =>
      !matchedInsIds.has(String(ins.id)) &&
      String(ins.instructorId) === String(del.instructorId) &&
      ins.date === del.date &&
      ins.module === del.module
    );
    if (match) {
      matchedDelIds.add(String(del.id));
      matchedInsIds.add(String(match.id));
      if (_CRITICAL_SCHEDULE_FIELDS.some(k => del[k] !== match[k])) reSaveChanged.push({ p: del, n: match });
    }
  }

  // INSERTs nao pareados = modulo realmente novo
  for (const s of inserted) {
    if (matchedInsIds.has(String(s.id))) continue;
    if (s.date < today) continue;
    createNotification({
      instructorId: s.instructorId,
      type: 'new_module',
      title: `Novo módulo: ${s.module || s.trainingName || 'Treinamento'}`,
      body: `${s.className} · ${fmtDate(s.date)} · ${s.startTime}–${s.endTime} · ${s.local || ''}`,
      linkClassId: s.classId,
      linkScheduleId: s.id,
    });
  }

  // DELETEs nao pareados = cancelamento real
  for (const s of deleted) {
    if (matchedDelIds.has(String(s.id))) continue;
    if (s.date < today) continue;
    createNotification({
      instructorId: s.instructorId,
      type: 'module_cancelled',
      title: `Cancelamento: ${s.module || s.trainingName || 'Treinamento'}`,
      body: `${s.className} · ${fmtDate(s.date)} · ${s.startTime}–${s.endTime}`,
      linkClassId: s.classId,
      linkScheduleId: s.id,
    });
  }

  // Re-saves onde campos criticos mudaram (ex: troca de horario ou local sem mudar instrutor)
  for (const { p, n } of reSaveChanged) {
    const changes = _CRITICAL_SCHEDULE_FIELDS.filter(k => p[k] !== n[k]).map(k => `${k}: ${p[k]||'—'} → ${n[k]||'—'}`).join('; ');
    createNotification({
      instructorId: n.instructorId,
      type: 'module_changed',
      title: `Alteração: ${n.module || n.trainingName || 'Treinamento'}`,
      body: `${n.className} · ${fmtDate(n.date)} · ${changes}`,
      linkClassId: n.classId,
      linkScheduleId: n.id,
    });
  }

  // UPDATEs in-place (mesmo id, campo critico mudou) — exclui datas passadas
  for (const n of nextMap.values()) {
    const p = prevMap.get(String(n.id));
    if (!p || !n.instructorId) continue;
    if (n.date < today) continue;
    const changed = _CRITICAL_SCHEDULE_FIELDS.some(k => p[k] !== n[k]);
    if (!changed) continue;
    const changes = _CRITICAL_SCHEDULE_FIELDS.filter(k => p[k] !== n[k]).map(k => `${k}: ${p[k]||'—'} → ${n[k]||'—'}`).join('; ');
    createNotification({
      instructorId: n.instructorId,
      type: 'module_changed',
      title: `Alteração: ${n.module || n.trainingName || 'Treinamento'}`,
      body: `${n.className} · ${fmtDate(n.date)} · ${changes}`,
      linkClassId: n.classId,
      linkScheduleId: n.id,
    });
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

