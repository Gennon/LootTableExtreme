-- LootTableExtreme Tooltip Enhancement
-- Shows NPC drop sources when hovering over items

local tooltipEnhanced = false

-- Initialize tooltip hooks
function LootTableExtreme:InitializeTooltips()
    -- Hook into GameTooltip to add NPC drop information
    GameTooltip:HookScript("OnTooltipSetItem", function(tooltip)
        LootTableExtreme:EnhanceItemTooltip(tooltip)
    end)
    
    tooltipEnhanced = true
end

-- Enhance item tooltip with drop source information
function LootTableExtreme:EnhanceItemTooltip(tooltip)
    -- Get the item link from the tooltip
    local _, itemLink = tooltip:GetItem()
    if not itemLink then return end
    
    -- Extract item ID from the link
    local itemId = self:GetItemIdFromLink(itemLink)
    if not itemId then return end
    
    -- Get top sources for this item
    local sources = self.Database:GetTopItemSources(itemId, 3)
    
    if sources and #sources > 0 then
        -- Add a blank line separator
        tooltip:AddLine(" ")
        
        -- Add header
        tooltip:AddLine("|cff00ff00Drop Sources:|r", 1, 1, 1)
        
        -- Add each source
        for i, source in ipairs(sources) do
            
            local zoneText = source.zone and (source.zone) or ""
            
            local line = string.format("%s - %s(|cffffffff%.1f%%|r)",
                zoneText,
                source.npcName,
                source.dropChance
            )
            
            tooltip:AddLine(line, 0.8, 0.8, 0.8, true)
        end
        
        -- Show the tooltip
        tooltip:Show()
    end
end

-- Extract item ID from item link
function LootTableExtreme:GetItemIdFromLink(itemLink)
    if not itemLink then return nil end
    
    -- Item links are in format: |cffffffff|Hitem:itemId:...|h[Item Name]|h|r
    local itemId = string.match(itemLink, "item:(%d+)")
    
    if itemId then
        return tonumber(itemId)
    end
    
    return nil
end

-- Shared helper: attach tooltip handlers to a row frame for item display
function LootTableExtreme:SetupRowTooltip(row)
    if not row then return end
    row:EnableMouse(true)

    row:SetScript("OnEnter", function(self)
        local item = self.item
        if not item then return end

        GameTooltip:Hide()
        GameTooltip:SetOwner(self, "ANCHOR_RIGHT")

        if item.itemId then
            local info = { GetItemInfo(item.itemId) }
            local itemLink = info[2]
            if itemLink and GameTooltip.SetHyperlink then
                GameTooltip:SetHyperlink(itemLink)
            else
                -- Fallback: show basic name when hyperlink API isn't available
                GameTooltip:SetText(item.name or "Unknown Item")
            end
        else
            GameTooltip:SetText(item.name or "Unknown Item")
        end
        GameTooltip:Show()
    end)

    row:SetScript("OnLeave", function(self)
        GameTooltip:Hide()
    end)

    -- Make rows clickable so players can shift-click items into chat
    -- Register both left and right clicks to avoid swallowing other interactions
    row:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    -- Use the outer `row` closure rather than `self` because some runtimes may call the
    -- OnClick handler without providing a valid `self`. This makes the handler defensive.
    row:SetScript("OnClick", function(_, button)
        if not row then return end
        local item = row.item
        if not item then return end

        -- If the user pressed the chat-link modifier (by default Shift), handle left/right
        if IsModifiedClick and IsModifiedClick("CHATLINK") then
            -- Normalize button value: handlers may receive 'LeftButton', 'LeftButtonUp', etc.
            local btn = tostring(button or "")
            -- Left: insert item link into chat (existing behavior)
            if string.find(btn, "Left") then
                if item.itemId then
                    local info = { GetItemInfo(item.itemId) }
                    local itemLink = info[2]
                    if itemLink then
                        if ChatEdit_InsertLink then
                            ChatEdit_InsertLink(itemLink)
                        else
                            if ChatFrame_OpenChat then ChatFrame_OpenChat(itemLink) end
                        end
                        return
                    end
                end
            end            
        end
        -- Preserve other click behavior: (no-op here) future actions can be added by the addon
    end)
