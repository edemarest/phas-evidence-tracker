import React, { useState, useEffect } from "react";
import { createBoard, dropPiece, checkWin, checkDraw, ROWS, COLS } from "../../utils/gameLogic";

const PLAYER_ONE = "🔴";
const PLAYER_TWO = "🟡";

const ws = new WebSocket('ws://localhost:8080');

export default function Connect4Board() {
  const [board, setBoard] = useState(createBoard());
  const [currentPlayer, setCurrentPlayer] = useState(PLAYER_ONE);
  const [winner, setWinner] = useState(null);
  const [draw, setDraw] = useState(false);

  useEffect(() => {
    // On mount, join a game (you’ll want to use Discord userId and a gameId)
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', gameId: 'some-id', userId: 'discord-user-id' }));
    };

    // Listen for messages (moves, state updates)
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Update board, currentPlayer, etc. based on server messages
    };

    return () => {
      ws.close();
    };
  }, []);

  function handleColumnClick(col) {
    if (winner || draw) return;
    const newBoard = board.map(row => [...row]);
    const move = dropPiece(newBoard, col, currentPlayer);
    if (!move) return; // Column full

    if (checkWin(newBoard, currentPlayer)) {
      setBoard(newBoard);
      setWinner(currentPlayer);
      return;
    }
    if (checkDraw(newBoard)) {
      setBoard(newBoard);
      setDraw(true);
      return;
    }
    setBoard(newBoard);
    setCurrentPlayer(currentPlayer === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE);
  }

  return (
    <div>
      <h2>Connect 4</h2>
      {winner && <div>Winner: {winner}</div>}
      {draw && <div>It's a draw!</div>}
      {!winner && !draw && <div>Current Player: {currentPlayer}</div>}
      <div style={{ display: "grid", gridTemplateRows: `repeat(${ROWS}, 40px)`, gridTemplateColumns: `repeat(${COLS}, 40px)` }}>
        {board.map((row, rIdx) =>
          row.map((cell, cIdx) => (
            <div
              key={`${rIdx}-${cIdx}`}
              onClick={() => handleColumnClick(cIdx)}
              style={{
                width: 38,
                height: 38,
                border: "1px solid #333",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#eee",
                cursor: !winner && !draw ? "pointer" : "default"
              }}
            >
              {cell}
            </div>
          ))
        )}
      </div>
    </div>
  );
}