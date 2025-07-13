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
import "./GhostTable.css";

// Map evidence to icons for table header
const evidenceIcons = {
  "EMF Level 5": <FaBolt className="ghost-table-icon" title="EMF Level 5" />,
  "Spirit Box": <FaRegCommentDots className="ghost-table-icon" title="Spirit Box" />,
  "Ghost Writing": <FaBook className="ghost-table-icon" title="Ghost Writing" />,
  "D.O.T.S Projector": <FaDotCircle className="ghost-table-icon" title="D.O.T.S Projector" />,
  "Ghost Orbs": <FaRegEye className="ghost-table-icon" title="Ghost Orbs" />,
  "Fingerprints": <FaFingerprint className="ghost-table-icon" title="Fingerprints" />,
  "Freezing Temperatures": <FaSnowflake className="ghost-table-icon" title="Freezing Temperatures" />,
};

export default function GhostTable({ ghosts, onClose }) {
  return (
    <div className="ghost-table-popup">
      <div className="ghost-table-popup-inner">
        <button
          className="ghost-table-popup-close"
          onClick={onClose}
          title="Close"
        >
          ×
        </button>
        <div className="ghost-table-wrapper">
          <table className="ghost-table">
            <thead>
              <tr>
                <th>Ghost</th>
                {Object.keys(evidenceIcons).map((evidence) => (
                  <th key={evidence}>{evidenceIcons[evidence]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ghosts.map((ghost) => (
                <tr key={ghost.name}>
                  <td className="ghost-table-name">{ghost.name}</td>
                  {Object.keys(evidenceIcons).map((evidence) => (
                    <td key={evidence} className="ghost-table-evidence">
                      {ghost.evidences.includes(evidence) ? (
                        <span className="ghost-table-has-evidence">✔️</span>
                      ) : (
                        <span className="ghost-table-no-evidence">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="ghost-table-popup-backdrop" onClick={onClose} />
    </div>
  );
}
