-- LootTableExtreme Pickpocket Frame
-- Compact UI for displaying pickpocket loot tables

local frame = nil
local scrollFrame = nil
local lootRows = {}

-- Constants
local LOOT_ROW_HEIGHT = 18
local MAX_DISPLAYED_ROWS = 8
local updateTimer = nil

-- Current state
local currentNpc = nil
local pickpocketLoot = {}
local emptyMessage = nil

-- Helper to fetch item info safely
local function FetchItemInfo(itemId)
    if not itemId then return nil, nil, nil end
    local info = { GetItemInfo(itemId) }
    return info[1], info[3], info[10]
end

-- Compute visible slots
local function ComputeVisibleSlots()
    local visible = MAX_DISPLAYED_ROWS
    if scrollFrame and scrollFrame.GetHeight then
        local h = scrollFrame:GetHeight() or 0
        visible = math.max(1, math.floor(h / LOOT_ROW_HEIGHT))
    end
    return visible
end

-- Hide rows
local function HideRows(n)
    for i = 1, n do 
        if lootRows[i] then 
            lootRows[i]:Hide()
        end 
    end
end

-- Render a single row
local function renderRowAt(self, i, offset, db)
    local row = lootRows[i]
    if not row then return end
    local index = i + offset
    local numLoot = #pickpocketLoot

    if index > numLoot then
        row.item = nil
        if row.Hide then row:Hide() end
        return
    end

    local item = pickpocketLoot[index]
    if not item then
        row.item = nil
        if row.Hide then row:Hide() end
        return
    end

    local itemName, itemQuality, itemTexture = FetchItemInfo(item.itemId)
    local quality = itemQuality or item.quality
    local color = db and db.GetQualityColor and db:GetQualityColor(quality) or { r = 1, g = 1, b = 1 }

    -- Set icon
    if item.itemId then
        if itemTexture and row.icon and row.icon.SetTexture then
            row.icon:SetTexture(itemTexture)
            row.icon:Show()
        else
            if row.icon and row.icon.Hide then row.icon:Hide() end
        end

        local displayName = itemName or item.name or (item.itemId and ("Item:" .. tostring(item.itemId)))
        if row.name and row.name.SetText then row.name:SetText(displayName) end
    else
        if row.icon and row.icon.Hide then row.icon:Hide() end
        if row.name and row.name.SetText then row.name:SetText(item.name or "Unknown") end
    end

    if row.name and row.name.SetTextColor then
        row.name:SetTextColor(color.r, color.g, color.b)
    end

    if row.chance and row.chance.SetText then
        row.chance:SetText(string.format("%.1f%%", item.dropChance))
    end

    row.item = item

    if row.ClearAllPoints and row.SetPoint and scrollFrame then
        row:ClearAllPoints()
        local y = -(i-1) * LOOT_ROW_HEIGHT
        row:SetPoint("TOPLEFT", scrollFrame, "TOPLEFT", 0, y)
    end

    if row and row.Show then row:Show() end
end

local function ScheduleRetry()
    if updateTimer and updateTimer.Cancel then updateTimer:Cancel() end
    updateTimer = C_Timer.NewTimer(0.5, function()
        if frame and frame.IsShown and frame:IsShown() then
            LootTableExtreme:UpdatePickpocketDisplay()
        end
    end)
end

local function RefreshVisuals()
    if scrollFrame and scrollFrame.Hide and scrollFrame.Show then
        scrollFrame:Hide(); scrollFrame:Show()
    end
end

-- Update widths of rows to match scroll frame width
local function UpdateRowWidths()
    if not scrollFrame or not scrollFrame.GetWidth then return end
    local ok, frameWidth = pcall(function() return scrollFrame:GetWidth() end)
    if not ok or not frameWidth then return end

    local rowWidth = frameWidth - (LootTableExtreme.UI_SCROLLBAR_WIDTH or 16)
    for _, row in pairs(lootRows) do
        if row and row.SetWidth then row:SetWidth(rowWidth) end
        if row and row.name and row.name.SetWidth then
            local nameWidth = math.max(80, rowWidth - 120)
            row.name:SetWidth(nameWidth)
        end
    end
end

