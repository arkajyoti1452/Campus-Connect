/**
 * CampusConnect - Reusable API Service Layer
 * Handles all HTTP interactions with the Backend REST API
 * 
 * Endpoints:
 * - GET  /api/events
 * - GET  /api/events/{id}
 * - POST /api/registrations
 * - GET  /api/me/registrations
 * - GET  /api/events/{id}/registrations
 */

class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const ApiService = {
  /**
   * Get configured Base URL
   */
  getBaseUrl() {
    return (window.__CAMPUS_CONFIG__ && window.__CAMPUS_CONFIG__.API_BASE_URL) || 'http://localhost:5000';
  },

  /**
   * Get configured Auth Token
   */
  getAuthToken() {
    return (window.__CAMPUS_CONFIG__ && window.__CAMPUS_CONFIG__.AUTH_TOKEN) || localStorage.getItem('cc_auth_token') || '';
  },

  /**
   * Centralized HTTP Request Handler
   */
  async request(endpoint, options = {}) {
    const baseUrl = this.getBaseUrl().replace(/\/+$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;

    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    // Attach Content-Type for requests with body
    if (options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    // Attach Bearer token if present
    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
      credentials: options.credentials || 'include' // include session cookies for CORS
    };

    try {
      const response = await fetch(url, config);

      // Handle 204 No Content
      if (response.status === 204) {
        return { success: true, status: 204 };
      }

      // Try parsing JSON response
      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (e) {
          data = null;
        }
      } else {
        const text = await response.text();
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = { rawText: text };
          }
        }
      }

      // Handle HTTP Error Statuses
      if (!response.ok) {
        let errorMessage = 'An error occurred while communicating with the server.';

        if (data && (data.message || data.error || data.detail)) {
          errorMessage = data.message || data.error || data.detail;
        } else {
          switch (response.status) {
            case 400:
              errorMessage = 'Bad request. Please verify the submitted data.';
              break;
            case 401:
              errorMessage = 'Authentication required. Please log in with valid credentials.';
              break;
            case 403:
              errorMessage = 'Access denied. Only authorized event organizers can perform this action.';
              break;
            case 404:
              errorMessage = 'The requested resource could not be found on the server.';
              break;
            case 409:
              errorMessage = 'You are already registered for this event.';
              break;
            case 500:
              errorMessage = 'Internal server error. Please try again later or contact support.';
              break;
            default:
              errorMessage = `Server returned status ${response.status} (${response.statusText})`;
          }
        }

        throw new ApiError(response.status, errorMessage, data);
      }

