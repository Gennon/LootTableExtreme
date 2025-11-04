-- LootTableExtreme Mode Manager
-- Handles Simple/Advanced mode toggling and UI layout

-- Toggle between simple and advanced mode
function LootTableExtreme:ToggleMode()
    -- Open the separate settings window if available, otherwise fall back to existing ToggleMode behaviour
    if self.ToggleSettings then
        self:ToggleSettings()
        return
    end

    -- Back-compat: toggle the DB flag and refresh if no dedicated settings UI exists
    LootTableExtremeDB.ui.advancedMode = not LootTableExtremeDB.ui.advancedMode
    self:UpdateModeDisplay()
    self:RefreshCurrentDisplay()
end

-- Update UI layout based on current mode
function LootTableExtreme:UpdateModeDisplay()
    -- Simplified layout routine: always keep main frame compact and anchored to its own header.
    local frame = _G["LootTableExtremeFrame"]
    local scrollFrame = _G["LootTableExtremeFrameScrollFrame"]

    if frame then
        frame:SetWidth(400)
        frame:SetHeight(350)
    end

    if scrollFrame then
        local header = _G["LootTableExtremeFrameHeader"]
        scrollFrame:ClearAllPoints()
        if header then
            scrollFrame:SetPoint("TOP", header, "BOTTOM", 0, -10)
        else
            if frame then
                scrollFrame:SetPoint("TOP", frame, "TOP", 0, -60)
            end
        end
        if frame then
            scrollFrame:SetPoint("LEFT", frame, "LEFT", 15, 0)
            scrollFrame:SetPoint("RIGHT", frame, "RIGHT", -25, 0)
            scrollFrame:SetPoint("BOTTOM", frame, "BOTTOM", 0, 50)
        end
    end

    -- Always use the simple row sizing by default
    self:ResizeLootRows(false)
end
