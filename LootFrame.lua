-- LootTableExtreme Loot Frame
-- Main UI for displaying enemy loot tables and scroll rendering

local frame = LootTableExtremeFrame
local scrollFrame = LootTableExtremeFrameScrollFrame
local scrollChild = nil
local lootRows = {}

-- Constants
local LOOT_ROW_HEIGHT = 20
local MAX_DISPLAYED_ROWS = 15

-- Current state
local currentEnemy = nil
local filteredLoot = {}
local updateTimer = nil

-- Initialize the loot frame
function LootTableExtreme:InitializeLootFrame()
    -- Add background textures manually for Classic 1.12 compatibility
    local bg = frame:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints(frame)
    bg:SetTexture("Interface\\DialogFrame\\UI-DialogBox-Background")
    bg:SetHorizTile(true)
    bg:SetVertTile(true)
    
    -- Ensure scroll frame is visible and clips its children
    scrollFrame:Show()
    scrollFrame:SetClipsChildren(true)
    
    -- Create scrollChild frame for proper scrolling
    scrollChild = CreateFrame("Frame", "LootTableExtremeScrollChild", scrollFrame)
    scrollChild:SetWidth(scrollFrame:GetWidth())
    scrollChild:SetHeight(MAX_DISPLAYED_ROWS * LOOT_ROW_HEIGHT)
    scrollChild:SetPoint("TOPLEFT", scrollFrame, "TOPLEFT", 0, 0)  -- Explicit positioning
    scrollChild:Show()  -- Explicitly show the scrollChild
    scrollFrame:SetScrollChild(scrollChild)
    
    -- Create loot rows (parent them to scrollChild, not scrollFrame)
    for i = 1, MAX_DISPLAYED_ROWS do
        local row = CreateFrame("Frame", "LootTableExtremeLootRow" .. i, scrollChild)
        row:SetHeight(LOOT_ROW_HEIGHT)
        row:SetWidth(350)  -- Set default width
        -- Don't set fixed position - will be positioned dynamically in UpdateLootDisplay
        
        -- Item icon
        row.icon = row:CreateTexture(nil, "ARTWORK")
        row.icon:SetWidth(16)
        row.icon:SetHeight(16)
        row.icon:SetPoint("LEFT", 5, 0)
        
        -- Item name
        row.name = row:CreateFontString(nil, "ARTWORK", "GameFontNormal")
        row.name:SetPoint("LEFT", row.icon, "RIGHT", 5, 0)
        row.name:SetWidth(250)  -- Set default width
        row.name:SetJustifyH("LEFT")
        
        -- Drop chance
        row.chance = row:CreateFontString(nil, "ARTWORK", "GameFontNormal")
        row.chance:SetPoint("RIGHT", -10, 0)
        row.chance:SetWidth(80)
        row.chance:SetJustifyH("RIGHT")
        
        -- Quest item indicator
        row.questMarker = row:CreateFontString(nil, "ARTWORK", "GameFontNormal")
        row.questMarker:SetPoint("RIGHT", row.chance, "LEFT", -5, 0)
        row.questMarker:SetText("Q")
        row.questMarker:SetTextColor(1, 0.82, 0)
        row.questMarker:Hide()
        
        row:Hide()
        lootRows[i] = row
    end
    
    -- Setup scroll frame
    scrollFrame:SetScript("OnVerticalScroll", function(self, offset)
        FauxScrollFrame_OnVerticalScroll(self, offset, LOOT_ROW_HEIGHT, function()
            LootTableExtreme:UpdateLootDisplay()
        end)
    end)
    
    -- Setup filter checkboxes
    self:CreateFilterCheckboxes()
    
    -- Setup search functionality
    LootTableExtremeFrameSearchButton:SetScript("OnClick", function()
        local searchTerm = LootTableExtremeFrameSearchBox:GetText()
        if searchTerm and searchTerm ~= "" then
            LootTableExtreme:SearchAndShowEnemy(searchTerm)
        end
    end)
    
    LootTableExtremeFrameSearchBox:SetScript("OnEnterPressed", function()
        LootTableExtremeFrameSearchButton:Click()
    end)
    
    -- Setup show target button
    LootTableExtremeFrameShowTargetButton:SetScript("OnClick", function()
        LootTableExtreme:ShowTargetLoot()
    end)
    
    -- Setup mode toggle button
    LootTableExtremeFrameModeToggle:SetScript("OnClick", function()
        LootTableExtreme:ToggleMode()
    end)
    
    -- Set initial mode
    self:UpdateModeDisplay()
    
    -- Close button
    LootTableExtremeFrameTitle:SetScript("OnClick", function()
        frame:Hide()
    end)
end

