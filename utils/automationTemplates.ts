// Ready-made automations. Emails are block plans assembled client-side with
// the brand kit (utils/emailAssembler), so they come out on-brand and fully
// editable. Copy is intentionally plain: the AI button rewrites it per brand.

import type { PlannedBlock } from '~/utils/emailAssembler'

export interface TemplateEmail {
  subject: string
  preheader: string
  blocks: PlannedBlock[]
}

export interface TemplateStep {
  type: 'email' | 'wait' | 'wait_until' | 'condition' | 'tag' | 'list' | 'field' | 'webhook' | 'exit'
  email?: TemplateEmail
  amount?: number
  unit?: 'minutes' | 'hours' | 'days'
  weekdays?: number[]
  hour?: number
  condition?: { kind: 'opened_last' | 'clicked_last' }
  yes?: TemplateStep[]
  no?: TemplateStep[]
  action?: 'add' | 'remove'
  tag?: string
}

export interface AutomationTemplate {
  id: string
  icon: string
  trigger: Record<string, unknown>
  steps: TemplateStep[]
}

type Lang = 'es' | 'en'

function mail(lang: Lang, subject: string, preheader: string, badge: string, title: string, body: string, button?: string, extra: PlannedBlock[] = []): TemplateEmail {
  const blocks: PlannedBlock[] = [
    { id: 'header-pro', fields: { badge, title, subtitle: preheader } },
    { id: 'text', fields: { title: body } },
    ...extra,
  ]
  if (button) blocks.push({ id: 'button', fields: { button, buttonUrl: '{{WEB_URL}}' } })
  blocks.push({ id: 'unsubscribe', fields: {} })
  void lang
  return { subject, preheader, blocks }
}

const COPY = {
  es: {
    welcome1: mail('es', '¡Bienvenido/a, {{name | "amigo"}}!', 'Esto es lo que vas a recibir a partir de ahora', 'BIENVENIDA', 'Gracias por unirte', 'Hola {{name | ""}},<br><br>Nos alegra mucho tenerte aquí. Cada semana te enviaremos ideas prácticas, novedades y, de vez en cuando, ventajas exclusivas para suscriptores.<br><br>Si alguna vez quieres contarnos algo, responde a este email: lo leemos todo.', 'Conócenos'),
    welcome2: mail('es', 'Lo mejor para empezar', 'Una selección de lo que más gusta a nuestros lectores', 'PARA EMPEZAR', 'Nuestros imprescindibles', 'Hemos reunido los contenidos y productos que más valoran quienes llevan tiempo con nosotros. Un buen punto de partida.', 'Ver la selección'),
    welcome3: mail('es', '¿Seguimos en contacto?', 'Dinos qué te interesa y te enviaremos solo eso', 'TU OPINIÓN', '¿Te está resultando útil?', 'Queremos enviarte solo lo que de verdad te interesa. Puedes elegir los temas que prefieres desde el enlace de preferencias al pie de este email.', 'Elegir mis temas'),
    cart1: mail('es', 'Te has dejado algo en el carrito', 'Lo guardamos para ti unas horas más', 'TU CARRITO', '¿Terminamos tu pedido?', 'Hola {{name | ""}}, vimos que dejaste productos en tu carrito. Los hemos reservado para que puedas completar la compra cuando quieras.', 'Volver al carrito'),
    cart2: mail('es', 'Un 10% para terminar tu pedido', 'Solo durante 48 horas', 'ÚLTIMA OPORTUNIDAD', 'Tu descuento te espera', 'Para ponértelo fácil, aquí tienes un 10% de descuento en tu pedido. Válido 48 horas.', 'Usar mi descuento', [
      { id: 'coupon', fields: { badge: 'CUPÓN', title: '10% de descuento', subtitle: 'Introdúcelo al pagar', code: 'VUELVE10' } },
    ]),
    post1: mail('es', '¿Qué tal tu compra, {{name | ""}}?', 'Tu opinión nos ayuda a mejorar', 'GRACIAS', '¿Todo bien con tu pedido?', 'Esperamos que estés disfrutando de tu compra. Si tienes cualquier duda sobre su uso, responde a este email y te ayudamos.', 'Ver consejos de uso'),
    post2: mail('es', '¿Nos dejas tu opinión?', 'Solo te llevará un minuto', 'TU OPINIÓN', 'Cuéntanos tu experiencia', 'Tu reseña ayuda a otros clientes a decidir y a nosotros a mejorar. ¡Gracias por dedicarnos un minuto!', 'Dejar mi opinión'),
    reeng1: mail('es', 'Te echamos de menos', 'Hemos preparado algo especial para ti', 'HACE TIEMPO', '¿Seguimos juntos?', 'Hace tiempo que no sabemos de ti. Nos encantaría seguir enviándote novedades, pero solo si te interesan.', 'Sí, quiero seguir'),
    reeng2: mail('es', '¿Te damos de baja?', 'Último email si no te interesa', 'ÚLTIMO AVISO', 'No queremos molestarte', 'Si ya no quieres recibir nuestros emails, no tienes que hacer nada: dejaremos de escribirte. Si quieres seguir, haz clic abajo.', 'Quiero seguir recibiéndolos'),
    anniv: mail('es', '¡Feliz aniversario, {{name | ""}}!', 'Un año juntos — y un regalo para celebrarlo', 'ANIVERSARIO', 'Gracias por este año', 'Hoy hace un año que te uniste. Para celebrarlo, aquí tienes un pequeño regalo.', 'Ver mi regalo'),
  },
  en: {
    welcome1: mail('en', 'Welcome, {{name | "friend"}}!', "Here's what you'll get from now on", 'WELCOME', 'Thanks for joining', 'Hi {{name | ""}},<br><br>We are glad to have you here. Every week we will send practical ideas, news and, now and then, subscriber-only perks.<br><br>If you ever want to tell us something, just reply: we read everything.', 'Get to know us'),
    welcome2: mail('en', 'The best place to start', 'A selection of our readers’ favourites', 'GETTING STARTED', 'Our essentials', 'We gathered the content and products our long-time readers value most. A great starting point.', 'See the selection'),
    welcome3: mail('en', 'Shall we stay in touch?', 'Tell us what you like and we will send only that', 'YOUR OPINION', 'Is this useful to you?', 'We only want to send what really interests you. Choose your topics from the preferences link at the bottom of this email.', 'Choose my topics'),
    cart1: mail('en', 'You left something in your cart', 'We saved it for you for a few more hours', 'YOUR CART', 'Shall we finish your order?', 'Hi {{name | ""}}, you left some items in your cart. We saved them so you can complete your purchase whenever you like.', 'Back to my cart'),
    cart2: mail('en', '10% off to finish your order', 'Only for 48 hours', 'LAST CHANCE', 'Your discount is waiting', 'To make it easy, here is 10% off your order. Valid for 48 hours.', 'Use my discount', [
      { id: 'coupon', fields: { badge: 'COUPON', title: '10% off', subtitle: 'Enter it at checkout', code: 'COMEBACK10' } },
    ]),
    post1: mail('en', 'How is your purchase, {{name | ""}}?', 'Your feedback helps us improve', 'THANK YOU', 'All good with your order?', 'We hope you are enjoying your purchase. If you have any question about using it, reply to this email and we will help.', 'See usage tips'),
    post2: mail('en', 'Would you leave us a review?', 'It only takes a minute', 'YOUR OPINION', 'Tell us about your experience', 'Your review helps other customers decide and helps us improve. Thanks for your minute!', 'Leave a review'),
    reeng1: mail('en', 'We miss you', 'We prepared something special for you', 'LONG TIME', 'Still with us?', 'We haven’t heard from you in a while. We would love to keep sending you news, but only if you want them.', 'Yes, keep me in'),
    reeng2: mail('en', 'Should we unsubscribe you?', 'Last email if you are not interested', 'LAST NOTICE', 'We don’t want to bother you', 'If you no longer want our emails, you don’t need to do anything: we will stop writing. If you want to stay, click below.', 'Keep sending them'),
    anniv: mail('en', 'Happy anniversary, {{name | ""}}!', 'One year together — and a gift to celebrate', 'ANNIVERSARY', 'Thanks for this year', 'You joined us one year ago today. To celebrate, here is a little gift.', 'See my gift'),
  },
}

