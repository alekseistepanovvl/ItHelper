export function randomIntervalMs(minMs, maxMs, random = Math.random) {
  if (maxMs === minMs) return minMs;
  return Math.round(minMs + random() * (maxMs - minMs));
}