-- Show loot for a specific enemy (by name or NPC ID)
function LootTableExtreme:ShowEnemyLoot(enemyNameOrId)
    local enemyData, enemyName
    
    -- Check if it's an NPC ID (number) or name (string)
    if type(enemyNameOrId) == "number" then
        enemyData, enemyName = self.Database:GetEnemyLootByNpcId(enemyNameOrId)
    else
        enemyName = enemyNameOrId
        enemyData = self.Database:GetEnemyLoot(enemyName)
    end
    
    if not enemyData then
        self:Print("No loot data found for: " .. tostring(enemyNameOrId))
        return
    end
    
    currentEnemy = enemyName
    
    -- Reset scroll position to top
    FauxScrollFrame_SetOffset(scrollFrame, 0)
    scrollFrame:SetVerticalScroll(0)
    
    -- Update header
    LootTableExtremeFrameHeaderTitle:SetText(enemyName)
    local subtitle = string.format("Level %d-%d | %s", enemyData.level[1], enemyData.level[2], enemyData.zone or "Unknown")
    if enemyData.elite then
        subtitle = subtitle .. " (Elite)"
    end
    LootTableExtremeFrameHeaderSubtitle:SetText(subtitle)
    
    -- Ensure mode display is updated (fixes initial display issue)
    self:UpdateModeDisplay()
    
    -- Apply filters and show
    self:ApplyFilters()
    frame:Show()
end

-- Apply current filters to loot table
function LootTableExtreme:ApplyFilters()
    if not currentEnemy then 
        return 
    end
    
    local enemyData = self.Database:GetEnemyLoot(currentEnemy)
    
    if not enemyData or not enemyData.loot then 
        return 
    end
    
    local advancedMode = LootTableExtremeDB.ui.advancedMode
    filteredLoot = self:FilterLootData(enemyData.loot, advancedMode)
    
    self:UpdateLootDisplay()
end

-- Refresh current display (for mode changes)
function LootTableExtreme:RefreshCurrentDisplay()
    if currentEnemy then
        self:ApplyFilters()
    end
end

-- Update the loot display
function LootTableExtreme:UpdateLootDisplay()
    local numLoot = #filteredLoot
    
    -- Calculate content height - Classic 1.12 requires minimum 480px to render
    local contentHeight = math.max(numLoot * LOOT_ROW_HEIGHT, 480)
    scrollChild:SetHeight(contentHeight)
    
    FauxScrollFrame_Update(scrollFrame, numLoot, MAX_DISPLAYED_ROWS, LOOT_ROW_HEIGHT)
    
    local offset = FauxScrollFrame_GetOffset(scrollFrame)
    
    local needsRetry = false
    
    for i = 1, MAX_DISPLAYED_ROWS do
        local row = lootRows[i]
        local index = i + offset
        
        if index <= numLoot then
            local item = filteredLoot[index]
            
            if not item then
                row:Hide()
            else
                -- Get item info from server if available
                local itemName, _, itemQuality, _, _, _, _, _, _, itemTexture
                if item.itemId then
                    itemName, _, itemQuality, _, _, _, _, _, _, itemTexture = GetItemInfo(item.itemId)
                end
                
                -- Use server quality if available, otherwise use cached quality
                local quality = itemQuality or item.quality
                local color = self.Database:GetQualityColor(quality)
                
                -- Set item icon
                if item.itemId then
                    if itemTexture then
                        row.icon:SetTexture(itemTexture)
                        row.icon:Show()
                    else
                        row.icon:Hide()
                        needsRetry = true
                    end
                    
                    -- Use server item name if available, otherwise use cached name
                    if itemName then
                        row.name:SetText(itemName)
                    else
                        row.name:SetText(item.name)
                        needsRetry = true
                    end
                else
                    row.icon:Hide()
                    row.name:SetText(item.name)
                end
                
                -- Set item name color
                row.name:SetTextColor(color.r, color.g, color.b)
                
                -- Set drop chance
                row.chance:SetText(string.format("%.1f%%", item.dropChance))
                
                -- Show quest marker if applicable
                if item.isQuestItem then
                    row.questMarker:Show()
                else
                    row.questMarker:Hide()
                end
                
                -- Position row dynamically based on index
                row:ClearAllPoints()
                row:SetPoint("TOPLEFT", scrollChild, "TOPLEFT", 5, -(index-1) * LOOT_ROW_HEIGHT)
                
                row:Show()
            end
        else
            row:Hide()
        end
    end
    
    -- Force a complete refresh of frames
    scrollChild:Hide()
    scrollChild:Show()
    scrollFrame:Hide()
    scrollFrame:Show()
    
    -- Schedule a retry if some items weren't loaded yet
    if needsRetry then
        if updateTimer then
            updateTimer:Cancel()
        end
        updateTimer = C_Timer.NewTimer(0.5, function()
            if frame:IsShown() then
                LootTableExtreme:UpdateLootDisplay()
            end
        end)
    end
end

-- Resize loot rows based on mode
function LootTableExtreme:ResizeLootRows(advancedMode)
    local rowWidth = advancedMode and 520 or 340
    local nameWidth = advancedMode and 320 or 240
    for i = 1, MAX_DISPLAYED_ROWS do
        lootRows[i]:SetWidth(rowWidth)
        lootRows[i].name:SetWidth(nameWidth)
    end
end

-- Toggle loot frame visibility
function LootTableExtreme:ToggleLootFrame()
    if frame:IsShown() then
        frame:Hide()
    else
        if currentEnemy then
            frame:Show()
        else
            self:Print("No enemy selected. Target an enemy and use /lte target")
        end
    end
end
