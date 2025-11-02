const NetworkData = require('./NetworkData');
const OSRMService = require('./OSRMService');
const db = require('../config/database');

class RouteCalculator {
  constructor() {
    this.networkData = new NetworkData();
    this.osrmService = new OSRMService();
    this.RICKSHAW_DELAY_MINUTES = 9;
    this.MAX_SEGMENTS = 5; // Limit route complexity
  }

  async findOptimalRoute(fromStandId, toDestinationCoords, toDestinationName = null) {
    try {
      console.log(`Finding optimal route from stand ${fromStandId} to destination`, toDestinationCoords);

      // Ensure network is loaded with fallback
      try {
        await this.networkData.loadNetwork();
      } catch (networkError) {
        console.log('Network loading error:', networkError.message);

        // If it's a table doesn't exist error, try to initialize
        if (networkError.message.includes('doesn\'t exist') ||
            networkError.message.includes('ER_NO_SUCH_TABLE')) {

          console.log('Attempting to initialize database...');
          await this.initializeDatabase();
          await this.networkData.loadNetwork();
        } else {
          throw networkError;
        }
      }

      if (!this.networkData.isNetworkLoaded()) {
        throw new Error('Network data not available. Please run the database setup script.');
      }

      const fromStand = this.networkData.getStandById(fromStandId);
      if (!fromStand) {
        throw new Error('Invalid starting stand');
      }

      // Find nearest stand to destination
      const toStand = await this.networkData.findNearestStand(
        toDestinationCoords.lat, toDestinationCoords.lng
      );

      if (!toStand) {
        throw new Error('No stands found near destination');
      }

      console.log(`Route: ${fromStand.name} -> ${toStand.name}`);

      // Check cache first
      const cachedRoute = await this.getCachedRoute(fromStandId, toDestinationCoords.lat, toDestinationCoords.lng);
      if (cachedRoute) {
        console.log('Using cached route');
        return {
          ...cachedRoute,
          cached: true,
          toDestinationName: toDestinationName || toStand.name
        };
      }

      // Calculate route using Dijkstra algorithm
      const route = await this.calculateDijkstraRoute(fromStand, toStand, toDestinationCoords, toDestinationName);

      // Cache the result
      await this.cacheRoute(fromStandId, toDestinationCoords.lat, toDestinationCoords.lng, route);

      return {
        ...route,
        cached: false
      };

    } catch (error) {
      console.error('Route calculation error:', error);
      throw error;
    }
  }

  async calculateDijkstraRoute(fromStand, toStand, toDestinationCoords, toDestinationName) {
    const graph = this.networkData.getGraph();

    // Find shortest path using Dijkstra
    const path = graph.shortestPath(fromStand.id.toString(), toStand.id.toString());

    if (!path || path.length === 0) {
      throw new Error('No route found between stands');
    }

    console.log(`Found path with ${path.length} stands:`, path);

    // Build route segments
    const segments = [];
    let totalTime = 0;
    let totalDistance = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const fromStandId = parseInt(path[i]);
      const toStandId = parseInt(path[i + 1]);
      const fromStand = this.networkData.getStandById(fromStandId);
      const toStand = this.networkData.getStandById(toStandId);

      // Get OSRM route data for this segment
      const osrmRoute = await this.osrmService.getRouteBetweenStands(fromStand, toStand, 'bike');

      // Apply 9-minute delay per rickshaw segment
      const segmentTime = Math.ceil(osrmRoute.duration / 60) + this.RICKSHAW_DELAY_MINUTES;
      const segmentDistance = osrmRoute.distance / 1000; // Convert to km

      totalTime += segmentTime;
      totalDistance += segmentDistance;

      segments.push({
        type: 'rickshaw',
        from_stand: fromStand,
        to_stand: toStand,
        distance: segmentDistance,
        time: segmentTime,
        osrm_duration: Math.ceil(osrmRoute.duration / 60),
        delay: this.RICKSHAW_DELAY_MINUTES,
        geometry: osrmRoute.geometry
      });
    }

    // Add final segment from last stand to exact destination if needed
    const lastStand = this.networkData.getStandById(parseInt(path[path.length - 1]));
    const finalDistance = this.networkData.calculateDistance(
      lastStand.latitude, lastStand.longitude,
      toDestinationCoords.lat, toDestinationCoords.lng
    );

    let finalSegment = null;
    if (finalDistance > 0.1) { // Only add if destination is more than 100m from stand
      const walkingTime = await this.osrmService.getWalkingTime(
        [lastStand.latitude, lastStand.longitude],
        [toDestinationCoords.lat, toDestinationCoords.lng]
      );

      totalTime += walkingTime;
      totalDistance += finalDistance;

      finalSegment = {
        type: 'walking',
        from_stand: lastStand,
        to_destination: {
          name: toDestinationName || 'Destination',
          latitude: toDestinationCoords.lat,
          longitude: toDestinationCoords.lng
        },
        distance: finalDistance,
        time: walkingTime,
        geometry: {
          type: 'LineString',
          coordinates: [
            [lastStand.longitude, lastStand.latitude],
            [toDestinationCoords.lng, toDestinationCoords.lat]
          ]
        }
      };
    }

    const route = {
      segments: finalSegment ? [...segments, finalSegment] : segments,
      total_time: totalTime,
      total_distance: totalDistance,
      segment_count: segments.length + (finalSegment ? 1 : 0),
      from_stand: fromStand,
      to_stand: toStand,
      to_destination: {
        name: toDestinationName || toStand.name,
        latitude: toDestinationCoords.lat,
        longitude: toDestinationCoords.lng
      },
      path: path.map(id => parseInt(id)),
      delays_applied: segments.length * this.RICKSHAW_DELAY_MINUTES
    };

