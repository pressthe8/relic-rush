import { useState, useCallback } from 'react';
import { GameState, GameSettings, Position, PlayerState, GridSize } from '../types';
import { initializeGame, calculatePoints } from '../utils/gameLogic';

export const useGameState = () => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [settings, setSettings] = useState<GameSettings>({
    gridSize: 9 as GridSize,
    treasureCount: 5,
    digAttempts: 10,
    gameMode: 'single'
  });

  const startGame = useCallback(() => {
    const initialState = initializeGame(settings);
    setGameState(initialState);
  }, [settings]);

  const dig = useCallback((position: Position) => {
    if (!gameState) return;

    const currentPlayer = gameState.playerView;
    const playerState = gameState[currentPlayer];
    const otherPlayer = currentPlayer === 'player1' ? 'player2' : 'player1';
    const otherPlayerState = gameState[otherPlayer];

    if (playerState.remainingDigs <= 0) return;

    setGameState(prevState => {
      if (!prevState) return null;

      // Create a deep copy of the current player's state
      const newPlayerState: PlayerState = JSON.parse(JSON.stringify(playerState));
      const square = newPlayerState.board[position.row][position.col];

      // If already revealed by this player, don't do anything
      if (square.isRevealed) return prevState;

      // Decrement digs for current player
      newPlayerState.remainingDigs--;

      // Reveal the square for current player
      square.isRevealed = true;

      // Handle treasure discovery
      if (square.isTreasure) {
        // Check if the other player has already discovered this treasure
        const otherPlayerSquare = otherPlayerState.board[position.row][position.col];
        const totalDiscoveries = (otherPlayerSquare.isRevealed ? otherPlayerSquare.discoveryCount : 0) + 1;
        
        square.discoveryCount++;
        const points = calculatePoints(totalDiscoveries);
        newPlayerState.score += points;
        
        // Add bonus dig for finding treasure
        newPlayerState.remainingDigs++; // Bonus dig
      }

      // Return updated state with only the current player's state modified
      return {
        ...prevState,
        [currentPlayer]: newPlayerState
      };
    });
  }, [gameState]);

  const togglePlayer = useCallback(() => {
    if (!gameState || settings.gameMode !== 'mock2player') return;
    
    setGameState(prev => prev ? {
      ...prev,
      playerView: prev.playerView === 'player1' ? 'player2' : 'player1'
    } : null);
  }, [gameState, settings.gameMode]);

  const resetGame = useCallback(() => {
    setGameState(null);
  }, []);

  return {
    gameState,
    settings,
    setSettings,
    startGame,
    dig,
    togglePlayer,
    resetGame
  };
};