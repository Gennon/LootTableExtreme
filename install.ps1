# LootTableExtreme - Install Script
# Copies the addon to WoW Classic Era or TBC Classic AddOns directory

# Configuration
$addonName = "LootTableExtreme"
$sourceDir = $PSScriptRoot

# Detect all WoW versions
$wowInstallations = @(
    @{
        Name = "Classic Era (Vanilla)"
        Path = "C:\Program Files (x86)\World of Warcraft\_classic_era_\Interface\AddOns"
        Version = "Vanilla"
    },
    @{
        Name = "Classic Era PTR (TBC)"
        Path = "C:\Program Files (x86)\World of Warcraft\_classic_era_ptr_\Interface\AddOns"
        Version = "TBC"
    },
    @{
        Name = "TBC Classic"
        Path = "C:\Program Files (x86)\World of Warcraft\_classic_\Interface\AddOns"
        Version = "TBC"
    },
    @{
        Name = "TBC Classic PTR"
        Path = "C:\Program Files (x86)\World of Warcraft\_classic_ptr_\Interface\AddOns"
        Version = "TBC"
    }
)

# Find all installed WoW versions
$detectedInstallations = @()
foreach ($installation in $wowInstallations) {
    if (Test-Path $installation.Path) {
        $detectedInstallations += $installation
        Write-Host "Detected: $($installation.Name)" -ForegroundColor Cyan
    }
}

Write-Host ""

# Check if any WoW directory exists
if ($detectedInstallations.Count -eq 0) {
    Write-Host "ERROR: No WoW AddOns directory found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Checked paths:" -ForegroundColor Yellow
    foreach ($installation in $wowInstallations) {
        Write-Host "  $($installation.Name): $($installation.Path)" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Please verify your WoW Classic installation path." -ForegroundColor Yellow
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host ""
Write-Host "Found $($detectedInstallations.Count) WoW installation(s)" -ForegroundColor Green
Write-Host ""

# Install to each detected WoW version
$totalCopied = 0
foreach ($installation in $detectedInstallations) {
    $destinationBase = $installation.Path
    $wowVersion = $installation.Version
    $destinationDir = Join-Path $destinationBase $addonName

    Write-Host "==================================" -ForegroundColor Cyan
    Write-Host "Installing to: $($installation.Name)" -ForegroundColor Cyan
    Write-Host "==================================" -ForegroundColor Cyan

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

    # Files to copy - core files
    $coreFiles = @(
        "Core.lua",
        "Database.lua",
        "UI_simple.xml",
        "UI_settings.xml",
        "Filters.lua",
        "ModeManager.lua",
        "Settings.lua",
        "TargetHandler.lua",
        "LootFrame.lua",
        "Tooltip.lua"
    )

    # Add version-specific files
    $filesToCopy = $coreFiles + @()

    if ($wowVersion -eq "TBC") {
        $filesToCopy += @(
            "LootTableExtreme_TBC.toc",
            "LootDatabase_TBC.lua",
            "VendorDatabase_TBC.lua",
            "PickpocketDatabase_TBC.lua"
        )
    } else {
        $filesToCopy += @(
            "LootTableExtreme.toc",
            "LootDatabase_Vanilla.lua",
            "VendorDatabase_Vanilla.lua",
            "PickpocketDatabase_Vanilla.lua"
        )
    }

    # Copy files
    Write-Host "Copying addon files..." -ForegroundColor Yellow
    $copiedCount = 0

    foreach ($file in $filesToCopy) {
        $sourcePath = Join-Path $sourceDir $file
        
        # Handle TOC file renaming for TBC
        if ($file -eq "LootTableExtreme_TBC.toc") {
            $destPath = Join-Path $destinationDir "LootTableExtreme.toc"
        } else {
            $destPath = Join-Path $destinationDir $file
        }
        
        if (Test-Path $sourcePath) {
            Copy-Item -Path $sourcePath -Destination $destPath -Force
            Write-Host "  ✓ $file" -ForegroundColor Green
            $copiedCount++
        } else {
            Write-Host "  ✗ $file (not found)" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "Copied $copiedCount file(s) to $($installation.Name)" -ForegroundColor Green
    Write-Host ""
    $totalCopied += $copiedCount
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Installed to $($detectedInstallations.Count) WoW installation(s)" -ForegroundColor Green
Write-Host "Total files copied: $totalCopied" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Start World of Warcraft (any version)" -ForegroundColor White
Write-Host "2. Type /reload to reload the UI" -ForegroundColor White
Write-Host "3. Type /lte to open the addon" -ForegroundColor White
Write-Host ""

