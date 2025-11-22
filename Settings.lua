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
