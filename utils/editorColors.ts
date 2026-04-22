export const colorPalettes = {
  brand: ['#6366f1', '#2563eb', '#10b981', '#f59e0b', '#ef4444'],
  neutrals: ['#000000', '#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#ffffff'],
  softPastels: [
    '#F8FAFC', // Neutro Slate
    '#F0F9FF', // Azul Sky
    '#EBF5FF', // Azul Soft
    '#F0FFF4', // Verde Menta
    '#F0FFFA', // Teal Soft
    '#FFFFF0', // Amarillo Crema
    '#FFFBEB', // Amber Soft
    '#FFF7ED', // Naranja Soft
    '#FFF1F2', // Rosa Soft
    '#FDF2F8', // Magenta Soft
    '#FAF5FF', // Púrpura Soft
    '#F5F3FF', // Violeta Soft
  ]
}

export function rgbToHex(rgb: string): string {
  if (!rgb || rgb === 'transparent' || rgb === 'inherit' || rgb.startsWith('#')) return rgb
  const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/)
  if (!match) return rgb
  const r = parseInt(match[1])
  const g = parseInt(match[2])
  const b = parseInt(match[3])
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
}
