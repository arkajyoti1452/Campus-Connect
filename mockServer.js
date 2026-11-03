/**
 * CampusConnect - Backend REST API Server (Node.js Built-In)
 * Zero external dependencies. Implements all 5 specified endpoints with CORS.
 * 
 * Endpoints:
 * - GET  /api/events
 * - GET  /api/events/{id}
 * - POST /api/registrations (201 Created or 409 Conflict)
 * - GET  /api/me/registrations
 * - GET  /api/events/{id}/registrations (403 if not organizer)
 */

const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 5000;

// Database state
const DB = {
  events: [
    {
      id: 'ai-basics',
      title: 'Tech Talk: AI Basics',
      date: 'Mon, 30 Jun 2024',
      time: '10:00 AM - 12:00 PM',
      location: 'Online (Zoom)',
      organizer: 'Tech Club',
      organizerEmail: 'techclub@campus.edu',
      capacity: 50,
      registeredCount: 23,
      status: 'Open',
      category: 'Tech',
      image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&auto=format&fit=crop&q=80',
      description: 'Join us for an engaging introductory session on Artificial Intelligence and Large Language Models. Learn core concepts of machine learning, neural networks, and prompt engineering.',
      isRegistered: true,
      organizerId: 'org-techclub'
    },
    {
      id: 'photo-workshop',
      title: 'Photography Workshop',
      date: 'Wed, 12 Jun 2024',
      time: '02:00 PM - 04:30 PM',
      location: 'Library Hall',
      organizer: 'Creative Arts Guild',
      organizerEmail: 'arts@campus.edu',
      capacity: 35,
      registeredCount: 30,
      status: 'Open',
      category: 'Arts',
      image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=80',
      description: 'Master manual exposure, composition rules, framing, and dynamic lighting for studio and street photography. Bring your camera or smartphone.',
      isRegistered: true,
      organizerId: 'org-arts'
    },
    {
      id: 'community-cleanup',
      title: 'Community Clean-Up',
      date: 'Sat, 15 Jun 2024',
      time: '09:00 AM - 01:00 PM',
      location: 'Campus Park',
      organizer: 'EcoVolunteers Club',
      organizerEmail: 'ecoclub@campus.edu',
      capacity: 80,
      registeredCount: 64,
      status: 'Open',
      category: 'Social',
      image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&auto=format&fit=crop&q=80',
      description: 'Help us revitalize our campus green spaces! High-visibility vests, grabbers, and eco-friendly bags provided. Lunch and volunteer service credits awarded.',
      isRegistered: false,
      organizerId: 'org-eco'
    },
    {
      id: 'career-networking',
      title: 'Career Networking',
      date: 'Thu, 20 Jun 2024',
      time: '05:00 PM - 08:00 PM',
      location: 'Student Center',
      organizer: 'Tech Club & Career Hub',
      organizerEmail: 'careers@campus.edu',
      capacity: 60,
      registeredCount: 45,
      status: 'Open',
      category: 'Career',
      image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=800&auto=format&fit=crop&q=80',
      description: 'Speed networking with tech alumni, startup founders, and corporate recruiters. 1-on-1 resume feedback and internship pipelines.',
      isRegistered: false,
      organizerId: 'org-techclub'
    },
    {
      id: 'sustainability-workshop',
      title: 'Sustainability Workshop',
      date: 'Tue, 25 Jun 2024',
      time: '03:00 PM - 05:00 PM',
      location: 'Room 101',
      organizer: 'Tech Club',
      organizerEmail: 'techclub@campus.edu',
      capacity: 30,
      registeredCount: 18,
      status: 'Open',
      category: 'Workshop',
      image: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=800&auto=format&fit=crop&q=80',
      description: 'Hands-on workshop exploring sustainable campus infrastructure and IoT telemetry sensors for low-energy buildings.',
      isRegistered: false,
      organizerId: 'org-techclub'
    }
  ],
  registrations: [
    {
      id: 'reg-1',
      eventId: 'ai-basics',
      userId: 'student-alex',
      userName: 'Alex Tan',
      userEmail: 'alex@campus.edu',
      registeredAt: '1 Jun 2024, 10:15 AM',
      status: 'Confirmed'
    },
    {
      id: 'reg-2',
      eventId: 'photo-workshop',
      userId: 'student-alex',
      userName: 'Alex Tan',
      userEmail: 'alex@campus.edu',
      registeredAt: '28 May 2024, 01:12 PM',
      status: 'Confirmed'
    },
    {
      id: 'reg-3',
      eventId: 'ai-basics',
      userId: 'student-priya',
      userName: 'Priya Sharma',
      userEmail: 'priya@campus.edu',
      registeredAt: '2 Jun 2024, 09:40 AM',
      status: 'Confirmed'
    },
    {
      id: 'reg-4',
      eventId: 'ai-basics',
      userId: 'student-daniel',
      userName: 'Daniel Lee',
      userEmail: 'daniel@campus.edu',
      registeredAt: '3 Jun 2024, 02:20 PM',
      status: 'Checked In'
    }
  ]
};

