/**
 * CampusConnect - Frontend Architecture & API Integration Layer
 * Connects the 13-Screen Wireframe Frontend to Backend REST API Endpoints:
 * - GET  /api/events
 * - GET  /api/events/{id}
 * - POST /api/registrations (201 Created or 409 Conflict)
 * - GET  /api/me/registrations
 * - GET  /api/events/{id}/registrations (Organizer only)
 */

class CampusStore {
  constructor() {
    this.events = [];
    this.myRegistrations = [];
    this.currentEventDetails = null;
    this.currentAttendees = [];
    
    this.user = JSON.parse(localStorage.getItem('cc_user')) || {
      isLoggedIn: true,
      role: 'student', // 'student' | 'organizer'
      name: 'Alex Tan',
      email: 'alex@campus.edu',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      major: 'Computer Science, Class of 2025',
      bio: 'Junior Developer & Tech enthusiast passionate about AI, design systems, and campus hackathons.'
    };

    this.currentScreen = 'home'; // 'landing' | 'login' | 'signup' | 'home' | 'events' | 'event-details' | 'my-registrations' | 'organizer-dashboard' | 'create-event' | 'attendees' | 'profile'
    this.selectedEventId = 'ai-basics';
    this.selectedAttendeeEventId = 'ai-basics';
    this.editingEventId = null;
    this.searchQuery = '';
    this.filterCategory = 'All';
    this.filterLocation = 'All';
    this.registrationsTab = 'upcoming'; // 'upcoming' | 'past'
    this.attendeeSearchQuery = '';

    // Asynchronous loading states
    this.loading = {
      events: false,
      eventDetails: false,
      registrations: false,
      attendees: false,
      submitting: false
    };

    // Error states per domain
    this.errors = {
      events: null,
      eventDetails: null,
      registrations: null,
      attendees: null
    };

    // Modal controllers
    this.modals = {
      registerConfirm: false,
      registerSuccess: false,
      digitalPass: false,
      editProfile: false,
      changePassword: false,
      apiSettings: false
    };

    // Toast notifications
    this.toasts = [];

    // Registered event IDs set for quick lookup
    this.registeredEventIds = new Set();
  }

  save() {
    localStorage.setItem('cc_user', JSON.stringify(this.user));
  }

  // ----------------------------------------------------
  // API Integration Actions
  // ----------------------------------------------------

  /**
   * 1. GET /api/events — Fetch and display all events
   */
  async loadEvents(force = false) {
    if (this.events.length > 0 && !force && !this.errors.events) return;
    
    this.loading.events = true;
    this.errors.events = null;
    this.render();

    try {
      const fetchedEvents = await ApiService.getEvents();
      this.events = fetchedEvents;
      
      // Update registration statuses
      this.events.forEach(e => {
        if (this.registeredEventIds.has(e.id)) {
          e.isRegistered = true;
        }
      });
    } catch (err) {
      console.error('[API] Failed to fetch /api/events:', err);
      this.errors.events = err.message || 'Failed to load events from backend.';
      this.showToast(this.errors.events, 'error');
    } finally {
      this.loading.events = false;
      this.render();
    }
  }

  /**
   * 2. GET /api/events/{id} — Display complete event details
   */
  async loadEventDetails(eventId) {
    this.selectedEventId = eventId;
    this.loading.eventDetails = true;
    this.errors.eventDetails = null;
    this.render();

    try {
      const event = await ApiService.getEventById(eventId);
      this.currentEventDetails = event;
      if (this.registeredEventIds.has(event.id)) {
        this.currentEventDetails.isRegistered = true;
      }
    } catch (err) {
      console.error(`[API] Failed to fetch /api/events/${eventId}:`, err);
      this.errors.eventDetails = err.message || 'Could not load event details from backend.';
      // Fallback to local item if already cached
      this.currentEventDetails = this.events.find(e => e.id === eventId) || null;
      this.showToast(this.errors.eventDetails, 'error');
    } finally {
      this.loading.eventDetails = false;
      this.render();
    }
  }

  /**
   * 3. POST /api/registrations — Register user for event
   * Handles 201 Created and 409 Conflict as specified
   */
  async submitRegistration(eventId) {
    const event = this.currentEventDetails || this.events.find(e => e.id === eventId);
    if (!event) return;

    this.loading.submitting = true;
    this.render();

    try {
      const res = await ApiService.registerForEvent(eventId);
      
      // 201 Created Success
      event.isRegistered = true;
      event.registeredCount = (event.registeredCount || 0) + 1;
      this.registeredEventIds.add(eventId);

      // Add to local myRegistrations list
      this.myRegistrations.unshift(event);

      this.modals.registerConfirm = false;
      this.modals.registerSuccess = true;
      this.showToast('Successfully registered for event!', 'success');
    } catch (err) {
      console.error('[API] Registration error:', err);
      
      if (err.status === 409) {
        // 409 Conflict: Already registered
        this.modals.registerConfirm = false;
        event.isRegistered = true;
        this.registeredEventIds.add(eventId);
        this.showToast('Notice: You are already registered for this event.', 'info');
      } else if (err.status === 401) {
        this.showToast('Please log in to register for events.', 'error');
        this.setScreen('login');
      } else {
        this.showToast(err.message || 'Registration failed. Please try again.', 'error');
      }
    } finally {
      this.loading.submitting = false;
      this.render();
    }
  }

  /**
   * 4. GET /api/me/registrations — Display current user's registrations
   */
  async loadMyRegistrations() {
    this.loading.registrations = true;
    this.errors.registrations = null;
    this.render();

    try {
      const list = await ApiService.getMyRegistrations();
      this.myRegistrations = list;
      
      // Sync registered IDs
      list.forEach(item => {
        this.registeredEventIds.add(item.id);
        const matchingEvent = this.events.find(e => e.id === item.id);
        if (matchingEvent) matchingEvent.isRegistered = true;
      });
    } catch (err) {
      console.error('[API] Failed to fetch /api/me/registrations:', err);
      this.errors.registrations = err.message || 'Could not load your registrations.';
      this.showToast(this.errors.registrations, 'error');
    } finally {
      this.loading.registrations = false;
      this.render();
    }
  }

  /**
   * 5. GET /api/events/{id}/registrations — Display attendees (Organizer only)
   */
  async loadAttendees(eventId) {
    this.selectedAttendeeEventId = eventId;
    this.loading.attendees = true;
    this.errors.attendees = null;
    this.render();

    // Verify role before or handle 401/403
    try {
      const attendees = await ApiService.getEventAttendees(eventId);
      this.currentAttendees = attendees;
    } catch (err) {
      console.error(`[API] Failed to fetch /api/events/${eventId}/registrations:`, err);
      if (err.status === 403 || err.status === 401) {
        this.errors.attendees = 'Access Denied: Only authorized event organizers can view attendees.';
      } else {
        this.errors.attendees = err.message || 'Could not load attendee roster.';
      }
      this.currentAttendees = [];
      this.showToast(this.errors.attendees, 'error');
    } finally {
      this.loading.attendees = false;
      this.render();
    }
  }

  // ----------------------------------------------------
  // Navigation & Screen Dispatcher
  // ----------------------------------------------------
  setScreen(screen, params = {}) {
    this.currentScreen = screen;
    if (params.eventId) {
      this.selectedEventId = params.eventId;
    }
    if (params.attendeeEventId) {
      this.selectedAttendeeEventId = params.attendeeEventId;
    }
    if (params.editingEventId !== undefined) {
      this.editingEventId = params.editingEventId;
    }

    // Trigger API loading for connected screens
    if (screen === 'events' || screen === 'home') {
      this.loadEvents();
    } else if (screen === 'event-details' && this.selectedEventId) {
      this.loadEventDetails(this.selectedEventId);
    } else if (screen === 'my-registrations') {
      this.loadMyRegistrations();
    } else if (screen === 'attendees' && this.selectedAttendeeEventId) {
      this.loadAttendees(this.selectedAttendeeEventId);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.render();
  }

  setUser(userData) {
    this.user = { ...this.user, ...userData };
    this.save();
    this.render();
  }

  setRole(role) {
    this.user.role = role;
    this.user.isLoggedIn = true;
    if (role === 'organizer') {
      this.currentScreen = 'organizer-dashboard';
    } else {
      this.currentScreen = 'home';
    }
    this.save();
    this.showToast(`Switched role to ${role === 'organizer' ? 'Event Organizer' : 'Student'}`, 'info');
    this.render();
  }

  logout() {
    this.user.isLoggedIn = false;
    this.currentScreen = 'landing';
    this.save();
    this.showToast('You have been logged out.', 'info');
    this.render();
  }

  login(role = 'student') {
    this.user.isLoggedIn = true;
    this.user.role = role;
    this.currentScreen = role === 'organizer' ? 'organizer-dashboard' : 'home';
    this.save();
    this.showToast(`Welcome back, ${this.user.name}!`, 'success');
    this.loadEvents();
  }

  getSelectedEvent() {
    if (this.currentEventDetails && this.currentEventDetails.id === this.selectedEventId) {
      return this.currentEventDetails;
    }
    return this.events.find(e => e.id === this.selectedEventId) || this.events[0] || {
      id: this.selectedEventId,
      title: 'Loading event...',
      date: '...',
      time: '...',
      location: '...',
      capacity: 50,
      registeredCount: 0,
      description: '...',
      category: 'General',
      organizer: 'Campus Tech Club'
    };
  }

  showToast(message, type = 'info') {
    const toast = { id: Date.now(), message, type };
    this.toasts.push(toast);
    this.renderToasts();
    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== toast.id);
      this.renderToasts();
    }, 4000);
  }

  renderToasts() {
    const container = document.getElementById('toast-container');
    if (!container) return;
    container.innerHTML = this.toasts.map(t => `
      <div class="animate-toast flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
        t.type === 'success' 
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
          : t.type === 'error'
          ? 'bg-rose-50 border-rose-200 text-rose-800'
          : 'bg-blue-50 border-blue-200 text-blue-900'
      }">
        <span class="text-base font-bold">${t.type === 'success' ? '✓' : (t.type === 'error' ? '✕' : 'ℹ')}</span>
        <span>${t.message}</span>
      </div>
    `).join('');
  }

  render() {
    renderApp();
  }
}

// Global Store Instance
const store = new CampusStore();