local function SetupResizeHook()
    if scrollFrame and not scrollFrame._LTX_SizeHook then
        scrollFrame:SetScript("OnSizeChanged", function(self, width, height)
            UpdateRowWidths()
            LootTableExtreme:UpdatePickpocketDisplay()
        end)
        scrollFrame._LTX_SizeHook = true
    end

    if frame and not frame._LTX_ResizeHook then
        frame:SetScript("OnSizeChanged", function(self, width, height)
            UpdateRowWidths()
            LootTableExtreme:UpdatePickpocketDisplay()
        end)
        frame._LTX_ResizeHook = true
    end
end

-- Create or get a loot row
local function CreateOrGetRow(index)
    if lootRows[index] then return lootRows[index] end
    local parent = scrollFrame or UIParent
    local row = CreateFrame("Button", "LootTableExtremePickpocketRow" .. index, parent)
    row:SetHeight(LOOT_ROW_HEIGHT)
    local w = 300
    if parent and parent.GetWidth then
        local ok, pw = pcall(function() return parent:GetWidth() end)
        if ok and pw then w = pw - LootTableExtreme.UI_SCROLLBAR_WIDTH end
    end
    row:SetWidth(w)

    row.icon = row:CreateTexture(nil, "ARTWORK")
    local iconSize = LootTableExtreme.UI_ICON_SIZE
    row.icon:SetWidth(iconSize)
    row.icon:SetHeight(iconSize)
    local margin = LootTableExtreme.UI_MARGIN
    row.icon:SetPoint("LEFT", row, "LEFT", margin / 2, 0)

    row.name = row:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
    row.name:SetPoint("LEFT", row.icon, "RIGHT", margin / 2, 0)
    row.name:SetWidth(180)
    row.name:SetJustifyH("LEFT")

    row.chance = row:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
    row.chance:SetPoint("RIGHT", row, "RIGHT", margin*2, 0)
    row.chance:SetWidth(40)
    row.chance:SetJustifyH("RIGHT")

    row.questMarker = row:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    row.questMarker:SetPoint("RIGHT", row.chance, "LEFT", -margin, 0)
    row.questMarker:SetText("Q")
    row.questMarker:SetTextColor(1, 0.82, 0)
    row.questMarker:SetJustifyH("RIGHT")
    row.questMarker:SetWidth(18)
    if row.questMarker.SetDrawLayer then row.questMarker:SetDrawLayer("OVERLAY", 1) end
    row.questMarker:Hide()

    -- Attach tooltip handlers if available
    if LootTableExtreme.SetupRowTooltip then
        LootTableExtreme:SetupRowTooltip(row)
    end
    -- Make sure the row is above background textures
    if row.SetFrameStrata then row:SetFrameStrata("DIALOG") end
    if row.SetFrameLevel and frame and frame.GetFrameLevel then
        local ok, baseLevel = pcall(function() return frame:GetFrameLevel() end)
        if ok and baseLevel then row:SetFrameLevel(baseLevel + 10) end
    end
    row:Hide()
    lootRows[index] = row
    return row
end

-- Ensure rows exist
local function EnsureRows(n)
    for i = 1, n do CreateOrGetRow(i) end
end

