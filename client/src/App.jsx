import React, { useEffect, useRef, useState } from "react";
import { createPollingClient } from "../utils/wsClient.js";
import { ghosts, evidenceTypes } from "./ghostData.js";
import Journal from "./components/Journal/Journal.jsx";
import GhostList from "./components/GhostList/GhostList.jsx";
import ActivityLog from "./components/ActivityLog/ActivityLog.jsx";
import SessionControls from "./components/SessionControls/SessionControls.jsx";
import GhostTable from "./components/GhostTable/GhostTable.jsx";
import { FaBookOpen, FaSkull, FaListAlt, FaSearch, FaQuestionCircle, FaRedoAlt, FaExclamationTriangle } from "react-icons/fa";
import "../style.css";

function filterGhosts(evidenceState, ghosts) {
  const circled = Object.entries(evidenceState)
    .filter(([_, v]) => v === "circled")
    .map(([k]) => k);
  const crossed = Object.entries(evidenceState)
    .filter(([_, v]) => v === "crossed")
    .map(([k]) => k);
  return ghosts.filter((ghost) => {
    if (!circled.every((e) => ghost.evidences.includes(e))) return false;
    if (crossed.some((e) => ghost.evidences.includes(e))) return false;
    return true;
  });
}

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
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(true);
  const [ghostStates, setGhostStates] = useState({});
  const [showGhostTable, setShowGhostTable] = useState(false);
  const [wsError, setWsError] = useState(null);
  const [mobilePage, setMobilePage] = useState("left");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const pollingRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    let client = createPollingClient(user, (msg) => {
      if (msg.type === "sync_state") {
        setState(msg.state);
        setGhostStates(msg.state.ghostStates || {});
      }
    });
    pollingRef.current = client;
    setConnected(true);
    setWsError(null);
    return () => {
      if (pollingRef.current) {
        pollingRef.current.close();
        pollingRef.current = null;
      }
      setConnected(false);
    };
  }, [user]);

  function handleToggleEvidence(evidence) {
    if (!state || !pollingRef.current) return;
    const current = state.evidenceState[evidence] || "blank";
    const next =
      current === "blank"
        ? "circled"
        : current === "circled"
        ? "crossed"
        : "blank";
    // Update local state immediately for snappy UI
    setState((prev) => ({
      ...prev,
      evidenceState: {
        ...prev.evidenceState,
        [evidence]: next,
      },
    }));
    pollingRef.current.sendMessage({
      type: "evidence_update",
      evidence,
      state: next,
      user,
    });
  }
  function handleBoneToggle(found) {
    if (!pollingRef.current) return;
    // Update local state immediately for snappy UI
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
    // Update local state immediately for snappy UI
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
  // --- Only allow one ghost to be circled at a time ---
  function handleGhostToggle(ghostName) {
    if (!pollingRef.current) return;
    const current = ghostStates[ghostName] || "none";
    let next;
    if (current === "none") {
      // Circled: set all others to "none"
      next = "circled";
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
      // Uncircle all others
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
    } else if (current === "circled") {
      // Uncircle
      next = "none";
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
    } else {
      // If crossed, go to none
      next = "none";
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

  // --- Final Ghost logic: prefer circled ghost, else evidence logic ---
  function getFinalGhost() {
    const circled = Object.entries(ghostStates).find(([_, v]) => v === "circled");
    if (circled) return circled[0];
    const possibleGhosts = filterGhosts(effectiveState.evidenceState, ghosts);
    return possibleGhosts.length === 1 ? possibleGhosts[0].name : "?";
  }

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

  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const effectiveState = state || (isLocal ? MOCK_STATE : null);

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

  const users = [{ username: user.username }];
  const possibleGhosts = filterGhosts(effectiveState.evidenceState, ghosts);
  const finalGhost = getFinalGhost();

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
          boneFound={effectiveState.boneFound}
          cursedObjectFound={effectiveState.cursedObjectFound}
          onBoneToggle={handleBoneToggle}
          onCursedObjectToggle={handleCursedObjectToggle}
        />
        <h2 className="section-title evidence-section-title">
          <FaSearch style={{ marginRight: 8, verticalAlign: "middle" }} />
          Evidence
        </h2>
        <Journal
          evidenceState={effectiveState.evidenceState}
          evidenceTypes={evidenceTypes}
          onToggle={handleToggleEvidence}
        />
        <div className="status-bar">
          Status: {connected ? "Connected" : "Disconnected"}
        </div>
      </div>
      {/* Book binding */}
      <div className="journal-binding" />
      {/* Right Page */}
      <div className="journal-page right">
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
            >
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
        <div style={{ marginTop: "12px", display: "flex", justifyContent: "center" }}>
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
            width: 100% !important;
            max-width: 100vw !important;
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