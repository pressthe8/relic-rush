import { Position } from '../types'

export interface SubGridHints {
  [subGridIndex: string]: number // subgrid index -> discovery count
}

/**
 * Calculate which sub-grid (0-8) a position belongs to
 * Grid is divided into 3x3 sub-grids like tic-tac-toe
 */
export const getSubGridIndex = (position: Position, gridSize: number): number => {
  const subGridSize = gridSize / 3
  const subGridRow = Math.floor(position.row / subGridSize)
  const subGridCol = Math.floor(position.col / subGridSize)
  return subGridRow * 3 + subGridCol
}

/**
 * Get the coordinate ranges for a sub-grid
 */
export const getSubGridBounds = (subGridIndex: number, gridSize: number) => {
  const subGridSize = gridSize / 3
  const subGridRow = Math.floor(subGridIndex / 3)
  const subGridCol = subGridIndex % 3
  
  return {
    startRow: Math.floor(subGridRow * subGridSize),
    endRow: Math.floor((subGridRow + 1) * subGridSize) - 1,
    startCol: Math.floor(subGridCol * subGridSize),
    endCol: Math.floor((subGridCol + 1) * subGridSize) - 1
  }
}

/**
 * Check if a position is on the border between sub-grids and should show inner borders
 */
export const getSubGridBorderInfo = (position: Position, gridSize: number) => {
  const subGridSize = gridSize / 3
  const { row, col } = position
  
  // Calculate which sub-grid this position belongs to
  const subGridIndex = getSubGridIndex(position, gridSize)
  
  // For inner borders, we want to highlight ALL edges of squares within active sub-grids
  // This creates a clear visual boundary around the entire sub-grid area
  const borders = {
    top: true,    // Always show top border for squares in active sub-grids
    bottom: true, // Always show bottom border for squares in active sub-grids
    left: true,   // Always show left border for squares in active sub-grids
    right: true   // Always show right border for squares in active sub-grids
  }
  
  return { subGridIndex, borders }
}

/**
 * Get CSS classes for sub-grid hint intensity
 */
export const getHintIntensityClass = (intensity: number): string => {
  if (intensity === 0) return ''
  if (intensity === 1) return 'subgrid-hint-1'
  if (intensity === 2) return 'subgrid-hint-2'
  if (intensity === 3) return 'subgrid-hint-3'
  if (intensity >= 4) return 'subgrid-hint-4'
  return ''
}

/**
 * Get border style classes based on which borders should be highlighted
 */
export const getBorderClasses = (borders: { top: boolean; bottom: boolean; left: boolean; right: boolean }, intensityClass: string): string => {
  if (!intensityClass) return ''
  
  const classes = [intensityClass] // Add base background class
  if (borders.top) classes.push(`${intensityClass}-top`)
  if (borders.bottom) classes.push(`${intensityClass}-bottom`)
  if (borders.left) classes.push(`${intensityClass}-left`)
  if (borders.right) classes.push(`${intensityClass}-right`)
  
  return classes.join(' ')
}