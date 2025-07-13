import React from "react";
import Connect4Board from "./components/Connect4Board";

export default function App() {
  return (
    <div style={{ textAlign: "center", background: "#222", minHeight: "100vh", color: "#fff", paddingTop: 40 }}>
      <h2>Connect 4 Activity</h2>
      <Connect4Board />
    </div>
  );
}