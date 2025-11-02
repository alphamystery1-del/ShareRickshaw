const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const authMiddleware = require('../middleware/auth');

// Route calculation endpoints
router.post('/calculate', routeController.calculateRoute);
router.get('/autocomplete', routeController.autocomplete);

// Network management endpoints (admin only for now)
router.get('/network/stats', routeController.getNetworkStats);
router.post('/network/build', authMiddleware, routeController.buildNetwork);
router.delete('/cache', authMiddleware, routeController.clearCache);

// Health check endpoint
router.get('/health', routeController.healthCheck);

// Favorites endpoints (require authentication)
router.post('/favorites', authMiddleware, routeController.saveFavorite);
router.get('/favorites', authMiddleware, routeController.getFavorites);
router.delete('/favorites/:id', authMiddleware, routeController.deleteFavorite);

module.exports = router;