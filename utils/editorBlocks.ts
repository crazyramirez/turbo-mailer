import type { Component } from 'vue'
import {
  Layout,
  Type,
  Square,
  MousePointer2,
  Image as ImageIcon,
  Zap,
  Globe,
  Edit3,
  StickyNote,
  UserMinus,
  Star,
  CreditCard,
  Play,
  Share2,
  Minus,
  HelpCircle,
  LayoutTemplate,
  BarChart3,
} from 'lucide-vue-next'

export interface EditorBlock {
  id: string
  name: string
  icon: Component
  content: string
}

const getPlaceholder = (w: number, h: number, text = 'Imagen') =>
  `https://placehold.co/${w}x${h}/1e293b/white?text=${encodeURIComponent(text)}`

const placeholder1200x800 = getPlaceholder(1200, 800, 'Imagen')
const placeholder400x400 = getPlaceholder(400, 400, 'Imagen ')
const placeholderLogo = getPlaceholder(200, 60, 'Logo')

export const editorBlocks: EditorBlock[] = [
  {
    id: 'header-pro',
    name: 'Header',
    icon: Layout,
    content: `<div class="header-block editable-block" data-type="Header" style="padding:48px 32px; border-bottom: 1px solid #E6E6E6; background-color:#d4e2ed;">
    <div data-toggle="logo" style="margin-bottom:24px;">
      <img src="${placeholderLogo}" alt="Logo" style="display:block;max-height:50px;width:auto;">
    </div>
    <div data-toggle="badge" style="font-family:Arial;font-size:12px;font-weight:700;color:#6366f1;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">
      Presentación VIP
    </div>
    <div data-toggle="title" style="font-family:Arial;font-size:38px;line-height:1.2;font-weight:700;color:#0f172a;margin-bottom:16px;">Tu propuesta de valor principal aquí</div>
    <div data-toggle="subtitle" style="font-family:Arial;font-size:18px;line-height:1.6;color:#475569;max-width:600px;">Más de 10 años ofreciendo soluciones profesionales para empresas e instituciones de primer nivel internacional.</div>
  </div>`,
  },
  {
    id: 'hero',
    name: 'Hero',
    icon: LayoutTemplate,
    content: `<div class="hero-block editable-block" data-type="Hero" style="padding:80px 40px; background: linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.7)), url('${placeholder1200x800}'); background-size: cover; background-position: center; text-align: center; color: #ffffff;">
    <div data-toggle="badge" style="font-family:Arial;font-size:14px;font-weight:700;color:#818cf8;letter-spacing:2px;text-transform:uppercase;margin-bottom:20px;">Lanzamiento Exclusivo</div>
    <div data-toggle="title" style="font-family:Arial;font-size:48px;line-height:1.1;font-weight:800;color:#ffffff;margin-bottom:24px;">Eleva tu marca al siguiente nivel</div>
    <div data-toggle="subtitle" style="font-family:Arial;font-size:20px;line-height:1.6;color:#e2e8f0;max-width:600px;margin:0 auto 32px;">Diseño, estrategia y ejecución de alto impacto para proyectos que buscan la excelencia.</div>
    <div data-toggle="button-container">
      <a href="#" data-toggle="button" style="display:inline-block;background:#6366f1;border-radius:12px;padding:20px 40px;font-family:Arial;font-size:18px;font-weight:700;color:#ffffff;text-decoration:none;transition:all 0.3s ease;">Empieza Ahora →</a>
    </div>
  </div>`,
  },
  {
    id: 'text',
    name: 'Texto',
    icon: Type,
    content: `<div class="body-block editable-block" data-type="Texto" style="padding:48px 32px;background:#f6faff;">
    <div data-toggle="title" style="font-family:Arial;font-size:17px;line-height:28px;color:#334155;">
      Escribe aquí tu contenido principal. Utiliza este espacio para desarrollar tu mensaje con detalle y claridad, manteniendo siempre un tono institucional.
      <br><br>
      Puedes aplicar estilos como <b>negrita</b>, <i>cursiva</i> o subrayado para resaltar los puntos clave. Este bloque está diseñado para ofrecer una <u>legibilidad máxima</u> en cualquier dispositivo.
    </div>
  </div>`,
  },
  {
    id: 'button',
    name: 'Botón',
    icon: MousePointer2,
    content: `<div class="cta-block editable-block" data-type="Botón" style="padding:20px;background:#f6faff;text-align:center;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
      <tr>
        <td align="center" class="buttons-row" style="text-align:center;padding:0;">
          <a href="#" data-toggle="button" style="display:inline-block;background:#6366f1;border-radius:14px;padding:18px 32px;font-family:Arial;font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;text-align:center;min-width:200px;box-sizing:border-box;margin:6px;"><span class="btn-text">Llamada a la Acción →</span></a>
        </td>
      </tr>
    </table>
  </div>`,
  },
  {
    id: 'image',
    name: 'Imagen',
    icon: ImageIcon,
    content: `<div class="image-block editable-block" data-type="Imagen" style="padding:16px 32px;background:#f6faff;text-align:center;">
    <div data-toggle="image"><img src="${placeholder1200x800}" class="main-img-responsive" alt="Imagen" style="display:block;width:100%;height:auto;border-radius:12px;"></div>
  </div>`,
  },
  {
    id: 'card',
    name: 'Tarjeta',
    icon: Square,
    content: `<div class="card-block editable-block" data-type="Tarjeta" data-layout="premium" style="padding:16px 32px;background:#f6faff;">
    <div class="card-wrapper" style="background:#f6faff;border:1px solid #e2e8f0;border-radius:18px;padding:20px;position:relative;">
      <div class="image-container" data-toggle="image" style="position:relative;margin-bottom:16px;">
        <img src="${placeholder1200x800}" class="main-img-responsive" alt="Servicio" style="display:block;width:100%;height:auto;border-radius:12px;">
      </div>
      <div class="text-group">
        <div data-toggle="badge" class="badge-el" style="font-family:Arial;font-size:13px;font-weight:700;color:#6366f1;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">01 · Categoría</div>
        <div data-toggle="title" style="font-family:Arial;font-size:20px;font-weight:700;color:#0f172a;margin-bottom:10px;">Título del Servicio</div>
        <div data-toggle="subtitle" style="font-family:Arial;font-size:15px;line-height:24px;color:#475569;">Describe aquí los detalles de este servicio o producto para captar la atención de tu cliente.</div>
      </div>
    </div>
  </div>`,
  },
  {
    id: 'grid-2',
    name: 'Grid Dúo',
    icon: Layout,
    content: `<div class="grid-block editable-block" data-type="Grid" style="padding:20px;background:#f6faff;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="48%" valign="top">
          <div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:16px;padding:12px;">
            <div data-toggle="image"><img class="grid-img" src="${placeholder400x400}" style="display:block;width:100%;height:200px;object-fit:cover;border-radius:10px;margin-bottom:12px;"></div>
            <div data-toggle="title" style="font-family:Arial;font-size:15px;font-weight:700;color:#0f172a;">Elemento 1</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:12px;line-height:1.4;color:#64748b;margin-top:4px;">Descripción breve aquí.</div>
          </div>
        </td>
        <td width="4%">&nbsp;</td>
        <td width="48%" valign="top">
          <div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:16px;padding:12px;">
            <div data-toggle="image"><img class="grid-img" src="${placeholder400x400}" style="display:block;width:100%;height:200px;object-fit:cover;border-radius:10px;margin-bottom:12px;"></div>
            <div data-toggle="title" style="font-family:Arial;font-size:15px;font-weight:700;color:#0f172a;">Elemento 2</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:12px;line-height:1.4;color:#64748b;margin-top:4px;">Descripción breve aquí.</div>
          </div>
        </td>
      </tr>
    </table>
  </div>`,
  },
  {
    id: 'grid-3',
    name: 'Grid Trío',
    icon: Layout,
    content: `<div class="grid-block editable-block" data-type="Grid" style="padding:20px;background:#f6faff;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="31%" valign="top">
          <div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:12px;padding:10px;">
            <div data-toggle="image"><img class="grid-img" src="${placeholder400x400}" style="display:block;width:100%;height:150px;object-fit:cover;border-radius:8px;margin-bottom:10px;"></div>
            <div data-toggle="title" style="font-family:Arial;font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">Título 1</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:11px;line-height:1.4;color:#64748b;">Breve descripción aquí.</div>
          </div>
        </td>
        <td width="3.5%">&nbsp;</td>
        <td width="31%" valign="top">
          <div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:12px;padding:10px;">
            <div data-toggle="image"><img class="grid-img" src="${placeholder400x400}" style="display:block;width:100%;height:150px;object-fit:cover;border-radius:8px;margin-bottom:10px;"></div>
            <div data-toggle="title" style="font-family:Arial;font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">Título 2</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:11px;line-height:1.4;color:#64748b;">Breve descripción aquí.</div>
          </div>
        </td>
        <td width="3.5%">&nbsp;</td>
        <td width="31%" valign="top">
          <div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:12px;padding:10px;">
            <div data-toggle="image"><img class="grid-img" src="${placeholder400x400}" style="display:block;width:100%;height:150px;object-fit:cover;border-radius:8px;margin-bottom:10px;"></div>
            <div data-toggle="title" style="font-family:Arial;font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">Título 3</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:11px;line-height:1.4;color:#64748b;">Breve descripción aquí.</div>
          </div>
        </td>
      </tr>
    </table>
  </div>`,
  },
  {
    id: 'grid-4',
    name: 'Grid Quad',
    icon: Layout,
    content: `<div class="grid-block editable-block" data-type="Grid" style="padding:20px;background:#f6faff;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout: fixed;">
      <tr>
        <td class="grid-quad-td" width="25%" valign="top" style="padding: 0 6px;">
          <div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:16px;padding:12px;">
            <div data-toggle="image"><img class="grid-img" src="${placeholder400x400}" style="display:block;width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:12px;"></div>
            <div data-toggle="title" style="font-family:Arial;font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px;">Título 1</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:11px;line-height:1.4;color:#64748b;">Breve detalle aquí.</div>
          </div>
        </td>
        <td class="grid-quad-td" width="25%" valign="top" style="padding: 0 6px;">
          <div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:16px;padding:12px;">
            <div data-toggle="image"><img class="grid-img" src="${placeholder400x400}" style="display:block;width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:12px;"></div>
            <div data-toggle="title" style="font-family:Arial;font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px;">Título 2</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:11px;line-height:1.4;color:#64748b;">Breve detalle aquí.</div>
          </div>
        </td>
        <td class="grid-quad-td" width="25%" valign="top" style="padding: 0 6px;">
          <div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:16px;padding:12px;">
            <div data-toggle="image"><img class="grid-img" src="${placeholder400x400}" style="display:block;width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:12px;"></div>
            <div data-toggle="title" style="font-family:Arial;font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px;">Título 3</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:11px;line-height:1.4;color:#64748b;">Breve detalle aquí.</div>
          </div>
        </td>
        <td class="grid-quad-td" width="25%" valign="top" style="padding: 0 6px;">
          <div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:16px;padding:12px;">
            <div data-toggle="image"><img class="grid-img" src="${placeholder400x400}" style="display:block;width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:12px;"></div>
            <div data-toggle="title" style="font-family:Arial;font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px;">Título 4</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:11px;line-height:1.4;color:#64748b;">Breve detalle aquí.</div>
          </div>
        </td>
      </tr>
    </table>
  </div>`,
  },
  {
    id: 'note',
    name: 'Nota',
    icon: StickyNote,
    content: `<div class="methodology-block editable-block" data-type="Nota" style="padding:20px;background:#f6faff;">
    <div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:18px;padding:24px;border-left:4px solid #6366f1;">
      <div data-toggle="badge" style="font-family:Arial;font-size:11px;font-weight:700;color:#6366f1;letter-spacing:1.2px;margin-bottom:12px;text-transform:uppercase;">Información Importante</div>
      <div data-toggle="title" style="font-family:Arial;font-size:16px;font-weight:700;color:#0f172a;line-height:24px;margin-bottom:12px;">Punto clave a destacar en tu comunicación.</div>
      <div data-toggle="subtitle" style="font-family:Arial;font-size:15px;line-height:24px;color:#475569;">Utiliza este bloque para resaltar datos, aclaraciones o cualquier información que deba captar la atención del lector de forma inmediata y profesional.</div>
    </div>
  </div>`,
  },
  {
    id: 'presence',
    name: 'Presencia',
    icon: Globe,
    content: `<div class="presence-block editable-block" data-type="Presencia" style="padding:20px;background:#f6faff;">
    <div data-toggle="badge" style="font-family:Arial;font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:1.2px;text-align:center;margin-bottom:16px;text-transform:uppercase;">RECONOCIMIENTO Y PRESENCIA</div>
    <div style="background:#f6faff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center;">
      <span style="display:inline-block;font-family:Arial;font-size:12px;font-weight:700;color:#475569;padding:4px 8px;">FITUR · MWC · ITB · IMEX · WTM · IBTM</span>
    </div>
  </div>`,
  },
  {
    id: 'testimonials',
    name: 'Testimonios',
    icon: Star,
    content: `<div class="testimonials-block editable-block" data-type="Testimonios" style="padding:48px 32px; background:#f6faff; text-align:center;">
    <div style="max-width:600px; margin:0 auto;">
      <div style="color:#6366f1; margin-bottom:24px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H15.017C14.4647 8 14.017 8.44772 14.017 9V12C14.017 12.5523 13.5693 13 13.017 13H11.017C10.4647 13 10.017 12.5523 10.017 12V9C10.017 7.34315 11.3601 6 13.017 6H19.017C20.6738 6 22.017 7.34315 22.017 9V15C22.017 18.3137 19.3307 21 16.017 21H14.017ZM3.017 21L3.017 18C3.017 16.8954 3.91243 16 5.017 16H8.017C8.56928 16 9.017 15.5523 9.017 15V9C9.017 8.44772 8.56928 8 8.017 8H4.017C3.46472 8 3.017 8.44772 3.017 9V12C3.017 12.5523 2.56928 13 2.017 13H0.017C-0.535282 13 -1.017 12.5523 -1.017 12V9C-1.017 7.34315 0.326142 6 1.983 6H8.017C9.67386 6 11.017 7.34315 11.017 9V15C11.017 18.3137 8.33071 21 5.017 21H3.017Z"/></svg>
      </div>
      <div data-toggle="subtitle" style="font-family:Arial;font-size:20px;line-height:1.6;color:#334155;font-style:italic;margin-bottom:24px;">"TurboMailer ha transformado completamente nuestra forma de comunicar. La facilidad de uso y la calidad de los diseños son sencillamente excepcionales."</div>
      <div style="display:inline-block; border-top:1px solid #e2e8f0; padding-top:16px;">
        <div data-toggle="title" style="font-family:Arial;font-size:16px;font-weight:700;color:#0f172a;">Carlos Mendoza</div>
        <div data-toggle="badge" style="font-family:Arial;font-size:13px;color:#64748b;margin-top:4px;">CEO @ TechInnovate</div>
      </div>
    </div>
  </div>`,
  },
  {
    id: 'pricing',
    name: 'Precios',
    icon: CreditCard,
    content: `<div class="pricing-block editable-block" data-type="Precios" style="padding:48px 20px; background:#f6faff;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="31%" valign="top">
          <div class="pricing-item" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:24px; text-align:center;">
            <div data-toggle="badge" style="font-family:Arial;font-size:12px;font-weight:700;color:#64748b;margin-bottom:12px;text-transform:uppercase;">Básico</div>
            <div data-toggle="title" style="font-family:Arial;font-size:32px;font-weight:800;color:#0f172a;margin-bottom:8px;">$29<span style="font-size:14px;font-weight:400;color:#64748b;">/mes</span></div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:13px;line-height:1.6;color:#64748b;margin-bottom:20px;">Ideal para pequeños proyectos.</div>
            <div class="pricing-features" data-toggle="pricing-features" style="border-top:1px solid #f1f5f9; padding-top:16px; margin-bottom:20px; text-align:left; min-height: 40px;">
              <div data-toggle="pricing-feature" class="pricing-feature" style="font-family:Arial;font-size:13px;color:#475569;margin-bottom:8px;">✓ 1.000 Envíos/mes</div>
              <div data-toggle="pricing-feature" class="pricing-feature" style="font-family:Arial;font-size:13px;color:#475569;margin-bottom:8px;">✓ Soporte Standard</div>
              <div data-toggle="pricing-feature" class="pricing-feature" style="font-family:Arial;font-size:13px;color:#475569;">✓ Editor Drag & Drop</div>
            </div>
            <a href="#" data-toggle="button" style="display:block;background:#6366f1;border-radius:10px;padding:12px;font-family:Arial;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Elegir Plan</a>
          </div>
        </td>
        <td width="3.5%">&nbsp;</td>
        <td width="31%" valign="top">
          <div class="pricing-item" style="background:#ffffff; border:2px solid #6366f1; border-radius:16px; padding:24px; text-align:center; position:relative;">
            <div style="position:absolute; top:-12px; left:50%; transform:translateX(-50%); background:#6366f1; color:#ffffff; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700; text-transform:uppercase;">Más Popular</div>
            <div data-toggle="badge" style="font-family:Arial;font-size:12px;font-weight:700;color:#6366f1;margin-bottom:12px;text-transform:uppercase;">Pro</div>
            <div data-toggle="title" style="font-family:Arial;font-size:32px;font-weight:800;color:#0f172a;margin-bottom:8px;">$79<span style="font-size:14px;font-weight:400;color:#64748b;">/mes</span></div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:13px;line-height:1.6;color:#64748b;margin-bottom:20px;">Para empresas en crecimiento.</div>
            <div class="pricing-features" data-toggle="pricing-features" style="border-top:1px solid #f1f5f9; padding-top:16px; margin-bottom:20px; text-align:left; min-height: 40px;">
              <div data-toggle="pricing-feature" class="pricing-feature" style="font-family:Arial;font-size:13px;color:#475569;margin-bottom:8px;">✓ 10.000 Envíos/mes</div>
              <div data-toggle="pricing-feature" class="pricing-feature" style="font-family:Arial;font-size:13px;color:#475569;margin-bottom:8px;">✓ Soporte Prioritario</div>
              <div data-toggle="pricing-feature" class="pricing-feature" style="font-family:Arial;font-size:13px;color:#475569;">✓ Automatizaciones</div>
            </div>
            <a href="#" data-toggle="button" style="display:block;background:#6366f1;border-radius:10px;padding:12px;font-family:Arial;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Elegir Plan</a>
          </div>
        </td>
        <td width="3.5%">&nbsp;</td>
        <td width="31%" valign="top">
          <div class="pricing-item" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:24px; text-align:center;">
            <div data-toggle="badge" style="font-family:Arial;font-size:12px;font-weight:700;color:#64748b;margin-bottom:12px;text-transform:uppercase;">Empresa</div>
            <div data-toggle="title" style="font-family:Arial;font-size:32px;font-weight:800;color:#0f172a;margin-bottom:8px;">$199<span style="font-size:14px;font-weight:400;color:#64748b;">/mes</span></div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:13px;line-height:1.6;color:#64748b;margin-bottom:20px;">Soluciones personalizadas.</div>
            <div class="pricing-features" data-toggle="pricing-features" style="border-top:1px solid #f1f5f9; padding-top:16px; margin-bottom:20px; text-align:left; min-height: 40px;">
              <div data-toggle="pricing-feature" class="pricing-feature" style="font-family:Arial;font-size:13px;color:#475569;margin-bottom:8px;">✓ Envíos Ilimitados</div>
              <div data-toggle="pricing-feature" class="pricing-feature" style="font-family:Arial;font-size:13px;color:#475569;margin-bottom:8px;">✓ Account Manager</div>
              <div data-toggle="pricing-feature" class="pricing-feature" style="font-family:Arial;font-size:13px;color:#475569;">✓ API de Integración</div>
            </div>
            <a href="#" data-toggle="button" style="display:block;background:#6366f1;border-radius:10px;padding:12px;font-family:Arial;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Elegir Plan</a>
          </div>
        </td>
      </tr>
    </table>
  </div>`,
  },
  {
    id: 'video',
    name: 'Video',
    icon: Play,
    content: `<div class="video-block editable-block" data-type="Video" style="padding:16px 32px; background:#f6faff; text-align:center;">
    <div style="position:relative; display:inline-block; width:100%; max-width:600px;">
      <div data-toggle="image" style="position:relative; cursor:pointer;">
        <img src="${placeholder1200x800}" class="main-img-responsive" alt="Video Thumbnail" style="display:block;width:100%;height:auto;border-radius:12px;">
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:80px; height:80px; background:rgba(99, 102, 241, 0.9); border-radius:50%; display:flex; align-items:center; justify-content:center; pointer-events:none; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    </div>
    <div data-toggle="subtitle" style="font-family:Arial;font-size:14px;color:#64748b;margin-top:12px;">Haz clic para ver el video completo en nuestra plataforma.</div>
  </div>`,
  },
  {
    id: 'socials',
    name: 'Sociales',
    icon: Share2,
    content: `<div class="social-block editable-block" data-type="Redes Sociales" style="padding:32px; background:#f6faff; text-align:center;">
    <div style="margin-bottom:16px;">
      <div data-toggle="title" style="font-family:Arial;font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:1px;">Síguenos en nuestras redes</div>
    </div>
    <div style="display:inline-block;">
      <a href="#" class="social-item" style="display:inline-block; margin:0 8px;"><img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" width="32" height="32" alt="Facebook"></a>
      <a href="#" class="social-item" style="display:inline-block; margin:0 8px;"><img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" width="32" height="32" alt="Instagram"></a>
      <a href="#" class="social-item" style="display:inline-block; margin:0 8px;"><img src="https://cdn-icons-png.flaticon.com/512/145/145807.png" width="32" height="32" alt="LinkedIn"></a>
      <a href="#" class="social-item" style="display:inline-block; margin:0 8px;"><img src="https://cdn-icons-png.flaticon.com/512/3256/3256013.png" width="32" height="32" alt="Twitter"></a>
    </div>
  </div>`,
  },
  {
    id: 'divider',
    name: 'Separador',
    icon: Minus,
    content: `<div class="divider-block editable-block" data-type="Separador" style="padding:16px 32px; background:#f6faff;">
    <div style="height:1px; background-color:#e2e8f0; width:100%;"></div>
  </div>`,
  },
  {
    id: 'faq',
    name: 'FAQ',
    icon: HelpCircle,
    content: `<div class="faq-block editable-block" data-type="FAQ" style="padding:32px; background:#f6faff;">
    <div data-toggle="badge" style="font-family:Arial;font-size:12px;font-weight:700;color:#6366f1;margin-bottom:20px;text-transform:uppercase;">Preguntas Frecuentes</div>
    <div class="faq-item" style="margin-bottom:24px;">
      <div data-toggle="title" style="font-family:Arial;font-size:17px;font-weight:700;color:#0f172a;margin-bottom:8px;">¿Cómo puedo empezar con TurboMailer?</div>
      <div data-toggle="subtitle" style="font-family:Arial;font-size:15px;line-height:1.6;color:#475569;">Es muy sencillo. Solo tienes que crear una cuenta, elegir una plantilla y empezar a personalizar tu primera campaña en minutos.</div>
    </div>
    <div class="faq-item" style="margin-bottom:24px; border-top:1px solid #f1f5f9; padding-top:20px;">
      <div data-toggle="title" style="font-family:Arial;font-size:17px;font-weight:700;color:#0f172a;margin-bottom:8px;">¿Tienen algún periodo de prueba?</div>
      <div data-toggle="subtitle" style="font-family:Arial;font-size:15px;line-height:1.6;color:#475569;">Sí, ofrecemos un plan gratuito de por vida con el que puedes enviar hasta 500 correos al mes para probar todas las funcionalidades.</div>
    </div>
    <div class="faq-item" style="border-top:1px solid #f1f5f9; padding-top:20px;">
      <div data-toggle="title" style="font-family:Arial;font-size:17px;font-weight:700;color:#0f172a;margin-bottom:8px;">¿Ofrecen soporte en español?</div>
      <div data-toggle="subtitle" style="font-family:Arial;font-size:15px;line-height:1.6;color:#475569;">Absolutamente. Nuestro equipo de soporte está disponible en español e inglés las 24 horas del día para ayudarte en lo que necesites.</div>
    </div>
  </div>`,
  },
  {
    id: 'metrics',
    name: 'Estadísticas',
    icon: BarChart3,
    content: `<div class="metrics-block editable-block" data-type="Métricas" style="padding:40px 20px; background:#f6faff; text-align:center;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" class="metrics-table">
      <tr>
        <td width="33%" valign="top" class="metric-td">
          <div class="metric-item" style="padding:10px;">
            <div data-toggle="title" style="font-family:Arial;font-size:32px;font-weight:800;color:#6366f1;margin-bottom:4px;">10k+</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Clientes Activos</div>
          </div>
        </td>
        <td width="33%" valign="top" class="metric-td">
          <div class="metric-item" style="padding:10px;">
            <div data-toggle="title" style="font-family:Arial;font-size:32px;font-weight:800;color:#6366f1;margin-bottom:4px;">99%</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Satisfacción</div>
          </div>
        </td>
        <td width="33%" valign="top" class="metric-td">
          <div class="metric-item" style="padding:10px;">
            <div data-toggle="title" style="font-family:Arial;font-size:32px;font-weight:800;color:#6366f1;margin-bottom:4px;">24/7</div>
            <div data-toggle="subtitle" style="font-family:Arial;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Soporte Global</div>
          </div>
        </td>
      </tr>
    </table>
  </div>`,
  },
  {
    id: 'unsubscribe',
    name: 'Unsuscribir',
    icon: UserMinus,
    content: `<div class="unsubscribe-block editable-block" data-type="Unsuscribir" style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
    <div data-toggle="subtitle" style="font-family:Arial;font-size:12px;line-height:1.8;color:#94a3b8;">
      Has recibido este email porque te suscribiste a nuestra lista.<br>
      Si no deseas recibir más comunicaciones,
      <a href="{{UNSUBSCRIBE_URL}}" style="color:#6366f1;text-decoration:underline;">haz clic aquí para darte de baja</a>.
    </div>
  </div>`,
  },
  {
    id: 'signature',
    name: 'Firma',
    icon: Edit3,
    content: `<div class="signature-block editable-block" data-type="Firma" style="padding:20px 40px;background:#f6faff;border-top:1px solid #e2e8f0;">
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="vertical-align:middle;padding-right:14px;">
          <div class="image-container" data-toggle="image" style="width:70px;">
            <img src="https://placehold.co/200x200/f8fafc/6366f1?text=A" alt="Firma" style="display:block;width:70px;height:auto;border:0;border-radius:0;">
          </div>
        </td>
        <td style="vertical-align:middle;">
          <div data-toggle="title" style="font-family:Arial;font-size:17px;font-weight:700;color:#0f172a;line-height:1.2;">Alex Rivera</div>
          <div data-toggle="subtitle" style="font-family:Arial;font-size:14px;color:#64748b;margin-top:2px;">NovaSphere Solutions</div>
          <div data-toggle="contact" style="font-family:Arial;font-size:14px;color:#334155;margin-top:3px;">
            <a href="mailto:hola@tudominio.com" style="color:#6366f1;text-decoration:none;">hola@tudominio.com</a>
          </div>
          <div data-toggle="contact" style="font-family:Arial;font-size:14px;color:#334155;margin-top:3px;">
            <a href="#" style="color:#6366f1;text-decoration:none;">www.tudominio.com</a>
          </div>
        </td>
      </tr>
    </table>
    <div style="height:20px;"></div>
    <div data-toggle="ps" style="font-family:Arial;font-size:14px;line-height:22px;color:#64748b;border-left:3px solid #6366f1;padding-left:12px;">
      <span style="font-weight:700;color:#334155;">P.D.</span> <span style="display:inline-block;">Escribe aquí una nota final, recordatorio o posdata para tu destinatario.</span>
    </div>
  </div>`,
  },
]
