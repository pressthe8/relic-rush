export const RULES_VERSION: string;
export interface Position { row: number; col: number }
export interface Discovery extends Position { playerId: string; points: number; discoveryOrder: number; timestamp: string }
export interface Square { isRevealed: boolean; isTreasure: boolean; discoveryCount: number }
export interface RulePlayer { playerId: string; boardState: Square[][]; score: number; remainingDigs: number; discoveries: Discovery[]; acceptedMoves?: number }
export function calculatePoints(discoveryOrder: number): number;
export function regionIndex(position: Position, gridSize: number): number;
export function calculateHints(discoveries: Discovery[], playerId: string, gridSize: number): Record<string, number>;
export function completionReason(players: { remainingDigs: number; discoveries?: Discovery[] }[], deadline: number, now: number, treasureCount?: number): 'deadline' | 'digs-exhausted' | 'players-finished' | null;
export function rankPlayers<T extends { score: number; acceptedMoves?: number }>(players: T[]): (T & { rank: number; digsUsed: number })[];
export function resolveDig<T extends RulePlayer>(player: T, discoveries: Discovery[], move: Position, options: { now: number; deadline: number; status: string; score?: (order: number) => number }): { player: T; allDiscoveries: Discovery[] };
