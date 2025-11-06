-- LootTableExtreme Loot Frame
-- Main UI for displaying enemy loot tables and scroll rendering

local frame = nil
local scrollFrame = nil
local scrollChild = nil
local lootRows = {}

-- Constants
local LOOT_ROW_HEIGHT = 20
local MAX_DISPLAYED_ROWS = 15

-- Current state
local currentEnemy = nil
local filteredLoot = {}
local updateTimer = nil
local emptyMessage = nil

-- Initialize the loot frame
function LootTableExtreme:InitializeLootFrame()
    -- Lookup frames after XML has been loaded
    frame = _G["LootTableExtremeFrame"]
    scrollFrame = _G["LootTableExtremeFrameScrollFrame"]
    if not frame then return end

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
    if scrollFrame then
        scrollChild = CreateFrame("Frame", "LootTableExtremeScrollChild", scrollFrame)
        scrollChild:SetWidth(scrollFrame:GetWidth() or 1)
        scrollChild:SetHeight(MAX_DISPLAYED_ROWS * LOOT_ROW_HEIGHT)
        scrollChild:SetPoint("TOPLEFT", scrollFrame, "TOPLEFT", 0, 0)  -- Explicit positioning
        scrollChild:Show()  -- Explicitly show the scrollChild
        scrollFrame:SetScrollChild(scrollChild)
    end
    
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
        row.icon:SetPoint("LEFT", 0, 0)
        
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

    -- Empty message (shown when there is no loot)
    -- Create this as a child of the scrollFrame (viewport) so it's visible
    -- even when the scrollChild is larger than the viewport.
    if scrollFrame and not emptyMessage then
        emptyMessage = scrollFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
        emptyMessage:SetPoint("CENTER", scrollFrame, "CENTER", 0, -10)
        emptyMessage:SetText("No loot available")
        emptyMessage:SetJustifyH("CENTER")
        emptyMessage:SetWidth(300)
        emptyMessage:Hide()
    end
    
    -- Setup scroll frame
    if scrollFrame then
        scrollFrame:SetScript("OnVerticalScroll", function(self, offset)
            FauxScrollFrame_OnVerticalScroll(self, offset, LOOT_ROW_HEIGHT, function()
                LootTableExtreme:UpdateLootDisplay()
            end)
        end)
    end
    
    -- Setup filter checkboxes (only if filters frame exists)
    if LootTableExtremeFrameFilters then
        self:CreateFilterCheckboxes()
    end
    
    -- Search and Show Target UI removed (previously in settings); nothing to wire here.

    -- Setup mode toggle button if present
    local modeToggle = _G["LootTableExtremeFrameModeToggle"]
    if modeToggle then
        modeToggle:SetScript("OnClick", function()
            -- Prefer the Settings API, but fall back to toggling the settings frame directly
            if LootTableExtreme.ToggleSettings then
                LootTableExtreme:ToggleSettings()
                return
            end
            local settings = _G["LootTableExtremeSettings"]
            if settings then
                if settings:IsShown() then
                    settings:Hide()
                else
                    settings:Show()
                end
                return
            end
            -- Final fallback: toggle legacy mode
            LootTableExtreme:ToggleMode()
        end)
        -- Tooltip on hover
        modeToggle:SetScript("OnEnter", function(self)
            GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
            GameTooltip:AddLine("Settings", 1, 1, 1)
            GameTooltip:Show()
        end)
        modeToggle:SetScript("OnLeave", function()
            GameTooltip:Hide()
        end)
    end
    
    -- Set initial mode
    -- Initialize settings wiring (if settings window exists)
    if LootTableExtreme.InitializeSettings then
        LootTableExtreme:InitializeSettings()
    end
    self:UpdateModeDisplay()
    
    -- Close button (guarded) - support either the fontstring-named legacy or the new close button
    local closeBtn = _G["LootTableExtremeFrameClose"] or _G["LootTableExtremeFrameTitle"]
    if closeBtn then
        closeBtn:SetScript("OnClick", function()
            if frame then frame:Hide() end
        end)
    end
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
        -- No data found: show an empty window instead of returning so old loot doesn't remain visible
        self:Print("No loot data found for: " .. tostring(enemyNameOrId))

        -- Use a display name for headers (prefer the in-game unit name if targetable)
        local displayName = nil
        if UnitExists("target") then
            local unitName = UnitName("target")
            if unitName and unitName ~= "" then
                displayName = unitName
            end
        end
        if not displayName then
            displayName = enemyName or tostring(enemyNameOrId)
        end
        currentEnemy = displayName

        -- Reset scroll position safely
        if scrollFrame then
            FauxScrollFrame_SetOffset(scrollFrame, 0)
            if scrollFrame.SetVerticalScroll then
                scrollFrame:SetVerticalScroll(0)
            end
        end

        -- Update header title/subtitle if present. Try to show level and zone
        local headerTitle = _G["LootTableExtremeFrameHeaderTitle"]
        local headerSubtitle = _G["LootTableExtremeFrameHeaderSubtitle"]
        if headerTitle then headerTitle:SetText(displayName) end

        -- Compose subtitle: prefer unit level and current zone when DB data is missing
        local levelText = "?"
        if UnitExists("target") then
            local lvl = UnitLevel("target")
            if lvl and lvl > 0 then
                levelText = tostring(lvl)
            end
        end
        local zoneText = GetZoneText() or "Unknown"
        local subtitle = string.format("Level %s | %s", levelText, zoneText)
        if headerSubtitle then headerSubtitle:SetText(subtitle) end

        -- Clear any previous filtered data and refresh display
        filteredLoot = {}
        -- Update the header/mode and the loot display
        self:UpdateModeDisplay()
        -- Update the empty message text to be more specific
        if emptyMessage then
            emptyMessage:SetText("No loot recorded for: " .. displayName)
        end
        self:UpdateLootDisplay()
        if frame then frame:Show() end
        return
    end
    
    currentEnemy = enemyName
    
    -- Reset scroll position to top
    FauxScrollFrame_SetOffset(scrollFrame, 0)
    scrollFrame:SetVerticalScroll(0)
    
    -- Update header
    local headerTitle = _G["LootTableExtremeFrameHeaderTitle"]
    local headerSubtitle = _G["LootTableExtremeFrameHeaderSubtitle"]
    if headerTitle then headerTitle:SetText(enemyName) end
    local subtitle = string.format("Level %d-%d | %s", enemyData.level[1], enemyData.level[2], enemyData.zone or "Unknown")
    if enemyData.elite then
        subtitle = subtitle .. " (Elite)"
    end
    if headerSubtitle then headerSubtitle:SetText(subtitle) end
    
    -- Ensure mode display is updated (fixes initial display issue)
    self:UpdateModeDisplay()
    
    -- Apply filters and show
    self:ApplyFilters()
    frame:Show()