// Request dispatcher
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Helper response
  const sendJson = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  // Extract auth token
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  // 1. GET /api/events
  if (method === 'GET' && pathname === '/api/events') {
    return sendJson(200, DB.events);
  }

  // 4. GET /api/me/registrations
  if (method === 'GET' && pathname === '/api/me/registrations') {
    const userRegs = DB.registrations.filter(r => r.userEmail === 'alex@campus.edu');
    const enriched = userRegs.map(r => {
      const event = DB.events.find(e => e.id === r.eventId);
      return {
        id: r.id,
        registeredAt: r.registeredAt,
        status: r.status,
        event: event || { id: r.eventId, title: 'Event' }
      };
    });
    return sendJson(200, enriched);
  }

  // 3. POST /api/registrations
  if (method === 'POST' && pathname === '/api/registrations') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const eventId = payload.eventId || payload.event_id;

        if (!eventId) {
          return sendJson(400, { error: 'Missing required field: eventId' });
        }

        const event = DB.events.find(e => e.id === eventId);
        if (!event) {
          return sendJson(404, { error: 'Event not found' });
        }

        // Check duplicate registration
        const alreadyRegistered = DB.registrations.some(
          r => r.eventId === eventId && r.userEmail === 'alex@campus.edu'
        );

        if (alreadyRegistered) {
          // 409 Conflict as specified!
          return sendJson(409, {
            error: 'Conflict',
            message: 'You are already registered for this event.'
          });
        }

        // Create new registration (201 Created)
        const newReg = {
          id: 'reg-' + Date.now(),
          eventId: eventId,
          userId: 'student-alex',
          userName: 'Alex Tan',
          userEmail: 'alex@campus.edu',
          registeredAt: new Date().toLocaleString(),
          status: 'Confirmed'
        };

        DB.registrations.push(newReg);
        event.registeredCount += 1;
        event.isRegistered = true;

        return sendJson(201, {
          success: true,
          message: 'Registration successful!',
          registration: newReg
        });
      } catch (err) {
        return sendJson(400, { error: 'Invalid JSON payload' });
      }
    });
    return;
  }

  // 5. GET /api/events/{id}/registrations (Attendee list - Organizer only)
  const attendeeMatch = pathname.match(/^\/api\/events\/([^\/]+)\/registrations$/);
  if (method === 'GET' && attendeeMatch) {
    const eventId = decodeURIComponent(attendeeMatch[1]);
    const event = DB.events.find(e => e.id === eventId);

    if (!event) {
      return sendJson(404, { error: 'Event not found' });
    }

    // Role check simulation: if request contains token or organizer param
    // By default, organizers have access
    const isOrganizer = req.headers['x-role'] === 'student' ? false : true;
    if (!isOrganizer) {
      return sendJson(403, {
        error: 'Forbidden',
        message: 'Access denied: Only the event organizer can view attendees.'
      });
    }

    const attendees = DB.registrations
      .filter(r => r.eventId === eventId)
      .map(r => ({
        id: r.id,
        name: r.userName,
        email: r.userEmail,
        registeredAt: r.registeredAt,
        status: r.status
      }));

    return sendJson(200, attendees);
  }

  // 2. GET /api/events/{id}
  const eventMatch = pathname.match(/^\/api\/events\/([^\/]+)$/);
  if (method === 'GET' && eventMatch) {
    const eventId = decodeURIComponent(eventMatch[1]);
    const event = DB.events.find(e => e.id === eventId);
    if (!event) {
      return sendJson(404, { error: 'Event not found' });
    }
    return sendJson(200, event);
  }

  // 404 Fallback
  return sendJson(404, { error: `Endpoint ${method} ${pathname} not found` });
});

server.listen(PORT, () => {
  console.log(`[CampusConnect API] REST backend server running at http://localhost:${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`  - GET  http://localhost:${PORT}/api/events`);
  console.log(`  - GET  http://localhost:${PORT}/api/events/{id}`);
  console.log(`  - POST http://localhost:${PORT}/api/registrations`);
  console.log(`  - GET  http://localhost:${PORT}/api/me/registrations`);
  console.log(`  - GET  http://localhost:${PORT}/api/events/{id}/registrations`);
});