export function automationTemplates(lang: string): AutomationTemplate[] {
  const c = COPY[lang === 'en' ? 'en' : 'es']
  return [
    {
      id: 'welcome',
      icon: 'hand',
      trigger: { type: 'subscribed', listId: null },
      steps: [
        { type: 'email', email: c.welcome1 },
        { type: 'wait', amount: 2, unit: 'days' },
        { type: 'email', email: c.welcome2 },
        { type: 'wait', amount: 3, unit: 'days' },
        {
          type: 'condition', condition: { kind: 'opened_last' },
          yes: [{ type: 'tag', action: 'add', tag: 'engaged' }],
          no: [{ type: 'email', email: c.welcome3 }],
        },
      ],
    },
    {
      id: 'cart',
      icon: 'cart',
      trigger: { type: 'api_event', event: 'cart.abandoned' },
      steps: [
        { type: 'wait', amount: 1, unit: 'hours' },
        { type: 'email', email: c.cart1 },
        { type: 'wait', amount: 1, unit: 'days' },
        { type: 'condition', condition: { kind: 'clicked_last' }, yes: [], no: [{ type: 'email', email: c.cart2 }] },
      ],
    },
    {
      id: 'post_purchase',
      icon: 'bag',
      trigger: { type: 'api_event', event: 'order.completed' },
      steps: [
        { type: 'tag', action: 'add', tag: 'customer' },
        { type: 'wait', amount: 3, unit: 'days' },
        { type: 'email', email: c.post1 },
        { type: 'wait', amount: 7, unit: 'days' },
        { type: 'email', email: c.post2 },
      ],
    },
    {
      id: 'reengagement',
      icon: 'heart',
      trigger: { type: 'manual' },
      steps: [
        { type: 'wait_until', weekdays: [2, 3, 4], hour: 10 },
        { type: 'email', email: c.reeng1 },
        { type: 'wait', amount: 4, unit: 'days' },
        {
          type: 'condition', condition: { kind: 'opened_last' },
          yes: [{ type: 'tag', action: 'remove', tag: 'dormant' }],
          no: [{ type: 'email', email: c.reeng2 }, { type: 'tag', action: 'add', tag: 'dormant' }],
        },
      ],
    },
    {
      id: 'anniversary',
      icon: 'cake',
      trigger: { type: 'date', field: 'created_at', offsetDays: 0 },
      steps: [
        { type: 'wait_until', weekdays: [], hour: 9 },
        { type: 'email', email: c.anniv },
      ],
    },
    { id: 'blank', icon: 'plus', trigger: { type: 'subscribed', listId: null }, steps: [] },
  ]
}
