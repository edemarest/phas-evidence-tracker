import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

let games = {}; // { gameId: { board, players: [ws, ws], currentPlayer } }

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    // Handle join, move, etc.
    // Example: { type: 'join', gameId, userId }
    // Example: { type: 'move', gameId, col, userId }
  });

  ws.on('close', function() {
    // Handle disconnects
  });
});

console.log('WebSocket server running on ws://localhost:8080');