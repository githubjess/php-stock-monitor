$ErrorActionPreference = 'Stop'
$npmExecutable = (Get-Command npm.cmd -CommandType Application | Select-Object -First 1).Source

Push-Location $PSScriptRoot
try {
    & $npmExecutable ls --depth=0 *> $null
    if ($LASTEXITCODE -ne 0) {
        & $npmExecutable install
        if ($LASTEXITCODE -ne 0) {
            throw 'Frontend dependency installation failed; the dev server was not started.'
        }
    }

    # Keep the frontend on the expected port instead of silently switching ports.
    & $npmExecutable run dev -- --port 5173 --strictPort
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend exited with code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
