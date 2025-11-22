-- LootTableExtreme Filters
-- Manages filter UI and filter application logic

-- Create filter checkboxes and slider
function LootTableExtreme:CreateFilterCheckboxes()
    local filtersFrame = _G["LTE_FrameFilters"]
    if not filtersFrame then
        self:Print("Error: Filter frame not found")
        return
    end
    local DB = self.Database
    
    -- Store reference to avoid recreating
    if filtersFrame.checkboxesCreated then
        return
    end
    
    local filters = {
        {key = "showQuestItems", label = "Quest Items", x = 0, y = -25},
        {key = "showPoor", label = "Poor", x = 0, y = -65, quality = DB.Quality.POOR},
        {key = "showCommon", label = "Common", x = 70, y = -65, quality = DB.Quality.COMMON},
        {key = "showUncommon", label = "Uncommon", x = 0, y = -105, quality = DB.Quality.UNCOMMON},
        {key = "showRare", label = "Rare", x = 105, y = -105, quality = DB.Quality.RARE},
        {key = "showEpic", label = "Epic", x = 170, y = -105, quality = DB.Quality.EPIC},
    }
    
    for _, filter in ipairs(filters) do
        local checkbox = CreateFrame("CheckButton", "LTE_Filter_" .. filter.key, filtersFrame, "UICheckButtonTemplate")
        if checkbox then
            checkbox:SetPoint("TOPLEFT", filter.x, filter.y)
            checkbox:SetWidth(24)
            checkbox:SetHeight(24)
            
            -- Ensure filter value exists before setting checked state
            if LootTableExtremeDB.filters[filter.key] == nil then
                LootTableExtremeDB.filters[filter.key] = true
            end
            checkbox:SetChecked(LootTableExtremeDB.filters[filter.key])
            
            -- Set textures manually for better TBC compatibility
            checkbox:SetNormalTexture("Interface\\Buttons\\UI-CheckBox-Up")
            checkbox:SetPushedTexture("Interface\\Buttons\\UI-CheckBox-Down")
            checkbox:SetHighlightTexture("Interface\\Buttons\\UI-CheckBox-Highlight")
            checkbox:SetCheckedTexture("Interface\\Buttons\\UI-CheckBox-Check")
            
            local label = checkbox:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
            label:SetPoint("LEFT", checkbox, "RIGHT", 5, 0)
            label:SetText(filter.label)
            
            if filter.quality then
                local color = DB:GetQualityColor(filter.quality)
                label:SetTextColor(color.r, color.g, color.b)
            end
            
            checkbox:SetScript("OnClick", function()
                local checked = checkbox:GetChecked()
                LootTableExtremeDB.filters[filter.key] = checked
                LootTableExtreme:ApplyFilters()
            end)
        end
    end
    
    -- Min drop chance slider - create manually for TBC compatibility
    self:CreateMinDropChanceSlider(filtersFrame)
    
    filtersFrame.checkboxesCreated = true
end

-- Create min drop chance slider (TBC-compatible version)
function LootTableExtreme:CreateMinDropChanceSlider(parent)
    local slider = CreateFrame("Slider", "LTE_MinDropChanceSlider", parent)
    slider:SetOrientation("HORIZONTAL")
    slider:SetPoint("TOPLEFT", 20, -170)
    slider:SetWidth(200)
    slider:SetHeight(17)
    slider:SetMinMaxValues(0, 50)
    slider:SetValue(LootTableExtremeDB.filters.minDropChance)
    slider:SetValueStep(1)
    slider:SetObeyStepOnDrag(true)
    
    -- Create slider thumb texture
    local thumb = slider:CreateTexture(nil, "ARTWORK")
    thumb:SetTexture("Interface\\Buttons\\UI-SliderBar-Button-Horizontal")
    thumb:SetSize(32, 32)
    slider:SetThumbTexture(thumb)
    
    -- Create slider background - use a proper texture file
    local bg = slider:CreateTexture(nil, "BACKGROUND")
    bg:SetTexture("Interface\\Buttons\\UI-SliderBar-Background")
    bg:SetAllPoints(slider)
    bg:SetVertexColor(0.2, 0.2, 0.2, 0.8)
    
    -- Create low text
    local lowText = slider:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
    lowText:SetPoint("TOPLEFT", slider, "BOTTOMLEFT", 0, -3)
    lowText:SetText("0%")
    
    -- Create high text
    local highText = slider:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
    highText:SetPoint("TOPRIGHT", slider, "BOTTOMRIGHT", 0, -3)
    highText:SetText("50%")
    
    -- Create title text
    local titleText = slider:CreateFontString(nil, "ARTWORK", "GameFontNormal")
    titleText:SetPoint("BOTTOM", slider, "TOP", 0, 3)
    titleText:SetText("Min Drop Chance: " .. LootTableExtremeDB.filters.minDropChance .. "%")
    
    slider:SetScript("OnValueChanged", function(self, value)
        value = math.floor(value)
        titleText:SetText("Min Drop Chance: " .. value .. "%")
        LootTableExtremeDB.filters.minDropChance = value
        LootTableExtreme:ApplyFilters()
    end)
    
    return slider
end

-- Apply filters to loot data and return filtered results
function LootTableExtreme:FilterLootData(lootData, shouldFilter)
    if not lootData then
        return {}
    end
    
    -- If filtering is not enabled (simple mode and settings closed), return all items
    if not shouldFilter then
        return lootData
    end
    
    local filters = LootTableExtremeDB.filters
    if not filters then
        -- If filters aren't initialized, return all data
        return lootData
    end
    
    local filtered = {}
    
    for i, item in ipairs(lootData) do
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
            table.insert(filtered, item)
        end
    end
    
    -- Sort by drop chance (highest first)
    table.sort(filtered, function(a, b)
        return a.dropChance > b.dropChance
    end)
    
    return filtered
end
