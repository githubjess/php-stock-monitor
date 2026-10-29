param([int]$Port = 8080)

$ErrorActionPreference = 'Stop'
$phpExecutable = (Get-Command php -CommandType Application | Select-Object -First 1).Source
$phpDirectory = Split-Path -Parent $phpExecutable
$modules = & $phpExecutable -m
$phpOptions = @()

# Windows PHP ZIP installations can have no php.ini and no HTTPS extensions enabled.
if ($modules -notcontains 'curl' -and $modules -notcontains 'openssl') {
    $extensionDirectory = Join-Path $phpDirectory 'ext'
    foreach ($extension in @('curl', 'openssl')) {
        if (Test-Path -LiteralPath (Join-Path $extensionDirectory "php_$extension.dll")) {
            $phpOptions += @('-d', "extension=$extensionDirectory/php_$extension.dll")
        }
    }
}

$enabledModules = & $phpExecutable @phpOptions -m
if ($LASTEXITCODE -ne 0 -or ($enabledModules -notcontains 'curl' -and $enabledModules -notcontains 'openssl')) {
    throw 'PHP needs cURL or OpenSSL to fetch market data. Enable one of these extensions in php.ini.'
}

Push-Location $PSScriptRoot
try {
    & $phpExecutable @phpOptions -S "localhost:$Port" router.php
    if ($LASTEXITCODE -ne 0) {
        throw "Backend exited with code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
