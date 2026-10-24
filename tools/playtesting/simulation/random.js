// Mulberry32 with a stable FNV-1a seed hash. Named streams never share mutable state.
export function randomStream(seed, name) {
  let state = 2166136261;
  for (const char of `${seed}:${name}`) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
export function treasureLayout(seed, count, size = 6) {
  const random = randomStream(seed, 'layout');
  const cells = Array.from({ length: size * size }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, count).map(i => ({ row: Math.floor(i / size), col: i % size }));
}
