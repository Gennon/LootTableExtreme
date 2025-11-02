-- LootTableExtreme Mode Manager
-- Handles Simple/Advanced mode toggling and UI layout

-- Toggle between simple and advanced mode
function LootTableExtreme:ToggleMode()
    LootTableExtremeDB.ui.advancedMode = not LootTableExtremeDB.ui.advancedMode
    self:UpdateModeDisplay()
    
    -- Reapply filters when switching modes
    self:RefreshCurrentDisplay()
end

-- Update UI layout based on current mode
function LootTableExtreme:UpdateModeDisplay()
    local advancedMode = LootTableExtremeDB.ui.advancedMode
    local frame = LootTableExtremeFrame
    local filtersFrame = LootTableExtremeFrameFilters
    local searchBox = LootTableExtremeFrameSearchBox
    local searchButton = LootTableExtremeFrameSearchButton
    local showTargetButton = LootTableExtremeFrameShowTargetButton
    local modeToggle = LootTableExtremeFrameModeToggle
    local scrollFrame = LootTableExtremeFrameScrollFrame
    
    if advancedMode then
        -- Advanced mode: larger window with all features
        frame:SetWidth(600)
        frame:SetHeight(500)
        filtersFrame:Show()
        searchBox:Show()
        searchButton:Show()
        showTargetButton:Show()
        modeToggle:SetText("Simple")
        
        -- Reposition scroll frame for advanced mode
        scrollFrame:ClearAllPoints()
        scrollFrame:SetPoint("TOP", filtersFrame, "BOTTOM", 0, -10)
        scrollFrame:SetPoint("LEFT", frame, "LEFT", 25, 0)
        scrollFrame:SetPoint("RIGHT", frame, "RIGHT", -25, 0)
        scrollFrame:SetPoint("BOTTOM", searchBox, "TOP", 0, 10)
    else
        -- Simple mode: compact window
        frame:SetWidth(400)
        frame:SetHeight(350)
        filtersFrame:Hide()
        searchBox:Hide()
        searchButton:Hide()
        showTargetButton:Hide()
        modeToggle:SetText("Advanced")
        
        -- Reposition scroll frame for simple mode (auto-fit to window)
        scrollFrame:ClearAllPoints()
        scrollFrame:SetPoint("TOP", LootTableExtremeFrameHeader, "BOTTOM", 0, -10)
        scrollFrame:SetPoint("LEFT", frame, "LEFT", 15, 0)
        scrollFrame:SetPoint("RIGHT", frame, "RIGHT", -25, 0)  -- Less padding on right for scrollbar
        scrollFrame:SetPoint("BOTTOM", frame, "BOTTOM", 0, 50)  -- Increased padding to fit within background
    end
    
    -- Resize rows based on mode
    self:ResizeLootRows(advancedMode)
end
