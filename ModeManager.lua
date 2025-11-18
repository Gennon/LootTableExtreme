-- LootTableExtreme Mode Manager
-- Handles Simple/Advanced mode toggling and UI layout

-- Toggle between simple and advanced mode
function LootTableExtreme:ToggleMode()
    -- Open the separate settings window if available, otherwise fall back to existing ToggleMode behaviour
    if self.ToggleSettings then
        self:ToggleSettings()
        return
    end

    -- Back-compat: toggle the DB flag and refresh if no dedicated settings UI exists
    LootTableExtremeDB.ui.advancedMode = not LootTableExtremeDB.ui.advancedMode
    self:RefreshCurrentDisplay()
end

