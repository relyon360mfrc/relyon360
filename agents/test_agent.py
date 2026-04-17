"""
test_agent.py — Subagente de Teste do RelyOn 360
Posição na arquitetura Fritz: subordinado direto do Fritz

Responsabilidades:
  - Executar a suite Vitest (js/logic.js)
  - Parsear resultado (pass/fail por caso)
  - Reportar em linguagem natural via Gemini Flash
  - Retornar dict estruturado para Fritz consumir como tool

Uso standalone:
  python agents/test_agent.py

Uso via Fritz (tool call):
  from agents.test_agent import run
  resultado = run()
  # resultado = { ok, passed, failed, failed_tests, report }

Variável de ambiente necessária para relatório com Gemini:
  GEMINI_API_KEY=<sua chave>
  (sem a chave, o subagente ainda funciona — relatório é gerado localmente)
"""

import subprocess
import json
import re
import sys
import os

# ── Localização do projeto ─────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
RELYON360_DIR = os.path.dirname(_HERE)  # pasta relyon360/

# ── Execução dos testes ────────────────────────────────────────────────────────
def _run_tests() -> dict:
    """Executa npm test e captura stdout/stderr."""
    try:
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        proc = subprocess.run(
            [npm_cmd, "test"],
            cwd=RELYON360_DIR,
            capture_output=True,
            text=True,
            timeout=60
        )
        return {"exit_code": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}
    except subprocess.TimeoutExpired:
        return {"exit_code": -1, "stdout": "", "stderr": "Timeout após 60s"}
    except FileNotFoundError:
        return {"exit_code": -1, "stdout": "", "stderr": "npm não encontrado — instale Node.js"}


# ── Parser do output Vitest ────────────────────────────────────────────────────
_ANSI = re.compile(r"\x1b\[[0-9;]*m")

def _strip_ansi(s: str) -> str:
    return _ANSI.sub("", s)

def _parse(stdout: str) -> dict:
    """Extrai métricas estruturadas do output do Vitest."""
    clean = _strip_ansi(stdout)

    # "20 tests" na linha de arquivo  ✓ tests/logic.test.js (20 tests)
    total_match = re.search(r"\((\d+) tests?\)", clean)
    n_total = int(total_match.group(1)) if total_match else 0

    # Linha "Tests  20 passed (20)"
    pass_match = re.search(r"Tests\s+(\d+) passed", clean)
    fail_match = re.search(r"(\d+) failed",          clean)
    n_pass = int(pass_match.group(1)) if pass_match else n_total
    n_fail = int(fail_match.group(1)) if fail_match else 0

    # Capturar nomes dos testes que falharam (linha com ✗ ou FAIL)
    failed_names = re.findall(r"(?:✗|×|FAIL)\s+(.+)", stdout)

    # Capturar suites (describe blocks)
    suites = re.findall(r"▶\s+(.+)", stdout)

    return {
        "total":        n_pass + n_fail,
        "passed":       n_pass,
        "failed":       n_fail,
        "failed_tests": [t.strip() for t in failed_names],
        "suites":       suites,
    }


# ── Relatório via Gemini Flash ─────────────────────────────────────────────────
def _gemini_report(stdout: str, metrics: dict) -> str:
    """Interpreta resultados com Gemini 2.5 Flash. Fallback local se sem API key."""
    api_key = os.environ.get("GEMINI_API_KEY")

    if not api_key:
        return _local_report(metrics)

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash-preview-04-17")

        prompt = f"""
Você é o Subagente de Teste do RelyOn 360 Scheduler, um app de gestão de treinamentos.
O seu papel é interpretar o resultado abaixo do Vitest e produzir um relatório conciso
em português para o agente Fritz repassar ao usuário.

Regras:
- Se todos os testes passaram: confirme que o código está seguro para deploy
- Se algum falhou: liste os testes com falha, explique o impacto no app (ex: "recalcTimes com falha pode gerar grades horárias incorretas")
- Máximo 5 linhas
- Tom direto, sem enrolação

Output do Vitest:
{stdout}

Métricas: {json.dumps(metrics, ensure_ascii=False, indent=2)}
""".strip()

        response = model.generate_content(prompt)
        return response.text.strip()

    except Exception as e:
        return _local_report(metrics) + f"\n(Gemini indisponível: {e})"


def _local_report(metrics: dict) -> str:
    """Relatório local sem LLM — usado como fallback."""
    if metrics["failed"] == 0:
        return (
            f"✅ Todos os {metrics['total']} testes passaram. "
            f"Código seguro para deploy."
        )
    lines = [f"❌ {metrics['failed']} teste(s) falharam de {metrics['total']}:"]
    for t in metrics["failed_tests"]:
        lines.append(f"  • {t}")
    lines.append("Revise antes de fazer o deploy.")
    return "\n".join(lines)


# ── Interface principal (chamada por Fritz como tool) ──────────────────────────
def run() -> dict:
    """
    Executa a suite de testes e retorna resultado estruturado.

    Retorno:
      ok           bool   — True se todos passaram
      passed       int    — número de testes que passaram
      failed       int    — número de testes que falharam
      failed_tests list   — nomes dos testes com falha
      report       str    — relatório em linguagem natural (PT-BR)
    """
    raw = _run_tests()

    if raw["exit_code"] == -1:
        return {
            "ok": False,
            "passed": 0,
            "failed": -1,
            "failed_tests": [],
            "report": f"⚠️ Erro ao executar os testes: {raw['stderr']}"
        }

    metrics = _parse(raw["stdout"])
    report  = _gemini_report(raw["stdout"], metrics)

    return {
        "ok":           metrics["failed"] == 0,
        "passed":       metrics["passed"],
        "failed":       metrics["failed"],
        "failed_tests": metrics["failed_tests"],
        "report":       report,
    }


# ── Standalone ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    resultado = run()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(resultado["report"])
    sys.exit(0 if resultado["ok"] else 1)
