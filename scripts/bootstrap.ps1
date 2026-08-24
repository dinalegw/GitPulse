[CmdletBinding()]
param(
    [switch]$UpgradeDeps
)

$ErrorActionPreference = 'Stop'
$RequiredGo = [version]'1.26.3'
$InstallRoot = if ($env:GITPULSE_INSTALL_ROOT) { $env:GITPULSE_INSTALL_ROOT } else { Join-Path $HOME '.gitpulse' }
$Prefix = if ($env:PREFIX) { $env:PREFIX } else { Join-Path $HOME '.local\bin' }

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message"
}

function Fail([string]$Message) {
    throw "GitPulse bootstrap failed: $Message"
}

function Refresh-Path {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $current = $env:Path
    $parts = @($current, $userPath, $machinePath) | Where-Object { $_ }
    $env:Path = ($parts -join ';')
}

function Get-GoVersion {
    if (-not (Get-Command go -ErrorAction SilentlyContinue)) { return $null }
    $line = (& go version 2>$null)
    if ($LASTEXITCODE -ne 0) { return $null }
    if ($line -match 'go version go([0-9]+\.[0-9]+(?:\.[0-9]+)?)') {
        return [version]$Matches[1]
    }
    return $null
}

function Ensure-Git {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Step "Git detected: $(& git --version)"
        return
    }

    Write-Step 'Git is missing; installing it'
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        & winget install --id Git.Git --exact --source winget --accept-package-agreements --accept-source-agreements
    } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        & choco install git -y
    } else {
        Fail 'Git is missing and neither winget nor Chocolatey is available. Install Git for Windows, then rerun this script.'
    }

    Refresh-Path
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Fail 'Git installation completed but git is still not on PATH. Restart PowerShell and rerun the bootstrap.'
    }
}

function Ensure-Curl {
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) { return }
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        & winget install --id cURL.cURL --exact --source winget --accept-package-agreements --accept-source-agreements
        Refresh-Path
    }
    if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
        Fail 'curl.exe is required to download the Go toolchain. Install curl and rerun the bootstrap.'
    }
}

function Get-GoArchiveName {
    $arch = switch ($env:PROCESSOR_ARCHITECTURE) {
        'AMD64' { 'amd64' }
        'ARM64' { 'arm64' }
        default { Fail "Unsupported Windows architecture: $env:PROCESSOR_ARCHITECTURE" }
    }
    return "go$RequiredGo.windows-$arch.zip"
}

function Get-PrivateGoRoot {
    return (Join-Path $InstallRoot "toolchains\go$RequiredGo")
}

function Use-PrivateGoIfAvailable {
    $goRoot = Get-PrivateGoRoot
    $goExe = Join-Path $goRoot 'bin\go.exe'
    if (Test-Path $goExe) {
        $env:GOROOT = $goRoot
        $env:Path = "$goRoot\bin;$env:Path"
        Write-Step "Reusing private Go: $(& $goExe version)"
        return $true
    }
    return $false
}

function Install-PrivateGo {
    $archiveName = Get-GoArchiveName
    $goRoot = Get-PrivateGoRoot
    $archive = Join-Path $env:TEMP $archiveName
    $url = "https://go.dev/dl/$archiveName"

    New-Item -ItemType Directory -Force -Path (Split-Path $goRoot) | Out-Null
    Write-Step "Downloading Go $RequiredGo from go.dev"
    & curl.exe -fL --retry 3 --retry-delay 2 $url -o $archive
    if ($LASTEXITCODE -ne 0) { Fail "unable to download $url" }

    if (Test-Path $goRoot) { Remove-Item -Recurse -Force $goRoot }
    $tempExtract = Join-Path $env:TEMP "gitpulse-go-extract-$([guid]::NewGuid())"
    New-Item -ItemType Directory -Force -Path $tempExtract | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $tempExtract -Force
    Move-Item -LiteralPath (Join-Path $tempExtract 'go') -Destination $goRoot
    Remove-Item -Recurse -Force $tempExtract, $archive

    $env:GOROOT = $goRoot
    $env:Path = "$goRoot\bin;$env:Path"
    Write-Step "Using private Go: $(& go version)"
}

function Ensure-Go {
    $current = Get-GoVersion
    if ($null -ne $current -and $current -ge $RequiredGo) {
        Write-Step "Compatible system Go detected: $(& go version)"
        return
    }

    if ($null -eq $current) {
        Write-Host "Go is not installed."
    } else {
        Write-Host "System Go $current is older than required $RequiredGo."
    }

    if (Use-PrivateGoIfAvailable) { return }
    Install-PrivateGo
}

function Ensure-GoModules {
    Write-Step 'Downloading exact module dependencies declared by go.mod'
    & go mod download
    if ($LASTEXITCODE -ne 0) { Fail 'go mod download failed' }

    if ($UpgradeDeps) {
        Write-Step 'Upgrading module dependencies (explicitly requested)'
        & go get -u ./...
        if ($LASTEXITCODE -ne 0) { Fail 'go get -u failed' }
        & go mod tidy
        if ($LASTEXITCODE -ne 0) { Fail 'go mod tidy failed' }
    }
}

function Install-GitPulse {
    New-Item -ItemType Directory -Force -Path $Prefix | Out-Null
    $version = (Get-Content -Raw VERSION).Trim()
    $commit = (& git rev-parse --short HEAD 2>$null)
    if (-not $commit) { $commit = 'unknown' }
    $date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    $ldflags = "-s -w -X github.com/dinalegw/GitPulse/internal/version.Version=$version -X github.com/dinalegw/GitPulse/internal/version.Commit=$commit -X github.com/dinalegw/GitPulse/internal/version.Date=$date"

    Write-Step 'Building GitPulse'
    & go build -trimpath -ldflags $ldflags -o (Join-Path $Prefix 'gitpulse.exe') .
    if ($LASTEXITCODE -ne 0) { Fail 'GitPulse build failed' }
}

function Add-ToUserPath {
    $current = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($current -split ';' | Where-Object { $_ -ne '' })
    if ($entries -notcontains $Prefix) {
        [Environment]::SetEnvironmentVariable('Path', (($entries + $Prefix) -join ';'), 'User')
    }
    Refresh-Path
}

Set-Location (Split-Path -Parent $PSScriptRoot)
Ensure-Git
Ensure-Curl
Ensure-Go
Ensure-GoModules
Install-GitPulse
Add-ToUserPath

Write-Step 'Running installation health check'
& "$Prefix\gitpulse.exe" version
& "$Prefix\gitpulse.exe" doctor
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'GitPulse installed, but doctor reported an environment/configuration issue. Fix it and run: gitpulse doctor'
    exit 1
}

Write-Host "`nGitPulse bootstrap completed successfully."
Write-Host "Open a new PowerShell window if you want the updated PATH everywhere."
