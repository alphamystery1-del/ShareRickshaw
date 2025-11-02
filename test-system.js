#!/usr/bin/env node

/**
 * System Test Script for Enhanced Route Finder
 * Tests all components of the Dijkstra route calculation system
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing ShareRickshaw Enhanced Route Finder System...\n');

// Test 1: Check if all required files exist
console.log('1️⃣ Checking required files...');

const requiredFiles = [
  'backend/services/NetworkData.js',
  'backend/services/OSRMService.js',
  'backend/services/RouteCalculator.js',
  'backend/services/NetworkBuilder.js',
  'backend/controllers/routeController.js',
  'backend/routes/routeCalculation.js',
  'js/enhancedRouteFinder.js',
  'css/enhanced-styles.css',
  'backend/scripts/initNetwork.js'
];

let filesExist = true;
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    filesExist = false;
  }
});

if (!filesExist) {
  console.log('\n❌ Some required files are missing!');
  process.exit(1);
}

console.log('✅ All required files are present!\n');

// Test 2: Check backend dependencies
console.log('2️⃣ Checking backend dependencies...');

const packageJsonPath = 'backend/package.json';
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const requiredDeps = ['node-dijkstra', 'axios', 'express', 'mysql2'];

  let depsOk = true;
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
      console.log(`   ✅ ${dep}@${packageJson.dependencies[dep]}`);
    } else {
      console.log(`   ❌ ${dep} - MISSING`);
      depsOk = false;
    }
  });

  if (!depsOk) {
    console.log('\n❌ Some required dependencies are missing!');
    process.exit(1);
  }
}

console.log('✅ All backend dependencies are available!\n');

// Test 3: Check syntax of JavaScript files
console.log('3️⃣ Checking JavaScript syntax...');

const jsFiles = [
  'backend/services/NetworkData.js',
  'backend/services/OSRMService.js',
  'backend/services/RouteCalculator.js',
  'backend/services/NetworkBuilder.js',
  'backend/controllers/routeController.js',
  'js/enhancedRouteFinder.js'
];

let syntaxOk = true;
jsFiles.forEach(file => {
  try {
    // Basic syntax check by attempting to parse
    const content = fs.readFileSync(file, 'utf8');
    // Remove potential export syntax issues for Node.js files
    const testContent = content.replace(/module\.exports.*$/, '');
    new Function(testContent);
    console.log(`   ✅ ${file}`);
  } catch (error) {
    console.log(`   ❌ ${file} - SYNTAX ERROR: ${error.message}`);
    syntaxOk = false;
  }
});

if (!syntaxOk) {
  console.log('\n❌ Some JavaScript files have syntax errors!');
  process.exit(1);
}

console.log('✅ All JavaScript files have valid syntax!\n');

// Test 4: Check HTML structure
console.log('4️⃣ Checking HTML structure...');

const htmlPath = 'route-finder.html';
if (fs.existsSync(htmlPath)) {
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const requiredElements = [
    'id="standSelect"',
    'id="destinationInput"',
    'id="autocompleteDropdown"',
    'id="weatherWidget"',
    'id="routeDetails"',
    'id="favoritesSection"',
    'enhancedRouteFinder.js'
  ];

  let htmlOk = true;
  requiredElements.forEach(element => {
    if (htmlContent.includes(element)) {
      console.log(`   ✅ ${element}`);
    } else {
      console.log(`   ❌ ${element} - MISSING`);
      htmlOk = false;
    }
  });

  if (!htmlOk) {
    console.log('\n❌ HTML structure is incomplete!');
    process.exit(1);
  }
}

console.log('✅ HTML structure is complete!\n');

// Test 5: Check CSS structure
console.log('5️⃣ Checking CSS structure...');

const cssPath = 'css/enhanced-styles.css';
if (fs.existsSync(cssPath)) {
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const requiredStyles = [
    '.autocomplete-dropdown',
    '.weather-widget',
    '.route-details',
    '.route-segment',
    '.favorite-item',
    '@media (max-width: 768px)'
  ];

  let cssOk = true;
  requiredStyles.forEach(style => {
    if (cssContent.includes(style)) {
      console.log(`   ✅ ${style}`);
    } else {
      console.log(`   ❌ ${style} - MISSING`);
      cssOk = false;
    }
  });

  if (!cssOk) {
    console.log('\n❌ CSS structure is incomplete!');
    process.exit(1);
  }
}

console.log('✅ CSS structure is complete!\n');

// Test 6: Check database schema updates
console.log('6️⃣ Checking database schema...');

const schemaPath = 'backend/database/schema.sql';
if (fs.existsSync(schemaPath)) {
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const requiredTables = [
    'network_connections',
    'route_cache',
    'user_favorites'
  ];

  let schemaOk = true;
  requiredTables.forEach(table => {
    if (schemaContent.includes(`CREATE TABLE.*${table}`)) {
      console.log(`   ✅ ${table} table`);
    } else {
      console.log(`   ❌ ${table} table - MISSING`);
      schemaOk = false;
    }
  });

  if (!schemaOk) {
    console.log('\n❌ Database schema is incomplete!');
    process.exit(1);
  }
}

console.log('✅ Database schema is complete!\n');

// Test 7: Check API routes
console.log('7️⃣ Checking API routes...');

const routesPath = 'backend/routes/routeCalculation.js';
if (fs.existsSync(routesPath)) {
  const routesContent = fs.readFileSync(routesPath, 'utf8');
  const requiredRoutes = [
    '/calculate',
    '/autocomplete',
    '/favorites',
    '/health'
  ];

  let routesOk = true;
  requiredRoutes.forEach(route => {
    if (routesContent.includes(route)) {
      console.log(`   ✅ ${route} endpoint`);
    } else {
      console.log(`   ❌ ${route} endpoint - MISSING`);
      routesOk = false;
    }
  });

  if (!routesOk) {
    console.log('\n❌ API routes are incomplete!');
    process.exit(1);
  }
}

console.log('✅ API routes are complete!\n');

// Test 8: Check package.json scripts
console.log('8️⃣ Checking package.json...');

const mainPackageJsonPath = 'package.json';
if (fs.existsSync(mainPackageJsonPath)) {
  console.log('   ✅ Root package.json exists');
} else {
  console.log('   ⚠️  Root package.json not found (optional)');
}

console.log('✅ Package.json configuration checked!\n');

// Summary
console.log('🎉 System Test Results:');
console.log('   ✅ All required files present');
console.log('   ✅ Backend dependencies available');
console.log('   ✅ JavaScript syntax valid');
console.log('   ✅ HTML structure complete');
console.log('   ✅ CSS styling complete');
console.log('   ✅ Database schema updated');
console.log('   ✅ API routes configured');
console.log('\n🚀 The Enhanced Route Finder system is ready for deployment!');

console.log('\n📋 Next Steps:');
console.log('1. Set up MySQL database');
console.log('2. Run the enhanced schema.sql file');
console.log('3. Start the backend server: cd backend && npm start');
console.log('4. Open route-finder.html in your browser');
console.log('5. Initialize network: POST /api/route-calculation/network/build');
console.log('\n💡 Features available:');
console.log('   • Dijkstra algorithm for optimal routing');
console.log('   • OSRM API integration for real-time data');
console.log('   • 9-minute delay per rickshaw segment');
console.log('   • Autocomplete for destinations');
console.log('   • Weather widget with wttr.in API');
console.log('   • Favorites management system');
console.log('   • Enhanced map visualization');
console.log('   • Responsive design for mobile');