const RouteCalculator = require('../services/RouteCalculator');
const NetworkBuilder = require('../services/NetworkBuilder');
const db = require('../config/database');

class RouteController {
  constructor() {
    this.routeCalculator = new RouteCalculator();
    this.networkBuilder = new NetworkBuilder();
  }

  // Main route calculation endpoint
  async calculateRoute(req, res) {
    try {
      const { from_stand_id, to_lat, to_lng, to_address } = req.body;

      // Validation
      if (!from_stand_id || !to_lat || !to_lng) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: from_stand_id, to_lat, to_lng'
        });
      }

      // Validate coordinates
      const lat = parseFloat(to_lat);
      const lng = parseFloat(to_lng);
      const standId = parseInt(from_stand_id);

      if (isNaN(lat) || isNaN(lng) || isNaN(standId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid coordinates or stand ID'
        });
      }

      // Validate Mumbai coordinates
      if (lat < 18.8 || lat > 19.3 || lng < 72.7 || lng > 73.0) {
        return res.status(400).json({
          success: false,
          message: 'Coordinates must be within Mumbai area'
        });
      }

      console.log(`Route calculation request: stand ${standId} to ${lat}, ${lng}`);

      // Calculate route
      const route = await this.routeCalculator.findOptimalRoute(
        standId,
        { lat, lng },
        to_address
      );

      res.json({
        success: true,
        route: route
      });

    } catch (error) {
      console.error('Route calculation error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to calculate route'
      });
    }
  }

  // Autocomplete endpoint for stand names and destinations
  async autocomplete(req, res) {
    try {
      const { q, limit = 5 } = req.query;

      if (!q || q.trim().length < 2) {
        return res.json({
          success: true,
          suggestions: []
        });
      }

      const searchTerm = q.trim();
      const limitInt = Math.min(parseInt(limit), 10); // Max 10 suggestions

      // Search stands by name
      const [standResults] = await db.query(
        `SELECT id, name, latitude, longitude, 'stand' as type
         FROM stands
         WHERE name LIKE ?
         ORDER BY
           CASE WHEN name LIKE ? THEN 1 ELSE 2 END,
           LENGTH(name),
           name
         LIMIT ?`,
        [`%${searchTerm}%`, `${searchTerm}%`, limitInt]
      );

      // Search destinations by name from routes
      const [routeResults] = await db.query(
        `SELECT DISTINCT destination as name, destination_lat as latitude,
                destination_lng as longitude, 'destination' as type
         FROM routes
         WHERE destination LIKE ?
         ORDER BY
           CASE WHEN destination LIKE ? THEN 1 ELSE 2 END,
           LENGTH(destination),
           destination
         LIMIT ?`,
        [`%${searchTerm}%`, `${searchTerm}%`, limitInt]
      );

      // Combine and limit results
      const suggestions = [...standResults, ...routeResults]
        .slice(0, limitInt)
        .map(item => ({
          id: item.id || null,
          name: item.name,
          latitude: parseFloat(item.latitude),
          longitude: parseFloat(item.longitude),
          type: item.type
        }));

      res.json({
        success: true,
        suggestions: suggestions
      });

    } catch (error) {
      console.error('Autocomplete error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get suggestions'
      });
    }
  }

  // Save favorite route
  async saveFavorite(req, res) {
    try {
      const { from_stand_id, to_destination, to_lat, to_lng, nickname } = req.body;
      const userId = req.user?.id; // Assuming user ID from auth middleware

      // Validation
      if (!from_stand_id || !to_destination || !to_lat || !to_lng) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: from_stand_id, to_destination, to_lat, to_lng'
        });
      }

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Check if favorite already exists
      const [existing] = await db.query(
        `SELECT id FROM user_favorites
         WHERE user_id = ? AND from_stand_id = ? AND to_destination = ?
         LIMIT 1`,
        [userId, from_stand_id, to_destination]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Favorite already exists'
        });
      }

      // Insert new favorite
      const [result] = await db.query(
        `INSERT INTO user_favorites
         (user_id, from_stand_id, to_destination, to_lat, to_lng, nickname)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, from_stand_id, to_destination, to_lat, to_lng, nickname || null]
      );

      res.json({
        success: true,
        favorite_id: result.insertId,
        message: 'Favorite saved successfully'
      });

    } catch (error) {
      console.error('Save favorite error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to save favorite'
      });
    }
  }

  // Get user favorites
  async getFavorites(req, res) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const [favorites] = await db.query(
        `SELECT uf.id, uf.nickname, uf.to_destination, uf.to_lat, uf.to_lng,
                s.name as from_stand_name, s.latitude as from_lat, s.longitude as from_lng,
                uf.created_at
         FROM user_favorites uf
         JOIN stands s ON uf.from_stand_id = s.id
         WHERE uf.user_id = ?
         ORDER BY uf.created_at DESC`,
        [userId]
      );

      const formattedFavorites = favorites.map(fav => ({
        id: fav.id,
        nickname: fav.nickname || `${fav.from_stand_name} to ${fav.to_destination}`,
        from_stand: {
          id: fav.from_stand_name, // We'll use name as ID for simplicity
          name: fav.from_stand_name,
          latitude: parseFloat(fav.from_lat),
          longitude: parseFloat(fav.from_lng)
        },
        to_destination: {
          name: fav.to_destination,
          latitude: parseFloat(fav.to_lat),
          longitude: parseFloat(fav.to_lng)
        },
        created_at: fav.created_at
      }));

      res.json({
        success: true,
        favorites: formattedFavorites
      });

    } catch (error) {
      console.error('Get favorites error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get favorites'
      });
    }
  }

  // Delete favorite
  async deleteFavorite(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const [result] = await db.query(
        'DELETE FROM user_favorites WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Favorite not found'
        });
      }

      res.json({
        success: true,
        message: 'Favorite deleted successfully'
      });

    } catch (error) {
      console.error('Delete favorite error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete favorite'
      });
    }
  }

  // Get network statistics
  async getNetworkStats(req, res) {
    try {
      const stats = await this.routeCalculator.getRouteStatistics();
      const networkStats = await this.networkBuilder.getNetworkStatistics();
      const connectivity = await this.networkBuilder.validateNetworkConnectivity();

      res.json({
        success: true,
        statistics: {
          ...stats,
          network: networkStats,
          connectivity: connectivity
        }
      });

    } catch (error) {
      console.error('Get network stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get network statistics'
      });
    }
  }

  // Build or update network
  async buildNetwork(req, res) {
    try {
      const { rebuild = false } = req.body;

      if (rebuild) {
        const connectionsCount = await this.networkBuilder.buildInitialNetwork();
        res.json({
          success: true,
          message: 'Network rebuilt successfully',
          connections: connectionsCount
        });
      } else {
        await this.networkBuilder.updateNetworkConnections();
        res.json({
          success: true,
          message: 'Network updated successfully'
        });
      }

    } catch (error) {
      console.error('Build network error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to build network'
      });
    }
  }

  // Clear route cache
  async clearCache(req, res) {
    try {
      await this.routeCalculator.clearExpiredCache();
      res.json({
        success: true,
        message: 'Cache cleared successfully'
      });

    } catch (error) {
      console.error('Clear cache error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear cache'
      });
    }
  }

  // Health check for route services
  async healthCheck(req, res) {
    try {
      const osrmHealth = await this.routeCalculator.osrmService.healthCheck();
      const networkStats = await this.networkBuilder.getNetworkStatistics();

      res.json({
        success: true,
        status: 'healthy',
        services: {
          osrm: osrmHealth,
          network: {
            loaded: networkStats && networkStats.total_stands > 0,
            connectivity: networkStats ? networkStats.connectivity_percentage : 0
          }
        }
      });

    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        message: error.message
      });
    }
  }
}

// Export controller methods
const routeController = new RouteController();

module.exports = {
  calculateRoute: (req, res) => routeController.calculateRoute(req, res),
  autocomplete: (req, res) => routeController.autocomplete(req, res),
  saveFavorite: (req, res) => routeController.saveFavorite(req, res),
  getFavorites: (req, res) => routeController.getFavorites(req, res),
  deleteFavorite: (req, res) => routeController.deleteFavorite(req, res),
  getNetworkStats: (req, res) => routeController.getNetworkStats(req, res),
  buildNetwork: (req, res) => routeController.buildNetwork(req, res),
  clearCache: (req, res) => routeController.clearCache(req, res),
  healthCheck: (req, res) => routeController.healthCheck(req, res)
};