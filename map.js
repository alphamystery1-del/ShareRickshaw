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