-- Initialize the pickpocket frame
function LootTableExtreme:InitializePickpocketFrame()
    frame = LootTableExtremePickpocketFrame
    if not frame then
        self:Print("Error: Pickpocket frame not found")
        return
    end

    scrollFrame = LootTableExtremePickpocketFrameScrollFrame
    
    -- Set up backdrop (with compatibility check)
    if frame.SetBackdrop then
        frame:SetBackdrop({
            bgFile = "Interface\\TutorialFrame\\TutorialFrameBackground",
            edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
            tile = true,
            tileSize = 16,
            edgeSize = 16,
            insets = { left = 5, right = 5, top = 5, bottom = 5 }
        })
        frame:SetBackdropColor(0, 0, 0, 1)
    end
    
    -- Create background texture as fallback
    local bg = frame:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints(frame)
    bg:SetTexture("Interface\\DialogFrame\\UI-DialogBox-Background")
    bg:SetHorizTile(true)
    bg:SetVertTile(true)

    -- Set up close button
    local closeButton = getglobal(frame:GetName() .. "Close")
    if closeButton then
        closeButton:SetScript("OnClick", function()
            frame:Hide()
        end)
    end

    -- Set up scroll frame
    if scrollFrame then
        scrollFrame:SetScript("OnVerticalScroll", function(self, offset)
            FauxScrollFrame_OnVerticalScroll(self, offset, LOOT_ROW_HEIGHT, function()
                LootTableExtreme:UpdatePickpocketDisplay()
            end)
        end)
        if scrollFrame.Show then scrollFrame:Show() end
    end

    -- Create empty message (anchor to scroll area if present)
    emptyMessage = frame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    if scrollFrame and scrollFrame:GetName() then
        emptyMessage:SetPoint("CENTER", scrollFrame, "CENTER", 0, 0)
    else
        emptyMessage:SetPoint("CENTER", frame, "CENTER", 0, 0)
    end
    emptyMessage:SetText("No pickpocket loot")
    emptyMessage:SetTextColor(0.5, 0.5, 0.5)
    emptyMessage:Hide()

    -- Initial row sizing and rows
    UpdateRowWidths()
    SetupResizeHook()
    local initialRows = ComputeVisibleSlots()
    EnsureRows(initialRows)
    -- Ensure rows/layout are correct when the frame is shown later
    if not frame._LTX_OnShowHook then
        frame:SetScript("OnShow", function(self)
            UpdateRowWidths()
            LootTableExtreme:UpdatePickpocketDisplay()
        end)
        frame._LTX_OnShowHook = true
    end
end

-- Show pickpocket loot for an NPC
function LootTableExtreme:ShowNpcPickpocket(npcIdOrName)
    if not frame then return end

    local npcData, npcName
    if type(npcIdOrName) == "number" then
        npcData, npcName = self.Database:GetPickpocketByNpcId(npcIdOrName)
    else
        npcName = npcIdOrName
        npcData = self.Database:GetPickpocketByNpcName(npcIdOrName)
    end

    if not npcData then
        -- No pickpocket data for this NPC
        frame:Hide()
        return
    end

    currentNpc = npcName or npcIdOrName
    pickpocketLoot = npcData.loot or {}

    -- (debug prints removed)

    -- Sort by drop chance
    table.sort(pickpocketLoot, function(a, b)
        return a.dropChance > b.dropChance
    end)

    -- Update header
    local header = getglobal(frame:GetName() .. "HeaderTitle")
    if header then
        header:SetText("Pickpocket")
    end

    local subtitle = getglobal(frame:GetName() .. "HeaderSubtitle")
    if subtitle then
        local level = npcData.level
        local levelText = ""
        if type(level) == "table" then
            levelText = string.format(" (%d-%d)", level[1], level[2])
        elseif level then
            levelText = string.format(" (%d)", level)
        end
        subtitle:SetText((npcName or "Unknown") .. levelText)
    end

    -- Reset scroll
    if scrollFrame then
        FauxScrollFrame_SetOffset(scrollFrame, 0)
        if scrollFrame.SetVerticalScroll then
            scrollFrame:SetVerticalScroll(0)
        end
    end

    self:UpdatePickpocketDisplay()
    frame:Show()
end

-- Update the display
function LootTableExtreme:UpdatePickpocketDisplay()
    local numLoot = #pickpocketLoot

    -- Show/hide empty message
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
    -- (debug prints removed)

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
        renderRowAt(self, i, offset, db)
        local row = lootRows[i]
        if row and row.item and row.item.itemId then
            local n, q, tex = FetchItemInfo(row.item.itemId)
            if not n or not tex then needsRetry = true end
        end
    end

    -- (debug prints removed)

    -- Hide extra rows
    for i = visibleSlots + 1, #lootRows do
        if lootRows[i] then
            lootRows[i]:Hide()
        end
    end

    RefreshVisuals()

    if needsRetry then ScheduleRetry() end
end

-- Toggle pickpocket frame
function LootTableExtreme:TogglePickpocketFrame()
    if frame and frame.IsShown and frame:IsShown() then
        frame:Hide()
    else
        -- If no current NPC, try to show target's pickpocket data
        if not currentNpc then
            if UnitExists("target") and not UnitIsPlayer("target") then
                local npcId = self:GetTargetNpcId()
                if npcId and self.Database:HasPickpocketLoot(npcId) then
                    self:ShowNpcPickpocket(npcId)
                    return
                end
            end
            self:Print("Target has no pickpocket data")
        else
            if frame and frame.Show then frame:Show() end
        end
    end
end
