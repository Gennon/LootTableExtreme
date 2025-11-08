-- LootTableExtreme Loot Frame
-- Main UI for displaying NPC loot tables and scroll rendering

local frame = nil
local scrollFrame = nil
local lootRows = {}

-- Constants
local LOOT_ROW_HEIGHT = 20
local MAX_DISPLAYED_ROWS = 15

-- Debug flag for layout/scroll diagnostics (set to true to enable)
local LTX_DEBUG = false

local function LTX_Debug(msg)
    if not LTX_DEBUG then return end
    if LootTableExtreme and LootTableExtreme.Print then
        LootTableExtreme:Print(msg)
    elseif DEFAULT_CHAT_FRAME and DEFAULT_CHAT_FRAME.AddMessage then
        DEFAULT_CHAT_FRAME:AddMessage("[LTE-debug] " .. tostring(msg))
    end
end

-- Current state
local currentNpc = nil
local filteredLoot = {}
local updateTimer = nil
local emptyMessage = nil

-- Helper: create or return an existing loot row. Rows are parented to the
-- faux scroll frame so FauxScrollFrame APIs work correctly.
local function CreateOrGetRow(index)
    if lootRows[index] then return lootRows[index] end
    local parent = scrollFrame or UIParent
    local row = CreateFrame("Frame", "LootTableExtremeLootRow" .. index, parent)
    row:SetHeight(LOOT_ROW_HEIGHT)
    local w = 300
    if parent and parent.GetWidth then
        local ok, pw = pcall(function() return parent:GetWidth() end)
        if ok and pw then w = pw - (LootTableExtreme.UI_SCROLLBAR_WIDTH or 0) end
    end
    row:SetWidth(w)

    row.icon = row:CreateTexture(nil, "ARTWORK")
    row.icon:SetWidth(16)
    row.icon:SetHeight(16)
    row.icon:SetPoint("LEFT", 0, 0)

    row.name = row:CreateFontString(nil, "ARTWORK", "GameFontNormal")
    row.name:SetPoint("LEFT", row.icon, "RIGHT", (LootTableExtreme.UI_MARGIN or 8) / 2, 0)
    row.name:SetWidth(250)
    row.name:SetJustifyH("LEFT")

    row.chance = row:CreateFontString(nil, "ARTWORK", "GameFontNormal")
    row.chance:SetPoint("RIGHT", -(LootTableExtreme.UI_SCROLLBAR_WIDTH or 16), 0)
    row.chance:SetWidth(80)
    row.chance:SetJustifyH("RIGHT")

    row.questMarker = row:CreateFontString(nil, "ARTWORK", "GameFontNormal")
    row.questMarker:SetPoint("RIGHT", row.chance, "LEFT", -((LootTableExtreme.UI_MARGIN or 8) / 2), 0)
    row.questMarker:SetText("Q")
    row.questMarker:SetTextColor(1, 0.82, 0)
    row.questMarker:Hide()

    -- Attach tooltip handlers if the shared helper is available (Tooltip.lua may load later)
    if LootTableExtreme.SetupRowTooltip then
        LootTableExtreme:SetupRowTooltip(row)
    end
    row:Hide()
    lootRows[index] = row
    return row
end

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
    
    -- Ensure scroll frame is visible
    if scrollFrame and scrollFrame.Show then scrollFrame:Show() end

    -- Create rows parented to the faux scroll frame (visible-slot frames).
    for i = 1, MAX_DISPLAYED_ROWS do
        CreateOrGetRow(i)
    end

    -- Add resize handler so dynamic UI scaling/resizing recomputes visible slots
    if scrollFrame and not scrollFrame._LTX_SizeHook then
        scrollFrame:SetScript("OnSizeChanged", function(self, width, height)
            LTX_Debug("OnSizeChanged: w=" .. tostring(width) .. " h=" .. tostring(height))
            LootTableExtreme:UpdateLootDisplay()
        end)
        scrollFrame._LTX_SizeHook = true
    end

    -- Empty message (shown when there is no loot)
    -- Create this as a child of the scrollFrame (viewport) so it's visible
    -- even when the scrollChild is larger than the viewport.
    if scrollFrame and not emptyMessage then
        emptyMessage = scrollFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
        -- Vertical offset uses the standard UI margin
        emptyMessage:SetPoint("CENTER", scrollFrame, "CENTER", 0, 0)
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
    if _G["LootTableExtremeFrameFilters"] then
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

