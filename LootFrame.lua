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

-- Initialize the loot frame
function LootTableExtreme:InitializeLootFrame()
    -- Create loot rows
    for i = 1, MAX_DISPLAYED_ROWS do
        local row = CreateFrame("Frame", "LootTableExtremeLootRow" .. i, frame)
        row:SetWidth(530)
        row:SetHeight(LOOT_ROW_HEIGHT)
        row:SetPoint("TOPLEFT", scrollFrame, "TOPLEFT", 5, -(i-1) * LOOT_ROW_HEIGHT)
        
        -- Item icon
        row.icon = row:CreateTexture(nil, "ARTWORK")
        row.icon:SetWidth(16)
        row.icon:SetHeight(16)
        row.icon:SetPoint("LEFT", 5, 0)
        
        -- Item name
        row.name = row:CreateFontString(nil, "ARTWORK", "GameFontNormal")
        row.name:SetPoint("LEFT", row.icon, "RIGHT", 5, 0)
        row.name:SetWidth(300)
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

-- Show loot for a specific enemy
function LootTableExtreme:ShowEnemyLoot(enemyName)
    local enemyData = self.Database:GetEnemyLoot(enemyName)
    
    if not enemyData then
        self:Print("No loot data found for: " .. enemyName)
        return
    end
    
    currentEnemy = enemyName
    
    -- Update header
    LootTableExtremeFrameHeaderTitle:SetText(enemyName)
    local subtitle = string.format("Level %d-%d | %s", enemyData.level[1], enemyData.level[2], enemyData.zone or "Unknown")
    if enemyData.elite then
        subtitle = subtitle .. " (Elite)"
    end
    LootTableExtremeFrameHeaderSubtitle:SetText(subtitle)
    
    -- Apply filters and show
    self:ApplyFilters()
    frame:Show()
end

-- Apply current filters to loot table
function LootTableExtreme:ApplyFilters()
    if not currentEnemy then return end
    
    local enemyData = self.Database:GetEnemyLoot(currentEnemy)
    if not enemyData or not enemyData.loot then return end
    
    local filters = LootTableExtremeDB.filters
    filteredLoot = {}
    
    for _, item in ipairs(enemyData.loot) do
        local include = true
        
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
    
    FauxScrollFrame_Update(scrollFrame, numLoot, MAX_DISPLAYED_ROWS, LOOT_ROW_HEIGHT)
    
    local offset = FauxScrollFrame_GetOffset(scrollFrame)
    
    for i = 1, MAX_DISPLAYED_ROWS do
        local row = lootRows[i]
        local index = i + offset
        
        if index <= numLoot then
            local item = filteredLoot[index]
            local color = self.Database:GetQualityColor(item.quality)
            
            -- Set item name with quality color
            row.name:SetText(item.name)
            row.name:SetTextColor(color.r, color.g, color.b)
            
            -- Set drop chance
            row.chance:SetText(string.format("%.1f%%", item.dropChance))
            
            -- Show quest marker if applicable
            if item.isQuestItem then
                row.questMarker:Show()
            else
                row.questMarker:Hide()
            end
            
            row:Show()
        else
            row:Hide()
        end
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
    
    local targetName = UnitName("target")
    if not targetName then
        self:Print("Unable to get target name")
        return
    end
    
    self:ShowEnemyLoot(targetName)
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
