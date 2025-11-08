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
        frame:SetWidth(360)
        frame:SetHeight(300)
    end

    if scrollFrame then
        local header = _G["LootTableExtremeFrameHeader"]
        scrollFrame:ClearAllPoints()
        if header then
            scrollFrame:SetPoint("TOP", header, "BOTTOM", 0, -LootTableExtreme.UI_MARGIN)
        else
            if frame then
                -- Position the top of the scroll frame relative to the top of the frame
                scrollFrame:SetPoint("TOP", frame, "TOP", 0, -(LootTableExtreme.UI_HEADER_HEIGHT + LootTableExtreme.UI_MARGIN))
            end
        end
        if frame then
            -- Use the configured margin for left/right insets so the scroll frame can stretch to the frame edges
            scrollFrame:SetPoint("LEFT", frame, "LEFT", LootTableExtreme.UI_MARGIN, 0)
            scrollFrame:SetPoint("RIGHT", frame, "RIGHT", -LootTableExtreme.UI_MARGIN, 0)
            scrollFrame:SetPoint("BOTTOM", frame, "BOTTOM", 0, LootTableExtreme.UI_MARGIN)
        end
    end

    -- Always use the simple row sizing by default
    self:ResizeLootRows(false)
end
