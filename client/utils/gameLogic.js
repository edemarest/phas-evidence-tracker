export const ROWS = 6;
export const COLS = 7;

export function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function dropPiece(board, col, player) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (!board[row][col]) {
      board[row][col] = player;
      return { row, col };
    }
  }
  return null; // Column full
}

export function checkWin(board, player) {
  // Helper to check 4 in a row in a direction
  function checkDir(r, c, dr, dc) {
    let count = 0;
    for (let i = 0; i < 4; i++) {
      const nr = r + dr * i;
      const nc = c + dc * i;
      if (
        nr >= 0 && nr < ROWS &&
        nc >= 0 && nc < COLS &&
        board[nr][nc] === player
      ) {
        count++;
      } else {
        break;
      }
    }
    return count === 4;
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (
        board[r][c] === player &&
        (
          checkDir(r, c, 0, 1) ||    // Horizontal
          checkDir(r, c, 1, 0) ||    // Vertical
          checkDir(r, c, 1, 1) ||    // Diagonal down-right
          checkDir(r, c, 1, -1)      // Diagonal down-left
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export function checkDraw(board) {
  return board.every(row => row.every(cell => cell !== null));
}

export default {
  ROWS,
  COLS,
  createBoard,
  dropPiece,
  checkWin,
  checkDraw,
};