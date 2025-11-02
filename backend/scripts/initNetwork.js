#!/usr/bin/env node

/**
 * Network Initialization Script
 * Initializes the ShareRickshaw network with sample data
 */

require('dotenv').config();
const NetworkBuilder = require('../services/NetworkBuilder');

async function initializeNetwork() {
  console.log('🚀 Initializing ShareRickshaw Network...');

  try {
    const networkBuilder = new NetworkBuilder();

    // Build initial network connections
    console.log('📡 Building network connections...');
    const connectionsCount = await networkBuilder.buildInitialNetwork();
    console.log(`✅ Built ${connectionsCount} network connections`);

    // Get network statistics
    console.log('📊 Getting network statistics...');
    const stats = await networkBuilder.getNetworkStatistics();
    console.log('Network Statistics:', stats);

    // Validate network connectivity
    console.log('🔍 Validating network connectivity...');
    const connectivity = await networkBuilder.validateNetworkConnectivity();
    console.log('Connectivity Validation:', connectivity);

    console.log('🎉 Network initialization completed successfully!');

  } catch (error) {
    console.error('❌ Network initialization failed:', error);
    process.exit(1);
  }
}

// Run initialization
if (require.main === module) {
  initializeNetwork();
}

module.exports = { initializeNetwork };