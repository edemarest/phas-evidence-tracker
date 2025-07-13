import React from "react";
import {
  FaSnowflake,
  FaBook,
  FaFingerprint,
  FaDotCircle,
  FaRegCommentDots,
  FaRegEye,
  FaBolt,
} from "react-icons/fa";
import "./Journal.css";

// Map evidence to icons (customize as desired)
const evidenceIcons = {
  "EMF Level 5": <FaBolt className="evidence-icon" title="EMF Level 5" />,
  "Spirit Box": <FaRegCommentDots className="evidence-icon" title="Spirit Box" />,
  "Ghost Writing": <FaBook className="evidence-icon" title="Ghost Writing" />,
  "D.O.T.S Projector": <FaDotCircle className="evidence-icon" title="D.O.T.S Projector" />,
  "Ghost Orbs": <FaRegEye className="evidence-icon" title="Ghost Orbs" />,
  "Fingerprints": <FaFingerprint className="evidence-icon" title="Fingerprints" />,
  "Freezing Temperatures": <FaSnowflake className="evidence-icon" title="Freezing Temperatures" />,
};

export default function Journal({ evidenceState, evidenceTypes, onToggle }) {
  return (
    <div className="journal-evidence paper-panel">
      <div className="evidence-list evidence-grid">
        {evidenceTypes.map((evidence) => {
          const state = evidenceState[evidence] || "blank";
          return (
            <div
              className={`evidence-row evidence-${state}`}
              key={evidence}
              tabIndex={0}
              role="button"
              aria-pressed={state !== "blank"}
              onClick={() => onToggle(evidence)}
            >
              <span className="evidence-label">
                {evidenceIcons[evidence]}
                {evidence}
              </span>
              <span className={`evidence-toggle evidence-toggle-${state}`}>
                {state === "circled" && <span className="evidence-circle" />}
                {state === "crossed" && <span className="evidence-cross" />}
                {state === "blank" && <span className="evidence-blank" />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}