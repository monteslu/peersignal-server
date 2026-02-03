// Code generation - xxx-xxx-xxx format
// Excludes confusing chars: 0, 1, i, l, o
const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateCode() {
  const segment = () => Array.from({ length: 3 }, () => 
    CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join('');
  return `${segment()}-${segment()}-${segment()}`;
}

export function normalizeCode(code) {
  // Lowercase and handle common substitutions
  return code
    .toLowerCase()
    .replace(/[0o]/g, 'o')  // 0 -> o (but o is excluded, so this catches typos)
    .replace(/[1il]/g, 'l') // 1, i, l -> l (but l is excluded)
    .replace(/\s+/g, '-')   // spaces to dashes
    .trim();
}

export function validateCode(code) {
  const normalized = normalizeCode(code);
  return /^[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3}$/.test(normalized);
}
