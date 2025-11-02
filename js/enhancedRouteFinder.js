// ============================================
// Enhanced Route Finder JavaScript
// Mumbai Share Auto Finder with Dijkstra Algorithm
// ============================================

// Global Variables
let standsData = [];
let favoritesData = [];
let recentSearches = [];
let currentRoute = null;
let weatherData = null;
const MAX_RECENT_SEARCHES = 3;
const AUTOCOMPLETE_DEBOUNCE = 300;

// API Configuration
const ROUTE_API_BASE_URL = window.API_BASE_URL || '/api';

// DOM Elements
let standSelect;
let destinationInput;
let findRouteBtn;
let resetBtn;
let resultsContainer;
let resultsHeader;
let routeDetailsContainer;
let routeCardsContainer;
let noResultsMessage;
let recentSearchesContainer;
let recentSearchesList;
let standError;
let destinationError;
let autocompleteDropdown;
let weatherWidget;
let favoritesSection;
let favoritesList;
let saveFavoriteBtn;

// Class: EnhancedRouteFinder
class EnhancedRouteFinder {
  constructor() {
    this.autocompleteTimeout = null;
    this.selectedDestination = null;
    this.weatherService = new WeatherService();
    this.favoritesManager = new FavoritesManager();
    this.mapService = null; // Will be initialized if map.js is available
  }

  async initialize() {
    console.log('Initializing Enhanced Route Finder...');

    // Check if user is logged in
    if (!requireAuth()) {
      return;
    }

    this.getDOMElements();
    this.setupEventListeners();
    await this.loadData();
    this.initializeMapIntegration();
  }

  getDOMElements() {
    standSelect = document.getElementById("standSelect");
    destinationInput = document.getElementById("destinationInput");
    findRouteBtn = document.getElementById("findRouteBtn");
    resetBtn = document.getElementById("resetBtn");
    resultsContainer = document.getElementById("resultsContainer");
    resultsHeader = document.getElementById("resultsHeader");
    routeDetailsContainer = document.getElementById("routeDetails");
    routeCardsContainer = document.getElementById("routeCardsContainer");
    noResultsMessage = document.getElementById("noResultsMessage");
    recentSearchesContainer = document.getElementById("recentSearchesContainer");
    recentSearchesList = document.getElementById("recentSearchesList");
    standError = document.getElementById("standError");
    destinationError = document.getElementById("destinationError");
    autocompleteDropdown = document.getElementById("autocompleteDropdown");
    weatherWidget = document.getElementById("weatherWidget");
    favoritesSection = document.getElementById("favoritesSection");
    favoritesList = document.getElementById("favoritesList");
    saveFavoriteBtn = document.getElementById("saveFavoriteBtn");
  }

