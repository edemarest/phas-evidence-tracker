import React, { useEffect, useRef, useState } from "react";
import { createWSClient } from "../utils/wsClient.js";
import { ghosts, evidenceTypes } from "../../server/ghostData.js";
import Journal from "./components/Journal/Journal.jsx";
import GhostList from "./components/GhostList/GhostList.jsx";
import ActivityLog from "./components/ActivityLog/ActivityLog.jsx";
import SessionControls from "./components/SessionControls/SessionControls.jsx";
import GhostTable from "./components/GhostTable/GhostTable.jsx";
import { FaBookOpen, FaSkull, FaListAlt, FaSearch, FaQuestionCircle } from "react-icons/fa";
import "../style.css"; // Ensure global styles are imported

// Helper to filter ghosts based on evidence state
function filterGhosts(evidenceState, ghosts) {
  const circled = Object.entries(evidenceState)
    .filter(([_, v]) => v === "circled")
    .map(([k]) => k);
  const crossed = Object.entries(evidenceState)
    .filter(([_, v]) => v === "crossed")
    .map(([k]) => k);

  return ghosts.filter((ghost) => {
    // Must have all circled evidence
    if (!circled.every((e) => ghost.evidences.includes(e))) return false;
    // Must not have any crossed evidence
    if (crossed.some((e) => ghost.evidences.includes(e))) return false;
    return true;
  });
}

