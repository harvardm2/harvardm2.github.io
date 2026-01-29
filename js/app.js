/**
 * Main application module
 */
const App = (function() {
    const BUS_REFRESH_INTERVAL = 5000; // 5 seconds
    const ARRIVALS_REFRESH_INTERVAL = 10000; // 10 seconds

    let routes = [];
    let stops = [];
    let buses = [];
    let userLocation = null;
    let busRefreshInterval = null;
    let arrivalsRefreshInterval = null;
    let watchPositionId = null;

    /**
     * Initialize the application
     */
    async function init() {
        console.log('Initializing LMA Bus Tracker...');

        // Initialize map
        MapManager.init();

        // Set up bus click handler
        MapManager.onBusClick(handleBusClick);

        // Initialize UI
        UI.init();

        // Setup UI callbacks
        UI.onSearch(handleSearch);
        UI.onMyLocation(handleMyLocation);

        // Load initial data
        await loadInitialData();

        // Apply saved route filters
        const selectedRoutes = getRouteFilter();
        if (selectedRoutes.length > 0) {
            MapManager.filterByRoutes(selectedRoutes);
        }

        // Start bus position polling
        startBusPolling();

        // Try to get user location
        requestUserLocation();

        // Auto-show arrivals if defaults are saved (with small delay to ensure UI is ready)
        setTimeout(() => {
            autoShowArrivals();
        }, 200);
    }

    /**
     * Automatically show arrivals if user has saved default stops
     */
    function autoShowArrivals() {
        const defaultSourceId = Storage.getDefaultSource();
        const defaultDestId = Storage.getDefaultDest();

        console.log('Checking auto-show: source=', defaultSourceId, 'dest=', defaultDestId);

        if (defaultSourceId) {
            const sourceStop = stops.find(s => String(s.id) === String(defaultSourceId));
            const destStop = defaultDestId ? stops.find(s => String(s.id) === String(defaultDestId)) : null;

            console.log('Found stops:', sourceStop?.name, destStop?.name);

            if (sourceStop) {
                console.log('Auto-showing arrivals for:', sourceStop.name);

                // Show details view immediately
                UI.showDetailsView(sourceStop, destStop, userLocation, true);

                // Fetch and display arrivals
                refreshArrivals(sourceStop);

                // Start arrivals polling
                startArrivalsPolling(sourceStop);
            }
        }
    }

    /**
     * Load routes and stops on startup
     */
    async function loadInitialData() {
        try {
            const [routesData, stopsData] = await Promise.all([
                API.getRoutes(),
                API.getStops()
            ]);

            routes = routesData;
            stops = stopsData;

            console.log(`Loaded ${routes.length} routes and ${stops.length} stops`);

            // Add routes to map
            MapManager.addRoutes(routes);

            // Add stops to map with click handler
            MapManager.addStops(stops, routes, handleStopClick);

            // Populate UI dropdowns
            UI.populateStops(stops, routes);

            // Initial bus fetch
            await refreshBuses();

        } catch (error) {
            console.error('Failed to load initial data:', error);
            UI.showToast('Failed to load data. Please refresh.');
        }
    }

    /**
     * Handle stop click on map
     */
    function handleStopClick(stop) {
        UI.selectSourceStop(stop.id);
    }

    /**
     * Handle bus click on map
     */
    function handleBusClick(bus) {
        console.log('Bus clicked:', bus);

        // Find the route for this bus
        const route = routes.find(r => String(r.id) === String(bus.routeId));

        // Find nearest stop to user on this route
        let nearestStop = null;

        if (userLocation) {
            // Filter stops that belong to this route
            const routeStops = stops.filter(s => String(s.routeId) === String(bus.routeId));

            if (routeStops.length > 0) {
                let minDistance = Infinity;

                routeStops.forEach(stop => {
                    const distance = API.getDistanceKm(
                        userLocation.lat, userLocation.lng,
                        stop.latitude, stop.longitude
                    );
                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestStop = stop;
                    }
                });
            }
        }

        // If no user location, just pick the first stop on the route
        if (!nearestStop) {
            nearestStop = stops.find(s => String(s.routeId) === String(bus.routeId));
        }

        // Show bus navigation view
        UI.showBusNavView(bus, route, nearestStop, userLocation);
    }

    /**
     * Handle search button click
     */
    async function handleSearch(sourceStop, destStop) {
        console.log('Searching for buses from', sourceStop.name);

        // Show details view
        UI.showDetailsView(sourceStop, destStop, userLocation);

        // Fetch and display arrivals
        await refreshArrivals(sourceStop);

        // Start arrivals polling
        startArrivalsPolling(sourceStop);
    }

    /**
     * Handle my location button click
     */
    function handleMyLocation() {
        if (userLocation) {
            MapManager.centerOnUser();
            UI.setLocationActive(true);
        } else {
            requestUserLocation();
        }
    }

    /**
     * Request user's location
     */
    function requestUserLocation() {
        if (!navigator.geolocation) {
            console.log('Geolocation not supported');
            UI.showToast('Location not supported');
            return;
        }

        // Watch position for continuous updates
        watchPositionId = navigator.geolocation.watchPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                MapManager.updateUserLocation(userLocation.lat, userLocation.lng);
                UI.setLocationActive(true);
            },
            (error) => {
                console.log('Geolocation error:', error.message);
                UI.setLocationActive(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000
            }
        );
    }

    /**
     * Fetch and update bus positions
     */
    async function refreshBuses() {
        try {
            buses = await API.getBuses();
            MapManager.updateBuses(buses, routes);

            // If we're in details view, refresh arrivals too
            const { source } = UI.getSelectedStops();
            if (UI.getCurrentView() === 'details' && source) {
                const filteredRoutes = getRouteFilter();
                const arrivals = API.calculateETAs(buses, source, routes, filteredRoutes);
                UI.updateArrivals(arrivals, handleArrivalClick);
            }

        } catch (error) {
            console.error('Failed to refresh buses:', error);
        }
    }

    /**
     * Handle click on arrival card
     */
    function handleArrivalClick(busId) {
        const bus = buses.find(b => String(b.id) === String(busId));
        if (bus) {
            handleBusClick(bus);
        }
    }

    /**
     * Get the route filter from storage
     */
    function getRouteFilter() {
        return Storage.getSelectedRoutes();
    }

    /**
     * Fetch arrivals for a specific stop
     */
    async function refreshArrivals(stop) {
        try {
            // Get route filter
            const selectedRoutes = getRouteFilter();

            // First try the API endpoint
            let arrivals = await API.getStopArrivals(stop.id);

            // If no arrivals from API, calculate from bus positions
            if (!arrivals || arrivals.length === 0) {
                arrivals = API.calculateETAs(buses, stop, routes, selectedRoutes);
            } else {
                // Add route colors to API arrivals and filter by selected routes
                arrivals = arrivals
                    .filter(arrival => {
                        // If no filter, show all; otherwise filter by selected routes
                        if (!selectedRoutes || selectedRoutes.length === 0) return true;
                        return selectedRoutes.includes(String(arrival.routeId));
                    })
                    .map(arrival => {
                        const route = routes.find(r => String(r.id) === String(arrival.routeId));
                        return {
                            ...arrival,
                            routeColor: route ? route.color : '#4a90d9',
                            routeName: arrival.routeName || (route ? (route.shortName || route.name) : `Route ${arrival.routeId}`)
                        };
                    });
            }

            UI.updateArrivals(arrivals, handleArrivalClick);
            UI.updateRefreshTime();

        } catch (error) {
            console.error('Failed to refresh arrivals:', error);
            // Fall back to calculated ETAs
            const filteredRoutes = getRouteFilter();
            const arrivals = API.calculateETAs(buses, stop, routes, filteredRoutes);
            UI.updateArrivals(arrivals, handleArrivalClick);
        }
    }

    /**
     * Start polling for bus positions
     */
    function startBusPolling() {
        if (busRefreshInterval) {
            clearInterval(busRefreshInterval);
        }
        busRefreshInterval = setInterval(refreshBuses, BUS_REFRESH_INTERVAL);
    }

    /**
     * Start polling for arrivals
     */
    function startArrivalsPolling(stop) {
        if (arrivalsRefreshInterval) {
            clearInterval(arrivalsRefreshInterval);
        }
        arrivalsRefreshInterval = setInterval(() => {
            refreshArrivals(stop);
        }, ARRIVALS_REFRESH_INTERVAL);
    }

    /**
     * Stop polling for arrivals
     */
    function stopArrivalsPolling() {
        if (arrivalsRefreshInterval) {
            clearInterval(arrivalsRefreshInterval);
            arrivalsRefreshInterval = null;
        }
    }

    /**
     * Get user location
     */
    function getUserLocation() {
        return userLocation;
    }

    // Public API
    return {
        init,
        refreshBuses,
        refreshArrivals,
        getUserLocation
    };
})();

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