  setupEventListeners() {
    // Main search functionality
    findRouteBtn.addEventListener("click", () => this.handleFindRoute());
    resetBtn.addEventListener("click", () => this.handleReset());

    // Enter key support
    destinationInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.handleFindRoute();
      }
    });

    // Autocomplete with debouncing
    destinationInput.addEventListener("input", (e) => {
      this.handleAutocomplete(e.target.value);
      this.clearErrorMessage("destination");
    });

    // Click outside autocomplete to close
    document.addEventListener("click", (e) => {
      if (!e.target.closest('.autocomplete-container')) {
        this.hideAutocomplete();
      }
    });

    // Stand change clears errors
    standSelect.addEventListener("change", () => {
      this.clearErrorMessage("stand");
    });

    // Save favorite button
    if (saveFavoriteBtn) {
      saveFavoriteBtn.addEventListener("click", () => this.saveCurrentRouteToFavorites());
    }
  }

  async loadData() {
    try {
      // Load stands data
      await this.fetchStands();

      // Load favorites if user is logged in
      if (window.isLoggedIn) {
        await this.favoritesManager.loadFavorites();
      }
    } catch (error) {
      console.error('Error loading data:', error);
      this.showError("Failed to load initial data. Please refresh the page.");
    }
  }

  async fetchStands() {
    try {
      const response = await fetch(`${ROUTE_API_BASE_URL}/stands`);
      if (!response.ok) {
        throw new Error("Failed to fetch stands");
      }
      const data = await response.json();
      if (data.success) {
        standsData = data.stands;
        this.populateStandDropdown(standsData);
      } else {
        throw new Error("Failed to load stands");
      }
    } catch (error) {
      console.error("Error fetching stands:", error);
      throw error;
    }
  }

  populateStandDropdown(stands) {
    standSelect.innerHTML = '<option value="">-- Select a Stand --</option>';

    const sortedStands = stands.slice().sort((a, b) => a.name.localeCompare(b.name));

    sortedStands.forEach((stand) => {
      const option = document.createElement("option");
      option.value = stand.id;
      option.textContent = stand.name;
      standSelect.appendChild(option);
    });
  }

  // Autocomplete functionality
  async handleAutocomplete(query) {
    clearTimeout(this.autocompleteTimeout);

    if (!query || query.trim().length < 2) {
      this.hideAutocomplete();
      return;
    }

    this.autocompleteTimeout = setTimeout(async () => {
      try {
        const response = await fetch(`${ROUTE_API_BASE_URL}/route-calculation/autocomplete?q=${encodeURIComponent(query)}&limit=5`);
        const data = await response.json();

        if (data.success) {
          this.showAutocomplete(data.suggestions);
        }
      } catch (error) {
        console.error('Autocomplete error:', error);
      }
    }, AUTOCOMPLETE_DEBOUNCE);
  }

  showAutocomplete(suggestions) {
    if (!suggestions || suggestions.length === 0) {
      this.hideAutocomplete();
      return;
    }

    const dropdown = autocompleteDropdown;
    dropdown.innerHTML = '';

    suggestions.forEach(suggestion => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML = `
        <span class="suggestion-name">${suggestion.name}</span>
        <span class="type-badge type-${suggestion.type}">${suggestion.type}</span>
      `;

      item.addEventListener('click', () => {
        this.selectAutocompleteItem(suggestion);
      });

      dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
  }

  hideAutocomplete() {
    autocompleteDropdown.style.display = 'none';
  }

  selectAutocompleteItem(suggestion) {
    destinationInput.value = suggestion.name;
    this.selectedDestination = suggestion;
    this.hideAutocomplete();
    this.clearErrorMessage("destination");
  }

  // Enhanced route calculation
  async handleFindRoute() {
    this.clearErrorMessages();

    const validation = this.validateInputs();
    if (!validation.isValid) {
      this.showValidationErrors(validation.errors);
      return;
    }

    this.setButtonLoading(true);

    try {
      const route = await this.calculateEnhancedRoute(validation.data);

      if (route) {
        this.displayEnhancedResults(route);
        this.addToRecentSearches(validation.data);

        // Get weather for destination
        await this.weatherService.getWeatherForLocation(
          route.to_destination.latitude,
          route.to_destination.longitude
        );

        currentRoute = route;
      } else {
        this.showNoResults();
      }
    } catch (error) {
      console.error('Route calculation error:', error);
      this.showError(`Failed to calculate route: ${error.message}`);
    } finally {
      this.setButtonLoading(false);
    }
  }

  validateInputs() {
    const errors = [];
    const selectedStandId = standSelect.value;
    const destinationValue = destinationInput.value.trim();

    if (!selectedStandId) {
      errors.push({ field: 'stand', message: 'Please select a stand' });
    }

    if (!destinationValue) {
      errors.push({ field: 'destination', message: 'Please enter a destination' });
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    const selectedStand = standsData.find(s => s.id === parseInt(selectedStandId));
    if (!selectedStand) {
      errors.push({ field: 'stand', message: 'Selected stand not found' });
      return { isValid: false, errors };
    }

    // Use selected destination from autocomplete or create destination object
    let destinationCoords;
    if (this.selectedDestination) {
      destinationCoords = {
        lat: this.selectedDestination.latitude,
        lng: this.selectedDestination.longitude,
        name: this.selectedDestination.name
      };
    } else {
      // For now, we'll need to geocode the destination string
      // In a real implementation, you'd use a geocoding service
      errors.push({ field: 'destination', message: 'Please select a destination from the suggestions' });
      return { isValid: false, errors };
    }

    return {
      isValid: true,
      data: {
        fromStand: selectedStand,
        toDestination: destinationCoords
      }
    };
  }

  showValidationErrors(errors) {
    errors.forEach(error => {
      this.showErrorMessage(error.field, error.message);
    });
  }

  async calculateEnhancedRoute(data) {
    const { fromStand, toDestination } = data;

    try {
      const response = await fetch(`${ROUTE_API_BASE_URL}/route-calculation/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_stand_id: fromStand.id,
          to_lat: toDestination.lat,
          to_lng: toDestination.lng,
          to_address: toDestination.name
        })
      });

      const result = await response.json();

      if (result.success) {
        return result.route;
      } else {
        throw new Error(result.message || 'Route calculation failed');
      }
    } catch (error) {
      console.error('API call error:', error);
      throw error;
    }
  }

  displayEnhancedResults(route) {
    resultsContainer.classList.add("show");
    routeCardsContainer.innerHTML = "";

    // Update results header
    resultsHeader.textContent = `Optimal Route Found`;

    // Show route details
    this.displayRouteDetails(route);

    // Show weather widget
    this.displayWeatherWidget();

    // Show route segments
    this.displayRouteSegments(route.segments);

    // Show favorites section
    this.displayFavoritesSection();

    // Update map if available
    if (this.mapService) {
      this.mapService.displayRouteOnMap(route);
    }
  }

  displayRouteDetails(route) {
    const summaryHtml = `
      <div class="route-summary">
        <div class="summary-item">
          <span class="label">Total Time:</span>
          <span id="totalTime" class="value">${route.total_time} min</span>
        </div>
        <div class="summary-item">
          <span class="label">Distance:</span>
          <span id="totalDistance" class="value">${route.total_distance.toFixed(1)} km</span>
        </div>
        <div class="summary-item">
          <span class="label">Segments:</span>
          <span id="segmentCount" class="value">${route.segment_count}</span>
        </div>
        <div class="summary-item">
          <span class="label">Delays Included:</span>
          <span class="value">${route.delays_applied} min</span>
        </div>
      </div>
    `;

    routeDetailsContainer.innerHTML = summaryHtml;
    routeDetailsContainer.style.display = 'block';
  }

  displayRouteSegments(segments) {
    const segmentsContainer = document.getElementById('routeSegments') || this.createSegmentsContainer();

    segmentsContainer.innerHTML = '';

    segments.forEach((segment, index) => {
      const segmentElement = this.createSegmentElement(segment, index + 1);
      segmentsContainer.appendChild(segmentElement);
    });

    segmentsContainer.style.display = 'block';
  }

  createSegmentsContainer() {
    const container = document.createElement('div');
    container.id = 'routeSegments';
    container.className = 'route-segments';
    routeDetailsContainer.appendChild(container);
    return container;
  }

  createSegmentElement(segment, index) {
    const segmentDiv = document.createElement('div');
    segmentDiv.className = 'route-segment';

    const fromName = segment.from_stand ? segment.from_stand.name : 'Current Location';
    const toName = segment.to_stand ? segment.to_stand.name : segment.to_destination.name;
    const segmentType = segment.type === 'rickshaw' ? '🛺 Rickshaw' : '🚶 Walking';

    segmentDiv.innerHTML = `
      <div class="segment-header">
        <span class="segment-number">${index}</span>
        <span class="segment-type">${segmentType}</span>
        <span class="segment-time">${segment.time} min</span>
      </div>
      <div class="segment-route">
        <strong>${fromName}</strong> → <strong>${toName}</strong>
        <br>
        <small>Distance: ${segment.distance.toFixed(1)} km</small>
        ${segment.delay ? `<small> • Delay: ${segment.delay} min</small>` : ''}
      </div>
    `;

    return segmentDiv;
  }

  displayWeatherWidget() {
    if (!weatherWidget) return;

    const weather = this.weatherService.getCurrentWeather();
    if (weather) {
      weatherWidget.innerHTML = `
        <div class="weather-content">
          <span id="weatherIcon">${weather.icon}</span>
          <span id="weatherTemp">${weather.temperature}°C</span>
          <span id="weatherDesc">${weather.description}</span>
        </div>
        <div class="weather-suggestion">${weather.suggestion}</div>
      `;
      weatherWidget.style.display = 'flex';
    }
  }

  displayFavoritesSection() {
    if (!favoritesSection || !window.isLoggedIn) return;

    const favorites = this.favoritesManager.getFavorites();
    if (favorites.length > 0) {
      favoritesList.innerHTML = '';
      favorites.forEach(favorite => {
        const favoriteElement = this.createFavoriteElement(favorite);
        favoritesList.appendChild(favoriteElement);
      });
      favoritesSection.style.display = 'block';
    }
  }

  createFavoriteElement(favorite) {
    const favoriteDiv = document.createElement('div');
    favoriteDiv.className = 'favorite-item';

    favoriteDiv.innerHTML = `
      <div class="favorite-route">
        ${favorite.nickname || `${favorite.from_stand.name} → ${favorite.to_destination.name}`}
      </div>
      <div class="favorite-nickname">${favorite.from_stand.name} to ${favorite.to_destination.name}</div>
      <div class="favorite-actions">
        <button class="btn btn-sm btn-primary" onclick="routeFinder.useFavorite(${favorite.id})">Use Route</button>
        <button class="btn btn-sm btn-outline" onclick="routeFinder.deleteFavorite(${favorite.id})">Delete</button>
      </div>
    `;

    return favoriteDiv;
  }

  async saveCurrentRouteToFavorites() {
    if (!currentRoute || !window.isLoggedIn) {
      this.showError('Please log in to save favorites');
      return;
    }

    try {
      await this.favoritesManager.saveFavorite(currentRoute);
      this.displayFavoritesSection(); // Refresh favorites display
      this.showSuccess('Route saved to favorites!');
    } catch (error) {
      this.showError('Failed to save favorite: ' + error.message);
    }
  }

  async useFavorite(favoriteId) {
    const favorite = this.favoritesManager.getFavoriteById(favoriteId);
    if (favorite) {
      standSelect.value = favorite.from_stand.id;
      destinationInput.value = favorite.to_destination.name;
      this.selectedDestination = favorite.to_destination;
      await this.handleFindRoute();
    }
  }

  async deleteFavorite(favoriteId) {
    try {
      await this.favoritesManager.deleteFavorite(favoriteId);
      this.displayFavoritesSection(); // Refresh favorites display
      this.showSuccess('Favorite deleted');
    } catch (error) {
      this.showError('Failed to delete favorite: ' + error.message);
    }
  }

  showNoResults() {
    resultsContainer.classList.add("show");
    resultsHeader.textContent = "No Results";
    routeDetailsContainer.style.display = 'none';
    routeCardsContainer.innerHTML = '<p>No optimal route found for the selected locations.</p>';
    noResultsMessage.style.display = "block";
  }

  addToRecentSearches(data) {
    const { fromStand, toDestination } = data;

    const searchObject = {
      standId: fromStand.id,
      standName: fromStand.name,
      destination: toDestination.name,
      destinationCoords: toDestination,
      timestamp: Date.now(),
    };

    const existingIndex = recentSearches.findIndex(
      search => search.standId === fromStand.id &&
               search.destination.toLowerCase() === toDestination.name.toLowerCase()
    );

    if (existingIndex !== -1) {
      recentSearches.splice(existingIndex, 1);
    }

    recentSearches.unshift(searchObject);

    if (recentSearches.length > MAX_RECENT_SEARCHES) {
      recentSearches.pop();
    }

    this.displayRecentSearches();
  }

  displayRecentSearches() {
    if (recentSearches.length === 0) {
      recentSearchesContainer.style.display = "none";
      return;
    }

    recentSearchesContainer.style.display = "block";
    recentSearchesList.innerHTML = "";

    recentSearches.forEach((search, index) => {
      const card = document.createElement("div");
      card.className = "recent-search-card";
      card.textContent = `From ${search.standName} to ${search.destination}`;
      card.addEventListener("click", () => this.restoreSearch(index));
      recentSearchesList.appendChild(card);
    });
  }

  restoreSearch(index) {
    const search = recentSearches[index];
    if (!search) return;

    standSelect.value = search.standId;
    destinationInput.value = search.destination;
    this.selectedDestination = search.destinationCoords;
    this.handleFindRoute();
  }

  handleReset() {
    standSelect.value = "";
    destinationInput.value = "";
    this.selectedDestination = null;
    currentRoute = null;

    resultsContainer.classList.remove("show");
    this.hideAutocomplete();
    this.clearErrorMessages();

    if (weatherWidget) {
      weatherWidget.style.display = 'none';
    }

    if (favoritesSection) {
      favoritesSection.style.display = 'none';
    }
  }

  initializeMapIntegration() {
    // Check if map.js is loaded and has the necessary functions
    if (typeof displayRouteOnMap === 'function') {
      this.mapService = {
        displayRouteOnMap: displayRouteOnMap
      };
    }
  }

  // Error handling
  showErrorMessage(field, message) {
    if (field === "stand") {
      standError.textContent = message;
      standError.classList.add("show");
    } else if (field === "destination") {
      destinationError.textContent = message;
      destinationError.classList.add("show");
    }
  }

  clearErrorMessage(field) {
    if (field === "stand") {
      standError.textContent = "";
      standError.classList.remove("show");
    } else if (field === "destination") {
      destinationError.textContent = "";
      destinationError.classList.remove("show");
    }
  }

  clearErrorMessages() {
    this.clearErrorMessage("stand");
    this.clearErrorMessage("destination");
  }

  showError(message) {
    alert(message); // In a real implementation, use a toast notification
  }

  showSuccess(message) {
    alert(message); // In a real implementation, use a toast notification
  }

  setButtonLoading(isLoading) {
    if (isLoading) {
      findRouteBtn.textContent = "Calculating...";
      findRouteBtn.disabled = true;
    } else {
      findRouteBtn.textContent = "Find Route";
      findRouteBtn.disabled = false;
    }
  }
}

// Weather Service Class
class WeatherService {
  constructor() {
    this.currentWeather = null;
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  async getWeatherForLocation(lat, lng) {
    const cacheKey = `${lat},${lng}`;
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      this.currentWeather = cached;
      return cached;
    }

    try {
      const response = await fetch(`https://wttr.in/${lat},${lng}?format=j1`);
      const data = await response.json();

      if (data && data.current_condition) {
        const weather = this.parseWeatherData(data.current_condition[0]);
        this.setCache(cacheKey, weather);
        this.currentWeather = weather;
        return weather;
      }
    } catch (error) {
      console.error('Weather API error:', error);
      // Set default weather on error
      this.currentWeather = this.getDefaultWeather();
    }

    return this.currentWeather;
  }

  parseWeatherData(data) {
    const temp = parseInt(data.temp_C);
    const description = data.weatherDesc[0].value;
    const icon = this.getWeatherIcon(description);
    const suggestion = this.getTravelSuggestion(temp, description);

    return {
      temperature: temp,
      description: description,
      icon: icon,
      suggestion: suggestion
    };
  }

  getWeatherIcon(description) {
    const desc = description.toLowerCase();
    if (desc.includes('rain') || desc.includes('shower')) return '🌧️';
    if (desc.includes('cloud')) return '☁️';
    if (desc.includes('sun') || desc.includes('clear')) return '☀️';
    if (desc.includes('snow')) return '❄️';
    if (desc.includes('storm')) return '⛈️';
    return '🌤️';
  }

  getTravelSuggestion(temp, description) {
    const desc = description.toLowerCase();

    if (desc.includes('rain') || desc.includes('shower')) {
      return '🌧️ Carry umbrella - light rain expected';
    }
    if (temp > 35) {
      return '🌡️ Very hot - stay hydrated during travel';
    }
    if (temp < 15) {
      return '🧥 Cool weather - consider light jacket';
    }
    if (desc.includes('clear') && temp >= 20 && temp <= 30) {
      return '☀️ Perfect weather for rickshaw travel';
    }

    return '🚶 Normal weather conditions for travel';
  }

  getDefaultWeather() {
    return {
      temperature: 25,
      description: 'Partly cloudy',
      icon: '🌤️',
      suggestion: 'Normal weather conditions for travel'
    };
  }

  getFromCache(key) {
    const cached = localStorage.getItem(`weather_${key}`);
    if (cached) {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < this.cacheTimeout) {
        return data.weather;
      }
    }
    return null;
  }

  setCache(key, weather) {
    localStorage.setItem(`weather_${key}`, JSON.stringify({
      weather: weather,
      timestamp: Date.now()
    }));
  }

  getCurrentWeather() {
    return this.currentWeather;
  }
}

// Favorites Manager Class
class FavoritesManager {
  constructor() {
    this.favorites = [];
    this.storageKey = 'sharerickshaw_favorites';
  }

  async loadFavorites() {
    // Load from localStorage first
    const localFavorites = this.loadFromLocalStorage();

    // If user is logged in, sync with server
    if (window.isLoggedIn) {
      try {
        const serverFavorites = await this.loadFromServer();
        this.favorites = serverFavorites;
        this.saveToLocalStorage(this.favorites);
      } catch (error) {
        console.error('Error loading favorites from server:', error);
        this.favorites = localFavorites;
      }
    } else {
      this.favorites = localFavorites;
    }
  }

  loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading favorites from localStorage:', error);
      return [];
    }
  }

  saveToLocalStorage(favorites) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(favorites));
    } catch (error) {
      console.error('Error saving favorites to localStorage:', error);
    }
  }

  async loadFromServer() {
    const response = await fetch(`${ROUTE_API_BASE_URL}/route-calculation/favorites`, {
      headers: {
        'Authorization': `Bearer ${window.getAuthToken()}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      return data.success ? data.favorites : [];
    }

    return [];
  }

  async saveFavorite(route) {
    const favorite = {
      from_stand: route.from_stand,
      to_destination: route.to_destination,
      nickname: `${route.from_stand.name} → ${route.to_destination.name}`
    };

    // Save to server if logged in
    if (window.isLoggedIn) {
      try {
        const response = await fetch(`${ROUTE_API_BASE_URL}/route-calculation/favorites`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${window.getAuthToken()}`
          },
          body: JSON.stringify({
            from_stand_id: favorite.from_stand.id,
            to_destination: favorite.to_destination.name,
            to_lat: favorite.to_destination.latitude,
            to_lng: favorite.to_destination.longitude,
            nickname: favorite.nickname
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            favorite.id = result.favorite_id;
            this.favorites.unshift(favorite);
            this.saveToLocalStorage(this.favorites);
            return favorite;
          }
        }
      } catch (error) {
        console.error('Error saving favorite to server:', error);
      }
    }

    // Fallback to localStorage only
    favorite.id = Date.now().toString();
    this.favorites.unshift(favorite);
    this.saveToLocalStorage(this.favorites);

    return favorite;
  }

  async deleteFavorite(favoriteId) {
    // Remove from server if logged in
    if (window.isLoggedIn) {
      try {
        await fetch(`${API_BASE_URL}/route-calculation/favorites/${favoriteId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${window.getAuthToken()}`
          }
        });
      } catch (error) {
        console.error('Error deleting favorite from server:', error);
      }
    }

    // Remove from local data
    this.favorites = this.favorites.filter(fav => fav.id !== favoriteId);
    this.saveToLocalStorage(this.favorites);
  }

  getFavorites() {
    return this.favorites;
  }

  getFavoriteById(id) {
    return this.favorites.find(fav => fav.id === id);
  }
}

// Initialize the enhanced route finder
let routeFinder;

document.addEventListener("DOMContentLoaded", function () {
  routeFinder = new EnhancedRouteFinder();
  routeFinder.initialize().catch(error => {
    console.error('Failed to initialize route finder:', error);
  });
});

// Export for global access
window.routeFinder = null;
window.EnhancedRouteFinder = EnhancedRouteFinder;