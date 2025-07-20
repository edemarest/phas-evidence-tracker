import React, { useState } from "react";
import { FaPlus, FaSignInAlt, FaSpinner, FaExclamationTriangle, FaCopy, FaCheck } from "react-icons/fa";
import "./SessionModal.css";

// Utility function to get the correct API base URL
function getApiBase() {
  // Always use full backend URL in production
  if (
    import.meta.env.MODE === "production" ||
    window.location.hostname.endsWith("onrender.com")
  ) {
    return "https://phas-evidence-backend.onrender.com/api";
  }
  // Discord Activity special case
  if (window.location.search.includes("frame_id") || window.location.hostname.endsWith("discordsays.com")) {
    return "/.proxy/api";
  }
  return "/api";
}

export default function SessionModal({ onSessionStart, onError }) {
  const [mode, setMode] = useState(null); // null, 'new', 'join'
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newSessionCode, setNewSessionCode] = useState("");
  const [copied, setCopied] = useState(false);

  // Generate a random 6-character session code
  function generateSessionCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Handle going back to initial choice
  function handleBack() {
    setMode(null);
    setLoading(false);
    setError("");
    setJoinCode("");
    setNewSessionCode("");
    setCopied(false);
  }

  // Handle starting a new investigation
  async function handleStartNew() {
    setLoading(true);
    setError("");
    
    try {
      console.log("[SessionModal] Creating new session...");
      
      const apiBase = getApiBase();
      console.log("[SessionModal] Using API base:", apiBase);
      
      // Create a new session on the server
      const response = await fetch(`${apiBase}/session/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      console.log("[SessionModal] Response status:", response.status);
      
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (jsonErr) {
          console.warn("[SessionModal] Could not parse error response as JSON");
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = await response.json();
      } catch (err) {
        const rawText = await response.text();
        console.error("[SessionModal] Response not valid JSON. Raw response:", rawText);
        throw new Error("Server returned invalid JSON");
      }
      
      const { sessionCode, sessionId } = data;
      setNewSessionCode(sessionCode);
      
      console.log("[SessionModal] Created new session:", sessionCode);
      setMode("new-created");
      setLoading(false); // Important: reset loading state
    } catch (err) {
      console.error("[SessionModal] Failed to create session:", err);
      setError(err.message);
      setLoading(false);
    }
  }

  // Handle joining an existing investigation
  async function handleJoin() {
    if (!joinCode.trim()) {
      setError("Please enter a session code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const code = joinCode.trim().toUpperCase();
      console.log("[SessionModal] Attempting to join session:", code);

      const apiBase = getApiBase();

      // Join the session on the server
      const response = await fetch(`${apiBase}/session/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionCode: code })
      });

      console.log("[SessionModal] Join response status:", response.status);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (jsonErr) {
          console.warn("[SessionModal] Could not parse join error response as JSON");
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = await response.json();
      } catch (err) {
        const rawText = await response.text();
        console.error("[SessionModal] Join response not valid JSON. Raw response:", rawText);
        throw new Error("Server returned invalid JSON");
      }

      // Session is valid, proceed with this code
      const { sessionId } = data;
      console.log("[SessionModal] Successfully joined session:", code);
      
      onSessionStart({
        sessionId,
        isNewSession: false,
        username: null // Will be determined by parent component
      });
    } catch (err) {
      console.error("[SessionModal] Failed to join session:", err);
      setError(err.message);
      setLoading(false);
    }
  }

  // Handle continuing with new session
  function handleContinueWithNew() {
    const sessionId = `session-${newSessionCode}`;
    onSessionStart({
      sessionId,
      isNewSession: true,
      username: null // Will be determined by parent component
    });
  }

  // Handle copying session code
  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(newSessionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Failed to copy to clipboard:", err);
    }
  }

  // Handle Enter key press in join code input
  function handleJoinKeyPress(e) {
    if (e.key === "Enter" && !loading) {
      handleJoin();
    }
  }

  return (
    <div className="session-modal-backdrop">
      <div className="session-modal">
        {/* Header */}
        <div className="session-modal-header">
          <h2 className="session-modal-title">Phasmophobia Investigation</h2>
          <p className="session-modal-subtitle">Choose how to start your ghost hunt</p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="session-modal-error">
            <FaExclamationTriangle />
            <span>{error}</span>
          </div>
        )}

        {/* Initial Choice */}
        {mode === null && (
          <div className="session-modal-content">
            <div className="session-choice-buttons">
              <button
                className="session-choice-btn new-investigation"
                onClick={handleStartNew}
                disabled={loading}
              >
                <FaPlus className="session-choice-icon" />
                <span className="session-choice-title">New Investigation</span>
                <span className="session-choice-desc">Start a fresh ghost hunt with a new session code</span>
              </button>

              <button
                className="session-choice-btn join-investigation"
                onClick={() => setMode("join")}
                disabled={loading}
              >
                <FaSignInAlt className="session-choice-icon" />
                <span className="session-choice-title">Join Investigation</span>
                <span className="session-choice-desc">Enter a session code to join friends</span>
              </button>
            </div>

            {loading && (
              <div className="session-modal-loading">
                <FaSpinner className="spinning" />
                <span>Creating new session...</span>
              </div>
            )}
          </div>
        )}

        {/* Join Mode */}
        {mode === "join" && (
          <div className="session-modal-content">
            <div className="session-join-form">
              <label className="session-input-label">
                Session Code
                <input
                  type="text"
                  className="session-code-input"
                  placeholder="Enter 6-character code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyPress={handleJoinKeyPress}
                  maxLength={6}
                  disabled={loading}
                  autoFocus
                />
              </label>

              <div className="session-modal-actions">
                <button
                  className="session-modal-btn secondary"
                  onClick={handleBack}
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  className="session-modal-btn primary"
                  onClick={handleJoin}
                  disabled={loading || !joinCode.trim()}
                >
                  {loading ? (
                    <>
                      <FaSpinner className="spinning" />
                      Joining...
                    </>
                  ) : (
                    <>
                      <FaSignInAlt />
                      Join Investigation
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Session Created */}
        {mode === "new-created" && (
          <div className="session-modal-content">
            <div className="session-created-info">
              <div className="session-code-display">
                <label className="session-code-label">Your Session Code:</label>
                <div className="session-code-value">
                  <span className="session-code-modal">{newSessionCode}</span>
                  <button
                    className="session-copy-btn"
                    onClick={handleCopyCode}
                    title="Copy to clipboard"
                  >
                    {copied ? <FaCheck /> : <FaCopy />}
                  </button>
                </div>
              </div>
              
              <p className="session-code-instructions">
                Share this code with your team so they can join your investigation.
                You can continue now and they can join anytime.
              </p>

              <div className="session-modal-actions">
                <button
                  className="session-modal-btn secondary"
                  onClick={handleBack}
                >
                  Back
                </button>
                <button
                  className="session-modal-btn primary"
                  onClick={handleContinueWithNew}
                >
                  <FaPlus />
                  Start Investigation
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
