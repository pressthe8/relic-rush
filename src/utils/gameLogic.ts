import { GameState, Position, Square, GameSettings, PlayerState } from '../types';

export const calculatePoints = (discoveryCount: number): number => {
  return Math.max(0, 100 - (discoveryCount - 1) * 20);
};

export const createInitialBoard = (size: number): Square[][] => {
  return Array(size).fill(null).map(() =>
    Array(size).fill(null).map(() => ({
      isRevealed: false,
      isTreasure: false,
      discoveryCount: 0
    }))
  );
};

export const generateTreasurePositions = (size: number, count: number): Position[] => {
  const positions: Position[] = [];
  const usedPositions = new Set<string>();

  while (positions.length < count) {
    const row = Math.floor(Math.random() * size);
    const col = Math.floor(Math.random() * size);
    const key = `${row},${col}`;

    if (!usedPositions.has(key)) {
      positions.push({ row, col });
      usedPositions.add(key);
    }
  }

  return positions;
};

export const placeTreasures = (board: Square[][], positions: Position[]): Square[][] => {
  const newBoard = board.map(row => [...row]);
  positions.forEach(({ row, col }) => {
    newBoard[row][col].isTreasure = true;
  });
  return newBoard;
};

export const createInitialPlayerState = (settings: GameSettings, treasurePositions: Position[]): PlayerState => {
  const board = createInitialBoard(settings.gridSize);
  return {
    board: placeTreasures(board, treasurePositions),
    remainingDigs: settings.digAttempts,
    score: 0
  };
};

export const initializeGame = (settings: GameSettings): GameState => {
  const treasurePositions = generateTreasurePositions(settings.gridSize, settings.treasureCount);
  
  return {
    player1: createInitialPlayerState(settings, treasurePositions),
    player2: createInitialPlayerState(settings, treasurePositions),
    treasurePositions,
    gameStarted: true,
    playerView: 'player1'
  };
};