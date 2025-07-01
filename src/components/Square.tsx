import React from 'react';
import { Gem } from 'lucide-react';
import { Square as SquareType, Position, SubGridHints } from '../types';
import { getSubGridBorderInfo, getHintIntensityClass, getBorderClasses } from '../utils/subGridUtils';

interface SquareProps {
  square: SquareType;
  position: Position;
  gridSize: number;
  subGridHints?: SubGridHints;
  onClick: () => void;
  disabled: boolean;
  isOpponentView?: boolean;
  showOwnDiscoveries?: boolean;
}

export const Square: React.FC<SquareProps> = ({ 
  square, 
  position,
  gridSize,
  subGridHints = {},
  onClick, 
  disabled, 
  isOpponentView = false,
  showOwnDiscoveries = true
}) => {
  const getBackgroundColor = () => {
    // REVEALED SQUARES ALWAYS TAKE PRIORITY - no hint styling should show through
    if (square.isRevealed) {
      if (isOpponentView) {
        // For opponent view, just show that it's revealed
        return 'bg-gray-200';
      } else {
        // Player's own view shows treasures and failed digs
        if (square.isTreasure && showOwnDiscoveries) {
          return 'bg-amber-400'; // Pure gold for treasures
        }
        return 'bg-amber-950/20'; // Grey for misses
      }
    }
    
    // Only unrevealed squares can show hint styling
    return 'bg-emerald-100 hover:bg-emerald-200';
  };

  const getHoverTitle = () => {
    if (!isOpponentView && square.isRevealed && square.isTreasure && showOwnDiscoveries) {
      return `Found ${square.discoveryCount} times - Next find worth ${Math.max(0, 100 - (square.discoveryCount - 1) * 20)} points`;
    }
    return '';
  };

  // Calculate sub-grid hint styling - BUT ONLY FOR UNREVEALED SQUARES
  const { subGridIndex, borders } = getSubGridBorderInfo(position, gridSize);
  const hintIntensity = subGridHints[subGridIndex] || 0;
  
  // Only apply hint styling to unrevealed squares
  const shouldShowHints = !square.isRevealed && hintIntensity > 0;
  
  const intensityClass = shouldShowHints ? getHintIntensityClass(hintIntensity) : '';
  const borderClasses = shouldShowHints ? getBorderClasses(borders, intensityClass) : '';

  // Debug logging only for squares with hints
  if (shouldShowHints) {
    console.log(`🎯 Square (${position.row}, ${position.col}) - Sub-grid ${subGridIndex}, Intensity: ${hintIntensity}, Revealed: ${square.isRevealed}`);
  }

  // Determine if we should show the diamond icon
  const shouldShowDiamond = square.isRevealed && square.isTreasure && showOwnDiscoveries && !isOpponentView;

  return (
    <button
      onClick={onClick}
      disabled={disabled || (isOpponentView ? false : square.isRevealed)}
      title={getHoverTitle()}
      className={`
        w-full aspect-square rounded-lg border-2 border-emerald-950/10
        ${getBackgroundColor()}
        transform transition-all duration-200
        ${!disabled && !square.isRevealed ? 'hover:scale-95' : ''}
        focus:outline-none focus:ring-2 focus:ring-amber-500
        disabled:cursor-default
        flex items-center justify-center
        ${borderClasses}
      `}
    >
      {shouldShowDiamond && (
        <Gem 
          className="w-6 h-6 text-amber-800 drop-shadow-sm" 
          fill="currentColor"
        />
      )}
    </button>
  );
};