export default function App({ user }) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [ghostStates, setGhostStates] = useState({});
  const [showGhostTable, setShowGhostTable] = useState(false);
  const [wsError, setWsError] = useState(null);
  const wsRef = useRef(null);

  const sessionId = "default-session";

  useEffect(() => {
    if (!user) return;
    let ws;
    let closed = false;
    try {
      ws = createWSClient(sessionId, user, (msg) => {
        switch (msg.type) {
          case "ghost_state_update":
            setGhostStates((prev) => ({
              ...prev,
              [msg.ghostName]: msg.state,
            }));
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    log: [
                      ...prev.log,
                      {
                        user: msg.user,
                        actionType: "ghost_state_update",
                        ghostName: msg.ghostName,
                        state: msg.state,
                      },
                    ],
                  }
                : prev
            );
            break;
          case "sync_state":
            setState(msg.state);
            setGhostStates(msg.state.ghostStates || {});
            break;
          case "evidence_update":
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    evidenceState: {
                      ...prev.evidenceState,
                      [msg.evidence]: msg.state,
                    },
                    log: [
                      ...prev.log,
                      {
                        user: msg.user,
                        actionType: "evidence_update",
                        evidence: msg.evidence,
                        state: msg.state,
                      },
                    ],
                  }
                : prev
            );
            break;
          case "bone_update":
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    boneFound: msg.found,
                    log: [
                      ...prev.log,
                      {
                        user: msg.user,
                        actionType: "bone_update",
                        found: msg.found,
                      },
                    ],
                  }
                : prev
            );
            break;
          case "cursed_object_update":
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    cursedObjectFound: msg.found,
                    log: [
                      ...prev.log,
                      {
                        user: msg.user,
                        actionType: "cursed_object_update",
                        found: msg.found,
                      },
                    ],
                  }
                : prev
            );
            break;
          case "log_action":
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    log: [
                      ...prev.log,
                      {
                        user: msg.user,
                        action: msg.action,
                      },
                    ],
                  }
                : prev
            );
            break;
          case "user_joined":
          case "user_left":
            setState((prev) => ({ ...prev }));
            break;
          default:
            break;
        }
      });
      ws.onerror = (event) => {
        setWsError("WebSocket connection error. Please check your network or backend server.");
        setConnected(false);
      };
      ws.onclose = (event) => {
        if (!closed) {
          setWsError("WebSocket connection closed unexpectedly.");
          setConnected(false);
        }
      };
      wsRef.current = ws;
      setConnected(true);
    } catch (err) {
      setWsError("Failed to connect to WebSocket: " + err.message);
      setConnected(false);
    }
    return () => {
      closed = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [user]);

  // Evidence toggle handler
  function handleToggleEvidence(evidence) {
    if (!state || !wsRef.current) return;
    const current = state.evidenceState[evidence] || "blank";
    const next =
      current === "blank"
        ? "circled"
        : current === "circled"
        ? "crossed"
        : "blank";
    wsRef.current.sendMessage({
      type: "evidence_update",
      evidence,
      state: next,
      user,
    });
  }

  // Bone/cursed object toggle handlers
  function handleBoneToggle(found) {
    if (!wsRef.current) return;
    wsRef.current.sendMessage({
      type: "bone_update",
      found,
      user,
    });
  }
  function handleCursedObjectToggle(found) {
    if (!wsRef.current) return;
    wsRef.current.sendMessage({
      type: "cursed_object_update",
      found,
      user,
    });
  }

  // Ghost toggle handler
  function handleGhostToggle(ghostName) {
    if (!wsRef.current) return;
    const current = ghostStates[ghostName] || "none";
    const next =
      current === "none"
        ? "circled"
        : current === "circled"
        ? "crossed"
        : "none";
    wsRef.current.sendMessage({
      type: "ghost_state_update",
      ghostName,
      state: next,
      user,
    });
    // Optimistically update local state for instant feedback
    setGhostStates((prev) => ({
      ...prev,
      [ghostName]: next,
    }));
  }

  if (!user) {
    return <div style={{ padding: 32, color: "red" }}>No user found. Please reload and enter a username.</div>;
  }
  if (wsError) {
    return <div style={{ padding: 32, color: "red" }}>{wsError}</div>;
  }
  if (!state) {
    return <div style={{ padding: 32 }}>Connecting to session...</div>;
  }

  // For now, users list is not tracked in state, so just show current user
  const users = [{ username: user.username }];

  const possibleGhosts = filterGhosts(state.evidenceState, ghosts);
  const finalGhost = possibleGhosts.length === 1 ? possibleGhosts[0].name : "?";

  return (
    <div className="journal-app-main">
      {/* Left Page */}
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
          {users.map((u) => u.username).join(", ")}
        </div>
        <SessionControls
          users={users}
          boneFound={state.boneFound}
          cursedObjectFound={state.cursedObjectFound}
          onBoneToggle={handleBoneToggle}
          onCursedObjectToggle={handleCursedObjectToggle}
        />
        <h2 className="section-title evidence-section-title">
          <FaSearch style={{ marginRight: 8, verticalAlign: "middle" }} />
          Evidence
        </h2>
        <Journal
          evidenceState={state.evidenceState}
          evidenceTypes={evidenceTypes}
          onToggle={handleToggleEvidence}
        />
        <div className="status-bar">
          Status: {connected ? "Connected" : "Disconnected"}
        </div>
      </div>

      {/* Right Page */}
      <div className="journal-page right">
        <div className="possible-ghosts-header-row">
          <h2 className="section-title possible-ghosts-title" style={{ marginBottom: 0 }}>
            <FaListAlt style={{ marginRight: 8, verticalAlign: "middle" }} />
            Possible Ghosts
          </h2>
          <button
            className="ghost-list-table-btn"
            title="Show all ghosts table"
            style={{ marginLeft: 8, marginTop: 2, fontSize: "1.2em" }}
            onClick={() => setShowGhostTable(true)}
          >
            <FaQuestionCircle />
          </button>
          <div className="final-ghost-inline">
            <span className="final-ghost-label-inline">Final Ghost:</span>
            <span className="final-ghost-value-inline">
              {finalGhost === "?" ? "???" : finalGhost}
            </span>
          </div>
        </div>
        <div className="possible-ghosts-list" style={{ marginBottom: "0" }}>
          <GhostList
            ghosts={ghosts}
            possibleGhosts={possibleGhosts}
            ghostStates={ghostStates}
            onGhostToggle={handleGhostToggle}
            evidenceState={state.evidenceState}
            onShowTable={() => setShowGhostTable(true)}
          />
        </div>
        {showGhostTable && (
          <GhostTable ghosts={ghosts} onClose={() => setShowGhostTable(false)} />
        )}
        <h2 className="section-title activity-log-title-main">
          <FaBookOpen style={{ marginRight: 8, verticalAlign: "middle" }} />
          Activity Log
        </h2>
        <div className="activity-log-wrapper">
          <ActivityLog log={state.log || []} />
        </div>
      </div>
      {/* Responsive styles */}
      <style>
        {`
        @media (max-width: 900px) {
          .journal-app-main {
            flex-direction: column !important;
            gap: var(--spacing-m) !important;
            max-width: 100vw !important;
          }
          .journal-page {
            border-right: none !important;
            margin: var(--spacing-s) 0 !important;
            padding: var(--spacing-m) var(--spacing-xs) !important;
            height: auto !important;
            max-height: none !important;
          }
        }
        `}
      </style>
    </div>
  );
}