    console.log(`Route calculated: ${totalTime} minutes, ${totalDistance.toFixed(2)} km, ${route.segment_count} segments`);

    return route;
  }

  async calculateTransferBetweenZones(fromStand, toStand) {
    // For transfers between different network zones
    try {
      // Find optimal transfer points using OSRM walking distances
      const allStands = this.networkData.getAllStands();

      let bestTransfer = null;
      let minWalkingTime = Infinity;

      // Simple approach: find stands in each zone with minimal walking distance
      for (const zone1Stand of allStands) {
        for (const zone2Stand of allStands) {
          if (zone1Stand.id !== zone2Stand.id) {
            // Calculate walking time between these stands
            const walkingTime = await this.osrmService.getWalkingTime(
              [fromStand.latitude, fromStand.longitude],
              [zone1Stand.latitude, zone1Stand.longitude]
            ) + await this.osrmService.getWalkingTime(
              [toStand.latitude, toStand.longitude],
              [zone2Stand.latitude, zone2Stand.longitude]
            );

            if (walkingTime < minWalkingTime) {
              minWalkingTime = walkingTime;
              bestTransfer = {
                from_transfer_stand: zone1Stand,
                to_transfer_stand: zone2Stand,
                walking_time: walkingTime
              };
            }
          }
        }
      }

      return bestTransfer;

    } catch (error) {
      console.error('Error calculating transfer:', error);
      return null;
    }
  }

  async getCachedRoute(fromStandId, toLat, toLng) {
    try {
      const [rows] = await db.query(
        `SELECT route_data FROM route_cache
         WHERE from_stand_id = ? AND to_lat = ? AND to_lng = ?
         AND expires_at > NOW()`,
        [fromStandId, toLat, toLng]
      );

      if (rows.length > 0) {
        return JSON.parse(rows[0].route_data);
      }
      return null;
    } catch (error) {
      console.error('Error getting cached route:', error);
      return null;
    }
  }

  async cacheRoute(fromStandId, toLat, toLng, route) {
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await db.query(
        `INSERT INTO route_cache
         (from_stand_id, to_lat, to_lng, route_data, total_time_minutes, segment_count, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         route_data = VALUES(route_data),
         total_time_minutes = VALUES(total_time_minutes),
         segment_count = VALUES(segment_count),
         expires_at = VALUES(expires_at)`,
        [
          fromStandId, toLat, toLng,
          JSON.stringify(route),
          route.total_time,
          route.segment_count,
          expiresAt
        ]
      );

      console.log('Route cached successfully');
    } catch (error) {
      console.error('Error caching route:', error);
    }
  }

  async clearExpiredCache() {
    try {
      const [result] = await db.query(
        'DELETE FROM route_cache WHERE expires_at < NOW()'
      );
      console.log(`Cleared ${result.affectedRows} expired cache entries`);
    } catch (error) {
      console.error('Error clearing expired cache:', error);
    }
  }

  async getRouteStatistics() {
    try {
      const [rows] = await db.query(
        'SELECT COUNT(*) as total_routes, AVG(total_time_minutes) as avg_time FROM route_cache'
      );

      return {
        total_cached_routes: rows[0].total_routes || 0,
        average_time: Math.round(rows[0].avg_time || 0),
        network_stats: this.networkData.getNetworkStats()
      };
    } catch (error) {
      console.error('Error getting route statistics:', error);
      return null;
    }
  }

  async initializeDatabase() {
    try {
      console.log('Creating network_connections table...');
      await db.query(`
        CREATE TABLE IF NOT EXISTS network_connections (
          id INT AUTO_INCREMENT PRIMARY KEY,
          from_stand_id INT NOT NULL,
          to_stand_id INT NOT NULL,
          connection_type ENUM('direct', 'transfer') DEFAULT 'direct',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_from_stand FOREIGN KEY (from_stand_id) REFERENCES stands(id) ON DELETE CASCADE,
          CONSTRAINT fk_to_stand FOREIGN KEY (to_stand_id) REFERENCES stands(id) ON DELETE CASCADE,
          UNIQUE KEY unique_connection (from_stand_id, to_stand_id),
          INDEX idx_from_stand (from_stand_id),
          INDEX idx_to_stand (to_stand_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log('Creating route_cache table...');
      await db.query(`
        CREATE TABLE IF NOT EXISTS route_cache (
          id INT AUTO_INCREMENT PRIMARY KEY,
          from_stand_id INT NOT NULL,
          to_lat DECIMAL(10,8) NOT NULL,
          to_lng DECIMAL(11,8) NOT NULL,
          route_data JSON NOT NULL,
          total_time_minutes INT NOT NULL,
          segment_count INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL,
          CONSTRAINT fk_cache_from_stand FOREIGN KEY (from_stand_id) REFERENCES stands(id) ON DELETE CASCADE,
          INDEX idx_route_lookup (from_stand_id, to_lat, to_lng),
          INDEX idx_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log('Creating user_favorites table...');
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_favorites (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          from_stand_id INT NOT NULL,
          to_destination VARCHAR(100) NOT NULL,
          to_lat DECIMAL(10,8),
          to_lng DECIMAL(11,8),
          nickname VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_favorite_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_favorite_from_stand FOREIGN KEY (from_stand_id) REFERENCES stands(id) ON DELETE CASCADE,
          INDEX idx_user_favorites (user_id),
          INDEX idx_user_stand_combo (user_id, from_stand_id, to_destination)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log('Database tables created successfully');

      // Build initial network connections
      console.log('Building initial network connections...');
      const NetworkBuilder = require('./NetworkBuilder');
      const networkBuilder = new NetworkBuilder();
      const connectionsCount = await networkBuilder.buildInitialNetwork();
      console.log(`Created ${connectionsCount} network connections`);

    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }
}

module.exports = RouteCalculator;