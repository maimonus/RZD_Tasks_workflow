#Requires -Version 5.1
param()

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"

function Wait-ForPort {
  param(
    [Parameter(Mandatory = $true)][string]$ComputerName,
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $false)][int]$TimeoutSeconds = 60
  )

  for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
    try {
      if (Test-NetConnection -ComputerName $ComputerName -Port $Port -InformationLevel Quiet) {
        return
      }
    } catch {
      # ignore transient failures while server is starting
    }
    Start-Sleep -Seconds 1
  }

  throw "Backend не поднялся за отведённое время. Порт $ComputerName`:$Port не доступен."
}

Write-Host "=== Backend: подготовка venv и установка зависимостей ==="
if (-not (Test-Path (Join-Path $backendDir ".venv"))) {
  Push-Location $backendDir
  py -3.12 -m venv .venv
  Pop-Location
}

$pythonExe = Join-Path $backendDir ".venv\Scripts\python.exe"

Push-Location $backendDir
& $pythonExe -m pip install -r requirements.txt
Pop-Location

Write-Host "=== Backend: запуск uvicorn (reload) ==="
$backendProcess = Start-Process -FilePath $pythonExe `
  -ArgumentList "-m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" `
  -WorkingDirectory $backendDir `
  -NoNewWindow `
  -PassThru

Write-Host "Ждём поднятия backend на http://localhost:8000 ..."
Wait-ForPort -ComputerName "localhost" -Port 8000 -TimeoutSeconds 60
Write-Host "Backend поднялся."

Write-Host "=== Frontend: npm install и запуск dev server ==="
Push-Location $frontendDir
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass | Out-Null

npm install
$frontendProcess = Start-Process -FilePath "npm.cmd" -WorkingDirectory $frontendDir -ArgumentList "run dev" -NoNewWindow -PassThru
Pop-Location

Write-Host "Локалка запущена. Оставляю процессы backend/frontend запущенными."
Wait-Process -Id $backendProcess.Id
if ($frontendProcess -and $frontendProcess.Id) {
  Wait-Process -Id $frontendProcess.Id
}
