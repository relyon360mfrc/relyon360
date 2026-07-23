const { useState, useEffect, useRef } = React;

// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://snpvqqsmwrlazawjknme.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucHZxcXNtd3JsYXphd2prbm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTg0MjAsImV4cCI6MjA5MDk5NDQyMH0.124Cybz_lv6Op1TM62kVUs87b60f4y5mIFhxwN09tlk';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const _DB_KEYS = ['relyon_trainings','relyon_areas','relyon_instructors','relyon_users','relyon_absences','relyon_locals','relyon_holidays','relyon_activities','relyon_requests','relyon_ai_packages','relyon_class_tombstones','relyon_crossbase_requests','relyon_offshore_clients','relyon_offshore_units','relyon_ead_config'];
// _DB_KEYS é a fonte autoritativa: __resetRelyOn360, _SYNC_LABELS e a RLS INSERT
// policy de app_state precisam estar alinhados a essa lista (RLS gerenciada via Supabase).
// 'relyon_class_tombstones' é especial: gravado fora do usePersisted (via _markClassDeleted)
// porque vive em memória + LS + Supabase, não num useState React.
let _initialData = null;

// ── PORTÃO DE VERSÃO (version gate) ───────────────────────────────────────────
// PROBLEMA QUE RESOLVE: um cliente rodando código ANTIGO (aba esquecida aberta,
// aparelho que só dá reload do cache) reempurra seu snapshot velho e REVERTE o
// trabalho de toda a frota. A correção de sync só protege quem RODA ela — então
// bastava UM cliente velho conectado pra estragar tudo. Este portão faz a frota
// convergir sozinha: todo cliente compara sua versão com a publicada no servidor
// e, se estiver velho, limpa o cache de código e recarrega — sem caçar aparelho.
//
// COMO MANTER (PÓS BUILD STEP): a Vercel roda build.mjs (esbuild) e publica um bundle
// com HASH de conteúdo — o hash muda sozinho quando o código muda, então o cache
// invalida sozinho e o ritual manual de ?v= MORREU. Logo, subir APP_VERSION +1 abaixo
// é OPCIONAL: faça só quando quiser FORÇAR a frota a recarregar na hora (ex: fix crítico
// de comportamento). Sem isso, os clientes pegam o bundle novo naturalmente no próximo
// fetch do index.html (network-first). O 1º cliente que carrega uma APP_VERSION MAIOR a
// PUBLICA em app_state.app_version (row semeada, FORA de _DB_KEYS — __resetRelyOn360 não
// a apaga); os demais detectam que estão atrás e se atualizam sozinhos. (Rollback pro
// babel-no-navegador ressuscita o ritual ?v= antigo — ver MIGRACAO_BUILD_STEP.md.)
const APP_VERSION = 55;           // ⬅️ opcional: +1 SÓ pra forçar reload imediato da frota (55 = multi-base expansão total 2026-07-23)
const _VGATE_SS = 'rl360_vgate';  // guard anti-loop (sessionStorage)

// Lê a versão publicada. Número (>=0) se a leitura deu certo; null se FALHOU
// (rede/RLS) — nesse caso o portão NÃO bloqueia (fail-open: um soluço de rede
// nunca pode travar o app nem disparar reload à toa).
async function _readServerVersion() {
  try {
    const { data, error } = await sb.from('app_state').select('value').eq('key', 'app_version').maybeSingle();
    if (error) return null;
    if (!data) return 0;
    const v = Number(data.value && data.value.build);
    return Number.isFinite(v) ? v : 0;
  } catch { return null; }
}

// Publica a versão deste cliente (só sobe — max-vence). Usa UPDATE (não upsert):
// a row é semeada e a policy de UPDATE de app_state é livre; o INSERT é restrito
// por RLS a _DB_KEYS (e 'app_version' fica de fora de propósito).
async function _publishVersion(build) {
  try { await sb.from('app_state').update({ value: { build } }).eq('key', 'app_version'); } catch {}
}

// Overlay teal "Atualizando…" — injetado no DOM ATUAL antes do reload do portão de
// versão. Sem ele, o location.reload() dispara imediato e o intervalo até o novo
// index.html pintar aparece como tela PRETA (#050505, fallback do body). O overlay
// fica no frame atual e o browser o mantém durante o gap do reload → transição teal
// contínua, igual à boot screen. Reaproveita as classes .rl-boot-* do <style> inline
// do index.html (sempre presentes), mas com gradiente próprio (#rl-upd-grad): o
// #rl-boot-grad original some quando o React monta e substitui o #root. (TASKS 2026-06-20)
function _showUpdatingOverlay() {
  try {
    if (typeof document === 'undefined' || document.getElementById('rl360-updating')) return;
    const o = document.createElement('div');
    o.id = 'rl360-updating';
    o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#011c22;';
    o.innerHTML =
      '<div class="rl-boot-screen">'
      + '<div class="rl-boot-ring">'
      + '<svg width="140" height="140" viewBox="0 0 96 96" style="position:absolute;top:0;left:0;filter:drop-shadow(0 0 24px rgba(255,166,25,0.18));"><circle cx="48" cy="48" r="38" stroke-width="6" fill="none" class="rl-boot-track"/></svg>'
      + '<svg width="140" height="140" viewBox="0 0 96 96" style="position:absolute;top:0;left:0;transform:rotate(-90deg);"><defs><linearGradient id="rl-upd-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffd066"/><stop offset="100%" stop-color="#e8920a"/></linearGradient></defs><circle cx="48" cy="48" r="38" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="240" stroke="url(#rl-upd-grad)" style="animation:spin 1.4s linear infinite, rl-boot-pulse 2.2s ease-in-out infinite;transform-origin:48px 48px;"/></svg>'
      + '</div>'
      + '<div><div class="rl-boot-title">Rely<span class="rl-boot-title-o">O</span>n<span class="rl-boot-title-360"> 360</span></div><div class="rl-boot-sub">Scheduler</div></div>'
      + '<p class="rl-boot-msg">Atualizando para a nova versão…</p>'
      + '</div>';
    (document.body || document.documentElement).appendChild(o);
  } catch {}
}

// Ação de upgrade: apaga SÓ o cache de código (relyon360-v6 = bundle + ícones),
// preserva o cache de CDN (assets imutáveis) e NÃO desregistra o Service Worker
// (manteria as push subscriptions). Com o cache de código apagado, o reload busca
// tudo fresco da rede. Guard anti-loop: no máx 2 tentativas por versão-alvo.
async function _applyUpdate(targetBuild) {
  let st = {};
  try { st = JSON.parse(sessionStorage.getItem(_VGATE_SS) || '{}'); } catch {}
  const tries = (st.target === targetBuild ? (st.tries || 0) : 0);
  if (tries >= 2) return false;   // já tentei 2x e continuo velho → desiste (instrução manual)
  try { sessionStorage.setItem(_VGATE_SS, JSON.stringify({ target: targetBuild, tries: tries + 1, ts: Date.now() })); } catch {}
  _showUpdatingOverlay();          // pinta teal ANTES de mexer no cache/reload (mata o flash preto)
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== 'relyon360-cdn-v1').map(k => caches.delete(k)));
    }
  } catch {}
  try {
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      regs.forEach(r => { try { r.update(); } catch {} });
    }
  } catch {}
  await new Promise(r => setTimeout(r, 300));  // dá ao overlay teal um frame pra pintar antes de derrubar a página
  location.reload();
  return true;
}

// Portão no BOOT — roda ANTES de ler/gravar dados. Retorna:
//   'current'  — em dia, segue       'reloading'— velho → recarregando, NÃO siga
//   'ahead'    — mais novo, publicou  'manual'   — velho mas auto-reload desistiu (2x)
async function checkVersionGate() {
  const server = await _readServerVersion();
  if (server === null) return 'current';                 // leitura falhou → fail-open
  if (APP_VERSION >= server) {
    try { sessionStorage.removeItem(_VGATE_SS); } catch {}  // em dia → zera o guard
    if (APP_VERSION > server) { await _publishVersion(APP_VERSION); return 'ahead'; }
    return 'current';
  }
  const ok = await _applyUpdate(server);
  return ok ? 'reloading' : 'manual';
}

// Checagem LEVE p/ abas já abertas (NÃO recarrega sozinha). Retorna o build-alvo
// (>0) se este cliente está velho; 0 se está em dia ou a leitura falhou.
async function serverVersionAhead() {
  const server = await _readServerVersion();
  return (server !== null && APP_VERSION < server) ? server : 0;
}

window.__appVersion = APP_VERSION;
window.__checkVersionGate = checkVersionGate;
window.__serverVersionAhead = serverVersionAhead;
window.__applyUpdate = _applyUpdate;

// ── PORTÃO DE SESSÃO (session revoke gate) ───────────────────────────────────
// PROBLEMA QUE RESOLVE: dispositivos cacheados em outros lugares da rede
// reempurrando snapshots stale (incidente 2026-06-02: 17 rows aux ressuscitadas
// após gap de 4 dias entre mint local e INSERT no banco). Sem capacidade de
// auditar quais dispositivos estão logados, a defesa é REVOGAR sessões
// remotamente: o developer aperta um botão, o servidor publica um `ts` de corte,
// e toda sessão criada antes desse ts é encerrada no próximo boot/check
// periódico — limpando LS (journal/outbox/cache de schedules) e forçando login
// novo. Não menciona "vazamento" pro usuário — sempre "solicitado pelo desenvolvedor".
//
// COMO USAR (developer): clica o botão em Sobre → modal pede senha → app dá
// UPDATE em app_state.session_revoke_before = {ts: Date.now()} e dispara
// _forceLogoutAndReload no próprio cliente (confirma que o sistema funciona).
// A row é semeada via SQL (RLS de INSERT é restrita) — UPDATE é livre.
const _SESSION_REVOKE_KEY = 'session_revoke_before';

