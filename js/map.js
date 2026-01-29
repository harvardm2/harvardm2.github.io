/**
 * Map module for Leaflet map management
 */
const MapManager = (function() {
    const DEFAULT_CENTER = [42.338, -71.105]; // Longwood Medical Area
    const DEFAULT_ZOOM = 15;

    let map = null;
    let busMarkers = new Map();
    let stopMarkers = new Map();
    let routePolylines = new Map();
    let routeColors = new Map();
    let userMarker = null;
    let selectedStopMarker = null;
    let destinationMarker = null;
    let onBusClickCallback = null;
    let visibleRoutes = []; // Empty means all visible

    /**
     * Initialize the Leaflet map
     */
    function init() {
        map = L.map('map', {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: false
        });

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        }).addTo(map);

        // Add zoom control to bottom right
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        return map;
    }

    /**
     * Set bus click callback
     */
    function onBusClick(callback) {
        onBusClickCallback = callback;
    }

    /**
     * Create a custom bus marker icon
     */
    function createBusIcon(color, heading) {
        const html = `
            <div class="bus-marker" style="background-color: ${color}; transform: rotate(${heading}deg);">
                🚌
            </div>
        `;

        return L.divIcon({
            html: html,
            className: 'bus-marker-container',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            popupAnchor: [0, -20]
        });
    }

    /**
     * Create a stop marker icon
     */
    function createStopIcon(color, isSelected = false) {
        const className = isSelected ? 'stop-marker selected' : 'stop-marker';
        const html = `<div class="${className}" style="background-color: ${color};"></div>`;

        return L.divIcon({
            html: html,
            className: 'stop-marker-container',
            iconSize: isSelected ? [24, 24] : [16, 16],
            iconAnchor: isSelected ? [12, 12] : [8, 8],
            popupAnchor: [0, -12]
        });
    }

    /**
     * Create user location marker
     */
    function createUserIcon() {
        const html = `<div class="user-marker"></div>`;
        return L.divIcon({
            html: html,
            className: 'user-marker-container',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
    }

    /**
     * Check if a route should be visible
     */
    function isRouteVisible(routeId) {
        if (!visibleRoutes || visibleRoutes.length === 0) {
            return true;
        }
        return visibleRoutes.includes(String(routeId));
    }

    /**
     * Filter map elements by routes
     */
    function filterByRoutes(routeIds) {
        visibleRoutes = routeIds || [];

        // Filter route polylines
        routePolylines.forEach((polyline, routeId) => {
            if (isRouteVisible(routeId)) {
                if (!map.hasLayer(polyline)) {
                    polyline.addTo(map);
                }
            } else {
                if (map.hasLayer(polyline)) {
                    map.removeLayer(polyline);
                }
            }
        });

        // Filter stop markers
        stopMarkers.forEach((marker, stopId) => {
            const stopRouteId = marker.routeId;
            if (isRouteVisible(stopRouteId)) {
                if (!map.hasLayer(marker)) {
                    marker.addTo(map);
                }
            } else {
                if (map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            }
        });

        // Filter bus markers
        busMarkers.forEach((marker, busId) => {
            const busRouteId = marker.routeId;
            if (isRouteVisible(busRouteId)) {
                if (!map.hasLayer(marker)) {
                    marker.addTo(map);
                }
            } else {
                if (map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            }
        });
    }

    /**
     * Add or update bus markers
     */
    function updateBuses(buses, routes) {
        const activeBusIds = new Set();

        routes.forEach(route => {
            routeColors.set(route.id, route.color);
        });

        buses.forEach(bus => {
            activeBusIds.add(bus.id);
            const color = routeColors.get(bus.routeId) || '#4a90d9';
            const shouldShow = isRouteVisible(bus.routeId);

            if (busMarkers.has(bus.id)) {
                const marker = busMarkers.get(bus.id);
                marker.setLatLng([bus.latitude, bus.longitude]);
                marker.setIcon(createBusIcon(color, bus.heading));
                marker.routeId = bus.routeId;
                marker.busData = bus;

                // Update visibility
                if (shouldShow && !map.hasLayer(marker)) {
                    marker.addTo(map);
                } else if (!shouldShow && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            } else {
                const marker = L.marker([bus.latitude, bus.longitude], {
                    icon: createBusIcon(color, bus.heading),
                    zIndexOffset: 1000
                });

                marker.routeId = bus.routeId;
                marker.busData = bus;

                // Add click handler for bus
                marker.on('click', () => {
                    if (onBusClickCallback) {
                        onBusClickCallback(bus);
                    }
                });

                if (shouldShow) {
                    marker.addTo(map);
                }
                busMarkers.set(bus.id, marker);
            }
        });

        // Remove inactive bus markers
        busMarkers.forEach((marker, busId) => {
            if (!activeBusIds.has(busId)) {
                map.removeLayer(marker);
                busMarkers.delete(busId);
            }
        });
    }

    /**
     * Add stop markers to the map
     */
    function addStops(stops, routes, onStopClick) {
        // Deduplicate stops by ID
        const uniqueStops = new Map();
        stops.forEach(stop => {
            if (!uniqueStops.has(stop.id)) {
                uniqueStops.set(stop.id, stop);
            }
        });

        uniqueStops.forEach(stop => {
            const color = stop.color || '#666666';
            const stopId = String(stop.id);
            const shouldShow = isRouteVisible(stop.routeId);

            const marker = L.marker([stop.latitude, stop.longitude], {
                icon: createStopIcon(color),
                zIndexOffset: 500
            });

            marker.stopId = stopId;
            marker.stopData = stop;
            marker.color = color;
            marker.routeId = stop.routeId;

            marker.bindPopup(`<strong>${stop.name}</strong>`);

            marker.on('click', () => {
                if (onStopClick) {
                    onStopClick(stop);
                }
            });

            if (shouldShow) {
                marker.addTo(map);
            }
            stopMarkers.set(stopId, marker);
        });
    }

    /**
     * Highlight selected source stop
     */
    function selectStop(stopId) {
        // Reset previous selection
        if (selectedStopMarker) {
            const prevMarker = stopMarkers.get(String(selectedStopMarker));
            if (prevMarker) {
                prevMarker.setIcon(createStopIcon(prevMarker.color, false));
            }
        }

        // Highlight new selection
        if (stopId) {
            const marker = stopMarkers.get(String(stopId));
            if (marker) {
                marker.setIcon(createStopIcon(marker.color, true));
                selectedStopMarker = String(stopId);
            }
        } else {
            selectedStopMarker = null;
        }
    }

    /**
     * Highlight destination stop
     */
    function selectDestination(stopId) {
        // Reset previous destination
        if (destinationMarker && destinationMarker !== selectedStopMarker) {
            const prevMarker = stopMarkers.get(String(destinationMarker));
            if (prevMarker) {
                prevMarker.setIcon(createStopIcon(prevMarker.color, false));
            }
        }

        // Highlight new destination
        if (stopId && String(stopId) !== String(selectedStopMarker)) {
            const marker = stopMarkers.get(String(stopId));
            if (marker) {
                marker.setIcon(createStopIcon('#e53e3e', true)); // Red for destination
                destinationMarker = String(stopId);
            }
        } else {
            destinationMarker = null;
        }
    }

    /**
     * Add route polylines to the map
     */
    function addRoutes(routes) {
        routes.forEach(route => {
            if (route.points && route.points.length > 0) {
                const shouldShow = isRouteVisible(route.id);

                const polyline = L.polyline(route.points, {
                    color: route.color,
                    weight: 4,
                    opacity: 0.7
                });

                if (shouldShow) {
                    polyline.addTo(map);
                }
                routePolylines.set(route.id, polyline);
            }
        });
    }

    /**
     * Focus map on a specific stop
     */
    function focusOnStop(stop) {
        if (stop) {
            map.setView([stop.latitude, stop.longitude], 17);
        }
    }

    /**
     * Focus map to show both source and destination
     */
    function focusOnTrip(sourceStop, destStop) {
        if (sourceStop && destStop) {
            const bounds = L.latLngBounds([
                [sourceStop.latitude, sourceStop.longitude],
                [destStop.latitude, destStop.longitude]
            ]);
            map.fitBounds(bounds, { padding: [50, 50] });
        } else if (sourceStop) {
            focusOnStop(sourceStop);
        }
    }

    /**
     * Update user location marker
     */
    function updateUserLocation(lat, lng) {
        if (userMarker) {
            userMarker.setLatLng([lat, lng]);
        } else {
            userMarker = L.marker([lat, lng], {
                icon: createUserIcon(),
                zIndexOffset: 2000
            });
            userMarker.addTo(map);
        }
    }

    /**
     * Center map on user location
     */
    function centerOnUser() {
        if (userMarker) {
            map.setView(userMarker.getLatLng(), 16);
        }
    }

    /**
     * Get the map instance
     */
    function getMap() {
        return map;
    }

    /**
     * Reset map view to default (keeps buses visible)
     */
    function resetView() {
        // Just recenter, don't remove markers
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        // Re-apply route filter to ensure correct buses are shown
        const savedRoutes = Storage.getSelectedRoutes();
        if (savedRoutes.length > 0) {
            filterByRoutes(savedRoutes);
        }
    }

    /**
     * Get a bus by ID
     */
    function getBusById(busId) {
        const marker = busMarkers.get(busId);
        return marker ? marker.busData : null;
    }

    // Public API
    return {
        init,
        onBusClick,
        updateBuses,
        addStops,
        addRoutes,
        filterByRoutes,
        selectStop,
        selectDestination,
        focusOnStop,
        focusOnTrip,
        updateUserLocation,
        centerOnUser,
        getMap,
        resetView,
        getBusById
    };
})();
