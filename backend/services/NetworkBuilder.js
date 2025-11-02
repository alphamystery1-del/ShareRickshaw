const db = require('../config/database');
const OSRMService = require('./OSRMService');

class NetworkBuilder {
  constructor() {
    this.osrmService = new OSRMService();
    this.PROXIMITY_THRESHOLD_KM = 2; // Connect stands within 2km
    this.MAX_CONNECTIONS_PER_STAND = 6; // Limit connections for performance
  }

  async buildInitialNetwork() {
    try {
      console.log('Building initial network connections...');

      // Clear existing connections
      await db.query('DELETE FROM network_connections');

      // Get all stands
      const [stands] = await db.query(
        'SELECT id, name, latitude, longitude FROM stands ORDER BY id'
      );

      console.log(`Processing ${stands.length} stands for network connections`);

      const connections = [];

      // Build connections based on proximity
      for (let i = 0; i < stands.length; i++) {
        const stand1 = stands[i];
        const nearbyStands = [];

        for (let j = 0; j < stands.length; j++) {
          if (i === j) continue; // Skip self

          const stand2 = stands[j];
          const distance = this.calculateDistance(
            stand1.latitude, stand1.longitude,
            stand2.latitude, stand2.longitude
          );

          if (distance <= this.PROXIMITY_THRESHOLD_KM) {
            nearbyStands.push({
              stand: stand2,
              distance: distance
            });
          }
        }

        // Sort by distance and limit connections
        nearbyStands.sort((a, b) => a.distance - b.distance);
        const connectionsToAdd = nearbyStands.slice(0, this.MAX_CONNECTIONS_PER_STAND);

        // Add connections to array
        connectionsToAdd.forEach(({ stand: stand2, distance }) => {
          connections.push({
            from_stand_id: stand1.id,
            to_stand_id: stand2.id,
            connection_type: 'direct'
          });
        });
      }

      // Add connections based on existing routes
      await this.addRouteBasedConnections(stands);

      // Insert connections in batches
      if (connections.length > 0) {
        await this.insertConnections(connections);
      }

      console.log(`Network built with ${connections.length} connections`);
      return connections.length;

    } catch (error) {
      console.error('Error building initial network:', error);
      throw error;
    }
  }

  async addRouteBasedConnections(stands) {
    try {
      // Get existing routes to understand connectivity patterns
      const [routes] = await db.query(`
        SELECT r1.stand_id as stand1_id, r2.stand_id as stand2_id,
               s1.latitude as lat1, s1.longitude as lng1,
               s2.latitude as lat2, s2.longitude as lng2,
               COUNT(*) as route_count
        FROM routes r1
        JOIN routes r2 ON r1.destination = r2.destination AND r1.stand_id != r2.stand_id
        JOIN stands s1 ON r1.stand_id = s1.id
        JOIN stands s2 ON r2.stand_id = s2.id
        GROUP BY r1.stand_id, r2.stand_id
        HAVING route_count >= 2
      `);

      const routeConnections = routes.map(route => ({
        from_stand_id: route.stand1_id,
        to_stand_id: route.stand2_id,
        connection_type: 'direct'
      }));

      if (routeConnections.length > 0) {
        await this.insertConnections(routeConnections);
        console.log(`Added ${routeConnections.length} route-based connections`);
      }

    } catch (error) {
      console.error('Error adding route-based connections:', error);
    }
  }

