import React from "react";
import { GiBoneKnife, GiCursedStar, GiVoodooDoll, GiCrystalBall } from "react-icons/gi";
import { FaMusic, FaRegEye, FaDotCircle, FaRegCommentDots, FaQuestionCircle, FaChevronDown } from "react-icons/fa";
import "./SessionControls.css";

export default function SessionControls({
  users,
  boneFound,
  cursedPossession,
  onBoneToggle,
  onCursedPossessionChange,
}) {
  // List of cursed possessions with icons
  const cursedPossessions = [
    { value: "None", label: "None", icon: <FaQuestionCircle className="cursed-possession-icon" /> },
    { value: "Music Box", label: "Music Box", icon: <FaMusic className="cursed-possession-icon" /> },
    { value: "Ouija Board", label: "Ouija Board", icon: <GiCrystalBall className="cursed-possession-icon" /> },
    { value: "Voodoo Doll", label: "Voodoo Doll", icon: <GiVoodooDoll className="cursed-possession-icon" /> },
    { value: "Haunted Mirror", label: "Haunted Mirror", icon: <FaRegEye className="cursed-possession-icon" /> },
    { value: "Summoning Circle", label: "Summoning Circle", icon: <FaDotCircle className="cursed-possession-icon" /> },
    { value: "Monkey Paw", label: "Monkey Paw", icon: <FaRegCommentDots className="cursed-possession-icon" /> },
    { value: "Tarot Cards", label: "Tarot Cards", icon: <GiCursedStar className="cursed-possession-icon" /> },
  ];

  // Find selected possession object
  const selectedPossession = cursedPossessions.find(pos => pos.value === cursedPossession) || cursedPossessions[0];

  return (
    <div className="session-controls">
      <div className="session-checkbox-row">
        <label className="session-checkbox-label">
          <input
            type="checkbox"
            checked={boneFound}
            onChange={() => onBoneToggle(!boneFound)}
          />
          <GiBoneKnife className="session-icon" />
          <span>Bone</span>
        </label>
        <div className="session-dropdown-label custom-possession-select">
          <div className="cursed-possession-selected" tabIndex={0} role="button">
            {selectedPossession.icon}
            <span className="cursed-possession-label">{selectedPossession.label}</span>
            <FaChevronDown className="cursed-possession-chevron" />
          </div>
          <select
            className="cursed-possession-dropdown"
            value={cursedPossession}
            onChange={e => {
              const newValue = e.target.value;
              // Only update if the value is different
              if (newValue !== cursedPossession) {
                onCursedPossessionChange(newValue);
              }
            }}
            aria-label="Cursed Possession"
          >
            {cursedPossessions.map(pos => (
              <option key={pos.value} value={pos.value}>
                {pos.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}