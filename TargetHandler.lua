-- LootTableExtreme Target Handler
-- Manages NPC targeting and auto-refresh functionality

-- Show loot for current target
function LootTableExtreme:ShowTargetLoot()
    if not UnitExists("target") then
        self:Print("No target selected")
        return
    end
    
    local npcId = self:GetTargetNpcId()
    if not npcId then
        self:Print("Unable to get target NPC ID")
        return
    end
    
    self:ShowEnemyLoot(npcId)
end

-- Get NPC ID from current target's GUID
function LootTableExtreme:GetTargetNpcId()
    local guid = UnitGUID("target")
    if not guid then
        return nil
    end
    
    return tonumber(guid:match("-(%d+)-%x+$"))
end

-- Handle target change event for auto-refresh
function LootTableExtreme:OnTargetChanged()
    -- Only auto-refresh if the frame is visible
    if not LootTableExtremeFrame:IsShown() then
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
    
    -- Get NPC ID and display loot
    local npcId = self:GetTargetNpcId()
    if not npcId then
        return
    end
    
    -- Lookup and display by NPC ID. Call ShowEnemyLoot regardless of whether
    -- the database has a record so the UI updates when switching to unknown NPCs.
    self:ShowEnemyLoot(npcId)
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
