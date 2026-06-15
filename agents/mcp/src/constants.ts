// ── SUPABASE ──────────────────────────────────────────────────────────────────
export const SUPABASE_URL = 'https://snpvqqsmwrlazawjknme.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucHZxcXNtd3JsYXphd2prbm1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTg0MjAsImV4cCI6MjA5MDk5NDQyMH0.124Cybz_lv6Op1TM62kVUs87b60f4y5mIFhxwN09tlk';

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

// Categorias que cobrem o dia inteiro — espelho de FULL_DAY_CATEGORIES em js/constants.js
export const FULL_DAY_ABSENCE_CATEGORIES = [
  'Atestado Médico',
  'Férias',
  'Folga Abonada',
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
};
