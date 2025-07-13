import React, { useState } from "react";
import "./GhostList.css";

export default function GhostList({
  ghosts,
  possibleGhosts,
  ghostStates,
  onGhostToggle,
  evidenceState,
  onShowTable,
}) {
  const [tempMsg, setTempMsg] = useState("");

  // Determine which ghosts are "in the running" (possibleGhosts) and which are ruled out by evidence
  const possibleNames = new Set(possibleGhosts.map((g) => g.name));
  const inTheRunning = ghosts.filter((g) => possibleNames.has(g.name));
  const ruledOutByEvidence = ghosts.filter((g) => !possibleNames.has(g.name));

  // Handler for clicking a ghost
  function handleGhostClick(ghost, isRuledOutByEvidence) {
    if (isRuledOutByEvidence) {
      setTempMsg("Cannot edit this ghost until you re-evaluate evidence types.");
      setTimeout(() => setTempMsg(""), 5000);
      return;
    }
    onGhostToggle && onGhostToggle(ghost.name);
  }

  return (
    <div className="ghost-list-container">
      <div className="ghost-list-header-row">
        <span className="ghost-list-title"></span>
        {/* No ? button here, handled above in App.jsx */}
      </div>
      <div className="ghost-list-grid">
        {inTheRunning.map((ghost) => {
          const state = ghostStates?.[ghost.name] || "none";
          // If user ruled out, but not ruled out by evidence, show red line only
          const isUserCrossed = state === "crossed";
          return (
            <div
              className={
                "ghost-list-item" +
                (state === "circled" ? " circled" : "") +
                (isUserCrossed ? " user-crossed" : "")
              }
              key={ghost.name}
              tabIndex={0}
              role="button"
              aria-pressed={state !== "none"}
              onClick={() => handleGhostClick(ghost, false)}
            >
              {ghost.name}
              {isUserCrossed && (
                <span className="ghost-user-cross-line" aria-hidden="true" />
              )}
            </div>
          );
        })}
        {ruledOutByEvidence.map((ghost) => (
          <div
            className="ghost-list-item evidence-ruledout ghost-list-item-ruledout"
            key={ghost.name}
            tabIndex={-1}
            aria-disabled="true"
            onClick={() => handleGhostClick(ghost, true)}
            style={{ cursor: "not-allowed", opacity: 0.6 }}
          >
            {ghost.name}
          </div>
        ))}
      </div>
      {tempMsg && (
        <div className="ghost-list-tempmsg">{tempMsg}</div>
      )}
    </div>
  );
}