import React from 'react';
import { GameSettings, GridSize } from '../types';
import { Settings, Users, User, Grid2x2 } from 'lucide-react';

interface GameSetupProps {
  settings: GameSettings;
  onSettingsChange: (settings: GameSettings) => void;
  onStart: () => void;
}

const GRID_SIZES: GridSize[] = [6, 9, 12];

export const GameSetup: React.FC<GameSetupProps> = ({ settings, onSettingsChange, onStart }) => {
  const handleChange = (key: keyof GameSettings, value: number | string) => {
    onSettingsChange({
      ...settings,
      [key]: value
    });
  };

  return (
    <div className="w-full max-w-md p-6 bg-white rounded-xl shadow-lg">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-6 h-6 text-amber-600" />
        <h2 className="text-2xl font-bold text-gray-800">Game Settings</h2>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => handleChange('gameMode', 'single')}
            className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors ${
              settings.gameMode === 'single'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <User className="w-5 h-5" />
            Single Player
          </button>
          <button
            onClick={() => handleChange('gameMode', 'mock2player')}
            className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors ${
              settings.gameMode === 'mock2player'
                ? 'bg-amber-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Users className="w-5 h-5" />
            2 Players (Mock)
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Grid Size
          </label>
          <div className="grid grid-cols-3 gap-2">
            {GRID_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => handleChange('gridSize', size)}
                className={`py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                  settings.gridSize === size
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Grid2x2 className="w-4 h-4" />
                {size}x{size}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Treasure Count: {settings.treasureCount}
          </label>
          <input
            type="range"
            min="1"
            max={Math.floor(settings.gridSize * settings.gridSize / 3)}
            value={settings.treasureCount}
            onChange={(e) => handleChange('treasureCount', parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Initial Dig Attempts: {settings.digAttempts}
          </label>
          <input
            type="range"
            min="5"
            max="20"
            value={settings.digAttempts}
            onChange={(e) => handleChange('digAttempts', parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <button
          onClick={onStart}
          className="w-full py-2 px-4 bg-amber-600 text-white font-semibold rounded-lg shadow-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-75 transition-colors"
        >
          Start Game
        </button>
      </div>
    </div>
  );
};