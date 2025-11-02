// Mumbai Share Auto - Map Page JavaScript

// API Base URL is now accessed globally from js/auth.js

// Global variables
let map;
let markers = {};
let standsData = [];
let routeLayers = []; // Store route visualization layers

// --- FIX: Leaflet default icon path issue (Moved outside DOMContentLoaded) ---
// This ensures the icon paths are fixed immediately after the Leaflet library loads.
if (typeof L !== "undefined") {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}
// ------------------------------------------

// Initialize on page load
document.addEventListener("DOMContentLoaded", function () {
  // Check if user is logged in
  if (!requireAuth()) {
    return;
  }

  initMap();
  fetchStands();
  setupSearch();
});

// 1. Initialize Leaflet map
function initMap() {
  // Create map centered on Mumbai
  map = L.map("map").setView([19.076, 72.8777], 12);

  // Add OpenStreetMap tile layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    minZoom: 11,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);
}

// 2. Fetch stands data from API
async function fetchStands() {
  try {
    const response = await fetch(`${API_BASE_URL}/stands`);
    const data = await response.json();

    if (data.success) {
      standsData = data.stands;
      hideLoadingSpinner();
      createMarkers(standsData);
      createStandCards(standsData);
      fitMapToMarkers();
    } else {
      throw new Error("Failed to load stands");
    }
  } catch (error) {
    hideLoadingSpinner();
    showError("Failed to load stands. Please refresh the page.");
    console.error("Error fetching stands:", error);
  }
}

// 3. Create markers for all stands
function createMarkers(stands) {
  stands.forEach((stand) => {
    const marker = L.marker([stand.latitude, stand.longitude])
      .bindPopup(createPopupContent(stand))
      .addTo(map);

    // Store marker reference
    markers[stand.id] = marker;

    // Click handler: zoom to marker
    marker.on("click", function () {
      map.flyTo([stand.latitude, stand.longitude], 15, {
        duration: 0.5,
      });
    });
  });
}

// 4. Create popup HTML content
function createPopupContent(stand) {
  const maxRoutes = 5;
  const displayRoutes = stand.routes.slice(0, maxRoutes);
  const remainingCount = stand.routes.length - maxRoutes;

  let routesList = displayRoutes
    .map(
      (route) =>
        `<li>${route.destination} → ₹${route.fare} | ${route.travel_time}</li>`
    )
    .join("");

  let moreText =
    remainingCount > 0
      ? `<p class="popup-more-routes">+ ${remainingCount} more routes</p>`
      : "";

  return `
    <div class="stand-popup">
      <h3 class="popup-title">${stand.name}</h3>
      <p class="popup-hours">🕒 ${stand.operating_hours}</p>
      <h4 class="popup-routes-heading">Available Routes:</h4>
      <ul class="popup-routes-list">
        ${routesList}
      </ul>
      ${moreText}
    </div>
  `;
}

// 5. Create stand cards in list section
function createStandCards(stands) {
  const grid = document.getElementById("stands-grid");
  grid.innerHTML = "";

  stands.forEach((stand) => {
    const card = document.createElement("div");
    card.className = "stand-card";
    card.dataset.standId = stand.id;

    card.innerHTML = `
      <h3 class="card-title">${stand.name}</h3>
      <p class="card-routes-count">${stand.routes.length} routes available</p>
      <p class="card-hours">🕒 ${stand.operating_hours}</p>
      <button class="btn-view-map" data-stand-id="${stand.id}">View on Map</button>
    `;

    // Card click handler
    card.addEventListener("click", function () {
      focusMarker(stand.id);
    });

    // Button click handler (same as card)
    const button = card.querySelector(".btn-view-map");
    button.addEventListener("click", function (e) {
      e.stopPropagation();
      focusMarker(stand.id);
    });

    grid.appendChild(card);
  });
}

// 6. Focus marker on map (from card click)
function focusMarker(standId) {
  // Scroll to map
  document.getElementById("map").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });

  // Trigger marker click after scroll
  setTimeout(() => {
    markers[standId].fire("click");
  }, 500);
}

