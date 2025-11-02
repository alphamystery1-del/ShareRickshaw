const db = require('../config/database');
const Graph = require('node-dijkstra');

class NetworkData {
  constructor() {
    this.graph = null;
    this.stands = new Map();
    this.connections = new Map();
    this.lastUpdated = null;
    this.CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
  }

  async loadNetwork() {
    try {
      console.log('Loading network data...');

      // Check if cache is still valid
      if (this.graph && this.lastUpdated &&
          (Date.now() - this.lastUpdated) < this.CACHE_DURATION) {
        console.log('Using cached network data');
        return;
      }

      // Load all stands
      const [stands] = await db.query(
        'SELECT id, name, latitude, longitude FROM stands ORDER BY id'
      );

      // Load all network connections
      const [connections] = await db.query(
        `SELECT nc.from_stand_id, nc.to_stand_id, s1.latitude as from_lat, s1.longitude as from_lng,
                s2.latitude as to_lat, s2.longitude as to_lng, nc.connection_type
         FROM network_connections nc
         JOIN stands s1 ON nc.from_stand_id = s1.id
         JOIN stands s2 ON nc.to_stand_id = s2.id`
      );

      // Build stands map
      this.stands.clear();
      stands.forEach(stand => {
        this.stands.set(stand.id, {
          id: stand.id,
          name: stand.name,
          latitude: parseFloat(stand.latitude),
          longitude: parseFloat(stand.longitude)
        });
      });

      // Build graph for Dijkstra algorithm
      const nodes = {};

      // Initialize all stands as nodes
      stands.forEach(stand => {
        nodes[stand.id] = {};
      });

      // Add connections (bidirectional)
      connections.forEach(conn => {
        const distance = this.calculateDistance(
          conn.from_lat, conn.from_lng, conn.to_lat, conn.to_lng
        );

        // Add bidirectional edges with distance as weight
        nodes[conn.from_stand_id][conn.to_stand_id] = distance;
        nodes[conn.to_stand_id][conn.from_stand_id] = distance;
      });

      this.graph = new Graph(nodes);
      this.lastUpdated = Date.now();

      console.log(`Network loaded: ${this.stands.size} stands, ${connections.length} connections`);

      // Debug: Check if graph has valid connections
      const nodeCount = Object.keys(nodes).length;
      let totalConnections = 0;
      Object.values(nodes).forEach(node => {
        totalConnections += Object.keys(node).length;
      });
      console.log(`Graph: ${nodeCount} nodes with ${totalConnections} total connections`);

      if (totalConnections === 0 && nodeCount > 1) {
        console.log('WARNING: Graph has no connections between nodes!');
      }

    } catch (error) {
      console.error('Error loading network data:', error);
      throw error;
    }
  }

  getStandById(id) {
    return this.stands.get(parseInt(id));
  }

  getAllStands() {
    return Array.from(this.stands.values());
  }

  getGraph() {
    return this.graph;
  }

  isNetworkLoaded() {
    return this.graph !== null && this.stands.size > 0;
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
    const distance = R * c;

    // Convert to minutes (assuming average speed of 20 km/h for rickshaws)
    return Math.round((distance / 20) * 60);
  }

  async findNearestStand(lat, lng) {
    let nearestStand = null;
    let minDistance = Infinity;

    this.stands.forEach(stand => {
      const distance = this.calculateDistance(
        lat, lng, stand.latitude, stand.longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestStand = stand;
      }
    });

    return nearestStand;
  }

  getNetworkStats() {
    return {
      standsCount: this.stands.size,
      lastUpdated: this.lastUpdated,
      isLoaded: this.isNetworkLoaded()
    };
  }

  clearCache() {
    this.graph = null;
    this.stands.clear();
    this.connections.clear();
    this.lastUpdated = null;
  }
}

module.exports = NetworkData;