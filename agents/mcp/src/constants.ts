// ── SUPABASE ──────────────────────────────────────────────────────────────────
export const SUPABASE_URL = process.env.SUPABASE_URL
  ?? 'https://snpvqqsmwrlazawjknme.supabase.co';

// Chave do Supabase usada pelo servidor MCP.
//
// ⚠️ APÓS O APERTO DE RLS (SEGURANCA.md §8.3, 2026-07-02): a role `anon` NÃO lê nem
// escreve mais nas tabelas do app. O servidor MCP é um backend CONFIÁVEL (protegido
// pelo MCP_AUTH_TOKEN) e NÃO tem sessão de usuário — logo precisa de uma chave que
// passe pela RLS. Use a **SERVICE_ROLE key**, definida SOMENTE via variável de
// ambiente no host (Vercel) — NUNCA committada no repositório (ela ignora a RLS por
// completo; vazá-la equivale a vazar o banco inteiro). Sem ela, TODAS as tools de
// consulta voltam vazias e as de escrita falham.
//
// O literal abaixo é a chave ANON pública (a mesma já exposta no cliente web, sem
// segredo novo): serve só de fallback pra não quebrar o build/dev local. Em produção
// a env SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_KEY) É OBRIGATÓRIA.
export const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.SUPABASE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucHZxcXNtd3JsYXphd2prbm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTg0MjAsImV4cCI6MjA5MDk5NDQyMH0.124Cybz_lv6Op1TM62kVUs87b60f4y5mIFhxwN09tlk';

// ── LIMITES ───────────────────────────────────────────────────────────────────
export const CHARACTER_LIMIT = 25_000;

// ── CATEGORIAS DE AUSÊNCIA ────────────────────────────────────────────────────
// Espelho de ABSENCE_TYPES em js/constants.js — categorias reais usadas em relyon_absences.
// "Folga de aniversário" não é categoria própria: é registrada como "Folga Banco de Horas" + obs.
export const ABSENCE_CATEGORIES = [
  // involuntário
  'Atestado Médico',
  'Licença Paternidade/Maternidade',
  'Consultas e Exames (com declaração)',
  // voluntário
  'Falta',
  'Atrasos e Saídas Antecipadas',
  'Suspensão Disciplinar',
  // planejada
  'Folga Banco de Horas',
  'Folga Abonada',
  'Férias',
  'Embarque',
  'Treinamento/Evento Externo',
] as const;

export type AbsenceCategory = typeof ABSENCE_CATEGORIES[number];

// Deriva o "type" (involuntario/voluntario/planejada) a partir da categoria — espelho de ABSENCE_TYPES
export const ABSENCE_TYPE_BY_CATEGORY: Record<string, string> = {
  'Atestado Médico':                      'involuntario',
  'Licença Paternidade/Maternidade':      'involuntario',
  'Consultas e Exames (com declaração)':  'involuntario',
  'Falta':                                'voluntario',
  'Atrasos e Saídas Antecipadas':         'voluntario',
  'Suspensão Disciplinar':                'voluntario',
  'Folga Banco de Horas':                 'planejada',
  'Folga Abonada':                        'planejada',
  'Férias':                               'planejada',
  'Embarque':                             'planejada',
  'Treinamento/Evento Externo':           'planejada',
};

// Categorias que cobrem o dia inteiro — espelho de FULL_DAY_CATEGORIES em js/core.cjs
// (7 categorias; "Folga Banco de Horas" faltou até 2026-07-07 → planner escalava
// instrutor de folga BH por engano. Golden G08 agora compara com a fonte real.)
export const FULL_DAY_ABSENCE_CATEGORIES = [
  'Atestado Médico',
  'Férias',
  'Folga Abonada',
  'Folga Banco de Horas',
  'Embarque',
  'Licença Paternidade/Maternidade',
  'Suspensão Disciplinar',
];

// ── TIPOS DE ATIVIDADE (Linha do Tempo) ───────────────────────────────────────
// Espelho de ACTIVITY_TYPES em js/constants.js
export const ACTIVITY_TYPES: Record<string, string> = {
  maintenance:        'Manutenção',
  development:        'Desenvolvimento',
  customer_service:   'Apoio Customer Service',
  almoxarifado:       'Apoio Almoxarifado',
  cenario:            'Apoio Cenário',
  marketing:          'Apoio Marketing',
  qsms:               'Apoio QSMS',
  material_pdi:       'Material Didático - PDI',
  holiday_work:       'Feriado',
  mandatory_training: 'Treinamento Obrigatório',
  free:               'Livre',
  embarque:           'Embarque',
};

// ── PAPÉIS (roles) ────────────────────────────────────────────────────────────
export const ROLE_PT: Record<string, string> = {
  'Lead Instructor':        'Inst. Líder',
  'Theoretical Instructor': 'Inst. Teórico',
  'Practical Instructor':   'Inst. Prático',
  'Support Instructor':     'Inst. Apoio',
  'Translator':             'Tradutor',
  'Assistant Instructor':   'Assist. Instrução',
  'Scuba Diver':            'Scuba Diver',
  'Crane Operator':         'Crane Operator',
  'moderador':              'Moderador',
};