// 7. Fit map bounds to show all markers
function fitMapToMarkers() {
  if (Object.keys(markers).length === 0) return;

  const group = L.featureGroup(Object.values(markers));
  map.fitBounds(group.getBounds(), { padding: [50, 50] });
}

// 8. Setup search functionality
function setupSearch() {
  const searchInput = document.getElementById("search-input");
  let debounceTimer;

  searchInput.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      performSearch(searchInput.value);
    }, 500);
  });
}

// 9. Perform search filtering
function performSearch(searchTerm) {
  const term = searchTerm.toLowerCase().trim();
  const heading = document.getElementById("stands-heading");
  const noResults = document.getElementById("no-results");
  const grid = document.getElementById("stands-grid");

  if (term === "") {
    // Show all
    showAllStands();
    heading.textContent = "All Stands";
    noResults.style.display = "none";
    grid.style.display = "grid";
    return;
  }

  let matchCount = 0;

  standsData.forEach((stand) => {
    // Check if stand name or any route matches
    const nameMatch = stand.name.toLowerCase().includes(term);
    const routeMatch = stand.routes.some((route) =>
      route.destination.toLowerCase().includes(term)
    );

    const isMatch = nameMatch || routeMatch;

    if (isMatch) {
      matchCount++;
      // Show marker
      if (!map.hasLayer(markers[stand.id])) {
        markers[stand.id].addTo(map);
      }
      // Show card
      const card = document.querySelector(
        `.stand-card[data-stand-id="${stand.id}"]`
      );
      if (card) card.style.display = "block";
    } else {
      // Hide marker
      map.removeLayer(markers[stand.id]);
      // Hide card
      const card = document.querySelector(
        `.stand-card[data-stand-id="${stand.id}"]`
      );
      if (card) card.style.display = "none";
    }
  });

  // Update heading
  heading.textContent = `Showing ${matchCount} of ${standsData.length} stands`;

  // Show/hide no results message
  if (matchCount === 0) {
    noResults.style.display = "block";
    grid.style.display = "none";
  } else {
    noResults.style.display = "none";
    grid.style.display = "grid";

    // Fit map to visible markers
    const visibleMarkers = Object.entries(markers)
      .filter(([id, marker]) => map.hasLayer(marker))
      .map(([id, marker]) => marker);

    if (visibleMarkers.length > 0) {
      const group = L.featureGroup(visibleMarkers);
      map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
  }
}

// 10. Show all stands (clear search)
function showAllStands() {
  standsData.forEach((stand) => {
    // Show all markers
    if (!map.hasLayer(markers[stand.id])) {
      markers[stand.id].addTo(map);
    }
    // Show all cards
    const card = document.querySelector(
      `.stand-card[data-stand-id="${stand.id}"]`
    );
    if (card) card.style.display = "block";
  });

  fitMapToMarkers();
}

// 11. Hide loading spinner
function hideLoadingSpinner() {
  const spinner = document.getElementById("loading-spinner");
  if (spinner) spinner.style.display = "none";
}

// 12. Show error message
function showError(message) {
  const mapDiv = document.getElementById("map");
  mapDiv.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center;">
      <p style="font-size: 18px; color: #d32f2f;">${message}</p>
    </div>
  `;
}

// ============================================
// Enhanced Route Visualization Functions
// ============================================

// 13. Display route on map (for enhanced route finder)
function displayRouteOnMap(route) {
  if (!map || !route) return;

  // Clear existing route layers
  clearRouteLayers();

  try {
    // Collect all route coordinates
    const allCoordinates = [];

    // Process each segment
    route.segments.forEach((segment, index) => {
      if (segment.geometry && segment.geometry.coordinates) {
        // OSRM returns coordinates in [lng, lat] format, Leaflet needs [lat, lng]
        const segmentCoordinates = segment.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        allCoordinates.push(...segmentCoordinates);

        // Create segment-specific styling
        const segmentColor = segment.type === 'rickshaw' ? '#ff6b6b' : '#4285f4';
        const segmentWeight = segment.type === 'rickshaw' ? 4 : 3;

        // Draw segment polyline
        const polyline = L.polyline(segmentCoordinates, {
          color: segmentColor,
          weight: segmentWeight,
          opacity: 0.8,
          smoothFactor: 1
        }).addTo(map);

        // Add popup for segment
        const segmentInfo = createSegmentPopupContent(segment, index + 1);
        polyline.bindPopup(segmentInfo);

        routeLayers.push(polyline);

        // Add arrow markers to show direction
        addDirectionArrows(segmentCoordinates, segmentColor);
      }

      // Add markers for stands and transfer points
      if (segment.from_stand) {
        const marker = createRouteMarker(segment.from_stand, `Stand ${index + 1}`, 'stand');
        routeLayers.push(marker);
      }

      if (segment.to_stand && index === route.segments.length - 1) {
        const marker = createRouteMarker(segment.to_stand, `Destination Stand`, 'destination');
        routeLayers.push(marker);
      }
    });

    // Add destination marker if coordinates are available
    if (route.to_destination && route.to_destination.latitude && route.to_destination.longitude) {
      const destMarker = createRouteMarker(
        {
          latitude: route.to_destination.latitude,
          longitude: route.to_destination.longitude,
          name: route.to_destination.name
        },
        'Final Destination',
        'final-destination'
      );
      routeLayers.push(destMarker);
    }

    // Fit map to route bounds with padding
    if (allCoordinates.length > 0) {
      const routeBounds = L.latLngBounds(allCoordinates);
      map.fitBounds(routeBounds, {
        padding: [50, 50],
        maxZoom: 16
      });
    }

    console.log(`Route displayed with ${routeLayers.length} layers`);

  } catch (error) {
    console.error('Error displaying route on map:', error);
  }
}

// 14. Create popup content for route segments
function createSegmentPopupContent(segment, segmentNumber) {
  const segmentType = segment.type === 'rickshaw' ? '🛺 Rickshaw' : '🚶 Walking';
  const delayInfo = segment.delay ? `<br><small>⏱️ Includes ${segment.delay} min delay</small>` : '';

  return `
    <div class="route-segment-popup">
      <strong>Segment ${segmentNumber}: ${segmentType}</strong><br>
      <strong>From:</strong> ${segment.from_stand ? segment.from_stand.name : 'Current location'}<br>
      <strong>To:</strong> ${segment.to_stand ? segment.to_stand.name : segment.to_destination.name}<br>
      <strong>Time:</strong> ${segment.time} minutes${delayInfo}<br>
      <strong>Distance:</strong> ${segment.distance.toFixed(1)} km
    </div>
  `;
}

// 15. Create markers for route visualization
function createRouteMarker(location, title, type) {
  const iconOptions = {
    'stand': {
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    },
    'destination': {
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    },
    'final-destination': {
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    }
  };

  const icon = L.icon(iconOptions[type] || iconOptions['stand']);

  const marker = L.marker([location.latitude, location.longitude], { icon: icon })
    .bindPopup(`<strong>${title}</strong><br>${location.name}`);

  marker.addTo(map);
  return marker;
}

// 16. Add direction arrows to show route flow
function addDirectionArrows(coordinates, color) {
  if (coordinates.length < 2) return;

  // Add arrows at regular intervals
  const arrowInterval = Math.max(1, Math.floor(coordinates.length / 5)); // Max 5 arrows per segment

  for (let i = arrowInterval; i < coordinates.length; i += arrowInterval) {
    if (i < coordinates.length - 1) {
      const start = coordinates[i];
      const end = coordinates[Math.min(i + 1, coordinates.length - 1)];

      // Calculate arrow direction
      const angle = Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI;

      const arrowIcon = L.divIcon({
        html: `<div style="
          color: ${color};
          font-size: 16px;
          font-weight: bold;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
          transform: rotate(${angle}deg);
        ">▶</div>`,
        className: 'route-arrow',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      const arrowMarker = L.marker(start, { icon: arrowIcon }).addTo(map);
      routeLayers.push(arrowMarker);
    }
  }
}

