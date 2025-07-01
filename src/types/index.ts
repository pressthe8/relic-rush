export type GridSize = 6 | 9 | 12;

export interface GameSettings {
  gridSize: GridSize;
  treasureCount: number;
  digAttempts: number;
  gameMode: 'single' | 'mock2player';
}

export interface Position {
  row: number;
  col: number;
}

export interface Square {
  isRevealed: boolean;
  isTreasure: boolean;
  discoveryCount: number;
}

export interface PlayerState {
  board: Square[][];
  remainingDigs: number;
  score: number;
}

export interface GameState {
  player1: PlayerState;
  player2: PlayerState;
  treasurePositions: Position[];
  gameStarted: boolean;
  playerView: 'player1' | 'player2';
}

// Sub-grid hints for multiplayer treasure discovery visualization
export interface SubGridHints {
  [subGridIndex: string]: number; // subgrid index -> discovery count
}