  async insertConnections(connections) {
    try {
      // Remove duplicates and prepare for insertion
      const uniqueConnections = this.removeDuplicateConnections(connections);

      if (uniqueConnections.length === 0) {
        return;
      }

      // Insert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < uniqueConnections.length; i += batchSize) {
        const batch = uniqueConnections.slice(i, i + batchSize);
        const values = batch.map(conn =>
          `(${conn.from_stand_id}, ${conn.to_stand_id}, '${conn.connection_type}')`
        ).join(', ');

        await db.query(`
          INSERT IGNORE INTO network_connections
          (from_stand_id, to_stand_id, connection_type)
          VALUES ${values}
        `);
      }

    } catch (error) {
      console.error('Error inserting connections:', error);
      throw error;
    }
  }

  removeDuplicateConnections(connections) {
    const seen = new Set();
    const unique = [];

    connections.forEach(conn => {
      const key1 = `${conn.from_stand_id}-${conn.to_stand_id}`;
      const key2 = `${conn.to_stand_id}-${conn.from_stand_id}`;

      if (!seen.has(key1) && !seen.has(key2)) {
        seen.add(key1);
        seen.add(key2);
        unique.push(conn);
      }
    });

    return unique;
  }

  async updateNetworkConnections() {
    try {
      console.log('Updating network connections...');

      // Check for new stands
      const [newStands] = await db.query(`
        SELECT s.id, s.name, s.latitude, s.longitude
        FROM stands s
        LEFT JOIN network_connections nc ON (s.id = nc.from_stand_id OR s.id = nc.to_stand_id)
        WHERE nc.id IS NULL
      `);

      if (newStands.length > 0) {
        console.log(`Found ${newStands.length} new stands to integrate`);
        await this.integrateNewStands(newStands);
      }

      // Remove connections to inactive stands (if we had status tracking)
      // This would require adding status/active flags to stands table

      // Update connection weights based on current OSRM data
      await this.updateConnectionWeights();

      console.log('Network update completed');

    } catch (error) {
      console.error('Error updating network connections:', error);
      throw error;
    }
  }

  async integrateNewStands(newStands) {
    try {
      // Get existing stands for distance calculations
      const [existingStands] = await db.query(
        'SELECT id, latitude, longitude FROM stands'
      );

      const connections = [];

      for (const newStand of newStands) {
        const nearbyStands = [];

        for (const existingStand of existingStands) {
          if (newStand.id === existingStand.id) continue;

          const distance = this.calculateDistance(
            newStand.latitude, newStand.longitude,
            existingStand.latitude, existingStand.longitude
          );

          if (distance <= this.PROXIMITY_THRESHOLD_KM) {
            nearbyStands.push({
              stand_id: existingStand.id,
              distance: distance
            });
          }
        }

        // Sort by distance and connect to nearest stands
        nearbyStands.sort((a, b) => a.distance - b.distance);
        const connectionsToAdd = nearbyStands.slice(0, this.MAX_CONNECTIONS_PER_STAND);

        connectionsToAdd.forEach(({ stand_id }) => {
          connections.push({
            from_stand_id: newStand.id,
            to_stand_id: stand_id,
            connection_type: 'direct'
          });
        });
      }

      if (connections.length > 0) {
        await this.insertConnections(connections);
        console.log(`Integrated ${newStands.length} new stands with ${connections.length} connections`);
      }

    } catch (error) {
      console.error('Error integrating new stands:', error);
      throw error;
    }
  }

  async updateConnectionWeights() {
    try {
      // This would be used if we stored weights in the database
      // For now, weights are calculated dynamically in NetworkData
      console.log('Connection weights are calculated dynamically');
    } catch (error) {
      console.error('Error updating connection weights:', error);
    }
  }

  calculateNetworkZone(stand) {
    // Determine network zone based on Mumbai's geography
    const lat = parseFloat(stand.latitude);
    const lng = parseFloat(stand.longitude);

    // Simplified Mumbai zone determination
    if (lng < 72.8) {
      return 'Western'; // Western line areas
    } else if (lat > 19.1) {
      return 'Central'; // Central line areas
    } else if (lat < 19.0) {
      return 'Harbour'; // Harbour line areas
    } else {
      return 'Central'; // Default to Central
    }
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

  async getNetworkStatistics() {
    try {
      const [stats] = await db.query(`
        SELECT
          COUNT(DISTINCT from_stand_id) as stands_with_connections,
          COUNT(*) as total_connections,
          COUNT(DISTINCT CASE WHEN connection_type = 'transfer' THEN from_stand_id END) as transfer_points
        FROM network_connections
      `);

      const [standCount] = await db.query('SELECT COUNT(*) as total_stands FROM stands');

      return {
        total_stands: standCount[0].total_stands,
        stands_with_connections: stats[0].stands_with_connections,
        total_connections: stats[0].total_connections,
        transfer_points: stats[0].transfer_points,
        connectivity_percentage: Math.round(
          (stats[0].stands_with_connections / standCount[0].total_stands) * 100
        )
      };

    } catch (error) {
      console.error('Error getting network statistics:', error);
      return null;
    }
  }

  async validateNetworkConnectivity() {
    try {
      const [stands] = await db.query('SELECT id, name FROM stands');
      const [connections] = await db.query(
        'SELECT from_stand_id, to_stand_id FROM network_connections'
      );

      // Build adjacency list
      const graph = {};
      stands.forEach(stand => {
        graph[stand.id] = new Set();
      });

      connections.forEach(conn => {
        graph[conn.from_stand_id].add(conn.to_stand_id);
        graph[conn.to_stand_id].add(conn.from_stand_id);
      });

      // Check connectivity using BFS
      const visited = new Set();
      const queue = [stands[0].id];
      visited.add(stands[0].id);

      while (queue.length > 0) {
        const current = queue.shift();
        for (const neighbor of graph[current]) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      const connectedStands = visited.size;
      const totalStands = stands.length;
      const connectivityPercentage = Math.round((connectedStands / totalStands) * 100);

      console.log(`Network connectivity: ${connectedStands}/${totalStands} stands (${connectivityPercentage}%)`);

      return {
        total_stands: totalStands,
        connected_stands: connectedStands,
        connectivity_percentage: connectivityPercentage,
        is_fully_connected: connectedStands === totalStands
      };

    } catch (error) {
      console.error('Error validating network connectivity:', error);
      return null;
    }
  }
}

module.exports = NetworkBuilder;