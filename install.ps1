# HalfCopilot Windows One-Line Installer (PowerShell)
# Usage: irm https://raw.githubusercontent.com/halfcopilot/halfcopilot/main/install.ps1 | iex

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  HalfCopilot CLI Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js first:" -ForegroundColor Yellow
    Write-Host "  https://nodejs.org/ (version 20+)" -ForegroundColor White
    Write-Host ""
    exit 1
}

$majorVersion = [int]($nodeVersion -replace 'v','' -split '\.')[0]
if ($majorVersion -lt 20) {
    Write-Host "✗ Node.js 20+ is required. Current: $nodeVersion" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Installing halfcopilot..." -ForegroundColor Yellow
Write-Host ""

npm install -g halfcopilot

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Installation Complete!" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Get started:" -ForegroundColor Green
    Write-Host ""
    Write-Host "    halfcop              # Start interactive chat" -ForegroundColor White
    Write-Host '    halfcop run "prompt"  # Run single prompt' -ForegroundColor White
    Write-Host "    halfcop models       # List available models" -ForegroundColor White
    Write-Host "    halfcop doctor       # Check configuration" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "✗ Installation failed." -ForegroundColor Red
    Write-Host "  Try: npm install -g halfcopilot" -ForegroundColor Yellow
    Write-Host ""
}
