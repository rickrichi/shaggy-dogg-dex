$ErrorActionPreference = 'Stop'
if ($env:WIN_CSC_SHA1 -notmatch '^[a-fA-F0-9]{40}$') {
    throw 'Set WIN_CSC_SHA1 to your trusted code-signing certificate thumbprint.'
}
$signingCert = Get-Item -LiteralPath "Cert:\CurrentUser\My\$env:WIN_CSC_SHA1"
if (-not $signingCert.HasPrivateKey -or $signingCert.NotAfter -lt (Get-Date)) { throw 'Certificate is expired or has no private key.' }
if (-not ($signingCert.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3')) { throw 'Certificate is not for code signing.' }
$signingChain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
if ($signingCert.Subject -eq $signingCert.Issuer -or -not $signingChain.Build($signingCert)) {
    throw 'A trusted publisher certificate is required. Self-signed certificates cannot pass the release gate.'
}
npm run type-check
if ($LASTEXITCODE -ne 0) { throw 'Type checking failed.' }
npm audit --audit-level=high
if ($LASTEXITCODE -ne 0) { throw 'Resolve high/critical dependency advisories before a signed release.' }
npm --prefix server audit --audit-level=high
if ($LASTEXITCODE -ne 0) { throw 'Server dependency audit failed.' }
node desktop/build-ui.mjs
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
npx electron-builder --config desktop/electron-builder.release.cjs --win nsis
if ($LASTEXITCODE -ne 0) { throw 'Signed packaging failed.' }
$installers = Get-ChildItem -LiteralPath 'release/signed' -Filter '*.exe'
if (-not $installers) { throw 'Installer not found.' }
foreach ($installer in $installers) {
    $signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $env:WIN_CSC_SHA1) {
        throw "Installer signature verification failed: $($installer.Name)"
    }
    Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256
}