// 17. Clear all route layers
function clearRouteLayers() {
  routeLayers.forEach(layer => {
    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });
  routeLayers = [];
}

// 18. Highlight specific stand in route
function highlightStandInRoute(standId) {
  if (!markers[standId]) return;

  // Create pulsing effect for the stand marker
  const originalIcon = markers[standId].getIcon();
  const highlightIcon = L.icon({
    ...originalIcon.options,
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png'
  });

  markers[standId].setIcon(highlightIcon);
  markers[standId].openPopup();

  // Reset icon after 3 seconds
  setTimeout(() => {
    markers[standId].setIcon(originalIcon);
  }, 3000);
}

// 19. Animate route drawing (progressive reveal)
function animateRouteDrawing(route) {
  if (!map || !route) return;

  clearRouteLayers();
  let currentSegment = 0;

  function drawNextSegment() {
    if (currentSegment >= route.segments.length) return;

    const segment = route.segments[currentSegment];
    if (segment.geometry && segment.geometry.coordinates) {
      const segmentCoordinates = segment.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const segmentColor = segment.type === 'rickshaw' ? '#ff6b6b' : '#4285f4';

      // Animate the polyline drawing
      const polyline = L.polyline(segmentCoordinates, {
        color: segmentColor,
        weight: 4,
        opacity: 0,
        smoothFactor: 1
      }).addTo(map);

      // Fade in the segment
      setTimeout(() => {
        polyline.setStyle({ opacity: 0.8 });
      }, 100);

      routeLayers.push(polyline);

      // Add stand marker
      if (segment.from_stand) {
        const marker = createRouteMarker(segment.from_stand, `Stand ${currentSegment + 1}`, 'stand');
        routeLayers.push(marker);
      }
    }

    currentSegment++;

    // Draw next segment after delay
    if (currentSegment < route.segments.length) {
      setTimeout(drawNextSegment, 800);
    } else {
      // Final destination marker
      if (route.to_destination && route.to_destination.latitude) {
        const destMarker = createRouteMarker(
          {
            latitude: route.to_destination.latitude,
            longitude: route.to_destination.longitude,
            name: route.to_destination.name
          },
          'Final Destination',
          'final-destination'
        );
        routeLayers.push(destMarker);
      }

      // Fit map bounds after animation
      setTimeout(() => {
        displayRouteOnMap(route); // This will fit bounds
      }, 1000);
    }
  }

  drawNextSegment();
}

// 20. Export route as GPX (for external navigation apps)
function exportRouteAsGPX(route) {
  if (!route) return;

  let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Mumbai Share Auto Finder">
  <trk>
    <name>${route.from_stand.name} to ${route.to_destination.name}</name>
    <trkseg>`;

  route.segments.forEach(segment => {
    if (segment.geometry && segment.geometry.coordinates) {
      segment.geometry.coordinates.forEach(coord => {
        gpxContent += `
      <trkpt lat="${coord[1]}" lon="${coord[0]}"></trkpt>`;
      });
    }
  });

  gpxContent += `
    </trkseg>
  </trk>
</gpx>`;

  // Create download link
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `route_${route.from_stand.name.replace(/\s+/g, '_')}_to_${route.to_destination.name.replace(/\s+/g, '_')}.gpx`;
  link.click();
  URL.revokeObjectURL(url);
}

// Make functions globally available for enhanced route finder
window.displayRouteOnMap = displayRouteOnMap;
window.clearRouteLayers = clearRouteLayers;
window.highlightStandInRoute = highlightStandInRoute;
window.animateRouteDrawing = animateRouteDrawing;
window.exportRouteAsGPX = exportRouteAsGPX;
