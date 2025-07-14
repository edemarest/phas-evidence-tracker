import React, { useEffect, useRef, useState } from "react";
import { createPollingClient, joinSession } from "../utils/wsClient.js";
import { ghosts, evidenceTypes } from "./ghostData.js";
import Journal from "./components/Journal/Journal.jsx";
import GhostList from "./components/GhostList/GhostList.jsx";
import ActivityLog from "./components/ActivityLog/ActivityLog.jsx";
import SessionControls from "./components/SessionControls/SessionControls.jsx";
import GhostTable from "./components/GhostTable/GhostTable.jsx";
import { FaBookOpen, FaSkull, FaListAlt, FaSearch, FaQuestionCircle, FaRedoAlt, FaExclamationTriangle } from "react-icons/fa";
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

// Add a mock state for local style editing
const MOCK_STATE = {
  evidenceState: Object.fromEntries(evidenceTypes.map((e) => [e, "blank"])),
  boneFound: false,
  cursedObjectFound: false,
  log: [
    { user: { username: "misty" }, actionType: "evidence_update", evidence: "EMF Level 5", state: "circled" },
    { user: { username: "misty" }, actionType: "bone_update", found: true },
  ],
};

export default function App({ user }) {
  console.log("[App] Render, user:", user);
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [ghostStates, setGhostStates] = useState({});
  const [showGhostTable, setShowGhostTable] = useState(false);
  const [wsError, setWsError] = useState(null);
  const [mobilePage, setMobilePage] = useState("left"); // Add state for mobile page flip
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const pollingRef = useRef(null);
  const [sessionId, setSessionId] = useState("default-session");
  const [reconnectKey, setReconnectKey] = useState(0); // Add this line

  useEffect(() => {
    if (!user) return;
    let stopped = false;
    let client = null;
    let joined = false;

    async function setup() {
      try {
        const joinRes = await joinSession(user, "default-session");
        setSessionId(joinRes.sessionId);
        setState(joinRes.state);
        setGhostStates(joinRes.state.ghostStates || {});
        joined = true;
        client = createPollingClient(joinRes.sessionId, user, (msg) => {
          switch (msg.type) {
            case "sync_state":
              setState(msg.state);
              setGhostStates(msg.state.ghostStates || {});
              break;
            case "session_not_found":
              setWsError("Session not found or expired. Please reconnect.");
              setConnected(false);
              break;
            default:
              break;
          }
        });
        pollingRef.current = client;
        setConnected(true);
        setWsError(null);
      } catch (err) {
        setWsError("Failed to join session: " + err.message);
        setConnected(false);
      }
    }
    setup();

    return () => {
      stopped = true;
      if (pollingRef.current) {
        pollingRef.current.close();
        pollingRef.current = null;
      }
      setConnected(false);
    };
  // Add reconnectKey as a dependency so useEffect re-runs on reconnect
  }, [user, reconnectKey]);

  // Evidence toggle handler
  function handleToggleEvidence(evidence) {
    if (!state || !pollingRef.current) return;
    const current = state.evidenceState[evidence] || "blank";
    const next =
      current === "blank"
        ? "circled"
        : current === "circled"
        ? "crossed"
        : "blank";
    pollingRef.current.sendMessage({
      type: "evidence_update",
      evidence,
      state: next,
      user,
    });
  }

  // Bone/cursed object toggle handlers
  function handleBoneToggle(found) {
    if (!pollingRef.current) return;
    pollingRef.current.sendMessage({
      type: "bone_update",
      found,
      user,
    });
  }
  function handleCursedObjectToggle(found) {
    if (!pollingRef.current) return;
    pollingRef.current.sendMessage({
      type: "cursed_object_update",
      found,
      user,
    });
  }

  // Ghost toggle handler
  function handleGhostToggle(ghostName) {
    if (!pollingRef.current) return;
    const current = ghostStates[ghostName] || "none";
    const next =
      current === "none"
        ? "circled"
        : current === "circled"
        ? "crossed"
        : "none";
    pollingRef.current.sendMessage({
      type: "ghost_state_update",
      ghostName,
      state: next,
      user,
    });
    setGhostStates((prev) => ({
      ...prev,
      [ghostName]: next,
    }));
  }

  // --- Reset Investigation handler ---
  function handleResetInvestigation() {
    setShowResetModal(false);
    setResetting(true);
    setState((prev) =>
      prev
        ? {
            ...prev,
            evidenceState: Object.fromEntries(evidenceTypes.map((e) => [e, "blank"])),
            ghostStates: ghosts.reduce((acc, g) => { acc[g.name] = "none"; return acc; }, {}),
            boneFound: false,
            cursedObjectFound: false,
            log: [
              ...(prev.log || []),
              { user, action: `${user.username} started a new investigation.` }
            ],
          }
        : prev
    );
    if (pollingRef.current) {
      pollingRef.current.sendMessage({
        type: "reset_investigation",
        user,
      });
    }
    setTimeout(() => setResetting(false), 1200);
  }

  // --- TEMP: Always render the UI with mock state if in local dev and no state ---
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const effectiveState = state || (isLocal ? MOCK_STATE : null);

  if (!user) {
    return <div style={{ padding: 32, color: "red" }}>No user found. Please reload and enter a username.</div>;
  }

  // Prevent null dereference: show loading or error if effectiveState is not ready
  if (!effectiveState) {
    if (wsError) {
      return (
        <div style={{ padding: 32, color: "red" }}>
          {wsError}
          <br />
          <button
            style={{
              marginTop: 16,
              padding: "8px 24px",
              fontSize: "1.1em",
              borderRadius: 8,
              border: "1.5px solid #B22222",
              background: "#fffbe8",
              color: "#B22222",
              fontFamily: "inherit",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 4px #b2222230"
            }}
            onClick={() => {
              setWsError(null);
              setReconnectKey((k) => k + 1); // Triggers useEffect to re-join
            }}
          >
            Reconnect
          </button>
        </div>
      );
    }
    return <div style={{ padding: 32 }}>Connecting to session...</div>;
  }

  // For now, users list is not tracked in state, so just show current user
  const users = [{ username: user.username }];

  const possibleGhosts = filterGhosts(effectiveState.evidenceState, ghosts);
  const finalGhost = possibleGhosts.length === 1 ? possibleGhosts[0].name : "?";

  // Detect mobile portrait mode
  const isMobilePortrait =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(max-width: 700px) and (orientation: portrait)").matches;

  return (
    <div className="journal-app-main">
      {/* Left Page */}
      <div
        className={
          "journal-page left" +
          (isMobilePortrait && mobilePage !== "left" ? "" : " mobile-visible")
        }
      >
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
          boneFound={effectiveState.boneFound}
          cursedObjectFound={effectiveState.cursedObjectFound}
          onBoneToggle={() => {}}
          onCursedObjectToggle={() => {}}
        />
        <h2 className="section-title evidence-section-title">
          <FaSearch style={{ marginRight: 8, verticalAlign: "middle" }} />
          Evidence
        </h2>
        <Journal
          evidenceState={effectiveState.evidenceState}
          evidenceTypes={evidenceTypes}
          onToggle={() => {}}
        />
        <div className="status-bar">
          Status: {connected ? "Connected" : "Disconnected"}
        </div>
      </div>
      {/* Book binding */}
      <div className="journal-binding" />
      {/* Right Page */}
      <div
        className={
          "journal-page right" +
          (isMobilePortrait && mobilePage !== "right" ? "" : " mobile-visible")
        }
      >
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
            <span className="final-ghost-label-inline">Final Ghost:</span>
            <span
              className={
                "final-ghost-value-inline" +
                (finalGhost === "?" ? " final-ghost-unknown" : "")
              }
              style={{
                marginLeft: "16px",
                fontWeight: finalGhost === "?" ? "bold" : undefined,
                letterSpacing: finalGhost === "?" ? "0.18em" : undefined,
                fontSize: finalGhost === "?" ? "1.25em" : undefined,
              }}
            >
              {finalGhost === "?" ? "???" : finalGhost}
            </span>
          </div>
        </div>
        <div className="possible-ghosts-list" style={{ marginBottom: "0" }}>
          <GhostList
            ghosts={ghosts}
            possibleGhosts={possibleGhosts}
            ghostStates={{}}
            onGhostToggle={() => {}}
            evidenceState={effectiveState.evidenceState}
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
          <ActivityLog log={effectiveState.log || []} />
        </div>
        {/* Move Start New Investigation button to the bottom of the page */}
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "center" }}>
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
      {/* Mobile page flip button */}
      {isMobilePortrait && (
        <button
          className="mobile-page-flip-btn"
          onClick={() =>
            setMobilePage((prev) => (prev === "left" ? "right" : "left"))
          }
        >
          {mobilePage === "left" ? "→ Next Page" : "← Previous Page"}
        </button>
      )}
      {/* Stylized Reset Confirmation Modal */}
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
        .final-ghost-value-inline.final-ghost-unknown {
          font-weight: bold;
          letter-spacing: 0.18em;
          font-size: 1.25em;
        }
        `}
      </style>
    </div>
  );
}