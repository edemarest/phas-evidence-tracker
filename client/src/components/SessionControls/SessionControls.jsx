import React from "react";
import { GiBoneKnife } from "react-icons/gi";
import { GiCursedStar } from "react-icons/gi";
import "./SessionControls.css";

export default function SessionControls({
  users,
  boneFound,
  cursedObjectFound,
  onBoneToggle,
  onCursedObjectToggle,
}) {
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
          <span>Bone Found</span>
        </label>
        <label className="session-checkbox-label">
          <input
            type="checkbox"
            checked={cursedObjectFound}
            onChange={() => onCursedObjectToggle(!cursedObjectFound)}
          />
          <GiCursedStar className="session-icon" />
          <span>Cursed Object Found</span>
        </label>
      </div>
    </div>
  );
}