# Discord Session Integration Plan

## Discord Activities API Capabilities

### Available APIs for User Presence Detection

1. **`ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE` Event**
   - Real-time event that fires when users join/leave the Discord activity
   - Provides updated participants list automatically
   - Perfect for session management based on activity participation

2. **`getInstanceConnectedParticipants()` Command**
   - Returns current list of participants in the activity
   - Can be polled or called on-demand
   - Provides user details (ID, username, etc.)

### Implementation Architecture

```typescript
// Discord SDK Integration
import { DiscordSDK, EventPayloadData } from '@discord/embedded-app-sdk';

// Type for participant update events
type ParticipantUpdateEvent = EventPayloadData<'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE'>;

class DiscordSessionManager {
  private discordSdk: DiscordSDK;
  private currentParticipants: Set<string> = new Set();
  
  constructor(clientId: string) {
    this.discordSdk = new DiscordSDK(clientId);
  }

  async initialize() {
    await this.discordSdk.ready();
    
    // Subscribe to participant changes
    await this.discordSdk.subscribe(
      'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',
      this.handleParticipantUpdate.bind(this)
    );
    
    // Get initial participants
    const { participants } = await this.discordSdk.commands.getInstanceConnectedParticipants();
    this.updateParticipants(participants);
  }

  private handleParticipantUpdate(event: ParticipantUpdateEvent) {
    console.log('Participants updated:', event.participants);
    this.updateParticipants(event.participants);
  }

  private updateParticipants(participants: any[]) {
    const newParticipants = new Set(participants.map(p => p.id));
    
    // Detect joins
    const joined = [...newParticipants].filter(id => !this.currentParticipants.has(id));
    
    // Detect leaves
    const left = [...this.currentParticipants].filter(id => !newParticipants.has(id));
    
    this.currentParticipants = newParticipants;
    
    // Update session based on participants
    this.updateSession(participants, joined, left);
  }

  private async updateSession(participants: any[], joined: string[], left: string[]) {
    // If this is a Discord activity, create/join session based on activity participants
    if (participants.length > 0) {
      // Use Discord instance ID as session identifier
      const sessionId = this.discordSdk.instanceId;
      
      // Send all current participants to server
      await fetch('/api/sessions/discord-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          participants: participants.map(p => ({
            id: p.id,
            username: p.username,
            discordUser: true
          })),
          joined,
          left
        })
      });
    }
  }
}
```

### Server-Side Integration

```javascript
// Enhanced server.js with Discord session support
app.post('/api/sessions/discord-sync', (req, res) => {
  const { sessionId, participants, joined, left } = req.body;
  
  // Ensure session exists
  if (!sessionStates[sessionId]) {
    sessionStates[sessionId] = {
      ghostData: ghostDataTemplate,
      sessionCode: sessionId, // Use Discord instance ID as session code
      isDiscordSession: true,
      createdAt: Date.now()
    };
    sessionUsers[sessionId] = new Set();
  }

  // Update session participants based on Discord activity
  sessionUsers[sessionId].clear();
  participants.forEach(participant => {
    sessionUsers[sessionId].add(JSON.stringify({
      username: participant.username,
      discordId: participant.id,
      isDiscordUser: true
    }));
  });

  console.log(`Discord session ${sessionId} updated:`, {
    totalParticipants: participants.length,
    joined: joined.length,
    left: left.length
  });

  res.json({ success: true, sessionId, participantCount: participants.length });
});
```

### Client Integration Strategy

```javascript
// Enhanced main.jsx with Discord detection
import { DiscordSDK } from '@discord/embedded-app-sdk';

let discordSessionManager = null;

// Check if running in Discord
const isDiscordEnvironment = () => {
  return new URLSearchParams(window.location.search).has('frame_id');
};

// Initialize based on environment
if (isDiscordEnvironment()) {
  // Discord environment - use activity-based sessions
  try {
    discordSessionManager = new DiscordSessionManager(YOUR_DISCORD_CLIENT_ID);
    await discordSessionManager.initialize();
    console.log('Discord session management initialized');
  } catch (error) {
    console.warn('Discord SDK failed, falling back to manual sessions:', error);
    showUsernamePrompt(); // Fallback to manual username
  }
} else {
  // Standalone environment - use manual username management
  showUsernamePrompt();
}
```

## Benefits of This Approach

1. **Automatic Session Management**: No need for session codes when in Discord
2. **Real-time Sync**: Immediate updates when users join/leave Discord activity  
3. **Seamless UX**: Users automatically grouped by Discord activity participation
4. **Fallback Support**: Still works in standalone mode with manual usernames
5. **No Polling**: Event-driven updates instead of constant server requests

## Implementation Timeline

1. **Phase 1**: Add Discord SDK to client dependencies
2. **Phase 2**: Implement DiscordSessionManager class  
3. **Phase 3**: Add server endpoints for Discord session sync
4. **Phase 4**: Update client to detect Discord vs standalone mode
5. **Phase 5**: Test with multiple users in Discord activity

## Discord Application Setup Required

- Register application in Discord Developer Portal
- Configure OAuth2 redirect URIs
- Set up activity/embedded app settings
- Get client ID for SDK initialization

This approach will give you exactly what you wanted - automatic session management where users in the same Discord activity are automatically grouped into the same investigation session, with real-time updates when people join or leave!
