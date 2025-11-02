-- LootTableExtreme Loot Frame
-- Main UI for displaying enemy loot tables

local frame = LootTableExtremeFrame
local scrollFrame = LootTableExtremeFrameScrollFrame
local searchBox = LootTableExtremeFrameSearchBox
local searchButton = LootTableExtremeFrameSearchButton
local showTargetButton = LootTableExtremeFrameShowTargetButton

-- Constants
local LOOT_ROW_HEIGHT = 20
local MAX_DISPLAYED_ROWS = 15

-- Current state
local currentEnemy = nil
local filteredLoot = {}
local lootRows = {}
local updateTimer = nil
local scrollChild = nil

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
    searchButton:SetScript("OnClick", function()
        local searchTerm = searchBox:GetText()
        if searchTerm and searchTerm ~= "" then
            LootTableExtreme:SearchAndShowEnemy(searchTerm)
        end
    end)
    
    searchBox:SetScript("OnEnterPressed", function()
        searchButton:Click()
    end)
    
    -- Setup show target button
    showTargetButton:SetScript("OnClick", function()
        LootTableExtreme:ShowTargetLoot()
    end)
    
    -- Setup mode toggle button
    local modeToggle = LootTableExtremeFrameModeToggle
    modeToggle:SetScript("OnClick", function()
        LootTableExtreme:ToggleMode()
    end)
    
    -- Set initial mode
    self:UpdateModeDisplay()
    
    -- Close button
    LootTableExtremeFrameTitle:SetScript("OnClick", function()
        frame:Hide()
    end)
end

