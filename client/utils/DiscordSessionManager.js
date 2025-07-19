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
    this.authenticatedUser = null;
    this.clientId = null;
  }

  /**
   * Initialize Discord SDK and auto-join session
   */
  async initialize(clientId) {
    try {
      console.log('[Discord] Initializing Discord SDK...');
      
      // Store client ID for later use
      this.clientId = clientId;
      
      // Initialize Discord SDK
      this.discordSdk = new DiscordSDK(clientId);
      await this.discordSdk.ready();
      
      console.log('[Discord] SDK ready - instanceId:', this.discordSdk.instanceId);
      
      // First, authenticate the user to get proper access
      await this.authenticateUser();
      
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
   * Authenticate user with Discord
   */
  async authenticateUser() {
    try {
      console.log('[Discord] Starting user authentication...');
      
      // Use stored client ID
      if (!this.clientId) {
        throw new Error('No client ID available for authentication');
      }
      
      // Request authorization code
      const { code } = await this.discordSdk.commands.authorize({
        client_id: this.clientId,
        response_type: "code", 
        state: "",
        prompt: "none",
        scope: ["identify", "guilds"],
      });
      
      console.log('[Discord] Got authorization code, exchanging for token...');
      
      // Exchange code for access token using the proxy path
      const response = await fetch('/.proxy/api/token', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      
      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.status}`);
      }
      
      const { access_token } = await response.json();
      
      // Authenticate with Discord
      console.log('[Discord] Authenticating with access token...');
      const auth = await this.discordSdk.commands.authenticate({ access_token });
      
      if (auth?.user) {
        console.log('[Discord] User authenticated:', auth.user.username);
        this.authenticatedUser = auth.user;
        return auth.user;
      } else {
        throw new Error('Authentication returned no user data');
      }
      
    } catch (error) {
      console.warn('[Discord] Authentication failed, continuing without user data:', error);
      // Don't throw - we can still function with limited data
      return null;
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
  async getCurrentUser() {
    if (!this.discordSdk) return null;
    
    // If we have authenticated user data, use it
    if (this.authenticatedUser) {
      return {
        discordId: this.authenticatedUser.id,
        username: this.authenticatedUser.username || this.authenticatedUser.global_name || 'Discord User'
      };
    }
    
    try {
      // Try to get current user from Discord authentication if not already cached
      const authResponse = await this.discordSdk.commands.authenticate({
        scopes: [
          'identify', // Get user basic info
          'guilds'    // Get guild info if needed
        ]
      });
      
      if (authResponse && authResponse.user) {
        console.log('[Discord] Authenticated user:', authResponse.user);
        this.authenticatedUser = authResponse.user; // Cache it
        return {
          discordId: authResponse.user.id,
          username: authResponse.user.username || authResponse.user.global_name || 'Discord User'
        };
      }
    } catch (error) {
      console.warn('[Discord] Failed to authenticate user:', error);
    }
    
    // Fallback: try to get user from instance context
    try {
      // Get channel info which might have user context
      if (this.discordSdk.channelId) {
        const channel = await this.discordSdk.commands.getChannel();
        console.log('[Discord] Channel info:', channel);
        
        // Try to get current user from the SDK instance
        if (this.discordSdk.user) {
          return {
            discordId: this.discordSdk.user.id,
            username: this.discordSdk.user.username || this.discordSdk.user.global_name || 'Discord User'
          };
        }
      }
    } catch (error) {
      console.warn('[Discord] Failed to get channel/user info:', error);
    }
    
    // Last resort fallback - use instance ID as identifier
    return {
      discordId: 'discord-user-' + (this.discordSdk.instanceId || Date.now()),
      username: 'Discord User'
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
      
      // If we got real participants, use them
      if (response.participants && response.participants.length > 0) {
        return response.participants;
      }
      
      // If no participants but we have a current user, at least include them
      const currentUser = await this.getCurrentUser();
      if (currentUser) {
        return [{
          id: currentUser.discordId,
          username: currentUser.username
        }];
      }
      
      return [];
    } catch (error) {
      console.error('[Discord] Failed to get participants:', error);
      
      // Return current user only as fallback
      try {
        const currentUser = await this.getCurrentUser();
        if (currentUser) {
          console.log('[Discord] Using current user as only participant');
          return [{
            id: currentUser.discordId,
            username: currentUser.username
          }];
        }
      } catch (userError) {
        console.error('[Discord] Failed to get current user as fallback:', userError);
      }
      
      // Absolute last resort - return empty array instead of mock data
      console.warn('[Discord] No participants available, returning empty array');
      return [];
    }
  }

  /**
   * Auto-create/join Discord session
   */
  async autoJoinSession() {
    const participants = await this.getParticipants();
    const currentUser = await this.getCurrentUser();
    
    console.log('[Discord] Auto-joining session with', participants.length, 'participants');
    console.log('[Discord] Current user:', currentUser);
    
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
