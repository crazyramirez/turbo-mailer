import { Layout, Palette, Zap } from 'lucide-vue-next'
import type { Component } from 'vue'

export interface EditorStyleBase {
  id: string
  name: string
  description: string
  icon: Component
  previewColor: string
  config: {
    bodyBg: string
    cardBg: string
    contentBg: string
    cardRadius: string
    cardShadow: string
    cardBorder: string
    borderColor: string
    headerBg: string
    headerText: string
    titleColor: string
    subtitleColor: string
    accentColor: string
    buttonRadius: string
    fontFamily: string
    labelFontFamily?: string
    titleLetterSpacing?: string
  }
}

export const editorStyleBases: EditorStyleBase[] = [
  {
    id: 'default',
    name: 'editor.style_default_name',
    description: 'editor.style_default_desc',
    icon: Layout,
    previewColor: '#6366f1',
    config: {
      bodyBg: '#f8fafc',
      cardBg: '#ffffff',
      contentBg: '#ffffff',
      cardRadius: '0px',
      cardShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      cardBorder: '1px solid #e2e8f0',
      borderColor: '#e2e8f0',
      headerBg: '#ffffff',
      headerText: '#0f172a',
      titleColor: '#0f172a',
      subtitleColor: '#475569',
      accentColor: '#6366f1',
      buttonRadius: '8px',
      fontFamily: 'Inter, system-ui, sans-serif',
      titleLetterSpacing: '0px'
    }
  },
  {
    id: 'viseni',
    name: 'editor.style_viseni_name',
    description: 'editor.style_viseni_desc',
    icon: Zap,
    previewColor: '#628097',
    config: {
      bodyBg: '#ffffff',
      cardBg: '#ffffff',
      contentBg: '#f6faff',
      cardRadius: '0px',
      cardShadow: '0 10px 40px rgba(15, 23, 42, 0.08)',
      cardBorder: '1px solid #e9e9e9',
      borderColor: '#e2e8f0',
      headerBg: '#628097',
      headerText: '#ffffff',
      titleColor: '#0f172a',
      subtitleColor: '#475569',
      accentColor: '#008db4',
      buttonRadius: '14px',
      fontFamily: 'Arial, sans-serif',
      titleLetterSpacing: '-0.2px'
    }
  },
  {
    id: 'tech-noir',
    name: 'editor.style_tech_name',
    description: 'editor.style_tech_desc',
    icon: Zap,
    previewColor: '#f16335',
    config: {
      bodyBg: '#0d0d0d',
      cardBg: '#0d0d0d',
      contentBg: '#141414',
      cardRadius: '0px',
      cardShadow: 'none',
      cardBorder: '1px solid #1f1f1f',
      borderColor: '#1f1f1f',
      headerBg: '#0d0d0d',
      headerText: '#ffffff',
      titleColor: '#ffffff',
      subtitleColor: '#9ca3af',
      accentColor: '#f16335',
      buttonRadius: '8px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
      labelFontFamily: "'Courier New', Courier, monospace",
      titleLetterSpacing: '-0.4px'
    }
  },
  {
    id: 'corporate',
    name: 'editor.style_corp_name',
    description: 'editor.style_corp_desc',
    icon: Layout,
    previewColor: '#1e293b',
    config: {
      bodyBg: '#e2e8f0',
      cardBg: '#ffffff',
      contentBg: '#ffffff',
      cardRadius: '0px',
      cardShadow: 'none',
      cardBorder: '4px solid #1e293b',
      borderColor: '#1e293b',
      headerBg: '#1e293b',
      headerText: '#ffffff',
      titleColor: '#000000',
      subtitleColor: '#334155',
      accentColor: '#1e293b',
      buttonRadius: '0px',
      fontFamily: 'Helvetica, Arial, sans-serif',
      titleLetterSpacing: '0px'
    }
  },
  {
    id: 'dark-gold',
    name: 'editor.style_dark_name',
    description: 'editor.style_dark_desc',
    icon: Palette,
    previewColor: '#f59e0b',
    config: {
      bodyBg: '#020617',
      cardBg: '#0f172a',
      contentBg: '#0f172a',
      cardRadius: '0px',
      cardShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
      cardBorder: '1px solid rgba(245, 158, 11, 0.3)',
      borderColor: 'rgba(245, 158, 11, 0.2)',
      headerBg: '#1e293b',
      headerText: '#f8fafc',
      titleColor: '#ffffff',
      subtitleColor: '#94a3b8',
      accentColor: '#f59e0b',
      buttonRadius: '100px',
      fontFamily: 'Georgia, serif',
      titleLetterSpacing: '0px'
    }
  }
]
