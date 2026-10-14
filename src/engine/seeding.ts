// Bit-reversal standard bracket seeding — mirrors amp-tournament/src/seeding.rs

/** Reverse the low `k` bits of `x`. */
export function bitReverse(x: number, k: number): number {
  let r = 0;
  let v = x;
  for (let i = 0; i < k; i++) {
    r = (r << 1) | (v & 1);
    v >>= 1;
  }
  // force unsigned 32-bit
  return r >>> 0;
}

/** Slot index (0-based) for each seed 1..=size, for a power-of-two `size`. */
export function seedSlots(size: number): number[] {
  const k = Math.log2(size);
  const out: number[] = [];
  for (let s = 1; s <= size; s++) {
    out.push(bitReverse(s - 1, k));
  }
  return out;
}

/** Smallest power of two >= n (n >= 1). */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
