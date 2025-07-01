import React from 'react';
import { Square } from './Square';
import { GameState } from '../types';

interface GameBoardProps {
  gameState: GameState;
  onDig: (row: number, col: number) => void;
  isOpponentView?: boolean;
  isActive?: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({ 
  gameState, 
  onDig, 
  isOpponentView = false,
  isActive = true
}) => {
  return (
    <div 
      className={`
        grid gap-2 p-4 bg-emerald-950/10 rounded-xl shadow-inner
        transition-all duration-300
        ${!isActive ? 'opacity-40 pointer-events-none' : 'opacity-100'}
      `}
      style={{
        gridTemplateColumns: `repeat(${gameState.board.length}, minmax(0, 1fr))`,
        width: '100%',
        maxWidth: `${gameState.board.length * 3.5}rem`
      }}
    >
      {gameState.board.map((row, rowIndex) => (
        row.map((square, colIndex) => (
          <Square
            key={`${rowIndex}-${colIndex}`}
            square={square}
            position={{ row: rowIndex, col: colIndex }}
            gridSize={gameState.board.length}
            onClick={() => onDig(rowIndex, colIndex)}
            disabled={!isActive || gameState.remainingDigs <= 0}
            isOpponentView={isOpponentView}
          />
        ))
      ))}
    </div>
  );
};