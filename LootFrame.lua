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

-- Small wrapper to fetch item info safely and keep linter happy.
local function FetchItemInfo(itemId)
    if not itemId then return nil, nil, nil end
    -- Use a single table pack to avoid multi-assignment deprecation warnings
    local info = { GetItemInfo(itemId) }
    return info[1], info[3], info[10]
end

-- Compute how many visible slots fit in the scroll viewport
local function ComputeVisibleSlots()
    local visible = MAX_DISPLAYED_ROWS
    if scrollFrame and scrollFrame.GetHeight then
        local h = scrollFrame:GetHeight() or 0
        visible = math.max(1, math.floor(h / LOOT_ROW_HEIGHT))
    end
    return visible
end


-- Hide a set of rows from 1..n
local function HideRows(n)
    for i = 1, n do if lootRows[i] then lootRows[i]:Hide() end end
end

-- Render a single row for visible slot i
local function renderRowAt(self, i, offset, db)
    local row = lootRows[i]
    if not row then return end
    local index = i + offset
    local numLoot = #filteredLoot

    if index > numLoot then
        row.item = nil
        if row.Hide then row:Hide() end
        return
    end

    local item = filteredLoot[index]
    if not item then
        row.item = nil
        if row.Hide then row:Hide() end
        return
    end

    local itemName, itemQuality, itemTexture = FetchItemInfo(item.itemId)
    local quality = itemQuality or item.quality
    local color = db and db.GetQualityColor and db:GetQualityColor(quality) or { r = 1, g = 1, b = 1 }

    if item.itemId then
        if itemTexture and row.icon and row.icon.SetTexture then
            row.icon:SetTexture(itemTexture)
            row.icon:Show()
        else
            if row.icon and row.icon.Hide then row.icon:Hide() end
        end

        if itemName and row.name and row.name.SetText then
            row.name:SetText(itemName)
        else
            if row.name and row.name.SetText then row.name:SetText(item.name) end
        end
    else
        if row.icon and row.icon.Hide then row.icon:Hide() end
        if row.name and row.name.SetText then row.name:SetText(item.name) end
    end

    if row.name and row.name.SetTextColor then
        row.name:SetTextColor(color.r, color.g, color.b)
    end

    if row.chance and row.chance.SetText then
        row.chance:SetText(string.format("%.1f%%", item.dropChance))
    end

    if item.isQuestItem then
        if row.questMarker and row.questMarker.Show then row.questMarker:Show() end
    else
        if row.questMarker and row.questMarker.Hide then row.questMarker:Hide() end
    end

    row.item = item

    if row.ClearAllPoints and row.SetPoint and scrollFrame then
        row:ClearAllPoints()
        local y = -(i-1) * LOOT_ROW_HEIGHT
        row:SetPoint("TOPLEFT", scrollFrame, "TOPLEFT", 0, y)
    end

    if row and row.Show then row:Show() end
end

local function RefreshVisuals()
    if scrollFrame and scrollFrame.Hide and scrollFrame.Show then
        scrollFrame:Hide(); scrollFrame:Show()
    end
end

local function ScheduleRetry()
    if updateTimer and updateTimer.Cancel then updateTimer:Cancel() end
    updateTimer = C_Timer.NewTimer(0.5, function()
        if frame and frame.IsShown and frame:IsShown() then
            LootTableExtreme:UpdateLootDisplay()
        end
    end)
end

-- Helper: create or return an existing loot row. Rows are parented to the
-- faux scroll frame so FauxScrollFrame APIs work correctly.
local function CreateOrGetRow(index)
    if lootRows[index] then return lootRows[index] end
    local parent = scrollFrame or UIParent
    local row = CreateFrame("Button", "LootTableExtremeLootRow" .. index, parent)
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

-- Ensure rows up to n exist (defined after CreateOrGetRow)
local function EnsureRows(n)
    for i = 1, n do CreateOrGetRow(i) end
end

-- Top-level helpers for InitializeLootFrame (moved out for clarity & testability)
local function SetupBackground()
    if not frame then return end
    local bg = frame:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints(frame)
    bg:SetTexture("Interface\\DialogFrame\\UI-DialogBox-Background")
    bg:SetHorizTile(true)
    bg:SetVertTile(true)
