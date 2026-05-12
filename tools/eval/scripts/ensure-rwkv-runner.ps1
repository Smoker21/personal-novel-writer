# Ensure RWKV-Runner backend is running and the configured model is loaded.
# Idempotent: if both are already true, exits in <1s without reloading the model.
#
# Usage:
#   pwsh ./ensure-rwkv-runner.ps1                                # use defaults
#   pwsh ./ensure-rwkv-runner.ps1 -Model F:/path/to/model.pth    # override model
#   pwsh ./ensure-rwkv-runner.ps1 -Strategy "cuda fp16i8 *20+"   # smaller VRAM
#
# Exits 0 on success, non-zero on failure.

param(
  [string]$RwkvRoot = "F:/workspace/novel_writer/ai-model/RMKV",
  [string]$Model = "F:/workspace/novel_writer/ai-model/RMKV/models/rwkv-5-h-world-7B.pth",
  [string]$Strategy = "cuda fp16",
  [string]$Endpoint = "http://127.0.0.1:27777",
  [int]$Port = 27777,
  [int]$BackendStartTimeoutSec = 60
)

$ErrorActionPreference = "Stop"

function Test-BackendUp {
  try {
    $null = Invoke-RestMethod -Uri "$Endpoint/v1/models" -TimeoutSec 3
    return $true
  } catch {
    return $false
  }
}

function Get-ModelStatus {
  try {
    return Invoke-RestMethod -Uri "$Endpoint/status" -TimeoutSec 3
  } catch {
    return $null
  }
}

# 1. Backend up?
if (Test-BackendUp) {
  Write-Host "[ensure] Backend already running at $Endpoint" -ForegroundColor Green
} else {
  Write-Host "[ensure] Starting backend in $RwkvRoot ..." -ForegroundColor Yellow
  $venvPython = Join-Path $RwkvRoot ".venv/Scripts/python.exe"
  $mainPy     = Join-Path $RwkvRoot "backend-python/main.py"
  if (-not (Test-Path $venvPython)) { throw "venv python not found at $venvPython" }
  if (-not (Test-Path $mainPy))     { throw "main.py not found at $mainPy" }
  Start-Process -FilePath $venvPython `
    -ArgumentList @($mainPy, "--port", "$Port", "--host", "127.0.0.1", "--no-access-log") `
    -WindowStyle Hidden | Out-Null

  $sw = [Diagnostics.Stopwatch]::StartNew()
  while (-not (Test-BackendUp)) {
    if ($sw.Elapsed.TotalSeconds -gt $BackendStartTimeoutSec) {
      throw "Backend did not become healthy within ${BackendStartTimeoutSec}s"
    }
    Start-Sleep -Seconds 2
  }
  Write-Host "[ensure] Backend up after $([int]$sw.Elapsed.TotalSeconds)s" -ForegroundColor Green
}

# 2. Model loaded?
$status = Get-ModelStatus
# status enum: 0=Offline, 1=Starting, 2=Loading, 3=Working
if ($status -and $status.status -eq 3) {
  Write-Host "[ensure] Model already loaded — device $($status.device_name)" -ForegroundColor Green
  exit 0
}

Write-Host "[ensure] Loading model: $Model with strategy '$Strategy' ..." -ForegroundColor Yellow
$body = @{
  model      = $Model
  strategy   = $Strategy
  tokenizer  = ""
  customCuda = $false
  deploy     = $false
} | ConvertTo-Json -Compress

$loadResp = Invoke-RestMethod -Uri "$Endpoint/switch-model" -Method Post `
  -Body $body -ContentType "application/json" -TimeoutSec 600

# Re-check status — switch-model returns when load is complete (status=3 immediately)
$status = Get-ModelStatus
if ($status -and $status.status -eq 3) {
  Write-Host "[ensure] Model loaded — device $($status.device_name)" -ForegroundColor Green
  exit 0
}

Write-Host "[ensure] switch-model returned but status is $($status.status). Investigate." -ForegroundColor Red
exit 1
