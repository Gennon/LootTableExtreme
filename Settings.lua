-- LootTableExtreme Settings
-- Minimal settings window helper

function LootTableExtreme:InitializeSettings()
    local settings = _G["LootTableExtremeSettings"]
    if not settings then return end

    -- Add background textures manually for Classic 1.12 compatibility
    local bg = settings:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints(settings)
    bg:SetTexture("Interface\\DialogFrame\\UI-DialogBox-Background")
    bg:SetHorizTile(true)
    bg:SetVertTile(true)

    -- Wire close button
    local closeBtn = _G["LootTableExtremeSettingsClose"]
    if closeBtn then
        closeBtn:SetScript("OnClick", function()
            settings:Hide()
        end)
    end

    -- Search and show-target UI removed; no wiring needed here.
end

function LootTableExtreme:ToggleSettings()
    local settings = _G["LootTableExtremeSettings"]
    if not settings then return end
    if settings:IsShown() then
        settings:Hide()
    else
        settings:Show()
    end
end