end

-- Apply current filters to loot table
function LootTableExtreme:ApplyFilters()
    -- If there's no selected enemy, clear the filtered list and update the UI
    if not currentEnemy then
        filteredLoot = {}
        self:UpdateLootDisplay()
        return
    end

    local enemyData = self.Database:GetEnemyLoot(currentEnemy)

    -- If we couldn't find the enemy in the database, clear the list and update
    if not enemyData then
        filteredLoot = {}
        self:UpdateLootDisplay()
        return
    end

    -- If the enemy has no loot table, clear and update so old rows are not shown
    if not enemyData.loot or #enemyData.loot == 0 then
        filteredLoot = {}
        self:UpdateLootDisplay()
        return
    end

    local advancedMode = LootTableExtremeDB and LootTableExtremeDB.ui and LootTableExtremeDB.ui.advancedMode
    filteredLoot = self:FilterLootData(enemyData.loot, advancedMode)

    -- Reset scroll to top when applying a new filter set
    if scrollFrame then
        FauxScrollFrame_SetOffset(scrollFrame, 0)
        if scrollFrame.SetVerticalScroll then
            scrollFrame:SetVerticalScroll(0)
        end
    end

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

    -- Show or hide the empty message depending on whether we have loot
    if emptyMessage then
        if numLoot == 0 then
            emptyMessage:Show()
        else
            emptyMessage:Hide()
        end
    end
    
    if scrollFrame then
        FauxScrollFrame_Update(scrollFrame, numLoot, MAX_DISPLAYED_ROWS, LOOT_ROW_HEIGHT)

        local offset = FauxScrollFrame_GetOffset(scrollFrame)
        
        local needsRetry = false

        -- If there are no items, ensure all rows are hidden immediately
        if numLoot == 0 then
            for i = 1, MAX_DISPLAYED_ROWS do
                if lootRows[i] then lootRows[i]:Hide() end
            end
        else
            for i = 1, MAX_DISPLAYED_ROWS do
                local row = lootRows[i]
                local index = i + offset

                if index <= numLoot then
                    local item = filteredLoot[index]

                    if not item then
                        row:Hide()
                    else
                        -- existing logic follows (kept below)
                    end
                else
                    row:Hide()
                end
            end
        end
        
        -- Force a complete refresh of frames
        if scrollChild then
            scrollChild:Hide()
            scrollChild:Show()
        end
        scrollFrame:Hide()
        scrollFrame:Show()
        
        -- Schedule a retry if some items weren't loaded yet
        -- (kept existing behavior below)
    else
        -- If no scroll frame is present, nothing to render
        return
    end
    -- The rendering loop (detailed per-row logic)
    -- We'll implement it here after we've ensured scrollFrame and offset are available
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
                if scrollChild then
                    row:SetPoint("TOPLEFT", scrollChild, "TOPLEFT", 0, -(index-1) * LOOT_ROW_HEIGHT)
                end

                row:Show()
            end
        else
            row:Hide()
        end
    end

    -- Force a complete refresh of frames
    if scrollChild then
        scrollChild:Hide()
        scrollChild:Show()
    end
    scrollFrame:Hide()
    scrollFrame:Show()

    -- Schedule a retry if some items weren't loaded yet
    if needsRetry then
        if updateTimer then
            updateTimer:Cancel()
        end
        updateTimer = C_Timer.NewTimer(0.5, function()
            if frame and frame:IsShown() then
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