-- Show loot for a specific NPC (by name or NPC ID)
function LootTableExtreme:ShowNpcLoot(npcNameOrId)
    local npcData, npcName
    
    -- Check if it's an NPC ID (number) or name (string)
    if type(npcNameOrId) == "number" then
        npcData, npcName = self.Database:GetLootByNpcId(npcNameOrId)
    else
        npcName = npcNameOrId
        npcData = self.Database:GetLootByNpcName(npcName)
    end
    
    if not npcData then
        -- No data found: show an empty window instead of returning so old loot doesn't remain visible
        self:Print("No loot data found for: " .. tostring(npcNameOrId))

        -- Use a display name for headers (prefer the in-game unit name if targetable)
        local displayName = nil
        if UnitExists("target") then
            local unitName = UnitName("target")
            if unitName and unitName ~= "" then
                displayName = unitName
            end
        end
        if not displayName then
            displayName = npcName or tostring(npcNameOrId)
        end
        currentNpc = displayName

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
    
    currentNpc = npcName
    
    -- Reset scroll position to top
    FauxScrollFrame_SetOffset(scrollFrame, 0)
    if scrollFrame and scrollFrame.SetVerticalScroll then scrollFrame:SetVerticalScroll(0) end
    
    -- Update header
    local headerTitle = _G["LootTableExtremeFrameHeaderTitle"]
    local headerSubtitle = _G["LootTableExtremeFrameHeaderSubtitle"]
    if headerTitle then headerTitle:SetText(npcName) end
    local subtitle = string.format("Level %d-%d | %s", npcData.level[1], npcData.level[2], npcData.zone or "Unknown")
    if npcData.elite then
        subtitle = subtitle .. " (Elite)"
    end
    if headerSubtitle then headerSubtitle:SetText(subtitle) end
    
    -- Ensure mode display is updated (fixes initial display issue)
    self:UpdateModeDisplay()
    
    -- Apply filters and show
    self:ApplyFilters()
    if frame and frame.Show then frame:Show() end
end

-- Apply current filters to loot table
function LootTableExtreme:ApplyFilters()
    -- If there's no selected NPC, clear the filtered list and update the UI
    if not currentNpc then
        filteredLoot = {}
        self:UpdateLootDisplay()
        return
    end

    local npcData = self.Database:GetLootByNpcName(currentNpc)

    -- If we couldn't find the NPC in the database, clear the list and update
    if not npcData then
        filteredLoot = {}
        self:UpdateLootDisplay()
        return
    end

    -- If the NPC has no loot table, clear and update so old rows are not shown
    if not npcData.loot or #npcData.loot == 0 then
        filteredLoot = {}
        self:UpdateLootDisplay()
        return
    end

    local advancedMode = LootTableExtremeDB and LootTableExtremeDB.ui and LootTableExtremeDB.ui.advancedMode
    filteredLoot = self:FilterLootData(npcData.loot, advancedMode)

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
    if currentNpc then
        self:ApplyFilters()
    end
end

-- Update the loot display
function LootTableExtreme:UpdateLootDisplay()
    local numLoot = #filteredLoot
    
    -- Show or hide the empty message depending on whether we have loot
    if emptyMessage then
        if numLoot == 0 then
            emptyMessage:Show()
        else
            emptyMessage:Hide()
        end
    end
    
    if not scrollFrame then return end

    -- Compute visible slots from scrollFrame height (fallback to MAX_DISPLAYED_ROWS)
    local visibleSlots = MAX_DISPLAYED_ROWS
    if scrollFrame.GetHeight then
        local h = scrollFrame:GetHeight() or 0
        visibleSlots = math.max(1, math.floor(h / LOOT_ROW_HEIGHT))
    end

    -- Ensure visible slot rows exist
    for i = 1, visibleSlots do CreateOrGetRow(i) end

    FauxScrollFrame_Update(scrollFrame, numLoot, visibleSlots, LOOT_ROW_HEIGHT)
    local offset = FauxScrollFrame_GetOffset(scrollFrame)

    local needsRetry = false

    if numLoot == 0 then
        for i = 1, visibleSlots do if lootRows[i] then lootRows[i]:Hide() end end
        scrollFrame:Hide(); scrollFrame:Show()
        return
    end

    for i = 1, visibleSlots do
        local row = lootRows[i]
        local index = i + offset

        if index <= numLoot then
            local item = filteredLoot[index]

            if not item then
                row:Hide()
            else
                -- Populate item data
                local itemName, itemQuality, itemTexture
                if item.itemId then
                    local info = { GetItemInfo(item.itemId) }
                    itemName = info[1]
                    itemQuality = info[3]
                    itemTexture = info[10]
                end

                local quality = itemQuality or item.quality
                local color = self.Database:GetQualityColor(quality)

                if item.itemId then
                    if itemTexture then
                        row.icon:SetTexture(itemTexture)
                        row.icon:Show()
                    else
                        row.icon:Hide()
                        needsRetry = true
                    end

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

                row.name:SetTextColor(color.r, color.g, color.b)
                row.chance:SetText(string.format("%.1f%%", item.dropChance))

                if item.isQuestItem then
                    row.questMarker:Show()
                else
                    row.questMarker:Hide()
                end

                row.item = item

                -- Position by visible slot (i) relative to scrollFrame
                row:ClearAllPoints()
                local y = -(i-1) * LOOT_ROW_HEIGHT
                row:SetPoint("TOPLEFT", scrollFrame, "TOPLEFT", 0, y)

                row:Show()
            end
        else
            if row then row.item = nil; row:Hide() end
        end
    end

    -- Refresh visuals
    scrollFrame:Hide(); scrollFrame:Show()

    -- Schedule a retry if some items weren't loaded yet
    if needsRetry then
        if updateTimer then updateTimer:Cancel() end
        updateTimer = C_Timer.NewTimer(0.5, function()
            if frame and frame:IsShown() then
                LootTableExtreme:UpdateLootDisplay()
            end
        end)
    end
end

-- Toggle loot frame visibility
function LootTableExtreme:ToggleLootFrame()
    if frame and frame.IsShown and frame:IsShown() then
        frame:Hide()
    else
        if currentNpc then
            if frame and frame.Show then frame:Show() end
        else
            self:Print("No NPC selected. Target an NPC and use /lte target")
        end
    end
end