end

-- Minimap button functionality
local minimapButton = nil
local minimapIcon = "Interface\\Icons\\INV_Misc_Book_09"

function LootTableExtreme:InitializeMinimapButton()
    if minimapButton then return end
    
    minimapButton = CreateFrame("Button", "LootTableExtremeMinimapButton", Minimap)
    minimapButton:SetWidth(31)
    minimapButton:SetHeight(31)
    minimapButton:SetFrameStrata("MEDIUM")
    minimapButton:SetFrameLevel(8)
    
    -- Icon texture
    local icon = minimapButton:CreateTexture(nil, "BACKGROUND")
    icon:SetWidth(20)
    icon:SetHeight(20)
    icon:SetPoint("CENTER", 0, 1)
    icon:SetTexture(minimapIcon)
    minimapButton.icon = icon
    
    -- Border/overlay
    local overlay = minimapButton:CreateTexture(nil, "OVERLAY")
    overlay:SetWidth(53)
    overlay:SetHeight(53)
    overlay:SetPoint("TOPLEFT")
    overlay:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
    minimapButton.overlay = overlay
    
    -- Click handler
    minimapButton:SetScript("OnClick", function(self, button)
        if button == "LeftButton" then
            LootTableExtreme:ToggleLootFrame()
        elseif button == "RightButton" then
            LootTableExtreme:ShowTargetLoot()
        end
    end)
    
    -- Tooltip
    minimapButton:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_LEFT")
        GameTooltip:SetText("LootTableExtreme", 1, 1, 1)
        GameTooltip:AddLine("Left-click: Toggle loot window", 0.8, 0.8, 0.8)
        GameTooltip:AddLine("Right-click: Show target loot", 0.8, 0.8, 0.8)
        GameTooltip:Show()
    end)
    
    minimapButton:SetScript("OnLeave", function(self)
        GameTooltip:Hide()
    end)
    
    -- Enable dragging
    minimapButton:SetScript("OnDragStart", function(self)
        self:LockHighlight()
        self.isDragging = true
    end)
    
    minimapButton:SetScript("OnDragStop", function(self)
        self:UnlockHighlight()
        self.isDragging = false
    end)
    
    minimapButton:RegisterForDrag("LeftButton")
    minimapButton:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    
    -- Position update
    minimapButton:SetScript("OnUpdate", function(self)
        if self.isDragging then
            local mx, my = Minimap:GetCenter()
            local px, py = GetCursorPosition()
            local scale = Minimap:GetEffectiveScale()
            px, py = px / scale, py / scale
            
            local angle = math.deg(math.atan2(py - my, px - mx))
            LootTableExtremeDB.minimap.minimapPos = angle
        end
        
        LootTableExtreme:UpdateMinimapButtonPosition()
    end)
    
    self:UpdateMinimapButtonPosition()
    
    if not LootTableExtremeDB.minimap.hide then
        if minimapButton and minimapButton.Show then minimapButton:Show() end
    else
        if minimapButton and minimapButton.Hide then minimapButton:Hide() end
    end
end

-- Update minimap button position
function LootTableExtreme:UpdateMinimapButtonPosition()
    if not minimapButton then return end
    
    local angle = math.rad(LootTableExtremeDB.minimap.minimapPos or 220)
    local x = math.cos(angle) * 80
    local y = math.sin(angle) * 80
    
    minimapButton:SetPoint("CENTER", Minimap, "CENTER", x, y)
end

-- Toggle minimap button visibility
function LootTableExtreme:ToggleMinimapButton()
    LootTableExtremeDB.minimap.hide = not LootTableExtremeDB.minimap.hide
    
    if LootTableExtremeDB.minimap.hide then
        if minimapButton and minimapButton.Hide then minimapButton:Hide() end
        self:Print("Minimap button hidden")
    else
        if minimapButton and minimapButton.Show then minimapButton:Show() end
        self:Print("Minimap button shown")
    end
end
