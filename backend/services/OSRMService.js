const axios = require('axios');

class OSRMService {
  constructor() {
    this.baseURL = process.env.OSRM_BASE_URL || 'http://router.project-osrm.org';
    this.cache = new Map();
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  }

  async getRoute(coordinates, profile = 'bike') {
    try {
      const cacheKey = `${profile}:${coordinates.join(';')}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      // Format coordinates for OSRM API
      const coordsString = coordinates
        .map(coord => `${coord[1]},${coord[0]}`) // lng,lat format
        .join(';');

      const url = `${this.baseURL}/route/v1/${profile}/${coordsString}?overview=full&geometries=geojson`;

      console.log(`OSRM Request: ${url}`);

      const response = await axios.get(url, {
        timeout: 10000, // 10 second timeout
        headers: {
          'User-Agent': 'ShareRickshaw/1.0'
        }
      });

      if (response.data.code !== 'Ok') {
        throw new Error(`OSRM API error: ${response.data.message}`);
      }

      if (!response.data.routes || response.data.routes.length === 0) {
        throw new Error('No route found');
      }

      const route = response.data.routes[0];
      const result = {
        distance: route.distance, // in meters
        duration: route.duration, // in seconds
        geometry: route.geometry,
        legs: route.legs || []
      };

      // Cache the result
      this.setCache(cacheKey, result);

      return result;

    } catch (error) {
      console.error('OSRM API error:', error.message);

      // Fallback: return estimated route
      if (coordinates.length === 2) {
        return this.getFallbackRoute(coordinates[0], coordinates[1], profile);
      }

      throw error;
    }
  }

  async getWalkingTime(fromCoords, toCoords) {
    try {
      const route = await this.getRoute([fromCoords, toCoords], 'foot');
      return Math.ceil(route.duration / 60); // Convert to minutes
    } catch (error) {
      console.error('Error getting walking time:', error);
      // Fallback: estimate walking time (5 km/h average walking speed)
      const distance = this.calculateDistance(
        fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]
      );
      return Math.ceil((distance / 5) * 60); // Convert to minutes
    }
  }

  async getBikingTime(fromCoords, toCoords) {
    try {
      const route = await this.getRoute([fromCoords, toCoords], 'bike');
      return Math.ceil(route.duration / 60); // Convert to minutes
    } catch (error) {
      console.error('Error getting biking time:', error);
      // Fallback: estimate biking time (15 km/h average biking speed)
      const distance = this.calculateDistance(
        fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]
      );
      return Math.ceil((distance / 15) * 60); // Convert to minutes
    }
  }

  async getRouteBetweenStands(fromStand, toStand, profile = 'bike') {
    return this.getRoute([
      [fromStand.latitude, fromStand.longitude],
      [toStand.latitude, toStand.longitude]
    ], profile);
  }

  async getTransferRoute(stand1, stand2, stand3, stand4) {
    // For transfers between zones: stand1 -> stand2 (walking) -> stand3 -> stand4 (rickshaw)
    try {
      const walkingRoute = await this.getRoute([
        [stand1.latitude, stand1.longitude],
        [stand2.latitude, stand2.longitude]
      ], 'foot');

      const rickshawRoute = await this.getRoute([
        [stand3.latitude, stand3.longitude],
        [stand4.latitude, stand4.longitude]
      ], 'bike');

      return {
        walkingSegment: {
          from: stand1,
          to: stand2,
          distance: walkingRoute.distance,
          duration: walkingRoute.duration,
          geometry: walkingRoute.geometry
        },
        rickshawSegment: {
          from: stand3,
          to: stand4,
          distance: rickshawRoute.distance,
          duration: rickshawRoute.duration,
          geometry: rickshawRoute.geometry
        }
      };
    } catch (error) {
      console.error('Error getting transfer route:', error);
      throw error;
    }
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data: data,
      timestamp: Date.now()
    });

    // Limit cache size
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  clearCache() {
    this.cache.clear();
  }

  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  getFallbackRoute(fromCoords, toCoords, profile) {
    const distance = this.calculateDistance(
      fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]
    );

    let speed = 15; // Default biking speed (km/h)
    if (profile === 'foot') {
      speed = 5; // Walking speed (km/h)
    }

    const duration = (distance / speed) * 3600; // Convert to seconds

    return {
      distance: distance * 1000, // Convert to meters
      duration: duration,
      geometry: {
        type: 'LineString',
        coordinates: [fromCoords, toCoords]
      },
      legs: [],
      fallback: true
    };
  }

  async healthCheck() {
    try {
      const testCoords = [[19.0760, 72.8777], [19.0896, 72.8656]]; // Mumbai coordinates
      await this.getRoute(testCoords, 'bike');
      return { status: 'healthy', message: 'OSRM API is accessible' };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `OSRM API error: ${error.message}`
      };
    }
  }
}

module.exports = OSRMService;