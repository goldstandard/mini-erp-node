param(
    [Parameter(Mandatory=$true)]
    [string]$BaseUrl,

    [Parameter(Mandatory=$true)]
    [string]$Email,

    [Parameter(Mandatory=$false)]
    [string]$Password,

    [Parameter(Mandatory=$false)]
    [string]$OutputDir = "backups/azure-db"
)

$ErrorActionPreference = "Stop"

function Get-Timestamp {
    param([datetime]$Date = (Get-Date))
    return $Date.ToString("yyyyMMdd-HHmmss")
}

function Normalize-BaseUrl {
    param([string]$Url)
    $trimmed = ($Url | ForEach-Object { $_.Trim() })
    return $trimmed.TrimEnd('/')
}

function Convert-SecureStringToPlainText {
    param([Security.SecureString]$SecureValue)

    if (-not $SecureValue) {
        return ""
    }

    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

try {
    $base = Normalize-BaseUrl -Url $BaseUrl
    if (-not $base) {
        throw "BaseUrl is empty."
    }

    if (-not $Password) {
        $securePassword = Read-Host "Enter admin password" -AsSecureString
        $Password = Convert-SecureStringToPlainText -SecureValue $securePassword
    }

    if (-not $Password) {
        throw "Password is required."
    }

    $loginUrl = "$base/api/auth/login"
    $downloadUrl = "$base/api/admin/db-download"

    $payload = @{
        email = $Email
        password = $Password
    } | ConvertTo-Json

    Write-Host "[Azure DB Backup] Logging in to $loginUrl"
    $loginResponse = Invoke-RestMethod -Method Post -Uri $loginUrl -ContentType "application/json" -Body $payload

    $token = $loginResponse.token
    if (-not $token) {
        throw "Login succeeded but token is missing in response."
    }

    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    $timestamp = Get-Timestamp
    $outFile = Join-Path $OutputDir "mini_erp-azure-$timestamp.db"

    Write-Host "[Azure DB Backup] Downloading DB snapshot from $downloadUrl"
    Invoke-WebRequest -Method Get -Uri $downloadUrl -Headers @{ Authorization = "Bearer $token" } -OutFile $outFile

    if (-not (Test-Path $outFile)) {
        throw "Download finished but output file was not created."
    }

    $fileInfo = Get-Item $outFile
    if ($fileInfo.Length -le 0) {
        throw "Downloaded file is empty."
    }

    $hash = (Get-FileHash -Path $outFile -Algorithm SHA256).Hash

    Write-Host "[Azure DB Backup] Success"
    Write-Host "BACKUP_FILE=$($fileInfo.FullName)"
    Write-Host "BACKUP_SIZE_BYTES=$($fileInfo.Length)"
    Write-Host "BACKUP_SHA256=$hash"
}
catch {
    Write-Error "[Azure DB Backup] Failed: $($_.Exception.Message)"
    exit 1
}