// Lê o ts de revogação publicado. Number (>=0) se OK; null se falhou (fail-open).
async function _readServerRevoke() {
  try {
    const { data, error } = await sb.from('app_state').select('value').eq('key', _SESSION_REVOKE_KEY).maybeSingle();
    if (error) return null;
    if (!data) return 0;
    const ts = Number(data.value && data.value.ts);
    return Number.isFinite(ts) ? ts : 0;
  } catch { return null; }
}

// Limpa LS deste cliente e recarrega. Usado em logout forçado e em revogação
// remota. Limpeza inclui: sessão, abas (sessionStorage), journal de uploads,
// outbox, cache local de schedules, tombstones e guard do version gate.
function _forceLogoutAndReload(reason) {
  try {
    const KEYS = [
      'rl360_session',
      'rl360_relyon_schedules',
      'rl360_schedules_outbox',
      'rl360_schedules_pending_upload',
      'rl360_appstate_dirty',
      'rl360_deleted_classes',
    ];
    KEYS.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  } catch {}
  try {
    sessionStorage.removeItem('relyon360_tabs');
    sessionStorage.removeItem('relyon360_activeTabId');
    sessionStorage.removeItem('rl360_vgate');
  } catch {}
  // Sinaliza pro próximo boot que veio de logout forçado (UX amigável).
  try { sessionStorage.setItem('rl360_revoke_msg', reason || 'session_revoked'); } catch {}
  // Espera o signOut terminar (limpa o token do Supabase Auth no localStorage) antes
  // de recarregar — sem isso, o reload podia disparar antes da limpeza concluir e o
  // próximo boot reencontrar a MESMA sessão "revogada", virando loop de reload.
  // Timeout-fallback garante que nunca trava esperando rede.
  Promise.race([
    (async () => { try { await sb.auth.signOut(); } catch {} })(),
    new Promise(res => setTimeout(res, 1500)),
  ]).then(() => location.reload());
}
window.__forceLogoutAndReload = _forceLogoutAndReload;

// Checa se a sessão deste cliente está revogada. Sessão sem createdAt (legacy)
// é tratada como ts=0 → qualquer revoke > 0 derruba.
// Retorna true se já disparou o reload (caller PARA); false se segue normal.
async function checkSessionRevoke(sessionCreatedAt) {
  const ts = await _readServerRevoke();
  if (ts === null) return false;
  if (!ts) return false;            // ts=0 → sem revogação ativa
  const cAt = Number(sessionCreatedAt) || 0;
  if (cAt < ts) {
    _forceLogoutAndReload('session_revoked');
    return true;
  }
  return false;
}
window.__checkSessionRevoke = checkSessionRevoke;

// Dispara a revogação global — chamado pelo botão no DeveloperToolsPanel (aba
// Auditoria). Atualiza o ts no servidor e auto-revoga este cliente (confirmação
// de funcionamento).
async function triggerSessionRevoke() {
  const ts = Date.now();
  const { error } = await sb.from('app_state').update({ value: { ts } }).eq('key', _SESSION_REVOKE_KEY);
  if (error) throw new Error(error.message);
  _forceLogoutAndReload('session_revoked');
}
window.__triggerSessionRevoke = triggerSessionRevoke;

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
// Filas de persistência por chave: garantem que upserts cheguem ao Supabase na ordem
// em que foram gerados. Sem isso, add rápido seguido de delete pode ter o add chegando
// DEPOIS do delete → ausência/item volta do nada mesmo depois de excluído.
const _persistQueues = {};
const _syncListeners = [];
const _emitSync = () => _syncListeners.forEach(fn => fn({ ..._syncState }));
const useSyncState = () => {
  const [s, setS] = useState(() => ({ ..._syncState }));
  useEffect(() => { const off = fn => { const i = _syncListeners.indexOf(fn); if (i >= 0) _syncListeners.splice(i, 1); }; const fn = v => setS(v); _syncListeners.push(fn); return () => off(fn); }, []);
  return s;
};

// ── PERSISTENT STATE HOOK (localStorage + Supabase) ──────────────────────────
const _LS_PREFIX = 'rl360_';

// Evento disparado por _revalidateFromSupabase; usePersisted escuta e atualiza estado.
const _REVALIDATE_EVENT = 'rl360_revalidate';
// Evento disparado pós-login (SEGURANCA.md §8.0); useSchedules escuta e re-fetcha
// relyon_schedules sob a sessão `authenticated` recém-criada (boot tinha rodado como anon).
const _SCHEDULES_REFETCH_EVENT = 'rl360_refetch_schedules';

// ── DIRTY-RETRY DE app_state ──────────────────────────────────────────────────
// PROBLEMA QUE RESOLVE (incidente 2026-07-02/03): quando o upsert de app_state
// falha (rede, RLS, 5xx), o usePersisted só marcava status:'error' e NUNCA mais
// tentava. O valor novo ficava só no LS; na próxima revalidação/boot (server-first)
// o valor STALE do servidor atropelava a mudança local — foi assim que o instrutor
// demitido Erik Lima "ressuscitou" após a janela do cutover de RLS. relyon_schedules
// tem outbox; app_state não tinha NADA. Este bloco fecha o buraco.
//
// Como app_state é blob-por-chave (LWW), não precisa de log de operações como o
// outbox: basta marcar a CHAVE como dirty e reenviar sempre o valor MAIS ATUAL
// (_liveData/LS). Enquanto dirty, revalidação e boot não deixam o servidor stale
// vencer o local (exceção pontual ao server-authoritative, com TTL — ver abaixo).
const _APPSTATE_DIRTY_KEY = _LS_PREFIX + 'appstate_dirty';
// TTL: entrada dirty mais velha que isto é DESCARTADA sem reenvio. Um dirty antigo
// reenviado por cima de edições legítimas feitas em outro device é exatamente a
// doença crônica de sync que o server-authoritative curou — o TTL limita a exceção
// a uma janela curta (72h cobre um fim de semana de RLS/rede quebrada).
const _APPSTATE_DIRTY_TTL_MS = 72 * 3600 * 1000;

