/**
 * UI module for interface management
 */
const UI = (function() {
    let stops = [];
    let routes = [];
    let currentView = 'selection'; // 'selection', 'details', or 'busNav'
    let selectedSourceStop = null;
    let selectedDestStop = null;
    let selectedBus = null;
    let nearestStop = null;

    // DOM Elements
    const elements = {};

    /**
     * Initialize UI
     */
    function init() {
        // Cache DOM elements
        elements.sourceStop = document.getElementById('sourceStop');
        elements.destStop = document.getElementById('destStop');
        elements.searchBtn = document.getElementById('searchBtn');
        elements.swapBtn = document.getElementById('swapStopsBtn');
        elements.stopSelectionView = document.getElementById('stopSelectionView');
        elements.stopDetailsView = document.getElementById('stopDetailsView');
        elements.busNavView = document.getElementById('busNavView');
        elements.selectedStopName = document.getElementById('selectedStopName');
        elements.stopDistance = document.getElementById('stopDistance');
        elements.arrivalsList = document.getElementById('arrivalsList');
        elements.backBtn = document.getElementById('backBtn');
        elements.headerTitle = document.getElementById('headerTitle');
        elements.currentTime = document.getElementById('currentTime');
        elements.refreshTime = document.getElementById('refreshTime');
        elements.navigateBtn = document.getElementById('navigateBtn');
        elements.myLocationBtn = document.getElementById('myLocationBtn');
        elements.bottomSheet = document.getElementById('bottomSheet');
        elements.settingsBtn = document.getElementById('settingsBtn');
        elements.settingsPanel = document.getElementById('settingsPanel');
        elements.closeSettings = document.getElementById('closeSettings');
        elements.routeFilters = document.getElementById('routeFilters');
        elements.defaultSource = document.getElementById('defaultSource');
        elements.defaultDest = document.getElementById('defaultDest');
        elements.saveSettingsBtn = document.getElementById('saveSettingsBtn');
        elements.clearSettingsBtn = document.getElementById('clearSettingsBtn');
        elements.activeFilters = document.getElementById('activeFilters');
        elements.filterTags = document.getElementById('filterTags');
        elements.setupPrompt = document.getElementById('setupPrompt');
        elements.quickActions = document.getElementById('quickActions');
        elements.openSettingsLink = document.getElementById('openSettingsLink');
        elements.refreshBtn = document.getElementById('refreshBtn');
        elements.busNavBadge = document.getElementById('busNavBadge');
        elements.busNavTitle = document.getElementById('busNavTitle');
        elements.nearestStopName = document.getElementById('nearestStopName');
        elements.nearestStopDistance = document.getElementById('nearestStopDistance');
        elements.navigateToStopBtn = document.getElementById('navigateToStopBtn');
        elements.backToMainBtn = document.getElementById('backToMainBtn');

        // Setup event listeners
        setupEventListeners();

        // Update time display
        updateCurrentTime();
        setInterval(updateCurrentTime, 1000);
    }

    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        // Swap stops button
        elements.swapBtn.addEventListener('click', () => {
            const source = elements.sourceStop.value;
            const dest = elements.destStop.value;
            elements.sourceStop.value = dest;
            elements.destStop.value = source;
            updateSelections();
        });

        // Back button
        elements.backBtn.addEventListener('click', () => {
            // If in bus nav view, go back to details view
            if (currentView === 'busNav') {
                goBackToDetailsView();
            } else {
                showSelectionView();
            }
        });

        // Navigate button
        elements.navigateBtn.addEventListener('click', () => {
            if (selectedSourceStop) {
                openNavigation(selectedSourceStop.latitude, selectedSourceStop.longitude, selectedSourceStop.name);
            }
        });

        // Stop selection changes
        elements.sourceStop.addEventListener('change', updateSelections);
        elements.destStop.addEventListener('change', updateSelections);

        // Settings panel
        elements.settingsBtn.addEventListener('click', openSettings);
        elements.closeSettings.addEventListener('click', closeSettings);
        elements.saveSettingsBtn.addEventListener('click', saveSettings);
        elements.clearSettingsBtn.addEventListener('click', clearSettings);

        // Setup prompt settings link
        elements.openSettingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            openSettings();
        });

        // Refresh button
        elements.refreshBtn.addEventListener('click', () => {
            elements.refreshBtn.classList.add('spinning');
            App.refreshBuses().then(() => {
                setTimeout(() => {
                    elements.refreshBtn.classList.remove('spinning');
                }, 500);
            });
        });

        // Select all / Deselect all buttons
        document.getElementById('selectAllRoutes').addEventListener('click', () => {
            elements.routeFilters.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = true;
            });
        });

        document.getElementById('deselectAllRoutes').addEventListener('click', () => {
            elements.routeFilters.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
        });

        // Bus navigation view
        elements.navigateToStopBtn.addEventListener('click', () => {
            if (nearestStop) {
                openNavigation(nearestStop.latitude, nearestStop.longitude, nearestStop.name);
            }
        });

        elements.backToMainBtn.addEventListener('click', () => {
            goBackToDetailsView();
        });
    }

    /**
     * Update selections when dropdowns change
     */
    function updateSelections() {
        const sourceId = elements.sourceStop.value;
        const destId = elements.destStop.value;

        selectedSourceStop = stops.find(s => String(s.id) === String(sourceId)) || null;
        selectedDestStop = stops.find(s => String(s.id) === String(destId)) || null;

        // Update map highlights
        MapManager.selectStop(sourceId);
        MapManager.selectDestination(destId);

        // Enable/disable search button
        elements.searchBtn.disabled = !sourceId;
    }

    /**
     * Populate stop dropdowns
     */
    function populateStops(stopsData, routesData) {
        stops = stopsData;
        routes = routesData;

        // Check if user has configured defaults
        const hasDefaults = Storage.getDefaultSource() || Storage.getSelectedRoutes().length > 0;

        // Show setup prompt or quick actions
        if (hasDefaults) {
            elements.setupPrompt.style.display = 'none';
            elements.quickActions.style.display = 'block';
        } else {
            elements.setupPrompt.style.display = 'block';
            elements.quickActions.style.display = 'none';
            // Auto-open settings for first-time users (with small delay)
            setTimeout(() => {
                openSettings();
            }, 500);
        }

        // Get selected routes from storage
        const selectedRoutes = Storage.getSelectedRoutes();

        // For dropdowns, show stops from selected routes (or all if no filter)
        let filteredStops = stops;
        if (selectedRoutes.length > 0) {
            filteredStops = stops.filter(stop => {
                return selectedRoutes.includes(String(stop.routeId));
            });
            // If filter results in empty, show all stops
            if (filteredStops.length === 0) {
                filteredStops = stops;
            }
        }

        // Deduplicate stops by NAME (not ID) to avoid showing duplicates like "HMS (Vanderbilt)" 5 times
        // Keep one representative stop per unique name
        const uniqueStopsMap = new Map();
        filteredStops.forEach(stop => {
            if (!uniqueStopsMap.has(stop.name)) {
                uniqueStopsMap.set(stop.name, stop);
            }
        });

        // Convert to array and sort alphabetically
        const uniqueStops = Array.from(uniqueStopsMap.values())
            .sort((a, b) => a.name.localeCompare(b.name));

        console.log('Populating dropdowns with', uniqueStops.length, 'stops');

        // Clear existing options
        elements.sourceStop.innerHTML = '<option value="">Select departure stop</option>';
        elements.destStop.innerHTML = '<option value="">Select destination stop</option>';

        // Add stop options
        uniqueStops.forEach(stop => {
            const option1 = document.createElement('option');
            option1.value = stop.id;
            option1.textContent = stop.name;
            elements.sourceStop.appendChild(option1);

            const option2 = document.createElement('option');
            option2.value = stop.id;
            option2.textContent = stop.name;
            elements.destStop.appendChild(option2);
        });

        // Apply saved defaults (with small delay to ensure options are rendered)
        setTimeout(() => {
            const defaultSource = Storage.getDefaultSource();
            const defaultDest = Storage.getDefaultDest();

            if (defaultSource) {
                // Check if the option exists in the dropdown
                const sourceOption = elements.sourceStop.querySelector(`option[value="${defaultSource}"]`);
                if (sourceOption) {
                    elements.sourceStop.value = defaultSource;
                }
            }
            if (defaultDest) {
                const destOption = elements.destStop.querySelector(`option[value="${defaultDest}"]`);
                if (destOption) {
                    elements.destStop.value = defaultDest;
                }
            }

            updateSelections();
        }, 0);

        updateFilterDisplay();
    }

    /**
     * Update the active filter display
     */
    function updateFilterDisplay() {
        const selectedRoutes = Storage.getSelectedRoutes();

        if (selectedRoutes.length === 0) {
            elements.activeFilters.style.display = 'none';
            return;
        }

        elements.activeFilters.style.display = 'flex';

        const tags = selectedRoutes.map(routeId => {
            const route = routes.find(r => String(r.id) === String(routeId));
            if (route) {
                return `<span class="filter-tag" style="background-color: ${route.color}">${route.shortName || route.name}</span>`;
            }
            return '';
        }).filter(Boolean).join('');

        elements.filterTags.innerHTML = tags;
    }

    /**
     * Set search button handler
     */
    function onSearch(callback) {
        elements.searchBtn.addEventListener('click', () => {
            if (selectedSourceStop) {
                callback(selectedSourceStop, selectedDestStop);
            }
        });
    }

    /**
     * Set my location button handler
     */
    function onMyLocation(callback) {
        elements.myLocationBtn.addEventListener('click', callback);
    }

    /**
     * Go back to details view from bus nav view
     */
    function goBackToDetailsView() {
        // Try to get source stop - use selectedSourceStop or fall back to saved default
        let sourceStop = selectedSourceStop;
        let destStop = selectedDestStop;

        if (!sourceStop) {
            const defaultSourceId = Storage.getDefaultSource();
            if (defaultSourceId) {
                sourceStop = stops.find(s => String(s.id) === String(defaultSourceId));
            }
        }

        if (!destStop) {
            const defaultDestId = Storage.getDefaultDest();
            if (defaultDestId) {
                destStop = stops.find(s => String(s.id) === String(defaultDestId));
            }
        }

        if (sourceStop) {
            showDetailsView(sourceStop, destStop, App.getUserLocation());
            App.refreshArrivals(sourceStop);
        } else {
            // No source stop available, go to selection view
            showSelectionView();
        }
    }

    /**
     * Show the stop selection view
     */
    function showSelectionView() {
        currentView = 'selection';
        elements.stopSelectionView.style.display = 'block';
        elements.stopDetailsView.style.display = 'none';
        elements.busNavView.style.display = 'none';
        elements.backBtn.style.display = 'none';
        elements.headerTitle.textContent = 'LMA Bus Tracker';
        document.getElementById('headerSubtitle').textContent = 'Harvard Shuttle';
        elements.bottomSheet.classList.remove('expanded');

        // Reset map selection highlights but keep buses visible
        MapManager.selectStop(null);
        MapManager.selectDestination(null);
        MapManager.resetView();

        // Re-apply saved defaults to dropdowns
        const defaultSource = Storage.getDefaultSource();
        const defaultDest = Storage.getDefaultDest();
        if (defaultSource && elements.sourceStop.querySelector(`option[value="${defaultSource}"]`)) {
            elements.sourceStop.value = defaultSource;
        }
        if (defaultDest && elements.destStop.querySelector(`option[value="${defaultDest}"]`)) {
            elements.destStop.value = defaultDest;
        }
        updateSelections();
    }

    /**
     * Show the stop details view with arrivals
     */
    function showDetailsView(sourceStop, destStop, userLocation, isAutoLoad = false) {
        currentView = 'details';
        selectedSourceStop = sourceStop;
        selectedDestStop = destStop;

        elements.stopSelectionView.style.display = 'none';
        elements.stopDetailsView.style.display = 'block';
        elements.busNavView.style.display = 'none';
        elements.backBtn.style.display = 'flex';
        elements.bottomSheet.classList.add('expanded');

        // Update header - show route filter if active
        const selectedRoutes = Storage.getSelectedRoutes();
        if (selectedRoutes.length > 0 && selectedRoutes.length <= 2) {
            const routeNames = selectedRoutes.map(rid => {
                const route = routes.find(r => String(r.id) === String(rid));
                return route ? (route.shortName || route.name) : '';
            }).filter(Boolean).join(', ');
            elements.headerTitle.textContent = routeNames;
            document.getElementById('headerSubtitle').textContent = destStop
                ? `${sourceStop.name} → ${destStop.name}`
                : sourceStop.name;
        } else if (destStop) {
            elements.headerTitle.textContent = `${sourceStop.name}`;
            document.getElementById('headerSubtitle').textContent = `→ ${destStop.name}`;
        } else {
            elements.headerTitle.textContent = sourceStop.name;
            document.getElementById('headerSubtitle').textContent = 'Harvard Shuttle';
        }

        // Update stop info
        elements.selectedStopName.textContent = sourceStop.name;
        if (destStop) {
            elements.selectedStopName.innerHTML = `${sourceStop.name} <span style="color: var(--text-secondary); font-weight: normal;">→ ${destStop.name}</span>`;
        }

        // Calculate distance from user
        if (userLocation) {
            const distance = API.getDistanceKm(
                userLocation.lat, userLocation.lng,
                sourceStop.latitude, sourceStop.longitude
            );
            const distanceMiles = (distance * 0.621371).toFixed(1);
            elements.stopDistance.textContent = `${distanceMiles} mi away`;
        } else {
            elements.stopDistance.textContent = 'Tap 📍 for distance';
        }

        // Show loading state
        elements.arrivalsList.innerHTML = `
            <div class="loading-arrivals">
                <div class="spinner"></div>
                <p>Loading arrivals...</p>
            </div>
        `;

        // Focus map
        MapManager.selectStop(sourceStop.id);
        if (destStop) {
            MapManager.selectDestination(destStop.id);
            MapManager.focusOnTrip(sourceStop, destStop);
        } else {
            MapManager.focusOnStop(sourceStop);
        }
    }

    /**
     * Show bus navigation view
     */
    function showBusNavView(bus, route, nearest, userLocation) {
        currentView = 'busNav';
        selectedBus = bus;
        nearestStop = nearest;

        elements.stopSelectionView.style.display = 'none';
        elements.stopDetailsView.style.display = 'none';
        elements.busNavView.style.display = 'block';
        elements.backBtn.style.display = 'flex';
        elements.headerTitle.textContent = route ? route.name : 'Bus Details';
        elements.bottomSheet.classList.add('expanded');

        // Update bus info
        elements.busNavBadge.textContent = route ? (route.shortName || route.name) : 'BUS';
        elements.busNavBadge.style.backgroundColor = route ? route.color : '#4a90d9';
        elements.busNavTitle.textContent = bus.busName;

        // Update nearest stop info
        if (nearest && userLocation) {
            elements.nearestStopName.textContent = nearest.name;
            const distance = API.getDistanceKm(
                userLocation.lat, userLocation.lng,
                nearest.latitude, nearest.longitude
            );
            const distanceMiles = (distance * 0.621371).toFixed(1);
            elements.nearestStopDistance.textContent = `${distanceMiles} mi from you`;
        } else if (nearest) {
            elements.nearestStopName.textContent = nearest.name;
            elements.nearestStopDistance.textContent = 'Enable location for distance';
        } else {
            elements.nearestStopName.textContent = 'No stops found';
            elements.nearestStopDistance.textContent = '';
        }

        // Focus map on bus and nearest stop
        if (nearest) {
            MapManager.selectStop(nearest.id);
            MapManager.focusOnStop(nearest);
        }
    }

    /**
     * Update arrivals list
     */
    function updateArrivals(arrivals, onBusClick) {
        elements.refreshTime.textContent = 'Updated just now';

        if (!arrivals || arrivals.length === 0) {
            elements.arrivalsList.innerHTML = `
                <div class="no-arrivals">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    <p>No buses currently approaching this stop</p>
                </div>
            `;
            return;
        }

        const html = arrivals.map(arrival => {
            const etaClass = arrival.eta <= 1 ? 'arriving' : arrival.eta <= 5 ? 'soon' : '';
            const etaText = arrival.eta <= 0 ? 'Now' : `${arrival.eta} min`;

            return `
                <div class="arrival-card" data-bus-id="${arrival.busId}">
                    <div class="route-badge" style="background-color: ${arrival.routeColor || '#4a90d9'}">
                        ${arrival.routeName || 'BUS'}
                    </div>
                    <div class="arrival-info">
                        <div class="bus-name">
                            <span class="bus-icon">🚌</span>
                            ${arrival.busName}
                        </div>
                        ${arrival.distance ? `<div class="scheduled-time">${arrival.distance.toFixed(1)} km away</div>` : ''}
                    </div>
                    <div class="arrival-eta">
                        <div class="eta-label">Est.</div>
                        <div class="eta-value ${etaClass}">${etaText}</div>
                    </div>
                </div>
            `;
        }).join('');

        elements.arrivalsList.innerHTML = html;

        // Add click handlers to arrival cards
        if (onBusClick) {
            document.querySelectorAll('.arrival-card').forEach(card => {
                card.addEventListener('click', () => {
                    const busId = card.dataset.busId;
                    onBusClick(busId);
                });
            });
        }
    }

    /**
     * Update current time display
     */
    function updateCurrentTime() {
        const now = new Date();
        elements.currentTime.textContent = now.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    /**
     * Update refresh time display
     */
    function updateRefreshTime() {
        elements.refreshTime.textContent = 'Updated just now';
    }

    /**
     * Open navigation to location
     */
    function openNavigation(lat, lng, name) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        if (isIOS) {
            window.open(`maps://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(name)}`, '_blank');
        } else {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
        }
    }

    /**
     * Open settings panel
     */
    function openSettings() {
        elements.settingsPanel.classList.add('open');
        populateSettingsPanel();
    }

    /**
     * Close settings panel
     */
    function closeSettings() {
        elements.settingsPanel.classList.remove('open');
    }

    /**
     * Populate settings panel with routes and stops
     */
    function populateSettingsPanel() {
        const selectedRoutes = Storage.getSelectedRoutes();

        // Populate route filters
        const routeFiltersHtml = routes.map(route => {
            const isChecked = selectedRoutes.length === 0 || selectedRoutes.includes(String(route.id));
            return `
                <label class="route-filter-item">
                    <input type="checkbox" value="${route.id}" ${isChecked ? 'checked' : ''}>
                    <div class="route-filter-color" style="background-color: ${route.color}"></div>
                    <span class="route-filter-name">${route.shortName || route.name}</span>
                </label>
            `;
        }).join('');

        elements.routeFilters.innerHTML = routeFiltersHtml;

        // Populate default stops (all stops, deduplicated by name)
        const uniqueStopsMap = new Map();
        stops.forEach(stop => {
            if (!uniqueStopsMap.has(stop.name)) {
                uniqueStopsMap.set(stop.name, stop);
            }
        });

        const allStops = Array.from(uniqueStopsMap.values())
            .sort((a, b) => a.name.localeCompare(b.name));

        elements.defaultSource.innerHTML = '<option value="">None</option>';
        elements.defaultDest.innerHTML = '<option value="">None</option>';

        allStops.forEach(stop => {
            const opt1 = document.createElement('option');
            opt1.value = stop.id;
            opt1.textContent = stop.name;
            elements.defaultSource.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = stop.id;
            opt2.textContent = stop.name;
            elements.defaultDest.appendChild(opt2);
        });

        // Set current values
        elements.defaultSource.value = Storage.getDefaultSource() || '';
        elements.defaultDest.value = Storage.getDefaultDest() || '';
    }

    /**
     * Save settings
     */
    function saveSettings() {
        // Get selected routes
        const checkedRoutes = [];
        elements.routeFilters.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            checkedRoutes.push(cb.value);
        });

        // If all routes are checked, save empty array (show all)
        const allChecked = checkedRoutes.length === routes.length;
        Storage.setSelectedRoutes(allChecked ? [] : checkedRoutes);

        // Save default stops
        Storage.setDefaultSource(elements.defaultSource.value);
        Storage.setDefaultDest(elements.defaultDest.value);

        // Close settings
        closeSettings();
        showToast('Settings saved! Refreshing...');

        // Reload the page to apply all changes
        setTimeout(() => {
            window.location.reload();
        }, 500);
    }

    /**
     * Clear all settings
     */
    function clearSettings() {
        Storage.clearSettings();
        closeSettings();
        showToast('Settings cleared!');

        // Refresh
        populateStops(stops, routes);
        MapManager.filterByRoutes([]);
    }

    /**
     * Show toast notification
     */
    function showToast(message) {
        // Remove existing toast
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    /**
     * Select a stop programmatically
     */
    function selectSourceStop(stopId) {
        elements.sourceStop.value = stopId;
        updateSelections();
    }

    /**
     * Get current view state
     */
    function getCurrentView() {
        return currentView;
    }

    /**
     * Get selected stops
     */
    function getSelectedStops() {
        return {
            source: selectedSourceStop,
            destination: selectedDestStop
        };
    }

    /**
     * Highlight my location button
     */
    function setLocationActive(active) {
        if (active) {
            elements.myLocationBtn.classList.add('active');
        } else {
            elements.myLocationBtn.classList.remove('active');
        }
    }

    // Public API
    return {
        init,
        populateStops,
        onSearch,
        onMyLocation,
        showSelectionView,
        showDetailsView,
        showBusNavView,
        updateArrivals,
        updateRefreshTime,
        selectSourceStop,
        getCurrentView,
        getSelectedStops,
        setLocationActive,
        openNavigation,
        showToast
    };
})();