end

local function CreateInitialRows()
    if not MAX_DISPLAYED_ROWS then return end
    for i = 1, MAX_DISPLAYED_ROWS do CreateOrGetRow(i) end
end

local function SetupResizeHook()
    if scrollFrame and not scrollFrame._LTX_SizeHook then
        scrollFrame:SetScript("OnSizeChanged", function(self, width, height)
            LTX_Debug("OnSizeChanged: w=" .. tostring(width) .. " h=" .. tostring(height))
            LootTableExtreme:UpdateLootDisplay()
        end)
        scrollFrame._LTX_SizeHook = true
    end
end

local function SetupEmptyMessage()
    if scrollFrame and not emptyMessage then
        emptyMessage = scrollFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
        emptyMessage:SetPoint("CENTER", scrollFrame, "CENTER", 0, 0)
        emptyMessage:SetText("No loot available")
        emptyMessage:SetJustifyH("CENTER")
        emptyMessage:SetWidth(300)
        emptyMessage:Hide()
    end
end

local function SetupScrollScript()
    if scrollFrame then
        scrollFrame:SetScript("OnVerticalScroll", function(self, offset)
            FauxScrollFrame_OnVerticalScroll(self, offset, LOOT_ROW_HEIGHT, function()
                LootTableExtreme:UpdateLootDisplay()
            end)
        end)
    end
end

local function SetupFiltersIfPresent()
    if _G["LootTableExtremeFrameFilters"] then
        LootTableExtreme:CreateFilterCheckboxes()
    end
end

local function SetupModeToggle()
    local modeToggle = _G["LootTableExtremeFrameModeToggle"]
    if not modeToggle then return end

    modeToggle:SetScript("OnClick", function()
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
        LootTableExtreme:ToggleMode()
    end)

    modeToggle:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
        GameTooltip:AddLine("Settings", 1, 1, 1)
        GameTooltip:Show()
    end)
    modeToggle:SetScript("OnLeave", function()
        GameTooltip:Hide()
    end)
end

local function SetupCloseButton()
    local closeBtn = _G["LootTableExtremeFrameClose"] or _G["LootTableExtremeFrameTitle"]
    if closeBtn then
        closeBtn:SetScript("OnClick", function()
            if frame then frame:Hide() end
        end)
    end
end

-- Initialize the loot frame
function LootTableExtreme:InitializeLootFrame()
    -- Lookup frames after XML has been loaded
    frame = _G["LootTableExtremeFrame"]
    scrollFrame = _G["LootTableExtremeFrameScrollFrame"]
    if not frame then return end

    -- Run all initialization steps (helpers are defined at file scope)
    SetupBackground()
    if scrollFrame and scrollFrame.Show then scrollFrame:Show() end
    CreateInitialRows()
    SetupResizeHook()
    SetupEmptyMessage()
    SetupScrollScript()
    SetupFiltersIfPresent()
    SetupModeToggle()
    if LootTableExtreme.InitializeSettings then
        LootTableExtreme:InitializeSettings()
    end
    self:UpdateModeDisplay()
    SetupCloseButton()
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

    local visibleSlots = ComputeVisibleSlots()
    EnsureRows(visibleSlots)

    FauxScrollFrame_Update(scrollFrame, numLoot, visibleSlots, LOOT_ROW_HEIGHT)
    local offset = FauxScrollFrame_GetOffset(scrollFrame)

    if numLoot == 0 then
        HideRows(visibleSlots)
        RefreshVisuals()
        return
    end

    local db = self.Database
    local needsRetry = false
    for i = 1, visibleSlots do
        local beforeCount = #filteredLoot
        renderRowAt(self, i, offset, db)
        -- if FetchItemInfo didn't return data for a visible item, mark retry
        local row = lootRows[i]
        if row and row.item and row.item.itemId then
            local n, q, tex = FetchItemInfo(row.item.itemId)
            if not n or not tex then needsRetry = true end
        end
    end

    RefreshVisuals()

    if needsRetry then ScheduleRetry() end
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
