const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = 62n;
const INITIAL_LENGTH = 12;
const MAX_LENGTH = 64;
const GROWTH = 6;

function parse(position: string): bigint {
  let value = 0n;
  for (const char of position) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new Error(`Invalid position character: ${char}`);
    value = value * BASE + BigInt(digit);
  }
  return value;
}

function encode(value: bigint, length: number): string {
  if (value < 0n) throw new Error('Position value must be non-negative');
  let rest = value;
  let result = '';
  while (rest > 0n) {
    const digit = Number(rest % BASE);
    result = ALPHABET.charAt(digit) + result;
    rest /= BASE;
  }
  if (result.length > length) throw new Error('Position overflows target length');
  return result.padStart(length, '0');
}

export function isValidPosition(position: string): boolean {
  if (position.length === 0 || position.length > MAX_LENGTH) return false;
  for (const char of position) {
    if (!ALPHABET.includes(char)) return false;
  }
  return true;
}

export function comparePositions(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function between(prev: string | null | undefined, next: string | null | undefined): string {
  if (prev && !isValidPosition(prev)) throw new Error('Invalid previous position');
  if (next && !isValidPosition(next)) throw new Error('Invalid next position');

  let length = Math.max(
    prev?.length ?? INITIAL_LENGTH,
    next?.length ?? INITIAL_LENGTH,
    INITIAL_LENGTH,
  );

  for (;;) {
    const scaleA = prev ? BASE ** BigInt(length - prev.length) : 1n;
    const a = prev ? parse(prev) * scaleA : 0n;
    const b = next ? parse(next) * BASE ** BigInt(length - next.length) : BASE ** BigInt(length);

    if (a >= b) throw new Error('previous position must be smaller than next position');

    const mid = (a + b) / 2n;
    if (mid > a && mid < b) {
      return encode(mid, length);
    }

    length += GROWTH;
    if (length > MAX_LENGTH) throw new Error('Cannot generate position: precision exhausted');
  }
}

export function positionBetween(
  prev: string | null | undefined,
  next: string | null | undefined,
): string {
  return between(prev, next);
}

export function initialPositions(count: number): string[] {
  if (count < 0) throw new Error('count must be non-negative');
  if (count === 0) return [];
  const scale = BASE ** BigInt(INITIAL_LENGTH);
  const result: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    result.push(encode((scale * BigInt(i)) / BigInt(count + 1), INITIAL_LENGTH));
  }
  return result;
}
