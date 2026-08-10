export const LABEL_COLORS: readonly string[] = [
  '#e11d21', '#0e8048', '#1d76db', '#8250df', '#b97011',
  '#238636', '#23658a', '#5a72c4', '#922b1f', '#6e7683',
];

export function getLabelColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % LABEL_COLORS.length;
  return LABEL_COLORS[index] ?? LABEL_COLORS[0] ?? '#6e7683';
}

export function getLabelTextColor(bg: string): string {
  const r = Number.parseInt(bg.slice(1, 3), 16);
  const g = Number.parseInt(bg.slice(3, 5), 16);
  const b = Number.parseInt(bg.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}