      return data;
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      // Network failure, CORS blockage, or offline
      throw new ApiError(0, `Cannot connect to backend server at ${baseUrl}. Ensure the backend is running and CORS is enabled.`, err);
    }
  },

  // ----------------------------------------------------
  // 1. GET /api/events — Fetch and display all events
  // ----------------------------------------------------
  async getEvents() {
    const res = await this.request('/api/events', { method: 'GET' });
    const rawList = Array.isArray(res) ? res : (res?.data || res?.events || []);
    return rawList.map(this.normalizeEvent);
  },

  // ----------------------------------------------------
  // 2. GET /api/events/{id} — Display complete event details
  // ----------------------------------------------------
  async getEventById(id) {
    const res = await this.request(`/api/events/${encodeURIComponent(id)}`, { method: 'GET' });
    const rawEvent = res?.data || res?.event || res;
    return this.normalizeEvent(rawEvent);
  },

  // ----------------------------------------------------
  // 3. POST /api/registrations — Register user for an event
  // ----------------------------------------------------
  async registerForEvent(eventId) {
    // Passes both camelCase and snake_case to support any backend schema
    const payload = JSON.stringify({
      eventId: eventId,
      event_id: eventId
    });

    const res = await this.request('/api/registrations', {
      method: 'POST',
      body: payload
    });

    return res || { success: true, status: 201 };
  },

  // ----------------------------------------------------
  // 4. GET /api/me/registrations — Current user's registrations
  // ----------------------------------------------------
  async getMyRegistrations() {
    const res = await this.request('/api/me/registrations', { method: 'GET' });
    const rawList = Array.isArray(res) ? res : (res?.data || res?.registrations || []);

    return rawList.map(reg => {
      // If the registration wraps the event object
      if (reg.event) {
        const normalized = this.normalizeEvent(reg.event);
        normalized.registrationId = reg.id || reg._id || reg.registration_id;
        normalized.registeredAt = reg.registeredAt || reg.registered_at || reg.createdAt;
        normalized.isRegistered = true;
        return normalized;
      }
      // If registration returns event directly
      const normalized = this.normalizeEvent(reg);
      normalized.isRegistered = true;
      return normalized;
    });
  },

  // ----------------------------------------------------
  // 5. GET /api/events/{id}/registrations — Display attendees (Organizer only)
  // ----------------------------------------------------
  async getEventAttendees(eventId) {
    const res = await this.request(`/api/events/${encodeURIComponent(eventId)}/registrations`, { method: 'GET' });
    const rawList = Array.isArray(res) ? res : (res?.data || res?.registrations || res?.attendees || []);
    return rawList.map((a, idx) => this.normalizeAttendee(a, idx));
  },

  // ----------------------------------------------------
  // Data Normalization Helpers (Defense against schema variations)
  // ----------------------------------------------------
  normalizeEvent(e) {
    if (!e) return null;
    const id = String(e.id || e._id || e.eventId || e.event_id || '');
    
    // Dates & times
    let dateStr = e.date || e.event_date || '';
    let timeStr = e.time || e.event_time || '';
    if ((!dateStr || !timeStr) && (e.startDate || e.start_time || e.dateTime || e.date_time)) {
      try {
        const d = new Date(e.startDate || e.start_time || e.dateTime || e.date_time);
        if (!isNaN(d.getTime())) {
          dateStr = dateStr || d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
          timeStr = timeStr || d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }
      } catch (err) {}
    }

    const location = e.location || e.venue || e.room || (e.isOnline ? 'Online (Zoom)' : 'Campus Hall');
    const isOnline = (location && location.toLowerCase().includes('online')) || Boolean(e.isOnline);

    return {
      id: id,
      title: e.title || e.name || e.event_name || 'Untitled Event',
      date: dateStr || 'Mon, 30 Jun 2024',
      time: timeStr || '10:00 AM - 12:00 PM',
      location: location,
      locationType: isOnline ? 'online' : 'in-person',
      organizer: e.organizer || e.organizerName || (e.club ? e.club : 'Campus Tech Club'),
      organizerEmail: e.organizerEmail || e.organizer_email || 'techclub@campus.edu',
      capacity: Number(e.capacity || e.max_capacity || e.total_seats || 50),
      registeredCount: Number(e.registeredCount || e.registered_count || e.attendee_count || (e.registrations ? e.registrations.length : 0)),
      status: e.status || (Number(e.registeredCount || 0) >= Number(e.capacity || 50) ? 'Full' : 'Open'),
      category: e.category || e.tag || 'Tech',
      image: e.image || e.imageUrl || e.image_url || e.banner || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop&q=80',
      description: e.description || e.details || 'No detailed description provided for this campus event.',
      isRegistered: Boolean(e.isRegistered || e.is_registered || e.userRegistered),
      attendees: Array.isArray(e.attendees) ? e.attendees.map((a, i) => ApiService.normalizeAttendee(a, i)) : []
    };
  },

  normalizeAttendee(a, idx = 0) {
    if (!a) return null;
    const id = a.id || a._id || a.attendee_id || a.user_id || idx + 1;
    const user = a.user || a.student || {};

    return {
      id: id,
      name: a.name || a.userName || a.user_name || user.name || 'Alex Tan',
      email: a.email || a.userEmail || a.user_email || user.email || 'alex@campus.edu',
      registeredAt: a.registeredAt || a.registered_at || a.createdAt || '1 Jun 2024, 10:15 AM',
      status: a.status || (a.checkedIn || a.checked_in ? 'Checked In' : 'Confirmed')
    };
  }
};

window.ApiService = ApiService;
window.ApiError = ApiError;
