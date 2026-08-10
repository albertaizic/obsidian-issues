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
