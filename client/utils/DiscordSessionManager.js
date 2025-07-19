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
      console.log('[Discord] Starting authentication process...');
      const authResult = await this.authenticateUser();
      console.log('[Discord] Authentication result:', authResult ? 'Success' : 'Failed');
      
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
      
      // For Discord Activities, we can try a simpler approach
      // First try to authenticate with minimal scopes
      const auth = await this.discordSdk.commands.authenticate({
        scopes: ['identify']
      });
      
      if (auth?.user) {
        console.log('[Discord] User authenticated successfully:', auth.user.username || auth.user.global_name);
        this.authenticatedUser = auth.user;
        return auth.user;
      } else {
        throw new Error('Authentication returned no user data');
      }
      
    } catch (error) {
      console.warn('[Discord] Simple authentication failed, trying OAuth flow:', error);
      
      // Fallback to OAuth flow if simple auth doesn't work
      try {
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
          scope: ["identify"],
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
          console.log('[Discord] OAuth authentication successful:', auth.user.username);
          this.authenticatedUser = auth.user;
          return auth.user;
        } else {
          throw new Error('OAuth authentication returned no user data');
        }
        
      } catch (oauthError) {
        console.warn('[Discord] OAuth authentication also failed:', oauthError);
        return null;
      }
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
    const fallbackUser = {
      discordId: 'discord-user-' + (this.discordSdk.instanceId || Date.now()),
      username: 'Discord User'
    };
    console.log('[Discord] Using fallback user:', fallbackUser);
    return fallbackUser;
  }

  /**
   * Get current activity participants
   */
  async getParticipants() {
    if (!this.discordSdk) {
      throw new Error('Discord SDK not initialized');
    }

    try {
      console.log('[Discord] Attempting to get participants...');
      const response = await this.discordSdk.commands.getInstanceConnectedParticipants();
      console.log('[Discord] Raw participants response:', response);
      
      // If we got real participants, use them
      if (response.participants && response.participants.length > 0) {
        console.log('[Discord] Retrieved', response.participants.length, 'real participants');
        return response.participants.map(p => ({
          id: p.id,
          username: p.username || p.global_name || `Discord-${p.id}`
        }));
      }
      
      console.log('[Discord] No participants in response, falling back to current user');
      
    } catch (error) {
      console.error('[Discord] Failed to get participants:', error);
      
      // If it's an authentication error, try to re-authenticate
      if (error.code === 4006 || error.message?.includes('Not authenticated')) {
        console.log('[Discord] Authentication error detected, attempting re-authentication...');
        try {
          await this.authenticateUser();
          // Try participants again after authentication
          const retryResponse = await this.discordSdk.commands.getInstanceConnectedParticipants();
          if (retryResponse.participants && retryResponse.participants.length > 0) {
            console.log('[Discord] Retrieved participants after re-auth:', retryResponse.participants.length);
            return retryResponse.participants.map(p => ({
              id: p.id,
              username: p.username || p.global_name || `Discord-${p.id}`
            }));
          }
        } catch (retryError) {
          console.error('[Discord] Re-authentication failed:', retryError);
        }
      }
    }
    
    // Fallback to current user only
    try {
      const currentUser = await this.getCurrentUser();
      if (currentUser) {
        console.log('[Discord] Using current user as only participant:', currentUser.username);
        return [{
          id: currentUser.discordId,
          username: currentUser.username
        }];
      }
    } catch (userError) {
      console.error('[Discord] Failed to get current user as fallback:', userError);
    }
    
    // If all else fails, return empty array - no mock data
    console.warn('[Discord] No participants available, returning empty array');
    return [];
  }

  /**
   * Auto-create/join Discord session
   */
  async autoJoinSession() {
    // Ensure we have the current user first
    const currentUser = await this.getCurrentUser();
    console.log('[Discord] Current user for session:', currentUser);
    
    // Then get participants (this might include just the current user if authentication failed)
    const participants = await this.getParticipants();
    
    console.log('[Discord] Auto-joining session with', participants.length, 'participants');
    console.log('[Discord] Participants:', participants.map(p => p.username || p.id));
    
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
