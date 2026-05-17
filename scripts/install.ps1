#!/usr/bin/env pwsh
# Latino Package Manager CLI Installer for Windows and Linux

$ErrorActionPreference = "Stop"

$INSTALL_DIR = if ($env:LATIPM_INSTALL_DIR) { $env:LATIPM_INSTALL_DIR } else { "$HOME/.latipm" }
$BIN_DIR = if ($env:LATIPM_BIN_DIR) { $env:LATIPM_BIN_DIR } else { "$INSTALL_DIR/bin" }
$RELEASE_URL = "https://github.com/LatinoPackageManager/cli/releases/latest/download/latipm-cli.zip"
$TMP_DIR = [System.IO.Path]::GetTempPath() + "latipm-install-" + [System.Guid]::NewGuid()

function Write-Info { Write-Host "[INFO] $args" }
function Write-Error-Msg { Write-Host "[ERROR] $args" -ForegroundColor Red }

function Test-Command {
    param($Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Bun-Installed {
    if (-not (Test-Command "bun")) {
        Write-Info "bun no esta instalado. Instalando bun..."
        if ($IsWindows -or $env:OS -eq "Windows_NT") {
            powershell -c "irm bun.sh/install.ps1 | iex"
        } else {
            curl -fsSL https://bun.sh/install | bash
            $env:PATH = "$HOME/.bun/bin:$env:PATH"
        }
        $env:PATH = [System.Environment]::GetEnvironmentVariable("Path", "User")
    }
}

try {
    Write-Info "Iniciando instalacion de latipm CLI..."
    
    Ensure-Bun-Installed
    
    New-Item -ItemType Directory -Path $TMP_DIR -Force | Out-Null
    New-Item -ItemType Directory -Path $BIN_DIR -Force | Out-Null
    
    $ZIP_FILE = "$TMP_DIR\latipm.zip"
    Write-Info "Descargando CLI desde $RELEASE_URL..."
    Invoke-WebRequest -Uri $RELEASE_URL -OutFile $ZIP_FILE
    
    Write-Info "Extrayendo archivos..."
    Expand-Archive -Path $ZIP_FILE -DestinationPath $TMP_DIR -Force
    
    Write-Info "Copiando CLI a $BIN_DIR..."
    Copy-Item -Path "$TMP_DIR\cli.ts" -Destination "$BIN_DIR\lpm.ts" -Force
    Copy-Item -Path "$TMP_DIR\cli.ts" -Destination "$BIN_DIR\latipm.ts" -Force
    
    if ($IsWindows -or $env:OS -eq "Windows_NT") {
        $WRAPPER_LPM = "@echo off`nbun run `"$BIN_DIR\lpm.ts`" %*`n"
        $WRAPPER_LATIPM = "@echo off`nbun run `"$BIN_DIR\latipm.ts`" %*`n"
        $WRAPPER_LPM | Out-File -FilePath "$BIN_DIR\lpm.cmd" -Encoding ASCII
        $WRAPPER_LATIPM | Out-File -FilePath "$BIN_DIR\latipm.cmd" -Encoding ASCII
    } else {
        $WRAPPER = "#!/bin/sh`nbun run `"$BIN_DIR/lpm.ts`" `"`$@`"`n"
        $WRAPPER | Out-File -FilePath "$BIN_DIR/lpm" -Encoding ASCII
        chmod +x "$BIN_DIR/lpm"
        $WRAPPER | Out-File -FilePath "$BIN_DIR/latipm" -Encoding ASCII
        chmod +x "$BIN_DIR/latipm"
    }
    
    $CURRENT_PATH = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ($CURRENT_PATH -notlike "*$BIN_DIR*") {
        Write-Info "Agregando $BIN_DIR al PATH..."
        [System.Environment]::SetEnvironmentVariable("Path", "$CURRENT_PATH;$BIN_DIR", "User")
    }
    
    Write-Info "Instalacion completada!"
    Write-Info "Ejecuta 'lpm --help' para ver los comandos disponibles."
}
catch {
    Write-Error-Msg $_.Exception.Message
    exit 1
}
finally {
    if (Test-Path $TMP_DIR) { Remove-Item -Path $TMP_DIR -Recurse -Force }
}
