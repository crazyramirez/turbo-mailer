export interface FontItem {
  name: string
  family: string
  desc: string
}

export interface FontGroup {
  group: string
  fonts: FontItem[]
}

export const safeFonts: FontGroup[] = [
  {
    group: 'Modern Sans',
    fonts: [
      { name: 'Arial', family: 'Arial, Helvetica, sans-serif', desc: 'Limpia y profesional' },
      { name: 'Verdana', family: 'Verdana, Geneva, sans-serif', desc: 'Máxima legibilidad' },
      { name: 'Trebuchet MS', family: '"Trebuchet MS", Helvetica, sans-serif', desc: 'Geométrica y moderna' },
    ],
  },
  {
    group: 'Elegant Serif',
    fonts: [
      { name: 'Georgia', family: 'Georgia, serif', desc: 'Clásica y sofisticada' },
      { name: 'Times New Roman', family: '"Times New Roman", Times, serif', desc: 'Tradicional y seria' },
    ],
  },
  {
    group: 'Technical & Others',
    fonts: [
      { name: 'Courier New', family: '"Courier New", Courier, monospace', desc: 'Estilo máquina de escribir' },
      { name: 'Lucida Sans', family: '"Lucida Sans Unicode", "Lucida Grande", sans-serif', desc: 'Suave y tecnológica' },
    ],
  },
]