-- Create filter checkboxes
function LootTableExtreme:CreateFilterCheckboxes()
    local filtersFrame = LootTableExtremeFrameFilters
    local DB = self.Database
    
    local filters = {
        {key = "showQuestItems", label = "Quest Items", x = 20, y = -25},
        {key = "showPoor", label = "Poor", x = 130, y = -25, quality = DB.Quality.POOR},
        {key = "showCommon", label = "Common", x = 200, y = -25, quality = DB.Quality.COMMON},
        {key = "showUncommon", label = "Uncommon", x = 280, y = -25, quality = DB.Quality.UNCOMMON},
        {key = "showRare", label = "Rare", x = 380, y = -25, quality = DB.Quality.RARE},
        {key = "showEpic", label = "Epic", x = 450, y = -25, quality = DB.Quality.EPIC},
    }
    
    for _, filter in ipairs(filters) do
        local checkbox = CreateFrame("CheckButton", "LTE_Filter_" .. filter.key, filtersFrame, "UICheckButtonTemplate")
        checkbox:SetPoint("TOPLEFT", filter.x, filter.y)
        checkbox:SetChecked(LootTableExtremeDB.filters[filter.key])
        
        local label = checkbox:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
        label:SetPoint("LEFT", checkbox, "RIGHT", 5, 0)
        label:SetText(filter.label)
        
        if filter.quality then
            local color = DB:GetQualityColor(filter.quality)
            label:SetTextColor(color.r, color.g, color.b)
        end
        
        checkbox:SetScript("OnClick", function()
            LootTableExtremeDB.filters[filter.key] = checkbox:GetChecked()
            LootTableExtreme:ApplyFilters()
        end)
    end
    
    -- Min drop chance slider
    local slider = CreateFrame("Slider", "LTE_MinDropChanceSlider", filtersFrame, "OptionsSliderTemplate")
    slider:SetPoint("TOPLEFT", 20, -50)
    slider:SetMinMaxValues(0, 50)
    slider:SetValue(LootTableExtremeDB.filters.minDropChance)
    slider:SetValueStep(1)
    slider:SetWidth(200)
    
    getglobal(slider:GetName() .. "Low"):SetText("0%")
    getglobal(slider:GetName() .. "High"):SetText("50%")
    getglobal(slider:GetName() .. "Text"):SetText("Min Drop Chance: " .. LootTableExtremeDB.filters.minDropChance .. "%")
    
    slider:SetScript("OnValueChanged", function(self, value)
        getglobal(self:GetName() .. "Text"):SetText("Min Drop Chance: " .. math.floor(value) .. "%")
        LootTableExtremeDB.filters.minDropChance = value
        LootTableExtreme:ApplyFilters()
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
    
    local filters = LootTableExtremeDB.filters
    local advancedMode = LootTableExtremeDB.ui.advancedMode
    filteredLoot = {}
    
    for i, item in ipairs(enemyData.loot) do
        local include = true
        
        -- In simple mode, show all items
        if advancedMode then
            -- Check quality filters
            if item.quality == self.Database.Quality.POOR and not filters.showPoor then
                include = false
            elseif item.quality == self.Database.Quality.COMMON and not filters.showCommon then
                include = false
            elseif item.quality == self.Database.Quality.UNCOMMON and not filters.showUncommon then
                include = false
            elseif item.quality == self.Database.Quality.RARE and not filters.showRare then
                include = false
            elseif item.quality == self.Database.Quality.EPIC and not filters.showEpic then
                include = false
            end
            
            -- Check quest item filter
            if item.isQuestItem and not filters.showQuestItems then
                include = false
            end
            
            -- Check minimum drop chance
            if item.dropChance < filters.minDropChance then
                include = false
            end
            
            -- Override: Always show quest items if quest filter is on
            if item.isQuestItem and filters.showQuestItems then
                include = true
            end
        end
        
        if include then
            table.insert(filteredLoot, item)
        end
    end
    
    -- Sort by drop chance (highest first)
    table.sort(filteredLoot, function(a, b)
        return a.dropChance > b.dropChance
    end)
    
    self:UpdateLootDisplay()
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

-- Show loot for current target
function LootTableExtreme:ShowTargetLoot()
    if not UnitExists("target") then
        self:Print("No target selected")
        return
    end
    
    -- Get NPC ID from GUID
    local guid = UnitGUID("target")
    if not guid then
        self:Print("Unable to get target GUID")
        return
    end
    
    local npcId = tonumber(guid:match("-(%d+)-%x+$"))
    
    if not npcId then
        self:Print("Unable to extract NPC ID from GUID")
        return
    end
    
    self:ShowEnemyLoot(npcId)
end

-- Handle target change event
function LootTableExtreme:OnTargetChanged()
    -- Only auto-refresh if the frame is visible
    if not frame:IsShown() then
        return
    end
    
    -- Check if we have a valid target
    if not UnitExists("target") then
        return
    end
    
    -- Only update if target is an NPC (not a player)
    if UnitIsPlayer("target") then
        return
    end
    
    -- Get NPC ID from GUID
    local guid = UnitGUID("target")
    if not guid then
        return
    end
    
    local npcId = tonumber(guid:match("-(%d+)-%x+$"))
    if not npcId then
        return
    end
    
    -- Lookup and display by NPC ID
    local enemyData, enemyName = self.Database:GetEnemyLootByNpcId(npcId)
    if enemyData then
        self:ShowEnemyLoot(npcId)
    end
end

-- Search for enemy and show loot
function LootTableExtreme:SearchAndShowEnemy(searchTerm)
    local results = self.Database:SearchEnemies(searchTerm)
    
    if #results == 0 then
        self:Print("No enemies found matching: " .. searchTerm)
    elseif #results == 1 then
        self:ShowEnemyLoot(results[1].name)
    else
        self:Print("Multiple enemies found:")
        for i = 1, math.min(5, #results) do
            self:Print("  " .. results[i].name .. " (" .. results[i].zone .. ")")
        end
        if #results > 5 then
            self:Print("  ... and " .. (#results - 5) .. " more")
        end
    end
end

-- Toggle between simple and advanced mode
function LootTableExtreme:ToggleMode()
    LootTableExtremeDB.ui.advancedMode = not LootTableExtremeDB.ui.advancedMode
    self:UpdateModeDisplay()
    
    -- Reapply filters when switching modes
    if currentEnemy then
        self:ApplyFilters()
    end
end

-- Update UI based on current mode
function LootTableExtreme:UpdateModeDisplay()
    local advancedMode = LootTableExtremeDB.ui.advancedMode
    local filtersFrame = LootTableExtremeFrameFilters
    local searchBox = LootTableExtremeFrameSearchBox
    local searchButton = LootTableExtremeFrameSearchButton
    local showTargetButton = LootTableExtremeFrameShowTargetButton
    local modeToggle = LootTableExtremeFrameModeToggle
    
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
    local rowWidth = advancedMode and 520 or 340
    local nameWidth = advancedMode and 320 or 240
    for i = 1, MAX_DISPLAYED_ROWS do
        lootRows[i]:SetWidth(rowWidth)
        lootRows[i].name:SetWidth(nameWidth)
    end
end
