-- LootTableExtreme Settings
-- Minimal settings window helper

function LootTableExtreme:InitializeSettings()
    local settings = _G["LTE_Settings"]
    if not settings then return end

    -- Set up backdrop (required for modern WoW versions)
    if settings.SetBackdrop then
        settings:SetBackdrop({
            bgFile = "Interface\\TutorialFrame\\TutorialFrameBackground",
            edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
            tile = true,
            tileSize = 16,
            edgeSize = 16,
            insets = { left = 5, right = 5, top = 5, bottom = 5 }
        })
        settings:SetBackdropColor(0, 0, 0, 1)
    end

    -- Add background textures manually for Classic 1.12 compatibility
    local bg = settings:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints(settings)
    bg:SetTexture("Interface\\DialogFrame\\UI-DialogBox-Background")
    bg:SetHorizTile(true)
    bg:SetVertTile(true)

    -- Wire close button
    local closeBtn = _G["LTE_SettingsClose"]
    if closeBtn then
        closeBtn:SetScript("OnClick", function()
            settings:Hide()
        end)
    end

    -- Wire pickpocket auto-show checkbox
    local pickpocketCheckbox = _G["LTE_AutoShowPickpocket"]
    if pickpocketCheckbox then
        -- Initialize checked state from saved variables
        local enabled = false
        if LootTableExtremeDB and LootTableExtremeDB.pickpocket and LootTableExtremeDB.pickpocket.autoShowWhenMainHidden then
            enabled = true
        end
        pickpocketCheckbox:SetChecked(enabled)

        pickpocketCheckbox:SetScript("OnClick", function(self)
            if not LootTableExtremeDB then LootTableExtremeDB = {} end
            if not LootTableExtremeDB.pickpocket then LootTableExtremeDB.pickpocket = {} end
            LootTableExtremeDB.pickpocket.autoShowWhenMainHidden = self:GetChecked()
        end)
    end

    -- Ensure top-level defaults exist
    if not LootTableExtremeDB then LootTableExtremeDB = {} end
    if LootTableExtremeDB.showDropSource == nil then LootTableExtremeDB.showDropSource = true end
    if LootTableExtremeDB.showVendorSource == nil then LootTableExtremeDB.showVendorSource = true end
    if not LootTableExtremeDB.ui then LootTableExtremeDB.ui = {} end
    if LootTableExtremeDB.ui.size == nil then LootTableExtremeDB.ui.size = "normal" end

    -- Wire Show Drop Source checkbox
    local showDrop = _G["LTE_ShowDropSource"]
    if showDrop then
        showDrop:SetChecked(LootTableExtremeDB.showDropSource)
        showDrop:SetScript("OnClick", function(self)
            LootTableExtremeDB.showDropSource = self:GetChecked()
        end)
    end

    -- Wire Show Vendor Source checkbox
    local showVendor = _G["LTE_ShowVendorSource"]
    if showVendor then
        showVendor:SetChecked(LootTableExtremeDB.showVendorSource)
        showVendor:SetScript("OnClick", function(self)
            LootTableExtremeDB.showVendorSource = self:GetChecked()
        end)
    end

    -- Wire UI size checkbox
    local uiSmall = _G["LTE_UseSmallUI"]
    if uiSmall then
        uiSmall:SetChecked(LootTableExtremeDB.ui.size == "small")
        uiSmall:SetScript("OnClick", function(self)
            if not LootTableExtremeDB then LootTableExtremeDB = {} end
            if not LootTableExtremeDB.ui then LootTableExtremeDB.ui = {} end
            LootTableExtremeDB.ui.size = self:GetChecked() and "small" or "normal"
            if LootTableExtreme.ApplyUiSize then
                LootTableExtreme:ApplyUiSize(LootTableExtremeDB.ui.size)
            end
        end)
    end
end

function LootTableExtreme:ToggleSettings()
    local settings = _G["LTE_Settings"]
    if not settings then return end
    if settings:IsShown() then
        settings:Hide()
    else
        settings:Show()
    end
end
