-- LootTableExtreme Core
-- Main addon initialization and core functionality

LootTableExtreme = {}
LootTableExtreme.version = "1.0.0"

-- UI constants (used across modules)
LootTableExtreme.UI_MARGIN = 10        -- standard side/top/bottom margin
LootTableExtreme.UI_HEADER_HEIGHT = 50 -- header height used in XML
LootTableExtreme.UI_SCROLLBAR_WIDTH = 20 -- width of the scrollbar


-- Default settings
local defaults = {
    minimap = {
        hide = false,
        minimapPos = 220,
    },
    filters = {
        showPoor = false,
        showCommon = false,
        showUncommon = true,
        showRare = true,
        showEpic = true,
        showQuestItems = true,
        minDropChance = 5, -- Show items with >5% drop chance by default
    },
    pickpocket = {
        -- When true, automatically show the compact pickpocket window when
        -- targeting an NPC that can be pickpocketed, but only when the main
        -- loot window is NOT visible.
        autoShowWhenMainHidden = false,
    },
}

-- Initialize addon
function LootTableExtreme:Initialize()
    -- Load saved variables or use defaults
    if not LootTableExtremeDB then
        LootTableExtremeDB = {}
    end
    
    -- Merge defaults with saved settings
    self:MergeDefaults(LootTableExtremeDB, defaults)
    
    -- Build database caches (must be done after ScrapedDatabase.lua is loaded)
    self.Database:BuildItemSourcesCache()
    self.Database:BuildItemVendorsCache()
    
    self:Print("Loaded v" .. self.version)
    self:Print("Type /lte to open the loot table viewer")
    
    -- Initialize UI components
    self:InitializeMinimapButton()
    self:InitializeLootFrame()
    if self.InitializePickpocketFrame then
        self:InitializePickpocketFrame()
    end
    self:InitializeTooltips()
end

-- Merge default values into saved variables
function LootTableExtreme:MergeDefaults(dst, src)
    for k, v in pairs(src) do
        if type(v) == "table" then
            if type(dst[k]) ~= "table" then
                dst[k] = {}
            end
            self:MergeDefaults(dst[k], v)
        elseif dst[k] == nil then
            dst[k] = v
        end
    end
end

-- Print helper function
function LootTableExtreme:Print(msg)
    DEFAULT_CHAT_FRAME:AddMessage("|cff00ff00[LootTableExtreme]|r " .. msg)
end

-- Slash commands
SLASH_LOOTTABLEEXTREME1 = "/lte"
SLASH_LOOTTABLEEXTREME2 = "/loottable"
SlashCmdList["LOOTTABLEEXTREME"] = function(msg)
    msg = string.lower(msg or "")
    
    if msg == "" or msg == "show" then
        LootTableExtreme:ToggleLootFrame()
    elseif msg == "target" then
        LootTableExtreme:ShowTargetLoot()
    elseif msg == "pickpocket" or msg == "pp" then
        if LootTableExtreme.TogglePickpocketFrame then
            LootTableExtreme:TogglePickpocketFrame()
        else
            LootTableExtreme:Print("Pickpocket frame not available")
        end
    elseif msg == "pickpocket auto on" or msg == "pp auto on" then
        LootTableExtremeDB.pickpocket.autoShowWhenMainHidden = true
        LootTableExtreme:Print("Pickpocket auto-show when main hidden: ON")
    elseif msg == "pickpocket auto off" or msg == "pp auto off" then
        LootTableExtremeDB.pickpocket.autoShowWhenMainHidden = false
        LootTableExtreme:Print("Pickpocket auto-show when main hidden: OFF")
    elseif msg == "minimap" then
        LootTableExtreme:ToggleMinimapButton()
    elseif msg == "help" then
        LootTableExtreme:Print("Commands:")
        LootTableExtreme:Print("/lte - Toggle loot table window")
        LootTableExtreme:Print("/lte target - Show loot for current target")
        LootTableExtreme:Print("/lte pickpocket (or pp) - Toggle pickpocket window")
        LootTableExtreme:Print("/lte minimap - Toggle minimap button")
    else
        LootTableExtreme:Print("Unknown command. Type /lte help for commands.")
    end
end

-- Event frame
local eventFrame = CreateFrame("Frame")
eventFrame:RegisterEvent("ADDON_LOADED")
eventFrame:RegisterEvent("PLAYER_TARGET_CHANGED")
eventFrame:RegisterEvent("GET_ITEM_INFO_RECEIVED")
eventFrame:SetScript("OnEvent", function(self, event, arg1)
    if event == "ADDON_LOADED" and arg1 == "LootTableExtreme" then
        LootTableExtreme:Initialize()
    elseif event == "PLAYER_TARGET_CHANGED" then
        LootTableExtreme:OnTargetChanged()
    elseif event == "GET_ITEM_INFO_RECEIVED" then
        -- arg1 is the itemId that just loaded
        LootTableExtreme:OnItemInfoReceived(arg1)
    end
end)
