/**
 * API module for PassioGo bus tracking
 */
const API = (function() {
    const BASE_URL = 'https://passiogo.com/mapGetData.php';
    const SYSTEM_ID = '6986'; // Harvard LMA system ID

    // CORS proxy configurations
    const CORS_PROXIES = [
        { url: 'https://api.allorigins.win/post?url=', type: 'allorigins' },
        { url: 'https://corsproxy.io/?', type: 'standard' },
        { url: 'https://proxy.cors.sh/', type: 'corssh' }
    ];

    let currentProxyIndex = 0;

    /**
     * Make a POST request through CORS proxy
     */
    async function postRequest(endpoint, body) {
        const targetUrl = `${BASE_URL}?${endpoint}`;
        const proxy = CORS_PROXIES[currentProxyIndex];
        const bodyData = `json=${encodeURIComponent(JSON.stringify(body))}`;

        try {
            let response;

            if (proxy.type === 'allorigins') {
                // allorigins uses a different format - send body as part of the request
                response = await fetch(proxy.url + encodeURIComponent(targetUrl), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: bodyData
                });
            } else if (proxy.type === 'corssh') {
                // cors.sh requires the target URL as the fetch URL
                response = await fetch(proxy.url + targetUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: bodyData
                });
            } else {
                // Standard proxy format
                response = await fetch(proxy.url + encodeURIComponent(targetUrl), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: bodyData
                });
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            let text = await response.text();

            // allorigins wraps response in JSON
            if (proxy.type === 'allorigins') {
                try {
                    const wrapped = JSON.parse(text);
                    text = wrapped.contents || text;
                } catch (e) {
                    // Not wrapped, use as-is
                }
            }

            if (!text || text.trim() === '') {
                return null;
            }

            return JSON.parse(text);
        } catch (error) {
            if (currentProxyIndex < CORS_PROXIES.length - 1) {
                currentProxyIndex++;
                console.log('Trying alternate CORS proxy...', CORS_PROXIES[currentProxyIndex].url);
                return postRequest(endpoint, body);
            }

            console.error('API request failed:', error);
            throw error;
        }
    }

    /**
     * Fetch all routes for the system
     */
    async function getRoutes() {
        const data = await postRequest('getRoutes=2', {
            systemSelected0: parseInt(SYSTEM_ID),
            amount: 1
        });

        if (!data) {
            console.error('No data returned from routes API');
            return [];
        }

        // Routes are in data.all array
        const routesArray = data.all || [];
        console.log('Raw routes:', routesArray.length);

        return routesArray.map(route => ({
            id: route.myid || route.id,
            name: route.name || route.longName || `Route ${route.id}`,
            shortName: route.shortName || route.name,
            color: route.color || '#4a90d9',
            points: parseRoutePoints(route.points),
            groupId: route.groupId,
            active: true
        }));
    }

    /**
     * Parse route points string into coordinates array
     */
    function parseRoutePoints(pointsStr) {
        if (!pointsStr) return [];

        const points = [];
        const parts = pointsStr.split(',');

        for (let i = 0; i < parts.length - 1; i += 2) {
            const lat = parseFloat(parts[i]);
            const lng = parseFloat(parts[i + 1]);
            if (!isNaN(lat) && !isNaN(lng)) {
                points.push([lat, lng]);
            }
        }

        return points;
    }

    /**
     * Fetch all stops for the system
     */
    async function getStops() {
        const data = await postRequest('getStops=2', {
            s0: SYSTEM_ID,
            sA: 1
        });

        if (!data || !data.stops) {
            console.error('No stops data returned');
            return [];
        }

        // Stops are returned as an object with ID keys like "ID207691"
        const stopsObj = data.stops;
        const stops = [];

        for (const key in stopsObj) {
            if (stopsObj.hasOwnProperty(key)) {
                const stop = stopsObj[key];
                stops.push({
                    id: stop.id || stop.stopId,
                    name: stop.name || `Stop ${stop.id}`,
                    latitude: parseFloat(stop.latitude),
                    longitude: parseFloat(stop.longitude),
                    routeId: stop.routeId,
                    routeName: stop.routeName,
                    color: stop.color || '#666666'
                });
            }
        }

        console.log('Parsed stops:', stops.length);
        return stops;
    }

    /**
     * Fetch current bus positions
     */
    async function getBuses() {
        const data = await postRequest('getBuses=1', {
            s0: SYSTEM_ID,
            sA: 1
        });

        if (!data || !data.buses) {
            return [];
        }

        // Buses can be in different formats
        let busesArray = [];

        if (Array.isArray(data.buses)) {
            busesArray = data.buses;
        } else {
            // It's an object with keys
            for (const key in data.buses) {
                if (data.buses.hasOwnProperty(key)) {
                    const item = data.buses[key];
                    if (Array.isArray(item)) {
                        busesArray.push(...item);
                    } else {
                        busesArray.push(item);
                    }
                }
            }
        }

        return busesArray.map(bus => ({
            id: bus.busId || bus.id,
            busName: bus.busName || bus.name || `Bus ${bus.busId || bus.id}`,
            routeId: bus.routeId || bus.route,
            latitude: parseFloat(bus.latitude),
            longitude: parseFloat(bus.longitude),
            heading: parseFloat(bus.heading) || 0,
            speed: parseFloat(bus.speed) || 0,
            paxLoad: bus.paxLoad || 0,
            timestamp: bus.updated || bus.timestamp || Date.now()
        }));
    }

    /**
     * Fetch arrival predictions for a stop
     */
    async function getStopArrivals(stopId) {
        try {
            const data = await postRequest('getStopArrivals=2', {
                stop: stopId,
                s0: SYSTEM_ID,
                sA: 1
            });

            if (!data) {
                return [];
            }

            let arrivals = [];

            if (data.arrivals) {
                if (Array.isArray(data.arrivals)) {
                    arrivals = data.arrivals;
                } else {
                    for (const key in data.arrivals) {
                        if (data.arrivals.hasOwnProperty(key)) {
                            const item = data.arrivals[key];
                            if (Array.isArray(item)) {
                                arrivals.push(...item);
                            } else {
                                arrivals.push(item);
                            }
                        }
                    }
                }
            }

            return arrivals.map(arrival => ({
                busId: arrival.busId || arrival.bus,
                busName: arrival.busName || `Bus ${arrival.busId}`,
                routeId: arrival.routeId || arrival.route,
                routeName: arrival.routeName,
                eta: parseInt(arrival.eta || arrival.minutes) || 0,
                scheduledTime: arrival.scheduledTime || arrival.scheduled,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.error('Failed to fetch arrivals:', error);
            return [];
        }
    }

    /**
     * Calculate ETAs based on bus positions and stop location
     * @param {Array} buses - All buses
     * @param {Object} stop - Target stop
     * @param {Array} routes - All routes
     * @param {Array} filterRouteIds - Optional array of route IDs to filter by
     */
    function calculateETAs(buses, stop, routes, filterRouteIds = null) {
        const routeMap = new Map();
        routes.forEach(r => routeMap.set(r.id, r));

        // Filter buses by selected routes if filter is provided
        let filteredBuses = buses;
        if (filterRouteIds && filterRouteIds.length > 0) {
            filteredBuses = buses.filter(bus =>
                filterRouteIds.includes(String(bus.routeId))
            );
        }

        return filteredBuses
            .map(bus => {
                const distance = getDistanceKm(
                    bus.latitude, bus.longitude,
                    stop.latitude, stop.longitude
                );

                // Estimate ETA: assume average speed of 20 km/h in urban area
                const avgSpeed = bus.speed > 0 ? Math.max(bus.speed * 1.6, 15) : 20;
                const etaMinutes = Math.round((distance / avgSpeed) * 60);

                const route = routeMap.get(bus.routeId);

                return {
                    busId: bus.id,
                    busName: bus.busName,
                    routeId: bus.routeId,
                    routeName: route ? (route.shortName || route.name) : `Route ${bus.routeId}`,
                    routeColor: route ? route.color : '#4a90d9',
                    eta: etaMinutes,
                    distance: distance,
                    speed: bus.speed,
                    timestamp: Date.now()
                };
            })
            .sort((a, b) => a.eta - b.eta)
            .slice(0, 10);
    }

    /**
     * Calculate distance between two points in kilometers
     */
    function getDistanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // Public API
    return {
        getRoutes,
        getStops,
        getBuses,
        getStopArrivals,
        calculateETAs,
        getDistanceKm
    };
})();
