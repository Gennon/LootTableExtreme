# LootTableExtreme - Install Script
# Copies the addon to WoW Classic Era AddOns directory

# Configuration
$addonName = "LootTableExtreme"
$sourceDir = $PSScriptRoot
$destinationBase = "C:\Program Files (x86)\World of Warcraft\_classic_era_\Interface\AddOns"
$destinationDir = Join-Path $destinationBase $addonName

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "LootTableExtreme Install Script" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if WoW directory exists
if (-not (Test-Path $destinationBase)) {
    Write-Host "ERROR: WoW AddOns directory not found!" -ForegroundColor Red
    Write-Host "Expected path: $destinationBase" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please verify your WoW Classic Era installation path." -ForegroundColor Yellow
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "Source: $sourceDir" -ForegroundColor Green
Write-Host "Destination: $destinationDir" -ForegroundColor Green
Write-Host ""

# Create destination directory if it doesn't exist
if (-not (Test-Path $destinationDir)) {
    Write-Host "Creating addon directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
} else {
    Write-Host "Removing old version..." -ForegroundColor Yellow
    Remove-Item -Path $destinationDir -Recurse -Force
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
}

# Files to copy
$filesToCopy = @(
    "LootTableExtreme.toc",
    "Core.lua",
    "Database.lua",
    "ScrapedDatabase.lua",
    "UI.xml",
    "Filters.lua",
    "ModeManager.lua",
    "TargetHandler.lua",
    "LootFrame.lua",
    "Tooltip.lua"
)

# Copy files
Write-Host "Copying addon files..." -ForegroundColor Yellow
$copiedCount = 0

foreach ($file in $filesToCopy) {
    $sourcePath = Join-Path $sourceDir $file
    $destPath = Join-Path $destinationDir $file
    
    if (Test-Path $sourcePath) {
        Copy-Item -Path $sourcePath -Destination $destPath -Force
        Write-Host "  ✓ $file" -ForegroundColor Green
        $copiedCount++
    } else {
        Write-Host "  ✗ $file (not found)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Copied $copiedCount file(s) successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Start World of Warcraft Classic Era" -ForegroundColor White
Write-Host "2. Type /reload to reload the UI" -ForegroundColor White
Write-Host "3. Type /lte to open the addon" -ForegroundColor White
Write-Host ""

