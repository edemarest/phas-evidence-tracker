import React, { useRef, useState, useEffect } from "react";
import {
  FaRegCircle,
  FaRegTimesCircle,
  FaRegCheckCircle,
  FaRegDotCircle,
  FaRegEye,
  FaFingerprint,
  FaBook,
  FaBolt,
  FaSnowflake,
  FaRegCommentDots,
  FaBookOpen,
  FaChevronUp,
} from "react-icons/fa";
import { GiBoneKnife, GiCursedStar } from "react-icons/gi";
import "./ActivityLog.css";

// Map evidence to icons for log
const evidenceIcons = {
  "EMF Level 5": <FaBolt className="log-icon" title="EMF Level 5" />,
  "Spirit Box": <FaRegCommentDots className="log-icon" title="Spirit Box" />,
  "Ghost Writing": <FaBook className="log-icon" title="Ghost Writing" />,
  "D.O.T.S Projector": <FaRegDotCircle className="log-icon" title="D.O.T.S Projector" />,
  "Ghost Orbs": <FaRegEye className="log-icon" title="Ghost Orbs" />,
  "Fingerprints": <FaFingerprint className="log-icon" title="Fingerprints" />,
  "Freezing Temperatures": <FaSnowflake className="log-icon" title="Freezing Temperatures" />,
};

function getLogIcon(entry) {
  if (!entry) return <FaBookOpen className="log-icon" />;
  if (entry.actionType === "evidence_update") {
    if (entry.state === "circled") return <FaRegCircle className="log-icon log-circled" />;
    if (entry.state === "crossed") return <FaRegTimesCircle className="log-icon log-crossed" />;
    if (entry.state === "blank") return <FaRegCheckCircle className="log-icon log-cleared" />;
    return evidenceIcons[entry.evidence] || <FaBookOpen className="log-icon" />;
  }
  if (entry.actionType === "ghost_state_update") {
    if (entry.state === "circled") return <FaRegCircle className="log-icon log-circled" />;
    if (entry.state === "crossed") return <FaRegTimesCircle className="log-icon log-crossed" />;
    if (entry.state === "none") return <FaRegCheckCircle className="log-icon log-cleared" />;
    return <FaBookOpen className="log-icon" />;
  }
  if (entry.actionType === "bone_update") {
    return <GiBoneKnife className="log-icon log-bone" />;
  }
  if (entry.actionType === "cursed_object_update") {
    return <GiCursedStar className="log-icon log-cursed" />;
  }
  return <FaBookOpen className="log-icon" />;
}

// Helper to generate natural language log messages
function formatLogEntry(entry) {
  if (!entry) return "";
  // Evidence actions
  if (entry.actionType === "evidence_update") {
    if (entry.state === "circled") {
      return `${entry.user?.username} circled ${entry.evidence}`;
    } else if (entry.state === "crossed") {
      return `${entry.user?.username} ruled out ${entry.evidence}`;
    } else if (entry.state === "blank") {
      return `${entry.user?.username} cleared mark on ${entry.evidence}`;
    }
  }
  // Ghost actions
  if (entry.actionType === "ghost_state_update") {
    if (entry.state === "circled") {
      return `${entry.user?.username} circled ${entry.ghostName}`;
    } else if (entry.state === "crossed") {
      return `${entry.user?.username} ruled out ${entry.ghostName}`;
    } else if (entry.state === "none") {
      return `${entry.user?.username} cleared mark on ${entry.ghostName}`;
    }
  }
  // Bone/cursed object
  if (entry.actionType === "bone_update") {
    return `${entry.user?.username} marked bone as ${entry.found ? "found" : "not found"}`;
  }
  if (entry.actionType === "cursed_object_update") {
    return `${entry.user?.username} marked cursed object as ${entry.found ? "found" : "not found"}`;
  }
  // Fallback: show the action as-is
  if (entry.action) return entry.action;
  return "";
}

export default function ActivityLog({ log }) {
  const scrollRef = useRef(null);
  const [showTopBtn, setShowTopBtn] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      setShowTopBtn(el.scrollTop > 16);
    }
    el.addEventListener("scroll", onScroll);
    // Initial check
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToTop() {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="activity-log-outer">
      <div className="activity-log-scroll" ref={scrollRef}>
        <ul className="activity-log">
          {(log || [])
            .slice(-10)
            .reverse()
            .map((entry, i) => (
              <li key={i}>
                <span className="log-icon-wrapper">{getLogIcon(entry)}</span>
                <span className="log-text">{formatLogEntry(entry)}</span>
              </li>
            ))}
        </ul>
        <button
          className={`activity-log-scroll-top-btn${showTopBtn ? " visible" : ""}`}
          title="Jump to top"
          onClick={scrollToTop}
          aria-label="Jump to top"
        >
          <FaChevronUp />
        </button>
      </div>
    </div>
  );
}