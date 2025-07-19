import React, { useEffect, useRef, useState } from "react";
import { createPollingClient } from "../utils/wsClient.js";
import { ghosts, evidenceTypes } from "./ghostData.js";
import Journal from "./components/Journal/Journal.jsx";
import GhostList from "./components/GhostList/GhostList.jsx";
import ActivityLog from "./components/ActivityLog/ActivityLog.jsx";
import SessionControls from "./components/SessionControls/SessionControls.jsx";
import GhostTable from "./components/GhostTable/GhostTable.jsx";
import DiscordSessionManager from "../utils/DiscordSessionManager.js";
import { FaBookOpen, FaSkull, FaListAlt, FaSearch, FaQuestionCircle, FaRedoAlt, FaExclamationTriangle, FaCopy } from "react-icons/fa";
import "../style.css";

// ================================================
// MOCK DATA FOR LOCAL DEVELOPMENT
// ================================================

const MOCK_STATE = {
  evidenceState: Object.fromEntries(evidenceTypes.map((e) => [e, "blank"])),
  boneFound: false,
  cursedObjectFound: false,
  possibleGhosts: [],
  finalGhost: null,
  log: [
    { user: { username: "misty" }, actionType: "evidence_update", evidence: "EMF Level 5", state: "circled" },
    { user: { username: "misty" }, actionType: "bone_update", found: true },
  ],
};

// ================================================
// MAIN APP COMPONENT
// ================================================

