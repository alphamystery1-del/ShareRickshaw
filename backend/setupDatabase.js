#!/usr/bin/env node

/**
 * Database Setup Script for Enhanced Route Finder
 * Creates the necessary database tables and initializes sample data
 */

require('dotenv').config();
const db = require('./config/database');

async function setupDatabase() {
  console.log('🔧 Setting up ShareRickshaw Enhanced Database...');

  try {
    // Read and execute the schema
    const fs = require('fs');
    const schemaPath = './database/schema.sql';

    if (fs.existsSync(schemaPath)) {
      console.log('📋 Executing schema.sql...');
      const schema = fs.readFileSync(schemaPath, 'utf8');

      // Split schema into individual statements
      const statements = schema
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

      for (const statement of statements) {
        try {
          await db.query(statement);
          console.log(`   ✅ Executed: ${statement.substring(0, 50)}...`);
        } catch (error) {
          if (error.code !== 'ER_TABLE_EXISTS_ERROR' && error.code !== 'ER_DUP_KEYNAME') {
            console.log(`   ⚠️  Warning: ${error.message}`);
          }
        }
      }
    }

    // Insert sample stands if none exist
    console.log('📍 Checking for sample stands...');
    const [stands] = await db.query('SELECT COUNT(*) as count FROM stands');

    if (stands[0].count === 0) {
      console.log('   Inserting sample Mumbai stands...');
      const sampleStands = [
        ['Andheri Station', 19.1197, 72.8465, '6:00 AM - 11:00 PM'],
        ['Bandra Station', 19.0760, 72.8777, '6:00 AM - 11:00 PM'],
        ['Goregaon Station', 19.1661, 72.8576, '6:00 AM - 11:00 PM'],
        ['Borivali Station', 19.2307, 72.8567, '6:00 AM - 11:00 PM'],
        ['Dadar Station', 19.0208, 72.8426, '6:00 AM - 11:00 PM'],
        ['Churchgate Station', 18.9333, 72.8266, '6:00 AM - 11:00 PM'],
        ['Chhatrapati Shivaji Terminus', 19.0760, 72.8777, '6:00 AM - 11:00 PM'],
        ['Kurla Station', 19.0728, 72.8807, '6:00 AM - 11:00 PM'],
        ['Vikhroli Station', 19.1194, 72.9336, '6:00 AM - 11:00 PM'],
        ['Ghatkopar Station', 19.0833, 72.9086, '6:00 AM - 11:00 PM']
      ];

      for (const [name, lat, lng, hours] of sampleStands) {
        await db.query(
          'INSERT INTO stands (name, latitude, longitude, operating_hours) VALUES (?, ?, ?, ?)',
          [name, lat, lng, hours]
        );
      }
      console.log(`   ✅ Inserted ${sampleStands.length} sample stands`);
    } else {
      console.log(`   ✅ Found ${stands[0].count} existing stands`);
    }

    // Insert sample routes if none exist
    console.log('🛣️ Checking for sample routes...');
    const [routes] = await db.query('SELECT COUNT(*) as count FROM routes');

    if (routes[0].count === 0) {
      console.log('   Inserting sample routes...');
      const sampleRoutes = [
        [1, 'Linking Road', 25.50, '25 min', 19.0582, 72.8280],
        [1, 'Bandra-Worli Sea Link', 45.00, '35 min', 19.0176, 72.8189],
        [2, 'CST', 35.00, '30 min', 18.9402, 72.8421],
        [3, 'Infiniti Mall', 20.00, '15 min', 19.1585, 72.8428],
        [4, 'Dahisar Check Naka', 40.00, '40 min', 19.2523, 72.8578],
        [5, 'Siddhivinayak Temple', 30.00, '20 min', 19.0190, 72.8305],
        [6, 'Marine Drive', 25.00, '20 min', 18.9452, 72.8210],
        [8, 'Phoenix Marketcity', 25.00, '20 min', 19.0701, 72.8993]
      ];

      for (const [standId, destination, fare, time, destLat, destLng] of sampleRoutes) {
        await db.query(
          'INSERT INTO routes (stand_id, destination, fare, travel_time, destination_lat, destination_lng) VALUES (?, ?, ?, ?, ?, ?)',
          [standId, destination, fare, time, destLat, destLng]
        );
      }
      console.log(`   ✅ Inserted ${sampleRoutes.length} sample routes`);
    } else {
      console.log(`   ✅ Found ${routes[0].count} existing routes`);
    }

    // Build initial network connections
    console.log('🔗 Building network connections...');
    const NetworkBuilder = require('./services/NetworkBuilder');
    const networkBuilder = new NetworkBuilder();

    try {
      const connectionsCount = await networkBuilder.buildInitialNetwork();
      console.log(`   ✅ Built ${connectionsCount} network connections`);
    } catch (error) {
      console.log(`   ⚠️  Network building issue: ${error.message}`);
      console.log('   ℹ️  You can build the network later using the API endpoint');
    }

    console.log('\n🎉 Database setup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Start the backend server: npm start');
    console.log('2. Open route-finder.html in your browser');
    console.log('3. Test the enhanced route finder');

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run setup
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };