# CampusConnect — Backend REST API Integration Guide

This frontend has been upgraded with a reusable **API Service Layer** that connects to your backend REST API.

---

## 🔌 API Endpoints Summary

| Method | Endpoint | Frontend Function & Screen | Error & Status Codes Handled |
|---|---|---|---|
| **GET** | `/api/events` | Fetches and dynamically displays event catalog on **All Events (Screen 5)** and **Home (Screen 4)** | `200 OK`, `500 Server Error`, Network offline |
| **GET** | `/api/events/{id}` | Fetches and displays detailed event view on **Event Details (Screen 6)** | `200 OK`, `404 Not Found`, `500 Server Error` |
| **POST** | `/api/registrations` | Registers current student via **Register Modal (Screen 7)** | `201 Created` (Success Screen 8), `409 Conflict` (Already registered notice), `401 Unauthorized` |
| **GET** | `/api/me/registrations` | Displays current user's registered events on **My Registrations (Screen 9)** | `200 OK`, `401 Unauthorized` |
| **GET** | `/api/events/{id}/registrations` | Displays attendee roster on **Attendees (Screen 12)** (Organizer only) | `200 OK`, `403 Forbidden` (Role error notice), `401 Unauthorized` |

---

## ⚙️ Configuration & Environment Variables

### 1. `.env` File
Configure your backend address in `.env`:
```env
VITE_API_BASE_URL=http://localhost:5000
API_BASE_URL=http://localhost:5000
AUTH_TOKEN=your_jwt_or_session_token_here
```

### 2. Runtime API Settings Drawer
You can also change the API Base URL or Bearer Auth Token directly in the UI without restarting:
1. Click the **API URL pill** or **Gear icon** in the top navigation bar.
2. Enter your custom backend URL (e.g. `http://localhost:5000`, `http://localhost:8000`, `http://localhost:8080`, etc.).
3. Click **Test Connection (Ping)** to verify live connectivity with your backend.
4. Click **Save & Apply**.

---

## 🧪 Testing with Built-in Mock Server

A zero-dependency standalone Node.js REST API server is included to verify all 5 endpoints immediately:

```powershell
cd "C:\Users\Arkajyoti Kundu\.gemini\antigravity\scratch\campus-connect"
node mockServer.js
```
The server will start at `http://localhost:5000` with CORS pre-configured and full support for `201 Created`, `409 Conflict`, `403 Forbidden`, and attendee queries.

To open the frontend:
```powershell
Start-Process "C:\Users\Arkajyoti Kundu\.gemini\antigravity\scratch\campus-connect\index.html"
```
