# AEGIS · Autonomous Evacuation Guidance & Intelligence System

**AEGIS** is an intelligent, multi-agent building evacuation simulation and live hazard routing platform built with a **Django** backend and a **Vite + React** frontend.

Designed for SDG 11 (Sustainable Cities & Human Settlements), AEGIS models dynamic crowd movements across multi-floor architectures, accounts for active fire and smoke hazards, automatically re-routes trapped occupants away from hazardous zones, and provides live mobile QR floor maps with safety certification quizzes.

---

## 🚀 Key Features

- **Multi-Floor Building Architecture**:
  - Full 4-floor simulation (Ground, Floor 1, Floor 2, Floor 3).
  - Vertical egress networks with interconnected stairwells (S1–S8) and emergency lifts (automatically grounded during fire alarms).
  - High-visibility Ground Exits (Exits A, B, C, D) with flow capacity constraints.

- **Dynamic Crowd Dynamics & Dynamic Re-Routing**:
  - Multi-agent pathfinding based on tactical distance grids and real-time hazard avoidance.
  - Automatic re-routing when fires spread into hallways or corridors.
  - Panic index, queuing delay calculations, and trapped occupant tracking.

- **Overhead Sprinklers & Fire Spread Simulation**:
  - Localized thermal activation of overhead sprinkler piping network.
  - Radiant fire propagation and volumetric smoke dispersion.
  - Tactical first-responder deployment for incapacitated occupants.

- **Mobile Floor Blueprint & QR Code Integration**:
  - Scan QR code to launch a dedicated mobile floor map directly in your phone's browser (`/?view=map`).
  - Displays real-time floor occupants, exit directions, and fire extinguisher stations.
  - Interactive evacuation controls and floor switcher.

- **Interactive Safety Quiz & Certification**:
  - 6-question emergency evacuation preparedness test.
  - Instant scoring and printable certificate of completion.

- **Emergency Alert Dispatch**:
  - Automated emergency SMS dispatch via Fast2SMS API with direct mobile floor map links.

---

## 🛠️ Tech Stack

- **Backend**:
  - Python 3.10+
  - Django & Django REST Framework
  - SQLite (with `BuildingLayout` & `SimulationReport` models)
  - Custom Graph Routing & BFS/Dijkstra Simulation Engine

- **Frontend**:
  - React 18
  - Vite
  - Lucide React Icons
  - HTML5 Canvas 2D & 3D Isometric Viewports
  - Web Audio API (industrial alarm siren synthesis)

---

## 📦 Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/ahelan46/Infinix.git
cd Infinix
```

### 2. Backend Setup (Django)
```bash
# Create and activate virtual environment
python -m venv myvenv
# On Windows:
myvenv\Scripts\activate
# On Linux/macOS:
source myvenv/bin/activate

# Install dependencies
pip install django django-cors-headers requests python-dotenv

# Run database migrations
python manage.py migrate

# (Optional) Set up .env for SMS
cp .env.example .env

# Start Django backend server (Port 8000)
python manage.py runserver 0.0.0.0:8000
```

### 3. Frontend Setup (React + Vite)
```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server (Port 5173)
npm run dev -- --host
```

---

## 🌐 Accessing the Application

- **Desktop Simulator**: `http://localhost:5173/`
- **Mobile Dedicated Map**: `http://<your-wifi-ip>:5173/?view=map`
- **Backend API**: `http://127.0.0.1:8000/api/evacuation/`

---

## 📄 License
This project is open-source under the MIT License.
