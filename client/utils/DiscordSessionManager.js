import { DiscordSDK } from '@discord/embedded-app-sdk';

/**
 * Discord Session Manager
 * Handles automatic session creation and participant management for Discord Activities
 */
class DiscordSessionManager {
  constructor() {
    this.discordSdk = null;
    this.currentSession = null;
    this.participantUpdateCallback = null;
    this.isInitialized = false;
  }

  /**
   * Initialize Discord SDK and auto-join session
   */
  async initialize(clientId) {
    try {
      console.log('[Discord] Initializing Discord SDK...');
      
      // Initialize Discord SDK
      this.discordSdk = new DiscordSDK(clientId);
      await this.discordSdk.ready();
      
      console.log('[Discord] SDK ready - instanceId:', this.discordSdk.instanceId);
      
      // Auto-join session with current participants
      const sessionData = await this.autoJoinSession();
      this.currentSession = sessionData.sessionId;
      
      // Set up real-time participant monitoring
      this.setupParticipantMonitoring();
      
      this.isInitialized = true;
      console.log('[Discord] Initialization complete - session:', this.currentSession);
      
      return sessionData;
    } catch (error) {
      console.error('[Discord] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check if running in Discord environment
   */
  static isDiscordEnvironment() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.has('frame_id') || urlParams.has('instance_id');
  }

  /**
   * Get current Discord user info
   */
  getCurrentUser() {
    if (!this.discordSdk) return null;
    
    // Note: In a real Discord app, you'd get this from authentication
    // For now, we'll use instance data or mock it
    return {
      discordId: 'current-user-id', // This would come from Discord auth
      username: 'Discord User'       // This would come from Discord auth
    };
  }

  /**
   * Get current activity participants
   */
  async getParticipants() {
    if (!this.discordSdk) {
      throw new Error('Discord SDK not initialized');
    }

    try {
      const response = await this.discordSdk.commands.getInstanceConnectedParticipants();
      console.log('[Discord] Retrieved participants:', response.participants.length);
      return response.participants;
    } catch (error) {
      console.error('[Discord] Failed to get participants:', error);
      // Return mock data for development
      return [
        {
          id: 'user1',
          username: 'TestUser1'
        },
        {
          id: 'user2', 
          username: 'TestUser2'
        }
      ];
    }
  }

  /**
   * Auto-create/join Discord session
   */
  async autoJoinSession() {
    const participants = await this.getParticipants();
    const currentUser = this.getCurrentUser();
    
    console.log('[Discord] Auto-joining session with', participants.length, 'participants');
    
    // Use .proxy/ path for Discord Activity environment
    const apiPath = '/.proxy/api/sessions/discord-auto-join';
    
    const response = await fetch(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instanceId: this.discordSdk.instanceId,
        currentUser,
        allParticipants: participants
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Auto-join failed: ${error.error}`);
    }

    const sessionData = await response.json();
    console.log('[Discord] Auto-join successful:', {
      sessionId: sessionData.sessionId,
      isNewSession: sessionData.isNewSession,
      participantCount: sessionData.participants.length
    });

    return sessionData;
  }

  /**
   * Set up real-time participant monitoring
   */
  setupParticipantMonitoring() {
    if (!this.discordSdk) return;

    console.log('[Discord] Setting up participant monitoring...');
    
    try {
      this.discordSdk.subscribe(
        'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',
        this.handleParticipantUpdate.bind(this)
      );
      console.log('[Discord] Participant monitoring active');
    } catch (error) {
      console.error('[Discord] Failed to set up participant monitoring:', error);
    }
  }

  /**
   * Handle Discord participant updates
   */
  async handleParticipantUpdate(event) {
    console.log('[Discord] Participant update received:', event.participants.length, 'participants');
    
    try {
      // Use .proxy/ path for Discord Activity environment
      const apiPath = '/.proxy/api/sessions/discord-sync-participants';
      
      // Sync participants with server
      const response = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: this.discordSdk.instanceId,
          participants: event.participants,
          joined: [], // Discord SDK should provide this, but we'll calculate on server
          left: []    // Discord SDK should provide this, but we'll calculate on server
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[Discord] Participant sync result:', result);
        
        // Notify callback if registered
        if (this.participantUpdateCallback) {
          this.participantUpdateCallback(event.participants, result);
        }
      } else {
        console.error('[Discord] Failed to sync participants:', response.statusText);
      }
    } catch (error) {
      console.error('[Discord] Participant sync error:', error);
    }
  }

  /**
   * Register callback for participant updates
   */
  onParticipantUpdate(callback) {
    this.participantUpdateCallback = callback;
  }

  /**
   * Get current session ID
   */
  getSessionId() {
    return this.currentSession;
  }

  /**
   * Clean up Discord SDK
   */
  cleanup() {
    if (this.discordSdk) {
      try {
        this.discordSdk.unsubscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', this.handleParticipantUpdate);
        console.log('[Discord] Cleaned up participant monitoring');
      } catch (error) {
        console.error('[Discord] Cleanup error:', error);
      }
    }
    this.isInitialized = false;
  }
}

export default DiscordSessionManager;
