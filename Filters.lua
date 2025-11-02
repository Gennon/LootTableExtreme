-- LootTableExtreme Filters
-- Manages filter UI and filter application logic

-- Create filter checkboxes and slider
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

-- Apply filters to loot data and return filtered results
function LootTableExtreme:FilterLootData(lootData, advancedMode)
    if not lootData then
        return {}
    end
    
    local filters = LootTableExtremeDB.filters
    local filtered = {}
    
    for i, item in ipairs(lootData) do
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
            table.insert(filtered, item)
        end
    end
    
    -- Sort by drop chance (highest first)
    table.sort(filtered, function(a, b)
        return a.dropChance > b.dropChance
    end)
    
    return filtered
end
