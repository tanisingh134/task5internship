
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('Service Worker registered:', registration);
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
      });
  });
}
document.addEventListener('DOMContentLoaded', () => {
  const apiKey = "80536d9f1274361d81d5cb1ea8335de1";
  const currentWeatherUrl = 'https://api.openweathermap.org/data/2.5/weather';
  const forecastUrl = 'https://api.openweathermap.org/data/2.5/forecast';
  const uvIndexUrl = 'https://api.openweathermap.org/data/2.5/uvi';
  const geocodeUrl = 'http://api.openweathermap.org/geo/1.0/reverse';
  let isCelsius = true;
  let currentDataGlobal = null;
  let dailyDataGlobal = {};
  let hourlyDataGlobal = {};
  let chartInstance = null;
  let emojiMarkers = [];
  let neighborsData = [];
  let currentTheme = 'default';
  let customThemes = JSON.parse(localStorage.getItem('customThemes')) || [];
  let soundEnabled = false;
  let audioContext = null;
  let gainNode = null;
  let userMood = 'neutral';
  let weatherLog = JSON.parse(localStorage.getItem('weatherLog')) || [];
  let journalEntries = JSON.parse(localStorage.getItem('weatherJournal')) || [];

  const fibMemo = {};
  function fibonacci(n) {
    if (n === 0) return 0;
    if (n === 1) return 1;
    if (!fibMemo[n]) fibMemo[n] = fibonacci(n - 1) + fibonacci(n - 2);
    return fibMemo[n];
  }

  const map = L.map('weather-map', { zoomControl: true }).setView([20, 0], 2);
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  const tempLayer = L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}`, {
    attribution: '© OpenWeatherMap'
  });
  const precipLayer = L.tileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${apiKey}`, {
    attribution: '© OpenWeatherMap'
  });
  const windLayer = L.tileLayer(`https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${apiKey}`, {
    attribution: '© OpenWeatherMap'
  });
  const baseLayers = { "OpenStreetMap": osmLayer };
  const overlays = { "Temperature": tempLayer, "Precipitation": precipLayer, "Wind Speed": windLayer };
  L.control.layers(baseLayers, overlays).addTo(map);

  function refreshMapLayers() {
    tempLayer.setUrl(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}&_=${Date.now()}`);
    precipLayer.setUrl(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${apiKey}&_=${Date.now()}`);
    windLayer.setUrl(`https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${apiKey}&_=${Date.now()}`);
  }
  setInterval(refreshMapLayers, 10 * 60 * 1000);

  function getWeatherEmoji(weatherMain) {
    if (weatherMain.includes('clear')) return '☀️';
    if (weatherMain.includes('rain') || weatherMain.includes('drizzle')) return '🌧️';
    if (weatherMain.includes('snow')) return '❄️';
    if (weatherMain.includes('storm') || weatherMain.includes('thunder')) return '⛈️';
    return '☁️';
  }

  function updateTheme(isDark) {
    const theme = isDark ? 'dark' : 'light';
    const oppositeTheme = isDark ? 'light' : 'dark';
    document.body.classList.remove(oppositeTheme);
    document.body.classList.add(theme);
    document.querySelectorAll('.container, .weather-info, .forecast-section, .hourly-forecast-section, .news-section, .neighbors-section, .themes-section, .widgets-section, #cosmicMood, .nav-tabs, .custom-theme-creator, .cloud-editor, .palette-section, .time-section, .activity-section, .journal-section').forEach(section => {
      section.classList.remove(oppositeTheme);
      section.classList.add(theme);
    });
    document.querySelectorAll('#themeToggle, #unitToggle, #searchButton, #soundToggle, #refreshActivity, #downloadPalette, #save-custom-theme, #add-cloud, #clear-clouds, #moodToggle, #save-mood, #add-journal').forEach(button => {
      button.classList.remove(oppositeTheme);
      button.classList.add(theme);
    });
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove(oppositeTheme);
      tab.classList.add(theme);
    });
    document.querySelectorAll('.forecast-card, .hourly-forecast-card, .weather-widget, .news-card, .neighbor-card, .journal-entry').forEach(element => {
      element.classList.remove(oppositeTheme);
      element.classList.add(theme);
    });
    const alertMessages = document.getElementById('alertMessages');
    if (isDark) alertMessages.classList.add('dark');
    else alertMessages.classList.remove('dark');
    if (chartInstance && dailyDataGlobal) drawTempChart(dailyDataGlobal);
    document.getElementById('themeToggle').textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
  }

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.body.classList.contains('light');
      updateTheme(isDark);
    });
  } else {
    console.error('Theme toggle button not found');
  }

  const unitToggle = document.getElementById('unitToggle');
  if (unitToggle) {
    unitToggle.addEventListener('click', () => {
      isCelsius = !isCelsius;
      unitToggle.textContent = isCelsius ? 'Switch to °F' : 'Switch to °C';
      if (currentDataGlobal && dailyDataGlobal && hourlyDataGlobal) {
        updateTemperatureDisplay(currentDataGlobal, dailyDataGlobal, hourlyDataGlobal);
        drawTempChart(dailyDataGlobal);
        updateMapWithEmojiMarkers(currentDataGlobal.coord.lat, currentDataGlobal.coord.lon);
        updateNeighborsTemps();
        updateEcoImpact(currentDataGlobal);
      }
    });
  } else {
    console.error('Unit toggle button not found');
  }

  const navTabs = document.querySelectorAll('.nav-tab');
  if (!navTabs.length) console.error('No navigation tabs found');
  const sections = {
    today: document.querySelector('.weather-info'),
    hourly: document.querySelector('.hourly-forecast-section'),
    daily: document.querySelector('.forecast-section'),
    radar: document.getElementById('weather-map'),
    themes: document.querySelector('.themes-section'),
    widgets: document.querySelector('.widgets-section'),
    palette: document.getElementById('color-palette-section'),
    time: document.getElementById('time-section'),
    activities: document.getElementById('activity-section'),
    journal: document.createElement('div')
  };

  // Initialize journal section
  sections.journal.className = 'journal-section hidden';
  const container = document.querySelector('.container');
  if (container) {
    container.appendChild(sections.journal);
  } else {
    console.error('Container element not found');
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      console.log('Clicked tab:', tab.getAttribute('data-tab'));
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.getAttribute('data-tab');
      Object.values(sections).forEach(section => {
        if (section) section.style.display = 'none';
      });
      if (sections[tabName]) {
        sections[tabName].style.display = 'block';
        if (tabName === 'radar') setTimeout(() => map.invalidateSize(), 100);
        if (tabName === 'journal') displayJournal();
      } else {
        console.error(`Section for tab ${tabName} not found`);
      }
    });
  });

  // Ensure initial visibility
  if (sections.today) {
    sections.today.style.display = 'block';
    navTabs[0]?.classList.add('active');
  }

  const themeButtons = document.querySelectorAll('.theme-button');
  themeButtons.forEach(button => {
    button.addEventListener('click', () => {
      currentTheme = button.getAttribute('data-theme');
      if (currentDataGlobal) updateBackground(currentDataGlobal.main.temp, currentDataGlobal.weather[0].main.toLowerCase(), currentTheme);
    });
  });

  const saveCustomTheme = document.getElementById('save-custom-theme');
  if (saveCustomTheme) {
    saveCustomTheme.addEventListener('click', () => {
      const skyColor1 = document.getElementById('sky-color1').value;
      const skyColor2 = document.getElementById('sky-color2').value;
      const particleType = document.getElementById('particle-type').value;
      const customTheme = { skyColor1, skyColor2, particleType, name: `Custom_${customThemes.length + 1}` };
      customThemes.push(customTheme);
      localStorage.setItem('customThemes', JSON.stringify(customThemes));
      currentTheme = customTheme.name;
      if (currentDataGlobal) updateBackground(currentDataGlobal.main.temp, currentDataGlobal.weather[0].main.toLowerCase(), currentTheme);
      const themesList = document.getElementById('themes-list');
      const newButton = document.createElement('button');
      newButton.className = 'theme-button';
      newButton.style.background = `linear-gradient(135deg, ${skyColor1}, ${skyColor2})`;
      newButton.setAttribute('data-theme', customTheme.name);
      newButton.textContent = customTheme.name;
      newButton.addEventListener('click', () => {
        currentTheme = customTheme.name;
        if (currentDataGlobal) updateBackground(currentDataGlobal.main.temp, currentDataGlobal.weather[0].main.toLowerCase(), currentTheme);
      });
      themesList.appendChild(newButton);
    });
  } else {
    console.error('Save custom theme button not found');
  }

  const locationInput = document.getElementById('locationInput');
  if (locationInput) {
    locationInput.addEventListener('focus', () => document.getElementById('alertMessages').textContent = '');
    locationInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const city = locationInput.value.trim();
        console.log('Enter key pressed, searching for:', city);
        originalSearchWeather(city);
      }
    });
  } else {
    console.error('Location input not found');
  }

  const searchButton = document.getElementById('searchButton');
  if (searchButton) {
    searchButton.addEventListener('click', () => {
      const city = locationInput.value.trim();
      console.log('Search button clicked, searching for:', city);
      originalSearchWeather(city);
    });
  } else {
    console.error('Search button not found');
  }

  async function originalSearchWeather(city) {
    console.log('Searching weather for:', city);
    if (!city) {
      document.getElementById('alertMessages').textContent = 'Please enter a city name';
      return;
    }

    const spinner = document.getElementById('spinner');
    spinner.style.display = 'block';

    try {
      const currentResponse = await fetch(`${currentWeatherUrl}?q=${city}&appid=${apiKey}&units=metric`);
      if (!currentResponse.ok) throw new Error('City not found');
      const currentData = await currentResponse.json();
      currentDataGlobal = currentData;

      const forecastResponse = await fetch(`${forecastUrl}?q=${city}&appid=${apiKey}&units=metric`);
      if (!forecastResponse.ok) throw new Error('Forecast not found');
      const forecastData = await forecastResponse.json();

      const lat = currentData.coord.lat;
      const lon = currentData.coord.lon;
      const uvResponse = await fetch(`${uvIndexUrl}?lat=${lat}&lon=${lon}&appid=${apiKey}`);
      const uvData = uvResponse.ok ? await uvResponse.json() : { value: 'N/A' };

      const dailyData = {};
      forecastData.list.forEach(item => {
        const date = new Date(item.dt * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        if (!dailyData[date]) dailyData[date] = { temps: [], icon: item.weather[0].icon };
        dailyData[date].temps.push(item.main.temp);
      });
      dailyDataGlobal = dailyData;

      const hourlyData = {};
      forecastData.list.slice(0, 7).forEach(item => {
        const time = new Date(item.dt * 1000).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
        hourlyData[time] = { temp: item.main.temp, icon: item.weather[0].icon };
      });
      hourlyDataGlobal = hourlyData;

      updateTemperatureDisplay(currentData, dailyData, hourlyData);
      updateWeatherWidgets(currentData, uvData);
      updateBackground(currentData.main.temp, currentData.weather[0].main.toLowerCase(), currentTheme);
      updateWeatherIcon(currentData.weather[0].main.toLowerCase());
      updateWeatherNews();
      map.setView([lat, lon], 8);
      map.eachLayer(layer => { if (layer instanceof L.Marker) map.removeLayer(layer); });
      const marker = L.marker([lat, lon]).addTo(map);
      const avgForecastTemp = Object.values(dailyData).reduce((sum, day) => sum + (day.temps.reduce((a, b) => a + b, 0) / day.temps.length), 0) / 5;
      marker.bindPopup(`
        <b>${currentData.name}</b><br>
        Current Temp: ${Math.round(isCelsius ? currentData.main.temp : (currentData.main.temp * 9/5) + 32)}${isCelsius ? '°C' : '°F'}<br>
        5-Day Avg Temp: ${Math.round(isCelsius ? avgForecastTemp : (avgForecastTemp * 9/5) + 32)}${isCelsius ? '°C' : '°F'}
      `).openPopup();
      refreshMapLayers();
      await updateMapWithEmojiMarkers(lat, lon);

      const alertMessages = document.getElementById('alertMessages');
      alertMessages.innerHTML = '';
      const weatherMain = currentData.weather[0].main.toLowerCase();
      if (weatherMain.includes('storm') || weatherMain.includes('thunder')) {
        alertMessages.innerHTML = '⚠️ Severe Weather Alert: Thunderstorm detected in your area. Stay safe!';
        speakAlert('Severe weather alert! Thunderstorm detected. Please stay safe.');
      } else if (currentData.main.temp > 35) {
        alertMessages.innerHTML = '⚠️ Heat Alert: High temperatures detected. Stay hydrated!';
        speakAlert('Heat alert! Temperatures are high. Stay hydrated.');
      }
      updateTheme(document.body.classList.contains('dark'));

      const cosmicMoodText = document.getElementById('cosmicMoodText');
      const today = new Date('2025-06-29T20:55:00+05:30');
      const moonPhase = getMoonPhase(today);
      let cosmicMood = '';
      if (weatherMain.includes('clear') && moonPhase === 'New Moon') {
        cosmicMood = 'Perfect night for stargazing! The clear skies and new moon make stars shine bright. 🌟';
      } else if (weatherMain.includes('rain')) {
        cosmicMood = 'A rainy day calls for cozy indoor activities. How about reading a book or watching a movie? ☔';
      } else if (moonPhase === 'Full Moon') {
        cosmicMood = 'The full moon brings a mystical vibe. Take a night walk if the weather permits! 🌕';
      } else {
        cosmicMood = 'Enjoy the day! The weather and cosmos suggest a balanced mood. 🌍';
      }
      cosmicMoodText.textContent = cosmicMood || 'Cosmic Mood: Enjoy the day! 🌍';
      updateTheme(document.body.classList.contains('dark'));

      logWeatherData(currentData);
      drawTempChart(dailyData);
      updateColorPalette(currentData);
      updateLocalTimeAndSun(currentData);
      updateActivitySuggestion(currentData);
      updateARSuggestion(currentData);
      updateEcoImpact(currentData);
      if (soundEnabled) playWeatherSound(currentData.weather[0].main.toLowerCase());

    } catch (error) {
      console.error('Error in originalSearchWeather:', error);
      document.getElementById('alertMessages').textContent = `Error: ${error.message}`;
      resetUI();
    } finally {
      spinner.style.display = 'none';
    }
  }

  async function updateMapWithEmojiMarkers(lat, lon) {
    emojiMarkers.forEach(marker => map.removeLayer(marker));
    emojiMarkers = [];
    neighborsData = [];
    const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    for (const [latOffset, lonOffset] of offsets) {
      const newLat = lat + latOffset * 1.5;
      const newLon = lon + lonOffset * 1.5;
      try {
        const weatherResponse = await fetch(`${currentWeatherUrl}?lat=${newLat}&lon=${newLon}&appid=${apiKey}&units=metric`);
        if (!weatherResponse.ok) continue;
        const weatherData = await weatherResponse.json();
        const geocodeResponse = await fetch(`${geocodeUrl}?lat=${newLat}&lon=${newLon}&limit=1&appid=${apiKey}`);
        let cityName = 'Nearby Location';
        if (geocodeResponse.ok) {
          const geocodeData = await geocodeResponse.json();
          if (geocodeData.length > 0) cityName = geocodeData[0].name;
        }
        const weatherMain = weatherData.weather[0].main.toLowerCase();
        const emoji = getWeatherEmoji(weatherMain);
        const temp = isCelsius ? weatherData.main.temp : (weatherData.main.temp * 9/5) + 32;
        const iconDiv = L.divIcon({ className: 'emoji', html: emoji, iconSize: [30, 30] });
        const marker = L.marker([newLat, newLon], { icon: iconDiv }).addTo(map);
        marker.bindPopup(`
          <b>${cityName}</b><br>
          Condition: ${weatherData.weather[0].description}<br>
          Temp: ${Math.round(temp)}${isCelsius ? '°C' : '°F'}
        `);
        emojiMarkers.push(marker);
        neighborsData.push({ city: cityName, temp: Math.round(temp), condition: weatherData.weather[0].description });
      } catch (error) {
        console.error('Error fetching nearby weather:', error);
      }
    }
    updateNeighborsTemps();
  }

  function updateNeighborsTemps() {
    const neighborsDiv = document.getElementById('neighbors-temps');
    neighborsDiv.innerHTML = '';
    neighborsData.forEach((neighbor, index) => {
      const fibShadow = fibonacci(index + 3) * 2;
      const neighborCard = document.createElement('div');
      neighborCard.className = 'neighbor-card';
      neighborCard.classList.add(document.body.classList.contains('dark') ? 'dark' : 'light');
      neighborCard.style.boxShadow = `0 ${fibShadow}px ${fibShadow * 2}px rgba(0, 0, 0, 0.2)`;
      neighborCard.innerHTML = `
        <h4>${neighbor.city}</h4>
        <p>${neighbor.temp}${isCelsius ? '°C' : '°F'}</p>
      `;
      neighborsDiv.appendChild(neighborCard);
    });
  }

  function updateTemperatureDisplay(currentData, dailyData, hourlyData) {
    if (!currentData || !dailyData || !hourlyData) return;
    document.getElementById('location').textContent = `${currentData.name}, ${currentData.sys.country}`;
    const temp = isCelsius ? currentData.main.temp : (currentData.main.temp * 9/5) + 32;
    document.getElementById('temperature').textContent = `${Math.round(temp)}${isCelsius ? '°C' : '°F'}`;
    document.getElementById('description').textContent = currentData.weather[0].description;

    const forecastDiv = document.getElementById('forecast');
    forecastDiv.innerHTML = '';
    Object.keys(dailyData).slice(0, 7).forEach((date, index) => {
      const avgTempC = dailyData[date].temps.reduce((a, b) => a + b, 0) / dailyData[date].temps.length;
      const avgTemp = isCelsius ? avgTempC : (avgTempC * 9/5) + 32;
      const fibShadow = fibonacci(index + 3) * 2;
      const dayDiv = document.createElement('div');
      dayDiv.className = 'forecast-card';
      dayDiv.classList.add(document.body.classList.contains('dark') ? 'dark' : 'light');
      dayDiv.style.boxShadow = `0 ${fibShadow}px ${fibShadow * 2}px rgba(0, 0, 0, 0.2)`;
      dayDiv.innerHTML = `
        <p>${date}</p>
        <img src="http://openweathermap.org/img/wn/${dailyData[date].icon}@2x.png" alt="Weather Icon">
        <p class="temp">${Math.round(avgTemp)}${isCelsius ? '°C' : '°F'}</p>
        ${getMoodAdjustedForecast(avgTempC)}
      `;
      forecastDiv.appendChild(dayDiv);
    });

    const hourlyForecastDiv = document.getElementById('hourly-forecast');
    hourlyForecastDiv.innerHTML = '';
    Object.keys(hourlyData).forEach((time, index) => {
      const tempC = hourlyData[time].temp;
      const temp = isCelsius ? tempC : (tempC * 9/5) + 32;
      const fibShadow = fibonacci(index + 3) * 2;
      const hourDiv = document.createElement('div');
      hourDiv.className = 'hourly-forecast-card';
      hourDiv.classList.add(document.body.classList.contains('dark') ? 'dark' : 'light');
      hourDiv.style.boxShadow = `0 ${fibShadow}px ${fibShadow * 2}px rgba(0, 0, 0, 0.2)`;
      hourDiv.innerHTML = `
        <p>${time}</p>
        <img src="http://openweathermap.org/img/wn/${hourlyData[time].icon}@2x.png" alt="Weather Icon">
        <p class="temp">${Math.round(temp)}${isCelsius ? '°C' : '°F'}</p>
      `;
      hourlyForecastDiv.appendChild(hourDiv);
    });
  }

  function getMoodAdjustedForecast(temp) {
    switch (userMood) {
      case 'happy':
        return temp > 20 ? '<span class="text-green-500">Great for outdoor fun!</span>' : '<span class="text-green-500">Cozy vibes ahead!</span>';
      case 'stressed':
        return '<span class="text-red-500">Take it easy, weather might add to your day.</span>';
      default:
        return '';
    }
  }

  function updateWeatherWidgets(currentData, uvData) {
    document.getElementById('humidity').textContent = `${currentData.main.humidity}%`;
    document.getElementById('wind-speed').textContent = `${Math.round(currentData.wind.speed * 3.6)} km/h`;
    document.getElementById('pressure').textContent = `${currentData.main.pressure} hPa`;
    document.getElementById('uv-index').textContent = uvData.value !== 'N/A' ? uvData.value.toFixed(1) : 'N/A';
  }

  function updateWeatherNews() {
    const mockNews = [
      { title: "Thunderstorms Expected in the South East", description: "A yellow weather warning has been issued for London and the South East, expecting heavy rain and thunderstorms this weekend." },
      { title: "Heatwave Alert Issued for Next Week", description: "Temperatures are expected to soar above 30°C next week, prompting a heat alert for vulnerable populations." },
      { title: "Tornadoes Hit Central U.S.", description: "Severe storms brought tornadoes to Missouri, Kentucky, and Virginia, causing significant damage and loss of life." }
    ];
    const newsDiv = document.getElementById('weather-news');
    newsDiv.innerHTML = '';
    mockNews.forEach((article, index) => {
      const fibShadow = fibonacci(index + 3) * 2;
      const newsCard = document.createElement('div');
      newsCard.className = 'news-card';
      newsCard.classList.add(document.body.classList.contains('dark') ? 'dark' : 'light');
      newsCard.style.boxShadow = `0 ${fibShadow}px ${fibShadow * 2}px rgba(0, 0, 0, 0.2)`;
      newsCard.innerHTML = `<h4>${article.title}</h4><p>${article.description}</p>`;
      newsDiv.appendChild(newsCard);
    });
  }

  const canvas = document.getElementById('weather-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let clouds = [];
  let ripples = [];
  let weatherCondition = 'clear';
  let temp = 15;
  let isNight = false;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  class Particle {
    constructor(type) {
      this.x = Math.random() * canvas.width;
      this.y = type === 'snow' ? -10 : Math.random() * canvas.height;
      this.size = type === 'fire' ? Math.random() * 5 + 2 : Math.random() * 3 + 1;
      this.speedX = type === 'fire' ? (Math.random() - 0.5) * 2 : type === 'snow' ? (Math.random() - 0.5) : 0;
      this.speedY = type === 'fire' ? -Math.random() * 2 - 1 : type === 'snow' ? Math.random() * 2 + 1 : 5;
      this.type = type;
      this.opacity = Math.random() * 0.5 + 0.5;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY * (temp > 30 ? 1.5 : temp < 15 ? 0.5 : 1);
      if (this.type === 'rain' && this.y > canvas.height) {
        this.y = -10;
        this.x = Math.random() * canvas.width;
      } else if (this.type === 'fire' && (this.y < 0 || this.opacity <= 0)) {
        this.y = canvas.height;
        this.x = Math.random() * canvas.width;
        this.opacity = Math.random() * 0.5 + 0.5;
      } else if (this.type === 'snow' && this.y > canvas.height) {
        this.y = -10;
        this.x = Math.random() * canvas.width;
      }
      if (this.type === 'fire') this.opacity -= 0.01;
    }
    draw() {
      ctx.globalAlpha = this.opacity;
      if (this.type === 'rain') {
        ctx.strokeStyle = 'rgba(70, 130, 180, 0.8)';
        ctx.lineWidth = this.size;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x, this.y + 10);
        ctx.stroke();
      } else if (this.type === 'fire') {
        ctx.fillStyle = `rgba(255, ${Math.random() * 100 + 155}, 0, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.type === 'snow') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  class Cloud {
    constructor(x, y, size, density, color) {
      this.x = x || Math.random() * canvas.width;
      this.y = y || Math.random() * canvas.height * 0.3;
      this.size = size || Math.random() * 50 + 50;
      this.density = density || 0.5;
      this.color = color || 'rgba(255, 255, 255, 0.8)';
      this.speedX = (Math.random() - 0.5) * 0.5;
      this.puffs = this.generatePuffs();
    }
    generatePuffs() {
      const puffs = [];
      const puffCount = Math.floor(this.density * 10);
      for (let i = 0; i < puffCount; i++) {
        puffs.push({
          offsetX: (Math.random() - 0.5) * this.size,
          offsetY: (Math.random() - 0.5) * this.size * 0.5,
          radius: Math.random() * this.size * 0.5 + this.size * 0.3
        });
      }
      return puffs;
    }
    update() {
      this.x += this.speedX;
      if (this.x > canvas.width + this.size) this.x = -this.size;
      if (this.x < -this.size) this.x = canvas.width + this.size;
    }
    draw() {
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      this.puffs.forEach(puff => {
        ctx.moveTo(this.x + puff.offsetX, this.y + puff.offsetY);
        ctx.arc(this.x + puff.offsetX, this.y + puff.offsetY, puff.radius, 0, Math.PI * 2);
      });
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  class Ripple {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.radius = 0;
      this.opacity = 1;
    }
    update() {
      this.radius += 2;
      this.opacity -= 0.02;
    }
    draw() {
      ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function initParticles(count, type) {
    particles = [];
    for (let i = 0; i < count; i++) particles.push(new Particle(type));
  }

  function initClouds(count) {
    clouds = [];
    for (let i = 0; i < count; i++) clouds.push(new Cloud());
  }

  const addCloudButton = document.getElementById('add-cloud');
  if (addCloudButton) {
    addCloudButton.addEventListener('click', () => {
      const size = parseInt(document.getElementById('cloud-size').value);
      const density = parseFloat(document.getElementById('cloud-density').value);
      const color = document.getElementById('cloud-color').value;
      clouds.push(new Cloud(canvas.width / 2, canvas.height * 0.2, size, density, color));
    });
  } else {
    console.error('Add cloud button not found');
  }

  const clearCloudsButton = document.getElementById('clear-clouds');
  if (clearCloudsButton) {
    clearCloudsButton.addEventListener('click', () => {
      clouds = [];
      initClouds(weatherCondition.includes('rain') ? 5 : weatherCondition.includes('snow') ? 3 : 2);
    });
  } else {
    console.error('Clear clouds button not found');
  }

  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (weatherCondition.includes('rain')) {
      ripples.push(new Ripple(x, y));
      const rippleDiv = document.createElement('div');
      rippleDiv.className = 'ripple';
      rippleDiv.style.left = `${x}px`;
      rippleDiv.style.top = `${y}px`;
      document.body.appendChild(rippleDiv);
      setTimeout(() => rippleDiv.remove(), 1000);
    } else if (weatherCondition.includes('snow')) {
      particles = particles.filter(p => p.type !== 'snow' || Math.hypot(p.x - x, p.y - y) > 20);
    }
  });

  function animateBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let gradient;
    let skyColor1 = '#87CEEB';
    let skyColor2 = '#E0F7FA';
    let particleType = '';
    if (customThemes.some(theme => theme.name === currentTheme)) {
      const customTheme = customThemes.find(theme => theme.name === currentTheme);
      skyColor1 = customTheme.skyColor1;
      skyColor2 = customTheme.skyColor2;
      particleType = customTheme.particleType;
    } else if (weatherCondition.includes('clear')) {
      skyColor1 = '#87CEEB';
      skyColor2 = '#E0F7FA';
    } else if (weatherCondition.includes('rain') || weatherCondition.includes('drizzle')) {
      skyColor1 = '#4682B4';
      skyColor2 = '#B0C4DE';
    } else if (weatherCondition.includes('snow')) {
      skyColor1 = '#B0E0E6';
      skyColor2 = '#F0F8FF';
    } else {
      skyColor1 = '#A9A9A9';
      skyColor2 = '#D3D3D3';
    }
    gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, skyColor1);
    gradient.addColorStop(1, skyColor2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (weatherCondition.includes('clear')) {
      ctx.fillStyle = isNight ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 215, 0, 0.8)';
      ctx.beginPath();
      ctx.arc(canvas.width * 0.8, canvas.height * 0.2, 50, 0, Math.PI * 2);
      ctx.fill();
    }
    if (particleType !== 'none' && customThemes.some(theme => theme.name === currentTheme)) {
      particles.forEach(particle => {
        if (particle.type === particleType) {
          particle.update();
          particle.draw();
        }
      });
    } else {
      particles.forEach(particle => {
        particle.update();
        particle.draw();
      });
    }
    clouds.forEach(cloud => {
      cloud.update();
      cloud.draw();
    });
    ripples = ripples.filter(ripple => ripple.opacity > 0);
    ripples.forEach(ripple => {
      ripple.update();
      ripple.draw();
    });
    const auroraLayer = document.getElementById('aurora-layer');
    if ((temp < 5 || isNight) && !weatherCondition.includes('rain')) {
      auroraLayer.classList.add('aurora-active');
    } else {
      auroraLayer.classList.remove('aurora-active');
    }
    requestAnimationFrame(animateBackground);
  }

  function updateBackground(temperature, condition, themeOverride = 'default') {
    temp = temperature;
    weatherCondition = condition;
    isNight = new Date('2025-06-29T20:55:00+05:30').getHours() >= 18 || new Date('2025-06-29T20:55:00+05:30').getHours() < 6;
    const container = document.querySelector('.container');
    container.className = container.className.replace(/weather-(hot|moderate|cold)/g, '');
    let tempCategory = temp > 30 ? 'hot' : temp >= 15 ? 'moderate' : 'cold';
    if (themeOverride !== 'default' && !customThemes.some(theme => theme.name === themeOverride)) {
      if (themeOverride.includes('sunny')) weatherCondition = 'clear';
      else if (themeOverride.includes('rainy')) weatherCondition = 'rain';
      else if (themeOverride.includes('snowy')) weatherCondition = 'snow';
      else if (themeOverride.includes('cloudy')) weatherCondition = 'cloudy';
    }
    container.classList.add(`weather-${tempCategory}`);
    if (customThemes.some(theme => theme.name === themeOverride)) {
      const customTheme = customThemes.find(theme => theme.name === themeOverride);
      if (customTheme.particleType !== 'none') initParticles(100, customTheme.particleType);
      else initParticles(0, '');
      initClouds(3);
    } else if (weatherCondition.includes('rain') || weatherCondition.includes('drizzle')) {
      initParticles(100, 'rain');
      initClouds(5);
    } else if (weatherCondition.includes('clear')) {
      initParticles(50, 'fire');
      initClouds(2);
    } else if (weatherCondition.includes('snow')) {
      initParticles(80, 'snow');
      initClouds(3);
    } else {
      initParticles(0, '');
      initClouds(5);
    }
    container.classList.add(document.body.classList.contains('light') ? 'light' : 'dark');
  }

  function updateWeatherIcon(weatherMain) {
    const weatherIcon = document.getElementById('weather-icon');
    weatherIcon.innerHTML = '';
    if (weatherMain.includes('clear')) {
      weatherIcon.innerHTML = `
        <circle cx="50" cy="50" r="40" fill="#FFD700"/>
        <circle cx="50" cy="50" r="30" fill="#FFA500" opacity="0.8"/>
        <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="10s" repeatCount="indefinite"/>
      `;
    } else if (weatherMain.includes('rain') || weatherMain.includes('drizzle')) {
      weatherIcon.innerHTML = `
        <circle cx="50" cy="30" r="30" fill="#4682B4"/>
        <path d="M40,60 L45,80 M50,60 L55,80 M60,60 L65,80" stroke="#FFFFFF" stroke-width="4"/>
        <animateTransform attributeName="transform" type="translate" values="0,0;0,10;0,0" dur="1s" repeatCount="indefinite"/>
      `;
    } else if (weatherMain.includes('snow')) {
      weatherIcon.innerHTML = `
        <circle cx="50" cy="50" r="30" fill="#E6E6FA"/>
        <path d="M50,30 L50,70 M30,50 L70,50 M35,35 L65,65 M35,65 L65,35" stroke="#FFFFFF" stroke-width="4"/>
        <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="5s" repeatCount="indefinite"/>
      `;
    } else {
      weatherIcon.innerHTML = `
        <circle cx="50" cy="50" r="40" fill="#A9A9A9"/>
        <circle cx="60" cy="40" r="20" fill="#D3D3D3" opacity="0.8"/>
        <circle cx="40" cy="60" r="15" fill="#D3D3D3" opacity="0.8"/>
        <circle cx="65" cy="55" r="25" fill="#D3D3D3" opacity="0.9"/>
        <animateTransform attributeName="transform" type="translate" values="0,0;-5,0;0,0" dur="3s" repeatCount="indefinite"/>
      `;
    }
  }

  function drawTempChart(dailyData) {
    const ctx = document.getElementById('temp-chart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    const labels = Object.keys(dailyData).slice(0, 7);
    const temps = labels.map(date => {
      const avgTempC = dailyData[date].temps.reduce((a, b) => a + b, 0) / dailyData[date].temps.length;
      return isCelsius ? avgTempC : (avgTempC * 9/5) + 32;
    });
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: `Temperature (${isCelsius ? '°C' : '°F'})`,
          data: temps,
          fill: false,
          borderColor: '#3B82F6',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: false } }
      }
    });
  }

  function resetUI() {
    document.getElementById('location').textContent = '';
    document.getElementById('temperature').textContent = '';
    document.getElementById('description').textContent = '';
    document.getElementById('forecast').innerHTML = '';
    document.getElementById('hourly-forecast').innerHTML = '';
    document.getElementById('cosmicMoodText').textContent = '';
    document.getElementById('weather-news').innerHTML = '';
    document.getElementById('neighbors-temps').innerHTML = '';
    document.getElementById('humidity').textContent = '-';
    document.getElementById('wind-speed').textContent = '-';
    document.getElementById('pressure').textContent = '-';
    document.getElementById('uv-index').textContent = '-';
    document.getElementById('eco-impact').textContent = '-';
    document.getElementById('ar-suggestion').innerHTML = '';
    if (chartInstance) chartInstance.destroy();
    chartInstance = null;
    map.eachLayer(layer => { if (layer instanceof L.Marker) map.removeLayer(layer); });
    emojiMarkers = [];
    neighborsData = [];
    updateBackground(15, 'clear', currentTheme);
    updateWeatherIcon('clear');
  }

  function updateColorPalette(currentData) {
    const paletteDiv = document.getElementById('palette-swatches');
    paletteDiv.innerHTML = '';
    const temp = currentData.main.temp;
    const weatherMain = currentData.weather[0].main.toLowerCase();
    const colors = [
      temp > 30 ? '#FF4500' : temp >= 15 ? '#FFD700' : '#00CED1',
      weatherMain.includes('clear') ? '#87CEEB' : weatherMain.includes('rain') ? '#4682B4' : weatherMain.includes('snow') ? '#B0E0E6' : '#A9A9A9',
      '#FFFFFF',
      '#000000'
    ];
    colors.forEach(color => {
      const swatch = document.createElement('div');
      swatch.style.width = '50px';
      swatch.style.height = '50px';
      swatch.style.backgroundColor = color;
      swatch.style.border = '1px solid #ccc';
      paletteDiv.appendChild(swatch);
    });
    document.getElementById('downloadPalette').addEventListener('click', () => {
      const paletteData = colors.join('\n');
      const blob = new Blob([paletteData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `weather-palette-${currentData.name}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function updateLocalTimeAndSun(currentData) {
    const localTime = document.getElementById('local-time');
    const sunriseSunset = document.getElementById('sunrise-sunset');
    const sunMoonCanvas = document.getElementById('sun-moon-canvas').getContext('2d');
    const today = new Date('2025-06-29T20:55:00+05:30');
    const timezoneOffset = currentData.timezone / 3600;
    const localDate = new Date(today.getTime() + timezoneOffset * 3600 * 1000);
    localTime.textContent = `Local Time: ${localDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    const sunrise = new Date(currentData.sys.sunrise * 1000 + timezoneOffset * 3600 * 1000);
    const sunset = new Date(currentData.sys.sunset * 1000 + timezoneOffset * 3600 * 1000);
    sunriseSunset.textContent = `Sunrise: ${sunrise.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} | Sunset: ${sunset.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    sunMoonCanvas.clearRect(0, 0, 100, 100);
    const moonPhase = getMoonPhase(today);
    if (localDate >= sunrise && localDate <= sunset) {
      sunMoonCanvas.fillStyle = '#FFD700';
      sunMoonCanvas.beginPath();
      sunMoonCanvas.arc(50, 50, 40, 0, Math.PI * 2);
      sunMoonCanvas.fill();
    } else {
      sunMoonCanvas.fillStyle = '#D3D3D3';
      sunMoonCanvas.beginPath();
      sunMoonCanvas.arc(50, 50, 40, 0, Math.PI * 2);
      sunMoonCanvas.fill();
      if (moonPhase === 'Full Moon') {
        sunMoonCanvas.fillStyle = '#FFFFFF';
        sunMoonCanvas.beginPath();
        sunMoonCanvas.arc(50, 50, 35, 0, Math.PI * 2);
        sunMoonCanvas.fill();
      } else if (moonPhase === 'New Moon') {
        sunMoonCanvas.fillStyle = '#000000';
        sunMoonCanvas.beginPath();
        sunMoonCanvas.arc(50, 50, 10, 0, Math.PI * 2);
        sunMoonCanvas.fill();
      }
    }
  }

  function getMoonPhase(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const c = Math.floor(year / 100);
    const y = year % 100;
    const m = month;
    const d = day;
    const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + 2 - c + Math.floor(c / 4) - 1524.5;
    const daysSinceNewMoon = jd - 2451549.5;
    const newMoonCycle = 29.530588853;
    const phase = (daysSinceNewMoon % newMoonCycle) / newMoonCycle;
    if (phase < 0.25) return 'New Moon';
    if (phase < 0.5) return 'First Quarter';
    if (phase < 0.75) return 'Full Moon';
    return 'Last Quarter';
  }

  function updateActivitySuggestion(currentData) {
    const activityText = document.getElementById('activity-text');
    if (!activityText) {
      console.error('Activity text element not found');
      return;
    }
    if (!currentData) {
      activityText.textContent = 'Please search for a city to get activity suggestions.';
      return;
    }
    const temp = currentData.main.temp;
    const weatherMain = currentData.weather[0].main.toLowerCase();
    
    const suggestions = {
      hotClear: [
        'Great day for a swim or a picnic in the shade!',
        'Try a refreshing outdoor yoga session!',
        'Visit a local ice cream shop or have a barbecue!'
      ],
      moderateClear: [
        'Perfect for a hike or a bike ride!',
        'Go for a scenic walk in the park!',
        'Try some outdoor photography or sketching!'
      ],
      coldSnow: [
        'Time to build a snowman or go skiing!',
        'Enjoy sledding or ice skating!',
        'Have a hot chocolate and try snowball fights!'
      ],
      rainy: [
        'Stay cozy inside with a movie or a puzzle!',
        'Read a good book by the window!',
        'Try baking or crafting indoors!'
      ],
      default: [
        'Enjoy a leisurely walk or read a book!',
        'Visit a museum or local café!',
        'Relax with some music or journaling!'
      ]
    };

    let selectedSuggestions;
    if (temp > 30 && weatherMain.includes('clear')) {
      selectedSuggestions = suggestions.hotClear;
    } else if (temp >= 15 && weatherMain.includes('clear')) {
      selectedSuggestions = suggestions.moderateClear;
    } else if (temp < 15 && weatherMain.includes('snow')) {
      selectedSuggestions = suggestions.coldSnow;
    } else if (weatherMain.includes('rain')) {
      selectedSuggestions = suggestions.rainy;
    } else {
      selectedSuggestions = suggestions.default;
    }

    const randomIndex = Math.floor(Math.random() * selectedSuggestions.length);
    activityText.textContent = selectedSuggestions[randomIndex];
    console.log('New activity suggestion:', selectedSuggestions[randomIndex]);
  }

  const refreshActivity = document.getElementById('refreshActivity');
  if (refreshActivity) {
    refreshActivity.addEventListener('click', () => {
      if (!currentDataGlobal) {
        document.getElementById('alertMessages').textContent = 'Please search for a city first to get activity suggestions.';
        console.warn('No weather data available for activity suggestion');
        return;
      }
      navTabs.forEach(t => t.classList.remove('active'));
      const activityTab = Array.from(navTabs).find(tab => tab.getAttribute('data-tab') === 'activities');
      if (activityTab) {
        activityTab.classList.add('active');
        Object.values(sections).forEach(section => section.style.display = 'none');
        sections.activities.style.display = 'block';
      } else {
        console.error('Activities tab not found');
      }
      updateActivitySuggestion(currentDataGlobal);
    });
  } else {
    console.error('Refresh activity button not found');
  }

  const soundToggle = document.getElementById('soundToggle');
  if (soundToggle) {
    soundToggle.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundToggle.textContent = soundEnabled ? '🔇 Disable Sound' : '🔊 Enable Sound';
      if (soundEnabled && currentDataGlobal) playWeatherSound(currentDataGlobal.weather[0].main.toLowerCase());
      else stopWeatherSound();
    });
  } else {
    console.error('Sound toggle button not found');
  }

  function initAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
      gainNode.gain.value = 0.5;
    }
  }

  function playWeatherSound(weatherMain) {
    stopWeatherSound();
    initAudioContext();
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    let frequency = 440;
    if (weatherMain.includes('rain')) frequency = 200;
    else if (weatherMain.includes('snow')) frequency = 300;
    else if (weatherMain.includes('clear')) frequency = 500;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.connect(gainNode);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 2);
    oscillator.onended = () => {
      if (soundEnabled && currentDataGlobal) playWeatherSound(currentDataGlobal.weather[0].main.toLowerCase());
    };
  }

  function stopWeatherSound() {
    if (audioContext) {
      audioContext.close().then(() => {
        audioContext = null;
        gainNode = null;
      });
    }
  }

  function speakAlert(message) {
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  const cloudEditorToggle = document.getElementById('cloud-editor-toggle');
  const cloudEditor = document.querySelector('.cloud-editor');
  if (cloudEditorToggle && cloudEditor) {
    cloudEditorToggle.addEventListener('click', () => {
      cloudEditor.classList.toggle('visible');
      cloudEditorToggle.textContent = cloudEditor.classList.contains('visible') ? '▲' : '▼';
    });
  } else {
    console.error('Cloud editor toggle or cloud editor not found');
  }

  const moodToggle = document.getElementById('moodToggle');
  if (moodToggle) {
    moodToggle.addEventListener('click', () => {
      const moodInput = document.getElementById('mood-input');
      moodInput.classList.toggle('hidden');
    });
  } else {
    console.error('Mood toggle button not found');
  }

  const saveMood = document.getElementById('save-mood');
  if (saveMood) {
    saveMood.addEventListener('click', () => {
      userMood = document.getElementById('mood-select').value;
      document.getElementById('mood-input').classList.add('hidden');
      if (currentDataGlobal) {
        updateTemperatureDisplay(currentDataGlobal, dailyDataGlobal, hourlyDataGlobal);
      }
    });
  } else {
    console.error('Save mood button not found');
}

function updateARSuggestion(currentData) {
  const arSuggestion = document.getElementById('ar-suggestion');
  if (!arSuggestion) {
    console.error('AR suggestion element not found');
    return;
  }
  if (!currentData) {
    arSuggestion.textContent = '';
    return;
  }
  const weatherMain = currentData.weather[0].main.toLowerCase();
  let suggestion = '';
  if (weatherMain.includes('clear')) {
    suggestion = 'Point your device at the sky to visualize a starry night in AR!';
  } else if (weatherMain.includes('rain')) {
    suggestion = 'Use AR to see virtual raindrops falling around you!';
  } else if (weatherMain.includes('snow')) {
    suggestion = 'Experience a virtual snowfall in your room with AR!';
  } else {
    suggestion = 'Explore a cloudy AR environment matching the weather!';
  }
  arSuggestion.textContent = suggestion;
}

function updateEcoImpact(currentData) {
  const ecoImpact = document.getElementById('eco-impact');
  if (!ecoImpact) {
    console.error('Eco impact element not found');
    return;
  }
  if (!currentData) {
    ecoImpact.textContent = '-';
    return;
  }
  const temp = currentData.main.temp;
  let impact = '';
  if (temp > 30) {
    impact = 'High energy use due to cooling. Consider eco-friendly alternatives.';
  } else if (temp < 0) {
    impact = 'Increased heating demand. Use energy-efficient methods.';
  } else {
    impact = 'Moderate conditions. Ideal for low-energy outdoor activities.';
  }
  ecoImpact.textContent = impact;
}

function logWeatherData(currentData) {
  const today = new Date('2025-06-30T21:19:00+05:30').toLocaleDateString();
  const logEntry = {
    date: today,
    city: currentData.name,
    temp: currentData.main.temp,
    condition: currentData.weather[0].description
  };
  weatherLog.push(logEntry);
  if (weatherLog.length > 50) weatherLog.shift();
  localStorage.setItem('weatherLog', JSON.stringify(weatherLog));
}

function displayJournal() {
  if (!sections.journal) {
    console.error('Journal section not found');
    return;
  }
  sections.journal.innerHTML = `
    <h3 class="text-lg font-semibold">Weather Journal</h3>
    <textarea id="journal-input" class="w-full p-2 border rounded dark:text-white dark:border-gray-600" placeholder="Write about today's weather or your mood..."></textarea>
    <button id="add-journal" class="mt-2 p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700">Add Entry</button>
    <div id="journal-entries" class="mt-4"></div>
  `;
  sections.journal.classList.add(document.body.classList.contains('dark') ? 'dark' : 'light');
  updateJournalEntries();
  const addJournalButton = document.getElementById('add-journal');
  if (addJournalButton) {
    addJournalButton.addEventListener('click', addJournalEntry);
  } else {
    console.error('Add journal button not found');
  }
}

function addJournalEntry() {
  const journalInput = document.getElementById('journal-input');
  if (!journalInput) {
    console.error('Journal input not found');
    return;
  }
  const text = journalInput.value.trim();
  if (text) {
    const today = new Date('2025-06-30T21:19:00+05:30').toLocaleString();
    const entry = { date: today, text, city: currentDataGlobal ? currentDataGlobal.name : 'Unknown' };
    journalEntries.push(entry);
    localStorage.setItem('weatherJournal', JSON.stringify(journalEntries));
    journalInput.value = '';
    updateJournalEntries();
  }
}

function updateJournalEntries() {
  const journalEntriesDiv = document.getElementById('journal-entries');
  if (!journalEntriesDiv) {
    console.error('Journal entries div not found');
    return;
  }
  journalEntriesDiv.innerHTML = '';
  journalEntries.forEach((entry, index) => {
    const fibShadow = fibonacci(index + 3) * 2;
    const entryDiv = document.createElement('div');
    entryDiv.className = 'journal-entry';
    entryDiv.classList.add(document.body.classList.contains('dark') ? 'dark' : 'light');
    entryDiv.style.boxShadow = `0 ${fibShadow}px ${fibShadow * 2}px rgba(0, 0, 0, 0.2)`;
    entryDiv.innerHTML = `
      <p><strong>${entry.date}</strong> (${entry.city})</p>
      <p>${entry.text}</p>
    `;
    journalEntriesDiv.appendChild(entryDiv);
  });
}

function init() {
  updateBackground(15, 'clear', currentTheme);
  animateBackground();
  updateWeatherIcon('clear');
  resetUI();
}

init();
});
