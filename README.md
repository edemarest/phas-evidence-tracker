# 👻 Phas Evidence Tracker

A collaborative real-time evidence tracking tool for Phasmophobia ghost hunting teams. Track evidence, filter possible ghosts, and collaborate with your team in real-time through a journal-style interface.

## ✨ Features

- **🔍 Real-time Evidence Tracking** - Circle confirmed evidence, cross out ruled-out evidence
- **🎯 Smart Ghost Filtering** - Automatically filters possible ghosts based on selected evidence
- **👥 Team Collaboration** - Shared sessions with real-time activity logging
- **🦴 Special Item Tracking** - Mark bones and cursed objects when found
- **📱 Responsive Design** - Works on desktop and mobile devices
- **🔊 Audio Feedback** - Sound effects for interactions
- **🎮 Discord Integration** - Available as Discord Activity for seamless team coordination

---

## 🛠️ Tech Stack

### Frontend
- **React 19** with **Vite 5** - Modern UI framework and build tool
- **CSS3** with custom properties - Responsive journal-style design
- **HTTP Polling** - Real-time updates with automatic reconnection

### Backend
- **Express.js** - RESTful API with session management
- **In-Memory State** - Shared investigation data per session
- **Discord OAuth** - Authentication for embedded apps

### Libraries
- **@discord/embedded-app-sdk** - Discord Activity integration
- **React Icons** - UI iconography
- **node-fetch** - HTTP client

---

## 📁 Project Structure

```
phas-evidence-tracker/
├── client/                    # Frontend React app
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── utils/           # API client & Discord integration
│   │   └── ghostData.js     # Game data (ghosts, evidence types)
│   ├── public/              # Static assets
│   └── style.css           # Global styles
├── server/                   # Backend Express API
│   ├── ghostData.js         # Shared game data
│   └── server.js           # Main server with session management
└── README.md
```