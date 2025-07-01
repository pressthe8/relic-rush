import React from 'react';
import { Shovel, Trophy, RotateCcw } from 'lucide-react';

interface GameControlsProps {
  remainingDigs: number;
  score: number;
  onReset: () => void;
}

export const GameControls: React.FC<GameControlsProps> = ({ remainingDigs, score, onReset }) => {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-md bg-white p-4 rounded-xl shadow-lg">
      <div className="flex items-center gap-2 text-gray-700">
        <Shovel className="w-5 h-5 text-amber-600" />
        <span className="font-medium">Digs: {remainingDigs}</span>
      </div>
      
      <div className="flex items-center gap-2 text-gray-700">
        <Trophy className="w-5 h-5 text-amber-600" />
        <span className="font-medium">Score: {score}</span>
      </div>

      <button
        onClick={onReset}
        className="ml-auto flex items-center gap-2 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        Reset
      </button>
    </div>
  );
};