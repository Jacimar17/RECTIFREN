/**
 * ============================================================
 * RECTIFREN — Configuración del Sitio Público
 * ============================================================
 * Centraliza la información de contacto, categorías, marcas y
 * configuración general para facilitar futuras ediciones sin tocar HTML.
 */

// TODO: Configurar datos de contacto reales de RECTIFREN
export const CONTACT_INFO = {
  telefono: "+54 9 11 0000-0000",       // Teléfono comercial
  whatsapp: "5491100000000",           // Número en formato internacional sin signos ni espacios para wa.me
  whatsappMensaje: "Hola RECTIFREN, quiero consultar por un repuesto:",
  direccion: "Av. Ejemplo 1234, Buenos Aires, Argentina", // Dirección del taller / local
  email: "ventas@rectifren.com.ar",    // Correo electrónico
  horarios: "Lunes a Viernes de 8:00 a 18:00 hs · Sábados de 8:30 a 12:30 hs",
  // Enlace directo para botón "Abrir en Maps"
  googleMapsUrl: "https://maps.google.com/?q=RECTIFREN",
  // URL embebida para el mapa del footer
  googleMapsEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d105072.19318854744!2d-58.53031086208573!3d-34.61574368940807!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95bccac630121623%3A0x53386f2ac6898197!2sBuenos%20Aires%2C%20Argentina!5e0!3m2!1ses!2sar!4v1700000000000!5m2!1ses!2sar"
};

/**
 * Categorías del catálogo de RECTIFREN
 * Podés agregar, quitar o editar elementos en este array.
 */
export const CATEGORIAS = [
  {
    id: "freno-a-disco",
    titulo: "Freno a disco",
    descripcion: "Pastillas, discos ventilados y sólidos, calipers y accesorios.",
    imagen: "assets/categorias/freno-disco.jpg",
    icono: "🛑"
  },
  {
    id: "campana-de-freno",
    titulo: "Campana de freno",
    descripcion: "Cintas, zapatas, campanas y rectificaciones de tambor.",
    imagen: "assets/categorias/campana-freno.jpg",
    icono: "🔘"
  },
  {
    id: "kit-de-embrague",
    titulo: "Kit de embrague",
    descripcion: "Placas, discos, crapodinas mecánicas e hidráulicas.",
    imagen: "assets/categorias/kit-embrague.jpg",
    icono: "⚙️"
  },
  {
    id: "sistema-hidraulico",
    titulo: "Sistema hidráulico",
    descripcion: "Bombas de freno, bombines de embrague y cilindros de rueda.",
    imagen: "assets/categorias/sistema-hidraulico.jpg",
    icono: "💧"
  },
  {
    id: "cables-freno-embrague",
    titulo: "Cables de freno y embrague",
    descripcion: "Cables de comando, freno de mano, acelerador y embrague.",
    imagen: "assets/categorias/cables.jpg",
    icono: "⛓️"
  },
  {
    id: "sistema-neumatico",
    titulo: "Sistema neumático",
    descripcion: "Válvulas, pulmones de freno y conexiones para línea pesada.",
    imagen: "assets/categorias/sistema-neumatico.jpg",
    icono: "💨"
  }
];

/**
 * Marcas comercializadas
 * Cada una busca su logo en assets/marcas/<slug>.png.
 * Si el archivo no existe, el carrusel muestra automáticamente el nombre en tipografía destacada.
 */
export const MARCAS = [
  { nombre: "Frasle", slug: "frasle" },
  { nombre: "Litton", slug: "litton" },
  { nombre: "Litton Ultra", slug: "litton-ultra" },
  { nombre: "Fri-ma", slug: "fri-ma" },
  { nombre: "LPR", slug: "lpr" },
  { nombre: "TRW", slug: "trw" },
  { nombre: "Wagner", slug: "wagner" },
  { nombre: "AF", slug: "af" },
  { nombre: "Fremec", slug: "fremec" },
  { nombre: "Braext", slug: "braext" },
  { nombre: "Imbasa", slug: "imbasa" },
  { nombre: "BRK-HQ", slug: "brk-hq" },
  { nombre: "Mazacamp", slug: "mazacamp" },
  { nombre: "Raybestos", slug: "raybestos" },
  { nombre: "IKE", slug: "ike" },
  { nombre: "Varga", slug: "varga" },
  { nombre: "Mazfren", slug: "mazfren" },
  { nombre: "Freno Silent", slug: "freno-silent" }
];

/**
 * Banners principales para el carrusel de inicio
 */
export const HERO_SLIDES = [
  {
    titulo: "Encontrá el repuesto que necesitás",
    bajada: "Especialistas en frenos, rectificaciones, embragues y sistemas hidráulicos con la mayor variedad y stock.",
    botonTexto: "Ver productos",
    botonUrl: "#productos",
    imagen: "assets/hero_slide_1.jpg",
    placeholderTema: "dark"
  },
  {
    titulo: "Repuestos y rectificaciones con respaldo",
    bajada: "Asesoramiento técnico especializado para talleres mecánicos, flotas y particulares.",
    botonTexto: "Consultar por WhatsApp",
    botonUrl: "#whatsapp",
    imagen: "assets/hero_slide_2.jpg",
    placeholderTema: "red"
  }
];