export default function App({ user }) {
  // ================================================
  // STATE MANAGEMENT
  // ================================================

  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(true);
  const [ghostStates, setGhostStates] = useState({});
  const [showGhostTable, setShowGhostTable] = useState(false);
  const [wsError, setWsError] = useState(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sessionCodeCopied, setSessionCodeCopied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connected"); // "connected", "reconnecting", "disconnected"

  // Refs for polling client and audio elements
  const pollingRef = useRef(null);
  const circleAudio = useRef();
  const crossAudio = useRef();
  const chooseAudio = useRef();

  // ================================================
  // CONNECTION & POLLING SETUP
  // ================================================

  useEffect(() => {
    if (!user) return;
    let client = createPollingClient(user, (msg) => {
      if (msg.type === "sync_state") {
        setState(msg.state);
        setGhostStates(msg.state.ghostStates || {});
      } else if (msg.type === "connection_lost") {
        setConnectionStatus("reconnecting");
        setWsError("Reconnecting to server...");
      } else if (msg.type === "connection_restored") {
        setConnectionStatus("connected");
        setWsError(null);
      } else if (msg.type === "send_failed") {
        setWsError("Failed to save changes. Will retry automatically.");
        setTimeout(() => setWsError(null), 5000); // Clear error after 5 seconds
      }
    });
    pollingRef.current = client;
    setConnected(true);
    setConnectionStatus("connected");
    setWsError(null);
    return () => {
      if (pollingRef.current) {
        pollingRef.current.close();
        pollingRef.current = null;
      }
      setConnected(false);
      setConnectionStatus("disconnected");
    };
  }, [user]);

  // ================================================
  // WINDOW UNLOAD HANDLING
  // ================================================

  useEffect(() => {
    if (!user) return;

    const handleBeforeUnload = async (event) => {
      // Attempt to disconnect gracefully
      if (pollingRef.current && pollingRef.current.disconnect) {
        try {
          await pollingRef.current.disconnect();
        } catch (err) {
          console.warn("[App] Failed to disconnect on page unload:", err);
        }
      }
    };

    const handleUnload = () => {
      // Synchronous disconnect as backup
      if (pollingRef.current && pollingRef.current.disconnect) {
        navigator.sendBeacon && navigator.sendBeacon(`/api/session/disconnect`, JSON.stringify({
          sessionId: user.sessionId || "default-session",
          userId: user.id || user.username || "anonymous"
        }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [user]);

  // ================================================
  // EVENT HANDLERS - EVIDENCE
  // ================================================

  function handleToggleEvidence(evidence) {
    if (!state || !pollingRef.current) return;
    const current = state.evidenceState[evidence] || "blank";
    const next =
      current === "blank"
        ? "circled"
        : current === "circled"
          ? "crossed"
          : "blank";

    // Play audio feedback
    if (next === "circled" && circleAudio.current) circleAudio.current.play();
    if (next === "crossed" && crossAudio.current) crossAudio.current.play();
    if (next === "blank" && chooseAudio.current) chooseAudio.current.play();

    // Update local state for immediate UI feedback
    setState((prev) => ({
      ...prev,
      evidenceState: {
        ...prev.evidenceState,
        [evidence]: next,
      },
    }));

    // Send update to server
    pollingRef.current.sendMessage({
      type: "evidence_update",
      evidence,
      state: next,
      user,
    });
  }

  // ================================================
  // EVENT HANDLERS - SESSION CONTROLS
  // ================================================

  function handleBoneToggle(found) {
    if (!pollingRef.current) return;
    setState((prev) => ({
      ...prev,
      boneFound: found,
    }));
    pollingRef.current.sendMessage({
      type: "bone_update",
      found,
      user,
    });
  }

  function handleCursedObjectToggle(found) {
    if (!pollingRef.current) return;
    setState((prev) => ({
      ...prev,
      cursedObjectFound: found,
    }));
    pollingRef.current.sendMessage({
      type: "cursed_object_update",
      found,
      user,
    });
  }

  // ================================================
  // EVENT HANDLERS - GHOST SELECTION
  // ================================================

  function handleGhostToggle(ghostName) {
    if (!pollingRef.current) return;
    const current = ghostStates[ghostName] || "none";

    if (current === "none") {
      // Circle this ghost and uncircle all others
      if (circleAudio.current) circleAudio.current.play();
      const newGhostStates = Object.fromEntries(
        Object.keys(ghostStates).map((g) => [g, g === ghostName ? "circled" : "none"])
      );
      setGhostStates(newGhostStates);
      pollingRef.current.sendMessage({
        type: "ghost_state_update",
        ghostName,
        state: "circled",
        user,
      });
      // Send uncircle messages for other ghosts
      Object.keys(ghostStates).forEach((g) => {
        if (g !== ghostName && ghostStates[g] === "circled") {
          pollingRef.current.sendMessage({
            type: "ghost_state_update",
            ghostName: g,
            state: "none",
            user,
          });
        }
      });
    } else {
      // Clear any existing state
      if (chooseAudio.current) chooseAudio.current.play();
      setGhostStates((prev) => ({
        ...prev,
        [ghostName]: "none",
      }));
      pollingRef.current.sendMessage({
        type: "ghost_state_update",
        ghostName,
        state: "none",
        user,
      });
    }
  }

  // ================================================
  // EVENT HANDLERS - RESET FUNCTIONALITY
  // ================================================

  function handleResetInvestigation() {
    setShowResetModal(false);
    setResetting(true);
    if (pollingRef.current) {
      pollingRef.current.sendMessage({
        type: "reset_investigation",
        user,
      });
    }
    setTimeout(() => setResetting(false), 1200);
  }

  // ================================================
  // EVENT HANDLERS - SESSION CODE COPY
  // ================================================

  async function handleCopySessionCode() {
    try {
      const sessionCode = getSessionCodeFromUser(user);
      if (sessionCode) {
        await navigator.clipboard.writeText(sessionCode);
        setSessionCodeCopied(true);
        setTimeout(() => setSessionCodeCopied(false), 2000);
      }
    } catch (err) {
      console.warn("Failed to copy session code to clipboard:", err);
    }
  }

  // Helper function to extract session code from user object
  function getSessionCodeFromUser(user) {
    if (!user?.sessionId) return null;

    // Extract code from different session ID formats
    if (user.sessionId.startsWith('session-')) {
      return user.sessionId.replace('session-', '');
    }

    // For Discord sessions or other formats, show a truncated version
    if (user.sessionId.length > 8) {
      return user.sessionId.substring(0, 8).toUpperCase();
    }

    return user.sessionId.toUpperCase();
  }

  // ================================================
  // RENDER LOGIC & ERROR HANDLING
  // ================================================

  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const effectiveState = state || (isLocal ? MOCK_STATE : null);

  // Error states
  if (!user) {
    return <div style={{ padding: 32, color: "red" }}>No user found. Please reload and enter a username.</div>;
  }
  if (!effectiveState) {
    if (wsError) {
      return (
        <div style={{ padding: 32, color: "red" }}>
          {wsError}
        </div>
      );
    }
    return <div style={{ padding: 32 }}>Connecting to book...</div>;
  }

  // Computed values for render
  const activeUsers = effectiveState.activeUsers || [];
  const participants = effectiveState.participants || [];
  
  // Use participants if available (Discord sessions), otherwise fall back to activeUsers
  const users = participants.length > 0 
    ? participants
    : activeUsers.length > 0 
      ? activeUsers.map(userId => ({ username: userId }))
      : [{ username: user.username }]; // Fallback to current user if no data
  
  // Use server-computed values (possibleGhosts and finalGhost come from server)
  const possibleGhosts = effectiveState.possibleGhosts || [];
  const finalGhost = effectiveState.finalGhost || "?";

  // ================================================
  // MAIN RENDER
  // ================================================

  return (
    <>
      <div className="journal-app-main">

        {/* ================================================
            LEFT PAGE - EVIDENCE & CONTROLS
            ================================================ */}
        <div className="journal-page left">
          <h1 className="journal-title">
            <FaBookOpen style={{ marginRight: 8, verticalAlign: "middle" }} />
            Phasmophobia Journal
          </h1>

          <div className="ghost-hunting-team">
            <b>
              <FaSkull style={{ marginRight: 4, verticalAlign: "middle" }} />
              Ghost Hunting Team:
            </b>{" "}
            {users.map((u, index) => {
              const isCurrentUser = u.username === user.username;
              console.log(`[App] User ${u.username} === ${user.username}? ${isCurrentUser}`);
              
              return (
                <span key={u.username || index}>
                  {index > 0 && ", "}
                  <span 
                    className={isCurrentUser ? "current-user" : "other-user"}
                    style={{
                      color: isCurrentUser ? "#B22222" : "inherit",
                      fontWeight: isCurrentUser ? "bold" : "normal"
                    }}
                  >
                    {u.username}
                  </span>
                </span>
              );
            })}
          </div>

          <SessionControls
            users={users}
            boneFound={effectiveState.boneFound}
            cursedObjectFound={effectiveState.cursedObjectFound}
            onBoneToggle={handleBoneToggle}
            onCursedObjectToggle={handleCursedObjectToggle}
          />

          <div className="evidence-content-area">
            <h2 className="section-title evidence-section-title">
              <FaSearch style={{ marginRight: 8, verticalAlign: "middle" }} />
              Evidence
            </h2>

            <Journal
              evidenceState={effectiveState.evidenceState}
              evidenceTypes={evidenceTypes}
              onToggle={handleToggleEvidence}
            />
          </div>

          <div className="status-bar">
            {/* Only show status and join code for browser sessions, not Discord */}
            {!user?.isDiscordSession && (
              <>
                Status: 
                <span style={{
                  color: connectionStatus === "connected" ? "#28a745" : 
                         connectionStatus === "reconnecting" ? "#ffc107" : "#dc3545",
                  fontWeight: "bold"
                }}>
                  {connectionStatus === "connected" ? "Connected" : 
                   connectionStatus === "reconnecting" ? "Reconnecting..." : "Disconnected"}
                </span>
                {wsError && (
                  <span style={{ color: "#ffc107", marginLeft: "8px" }}>
                    ({wsError})
                  </span>
                )}
                {getSessionCodeFromUser(user) && (
                  <>
                    {" • Join Code: "}
                    <span className="session-code-book">
                      {getSessionCodeFromUser(user)}
                    </span>
                    <button
                      className="session-code-copy-btn-book"
                      onClick={handleCopySessionCode}
                      title={sessionCodeCopied ? "Copied!" : "Copy join code"}
                      disabled={sessionCodeCopied}
                    >
                      <FaCopy />
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Mobile-only reset button */}
          <div className="mobile-reset-btn-container">
            <button
              className="reset-investigation-btn"
              onClick={() => setShowResetModal(true)}
              disabled={resetting}
              title="Start New Investigation"
            >
              <FaRedoAlt style={{ marginRight: 6, verticalAlign: "middle" }} />
              {resetting ? "Resetting..." : "Start New Investigation"}
            </button>
          </div>
        </div>

        {/* ================================================
            BOOK BINDING
            ================================================ */}
        <div className="journal-binding" />

        {/* ================================================
            RIGHT PAGE - GHOSTS & ACTIVITY
            ================================================ */}
        <div className="journal-page right">
          <div className="possible-ghosts-content-area">
            {/* Ghost section header with final ghost display */}
            <div className="possible-ghosts-header-row">
              <div className="possible-ghosts-title-row">
                <h2 className="section-title possible-ghosts-title" style={{ marginBottom: 0 }}>
                  <FaListAlt style={{ marginRight: 8, verticalAlign: "middle" }} />
                  Possible Ghosts
                </h2>
                <button
                  className="ghost-list-table-btn"
                  title="Show all ghosts table"
                  onClick={() => setShowGhostTable(true)}
                >
                  <FaQuestionCircle />
                </button>
              </div>
              <div className="final-ghost-inline">
                <span className="final-ghost-label-inline">Ghost:</span>
                <span
                  className={
                    "final-ghost-value-inline" +
                    (finalGhost === "?" ? " final-ghost-unknown" : "")
                  }
                >
                  {finalGhost === "?" ? "???" : finalGhost}
                </span>
              </div>
            </div>

            {/* Ghost list */}
            <div className="possible-ghosts-list" style={{ marginBottom: "0" }}>
              <GhostList
                ghosts={ghosts}
                possibleGhosts={possibleGhosts}
                ghostStates={ghostStates}
                onGhostToggle={handleGhostToggle}
                evidenceState={effectiveState.evidenceState}
                onShowTable={() => setShowGhostTable(true)}
              />
            </div>
          </div>

          {/* Ghost table modal */}
          {showGhostTable && (
            <GhostTable ghosts={ghosts} onClose={() => setShowGhostTable(false)} />
          )}

          {/* Activity log section */}
          <h2 className="section-title activity-log-title-main">
            <FaBookOpen style={{ marginRight: 8, verticalAlign: "middle" }} />
            Activity Log
          </h2>
          <div className="activity-log-wrapper">
            <ActivityLog log={effectiveState.log || []} />
          </div>

          {/* Desktop-only reset button */}
          <div className="desktop-reset-btn-container" style={{ marginTop: "12px", display: "flex", justifyContent: "center" }}>
            <button
              className="reset-investigation-btn"
              onClick={() => setShowResetModal(true)}
              disabled={resetting}
              title="Start New Investigation"
            >
              <FaRedoAlt style={{ marginRight: 6, verticalAlign: "middle" }} />
              {resetting ? "Resetting..." : "Start New Investigation"}
            </button>
          </div>
        </div>

        {/* ================================================
            RESET CONFIRMATION MODAL
            ================================================ */}
        {showResetModal && (
          <div className="reset-modal-backdrop">
            <div className="reset-modal">
              <FaExclamationTriangle className="reset-modal-icon" />
              <div className="reset-modal-title">Start New Investigation?</div>
              <div className="reset-modal-msg">
                This will <b>reset all evidence, ghosts, and progress</b> for this session.<br />
                Are you sure you want to continue?
              </div>
              <div className="reset-modal-actions">
                <button
                  className="reset-modal-btn cancel"
                  onClick={() => setShowResetModal(false)}
                  disabled={resetting}
                >
                  Cancel
                </button>
                <button
                  className="reset-modal-btn confirm"
                  onClick={handleResetInvestigation}
                  disabled={resetting}
                >
                  <FaRedoAlt style={{ marginRight: 5, verticalAlign: "middle" }} />
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================
            RESPONSIVE STYLES
            ================================================ */}
        <style>
          {`
          /* Default: hide mobile button, show desktop button */
          .mobile-reset-btn-container {
            display: none;
          }
          .desktop-reset-btn-container {
            display: flex;
          }
          
          @media (max-width: 900px) {
            .mobile-reset-btn-container {
              display: flex !important;
              justify-content: center !important;
              margin-top: 12px !important;
            }
            .desktop-reset-btn-container {
              display: none !important;
            }
          }
          
          .final-ghost-value-inline.final-ghost-unknown {
            font-weight: bold;
            letter-spacing: 0.18em;
            font-size: 1.25em;
          }
          `}
        </style>
      </div>

      {/* ================================================
          AUDIO ELEMENTS FOR SOUND EFFECTS
          ================================================ */}
      <audio ref={circleAudio} src="/circle.mp3" preload="auto" />
      <audio ref={crossAudio} src="/circle.mp3" preload="auto" />
      <audio ref={chooseAudio} src="/choose.wav" preload="auto" />
    </>
  );
}