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
    content: `<div class="header-block editable-block" data-type="Header" style="padding:48px 32px;background-color:#d4e2ed;border-bottom:1px solid #e2e8f0;">
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
    id: 'card',
    name: 'Tarjeta',
    icon: Square,
    content: `<div class="card-block editable-block" data-type="Tarjeta" data-layout="premium" style="padding:16px 32px;background:#f6faff;">
    <div class="card-wrapper" style="background:#f6faff;border:1px solid #e2e8f0;border-radius:18px;padding:20px;position:relative;">
      <div class="image-container" data-toggle="image" style="position:relative;margin-bottom:16px;">
        <img src="${placeholder1200x800}" alt="Servicio" style="display:block;width:100%;height:auto;border-radius:12px;">
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
    <div data-toggle="image"><img src="${placeholder1200x800}" alt="Imagen" style="display:block;width:100%;height:auto;border-radius:12px;"></div>
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
      <span style="display:inline-block;font-family:Arial;font-size:12px;font-weight:700;color:#475569;padding:4px 8px;">FITUR · MWC · ITB· IMEX·  WTM</span>
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
