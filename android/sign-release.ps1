param(
    [Parameter(Mandatory)][string]$UnsignedApk,
    [Parameter(Mandatory)][string]$OutputApk
)
$ErrorActionPreference = 'Stop'
$sdk = $env:ANDROID_HOME
if (!$sdk) { $sdk = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Android/Sdk' }
$signer = Join-Path $sdk 'build-tools/36.0.0/lib/apksigner.jar'
$vault = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'LostFound/AndroidSigning'
$association = Get-Content (Join-Path $PSScriptRoot '../public/.well-known/assetlinks.json') -Raw | ConvertFrom-Json
$expected = $association[0].target.sha256_cert_fingerprints[0].Replace(':','')
if ((Get-FileHash (Join-Path $vault 'public.cer')).Hash -ne $expected) {
    throw 'The certificate does not match the domain association.'
}
if (Test-Path -LiteralPath $OutputApk) { throw 'Choose a new output path for this release.' }
$encrypted = [IO.File]::ReadAllBytes((Join-Path $vault 'password.dpapi'))
$raw = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
try {
    $env:LF_APK_PASSWORD = [Convert]::ToBase64String($raw)
    & java -jar $signer sign --ks (Join-Path $vault 'release.p12') --ks-key-alias lostfound --ks-pass env:LF_APK_PASSWORD --out $OutputApk $UnsignedApk
    if ($LASTEXITCODE -ne 0) { throw 'Signing failed.' }
    $result = & java -jar $signer verify --verbose --print-certs $OutputApk
    if ($LASTEXITCODE -ne 0 -or $result -notcontains "Signer #1 certificate SHA-256 digest: $($expected.ToLowerInvariant())") {
        throw 'The APK signature did not verify against the published certificate.'
    }
    Get-FileHash -Algorithm SHA256 -LiteralPath $OutputApk
} finally {
    Remove-Item Env:LF_APK_PASSWORD -ErrorAction SilentlyContinue
    [Array]::Clear($raw, 0, $raw.Length)
}
