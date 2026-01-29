/**
 * Storage module for managing localStorage preferences
 */
const Storage = (function() {
    const STORAGE_KEY = 'lma_bus_tracker_settings';

    const defaults = {
        selectedRoutes: [], // Empty means all routes
        defaultSource: '',
        defaultDest: '',
        lastUpdated: null
    };

    /**
     * Get all settings from localStorage
     */
    function getSettings() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                return { ...defaults, ...JSON.parse(stored) };
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
        return { ...defaults };
    }

    /**
     * Save settings to localStorage
     */
    function saveSettings(settings) {
        try {
            const toSave = {
                ...getSettings(),
                ...settings,
                lastUpdated: Date.now()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
            console.log('Settings saved:', toSave);
            return true;
        } catch (e) {
            console.error('Failed to save settings:', e);
            return false;
        }
    }

    /**
     * Get selected routes filter
     */
    function getSelectedRoutes() {
        return getSettings().selectedRoutes || [];
    }

    /**
     * Set selected routes filter
     */
    function setSelectedRoutes(routeIds) {
        return saveSettings({ selectedRoutes: routeIds });
    }

    /**
     * Get default source stop
     */
    function getDefaultSource() {
        return getSettings().defaultSource || '';
    }

    /**
     * Set default source stop
     */
    function setDefaultSource(stopId) {
        return saveSettings({ defaultSource: stopId });
    }

    /**
     * Get default destination stop
     */
    function getDefaultDest() {
        return getSettings().defaultDest || '';
    }

    /**
     * Set default destination stop
     */
    function setDefaultDest(stopId) {
        return saveSettings({ defaultDest: stopId });
    }

    /**
     * Clear all settings
     */
    function clearSettings() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('Settings cleared');
            return true;
        } catch (e) {
            console.error('Failed to clear settings:', e);
            return false;
        }
    }

    /**
     * Check if a route is selected (visible)
     * Returns true if no filter is set (show all) or if route is in selected list
     */
    function isRouteVisible(routeId) {
        const selected = getSelectedRoutes();
        // If no routes selected, show all
        if (!selected || selected.length === 0) {
            return true;
        }
        return selected.includes(String(routeId));
    }

    // Public API
    return {
        getSettings,
        saveSettings,
        getSelectedRoutes,
        setSelectedRoutes,
        getDefaultSource,
        setDefaultSource,
        getDefaultDest,
        setDefaultDest,
        clearSettings,
        isRouteVisible
    };
})();
