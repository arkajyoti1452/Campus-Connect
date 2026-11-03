/**
 * CampusConnect - Configuration & Environment Service
 * Configures the Backend API Base URL and session credentials.
 */

(function () {
  const DEFAULT_API_BASE_URL = 'http://localhost:5000';

  // Read saved URL from localStorage or use default
  const savedBaseUrl = localStorage.getItem('cc_api_base_url');
  const savedAuthToken = localStorage.getItem('cc_auth_token');

  window.__CAMPUS_CONFIG__ = {
    API_BASE_URL: savedBaseUrl || (typeof process !== 'undefined' && process.env && (process.env.VITE_API_BASE_URL || process.env.API_BASE_URL)) || DEFAULT_API_BASE_URL,
    AUTH_TOKEN: savedAuthToken || '',
    
    // Helper to update API base URL at runtime
    setApiBaseUrl: function(url) {
      this.API_BASE_URL = url.trim().replace(/\/+$/, '');
      localStorage.setItem('cc_api_base_url', this.API_BASE_URL);
    },
    
    // Helper to update Auth Token at runtime
    setAuthToken: function(token) {
      this.AUTH_TOKEN = token ? token.trim() : '';
      if (this.AUTH_TOKEN) {
        localStorage.setItem('cc_auth_token', this.AUTH_TOKEN);
      } else {
        localStorage.removeItem('cc_auth_token');
      }
    }
  };
})();