const _dirtyRead = () => {
  try {
    const raw = localStorage.getItem(_APPSTATE_DIRTY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
};
const _dirtyWrite = (map) => { try { localStorage.setItem(_APPSTATE_DIRTY_KEY, JSON.stringify(map)); } catch {} };
// TTL-aware: entrada expirada conta como "não dirty" — não pode ativar a
// preferência de boot nem o skip de revalidação (o flush a purga sem reenvio).
const _dirtyHas = (key) => {
  const e = _dirtyRead()[key];
  return e != null && (Date.now() - e.queuedAt) <= _APPSTATE_DIRTY_TTL_MS;
};
// Pré-marca a chave como dirty ANTES do upsert partir: se a aba fechar com a
// escrita em voo (iPad fechado logo após editar), o próximo boot sabe que o LS
// é mais novo e reenvia. Sem isto, a janela do upsert era um buraco silencioso.
// Não loga nem agenda flush — o desfecho do próprio upsert resolve (clear/mark).
const _dirtyPreMark = (key) => {
  const map = _dirtyRead();
  const prev = map[key];
  map[key] = {
    queuedAt: prev ? prev.queuedAt : Date.now(),
    attempts: prev ? prev.attempts : 0,
    lastAttemptAt: prev ? prev.lastAttemptAt : null,
    lastError: prev ? prev.lastError : null,
    status: prev ? prev.status : 'pending',
  };
  _dirtyWrite(map);
};
const _dirtyClear = (key) => {
  const map = _dirtyRead();
  if (map[key] == null) return;
  delete map[key];
  _dirtyWrite(map);
};
const _dirtyMark = (key, err) => {
  const map = _dirtyRead();
  const prev = map[key];
  map[key] = {
    queuedAt: prev ? prev.queuedAt : Date.now(),
    attempts: prev ? prev.attempts + 1 : 1,
    lastAttemptAt: Date.now(),
    lastError: err ? err.message : null,
    // RLS/schema não resolvem com retry cego (mesma regra do outbox) — mas o
    // pós-login força reprocessamento: escrita negada como anon passa como authenticated.
    status: _isPermanentError(err) ? 'failed-permanent' : 'pending',
  };
  _dirtyWrite(map);
  console.warn(`[appstate-dirty] escrita de ${key} falhou (tentativa ${map[key].attempts}): ${map[key].lastError}`);
  if (map[key].status === 'pending') _scheduleDirtyFlush();
};
const _dirtyStats = () => {
  const map = _dirtyRead();
  const keys = Object.keys(map);
  return {
    total: keys.length,
    pending: keys.filter(k => map[k].status === 'pending').length,
    failedPermanent: keys.filter(k => map[k].status === 'failed-permanent').length,
    oldestQueuedAt: keys.reduce((min, k) => Math.min(min, map[k].queuedAt), Infinity),
  };
};

let _dirtyFlushTimer = null;
let _dirtyFlushing = false;

async function _dirtyFlush(opts) {
  // force=true (pós-login / botão "Sincronizar agora"): re-tenta TUDO, inclusive
  // failed-permanent, e ignora backoff/offline — mesma semântica do _outboxFlush.
  const force = !!(opts && opts.force);
  if (_dirtyFlushing) return;
  if (!force && typeof navigator !== 'undefined' && navigator.onLine === false) return;
  _dirtyFlushing = true;
  try {
    const map = _dirtyRead();
    // §8.6: mesma regra da outbox — retry de app_state nunca parte como anon.
    // Sem sessão authenticated (renovando JWT vencido), segura a fila e sinaliza;
    // o dirty protege o LS no boot e o __postLoginRefresh (force) drena no login.
    if (Object.keys(map).length > 0 && !(await _ensureFreshSession())) {
      _emitSave({ ok: false, key: 'app_state', msg: 'Sessão expirada — entre novamente para sincronizar as alterações pendentes.' });
      _signalSessionExpired('dirty-flush-sem-sessao');
      return;
    }
    const now = Date.now();
    const jobs = [];
    for (const key of Object.keys(map)) {
      const e = map[key];
      if (now - e.queuedAt > _APPSTATE_DIRTY_TTL_MS) {
        console.error(`[appstate-dirty] entrada de ${key} expirou (${Math.round((now - e.queuedAt) / 3600000)}h na fila) — descartada SEM reenvio para não ressuscitar dado antigo.`);
        _dirtyClear(key);
        continue;
      }
      if (!force && e.status !== 'pending') continue;
      if (!force && e.lastAttemptAt && (e.lastAttemptAt + _backoffMs(e.attempts)) > now) continue;
      // Reenvio encadeado na MESMA fila serial do usePersisted — preserva a ordem
      // com escritas novas. O valor é resolvido NA EXECUÇÃO (não no enqueue): se o
      // usuário editou de novo nesse meio tempo, reenvia direto o mais atual (LWW).
      const job = (_persistQueues[key] = (_persistQueues[key] || Promise.resolve()).then(async () => {
        if (!_dirtyHas(key)) return; // uma escrita ao vivo já confirmou — nada a fazer
        let value = _liveData[key];
        if (value == null) {
          try { const ls = localStorage.getItem(_LS_PREFIX + key); value = ls != null ? JSON.parse(ls) : null; } catch {}
        }
        if (value == null) { _dirtyClear(key); return; } // guard not-null (mesma regra do usePersisted)
        _emitSave({ pending: true, key });
        try {
          const { error } = await _withTimeout(sb.from('app_state').upsert({ key, value }, { onConflict: 'key' }), `app_state retry ${key}`);
          if (error) throw new Error(error.message);
          _dirtyClear(key);
          _syncState[key] = { status: 'synced', lastSync: Date.now() };
          _emitSync();
          _emitSave({ ok: true, key });
          console.info(`[appstate-dirty] ${key} confirmado no Supabase após retry`);
        } catch (err) {
          _dirtyMark(key, err);
          _syncState[key] = { status: 'error', lastSync: _syncState[key]?.lastSync, error: err.message };
          _emitSync();
          _emitSave({ ok: false, key, msg: err.message });
        }
      }));
      jobs.push(job);
    }
    await Promise.all(jobs);
  } finally {
    _dirtyFlushing = false;
  }
  _scheduleDirtyFlush();
}

function _scheduleDirtyFlush() {
  if (_dirtyFlushTimer) { clearTimeout(_dirtyFlushTimer); _dirtyFlushTimer = null; }
  const map = _dirtyRead();
  const pend = Object.keys(map).filter(k => map[k].status === 'pending');
  if (pend.length === 0) return;
  const now = Date.now();
  const nextRun = pend
    .map(k => (map[k].lastAttemptAt || 0) + _backoffMs(map[k].attempts))
    .reduce((min, t) => Math.min(min, t), Infinity);
  _dirtyFlushTimer = setTimeout(() => { _dirtyFlushTimer = null; _dirtyFlush(); }, Math.max(0, nextRun - now));
}

window.__appStateDirtyStats = _dirtyStats;
window.__appStateDirtyList = () => { const m = _dirtyRead(); return Object.keys(m).map(k => ({ key: k, ...m[k] })); };
window.__appStateDirtyFlush = _dirtyFlush;
window.__appStateDirtyClear = (key) => { if (key) { _dirtyClear(key); } else { _dirtyWrite({}); } _emitSave({ ok: true, key: key || 'app_state' }); };

const usePersisted = (key, initialValue) => {
  const [state, setState] = useState(() => {
    // Exceção anti-clobber (incidente Erik Lima 2026-07-02/03): se a última escrita
    // local desta chave FALHOU (dirty), o LS é mais novo que o servidor — o boot
    // server-first atropelaria a mudança e o retry passaria a reenviar o valor stale.
    // Prefere o LS e mantém o dirty até o retry confirmar no Supabase. Dirty sem LS
    // válido não protege nada → descarta e segue o fluxo normal.
    if (_dirtyHas(key)) {
      try {
        const ls = localStorage.getItem(_LS_PREFIX + key);
        const parsed = ls != null ? JSON.parse(ls) : null;
        if (parsed != null) {
          console.warn(`[appstate-dirty] boot preferindo LS para ${key} — alteração local ainda não confirmada no Supabase`);
          _liveData[key] = parsed;
          return parsed;
        }
      } catch {}
      _dirtyClear(key);
    }
    // Prioridade: Supabase (carregado no AppLoader) > localStorage > default
    if (_initialData && _initialData[key] != null) {
      _liveData[key] = _initialData[key];
      return _initialData[key];
    }
    try {
      const ls = localStorage.getItem(_LS_PREFIX + key);
      if (ls != null) {
        const parsed = JSON.parse(ls);
        // Guard: um 'null' residual no LS (de um setState(null) antigo) re-disparava
        // upsert com value:null → 400 not-null em app_state a cada boot. Cai no default.
        if (parsed != null) {
          _liveData[key] = parsed;
          return parsed;
        }
      }
    } catch {}
    _liveData[key] = initialValue;
    return initialValue;
  });
  const isFirst = useRef(true);
  // Marca que o próximo "state" já veio confirmado do Supabase (revalidação) — não
  // deve ser reenviado ao servidor. Sem isso, todo usuário (inclusive instrutor,
  // que é read-only por RLS) reenvia de volta o valor que acabou de receber, e no
  // instrutor esse upsert nasce morto (RLS bloqueia) e trava a fila em erro permanente.
  const skipNextPersist = useRef(false);
  // Escuta revalidação de foco: atualiza estado se o dado do Supabase mudou.
  useEffect(() => {
    const onRevalidate = (e) => {
      const newVal = e.detail?.[key];
      if (newVal === undefined) return;
      // Anti-clobber: com escrita local pendente de reenvio (dirty), o valor do
      // servidor é STALE por definição — aplicá-lo desfaria a mudança do usuário.
      // O retry do dirty-flush converge o servidor; aí a próxima revalidação passa.
      if (_dirtyHas(key)) {
        console.warn(`[appstate-dirty] revalidação ignorada para ${key} — alteração local pendente de envio`);
        return;
      }
      try {
        if (JSON.stringify(newVal) !== JSON.stringify(_liveData[key])) {
          _liveData[key] = newVal;
          try { localStorage.setItem(_LS_PREFIX + key, JSON.stringify(newVal)); } catch {}
          skipNextPersist.current = true;
          setState(newVal);
        }
      } catch {}
    };
    window.addEventListener(_REVALIDATE_EVENT, onRevalidate);
    return () => window.removeEventListener(_REVALIDATE_EVENT, onRevalidate);
  }, [key]);
  useEffect(() => {
    _liveData[key] = state;
    if (isFirst.current) { isFirst.current = false; return; }
    if (skipNextPersist.current) { skipNextPersist.current = false; return; }
    // Guard: app_state.value é NOT NULL. Um setState(null)/undefined acidental não deve
    // gravar "null" no LS nem disparar upsert (→ 400 not-null em loop). Ignora a escrita
    // e mantém o último valor bom; o componente corrige no próximo setState válido.
    if (state == null) return;
    // 1. localStorage — síncrono, sobrevive Ctrl+Shift+R e fechamento de aba
    try { localStorage.setItem(_LS_PREFIX + key, JSON.stringify(state)); } catch {}
    // 2. Supabase — assíncrono, fonte autoritativa entre dispositivos
    // Fila serial por chave: o próximo upsert só dispara após o anterior completar,
    // evitando que um upsert antigo (add) chegue depois de um upsert novo (delete)
    // e sobrescreva o estado correto no Supabase.
    _syncState[key] = { status: 'pending', lastSync: _syncState[key]?.lastSync };
    _emitSync();
    _emitSave({ pending: true, key });
    // Dirty ANTES do upsert: cobre aba fechada com escrita em voo (ver _dirtyPreMark).
    _dirtyPreMark(key);
    const _stateToWrite = state;
    _persistQueues[key] = (_persistQueues[key] || Promise.resolve()).then(async () => {
      try {
        // Renova JWT por vencer (§8.6); sem sessão segue — falha cai no dirty-retry,
        // que segura a fila sem escrever anon.
        await _ensureFreshSession();
        const { error } = await _withTimeout(sb.from('app_state').upsert({ key, value: _stateToWrite }, { onConflict: 'key' }), `app_state ${key}`);
        if (error) {
          // Falha NÃO é mais fim de linha: marca a chave como dirty → retry com
          // backoff reenvia o valor mais atual até confirmar (ver DIRTY-RETRY acima).
          _dirtyMark(key, error);
          _syncState[key] = { status: 'error', lastSync: _syncState[key]?.lastSync, error: error.message };
          _emitSync();
          _emitSave({ ok: false, key, msg: error.message });
        } else {
          _dirtyClear(key); // escrita ao vivo confirmou — retry pendente vira no-op
          _syncState[key] = { status: 'synced', lastSync: Date.now() };
          _emitSync();
          _emitSave({ ok: true, key });
        }
      } catch (err) {
        // Timeout / rejeição inesperada
        _dirtyMark(key, err);
        _syncState[key] = { status: 'error', lastSync: _syncState[key]?.lastSync, error: err.message };
        _emitSync();
        _emitSave({ ok: false, key, msg: err.message });
      }
    });
  }, [key, state]);
  return [state, setState];
};

// Re-fetcha todos os keys do Supabase e notifica usePersisted via evento.
// Chamada pelo App ao recuperar foco após inatividade prolongada (>5 min oculto).
// Também re-hidrata tombstones — garante que turmas excluídas em outro device
// não ressuscitem na reconciliação do useSchedules ao reativar a aba.
const _revalidateFromSupabase = async () => {
  try {
    // §8.6-LEITURA (incidente 2026-07-17): sem sessão authenticated a leitura sai
    // como `anon` e volta vazia (pós-aperto da RLS) — revalidar com isso é inútil
    // e mascara o problema. Sem sessão, não lê.
    if (!(await _ensureFreshSession())) return false;
    const { data, error } = await sb.from('app_state').select('key,value').in('key', _DB_KEYS);
    if (error || !data) return false;
    const newData = {};
    data.forEach(r => { newData[r.key] = r.value; });
    if (newData[_TOMBSTONE_DB_KEY]) {
      if (!_initialData) _initialData = {};
      _initialData[_TOMBSTONE_DB_KEY] = newData[_TOMBSTONE_DB_KEY];
      _hydrateTombstonesFromInitialData();
    }
    window.dispatchEvent(new CustomEvent(_REVALIDATE_EVENT, { detail: newData }));
    // Retorna os dados frescos (truthy): o login (auth.js) usa pra re-localizar o
    // cadastro do usuário quando o boot rodou como `anon` e veio vazio (pós-aperto).
    return newData;
  } catch { return false; }
};
window.__revalidateFromSupabase = _revalidateFromSupabase;

// Chamada pelo Login (auth.js) após signInWithPassword bem-sucedido (SEGURANCA.md §8.0).
// Boot inicial leu app_state/relyon_schedules como `anon`; após apertar a RLS (Marco 2),
// anon perde SELECT — sem isto, a tela ficaria vazia até o usuário dar reload manual.
const _postLoginRefresh = async () => {
  const data = await _revalidateFromSupabase();
  window.dispatchEvent(new CustomEvent(_SCHEDULES_REFETCH_EVENT));
  // Escritas negadas por RLS como `anon` (failed-permanent) podem passar agora que
  // a sessão é `authenticated` — força reprocessamento do dirty (fire-and-forget,
  // não segura o login). Foi o gap do incidente de 2026-07-02.
  try { _dirtyFlush({ force: true }); } catch {}
  // Idem para a outbox de schedules: ops seguradas pelo guard de sessão (§8.6)
  // ou marcadas failed-rls por escrita negada como anon drenam agora que a
  // sessão é authenticated.
  try { _outboxFlush({ force: true }); } catch {}
  return data;
};
window.__postLoginRefresh = _postLoginRefresh;

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
// Download manual disponível via window.__exportBackup() ou pelo botão em admin.js

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

// ── TIMEOUT GUARD para chamadas Supabase ──────────────────────────────────────
// CAUSA RAIZ do bug crônico "salvei e não firmou" (incidente 2026-06-01):
// o supabase-js usa fetch SEM timeout. Se uma requisição trava (wifi caiu, laptop
// dormiu, conexão pendurada), o `await` NUNCA resolve nem rejeita. Como toda
// gravação de schedules passa pela fila serial _persistQueue, UMA requisição
// pendurada congela TODAS as gravações seguintes — silenciosamente, sem erro,
// sem toast. O LS atualiza na hora (parece que salvou), mas nada sobe pro banco;
// no F5 o boot relê o banco velho e "volta o que estava antes".
// Solução: _withTimeout faz a promessa REJEITAR após N ms. A rejeição cai no
// catch do chamador → enfileira na outbox → retry automático. A fila nunca trava.
const _SB_TIMEOUT_MS = 15000;
function _withTimeout(thenable, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Supabase timeout após ${_SB_TIMEOUT_MS}ms (${label}) — conexão pendurada?`)),
      _SB_TIMEOUT_MS
    );
  });
  // Promise.resolve adota o thenable do supabase-js, disparando a requisição.
  return Promise.race([Promise.resolve(thenable), timeout]).finally(() => clearTimeout(timer));
}
window.__sbTimeoutMs = _SB_TIMEOUT_MS;

// ── SESSÃO AUTHENTICATED ANTES DE ESCREVER (SEGURANCA.md §8.6) ────────────────
// O access token do Supabase Auth expira em ~1h. Aba em background estrangula os
// timers do autoRefresh do supabase-js; um retry da outbox/dirty depois disso
// partia como `anon` e, com o aperto de RLS ativo, morria em 42501 travando a
// fila (incidente do cutover 2026-07-02, fresta 1). Valida a sessão e renova se
// vencida/por vencer. Retorna a sessão ou null — null = NÃO escrever em retry.
const _SESSION_EXPIRY_MARGIN_MS = 60000;
async function _ensureFreshSession() {
  try {
    const { data } = await _withTimeout(sb.auth.getSession(), 'auth getSession');
    let session = data && data.session;
    if (session && session.expires_at && session.expires_at * 1000 - Date.now() < _SESSION_EXPIRY_MARGIN_MS) {
      const r = await _withTimeout(sb.auth.refreshSession(), 'auth refreshSession');
      session = (r.data && r.data.session) || null;
    }
    return session || null;
  } catch { return null; }
}
window.__ensureFreshSession = _ensureFreshSession;

// ── SESSÃO EXPIRADA → RELOGIN FORÇADO (decisão UX 2026-07-17) ─────────────────
// O badge vermelho de sincronização esperando o usuário descobrir "logout + login"
// não é acionável por instrutor/usuário leigo (incidentes CACI 01 + José Fardim,
// 2026-07-17). Quando a sessão Supabase Auth está vencida/irrenovável e há usuário
// logado, sinalizamos o App (app.js escuta) — ele derruba para a tela de Login com
// aviso amigável; outbox/dirty ficam no LS e drenam via __postLoginRefresh após o
// novo login (nada se perde). Guarda-corpos:
//  · offline NÃO derruba — queda de wifi ≠ sessão vencida; o flush volta no 'online'
//  · cooldown anti-loop de 5 min — se a edge fn `login` estiver fora, o relogin cai
//    no fallback local (anon), a próxima escrita falharia de novo e derrubaria de
//    novo ad infinitum; dentro do cooldown mantém o comportamento antigo (badge)
const _SESSION_EXPIRED_EVENT = 'rl360-session-expired';
const _RELOGIN_COOLDOWN_KEY = _LS_PREFIX + 'forced_relogin_at';
const _RELOGIN_COOLDOWN_MS = 5 * 60 * 1000;
function _signalSessionExpired(reason) {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const last = Number(localStorage.getItem(_RELOGIN_COOLDOWN_KEY)) || 0;
    if (Date.now() - last < _RELOGIN_COOLDOWN_MS) return;
    localStorage.setItem(_RELOGIN_COOLDOWN_KEY, String(Date.now()));
    console.warn(`[auth] sessão Supabase Auth expirada/ausente (${reason}) — solicitando relogin forçado.`);
    window.dispatchEvent(new CustomEvent(_SESSION_EXPIRED_EVENT, { detail: { reason } }));
  } catch {}
}
window.__signalSessionExpired = _signalSessionExpired;

// Checagem PROATIVA no foco: aba em background estrangula o autoRefresh do
// supabase-js (§8.6) — o usuário volta pra aba com o token vencido e só descobriria
// na primeira gravação perdida. Aqui renovamos o token assim que a aba volta ao
// foco; se havia sessão Auth gravada mas ela não renova mais (refresh token morto),
// derruba para o Login JÁ, antes de o usuário editar qualquer coisa.
const _hadAuthTokenInLs = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch {}
  return false;
};
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    if (navigator.onLine === false) return;
    const had = _hadAuthTokenInLs(); // capturado ANTES — refresh falho pode limpar a chave
    _ensureFreshSession().then(session => {
      if (!session && had && navigator.onLine !== false) _signalSessionExpired('focus-token-irrenovavel');
    });
  });
}

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

// Conflito de slot reutilizável FORA do componente Schedule — usado pela Comunicação
// ao aprovar uma reivindicação (instrutor assumindo/entrando numa turma). Mesma
// semântica de sobreposição estrita do checkSlotConflict do Schedule (toca ≠ sobrepõe).
// `existingRows` = todas as rows de schedules; retorna {instrConflict, localConflict}.
const scheduleSlotConflict = (existingRows, { date, startTime, endTime, instructorId, local, excludeRowId } = {}) => {
  if (!date || !startTime || !endTime) return { instrConflict: false, localConflict: false };
  const nS = timeToMins(startTime), nE = timeToMins(endTime);
  let instrConflict = false, localConflict = false;
  for (const ex of (existingRows || [])) {
    if (!ex || ex.date !== date || !ex.startTime || !ex.endTime) continue;
    if (excludeRowId != null && String(ex.id) === String(excludeRowId)) continue;
    const eS = timeToMins(ex.startTime), eE = timeToMins(ex.endTime);
    if (!(nS < eE && eS < nE)) continue;
    if (instructorId && ex.instructorId && +instructorId === +ex.instructorId) instrConflict = true;
    if (local && ex.local && local === ex.local) localConflict = true;
    if (instrConflict && localConflict) break;
  }
  return { instrConflict, localConflict };
};
window.__scheduleSlotConflict = scheduleSlotConflict;

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

// meta = { reason, className, deletedBy } (opcional) — persiste motivo de exclusão no tombstone
const _markClassDeleted = (classId, meta) => {
  if (!classId) return;
  _deletedClassIdsMemory.add(classId);
  const map = _readDeletedClasses();
  const now = Date.now();
  map[classId] = meta ? { ts: now, ...meta } : now;
  // Limpa entradas expiradas — suporta formato antigo (number) e novo (object)
  for (const id of Object.keys(map)) {
    const entry = map[id];
    const ts = typeof entry === 'object' ? entry.ts : entry;
    if (now - ts > _TOMBSTONE_TTL_MS) delete map[id];
  }
  try { localStorage.setItem(_LS_DELETED_CLASSES_KEY, JSON.stringify(map)); } catch {}
  // Espelha no Supabase para fechar gap multi-device.
  _syncTombstoneToSupabase(map);
};

const _isClassDeleted = (classId) => {
  if (!classId) return false;
  if (_deletedClassIdsMemory.has(classId)) return true;
  const map = _readDeletedClasses();
  const entry = map[classId];
  if (!entry) return false;
  const ts = typeof entry === 'object' ? entry.ts : entry;
  if ((Date.now() - ts) >= _TOMBSTONE_TTL_MS) return false;
  _deletedClassIdsMemory.add(classId); // popula memória no boot
  return true;
};
window.__isClassDeleted = _isClassDeleted;

// Retorna log de exclusões com motivo registrado (tombstones com campo reason).
const getDeletionLog = () => {
  const map = _readDeletedClasses();
  return Object.entries(map)
    .filter(([, v]) => typeof v === 'object' && v.reason)
    .map(([classId, v]) => ({ classId, ...v }))
    .sort((a, b) => b.ts - a.ts);
};
window.getDeletionLog = getDeletionLog;

// Populador chamado pelo AppLoader assim que _initialData chega.
// Hidrata _deletedClassIdsMemory com os tombstones globais (Supabase),
// garantindo que a reconciliação do useSchedules já saiba o que está deletado.
const _hydrateTombstonesFromInitialData = () => {
  const dbMap = _initialData && _initialData[_TOMBSTONE_DB_KEY];
  if (!dbMap || typeof dbMap !== 'object') return;
  const now = Date.now();
  const merged = _readDeletedClasses();
  for (const [cid, val] of Object.entries(dbMap)) {
    // Suporta formato antigo (number) e novo (object com ts + meta de exclusão)
    const ts = typeof val === 'object' ? val.ts : val;
    if (typeof ts !== 'number') continue;
    // TTL global de 7 dias — depois disso ignora.
    if (now - ts > _TOMBSTONE_DB_TTL_MS) continue;
    _deletedClassIdsMemory.add(cid);
    // Atualiza LS local se ainda não tem (ou tem timestamp mais antigo)
    const existingTs = merged[cid] ? (typeof merged[cid] === 'object' ? merged[cid].ts : merged[cid]) : 0;
    if (existingTs < ts) merged[cid] = val;
  }
  try { localStorage.setItem(_LS_DELETED_CLASSES_KEY, JSON.stringify(merged)); } catch {}
};
window.__hydrateTombstones = _hydrateTombstonesFromInitialData;

// Helper defensivo: DELETE explícito por classId (UUID único por turma).
// Usado por deleteClass e saveEditItems para garantir que rows velhas vão embora
// mesmo se o diff falhar por qualquer motivo (precisão, race, realtime fora de sync).
// Antes era por className, mas isso apagava turmas distintas com mesmo nome.
const _deleteSchedulesByClassId = (classId, meta) => {
  _markClassDeleted(classId, meta); // tombstone imediato — bloqueia eco Realtime e reconciliação
  _persistQueue = _persistQueue
    .then(async () => {
      const { error } = await _withTimeout(sb.from('relyon_schedules').delete().eq('classId', classId), `delete-by-class ${classId}`);
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

// Erros PERMANENTES de schema/dados: retry NÃO resolve. Coluna inexistente no cache do
// PostgREST (PGRST204), not-null, tipo inválido, check/FK. Sem classificá-los, um INSERT
// malformado fica pingando 400 pra sempre — invisível, eternamente "ainda em retry"
// (incidente 2026-06-07: a coluna nasceu 'planning_type' mas o código manda 'planningType'
// → 400 travou a fila de turmas por horas, sem mensagem). Tratamos igual a failed-rls:
// vira alerta vermelho fixo, sem auto-retry, e a UI passa a mostrar o erro real.
const _isSchemaError = (err) => {
  const msg = ((err && err.message) || '').toLowerCase();
  return msg.includes('pgrst204') ||
         (msg.includes('could not find') && msg.includes('column')) ||
         msg.includes('schema cache') ||
         msg.includes('violates not-null') ||
         msg.includes('null value in column') ||
         msg.includes('invalid input syntax') ||
         msg.includes('violates check constraint') ||
         msg.includes('violates foreign key');
};
const _isPermanentError = (err) => _isRlsError(err) || _isSchemaError(err);

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
    status: _isPermanentError(err) ? 'failed-rls' : 'pending',
  };
  state.ops.push(entry);
  _outboxWrite(state);
  if (state.ops.length >= _OUTBOX_MAX_OPS_WARN) {
    console.error(`[outbox] ${state.ops.length} ops pendentes — investigar causa.`);
  }
  console.warn(`[outbox] enfileirado ${entry.op} (status=${entry.status}, erro="${entry.lastError}")`);
  if (entry.status === 'pending') _scheduleOutboxFlush();
  // Escrita negada por RLS = sessão anon/vencida (o caso José Fardim: login caiu no
  // fallback local e a 1ª gravação já morreu aqui). Relogin é a cura — derruba pro
  // Login em vez de acumular badge vermelho. Só RLS: erro de schema não se resolve
  // com relogin (ficaria num loop de derrubadas inútil).
  if (_isRlsError(err)) _signalSessionExpired('escrita-negada-rls');
  return entry;
}

// Whitelist de colunas reais da tabela relyon_schedules. Qualquer outro campo
// em rows do LS (resíduo de planItem: slots, _minutes, mod, _chunkOf,
// _continuationChunks, uid, hasTranslator) faz o PostgREST devolver 400 e o
// INSERT/UPDATE inteiro falhar. Whitelist é mais robusto que blacklist:
// novos campos transitórios não quebram o save silenciosamente.
const _SCHEDULE_COLUMNS = new Set([
  'id','classId','trainingId','trainingName','className','date','startTime','endTime',
  'local','instructorId','instructorName','module','moduleId','role','studentCount',
  'observation','status','issue','issueAt','issueBy','issueLog','confirmedAt','confirmedBy',
  'linkedClassNames','linkedClassIds','lunchSchedule','base','planningType',
]);
const _stripScheduleRow = (row) => {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const k of Object.keys(row)) {
    if (_SCHEDULE_COLUMNS.has(k)) out[k] = row[k];
  }
  return out;
};
window.__stripScheduleRow = _stripScheduleRow;

async function _executeOutboxOp(entry) {
  // Reexecuta a op original contra o Supabase. LWW: usa upsert para insert
  // (cobre o caso raríssimo do id já existir por reentrada), e simples update/
  // delete por id para os outros — update em row inexistente retorna 0 rows sem
  // erro, delete idem.
  if (entry.op === 'insert' && entry.rows && entry.rows.length) {
    // Strip defensivo: ops legadas na outbox podem ter rows contaminadas (slots/_minutes/mod).
    const cleanRows = entry.rows.map(_stripScheduleRow);
    const { error } = await _withTimeout(sb.from('relyon_schedules').upsert(cleanRows, { onConflict: 'id' }), `outbox insert ${cleanRows.length}`);
    if (error) throw new Error(error.message);
  } else if (entry.op === 'delete' && entry.ids && entry.ids.length) {
    const { error } = await _withTimeout(sb.from('relyon_schedules').delete().in('id', entry.ids), `outbox delete ${entry.ids.length}`);
    if (error) throw new Error(error.message);
  } else if (entry.op === 'update' && entry.row && entry.row.id != null) {
    // Whitelist (_stripScheduleRow) cobre issueStatus + qualquer outro resíduo
    // de planItem que tenha sobrado em ops antigas da outbox.
    const cleaned = _stripScheduleRow(entry.row);
    const { id, ...rest } = cleaned;
    const { error } = await _withTimeout(sb.from('relyon_schedules').update(rest).eq('id', id), `outbox update ${id}`);
    if (error) throw new Error(error.message);
  } else if (entry.op === 'delete-by-class' && entry.classId) {
    const { error } = await _withTimeout(sb.from('relyon_schedules').delete().eq('classId', entry.classId), `outbox delete-by-class ${entry.classId}`);
    if (error) throw new Error(error.message);
  } else {
    throw new Error(`Op inválida na outbox: ${entry.op}`);
  }
}

let _outboxFlushing = false;
let _outboxFlushTimer = null;

const _backoffMs = (attempts) =>
  _OUTBOX_BACKOFF_MS[Math.min(attempts, _OUTBOX_BACKOFF_MS.length - 1)];

async function _outboxFlush(opts) {
  // force=true (botão "Sincronizar agora"): re-tenta TODAS as ops, inclusive as marcadas
  // failed-rls (o usuário corrigiu a causa raiz e quer reprocessar) e ignora o backoff.
  // O flush automático (online/focus/timer) continua processando só as 'pending'.
  const force = !!(opts && opts.force);
  if (_outboxFlushing) return;
  if (!force && typeof navigator !== 'undefined' && navigator.onLine === false) return;
  _outboxFlushing = true;
  let progressed = false;
  try {
    // §8.6 (fresta 1 do cutover 2026-07-02): garante sessão authenticated —
    // renovando JWT vencido — antes de QUALQUER escrita. Sem sessão, NÃO escreve
    // como anon: segura a fila, sinaliza relogin e deixa o __postLoginRefresh
    // (force) drenar depois do login. O flush volta a rodar em online/focus/save.
    if (_outboxRead().ops.length > 0 && !(await _ensureFreshSession())) {
      _emitSave({ ok: false, key: 'relyon_schedules', msg: 'Sessão expirada — entre novamente para sincronizar as alterações pendentes.' });
      _signalSessionExpired('outbox-flush-sem-sessao');
      return;
    }
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
      (force || o.status === 'pending') &&
      (force || o.lastAttemptAt == null || (o.lastAttemptAt + _backoffMs(o.attempts)) <= now)
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
        // Violação do UNIQUE INDEX em INSERT replay: _executeOutboxOp usa
        // upsert(onConflict:'id'), então conflito de ID nunca chega aqui como erro —
        // 23505 neste ponto é a unique_slot (slot ocupado por OUTRO id). Remover a op
        // (comportamento antigo) perdia a row nova em silêncio — mesmo modo de perda
        // do reorder (CBSP 02, 2026-07-15). Marca como permanente: alerta vermelho
        // fixo, resolução manual/"Sincronizar agora" (igual ao caso de UPDATE abaixo).
        if (entry.op === 'insert' && _isUniqueViolation(err)) {
          const fresh = _outboxRead();
          const target = fresh.ops.find(o => o.id === entry.id);
          if (target) {
            target.attempts++;
            target.lastAttemptAt = Date.now();
            target.lastError = err.message;
            target.status = 'failed-rls'; // retry não resolve — alerta fixo
            _outboxWrite(fresh);
          }
          console.error(`[outbox] op insert ${entry.id} bloqueada por unique constraint (slot ocupado sob outro id) — marcada como permanente, requer investigação manual: ${err.message}`);
          continue;
        }
        // Violação do UNIQUE INDEX em UPDATE (ou outras ops que não insert) = a NOVA
        // combinação classId+moduleId+date+startTime+instructorId+role colide com
        // outra row já existente. Diferente do insert (mesma row já existe → pode
        // descartar com segurança), aqui retry NUNCA resolve sozinho — precisa de
        // investigação manual (provável duplicata real ou edição conflitante).
        // Sem isso a op fica "ainda em retry" pra sempre, silenciosamente
        // (incidente 2026-06-08: T-HUET-05 preso há 5+ tentativas). Marca como
        // permanente — vira alerta vermelho fixo com a mensagem real, igual a _isSchemaError.
        if (entry.op !== 'insert' && _isUniqueViolation(err)) {
          const fresh = _outboxRead();
          const target = fresh.ops.find(o => o.id === entry.id);
          if (target) {
            target.attempts++;
            target.lastAttemptAt = Date.now();
            target.lastError = err.message;
            target.status = 'failed-rls'; // retry não resolve — alerta fixo
            _outboxWrite(fresh);
          }
          console.error(`[outbox] op ${entry.op} ${entry.id} bloqueada por unique constraint — marcada como permanente, requer investigação manual: ${err.message}`);
          continue;
        }
        const fresh = _outboxRead();
        const target = fresh.ops.find(o => o.id === entry.id);
        if (target) {
          target.attempts++;
          target.lastAttemptAt = Date.now();
          target.lastError = err.message;
          if (_isPermanentError(err)) target.status = 'failed-rls';
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
  const _stripRow = _stripScheduleRow;
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
  const pendingMap = _readPendingUploads();
  const missing = ls.filter(s =>
    s && s.id != null &&
    !sbIds.has(String(s.id)) &&
    pendingMap[String(s.id)] != null &&     // só uploads genuínos não confirmados (server-authoritative)
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
  window.addEventListener('online', () => { console.info('[outbox] online detectado — flushing'); _outboxFlush(); _dirtyFlush(); });
  window.addEventListener('focus', () => { _outboxFlush(); _dirtyFlush(); });
  setTimeout(() => { _outboxFlush(); _dirtyFlush(); }, 3000);
  // Guard: avisa antes de fechar a aba quando há pendências reais. O Chrome
  // ignora a mensagem custom desde 2017, mas o prompt nativo aparece. Em uso
  // normal (outbox vazia) nem dispara — silencioso por padrão.
  window.addEventListener('beforeunload', (e) => {
    if (_outboxStats().pending > 0 || _dirtyStats().pending > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// ── JOURNAL DE UPLOADS PENDENTES (write-ahead leve) ───────────────────────────
// CAUSA RAIZ do bug crônico "exclusão não firma / treino volta versão": a
// reconciliação tratava QUALQUER row local ausente do Supabase como "trabalho não
// sincronizado" e a REEMPURRAVA pro banco. Isso ressuscita (a) turmas/módulos
// apagados em OUTRA aba/dispositivo/sessão e (b) órfãs com id null que o
// _readLocalSchedules patcheou. O usuário apaga, dá F5, e volta — eternamente.
//
// CORREÇÃO DEFINITIVA: o Supabase é a FONTE DE VERDADE para EXISTÊNCIA. A única
// row local que pode ser reempurrada é a que ESTE cliente criou e ainda NÃO
// confirmou no servidor — registrada aqui (síncrono) no save e removida ao
// confirmar no SB. Todo o resto que está só no local foi apagado no servidor →
// descartar. O outbox continua cobrindo falhas explícitas de escrita (retry).
const _PENDING_UPLOAD_KEY = _LS_PREFIX + 'schedules_pending_upload';
const _PENDING_UPLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias — válvula anti-vazamento
const _readPendingUploads = () => {
  try {
    const raw = localStorage.getItem(_PENDING_UPLOAD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
};
const _writePendingUploads = (map) => {
  try { localStorage.setItem(_PENDING_UPLOAD_KEY, JSON.stringify(map)); } catch {}
};
// Marca ids como "upload pendente" (criados localmente, ainda não confirmados no SB).
const _markPendingUpload = (ids) => {
  if (!ids || !ids.length) return;
  const map = _readPendingUploads();
  const now = Date.now();
  ids.forEach(id => { if (id != null) map[String(id)] = now; });
  for (const k of Object.keys(map)) { if (now - map[k] > _PENDING_UPLOAD_TTL_MS) delete map[k]; }
  _writePendingUploads(map);
};
// Remove ids do journal — chamado quando o SB confirma a presença da row.
const _clearPendingUpload = (ids) => {
  if (!ids || !ids.length) return;
  const map = _readPendingUploads();
  let changed = false;
  ids.forEach(id => { if (map[String(id)] != null) { delete map[String(id)]; changed = true; } });
  if (changed) _writePendingUploads(map);
};
window.__pendingUploads = _readPendingUploads;
window.__clearPendingUploads = () => _writePendingUploads({});

async function _persistSchedules(prev, next) {
  // Renova JWT por vencer antes de escrever (§8.6). Sem sessão, segue mesmo assim:
  // pré-aperto o anon ainda escreve; pós-aperto o 42501 cai na outbox, cujo flush
  // segura a fila e pede novo login (nunca perde a op nem escreve anon em retry).
  await _ensureFreshSession();
  const prevMap = new Map(prev.map(s => [String(s.id), s]));
  const nextMap = new Map(next.map(s => [String(s.id), s]));
  // strip = whitelist de colunas reais (ver _stripScheduleRow). Antes era
  // blacklist de 3 campos (created_at/updated_at/issueStatus), o que deixava
  // passar resíduos de planItem (slots/_minutes/mod/_chunkOf etc.) que
  // contaminavam LS legado e quebravam o save com 400.
  const strip = _stripScheduleRow;
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
  // Indicador honesto: até agora a gravação de schedules NÃO emitia evento de
  // save (nem 'pending' nem 'ok'). O pill "Sincronizado" e o "Último save" só
  // refletiam app_state — mentiam sobre o estado real da programação. Agora,
  // havendo trabalho, sinalizamos pending no início e ok no fim (ou o catch do
  // _enqueuePersist emite a falha). Sem trabalho, silêncio (evita spam).
  const _hasWork = toInsert.length > 0 || toDelete.length > 0 || toUpdate.length > 0;
  if (_hasWork) _emitSave({ pending: true, key: 'relyon_schedules' });
  // Ordem das fases: DELETE → UPDATE → INSERT. O reorder de disciplinas re-identifica
  // chunks (mesmo slot volta como row de id NOVO + DELETE da row velha); com INSERT
  // primeiro, a row nova colidia na unique_slot com a velha ainda presente no SB.
  if (toDelete.length) {
    try {
      const { error } = await _withTimeout(sb.from('relyon_schedules').delete().in('id', toDelete), `delete ${toDelete.length}`);
      if (error) throw new Error(error.message);
    } catch (err) {
      _outboxEnqueue({ op: 'delete', ids: toDelete }, err);
      failed.push(`delete(${toDelete.length})`);
    }
  }
  for (const s of toUpdate) {
    // strip() já tira id + qualquer campo não-coluna; reaplica o id como filtro do .eq.
    const cleaned = strip(s);
    const { id, ...rest } = cleaned;
    try {
      // .select('id') faz o PostgREST devolver as rows REALMENTE alteradas.
      // CRÍTICO: um UPDATE por id que não casa NENHUMA row no SB devolve
      // { error:null, data:[] } — ou seja, "sucesso" silencioso. Era a 2ª causa
      // do bug: edição em row cujo id divergiu do banco (LS↔SB) sumia sem erro.
      const { data, error } = await _withTimeout(sb.from('relyon_schedules').update(rest).eq('id', id).select('id'), `update ${id}`);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        // 0 rows casadas: o id local não existe no banco. Tenta inserir a row
        // inteira (recupera a edição). Se o slot já existe sob OUTRO id → é
        // divergência real de identidade: loga ALTO e marca como falha (o catch
        // do _enqueuePersist emite o toast vermelho — nunca mais silencioso).
        const { error: insErr } = await _withTimeout(sb.from('relyon_schedules').insert(cleaned), `update->insert ${id}`);
        if (insErr && _isUniqueViolation(insErr)) {
          console.error(`[_persistSchedules] UPDATE id=${id} não casou nenhuma row e o slot já existe sob outro id no SB — divergência de identidade. Edição NÃO aplicada; rode "Forçar sincronização".`);
          failed.push(`update-divergente(${id})`);
        } else if (insErr) {
          throw new Error(insErr.message);
        } else {
          console.warn(`[_persistSchedules] UPDATE id=${id} não casou; row reinserida no SB (id estava ausente).`);
        }
      }
    } catch (err) {
      _outboxEnqueue({ op: 'update', row: cleaned }, err);
      failed.push(`update(${id})`);
    }
  }
  // INSERT por último (2026-07-15): com INSERT primeiro, o chunk re-identificado pelo
  // reorder colidia na unique_slot com a row velha ainda não deletada, o batch INTEIRO
  // era descartado como "já existe equivalente" e o DELETE seguinte apagava a row velha
  // → disciplina sumia do banco em silêncio (incidente CBSP 02, 6h perdidas).
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
      const { error } = await _withTimeout(sb.from('relyon_schedules').insert(toInsertFixed.map(strip)), `insert ${toInsertFixed.length}`);
      if (error) throw new Error(error.message);
      _clearPendingUpload(toInsertFixed.map(s => s.id)); // confirmado no SB → sai do journal
    } catch (err) {
      if (_isUniqueViolation(err)) {
        // Violação de unique no batch: em geral só UMA row é duplicata — descartar o
        // batch inteiro perdia as demais junto. Re-tenta row a row, pula só a culpada.
        for (const s of toInsertFixed) {
          try {
            const { error: rowErr } = await _withTimeout(sb.from('relyon_schedules').insert([strip(s)]), `insert ${s.id}`);
            if (rowErr) throw new Error(rowErr.message);
            _clearPendingUpload([s.id]);
          } catch (rowErr) {
            if (_isUniqueViolation(rowErr) && failed.length === 0) {
              // DELETEs/UPDATEs desta rodada já aplicados e o slot AINDA ocupado sob
              // outro id → equivalente real já existe no SB (outra sessão salvou
              // antes). Pular é seguro.
              console.warn(`[_persistSchedules] INSERT ${s.id} pulado: slot equivalente já existe no SB. ${rowErr.message}`);
              _clearPendingUpload([s.id]);
            } else {
              // Fase anterior foi pra outbox (a colisão pode ser com a row velha que
              // ainda não saiu do SB) ou erro não-unique: enfileira DEPOIS dela — o
              // flush é FIFO, o delete/update roda primeiro e este insert passa.
              _outboxEnqueue({ op: 'insert', rows: [strip(s)] }, rowErr);
              failed.push(`insert(${s.id})`);
            }
          }
        }
      } else {
        _outboxEnqueue({ op: 'insert', rows: toInsertFixed.map(strip) }, err);
        failed.push(`insert(${toInsertFixed.length})`);
      }
    }
  }
  if (failed.length) throw new Error(`Enfileirado para retry automático: ${failed.join(', ')}`);
  // Sucesso real: sinaliza ok (atualiza "Último save" e o pill verde). Só quando
  // houve trabalho — caso contrário o catch do _enqueuePersist trata a falha.
  if (_hasWork) _emitSave({ ok: true, key: 'relyon_schedules' });
}

// ── ESPELHO LOCAL DE relyon_schedules ─────────────────────────────────────────
// Sem isso, falhas de Supabase causam perda total no Ctrl+Shift+R: o state React
// zera, o fetch paginado relê o banco (sem as rows não-persistidas) e o trabalho
// some. Estratégia: toda mutação grava JSON sincronamente em LS antes do upsert.
// Boot lê LS primeiro (paint imediato) e depois reconcilia com o fetch Supabase.
const _LS_SCHEDULES_KEY = _LS_PREFIX + 'relyon_schedules';
let _lsQuotaAlerted = false;
const _writeLocalSchedules = (next) => {
  try {
    localStorage.setItem(_LS_SCHEDULES_KEY, JSON.stringify(next));
    _lsQuotaAlerted = false;
  } catch (e) {
    // Quota estourada = a garantia offline-first quebrou: se o upsert pro SB
    // falhar, o LS não tem mais o backup e o trabalho some no F5. Antes era
    // engolido (catch vazio). Agora falha ALTO. Dispara só uma vez por episódio
    // pra não spammar o usuário a cada tecla.
    console.error('[_writeLocalSchedules] localStorage falhou (quota cheia?):', e?.message || e);
    if (!_lsQuotaAlerted) {
      _lsQuotaAlerted = true;
      _emitSave({ ok: false, key: 'relyon_schedules', msg: 'Armazenamento local cheio — backup offline falhou. Exporte um backup e limpe dados antigos do navegador.' });
    }
  }
};
const _readLocalSchedules = () => {
  try {
    const raw = localStorage.getItem(_LS_SCHEDULES_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Defensive 1: row sem id em LS é herança do bug pré-2026-05-19. A rede de
    // segurança em setSchedules cobre saves novos via React, mas não cura LS
    // já contaminado — a reconciliação no boot (linha ~559) chama
    // _enqueuePersist direto e o Supabase rejeita com "null value in column id"
    // eternamente. Patchear na leitura fecha o gap.
    // Defensive 2: row com campos não-coluna (slots/_minutes/mod/_chunkOf etc.)
    // é resíduo de planItem do schedule.js que vazou pro setSchedules em
    // versões buggy. PostgREST rejeita o UPDATE/INSERT inteiro com 400. Strip
    // via whitelist cura o LS contaminado no próximo boot.
    let _patched = 0;
    let _sanitized = 0;
    const fixed = parsed.map(r => {
      let row = r;
      if (row && row.id == null) {
        _patched++;
        row = { ...row, id: newScheduleId() };
      }
      const hasExtra = row && typeof row === 'object' && Object.keys(row).some(k => !_SCHEDULE_COLUMNS.has(k));
      if (hasExtra) {
        _sanitized++;
        row = _stripScheduleRow(row);
      }
      return row;
    });
    if (_patched > 0 || _sanitized > 0) {
      if (_patched > 0) console.warn(`[_readLocalSchedules] ${_patched} row(s) sem id em LS — patcheadas defensivamente.`);
      if (_sanitized > 0) console.warn(`[_readLocalSchedules] ${_sanitized} row(s) com campos não-coluna em LS — limpas (whitelist).`);
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
    const loadAll = async () => {
      // §8.6-LEITURA (incidente 2026-07-17): sem sessão authenticated o fetch sai
      // como `anon` e, pós-aperto da RLS, volta VAZIO SEM ERRO. Tratar esse vazio
      // como autoritativo apagava o cache local (reconciliação abaixo) e o
      // instrutor via a semana em branco. Sem sessão: NÃO lê, preserva o LS; o
      // refetch pós-login (_SCHEDULES_REFETCH_EVENT) recarrega sob a sessão nova.
      if (!(await _ensureFreshSession())) {
        console.warn('[useSchedules] sem sessão authenticated — fetch adiado, cache local preservado (leitura anon viria vazia).');
        return;
      }
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
        // Strip created_at/updated_at (existem no SB, não no whitelist _SCHEDULE_COLUMNS).
        // Sem isso, .select('*') contamina LS a cada boot via reconciliação abaixo →
        // warning crônico "[_readLocalSchedules] N row(s) com campos não-coluna" no
        // próximo boot. Fix 2026-06-03.
        all = all.concat(data.map(_stripScheduleRow));
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
        // ── RECONCILIAÇÃO SERVER-AUTHORITATIVE (correção definitiva 2026-06-01) ──
        // O Supabase é a FONTE DE VERDADE para EXISTÊNCIA. A ÚNICA row local-only que
        // preservamos/reempurramos é a que ESTE cliente criou e ainda não confirmou
        // (journal de uploads pendentes). Todo o resto que está só no local foi
        // apagado no servidor (outra aba/dispositivo/sessão) → DESCARTAR. Antes,
        // reempurrávamos tudo o que faltava no SB, o que ressuscitava exclusões e
        // órfãs com id null (patcheadas pelo _readLocalSchedules) — o bug crônico.
        //
        // RELIGAÇÃO 2026-06-09: a DECISÃO vive em js/core.cjs (reconcileSchedules),
        // a MESMA função pura que tests/schedule.test.js cobre — produção e testes
        // compartilham UMA implementação (sem espelho que diverge). Aqui ficam só os
        // EFEITOS colaterais (re-deletar ghosts, gravar LS, reempurrar repush).
        const cleanAll = all.filter(s => !_isClassDeleted(s.classId));
        const { merged, repush: pendingLocal, dropped, ghosts, clearPending, superseded } =
          reconcileSchedules(prev, all, _readPendingUploads(), _isClassDeleted);
        if (ghosts.length > 0) {
          const ghostClassIds = [...new Set(ghosts.map(s => s.classId))];
          console.warn(`[useSchedules] ${ghosts.length} ghost row(s) (classId tombstoned) ainda no Supabase. Re-deletando ${ghostClassIds.length} classId(s).`);
          ghostClassIds.forEach(cid => _deleteSchedulesByClassId(cid));
        }
        _clearPendingUpload(clearPending);   // tudo que o SB já confirmou sai do journal
        if (superseded.length > 0) {
          // NR-12: rows de papel singleton (lead/tradutor) cujo slot o servidor já
          // tem preenchido — versões stale. Saem do journal e NÃO são reempurradas.
          _clearPendingUpload(superseded.map(s => s.id));
          console.warn(`[useSchedules] ${superseded.length} row(s) singleton stale descartadas (slot já preenchido no servidor — anti-ressurreição NR-12).`);
        }
        if (dropped.length > 0) {
          console.warn(`[useSchedules] ${dropped.length} row(s) local-only sem upload pendente — descartadas. Supabase é autoritativo (provavelmente apagadas em outra sessão).`);
        }
        _writeLocalSchedules(merged);
        _liveData.relyon_schedules = merged;
        if (pendingLocal.length > 0) {
          console.warn(`[useSchedules] ${pendingLocal.length} row(s) locais não estavam no Supabase. Reempurrando.`);
          // Insert direto e cirúrgico: evita que o diff de _enqueuePersist inclua
          // rows com id null de outras mutações pendentes no mesmo batch (bug 2026-05-26).
          const _stripRow = _stripScheduleRow;
          sb.from('relyon_schedules').insert(pendingLocal.map(_stripRow)).then(async ({ error }) => {
            if (!error) {
              console.info(`[useSchedules] ${pendingLocal.length} row(s) reempurradas com sucesso.`);
            } else if (_isUniqueViolation(error)) {
              // Batch inteiro rolledback por uma colisão. Isolar fantasmas
              // (slot já existe no SB com id diferente) tentando 1-a-1.
              // Sem essa varredura, as rows fantasmas permanecem no LS
              // eternamente e geram divergência crônica (sintoma 2026-06-01).
              const ghostIds = [];
              const realPending = [];
              for (const row of pendingLocal) {
                const { error: e2 } = await sb.from('relyon_schedules').insert(_stripRow(row));
                if (!e2) realPending.push(row);
                else if (_isUniqueViolation(e2)) ghostIds.push(String(row.id));
                else realPending.push(row);
              }
              if (ghostIds.length > 0) {
                console.warn(`[useSchedules] ${ghostIds.length} row(s) fantasmas removidas do LS (SB tem slot equivalente com id diferente).`);
                const ghostSet = new Set(ghostIds);
                _setLocal(curr => {
                  const cleaned = curr.filter(s => !ghostSet.has(String(s.id)));
                  _writeLocalSchedules(cleaned);
                  _liveData.relyon_schedules = cleaned;
                  return cleaned;
                });
              }
              if (realPending.length > 0) {
                console.info(`[useSchedules] ${realPending.length} row(s) reempurradas com sucesso após isolamento.`);
              }
            } else {
              console.warn('[useSchedules] insert direto falhou, usando _enqueuePersist:', error.message);
              _enqueuePersist(cleanAll, merged);
            }
          });
        }
        return merged;
      });
    };
    loadAll();
    window.addEventListener(_SCHEDULES_REFETCH_EVENT, loadAll);
    const ch = sb.channel('relyon_sched_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relyon_schedules' },
        ({ eventType, new: nw, old: od }) => {
          // Strip created_at/updated_at do payload realtime (mesma razão do fetch acima):
          // o Postgres envia todas as colunas, mas LS só deve ter campos do whitelist.
          const nwClean = nw ? _stripScheduleRow(nw) : nw;
          _setLocal(prev => {
            let next;
            const sid = r => String(r.id);
            if (eventType === 'INSERT') {
              // Ignorar eco Realtime de INSERT para turmas já excluídas localmente.
              // Sem esse guard, o eco de um save anterior ao DELETE ressuscita as rows
              // no estado local → LS contaminado → reconciliação re-insere no banco.
              if (nwClean.classId && _isClassDeleted(nwClean.classId)) next = prev;
              else next = prev.find(s => sid(s) === sid(nwClean)) ? prev : [...prev, nwClean];
            }
            else if (eventType === 'DELETE') next = prev.filter(s => sid(s) !== sid(od));
            else if (eventType === 'UPDATE') next = prev.map(s => sid(s) === sid(nwClean) ? nwClean : s);
            else next = prev;
            _liveData.relyon_schedules = next;
            _writeLocalSchedules(next);
            return next;
          });
        })
      .subscribe();
    return () => { window.removeEventListener(_SCHEDULES_REFETCH_EVENT, loadAll); sb.removeChannel(ch); };
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
      let _sanitized = 0;
      next = next.map(s => {
        let row = s;
        if (row && row.id == null) {
          _idPatched++;
          row = { ...row, id: newScheduleId() };
        }
        // Strip resíduos de planItem (slots/_minutes/mod/_chunkOf etc.) que
        // vazaram do schedule.js — PostgREST rejeitaria o INSERT/UPDATE com 400.
        // Manter aqui é cinto-e-suspensórios contra novos caminhos buggy.
        if (row && typeof row === 'object' && Object.keys(row).some(k => !_SCHEDULE_COLUMNS.has(k))) {
          _sanitized++;
          row = _stripScheduleRow(row);
        }
        return row;
      });
      if (_idPatched > 0) {
        console.warn(`[setSchedules] ${_idPatched} row(s) sem id detectadas; ids atribuídos defensivamente.`);
      }
      if (_sanitized > 0) {
        console.warn(`[setSchedules] ${_sanitized} row(s) com campos não-coluna — limpas via whitelist.`);
      }
      _liveData.relyon_schedules = next;
      // Fase 1 offline-first: LS gravado ANTES do upsert Supabase.
      // Se _enqueuePersist falhar, o dado sobrevive a Ctrl+Shift+R e será reempurrado
      // no boot pelo passo de reconciliação acima.
      _writeLocalSchedules(next);
      // Write-ahead journal: ids NOVOS (em next, ausentes em prev) são uploads
      // pendentes até o Supabase confirmar. Síncrono → fecha a janela entre o save
      // e o INSERT async (F5 imediato não perde a row recém-criada). SÓ estes ids
      // podem ser reempurrados na reconciliação; o resto local-only é descartado.
      const _prevIds = new Set(prev.map(s => String(s.id)));
      _markPendingUpload(next.filter(s => s && s.id != null && !_prevIds.has(String(s.id))).map(s => s.id));
      _enqueuePersist(prev, next);
      // Frente 3: gera notificações para os instrutores afetados por inserções/alterações/cancelamentos
      try { generateNotificationsFromScheduleDiff(prev, next); } catch (e) { console.error('notif diff err', e); }
      return next;
    });
  }, []);
  return [schedules, setSchedules];
};

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
// timeToMins vive em js/core.cjs (fonte única; carrega antes deste módulo).

// ── GRADE HORÁRIA — fonte única de timing (almoço, transbordo, chunks) ───────
// Runtime usado por Schedule (criação/edição) e por ai.js (planejamento auto).
// logic.js espelha esta lógica para os testes (vitest). Manter as duas em sync.
//
// Precedência de almoço: planItem.lunchSchedule > training.lunchSchedule > DEFAULT_LUNCH.
// O CALLER resolve antes de chamar (resolveLunch); funções core recebem só o objeto final.
const DEFAULT_LUNCH = { start: 12 * 60, end: 13 * 60 };
const DEFAULT_DAY_END = 17 * 60;
const DEFAULT_DAY_START = 8 * 60;

// minsToTimeG vive em constants.js (carregado depois de config.js); como
// recalcTimes/applyDaySchedule só são chamadas em runtime, o forward-ref funciona.
const _addDaysG = (ds, n) => { const d = new Date(ds + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };

// Aceita { start, end } em string "HH:MM" ou em minutos. Inválido => default.
const lunchFromSchedule = (sched) => {
  if (!sched) return DEFAULT_LUNCH;
  const s = typeof sched.start === "string" ? timeToMins(sched.start) : sched.start;
  const e = typeof sched.end   === "string" ? timeToMins(sched.end)   : sched.end;
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return DEFAULT_LUNCH;
  return { start: s, end: e };
};

// Resolve qual almoço usar para um item/turma. CALLER deve usar esse helper
// antes de chamar recalcTimes/applyDaySchedule.
const resolveLunch = (planItem, training) => {
  return lunchFromSchedule(planItem?.lunchSchedule || training?.lunchSchedule);
};

// Factory default para chunks de continuação (versão "logic.js"/testes).
// Schedule e ai.js passam factories próprias para preservar id/uid/slots.
const _defaultChunkFactory = (item, isFirst, curDate, startStr, endStr, _chunkIdx) => {
  if (isFirst) return { ...item, date: curDate, startTime: startStr, endTime: endStr };
  return { ...item, id: item.id + '_' + curDate, date: curDate, startTime: startStr, endTime: endStr };
};

// recalcTimes — calcula data/horário de cada chunk respeitando intervalo de almoço.
//   items         — planItems com mod.minutes
//   startDateStr  — "YYYY-MM-DD" do primeiro chunk
//   startMins     — minuto-do-dia inicial (08:00 = 480)
//   dayEnd        — minuto-do-dia limite (default 17:00 = 1020)
//   lunch         — { start, end } em minutos (default 12:00–13:00)
//   chunkFactory  — (item, isFirst, curDate, startStr, endStr, chunkIdx) => row
const recalcTimes = (items, startDateStr, startMins, dayEnd = DEFAULT_DAY_END, lunch = DEFAULT_LUNCH, chunkFactory = _defaultChunkFactory) => {
  const LUNCH_S = lunch.start, LUNCH_E = lunch.end;
  let curDate = startDateStr, cur = startMins;
  const result = [];
  for (const item of items) {
    let remaining = item.mod?.minutes || 60;
    let isFirst = true;
    let chunkIdx = 0;
    while (remaining > 0) {
      if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
      if (cur >= dayEnd) { curDate = _addDaysG(curDate, 1); cur = DEFAULT_DAY_START; }
      let periodEnd = cur < LUNCH_S ? LUNCH_S : dayEnd;
      let available = periodEnd - cur;
      if (available <= 0) {
        if (cur < LUNCH_E) { cur = LUNCH_E; periodEnd = dayEnd; available = dayEnd - LUNCH_E; }
        else { curDate = _addDaysG(curDate, 1); cur = DEFAULT_DAY_START; periodEnd = LUNCH_S; available = LUNCH_S - DEFAULT_DAY_START; }
      }
      const chunk = Math.min(remaining, available);
      const endM = cur + chunk;
      result.push(chunkFactory(item, isFirst, curDate, minsToTimeG(cur), minsToTimeG(endM), chunkIdx));
      remaining -= chunk;
      cur = endM;
      isFirst = false;
      chunkIdx++;
      if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
      if (cur >= dayEnd && remaining > 0) { curDate = _addDaysG(curDate, 1); cur = DEFAULT_DAY_START; }
    }
  }
  return result;
};

// applyDaySchedule — variante usada no edit-mode (Schedule). Ancora no startTime
// do PRIMEIRO item e usa item._minutes (duração do chunk, não do módulo inteiro).
const applyDaySchedule = (items, dayEnd = DEFAULT_DAY_END, lunch = DEFAULT_LUNCH, chunkFactory = _defaultChunkFactory) => {
  if (!items.length) return items;
  const LUNCH_S = lunch.start, LUNCH_E = lunch.end;
  let curDate = items[0].date;
  let cur = items[0].startTime ? timeToMins(items[0].startTime) : DEFAULT_DAY_START;
  const result = [];
  for (const item of items) {
    let remaining = item._minutes || 60;
    let isFirst = true;
    let chunkIdx = 0;
    while (remaining > 0) {
      if (cur >= LUNCH_S && cur < LUNCH_E) cur = LUNCH_E;
      if (cur >= dayEnd) { curDate = _addDaysG(curDate, 1); cur = DEFAULT_DAY_START; }
      const periodEnd = cur < LUNCH_S ? LUNCH_S : dayEnd;
      let available = periodEnd - cur;
      if (available <= 0) {
        cur = cur < LUNCH_E ? LUNCH_E : DEFAULT_DAY_START;
        if (cur === DEFAULT_DAY_START) curDate = _addDaysG(curDate, 1);
        continue;
      }
      const chunk = Math.min(remaining, available);
      const endM = cur + chunk;
      result.push(chunkFactory(item, isFirst, curDate, minsToTimeG(cur), minsToTimeG(endM), chunkIdx));
      remaining -= chunk;
      cur = endM;
      isFirst = false;
      chunkIdx++;
    }
  }
  return result;
};

// skillMatchesModule e skillMatchesModuleName vivem em js/core.cjs (fonte única;
// carrega antes deste módulo). Não recriar aqui — colidiria no bundle.

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

