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
    
    self:ShowNpcLoot(npcId)
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
    -- Local references to UI frames (use getglobal for safety in different load orders)
    local pickpocketFrame = (getglobal and getglobal("LootTableExtremePickpocketFrame")) or _G and _G["LootTableExtremePickpocketFrame"]
    local mainFrame = (getglobal and getglobal("LootTableExtremeFrame")) or _G and _G["LootTableExtremeFrame"]

    -- Check if we have a valid target. If not, ensure pickpocket frame is hidden.
    if not UnitExists("target") then
        if pickpocketFrame and pickpocketFrame:IsShown() then
            pickpocketFrame:Hide()
        end
        return
    end
    
    -- Only update if target is an NPC (not a player)
    if UnitIsPlayer("target") then
        -- If we switched to a player, hide the pickpocket compact window
        if pickpocketFrame and pickpocketFrame:IsShown() then
            pickpocketFrame:Hide()
        end
        return
    end
    
    -- Get NPC ID
    local npcId = self:GetTargetNpcId()
    if not npcId then
        return
    end
    
    -- Handle pickpocket window separately
    if pickpocketFrame and pickpocketFrame:IsShown() then
        -- Auto-refresh pickpocket window if it's visible and NPC has pickpocket loot
            if self.Database:HasPickpocketLoot(npcId) then
            -- Only call if the function exists (PickpocketFrame.lua is loaded)
            if self.ShowNpcPickpocket then
                self:ShowNpcPickpocket(npcId)
            end
        else
            -- Hide pickpocket window if target doesn't have pickpocket loot
            if pickpocketFrame then pickpocketFrame:Hide() end
        end
    end
    
    -- Handle main loot window
    if mainFrame and mainFrame:IsShown() then
        -- Lookup and display by NPC ID. Call ShowNpcLoot regardless of whether
        -- the database has a record so the UI updates when switching to unknown NPCs.
        self:ShowNpcLoot(npcId)
    end
    
    -- Auto-show pickpocket window if target can be pickpocketed and main window is shown
    if mainFrame and mainFrame:IsShown() then
        if self.Database:HasPickpocketLoot(npcId) then
            -- Only call if the function exists (PickpocketFrame.lua is loaded)
            if self.ShowNpcPickpocket then
                self:ShowNpcPickpocket(npcId)
            end
        end
    end

    -- New behavior: if main loot window is NOT shown, optionally auto-show
    -- the compact pickpocket window when targeting a pickpocketable NPC.
    if (not mainFrame or not mainFrame:IsShown()) then
        local cfg = LootTableExtremeDB and LootTableExtremeDB.pickpocket
        local enabled = cfg and cfg.autoShowWhenMainHidden
        if enabled then
            if self.Database:HasPickpocketLoot(npcId) then
                if self.ShowNpcPickpocket then
                    self:ShowNpcPickpocket(npcId)
                end
            else
                -- Hide if there's no pickpocket loot
                if pickpocketFrame then pickpocketFrame:Hide() end
            end
        end
    end
end

-- Search for NPC and show loot
function LootTableExtreme:SearchAndShowNpc(searchTerm)
    local results = self.Database:SearchNpcs(searchTerm)
    
    if #results == 0 then
        self:Print("No NPCs found matching: " .. searchTerm)
    elseif #results == 1 then
        self:ShowNpcLoot(results[1].name)
    else
        self:Print("Multiple NPCs found:")
        for i = 1, math.min(5, #results) do
            self:Print("  " .. results[i].name .. " (" .. results[i].zone .. ")")
        end
        if #results > 5 then
            self:Print("  ... and " .. (#results - 5) .. " more")
        end
    end
end
