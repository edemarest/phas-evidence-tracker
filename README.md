# 👻 Phasmophobia Evidence Tracker

A collaborative real-time evidence tracking tool for Phasmophobia ghost hunting teams. Works as both a web app and Discord Activity.

## ✨ Features

- **🔍 Real-time Evidence Tracking** - Circle confirmed evidence, cross out ruled-out evidence
- **🎯 Smart Ghost Filtering** - Automatically filters possible ghosts based on selected evidence
- **👥 Team Collaboration** - Activity log shows team member actions in real-time
- **🦴 Special Item Tracking** - Mark bones and cursed objects when found
- **📱 Mobile-Responsive Design** - Optimized for both desktop and mobile devices
- **🔊 Audio Feedback** - Sound effects for user interactions
- **🔄 Reset Functionality** - Start new investigations with confirmation modal
- **🎮 Discord Integration** - Works as Discord Embedded App Activity

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
- **npm or yarn** - Package manager (comes with Node.js)

### Installation & Setup
```bash
# 1. Clone and install dependencies
git clone <repository-url>
cd phas-evidence-tracker
npm run install:all

# 2. Set up environment variables
cp .env.example .env
cp client/.env.example client/.env.local

# 3. Configure Discord (optional)
# Edit .env and add your Discord application credentials
VITE_DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_secret

# 4. Start development servers
npm run dev:server  # Backend API on :3001
npm run dev:client  # Frontend on :3000
```

### Environment Configuration
```bash
# Core Settings
VITE_DISCORD_CLIENT_ID=your_discord_client_id    # Discord app ID
DISCORD_CLIENT_SECRET=your_discord_secret        # Discord app secret
VITE_PUBLIC_URL=https://your-frontend-url.com    # Production frontend URL

# Development URLs (auto-configured)
VITE_WS_URL=ws://localhost:3001/ws               # Local WebSocket
```

---

## 📖 How to Use

### Basic Evidence Tracking
1. **Click evidence items** to cycle through states: `blank` → `circled` → `crossed`
2. **Circled** = Evidence confirmed/found
3. **Crossed** = Evidence ruled out/disproven
4. **Blank** = Evidence unknown/reset

### Ghost Selection
1. **Click possible ghosts** to mark your final choice
2. **Only one ghost** can be circled at a time
3. **Evidence filtering** automatically narrows down possibilities

### Team Features
1. **Activity Log** - View real-time team member actions
2. **Special Items** - Toggle bone and cursed object checkboxes
3. **Reset Investigation** - Clear all progress for new hunts

### Mobile Usage
- **Responsive design** adapts to phone screens
- **Touch-friendly** controls for evidence and ghost selection
- **Optimized layout** with compressed spacing

---

## 🚢 Deployment

### Backend Deployment (Render/Railway)
```bash
# Deploy the server/ directory
# Set these environment variables:
VITE_DISCORD_CLIENT_ID=your_discord_id
DISCORD_CLIENT_SECRET=your_discord_secret
VITE_PUBLIC_URL=https://your-frontend-domain.com
PORT=3001  # Auto-assigned by platform
```

### Frontend Deployment (Render/Netlify)
```bash
# Deploy the client/ directory
# Build settings:
Build Command: npm run build
Start Command: npm run preview
Publish Directory: dist

# Environment variables:
VITE_DISCORD_CLIENT_ID=your_discord_id
VITE_PUBLIC_URL=https://your-frontend-domain.com
```

### Discord Activity Setup
1. Create Discord application at [discord.com/developers](https://discord.com/developers/applications)
2. Enable "Embedded App SDK" in app settings
3. Add your frontend URL to "URL Mappings"
4. Configure OAuth2 redirect URLs

---

## 🛠️ Tech Stack & Architecture

### Frontend Stack
- **React 19** - Modern UI framework with latest features
- **Vite 5** - Fast build tool and dev server
- **CSS Modules** - Scoped styling with custom properties
- **React Icons** - Comprehensive icon library

### Backend Stack
- **Express.js** - Lightweight Node.js web framework
- **HTTP Polling** - Real-time updates (2-second intervals)
- **In-Memory State** - Shared investigation data
- **Discord OAuth** - Authentication for embedded apps

### Key Libraries
- **@discord/embedded-app-sdk** - Discord integration
- **node-fetch** - HTTP client for server
- **dotenv** - Environment variable management

---

## 📁 Project Structure