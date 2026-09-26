# Starts all four agent services (ports 8001-8004) and the orchestration gateway (port 8000).
#
# Usage (from the project root, in PowerShell):
#   .\scripts\start_agents.ps1            # use the LLM settings from .env
#   .\scripts\start_agents.ps1 -NoLlm     # rules + templates only, no model is called
#
# If scripts are blocked: powershell -ExecutionPolicy Bypass -File .\scripts\start_agents.ps1
# Set $env:PYTHON to choose the interpreter (default: python). Each service logs to
# logs\<service>.log and logs\<service>.err.log. Press Ctrl+C to stop every service.

param([switch]$NoLlm)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$python = if ($env:PYTHON) { $env:PYTHON } else { "python" }
$logDir = "logs"
New-Item -ItemType Directory -Force $logDir | Out-Null

if ($NoLlm) {
    # Agent 4 uses template wording. Any Ollama call (e.g. from Agent 1 if it is
    # switched to Ollama) goes to a closed port, fails at once and falls back to
    # rules. Agent 1's Gemini step still runs if GEMINI_API_KEY is set in .env.
    $env:EXPLANATION_USE_LLM = "false"
    $env:LLM_PROVIDER = "ollama"
    $env:OLLAMA_HOST = "http://127.0.0.1:9"
    $env:LLM_MAX_RETRIES = "0"
    Write-Host "No-LLM mode: rules and templates only."
}

$services = @(
    @{ Name = "risk_agent";        Module = "agents.risk_agent.main:app";        Port = 8001 },
    @{ Name = "policy_agent";      Module = "agents.policy_agent.main:app";      Port = 8002 },
    @{ Name = "coverage_agent";    Module = "agents.coverage_agent.main:app";    Port = 8003 },
    @{ Name = "explanation_agent"; Module = "agents.explanation_agent.main:app"; Port = 8004 },
    @{ Name = "gateway";           Module = "services.orchestration.api:app";    Port = 8000 }
)

$processes = @()
try {
    foreach ($s in $services) {
        $processes += Start-Process -FilePath $python -PassThru -NoNewWindow `
            -ArgumentList "-m", "uvicorn", $s.Module, "--port", $s.Port `
            -RedirectStandardOutput (Join-Path $logDir "$($s.Name).log") `
            -RedirectStandardError (Join-Path $logDir "$($s.Name).err.log")
        Write-Host "Started $($s.Name) on port $($s.Port) (log: $logDir\$($s.Name).err.log)"
    }

    # Wait up to 60 s for each /health endpoint.
    foreach ($s in $services) {
        $status = "DOWN"
        for ($i = 0; $i -lt 60; $i++) {
            try {
                Invoke-RestMethod "http://127.0.0.1:$($s.Port)/health" -TimeoutSec 1 | Out-Null
                $status = "up"
                break
            } catch {
                Start-Sleep -Seconds 1
            }
        }
        Write-Host ("  {0,-18} {1}" -f $s.Name, $status)
    }

    Write-Host ""
    Write-Host "Gateway: http://127.0.0.1:8000/docs   Agent status: http://127.0.0.1:8000/health/agents"
    Write-Host "Press Ctrl+C to stop."
    Wait-Process -Id ($processes | ForEach-Object Id)
}
finally {
    Write-Host "Stopping services..."
    foreach ($p in $processes) {
        if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    }
}