// UI Render Engine
function renderApp() {
  const root = document.getElementById('app-root');
  if (!root) return;

  root.innerHTML = `
    <div class="min-h-screen flex flex-col bg-slate-50 text-slate-900 relative">
      <!-- 1. Senior UI/UX Prototype Flow Navigator & Live API status -->
      ${renderWireframeNavigator()}

      <!-- 2. Global Navigation Bar -->
      ${renderHeader()}

      <!-- 3. Dynamic Screen Content -->
      <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20">
        ${renderCurrentScreen()}
      </main>

      <!-- 4. Footer -->
      ${renderFooter()}

      <!-- 5. Active Modals (Screens 7, 8, API Settings, etc.) -->
      ${renderModals()}

      <!-- 6. Toast Notification Anchor -->
      <div id="toast-container" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"></div>
    </div>
  `;

  // Bind icons
  if (window.lucide) {
    lucide.createIcons();
  }
}

/**
 * Top Wireframe Navigator & Live API Badge
 */
function renderWireframeNavigator() {
  const screens = [
    { id: 'landing', num: '1', name: 'Landing' },
    { id: 'login', num: '2', name: 'Log In' },
    { id: 'signup', num: '3', name: 'Sign Up' },
    { id: 'home', num: '4', name: 'Home' },
    { id: 'events', num: '5', name: 'Events (API)' },
    { id: 'event-details', num: '6', name: 'Details (API)' },
    { id: 'register-modal', num: '7', name: 'Register' },
    { id: 'success-modal', num: '8', name: 'Success' },
    { id: 'my-registrations', num: '9', name: 'My Regs (API)' },
    { id: 'organizer-dashboard', num: '10', name: 'Dashboard' },
    { id: 'create-event', num: '11', name: 'Create Event' },
    { id: 'attendees', num: '12', name: 'Attendees (API)' },
    { id: 'profile', num: '13', name: 'Profile' }
  ];

  const baseUrl = ApiService.getBaseUrl();

  return `
    <div class="bg-slate-900 text-white border-b border-slate-800 text-xs py-2 px-4 shadow-sm sticky top-0 z-40">
      <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        
        <div class="flex items-center gap-2 font-medium">
          <span class="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-600 text-white font-bold text-[10px]">API</span>
          <span class="font-semibold text-slate-200">REST Endpoints Integrated</span>
          <button 
            onclick="openApiSettingsModal()"
            class="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1 border border-slate-700"
            title="Configure Backend URL & Auth Token"
          >
            <i data-lucide="settings" class="w-3 h-3"></i>
            <span class="truncate max-w-[140px]">${baseUrl}</span>
          </button>
        </div>

        <!-- Flow pills -->
        <div class="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none max-w-full">
          ${screens.map(s => {
            let isActive = false;
            if (s.id === 'register-modal') isActive = store.modals.registerConfirm;
            else if (s.id === 'success-modal') isActive = store.modals.registerSuccess;
            else isActive = store.currentScreen === s.id && !store.modals.registerConfirm && !store.modals.registerSuccess;

            return `
              <button 
                onclick="handleNavigatorJump('${s.id}')"
                class="px-2.5 py-1 rounded-md transition-smooth whitespace-nowrap text-[11px] font-medium flex items-center gap-1 ${
                  isActive 
                    ? 'bg-blue-600 text-white font-semibold ring-1 ring-white/20 shadow-sm' 
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                }"
              >
                <span class="opacity-70 text-[10px] font-mono">${s.num}.</span>
                <span>${s.name}</span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Role Quick Switcher -->
        <div class="flex items-center gap-2 border-l border-slate-700 pl-3">
          <span class="text-slate-400 text-[11px]">Role:</span>
          <div class="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
            <button 
              onclick="store.setUser({isLoggedIn: false}); store.setScreen('landing')"
              class="px-2 py-0.5 rounded text-[11px] ${!store.user.isLoggedIn ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}"
            >
              Guest
            </button>
            <button 
              onclick="store.setRole('student')"
              class="px-2 py-0.5 rounded text-[11px] ${store.user.isLoggedIn && store.user.role === 'student' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}"
            >
              Student
            </button>
            <button 
              onclick="store.setRole('organizer')"
              class="px-2 py-0.5 rounded text-[11px] ${store.user.isLoggedIn && store.user.role === 'organizer' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}"
            >
              Organizer
            </button>
          </div>
        </div>

      </div>
    </div>
  `;
}

/**
 * Global Header Component
 */
function renderHeader() {
  const { isLoggedIn, role, name, avatar } = store.user;
  const current = store.currentScreen;

  return `
    <header class="glass-header sticky top-9 z-30 transition-smooth">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        <!-- Brand Logo -->
        <div class="flex items-center gap-8">
          <div 
            onclick="store.setScreen(store.user.isLoggedIn ? (store.user.role === 'organizer' ? 'organizer-dashboard' : 'home') : 'landing')"
            class="flex items-center gap-2.5 cursor-pointer group"
          >
            <div class="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:bg-blue-700 transition">
              <i data-lucide="compass" class="w-5 h-5"></i>
            </div>
            <span class="text-xl font-bold tracking-tight text-slate-900 group-hover:text-blue-600 transition">
              Campus<span class="text-blue-600">Connect</span>
            </span>
          </div>

          <!-- Navigation Links -->
          <nav class="hidden md:flex items-center gap-1">
            <button 
              onclick="store.setScreen('events')"
              class="px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                current === 'events' ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }"
            >
              Events
            </button>

            ${!isLoggedIn ? `
              <button 
                onclick="store.setScreen('landing')"
                class="px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                  current === 'landing' ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }"
              >
                About
              </button>
            ` : ''}

            ${isLoggedIn && role === 'student' ? `
              <button 
                onclick="store.setScreen('my-registrations')"
                class="px-3.5 py-2 rounded-lg text-sm font-medium transition relative ${
                  current === 'my-registrations' ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }"
              >
                My Registrations
                <span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                  ${store.registeredEventIds.size || store.myRegistrations.length}
                </span>
              </button>
            ` : ''}

            ${isLoggedIn && role === 'organizer' ? `
              <button 
                onclick="store.setScreen('organizer-dashboard')"
                class="px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                  current === 'organizer-dashboard' || current === 'create-event' || current === 'attendees' 
                    ? 'text-blue-600 bg-blue-50 font-semibold' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }"
              >
                My Events
              </button>
            ` : ''}
          </nav>
        </div>

        <!-- Auth Actions / Profile -->
        <div class="flex items-center gap-3">
          <!-- API Config Gear shortcut -->
          <button 
            onclick="openApiSettingsModal()"
            title="Backend API Settings"
            class="p-2 rounded-full text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition"
          >
            <i data-lucide="sliders-horizontal" class="w-4 h-4"></i>
          </button>

          ${!isLoggedIn ? `
            <button 
              onclick="store.setScreen('login')"
              class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-100 transition"
            >
              Log In
            </button>
            <button 
              onclick="store.setScreen('signup')"
              class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition shadow-blue-500/20"
            >
              Sign Up
            </button>
          ` : `
            <span class="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
              role === 'organizer' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
            }">
              ${role === 'organizer' ? 'Organizer Mode' : 'Student'}
            </span>

            <button 
              onclick="store.setScreen('profile')"
              title="My Profile"
              class="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 transition border border-slate-200"
            >
              <img src="${avatar}" alt="${name}" class="w-8 h-8 rounded-full object-cover ring-2 ring-white">
              <span class="hidden sm:inline text-sm font-medium text-slate-700 pr-1">${name.split(' ')[0]}</span>
            </button>
          `}
        </div>

      </div>
    </header>
  `;
}

/**
 * Screen Router
 */
function renderCurrentScreen() {
  switch (store.currentScreen) {
    case 'landing':
      return renderScreen1_Landing();
    case 'login':
      return renderScreen2_Login();
    case 'signup':
      return renderScreen3_SignUp();
    case 'home':
      return renderScreen4_Home();
    case 'events':
      return renderScreen5_EventList();
    case 'event-details':
      return renderScreen6_EventDetails();
    case 'my-registrations':
      return renderScreen9_MyRegistrations();
    case 'organizer-dashboard':
      return renderScreen10_OrganizerDashboard();
    case 'create-event':
      return renderScreen11_CreateEvent();
    case 'attendees':
      return renderScreen12_Attendees();
    case 'profile':
      return renderScreen13_Profile();
    default:
      return renderScreen4_Home();
  }
}

/**
 * Screen 1: Landing Page (Not Logged In)
 */
function renderScreen1_Landing() {
  const events = store.events.slice(0, 3);

  return `
    <div class="space-y-12">
      <!-- Hero Section -->
      <section class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 text-white p-8 md:p-14 shadow-xl">
        <div class="absolute -right-20 -top-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div class="relative z-10 max-w-2xl space-y-6">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-700/60 border border-blue-400/30 text-xs font-semibold text-blue-200">
            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
            <span>Connected to Backend REST API</span>
          </div>

          <h1 class="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
            Discover Events.<br/>
            Connect with Your Campus.
          </h1>

          <p class="text-lg md:text-xl text-blue-100 font-normal leading-relaxed">
            Find club activities, workshops, and more. Join events and be part of the vibrant campus community.
          </p>

          <div class="flex flex-wrap items-center gap-4 pt-2">
            <button 
              onclick="store.setScreen('signup')"
              class="px-6 py-3.5 rounded-xl font-bold bg-blue-500 hover:bg-blue-400 text-white shadow-lg transition transform hover:-translate-y-0.5 text-base flex items-center gap-2"
            >
              <span>Get Started</span>
              <i data-lucide="arrow-right" class="w-4 h-4"></i>
            </button>
            <button 
              onclick="store.setScreen('events')"
              class="px-6 py-3.5 rounded-xl font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition text-base backdrop-blur-sm"
            >
              Browse All Events
            </button>
          </div>
        </div>
      </section>

      <!-- Key Pillars -->
      <section class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="p-6 bg-white rounded-2xl border border-slate-200 card-shadow">
          <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <i data-lucide="calendar" class="w-6 h-6"></i>
          </div>
          <h3 class="font-bold text-lg text-slate-900 mb-1">Centralized Hub</h3>
          <p class="text-sm text-slate-600">All campus gatherings fetched live from <code class="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">GET /api/events</code>.</p>
        </div>

        <div class="p-6 bg-white rounded-2xl border border-slate-200 card-shadow">
          <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <i data-lucide="ticket" class="w-6 h-6"></i>
          </div>
          <h3 class="font-bold text-lg text-slate-900 mb-1">Instant 1-Click RSVP</h3>
          <p class="text-sm text-slate-600">Powered by <code class="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">POST /api/registrations</code> with 201 Created and 409 Conflict handling.</p>
        </div>

        <div class="p-6 bg-white rounded-2xl border border-slate-200 card-shadow">
          <div class="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
            <i data-lucide="users" class="w-6 h-6"></i>
          </div>
          <h3 class="font-bold text-lg text-slate-900 mb-1">Organizer Controls</h3>
          <p class="text-sm text-slate-600">Secure attendee roster via <code class="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">GET /api/events/{id}/registrations</code>.</p>
        </div>
      </section>

      <!-- Upcoming Events Preview -->
      <section class="space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-bold tracking-tight text-slate-900">Upcoming Events</h2>
          <button 
            onclick="store.setScreen('events')"
            class="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 group"
          >
            <span>View All</span>
            <i data-lucide="chevron-right" class="w-4 h-4 group-hover:translate-x-0.5 transition"></i>
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          ${events.map(e => `
            <div 
              onclick="store.setScreen('event-details', { eventId: '${e.id}' })"
              class="bg-white rounded-2xl border border-slate-200 overflow-hidden card-shadow-hover cursor-pointer group flex flex-col"
            >
              <div class="relative h-44 overflow-hidden bg-slate-100">
                <img src="${e.image}" alt="${e.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                <span class="absolute top-3 left-3 px-2.5 py-1 rounded-md text-xs font-semibold bg-white/90 backdrop-blur-sm text-slate-800 shadow-sm">
                  ${e.category}
                </span>
              </div>
              <div class="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 class="font-bold text-slate-900 text-lg group-hover:text-blue-600 transition mb-2">
                    ${e.title}
                  </h3>
                  <div class="flex items-center gap-2 text-xs font-medium text-slate-500 mb-2">
                    <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-600"></i>
                    <span>${e.date}</span>
                  </div>
                  <div class="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400"></i>
                    <span>${e.location}</span>
                  </div>
                </div>
                <div class="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span class="text-xs text-slate-500 font-medium">${e.organizer}</span>
                  <span class="text-xs font-semibold text-blue-600 group-hover:underline">View Details &rarr;</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    </div>
  `;
}

/**
 * Screen 2: Log In
 */
function renderScreen2_Login() {
  return `
    <div class="max-w-md mx-auto py-8">
      <div class="bg-white rounded-3xl border border-slate-200/80 p-8 card-shadow space-y-6">
        
        <div class="text-center space-y-2">
          <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-sm">
            <i data-lucide="log-in" class="w-6 h-6"></i>
          </div>
          <h2 class="text-2xl font-bold tracking-tight text-slate-900">Log In</h2>
          <p class="text-sm text-slate-500">Welcome back to CampusConnect!</p>
        </div>

        <!-- 1-Click Demo Logins -->
        <div class="p-3 bg-blue-50/70 rounded-xl border border-blue-100 space-y-2 text-xs">
          <div class="font-semibold text-blue-900 flex items-center gap-1.5">
            <i data-lucide="zap" class="w-3.5 h-3.5 text-blue-600"></i>
            <span>Fast-Track Demo Credentials:</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button 
              onclick="store.login('student')"
              class="w-full py-1.5 px-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
            >
              Sign In as Student
            </button>
            <button 
              onclick="store.login('organizer')"
              class="w-full py-1.5 px-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700 transition"
            >
              Sign In as Organizer
            </button>
          </div>
        </div>

        <form onsubmit="handleLoginForm(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Email</label>
            <input 
              type="email" 
              id="login-email"
              required
              value="${store.user.email || 'you@campus.edu'}" 
              placeholder="you@campus.edu"
              class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Password</label>
              <a href="#" onclick="alert('Password reset link simulated.'); return false;" class="text-xs text-blue-600 hover:underline">Forgot?</a>
            </div>
            <div class="relative">
              <input 
                type="password" 
                id="login-password"
                required
                value="secretpassword" 
                placeholder="••••••••"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm pr-10"
              />
              <button 
                type="button" 
                onclick="togglePasswordVisibility('login-password')"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <i data-lucide="eye" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <button 
            type="submit"
            class="w-full py-3.5 px-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition text-sm"
          >
            Log In
          </button>
        </form>

        <div class="pt-4 border-t border-slate-100 text-center">
          <p class="text-xs text-slate-500">
            Don't have an account? 
            <button onclick="store.setScreen('signup')" class="text-blue-600 font-semibold hover:underline">
              Sign Up
            </button>
          </p>
        </div>

      </div>
    </div>
  `;
}

/**
 * Screen 3: Sign Up
 */
function renderScreen3_SignUp() {
  return `
    <div class="max-w-md mx-auto py-8">
      <div class="bg-white rounded-3xl border border-slate-200/80 p-8 card-shadow space-y-6">
        
        <div class="text-center space-y-2">
          <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-sm">
            <i data-lucide="user-plus" class="w-6 h-6"></i>
          </div>
          <h2 class="text-2xl font-bold tracking-tight text-slate-900">Create an Account</h2>
          <p class="text-sm text-slate-500">Join CampusConnect today</p>
        </div>

        <form onsubmit="handleSignupForm(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Full Name</label>
            <input 
              type="text" 
              id="signup-name"
              required
              placeholder="Your name"
              value="Alex Tan"
              class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Email</label>
            <input 
              type="email" 
              id="signup-email"
              required
              placeholder="you@campus.edu"
              value="alex@campus.edu"
              class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Password</label>
            <div class="relative">
              <input 
                type="password" 
                id="signup-password"
                required
                minlength="8"
                placeholder="At least 8 characters"
                value="securepass123"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm pr-10"
              />
              <button 
                type="button" 
                onclick="togglePasswordVisibility('signup-password')"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <i data-lucide="eye" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Account Type</label>
            <div class="grid grid-cols-2 gap-3">
              <label class="flex items-center gap-2 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                <input type="radio" name="signup-role" value="student" checked class="text-blue-600 focus:ring-blue-500">
                <span class="text-xs font-semibold text-slate-800">Student</span>
              </label>
              <label class="flex items-center gap-2 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                <input type="radio" name="signup-role" value="organizer" class="text-blue-600 focus:ring-blue-500">
                <span class="text-xs font-semibold text-slate-800">Organizer</span>
              </label>
            </div>
          </div>

          <button 
            type="submit"
            class="w-full py-3.5 px-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition text-sm"
          >
            Sign Up
          </button>
        </form>

        <div class="pt-4 border-t border-slate-100 text-center">
          <p class="text-xs text-slate-500">
            Already have an account? 
            <button onclick="store.setScreen('login')" class="text-blue-600 font-semibold hover:underline">
              Sign In
            </button>
          </p>
        </div>

      </div>
    </div>
  `;
}

/**
 * Screen 4: Home (Logged In as Student)
 */
function renderScreen4_Home() {
  const upcomingEvents = store.events.slice(0, 3);

  return `
    <div class="space-y-10">
      
      <!-- Welcome Hero Banner -->
      <section class="relative rounded-3xl overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white p-8 md:p-12 shadow-lg">
        <div class="relative z-10 max-w-2xl space-y-4">
          <span class="inline-block px-3 py-1 rounded-full bg-white/20 text-xs font-semibold tracking-wide">
            Student Portal
          </span>
          <h1 class="text-3xl md:text-5xl font-extrabold tracking-tight">
            Welcome, ${store.user.name.split(' ')[0]}!
          </h1>
          <p class="text-base md:text-lg text-blue-100">
            Discover and join amazing events happening across campus.
          </p>

          <!-- Search Bar -->
          <div class="pt-2">
            <form onsubmit="handleHomeSearch(event)" class="flex items-center gap-2 max-w-lg bg-white rounded-2xl p-1.5 shadow-xl">
              <div class="flex-1 flex items-center px-3 gap-2">
                <i data-lucide="search" class="w-5 h-5 text-slate-400"></i>
                <input 
                  type="text" 
                  id="home-search-input"
                  placeholder="Search events, clubs, or topics..." 
                  class="w-full text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                />
              </div>
              <button 
                type="submit"
                class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition flex items-center gap-1.5"
              >
                <span>Search</span>
                <i data-lucide="arrow-right" class="w-4 h-4"></i>
              </button>
            </form>
          </div>
        </div>
      </section>

      <!-- KPI metrics -->
      <section class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-2xl border border-slate-200 card-shadow flex items-center gap-3.5">
          <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <i data-lucide="calendar" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="text-xl font-bold text-slate-900">${store.events.length}</div>
            <div class="text-xs text-slate-500 font-medium">Backend Events</div>
          </div>
        </div>

        <div 
          onclick="store.setScreen('my-registrations')"
          class="bg-white p-4 rounded-2xl border border-slate-200 card-shadow flex items-center gap-3.5 cursor-pointer hover:border-blue-300 transition"
        >
          <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <i data-lucide="check-circle" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="text-xl font-bold text-slate-900">${store.registeredEventIds.size}</div>
            <div class="text-xs text-slate-500 font-medium">My Registered Events</div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 card-shadow flex items-center gap-3.5">
          <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <i data-lucide="shield" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="text-xl font-bold text-slate-900">REST API</div>
            <div class="text-xs text-slate-500 font-medium">CORS & JWT Ready</div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-slate-200 card-shadow flex items-center gap-3.5">
          <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <i data-lucide="award" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="text-xl font-bold text-slate-900">12 hrs</div>
            <div class="text-xs text-slate-500 font-medium">Service Credits</div>
          </div>
        </div>
      </section>

      <!-- Upcoming Events -->
      <section class="space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-bold tracking-tight text-slate-900">Upcoming Events</h2>
          <button 
            onclick="store.setScreen('events')"
            class="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 group"
          >
            <span>View All</span>
            <i data-lucide="arrow-right" class="w-4 h-4 group-hover:translate-x-0.5 transition"></i>
          </button>
        </div>

        ${store.loading.events ? renderSkeletonGrid() : `
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${upcomingEvents.map(e => `
              <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden card-shadow-hover flex flex-col justify-between">
                <div>
                  <div class="relative h-44 overflow-hidden bg-slate-100">
                    <img src="${e.image}" alt="${e.title}" class="w-full h-full object-cover">
                    ${e.isRegistered ? `
                      <span class="absolute top-3 right-3 px-2 py-1 rounded-md text-[11px] font-bold bg-emerald-500 text-white shadow-sm flex items-center gap-1">
                        <i data-lucide="check" class="w-3 h-3"></i> Registered
                      </span>
                    ` : ''}
                  </div>
                  <div class="p-5 space-y-2">
                    <span class="text-[11px] font-bold text-blue-600 uppercase tracking-wider">${e.category}</span>
                    <h3 class="font-bold text-slate-900 text-lg leading-snug">${e.title}</h3>
                    <div class="flex items-center gap-2 text-xs text-slate-500 font-medium">
                      <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>
                      <span>${e.date}</span>
                    </div>
                    <div class="flex items-center gap-2 text-xs text-slate-500 font-medium">
                      <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400"></i>
                      <span>${e.location}</span>
                    </div>
                  </div>
                </div>

                <div class="p-5 pt-0">
                  <button 
                    onclick="store.setScreen('event-details', { eventId: '${e.id}' })"
                    class="w-full py-2.5 rounded-xl border border-slate-300 hover:border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold text-sm transition"
                  >
                    View Details
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </section>

    </div>
  `;
}

/**
 * Screen 5: Event List (Connected to GET /api/events)
 */
function renderScreen5_EventList() {
  const filtered = store.events.filter(e => {
    const matchesSearch = e.title.toLowerCase().includes(store.searchQuery.toLowerCase()) ||
                          e.description.toLowerCase().includes(store.searchQuery.toLowerCase()) ||
                          e.location.toLowerCase().includes(store.searchQuery.toLowerCase());
    const matchesCat = store.filterCategory === 'All' || e.category === store.filterCategory;
    const matchesLoc = store.filterLocation === 'All' || 
                       (store.filterLocation === 'Online' && e.locationType === 'online') ||
                       (store.filterLocation === 'In-Person' && e.locationType === 'in-person');
    return matchesSearch && matchesCat && matchesLoc;
  });

  const categories = ['All', 'Tech', 'Arts', 'Social', 'Career', 'Workshop'];

  return `
    <div class="space-y-6">
      
      <!-- Header + Title -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-3xl font-bold tracking-tight text-slate-900">All Events</h1>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800">GET /api/events</span>
          </div>
          <p class="text-sm text-slate-500">Live dynamic events fetched directly from your backend REST API.</p>
        </div>
        <div class="flex items-center gap-2">
          <button 
            onclick="store.loadEvents(true)" 
            class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-sm"
            title="Refresh events from API"
          >
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5 ${store.loading.events ? 'animate-spin' : ''}"></i>
            <span>Refresh</span>
          </button>
          <div class="text-xs text-slate-500 font-medium">
            Showing <strong class="text-slate-800">${filtered.length}</strong> of ${store.events.length}
          </div>
        </div>
      </div>

      <!-- Backend Connection Error Banner -->
      ${store.errors.events ? `
        <div class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 text-rose-600 font-bold">!</div>
            <div>
              <p class="font-bold text-sm">Failed to connect to Backend REST API</p>
              <p class="text-xs text-rose-600">${store.errors.events}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="openApiSettingsModal()" class="px-3 py-1.5 bg-white border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100">
              Change API URL
            </button>
            <button onclick="store.loadEvents(true)" class="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700">
              Retry
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Search & Filters Toolbar -->
      <div class="bg-white p-4 rounded-2xl border border-slate-200 card-shadow space-y-4">
        <div class="flex flex-col sm:flex-row items-stretch gap-3">
          <!-- Search input -->
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
            <input 
              type="text" 
              placeholder="Search events by title, description, or location..."
              value="${store.searchQuery}"
              oninput="handleSearchChange(event)"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <!-- Format Filter -->
          <div class="flex items-center gap-2">
            <select 
              onchange="handleLocationFilter(event)"
              class="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="All" ${store.filterLocation === 'All' ? 'selected' : ''}>Location: All</option>
              <option value="In-Person" ${store.filterLocation === 'In-Person' ? 'selected' : ''}>In-Person</option>
              <option value="Online" ${store.filterLocation === 'Online' ? 'selected' : ''}>Online (Zoom)</option>
            </select>
          </div>
        </div>

        <!-- Category Pills -->
        <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1">
          <span class="text-xs font-semibold text-slate-400 mr-1">Categories:</span>
          ${categories.map(cat => `
            <button 
              onclick="handleCategoryChange('${cat}')"
              class="px-3 py-1 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                store.filterCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }"
            >
              ${cat}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Events List Content -->
      ${store.loading.events ? renderSkeletonList() : `
        ${filtered.length === 0 ? `
          <div class="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <i data-lucide="search-x" class="w-6 h-6"></i>
            </div>
            <h3 class="font-bold text-slate-800">No events found</h3>
            <p class="text-xs text-slate-500">No events matched your search criteria or the backend returned an empty array.</p>
            <button onclick="clearFilters()" class="text-xs font-semibold text-blue-600 hover:underline">Reset filters</button>
          </div>
        ` : `
          <div class="space-y-4">
            ${filtered.map(e => `
              <div class="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 card-shadow-hover flex flex-col sm:flex-row items-center gap-5 transition">
                
                <!-- Thumbnail -->
                <div class="w-full sm:w-44 h-32 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 relative">
                  <img src="${e.image}" alt="${e.title}" class="w-full h-full object-cover">
                  <span class="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-white/90 backdrop-blur-sm text-slate-800">
                    ${e.category}
                  </span>
                </div>

                <!-- Info -->
                <div class="flex-1 space-y-2 text-center sm:text-left">
                  <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <h3 class="font-bold text-lg text-slate-900 hover:text-blue-600 transition cursor-pointer" onclick="store.setScreen('event-details', { eventId: '${e.id}' })">
                      ${e.title}
                    </h3>
                    ${e.isRegistered ? `
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <i data-lucide="check" class="w-3 h-3"></i> Registered
                      </span>
                    ` : ''}
                  </div>

                  <div class="flex flex-wrap items-center justify-center sm:justify-start gap-y-1 gap-x-4 text-xs font-medium text-slate-500">
                    <div class="flex items-center gap-1.5">
                      <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-600"></i>
                      <span>${e.date}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <i data-lucide="clock" class="w-3.5 h-3.5 text-slate-400"></i>
                      <span>${e.time}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400"></i>
                      <span>${e.location}</span>
                    </div>
                  </div>

                  <div class="text-xs text-slate-500 flex items-center justify-center sm:justify-start gap-2">
                    <span>Organized by <strong class="text-slate-700">${e.organizer}</strong></span>
                    <span>•</span>
                    <span>Seats: <strong class="text-slate-700">${e.registeredCount}/${e.capacity}</strong></span>
                  </div>
                </div>

                <!-- Action button -->
                <div class="w-full sm:w-auto flex-shrink-0">
                  <button 
                    onclick="store.setScreen('event-details', { eventId: '${e.id}' })"
                    class="w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-sm border border-slate-300 hover:border-blue-600 text-blue-600 hover:bg-blue-50 transition"
                  >
                    View Details
                  </button>
                </div>

              </div>
            `).join('')}
          </div>
        `}
      `}

    </div>
  `;
}

/**
 * Screen 6: Event Details (Connected to GET /api/events/{id})
 */
function renderScreen6_EventDetails() {
  const e = store.getSelectedEvent();
  const fillPercentage = Math.min(100, Math.round(((e.registeredCount || 0) / (e.capacity || 50)) * 100));

  if (store.loading.eventDetails) {
    return `
      <div class="space-y-6">
        <div class="h-6 w-32 skeleton rounded"></div>
        <div class="bg-white rounded-3xl border border-slate-200 p-8 space-y-6">
          <div class="h-64 skeleton rounded-2xl"></div>
          <div class="grid grid-cols-3 gap-6">
            <div class="col-span-2 space-y-4">
              <div class="h-8 w-2/3 skeleton rounded"></div>
              <div class="h-24 skeleton rounded"></div>
            </div>
            <div class="col-span-1 h-48 skeleton rounded-2xl"></div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="space-y-6">
      <!-- Breadcrumbs -->
      <nav class="flex items-center justify-between text-xs font-medium text-slate-500">
        <div class="flex items-center gap-2">
          <button onclick="store.setScreen('events')" class="hover:text-blue-600">Events</button>
          <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
          <span class="text-slate-800 font-semibold truncate max-w-xs">${e.title}</span>
        </div>
        <span class="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-100 text-slate-600">
          GET /api/events/${e.id}
        </span>
      </nav>

      <!-- Main Event Card -->
      <div class="bg-white rounded-3xl border border-slate-200/80 overflow-hidden card-shadow">
        
        <!-- Hero Banner Image -->
        <div class="relative h-64 md:h-80 w-full bg-slate-900">
          <img src="${e.image}" alt="${e.title}" class="w-full h-full object-cover opacity-90">
          <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent"></div>
          
          <div class="absolute bottom-6 left-6 right-6 text-white space-y-2">
            <span class="inline-block px-3 py-1 rounded-md text-xs font-bold bg-blue-600 text-white shadow-sm">
              ${e.category}
            </span>
            <h1 class="text-2xl md:text-4xl font-extrabold tracking-tight">${e.title}</h1>
          </div>
        </div>

        <!-- Content Grid -->
        <div class="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <!-- Left: Detailed Content -->
          <div class="lg:col-span-2 space-y-6">
            
            <!-- Quick Meta strip -->
            <div class="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 text-sm">
              <div class="flex items-center gap-2 text-slate-700">
                <i data-lucide="calendar" class="w-4 h-4 text-blue-600"></i>
                <span class="font-semibold">${e.date}</span>
              </div>
              <div class="text-slate-300">•</div>
              <div class="flex items-center gap-2 text-slate-700">
                <i data-lucide="clock" class="w-4 h-4 text-blue-600"></i>
                <span>${e.time}</span>
              </div>
              <div class="text-slate-300">•</div>
              <div class="flex items-center gap-2 text-slate-700">
                <i data-lucide="map-pin" class="w-4 h-4 text-blue-600"></i>
                <span>${e.location}</span>
              </div>
            </div>

            <!-- Description -->
            <div class="space-y-4">
              <h2 class="text-xl font-bold text-slate-900">Description</h2>
              <div class="text-slate-600 text-sm leading-relaxed whitespace-pre-line">
                ${e.description}
              </div>
            </div>

            <!-- Organizer profile card -->
            <div class="pt-6 border-t border-slate-100 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm">
                  ${(e.organizer || 'CC').substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div class="text-xs text-slate-400 font-medium">Hosted by</div>
                  <div class="text-sm font-bold text-slate-900">${e.organizer}</div>
                </div>
              </div>
              <a href="mailto:${e.organizerEmail}" class="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
                <i data-lucide="mail" class="w-3.5 h-3.5"></i>
                <span>Contact Organizer</span>
              </a>
            </div>

          </div>

          <!-- Right: Event Details Card (Screen 6 Sidebar) -->
          <div class="lg:col-span-1">
            <div class="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-6 sticky top-28">
              
              <h3 class="text-base font-bold text-slate-900">Event Details</h3>

              <div class="space-y-3 text-sm">
                <div class="flex justify-between items-center py-2 border-b border-slate-200">
                  <span class="text-slate-500">Capacity</span>
                  <span class="font-bold text-slate-900">${e.capacity} seats</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-slate-200">
                  <span class="text-slate-500">Registered</span>
                  <span class="font-bold text-slate-900">${e.registeredCount} attendees</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-slate-200">
                  <span class="text-slate-500">Status</span>
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                    ${e.status}
                  </span>
                </div>
              </div>

              <!-- Capacity progress bar -->
              <div class="space-y-1.5">
                <div class="flex justify-between text-xs font-semibold text-slate-600">
                  <span>Occupancy</span>
                  <span>${fillPercentage}%</span>
                </div>
                <div class="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div class="h-full bg-blue-600 rounded-full transition-all duration-500" style="width: ${fillPercentage}%"></div>
                </div>
              </div>

              <!-- Primary CTA: Register (Opens Screen 7 Modal) -->
              ${e.isRegistered ? `
                <div class="space-y-2">
                  <div class="w-full py-3 px-4 rounded-xl font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 text-center text-sm flex items-center justify-center gap-2">
                    <i data-lucide="check-circle" class="w-4 h-4"></i>
                    <span>You're Registered!</span>
                  </div>
                  <button 
                    onclick="openDigitalPassModal('${e.id}')"
                    class="w-full py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 hover:border-slate-400 text-slate-700 transition"
                  >
                    View Ticket Pass
                  </button>
                </div>
              ` : `
                <button 
                  onclick="openRegisterConfirmModal('${e.id}')"
                  class="w-full py-3.5 px-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition text-sm flex items-center justify-center gap-2"
                >
                  <i data-lucide="ticket" class="w-4 h-4"></i>
                  <span>Register for Event</span>
                </button>
              `}

              <div class="text-center">
                <p class="text-[11px] text-slate-400">
                  Free admission. RSVP connected to <code class="font-mono">POST /api/registrations</code>.
                </p>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  `;
}

/**
 * Screen 9: My Registrations (Connected to GET /api/me/registrations)
 */
function renderScreen9_MyRegistrations() {
  const registeredEvents = store.myRegistrations.length > 0 
    ? store.myRegistrations 
    : store.events.filter(e => store.registeredEventIds.has(e.id) || e.isRegistered);

  return `
    <div class="space-y-6">
      
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-3xl font-bold tracking-tight text-slate-900">My Registrations</h1>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800">GET /api/me/registrations</span>
          </div>
          <p class="text-sm text-slate-500">Manage your active event reservations and entry passes.</p>
        </div>
        <button 
          onclick="store.loadMyRegistrations()" 
          class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-sm"
        >
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5 ${store.loading.registrations ? 'animate-spin' : ''}"></i>
          <span>Sync Registrations</span>
        </button>
      </div>

      <!-- Tabs -->
      <div class="border-b border-slate-200">
        <div class="flex gap-8">
          <button 
            onclick="setRegistrationsTab('upcoming')"
            class="py-3 px-1 border-b-2 font-bold text-sm transition relative ${
              store.registrationsTab === 'upcoming' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }"
          >
            Upcoming
            <span class="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              ${registeredEvents.length}
            </span>
          </button>

          <button 
            onclick="setRegistrationsTab('past')"
            class="py-3 px-1 border-b-2 font-bold text-sm transition relative ${
              store.registrationsTab === 'past' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }"
          >
            Past Events
            <span class="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
              1
            </span>
          </button>
        </div>
      </div>

      <!-- Tab Content -->
      ${store.loading.registrations ? renderSkeletonList() : `
        ${store.registrationsTab === 'upcoming' ? `
          ${registeredEvents.length === 0 ? `
            <div class="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
              <div class="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <i data-lucide="calendar-plus" class="w-7 h-7"></i>
              </div>
              <h3 class="font-bold text-slate-800 text-lg">No active registrations</h3>
              <p class="text-sm text-slate-500 max-w-sm mx-auto">You haven't registered for any events yet. Browse upcoming sessions and register in one click.</p>
              <button 
                onclick="store.setScreen('events')"
                class="px-5 py-2.5 rounded-xl font-bold bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
              >
                Browse Events
              </button>
            </div>
          ` : `
            <div class="space-y-4">
              ${registeredEvents.map(e => `
                <div class="bg-white rounded-2xl border border-slate-200 p-5 card-shadow flex flex-col md:flex-row items-center justify-between gap-5">
                  <div class="flex items-center gap-4 w-full md:w-auto">
                    <img src="${e.image}" alt="${e.title}" class="w-24 h-20 rounded-xl object-cover flex-shrink-0">
                    <div class="space-y-1">
                      <span class="text-[10px] font-bold text-blue-600 uppercase tracking-wider">${e.category}</span>
                      <h3 class="font-bold text-slate-900 text-base hover:text-blue-600 cursor-pointer" onclick="store.setScreen('event-details', { eventId: '${e.id}' })">
                        ${e.title}
                      </h3>
                      <div class="flex items-center gap-3 text-xs text-slate-500 font-medium">
                        <span>${e.date}</span>
                        <span>•</span>
                        <span>${e.location}</span>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 w-full md:w-auto justify-end">
                    <button 
                      onclick="openDigitalPassModal('${e.id}')"
                      class="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition flex items-center gap-1.5"
                    >
                      <i data-lucide="qr-code" class="w-3.5 h-3.5"></i>
                      <span>Ticket Pass</span>
                    </button>
                    <button 
                      onclick="store.setScreen('event-details', { eventId: '${e.id}' })"
                      class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        ` : `
          <!-- Past Events -->
          <div class="space-y-4">
            <div class="bg-white rounded-2xl border border-slate-200 p-5 card-shadow flex flex-col md:flex-row items-center justify-between gap-5 opacity-80">
              <div class="flex items-center gap-4 w-full md:w-auto">
                <div class="w-24 h-20 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0">
                  <i data-lucide="check-circle-2" class="w-8 h-8 text-emerald-500"></i>
                </div>
                <div class="space-y-1">
                  <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Completed</span>
                  <h3 class="font-bold text-slate-900 text-base">Campus Hackathon Spring '24</h3>
                  <div class="text-xs text-slate-500">Fri, 10 May 2024 • Innovation Hub</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">Attended ✓</span>
              </div>
            </div>
          </div>
        `}
      `}

    </div>
  `;
}

/**
 * Screen 10: Organizer Dashboard
 */
function renderScreen10_OrganizerDashboard() {
  const events = store.events;

  return `
    <div class="space-y-8">
      
      <!-- Top Title + Action -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold mb-1">
            <i data-lucide="crown" class="w-3.5 h-3.5"></i>
            <span>Organizer Portal</span>
          </div>
          <h1 class="text-3xl font-bold tracking-tight text-slate-900">My Events</h1>
          <p class="text-sm text-slate-500">Manage your club activities and inspect live attendee rosters.</p>
        </div>

        <button 
          onclick="store.setScreen('create-event', { editingEventId: null })"
          class="px-5 py-3 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-2 text-sm"
        >
          <i data-lucide="plus" class="w-4 h-4"></i>
          <span>+ Create Event</span>
        </button>
      </div>

      <!-- Organizer KPIs -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white p-5 rounded-2xl border border-slate-200 card-shadow flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <i data-lucide="calendar" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="text-2xl font-extrabold text-slate-900">${events.length}</div>
            <div class="text-xs text-slate-500 font-medium">Total Events Hosted</div>
          </div>
        </div>

        <div class="bg-white p-5 rounded-2xl border border-slate-200 card-shadow flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <i data-lucide="users" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="text-2xl font-extrabold text-slate-900">
              ${events.reduce((acc, curr) => acc + (curr.registeredCount || 0), 0)}
            </div>
            <div class="text-xs text-slate-500 font-medium">Total Attendees</div>
          </div>
        </div>

        <div class="bg-white p-5 rounded-2xl border border-slate-200 card-shadow flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <i data-lucide="trending-up" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="text-2xl font-extrabold text-slate-900">76%</div>
            <div class="text-xs text-slate-500 font-medium">Average Fill Rate</div>
          </div>
        </div>
      </div>

      <!-- Events Management List (Screen 10 wireframe) -->
      <div class="bg-white rounded-2xl border border-slate-200 card-shadow overflow-hidden">
        <div class="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 class="font-bold text-slate-900 text-lg">Active Listings</h3>
          <span class="text-xs text-slate-500">${events.length} Events active</span>
        </div>

        <div class="divide-y divide-slate-100">
          ${events.map(e => `
            <div class="p-5 flex flex-col md:flex-row items-center justify-between gap-4 hover:bg-slate-50/70 transition">
              
              <div class="flex items-center gap-4 w-full md:w-auto">
                <img src="${e.image}" alt="${e.title}" class="w-20 h-16 rounded-xl object-cover flex-shrink-0">
                <div class="space-y-1">
                  <h4 class="font-bold text-slate-900 text-base">${e.title}</h4>
                  <div class="flex items-center gap-3 text-xs text-slate-500">
                    <span>${e.date}</span>
                    <span>•</span>
                    <span>${e.location}</span>
                  </div>
                  <div class="text-xs text-slate-600">
                    Registrations: <strong class="text-blue-600 font-bold">${e.registeredCount}/${e.capacity}</strong>
                  </div>
                </div>
              </div>

              <!-- Actions matching Screen 10 wireframe: [Edit] [View Attendees] -->
              <div class="flex items-center gap-2.5 w-full md:w-auto justify-end">
                <button 
                  onclick="store.setScreen('create-event', { editingEventId: '${e.id}' })"
                  class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                >
                  Edit
                </button>
                <button 
                  onclick="store.setScreen('attendees', { attendeeEventId: '${e.id}' })"
                  class="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition flex items-center gap-1.5"
                >
                  <i data-lucide="users" class="w-3.5 h-3.5"></i>
                  <span>View Attendees</span>
                </button>
              </div>

            </div>
          `).join('')}
        </div>
      </div>

    </div>
  `;
}

/**
 * Screen 11: Create / Edit Event
 */
function renderScreen11_CreateEvent() {
  const isEditing = Boolean(store.editingEventId);
  const eventToEdit = isEditing ? store.events.find(e => e.id === store.editingEventId) : null;

  return `
    <div class="max-w-2xl mx-auto space-y-6">
      
      <button 
        onclick="store.setScreen('organizer-dashboard')"
        class="text-xs font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1"
      >
        <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i>
        <span>Back to My Events</span>
      </button>

      <div class="bg-white rounded-3xl border border-slate-200 p-8 card-shadow space-y-6">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900">
            ${isEditing ? 'Edit Event' : 'Create New Event'}
          </h1>
          <p class="text-sm text-slate-500">Provide details about your upcoming campus activity.</p>
        </div>

        <form onsubmit="handleEventSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Event Title</label>
            <input 
              type="text" 
              id="event-title"
              required
              placeholder="e.g. Career Networking"
              value="${eventToEdit ? eventToEdit.title : ''}"
              class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Category</label>
            <select 
              id="event-category"
              class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
            >
              <option value="Tech" ${eventToEdit?.category === 'Tech' ? 'selected' : ''}>Tech</option>
              <option value="Arts" ${eventToEdit?.category === 'Arts' ? 'selected' : ''}>Arts</option>
              <option value="Social" ${eventToEdit?.category === 'Social' ? 'selected' : ''}>Social</option>
              <option value="Career" ${eventToEdit?.category === 'Career' ? 'selected' : ''}>Career</option>
              <option value="Workshop" ${eventToEdit?.category === 'Workshop' ? 'selected' : ''}>Workshop</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Description</label>
            <textarea 
              id="event-description"
              required
              rows="4"
              placeholder="Describe agenda, prerequisites, and what attendees will learn..."
              class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >${eventToEdit ? eventToEdit.description : ''}</textarea>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Date & Time</label>
              <input 
                type="text" 
                id="event-date"
                required
                placeholder="Mon, 15 Jul 2024 | 02:00 PM - 04:00 PM"
                value="${eventToEdit ? eventToEdit.date + ' | ' + eventToEdit.time : 'Mon, 15 Jul 2024 | 02:00 PM - 04:00 PM'}"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Location</label>
              <input 
                type="text" 
                id="event-location"
                required
                placeholder="e.g. Student Center or Online (Zoom)"
                value="${eventToEdit ? eventToEdit.location : ''}"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Capacity</label>
              <input 
                type="number" 
                id="event-capacity"
                required
                min="5"
                max="500"
                placeholder="50"
                value="${eventToEdit ? eventToEdit.capacity : '50'}"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Cover Image URL</label>
              <input 
                type="url" 
                id="event-image"
                placeholder="https://images.unsplash.com/..."
                value="${eventToEdit ? eventToEdit.image : 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop&q=80'}"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          <div class="pt-4 flex items-center justify-end gap-3">
            <button 
              type="button" 
              onclick="store.setScreen('organizer-dashboard')"
              class="px-5 py-3 rounded-xl text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button 
              type="submit"
              class="px-6 py-3 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition"
            >
              ${isEditing ? 'Save Changes' : 'Create Event'}
            </button>
          </div>

        </form>
      </div>

    </div>
  `;
}

/**
 * Screen 12: Event Attendees (Connected to GET /api/events/{id}/registrations)
 */
function renderScreen12_Attendees() {
  const event = store.events.find(e => e.id === store.selectedAttendeeEventId) || store.events[0] || { id: store.selectedAttendeeEventId, title: 'Event' };
  const query = store.attendeeSearchQuery.toLowerCase();
  const attendees = store.currentAttendees;

  const filteredAttendees = attendees.filter(a => 
    (a.name && a.name.toLowerCase().includes(query)) || (a.email && a.email.toLowerCase().includes(query))
  );

  return `
    <div class="space-y-6">
      
      <button 
        onclick="store.setScreen('organizer-dashboard')"
        class="text-xs font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1.5"
      >
        <i data-lucide="arrow-left" class="w-4 h-4"></i>
        <span>&larr; Back to My Events</span>
      </button>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Attendees &mdash; ${event.title}
            </h1>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800">
              GET /api/events/${event.id}/registrations
            </span>
          </div>
          <p class="text-sm text-slate-500">
            ${attendees.length} registered attendee(s) &bull; Protected organizer view
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button 
            onclick="store.loadAttendees('${event.id}')"
            class="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition flex items-center gap-1.5"
          >
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5 ${store.loading.attendees ? 'animate-spin' : ''}"></i>
            <span>Refresh</span>
          </button>
          <button 
            onclick="exportAttendeesCSV('${event.id}')"
            class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition flex items-center gap-1.5"
          >
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <!-- Access Error Banner (e.g. 403 Forbidden or 401) -->
      ${store.errors.attendees ? `
        <div class="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
          <div class="flex items-center gap-2 font-bold text-sm">
            <i data-lucide="shield-alert" class="w-5 h-5 text-amber-600"></i>
            <span>Authorization / Role Notice</span>
          </div>
          <p class="text-xs text-amber-700">${store.errors.attendees}</p>
          <p class="text-[11px] text-amber-600">Tip: In the top bar, switch your role to <strong>Organizer</strong> to verify authorized organizer privileges.</p>
        </div>
      ` : ''}

      <!-- Table Card -->
      <div class="bg-white rounded-2xl border border-slate-200 card-shadow overflow-hidden space-y-4 p-5">
        
        <div class="relative max-w-md">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"></i>
          <input 
            type="text" 
            placeholder="Search by name or email..."
            value="${store.attendeeSearchQuery}"
            oninput="handleAttendeeSearch(event)"
            class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th class="py-3 px-4">#</th>
                <th class="py-3 px-4">Name</th>
                <th class="py-3 px-4">Email</th>
                <th class="py-3 px-4">Registered At</th>
                <th class="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${store.loading.attendees ? `
                <tr><td colspan="5" class="py-8 text-center text-slate-400 text-xs">Loading attendees from backend...</td></tr>
              ` : filteredAttendees.length === 0 ? `
                <tr>
                  <td colspan="5" class="py-8 text-center text-slate-400 text-xs">
                    No registered attendees found.
                  </td>
                </tr>
              ` : filteredAttendees.map((a, idx) => `
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="py-3.5 px-4 font-mono text-xs text-slate-400">${idx + 1}</td>
                  <td class="py-3.5 px-4 font-semibold text-slate-800">
                    <div class="flex items-center gap-2">
                      <div class="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                        ${(a.name || 'A').substring(0, 1)}
                      </div>
                      <span>${a.name}</span>
                    </div>
                  </td>
                  <td class="py-3.5 px-4 text-slate-600 font-mono-code text-xs">${a.email}</td>
                  <td class="py-3.5 px-4 text-slate-500 text-xs">${a.registeredAt}</td>
                  <td class="py-3.5 px-4 text-right">
                    <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${
                      a.status === 'Checked In' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-50 text-blue-700'
                    }">
                      ${a.status || 'Confirmed'}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  `;
}

/**
 * Screen 13: Profile
 */
function renderScreen13_Profile() {
  const { name, email, role, avatar, bio, major } = store.user;

  return `
    <div class="max-w-2xl mx-auto space-y-6">
      
      <div>
        <h1 class="text-3xl font-bold tracking-tight text-slate-900">My Profile</h1>
        <p class="text-sm text-slate-500">Manage your university account, active credentials, and settings.</p>
      </div>

      <div class="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 card-shadow space-y-6">
        
        <div class="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
          <div class="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <div class="relative">
              <img src="${avatar}" alt="${name}" class="w-20 h-20 rounded-2xl object-cover ring-4 ring-blue-50 shadow-md">
              <span class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 ring-2 ring-white"></span>
            </div>
            
            <div class="space-y-1">
              <div class="flex items-center justify-center sm:justify-start gap-2">
                <h2 class="text-xl font-bold text-slate-900">${name}</h2>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  role === 'organizer' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                }">
                  ${role === 'organizer' ? 'Organizer' : 'Student'}
                </span>
              </div>
              <p class="text-xs font-mono text-slate-500">${email}</p>
              <p class="text-xs text-slate-600 font-medium">${major || 'Undergraduate Student'}</p>
            </div>
          </div>

          <button 
            onclick="openEditProfileModal()"
            class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 hover:border-slate-400 text-slate-700 hover:bg-slate-50 transition"
          >
            Edit Profile
          </button>
        </div>

        <div class="p-4 rounded-xl bg-slate-50 text-xs text-slate-600 leading-relaxed">
          ${bio}
        </div>

        <div class="pt-4 border-t border-slate-100 flex items-center justify-between">
          <span class="text-xs font-medium text-slate-500">Switch current view:</span>
          <button 
            onclick="store.setRole(store.user.role === 'student' ? 'organizer' : 'student')"
            class="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
          >
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span>Switch to ${role === 'student' ? 'Organizer' : 'Student'} mode</span>
          </button>
        </div>

      </div>

      <!-- Account Settings -->
      <div class="bg-white rounded-3xl border border-slate-200 card-shadow overflow-hidden">
        <div class="p-5 border-b border-slate-100">
          <h3 class="font-bold text-slate-900 text-base">Account Settings</h3>
        </div>

        <div class="divide-y divide-slate-100 text-sm">
          <button 
            onclick="openApiSettingsModal()"
            class="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition text-left"
          >
            <div class="flex items-center gap-3 text-slate-700">
              <i data-lucide="server" class="w-4 h-4 text-slate-400"></i>
              <div>
                <span class="font-medium block">Backend API Configuration</span>
                <span class="text-xs text-slate-400">${ApiService.getBaseUrl()}</span>
              </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400"></i>
          </button>

          <button 
            onclick="openChangePasswordModal()"
            class="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition text-left"
          >
            <div class="flex items-center gap-3 text-slate-700">
              <i data-lucide="key" class="w-4 h-4 text-slate-400"></i>
              <span class="font-medium">Change Password</span>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400"></i>
          </button>

          <button 
            onclick="store.logout()"
            class="w-full p-4 flex items-center justify-between hover:bg-rose-50 transition text-left text-rose-600"
          >
            <div class="flex items-center gap-3">
              <i data-lucide="log-out" class="w-4 h-4 text-rose-500"></i>
              <span class="font-medium">Log Out</span>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-rose-400"></i>
          </button>
        </div>
      </div>

    </div>
  `;
}

/**
 * Modals Overlay: Screen 7 Confirm, Screen 8 Success, QR Pass, API Settings
 */
function renderModals() {
  const e = store.getSelectedEvent();
  let content = '';

  // Screen 7: Register Confirm Modal (POST /api/registrations)
  if (store.modals.registerConfirm) {
    content = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-modal">
        <div class="bg-white rounded-3xl max-w-md w-full p-6 card-shadow space-y-6">
          
          <div class="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-lg">Confirm Registration</h3>
            <button onclick="closeModal('registerConfirm')" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="space-y-4">
            <p class="text-sm text-slate-600">
              Are you sure you want to register for <strong class="text-slate-900 font-bold">${e.title}</strong>?
            </p>

            <div class="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50">
              <img src="${e.image}" alt="${e.title}" class="h-32 w-full object-cover">
              <div class="p-4 space-y-2 text-xs">
                <div class="font-bold text-slate-900 text-sm">${e.title}</div>
                <div class="flex items-center gap-2 text-slate-600">
                  <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-600"></i>
                  <span>${e.date}</span>
                </div>
                <div class="flex items-center gap-2 text-slate-600">
                  <i data-lucide="clock" class="w-3.5 h-3.5 text-slate-400"></i>
                  <span>${e.time}</span>
                </div>
                <div class="flex items-center gap-2 text-slate-600">
                  <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400"></i>
                  <span>${e.location}</span>
                </div>
              </div>
            </div>

            <div class="text-xs text-slate-500">
              Submits to <code class="font-mono bg-slate-100 px-1 py-0.5 rounded">POST /api/registrations</code> for <span class="font-semibold text-slate-800">${store.user.email}</span>.
            </div>
          </div>

          <!-- Buttons: [Cancel] [Confirm] -->
          <div class="flex items-center justify-end gap-3 pt-2">
            <button 
              type="button"
              onclick="closeModal('registerConfirm')"
              class="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button 
              type="button"
              onclick="store.submitRegistration('${e.id}')"
              class="px-6 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition flex items-center gap-2"
              ${store.loading.submitting ? 'disabled' : ''}
            >
              ${store.loading.submitting ? `
                <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
                <span>Registering...</span>
              ` : `
                <span>Confirm</span>
              `}
            </button>
          </div>

        </div>
      </div>
    `;
  }

  // Screen 8: Registration Success Modal
  else if (store.modals.registerSuccess) {
    content = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-modal">
        <div class="bg-white rounded-3xl max-w-md w-full p-8 card-shadow text-center space-y-6">
          
          <div class="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto animate-checkmark shadow-inner">
            <i data-lucide="check" class="w-10 h-10 stroke-[3]"></i>
          </div>

          <div class="space-y-2">
            <h2 class="text-2xl font-extrabold text-slate-900">You're Registered!</h2>
            <p class="text-sm text-slate-600">
              You have successfully registered for<br/>
              <strong class="text-slate-900 font-bold">${e.title}</strong>.
            </p>
          </div>

          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 flex items-center justify-between">
            <span>Status: <strong class="text-emerald-700">201 Created ✓</strong></span>
            <span class="font-mono text-slate-800">#CC-${Math.floor(10000 + Math.random() * 90000)}</span>
          </div>

          <!-- Buttons: [View My Registrations] [Back to Events] -->
          <div class="space-y-3 pt-2">
            <button 
              onclick="closeModal('registerSuccess'); store.setScreen('my-registrations');"
              class="w-full py-3 px-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition text-sm"
            >
              View My Registrations
            </button>
            <button 
              onclick="closeModal('registerSuccess'); store.setScreen('events');"
              class="w-full py-2.5 px-4 rounded-xl font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition text-sm"
            >
              Back to Events
            </button>
          </div>

        </div>
      </div>
    `;
  }

  // Digital Ticket QR Pass
  else if (store.modals.digitalPass) {
    content = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-modal">
        <div class="bg-white rounded-3xl max-w-sm w-full p-6 card-shadow space-y-6 text-center">
          <div class="flex items-center justify-between pb-2 border-b border-slate-100">
            <span class="text-xs font-bold text-blue-600 uppercase">Digital Ticket Pass</span>
            <button onclick="closeModal('digitalPass')" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="space-y-3">
            <h3 class="font-bold text-slate-900 text-lg">${e.title}</h3>
            <div class="text-xs text-slate-500 font-medium">${e.date} • ${e.time}</div>
            <div class="text-xs text-slate-500">${e.location}</div>
          </div>

          <div class="p-6 bg-slate-100 rounded-2xl flex flex-col items-center justify-center gap-2 border border-slate-200">
            <i data-lucide="qr-code" class="w-32 h-32 text-slate-800"></i>
            <span class="font-mono text-[11px] text-slate-500 font-bold">PASS-89241-CC</span>
          </div>

          <div class="text-xs text-slate-400">
            Show this QR pass at event entrance check-in.
          </div>

          <button 
            onclick="closeModal('digitalPass')"
            class="w-full py-2.5 rounded-xl font-semibold bg-slate-900 text-white text-xs hover:bg-slate-800 transition"
          >
            Done
          </button>
        </div>
      </div>
    `;
  }

  // API Settings Modal
  else if (store.modals.apiSettings) {
    const currentBaseUrl = ApiService.getBaseUrl();
    const currentToken = ApiService.getAuthToken();

    content = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-modal">
        <div class="bg-white rounded-3xl max-w-lg w-full p-6 card-shadow space-y-5">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100">
            <div class="flex items-center gap-2">
              <i data-lucide="server" class="w-5 h-5 text-blue-600"></i>
              <h3 class="font-bold text-slate-900 text-lg">Backend API Configuration</h3>
            </div>
            <button onclick="closeModal('apiSettings')" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <div class="space-y-4 text-xs">
            <div>
              <label class="block font-semibold text-slate-700 uppercase tracking-wider mb-1">API Base URL</label>
              <input 
                type="url" 
                id="cfg-base-url"
                value="${currentBaseUrl}"
                placeholder="http://localhost:5000"
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-blue-500"
              />
              <p class="text-slate-400 mt-1">Configures where requests to <code class="font-mono">/api/events</code>, <code class="font-mono">/api/registrations</code>, etc. are dispatched.</p>
            </div>

            <div>
              <label class="block font-semibold text-slate-700 uppercase tracking-wider mb-1">Auth Token (Bearer)</label>
              <input 
                type="text" 
                id="cfg-auth-token"
                value="${currentToken}"
                placeholder="Optional JWT or Session Token"
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-blue-500"
              />
              <p class="text-slate-400 mt-1">Automatically included in <code class="font-mono">Authorization: Bearer &lt;token&gt;</code> headers.</p>
            </div>

            <!-- Fast Preset Buttons -->
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div class="font-bold text-slate-700">Quick URL Presets:</div>
              <div class="flex flex-wrap gap-2">
                <button 
                  onclick="document.getElementById('cfg-base-url').value = 'http://localhost:5000'"
                  class="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 font-mono text-[11px]"
                >
                  http://localhost:5000
                </button>
                <button 
                  onclick="document.getElementById('cfg-base-url').value = 'http://localhost:8000'"
                  class="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 font-mono text-[11px]"
                >
                  http://localhost:8000
                </button>
                <button 
                  onclick="document.getElementById('cfg-base-url').value = 'http://localhost:8080'"
                  class="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 font-mono text-[11px]"
                >
                  http://localhost:8080
                </button>
                <button 
                  onclick="document.getElementById('cfg-base-url').value = 'http://localhost:3000'"
                  class="px-2.5 py-1 rounded bg-white border border-slate-300 hover:bg-slate-100 font-mono text-[11px]"
                >
                  http://localhost:3000
                </button>
              </div>
            </div>

            <div id="api-test-result" class="hidden p-3 rounded-xl text-xs font-mono"></div>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-slate-100">
            <button 
              type="button" 
              onclick="testApiConnection()"
              class="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              Test Connection (Ping)
            </button>
            <div class="flex gap-2">
              <button 
                type="button" 
                onclick="closeModal('apiSettings')"
                class="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 text-slate-700"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onclick="saveApiSettings()"
                class="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              >
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Edit Profile Modal
  else if (store.modals.editProfile) {
    content = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-modal">
        <div class="bg-white rounded-3xl max-w-md w-full p-6 card-shadow space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-lg">Edit Profile</h3>
            <button onclick="closeModal('editProfile')" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="handleEditProfileSubmit(event)" class="space-y-3 text-left">
            <div>
              <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Full Name</label>
              <input type="text" id="edit-name" value="${store.user.name}" required class="w-full px-3 py-2 border rounded-xl text-sm" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Campus Email</label>
              <input type="email" id="edit-email" value="${store.user.email}" required class="w-full px-3 py-2 border rounded-xl text-sm" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Major / Faculty</label>
              <input type="text" id="edit-major" value="${store.user.major || ''}" class="w-full px-3 py-2 border rounded-xl text-sm" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Bio</label>
              <textarea id="edit-bio" rows="3" class="w-full px-3 py-2 border rounded-xl text-sm">${store.user.bio || ''}</textarea>
            </div>
            <div class="pt-3 flex justify-end gap-2">
              <button type="button" onclick="closeModal('editProfile')" class="px-4 py-2 border rounded-xl text-xs font-semibold">Cancel</button>
              <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // Change Password Modal
  else if (store.modals.changePassword) {
    content = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-modal">
        <div class="bg-white rounded-3xl max-w-sm w-full p-6 card-shadow space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 class="font-bold text-slate-900 text-lg">Change Password</h3>
            <button onclick="closeModal('changePassword')" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="handleChangePasswordSubmit(event)" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">Current Password</label>
              <input type="password" required class="w-full px-3 py-2 border rounded-xl text-sm" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 uppercase mb-1">New Password</label>
              <input type="password" minlength="8" required class="w-full px-3 py-2 border rounded-xl text-sm" />
            </div>
            <div class="pt-3 flex justify-end gap-2">
              <button type="button" onclick="closeModal('changePassword')" class="px-4 py-2 border rounded-xl text-xs font-semibold">Cancel</button>
              <button type="submit" class="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Update Password</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  return content;
}

/**
 * Loading Skeletons
 */
function renderSkeletonGrid() {
  return `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      ${[1, 2, 3].map(() => `
        <div class="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
          <div class="h-40 skeleton rounded-xl"></div>
          <div class="h-5 w-3/4 skeleton rounded"></div>
          <div class="h-4 w-1/2 skeleton rounded"></div>
          <div class="h-10 skeleton rounded-xl"></div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSkeletonList() {
  return `
    <div class="space-y-4">
      ${[1, 2, 3, 4].map(() => `
        <div class="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-5">
          <div class="w-44 h-28 skeleton rounded-xl flex-shrink-0"></div>
          <div class="flex-1 space-y-3">
            <div class="h-5 w-1/2 skeleton rounded"></div>
            <div class="h-4 w-1/3 skeleton rounded"></div>
            <div class="h-4 w-1/4 skeleton rounded"></div>
          </div>
          <div class="w-28 h-10 skeleton rounded-xl flex-shrink-0"></div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Footer
 */
function renderFooter() {
  return `
    <footer class="bg-white border-t border-slate-200 mt-auto py-8">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div class="flex items-center gap-2 font-medium">
          <span class="w-5 h-5 rounded bg-blue-600 text-white inline-flex items-center justify-center font-bold text-[10px]">CC</span>
          <span class="text-slate-700 font-semibold">CampusConnect</span>
          <span>&bull; Connected to REST API</span>
        </div>
        <div class="flex items-center gap-6">
          <button onclick="store.setScreen('events')" class="hover:text-blue-600">Events API</button>
          <button onclick="openApiSettingsModal()" class="hover:text-blue-600">API Settings</button>
          <a href="#" onclick="alert('Student Privacy Policy is compliant with campus regulations.'); return false;" class="hover:text-blue-600">Privacy Policy</a>
          <a href="#" onclick="alert('CampusConnect Support: support@campus.edu'); return false;" class="hover:text-blue-600">Help Desk</a>
        </div>
      </div>
    </footer>
  `;
}

// ----------------------------------------------------
// Global Interaction Handlers
// ----------------------------------------------------

window.handleNavigatorJump = function(screenId) {
  if (screenId === 'register-modal') {
    store.modals.registerConfirm = true;
    store.modals.registerSuccess = false;
    store.render();
    return;
  }
  if (screenId === 'success-modal') {
    store.modals.registerConfirm = false;
    store.modals.registerSuccess = true;
    store.render();
    return;
  }
  store.modals.registerConfirm = false;
  store.modals.registerSuccess = false;
  
  if (screenId === 'organizer-dashboard' || screenId === 'create-event' || screenId === 'attendees') {
    store.user.isLoggedIn = true;
    store.user.role = 'organizer';
  } else if (screenId === 'home' || screenId === 'my-registrations') {
    store.user.isLoggedIn = true;
    store.user.role = 'student';
  }
  store.setScreen(screenId);
};

window.openRegisterConfirmModal = function(eventId) {
  store.selectedEventId = eventId;
  store.modals.registerConfirm = true;
  store.render();
};

window.openDigitalPassModal = function(eventId) {
  store.selectedEventId = eventId;
  store.modals.digitalPass = true;
  store.render();
};

window.openEditProfileModal = function() {
  store.modals.editProfile = true;
  store.render();
};

window.openChangePasswordModal = function() {
  store.modals.changePassword = true;
  store.render();
};

window.openApiSettingsModal = function() {
  store.modals.apiSettings = true;
  store.render();
};

window.closeModal = function(modalKey) {
  if (store.modals[modalKey] !== undefined) {
    store.modals[modalKey] = false;
    store.render();
  }
};

window.togglePasswordVisibility = function(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
};

window.handleSearchChange = function(e) {
  store.searchQuery = e.target.value;
  store.render();
};

window.handleLocationFilter = function(e) {
  store.filterLocation = e.target.value;
  store.render();
};

window.handleCategoryChange = function(cat) {
  store.filterCategory = cat;
  store.render();
};

window.clearFilters = function() {
  store.searchQuery = '';
  store.filterCategory = 'All';
  store.filterLocation = 'All';
  store.render();
};

window.handleHomeSearch = function(e) {
  e.preventDefault();
  const input = document.getElementById('home-search-input');
  if (input) {
    store.searchQuery = input.value;
    store.setScreen('events');
  }
};

window.setRegistrationsTab = function(tab) {
  store.registrationsTab = tab;
  store.render();
};

window.handleLoginForm = function(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  store.user.email = email;
  store.login(store.user.role || 'student');
};

window.handleSignupForm = function(e) {
  e.preventDefault();
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const roleRadios = document.getElementsByName('signup-role');
  let chosenRole = 'student';
  for (const r of roleRadios) {
    if (r.checked) chosenRole = r.value;
  }

  store.setUser({ name, email, role: chosenRole, isLoggedIn: true });
  store.setScreen(chosenRole === 'organizer' ? 'organizer-dashboard' : 'home');
  store.showToast(`Account created! Welcome, ${name}.`, 'success');
};

window.handleEventSubmit = function(e) {
  e.preventDefault();
  const title = document.getElementById('event-title').value;
  const category = document.getElementById('event-category').value;
  const description = document.getElementById('event-description').value;
  const dateTimeStr = document.getElementById('event-date').value;
  const location = document.getElementById('event-location').value;
  const capacity = parseInt(document.getElementById('event-capacity').value, 10);
  const image = document.getElementById('event-image').value;

  const parts = dateTimeStr.split('|');
  const date = parts[0] ? parts[0].trim() : 'Mon, 15 Jul 2024';
  const time = parts[1] ? parts[1].trim() : '02:00 PM - 04:00 PM';

  const newEvent = {
    id: 'event-' + Date.now(),
    title,
    category,
    description,
    date,
    time,
    location,
    locationType: location.toLowerCase().includes('online') ? 'online' : 'in-person',
    capacity,
    image,
    registeredCount: 0,
    status: 'Open',
    organizer: 'Campus Tech Club'
  };

  store.events.unshift(newEvent);
  store.showToast('Event created successfully!', 'success');
  store.setScreen('organizer-dashboard');
};

window.handleAttendeeSearch = function(e) {
  store.attendeeSearchQuery = e.target.value;
  store.render();
};

window.exportAttendeesCSV = function(eventId) {
  const attendees = store.currentAttendees;
  if (!attendees || attendees.length === 0) {
    store.showToast('No attendees to export.', 'info');
    return;
  }

  let csv = 'ID,Name,Email,Registered At,Status\n';
  attendees.forEach((a, i) => {
    csv += `${i+1},"${a.name || ''}","${a.email || ''}","${a.registeredAt || ''}","${a.status || ''}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `attendees_${eventId}.csv`);
  a.click();
  store.showToast('Attendees exported to CSV.', 'success');
};

window.saveApiSettings = function() {
  const urlInput = document.getElementById('cfg-base-url').value;
  const tokenInput = document.getElementById('cfg-auth-token').value;

  window.__CAMPUS_CONFIG__.setApiBaseUrl(urlInput);
  window.__CAMPUS_CONFIG__.setAuthToken(tokenInput);

  store.closeModal('apiSettings');
  store.showToast('API Configuration updated!', 'success');
  
  // Reload current screen data
  store.loadEvents(true);
};

window.testApiConnection = async function() {
  const urlInput = document.getElementById('cfg-base-url').value.trim().replace(/\/+$/, '');
  const resultDiv = document.getElementById('api-test-result');
  resultDiv.classList.remove('hidden', 'bg-emerald-50', 'text-emerald-800', 'bg-rose-50', 'text-rose-800');
  resultDiv.classList.add('bg-slate-100', 'text-slate-700');
  resultDiv.innerHTML = 'Pinging ' + urlInput + '/api/events...';

  try {
    const res = await fetch(urlInput + '/api/events', { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      resultDiv.className = 'p-3 rounded-xl text-xs font-mono bg-emerald-50 text-emerald-800 border border-emerald-200';
      resultDiv.innerHTML = `✓ Connection Successful! Status: ${res.status} OK`;
    } else {
      resultDiv.className = 'p-3 rounded-xl text-xs font-mono bg-amber-50 text-amber-800 border border-amber-200';
      resultDiv.innerHTML = `⚠ Connected, but server returned HTTP status: ${res.status}`;
    }
  } catch (err) {
    resultDiv.className = 'p-3 rounded-xl text-xs font-mono bg-rose-50 text-rose-800 border border-rose-200';
    resultDiv.innerHTML = `✕ Connection Failed: ${err.message}<br/>Ensure backend is running at ${urlInput} with CORS allowed.`;
  }
};

window.handleEditProfileSubmit = function(e) {
  e.preventDefault();
  const name = document.getElementById('edit-name').value;
  const email = document.getElementById('edit-email').value;
  const major = document.getElementById('edit-major').value;
  const bio = document.getElementById('edit-bio').value;

  store.setUser({ name, email, major, bio });
  store.closeModal('editProfile');
  store.showToast('Profile updated!', 'success');
};

window.handleChangePasswordSubmit = function(e) {
  e.preventDefault();
  store.closeModal('changePassword');
  store.showToast('Password changed successfully!', 'success');
};

// Initial boot: fetch live events from API
document.addEventListener('DOMContentLoaded', () => {
  store.render();
  store.loadEvents();
});
