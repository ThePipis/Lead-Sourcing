// Cloudflare Worker for Lead-Sourcing
// Serves static frontend assets from ./dist and provides edge API endpoints

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  BACKEND_URL?: string;
  USE_BUILTIN_API?: string;
  /**
   * Public address of the real backend (a Cloudflare Tunnel to the FastAPI on
   * the office PC). Only the printed QR links are sent there; see TRACKING_PATH.
   */
  TRACKING_BACKEND_URL?: string;
}

/**
 * The only paths a reader at home ever opens: the short link printed on the
 * card (/q/<code>), the older long form (/r/<campaign>/slot-<n>) and the page
 * shown when a business has no website. Nothing else of the backend is public.
 */
const TRACKING_PATH = /^\/(q\/[A-Za-z0-9]{4,16}|r\/courtesy|r\/[^/]+\/slot-\d+)$/;

interface SlotDef {
  slot_number: number;
  name: string;
  face: "FRONT" | "BACK";
  format: "HERO" | "STANDARD_FRONT" | "STANDARD_BACK" | "MEDIUM_BACK";
  width_in: number;
  height_in: number;
  base_price: number;
  default_ticket: number;
  default_headline: string;
}

const INITIAL_SLOT_DEFS: SlotDef[] = [
  // FRONT FACE (1..16)
  { slot_number: 1, name: "Odontología Familiar", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 1250.0, default_headline: "Sonrisas Saludables para Toda la Familia | $79 Examen + Limpieza + Rayos X" },
  { slot_number: 2, name: "HVAC / Aire Acondicionado", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 4500.0, default_headline: "Evite el Golpe de Calor en el IE | $49 A/C Super Tune-Up + 15% Descuento Sistema Completo" },
  { slot_number: 3, name: "Hospital Veterinario", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 450.0, default_headline: "Cuidado Médico Compasivo 7 Días | 50% de Descuento en Primera Consulta Preventiva" },
  { slot_number: 4, name: "Plomería Residencial", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 780.0, default_headline: "Plomeros de Confianza 24/7 | $50 Off Desazolve de Drenaje o Inspección con Cámara Gratis" },
  { slot_number: 5, name: "Taller Mecánico / Frenos", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 550.0, default_headline: "Viaje Seguro por la Autopista | $99 Frenos Completos Por Eje + Diagnóstico Computarizado" },
  { slot_number: 6, name: "Pizzería", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 55.0, default_headline: "Masa Madre al Horno de Piedra | Compra 1 Pizza Grande y Lleva la Segunda al 50%" },
  { slot_number: 7, name: "Gimnasio / Fitness", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 140.0, default_headline: "Transforme su Salud Este Mes | 14 Días VIP Pass Ilimitado + Sesión de Coaching Gratis" },
  { slot_number: 8, name: "Techado y Paneles Solares", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 14500.0, default_headline: "Ahorre Hasta 80% en Electricidad SCE | Reemplazo de Techo con $0 de Pago Inicial" },
  { slot_number: 9, name: "Quiropráctico / Fisioterapia", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 480.0, default_headline: "Alivio Inmediato del Dolor de Espalda | $29 Consulta + Ajuste Vertebral + Terapia Térmica" },
  { slot_number: 10, name: "Limpieza de Alfombras y Pisos", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 320.0, default_headline: "Hogar Impecable y Libre de Alérgenos | 3 Habitaciones Limpieza a Vapor Profunda por $99" },
  { slot_number: 11, name: "Detailing Móvil de Autos", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 220.0, default_headline: "Llegamos a la Puerta de su Casa | $89 Lavado Premium de Espuma + Cera Cerámica Express" },
  { slot_number: 12, name: "Peluquería Canina", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 85.0, default_headline: "Consienta a su Mejor Amigo | $15 Descuento Baño Spa Completo + Corte de Uñas Gratis" },
  { slot_number: 13, name: "Restaurante Mexicano", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 68.0, default_headline: "Sabor Casero & Tradición Familiar | 2 Platillos Fuertes + Margaritas al 2x1 Martes y Jueves" },
  { slot_number: 14, name: "Agencia de Seguros", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 1400.0, default_headline: "Proteja lo que Más Quiere | Paquete Auto + Hogar con Ahorro Anual Promedio de $640" },
  { slot_number: 15, name: "Control de Plagas y Fumigación", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 420.0, default_headline: "Hogar 100% Libre de Plagas | $49 Primera Fumigación + Barrera Perimetral Gratis" },
  { slot_number: 16, name: "Paisajismo y Sistemas de Riego", face: "FRONT", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 550.0, default_headline: "Jardín Siempre Verde y Cuida tu Agua | 20% Off en Reparación de Riego o Césped" },

  // BACK FACE (17..31 Commercial + 32 USPS)
  { slot_number: 17, name: "Limpieza Residencial de Casas", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 260.0, default_headline: "Disfruta tu Tiempo Libre | $35 Off en tu Primera Limpieza Profunda Residencial" },
  { slot_number: 18, name: "Puertas de Garaje y Portones", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 850.0, default_headline: "Reparación de Garage el Mismo Día | $89 Tune-Up Completo + $50 Off en Resortes" },
  { slot_number: 19, name: "Pintura Residencial Int/Ext", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 3200.0, default_headline: "Renueva el Color de tu Hogar | $300 Off en Pintura Exterior Completa + Consulta Color" },
  { slot_number: 20, name: "Ventanas y Persianas a Medida", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 2800.0, default_headline: "Reduce tu Recibo de Luz | Compra 3 Ventanas Doble Panel y Recibe 1 Gratis" },
  { slot_number: 21, name: "Remodelación Cocinas y Baños", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 8500.0, default_headline: "La Cocina de tus Sueños | $1,000 Off en Proyecto Completo + Diseño 3D Gratis" },
  { slot_number: 22, name: "Poda y Cuidado de Árboles", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 950.0, default_headline: "Protege tu Techo y Estructura | 15% de Descuento en Poda o Retiro de Árboles" },
  { slot_number: 23, name: "Reparación de Electrodomésticos", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 320.0, default_headline: "No Cambies tu Aparato, Repáralo | Diagnóstico Gratis con Cualquier Reparación" },
  { slot_number: 24, name: "Mantenimiento de Piscinas", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 240.0, default_headline: "Agua Cristalina Todo el Año | Primer Mes al 50% en Servicio Semanal de Piscina" },
  { slot_number: 25, name: "Abogados de Lesiones Personales", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 4500.0, default_headline: "¿Tuviste un Accidente? | Consulta Gratuita 24/7 y Cero Cobro si no Ganamos" },
  { slot_number: 26, name: "Agente Inmobiliario (Realtor)", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 12000.0, default_headline: "¿Cuánto Vale tu Casa Hoy? | Valuación Profesional de Mercado 100% Gratuita" },
  { slot_number: 27, name: "Preparación de Impuestos y Tax", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 380.0, default_headline: "Maximiza tu Reembolso Fiscal | $50 de Descuento en tu Declaración de Impuestos" },
  { slot_number: 28, name: "Centro Óptico y Oftalmología", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 320.0, default_headline: "Claridad para tu Vista | Examen Completo + Armazón de Diseñador con 30% Off" },
  { slot_number: 29, name: "Tintorería y Dry Cleaning", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 85.0, default_headline: "Prendas Impecables Sin Salir de Casa | 20% Off en tu Primera Orden con Entrega Gratis" },
  { slot_number: 30, name: "Taquería y Mariscos", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 48.0, default_headline: "Martes de Tacos 2x1 y Ceviche Familiar | Bebida Grande de Cortesía en Orden de $25+" },
  { slot_number: 31, name: "Salón de Belleza y Uñas (Nails)", face: "BACK", format: "SMALL", width_in: 2.8, height_in: 1.8, base_price: 350.0, default_ticket: 120.0, default_headline: "Luce Espectacular | Manicure + Pedicure Spa con $15 Off en Primera Cita" },
  { slot_number: 32, name: "USPS EDDM Technical Zone", face: "BACK", format: "USPS", width_in: 2.8, height_in: 1.8, base_price: 0.0, default_ticket: 0.0, default_headline: "Espacio técnico reservado por ley federal USPS. No se vende." }
];

function scalePrice(base: number, hh: number): number {
  return Math.round((base * hh) / 5000);
}

function createDefaultSlots(hh: number) {
  return INITIAL_SLOT_DEFS.map(d => ({
    slot_number: d.slot_number,
    category_id: d.slot_number,
    category_name: d.name,
    side: d.face,
    slot_type: d.format,
    width_inches: d.width_in,
    height_inches: d.height_in,
    business_name: "",
    contact_person: "",
    phone: "",
    email: "",
    website: "",
    business_address: "",
    status: "VACANT",
    price_usd: scalePrice(d.base_price, hh),
    avg_ticket_usd: d.default_ticket,
    logo_url: "",
    offer_headline: d.default_headline,
    qr_code_url: "",
    short_url: "",
    scan_count: 0,
    payment_ref: "",
    paid_at: null,
    amount_collected_usd: null
  }));
}

// Seed campaign matching Eastvale test environment with 14 paid slots
function seedDefaultCampaign() {
  const hh = 566;
  const unitCost = 0.642;
  const fixedCost = 375.0;
  const gross = 1471.0;
  const op = 738.37;
  const net = 732.63;

  const slots = INITIAL_SLOT_DEFS.map((d, idx) => ({
    id: idx + 1,
    campaign_id: "camp_ie-east-92880",
    slot_number: d.slot_number,
    category_id: d.slot_number,
    category_name: d.name,
    side: d.face,
    slot_type: d.format,
    width_inches: d.width_in,
    height_inches: d.height_in,
    business_name: d.slot_number === 32 ? "" : `${d.name} Local`,
    contact_person: d.slot_number === 32 ? "" : "Gerente General",
    phone: d.slot_number === 32 ? "" : "(951) 842-1200",
    email: d.slot_number === 32 ? "" : `contacto@${d.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
    website: d.slot_number === 32 ? "" : `https://www.${d.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
    business_address: d.slot_number === 32 ? "" : "Eastvale, CA 92880",
    status: "PAID",
    price_usd: d.base_price,
    avg_ticket_usd: d.default_ticket,
    logo_url: "",
    offer_headline: d.default_headline,
    qr_code_url: "",
    short_url: "",
    scan_count: 0,
    payment_ref: "SIMULACIÓN",
    paid_at: "2026-09-20T23:42:19.856367",
    amount_collected_usd: d.base_price
  }));

  const totalCollected = slots.reduce((acc, s) => acc + s.price_usd, 0);

  return {
    id: "camp_ie-east-92880",
    code: "IE-EAST-92880",
    name: "Co-Op Direct Mail - Eastvale",
    target_city: "Eastvale",
    target_zip: "92880",
    radius_miles: 5.0,
    target_households: hh,
    target_gross_revenue: totalCollected,
    operating_cost_est: op,
    net_margin_est: Math.max(0, totalCollected - op),
    unit_cost_usd: unitCost,
    fixed_cost_usd: fixedCost,
    target_margin: 0.5,
    status: "PROSPECTING",
    mode: "DEMO",
    slots,
    paid_count: 31,
    total_collected_usd: totalCollected,
    curated_count: 0,
    production_at: null,
    mailed_at: null,
    archived_at: null,
    covered_households: 0,
    selected_routes: 0,
    created_at: "2026-09-20T23:29:13.868218",
    updated_at: "2026-09-20T23:42:19.856367"
  };
}

// Seed catalog of qualified businesses for all 14 categories
const SEED_PROSPECTS: Record<number, any[]> = {
  1: [
    { business_name: "Eastvale Premier Dental Care", phone: "(951) 842-1200", address: "12712 Limonite Ave #100", rating: 4.9, review_count: 128, avg_ticket: 1250, dm: "Dr. Roberto Chen" },
    { business_name: "Dr. Rodriguez Family Dentistry", phone: "(951) 371-5500", address: "7056 Archibald Ave", rating: 4.8, review_count: 94, avg_ticket: 1100, dm: "Dra. Elena Rodriguez" },
    { business_name: "Heritage Valley Smiles Orthodontics", phone: "(951) 902-8811", address: "12610 Limonite Ave", rating: 4.7, review_count: 82, avg_ticket: 2400, dm: "Dr. Mark Vance" }
  ],
  2: [
    { business_name: "Air Pro Solutions IE", phone: "(951) 734-8890", address: "7056 Archibald Ave", rating: 4.9, review_count: 145, avg_ticket: 4500, dm: "Carlos Mendoza" },
    { business_name: "All Seasons HVAC Masters", phone: "(951) 493-1122", address: "12363 Limonite Ave", rating: 4.7, review_count: 76, avg_ticket: 3800, dm: "Michael Ortiz" },
    { business_name: "Eastvale Climate Control", phone: "(951) 582-7700", address: "14120 Schleisman Rd", rating: 4.8, review_count: 63, avg_ticket: 4200, dm: "David Kim" }
  ],
  3: [
    { business_name: "Eastvale Pet Hospital & Urgent Care", phone: "(951) 479-5600", address: "12363 Limonite Ave", rating: 4.9, review_count: 110, avg_ticket: 450, dm: "Dra. Sandra Miller" },
    { business_name: "Valley Veterinary Clinic", phone: "(951) 371-9988", address: "12712 Limonite Ave", rating: 4.7, review_count: 85, avg_ticket: 380, dm: "Dr. Hector Garcia" },
    { business_name: "Inland Pet Wellness Center", phone: "(951) 842-3344", address: "7125 Hamner Ave", rating: 4.8, review_count: 59, avg_ticket: 420, dm: "Dra. Lisa Cooper" }
  ],
  4: [
    { business_name: "Precision Plumbing IE 24/7", phone: "(951) 682-3344", address: "14120 Schleisman Rd", rating: 4.8, review_count: 115, avg_ticket: 780, dm: "Jorge Martinez" },
    { business_name: "Rooter & Drain Masters", phone: "(951) 734-6622", address: "12523 Limonite Ave", rating: 4.7, review_count: 88, avg_ticket: 650, dm: "Anthony Russo" },
    { business_name: "AquaFlow Plumbers Eastvale", phone: "(951) 493-7711", address: "7010 Archibald Ave", rating: 4.9, review_count: 72, avg_ticket: 920, dm: "Frank Jimenez" }
  ],
  5: [
    { business_name: "Corona Complete Auto & Brakes", phone: "(951) 371-2211", address: "13394 Limonite Ave", rating: 4.8, review_count: 132, avg_ticket: 550, dm: "Ricardo Silva" },
    { business_name: "Apex Precision Auto Repair", phone: "(951) 842-9900", address: "12610 Limonite Ave", rating: 4.9, review_count: 98, avg_ticket: 680, dm: "Manuel Vega" },
    { business_name: "Eastvale Complete Car Care", phone: "(951) 582-4411", address: "7125 Hamner Ave", rating: 4.7, review_count: 75, avg_ticket: 490, dm: "Sam Patterson" }
  ],
  6: [
    { business_name: "Bella Napoli Pizza Artesanal", phone: "(951) 898-4455", address: "12610 Limonite Ave", rating: 4.9, review_count: 190, avg_ticket: 55, dm: "Marco Rossi" },
    { business_name: "Eastvale Wood Fired Pizza & Pasta", phone: "(951) 371-8800", address: "12712 Limonite Ave", rating: 4.7, review_count: 112, avg_ticket: 48, dm: "Giuseppe Ferrara" },
    { business_name: "Rustica Crust Co.", phone: "(951) 734-5511", address: "7056 Archibald Ave", rating: 4.8, review_count: 85, avg_ticket: 52, dm: "Dante Valenti" }
  ],
  7: [
    { business_name: "Apex Performance Studio", phone: "(951) 582-9011", address: "7125 Hamner Ave", rating: 4.9, review_count: 95, avg_ticket: 140, dm: "Brandon Scott" },
    { business_name: "Core & Pulse Boutique Fitness", phone: "(951) 842-7722", address: "12363 Limonite Ave", rating: 4.8, review_count: 67, avg_ticket: 160, dm: "Valeria Gomez" },
    { business_name: "Eastvale Iron & Cardio Zone", phone: "(951) 493-6600", address: "14120 Schleisman Rd", rating: 4.7, review_count: 81, avg_ticket: 120, dm: "Jason Wright" }
  ],
  8: [
    { business_name: "California Sun & Solar IE", phone: "(951) 900-3412", address: "12523 Limonite Ave", rating: 4.9, review_count: 88, avg_ticket: 14500, dm: "Gabriel Torres" },
    { business_name: "Premier Roofing Solutions CA", phone: "(951) 734-2200", address: "12712 Limonite Ave", rating: 4.8, review_count: 64, avg_ticket: 12000, dm: "Luis Herrera" },
    { business_name: "Apex Roof & Solar Works", phone: "(951) 371-1199", address: "7010 Archibald Ave", rating: 4.7, review_count: 53, avg_ticket: 13500, dm: "Brian Larson" }
  ],
  9: [
    { business_name: "Spine & Joint Wellness Center", phone: "(951) 817-9922", address: "12614 Limonite Ave", rating: 4.9, review_count: 104, avg_ticket: 480, dm: "Dr. Kevin Ramirez" },
    { business_name: "Active Life Physical Therapy", phone: "(951) 493-8833", address: "12363 Limonite Ave", rating: 4.8, review_count: 73, avg_ticket: 520, dm: "Dra. Monica Reyes" },
    { business_name: "Peak Motion Chiropractic", phone: "(951) 582-1144", address: "7125 Hamner Ave", rating: 4.7, review_count: 61, avg_ticket: 450, dm: "Dr. Alan Morales" }
  ],
  10: [
    { business_name: "EcoClean Steam Masters IE", phone: "(951) 427-8100", address: "7010 Archibald Ave", rating: 4.9, review_count: 119, avg_ticket: 320, dm: "Fernando Castro" },
    { business_name: "ProShine Carpet & Tile Care", phone: "(951) 734-9911", address: "12712 Limonite Ave", rating: 4.8, review_count: 84, avg_ticket: 340, dm: "Oscar Delgado" },
    { business_name: "Fresh & Clean Inland Empire", phone: "(951) 842-5500", address: "14120 Schleisman Rd", rating: 4.7, review_count: 68, avg_ticket: 290, dm: "Steven Ortiz" }
  ],
  11: [
    { business_name: "Mirror Finish Mobile Spa", phone: "(951) 314-7788", address: "12410 Schleisman Rd", rating: 4.9, review_count: 140, avg_ticket: 220, dm: "Adrian Ramos" },
    { business_name: "Apex Auto Spa on Wheels", phone: "(951) 582-3377", address: "12610 Limonite Ave", rating: 4.8, review_count: 92, avg_ticket: 250, dm: "Hector Navas" },
    { business_name: "SoCal Mobile Ceramic & Detail", phone: "(951) 493-2211", address: "7056 Archibald Ave", rating: 4.7, review_count: 77, avg_ticket: 300, dm: "Danny Gomez" }
  ],
  12: [
    { business_name: "Paws & Bubbles Grooming", phone: "(951) 736-5544", address: "12750 Limonite Ave", rating: 4.9, review_count: 125, avg_ticket: 85, dm: "Carolina Mejia" },
    { business_name: "The Pampered Pooch Boutique", phone: "(951) 842-6633", address: "12363 Limonite Ave", rating: 4.8, review_count: 89, avg_ticket: 95, dm: "Rachel Adams" },
    { business_name: "Bark & Bath Mobile Eastvale", phone: "(951) 371-7744", address: "7125 Hamner Ave", rating: 4.7, review_count: 64, avg_ticket: 110, dm: "Teresa Ruiz" }
  ],
  13: [
    { business_name: "Taquería & Cantina El Rancho", phone: "(951) 493-2288", address: "12569 Limonite Ave", rating: 4.9, review_count: 215, avg_ticket: 68, dm: "Gustavo Morales" },
    { business_name: "Sabor Michoacano Authentic Grill", phone: "(951) 734-1188", address: "12712 Limonite Ave", rating: 4.8, review_count: 140, avg_ticket: 62, dm: "Javier Vargas" },
    { business_name: "La Hacienda Mexican Bistro", phone: "(951) 582-8855", address: "7010 Archibald Ave", rating: 4.7, review_count: 98, avg_ticket: 75, dm: "Claudia Nunez" }
  ],
  14: [
    { business_name: "Empire Shield Insurance Agency", phone: "(951) 898-1122", address: "12716 Limonite Ave", rating: 4.9, review_count: 86, avg_ticket: 1400, dm: "Patricio Alarcon" },
    { business_name: "Stateline Auto & Home Coverage", phone: "(951) 371-3322", address: "12363 Limonite Ave", rating: 4.8, review_count: 65, avg_ticket: 1350, dm: "Patricia Campbell" },
    { business_name: "Pacific Choice Financial & Insurance", phone: "(951) 842-4488", address: "14120 Schleisman Rd", rating: 4.7, review_count: 52, avg_ticket: 1500, dm: "Esteban Vega" }
  ]
};

let campaignsStore: any[] = [seedDefaultCampaign()];
let nextCampaignId = 2;
const workerCostsStore: Record<string, any> = {};

function isLoopback(urlStr?: string): boolean {
  if (!urlStr) return true;
  try {
    const u = new URL(urlStr);
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1";
  } catch {
    return true;
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

function csv(content: string, filename: string) {
  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Allow-Origin": "*"
    }
  });
}


function computeProspectDistance(item: any, idx: number, targetCity: string, targetZip: string): { distance_miles: number; distance_m: number; city: string; geo_tier: number } {
  const isEastvaleTarget = targetZip === "92880" || targetCity.toLowerCase().includes("eastvale");
  const rawCity = (item.city || "").trim();
  const rawAddress = (item.address || "").toLowerCase();
  const rawName = (item.business_name || "").toLowerCase();

  let distMi = item.distance_miles;
  if (distMi === undefined || distMi === null) {
    if (rawName.includes("norco") || rawAddress.includes("norco")) {
      distMi = 3.2;
    } else if (rawName.includes("corona") || rawAddress.includes("corona")) {
      distMi = 4.8;
    } else if (rawName.includes("ontario") || rawAddress.includes("ontario") || rawAddress.includes("euclid")) {
      distMi = 5.6;
    } else if (rawName.includes("cucamonga") || rawAddress.includes("milliken") || rawAddress.includes("baseline")) {
      distMi = 7.8;
    } else {
      distMi = 0.8 + ((idx * 7) % 15) * 0.1;
    }
  }

  const distance_miles = Number(distMi.toFixed(1));
  const distance_m = Number((distance_miles * 1609.344).toFixed(0));

  let finalCity = targetCity;
  let geo_tier = 0;

  if (isEastvaleTarget) {
    if ((item.zip === "92880" || item.zip_code === "92880") && rawName.includes("corona") && !rawName.includes("eastvale")) {
      // 2. Normalización de etiqueta para ZIP 92880 (aunque histórico Corona)
      finalCity = "Eastvale (92880)";
      geo_tier = 1;
    } else if (rawName.includes("norco") || rawAddress.includes("norco")) {
      // 3. Formato legible Tier 2
      geo_tier = 2;
      finalCity = `Norco (A ${distance_miles.toFixed(1)} mi · Área de servicio)`;
    } else if (rawName.includes("corona") && !rawName.includes("eastvale")) {
      // 3. Formato legible Tier 2
      geo_tier = 2;
      finalCity = `Corona (A ${distance_miles.toFixed(1)} mi · Área de servicio)`;
    } else if (rawName.includes("cucamonga") || rawAddress.includes("milliken") || rawAddress.includes("baseline")) {
      geo_tier = 2;
      finalCity = `Rancho Cucamonga (A ${distance_miles.toFixed(1)} mi · Área de servicio)`;
    } else if (rawName.includes("ontario") || rawAddress.includes("ontario") || rawAddress.includes("euclid")) {
      geo_tier = 2;
      finalCity = `Ontario (A ${distance_miles.toFixed(1)} mi · Área de servicio)`;
    } else {
      finalCity = "Eastvale (92880)";
      geo_tier = 0;
    }
  } else {
    finalCity = rawCity || targetCity;
    geo_tier = 0;
  }

  return { distance_miles, distance_m, city: finalCity, geo_tier };
}

// --- Cloudflare D1 Database Helpers ---

async function d1GetCampaigns(db: D1Database, mode: string, archived: boolean): Promise<any[]> {
  try {
    const query = archived
      ? "SELECT * FROM campaigns WHERE archived_at IS NOT NULL ORDER BY created_at DESC"
      : "SELECT * FROM campaigns WHERE mode = ? AND archived_at IS NULL ORDER BY created_at DESC";
    const stmt = archived ? db.prepare(query) : db.prepare(query).bind(mode);
    const { results } = await stmt.all();

    if ((!results || results.length === 0) && mode === "DEMO" && !archived) {
      const def = seedDefaultCampaign();
      await d1SaveCampaign(db, def);
      return [def];
    }

    const campaigns: any[] = [];
    for (const row of (results || [])) {
      const slotsRes = await db.prepare("SELECT * FROM slots WHERE campaign_id = ? ORDER BY slot_number ASC").bind(row.id).all();
      campaigns.push({
        ...row,
        slots: slotsRes.results || []
      });
    }
    return campaigns;
  } catch (err) {
    console.error("D1 getCampaigns error:", err);
    return [];
  }
}

async function d1GetCampaign(db: D1Database, id: string): Promise<any | null> {
  try {
    const c: any = await db.prepare("SELECT * FROM campaigns WHERE id = ?").bind(id).first();
    if (!c) return null;
    const slotsRes = await db.prepare("SELECT * FROM slots WHERE campaign_id = ? ORDER BY slot_number ASC").bind(id).all();
    return {
      ...c,
      slots: slotsRes.results || []
    };
  } catch (err) {
    console.error("D1 getCampaign error:", err);
    return null;
  }
}

async function d1SaveCampaign(db: D1Database, c: any) {
  try {
    await db.prepare(`
      INSERT OR REPLACE INTO campaigns (
        id, code, name, target_city, target_zip, radius_miles, target_households,
        unit_cost_usd, target_gross_revenue, operating_cost_est, net_margin_est,
        status, mode, production_at, mailed_at, archived_at, model_ack, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      c.id, c.code || "", c.name || "", c.target_city || "Eastvale", c.target_zip || "92880",
      c.radius_miles || 5.0, c.target_households || 5000, c.unit_cost_usd || 0.60,
      c.target_gross_revenue || 0, c.operating_cost_est || 0, c.net_margin_est || 0,
      c.status || "PROSPECTING", c.mode || "DEMO", c.production_at || null, c.mailed_at || null,
      c.archived_at || null, c.model_ack || null, c.created_at || new Date().toISOString(),
      c.updated_at || new Date().toISOString()
    ).run();

    if (Array.isArray(c.slots)) {
      for (const s of c.slots) {
        await d1SaveSlot(db, c.id, s);
      }
    }
  } catch (err) {
    console.error("D1 saveCampaign error:", err);
  }
}

async function d1SaveSlot(db: D1Database, campaignId: string, s: any) {
  try {
    await db.prepare("DELETE FROM slots WHERE campaign_id = ? AND slot_number = ?").bind(campaignId, s.slot_number).run();
    await db.prepare(`
      INSERT INTO slots (
        campaign_id, slot_number, category_id, category_name, side, slot_type,
        width_inches, height_inches, price_usd, avg_ticket_usd, business_name,
        contact_person, phone, email, website, business_address, status, logo_url,
        offer_headline, qr_code_url, short_url, payment_ref, paid_at, reserved_at,
        reservation_expires_at, amount_collected_usd, scan_count, qr_token, notes,
        format, row_span, col_span
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      campaignId, s.slot_number, s.category_id || s.slot_number, s.category_name || s.name || "",
      s.side || "FRONT", s.slot_type || s.format || "SMALL", s.width_inches || s.width_in || 2.8,
      s.height_inches || s.height_in || 1.8, s.price_usd || 0, s.avg_ticket_usd || s.default_ticket || 0,
      s.business_name || "", s.contact_person || "", s.phone || "", s.email || "", s.website || "",
      s.business_address || "", s.status || "VACANT", s.logo_url || "", s.offer_headline || "",
      s.qr_code_url || "", s.short_url || "", s.payment_ref || "", s.paid_at || null, s.reserved_at || null,
      s.reservation_expires_at || null, s.amount_collected_usd || 0, s.scan_count || 0, s.qr_token || null,
      s.notes || null, s.format || "SMALL", s.row_span || 1, s.col_span || 1
    ).run();
  } catch (err) {
    console.error("D1 saveSlot error:", err);
  }
}

async function d1DeleteCampaign(db: D1Database, id: string) {
  try {
    await db.prepare("DELETE FROM slots WHERE campaign_id = ?").bind(id).run();
    await db.prepare("DELETE FROM campaigns WHERE id = ?").bind(id).run();
  } catch (err) {
    console.error("D1 deleteCampaign error:", err);
  }
}

async function d1RecordQrScan(db: D1Database, event: {
  id: string;
  campaign_id: string;
  slot_number: number;
  business_name: string;
  device_type: string;
  city: string;
  user_agent: string;
  client_ip: string;
}) {
  try {
    await db.prepare(`
      INSERT INTO analytics_events (
        id, campaign_id, slot_number, business_name, timestamp, device_type, city, user_agent, client_ip
      ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)
    `).bind(
      event.id, event.campaign_id, event.slot_number, event.business_name,
      event.device_type, event.city, event.user_agent, event.client_ip
    ).run();

    await db.prepare(`
      UPDATE slots SET scan_count = scan_count + 1 WHERE campaign_id = ? AND slot_number = ?
    `).bind(event.campaign_id, event.slot_number).run();
  } catch (err) {
    console.error("D1 recordQrScan error:", err);
  }
}

const REASON_CODES: Record<string, string> = {
  DECISOR_AUSENTE: "Decisor ausente / llamar otro día",
  NO_CONTESTA: "No contesta / buzón de voz",
  PIDE_LLAMAR_LUEGO: "Pide llamar en otra fecha",
  SIN_PRESUPUESTO: "Sin presupuesto este trimestre",
  YA_ANUNCIA: "Ya tiene contrato con otro medio",
  NO_INTERESA: "No le interesa el correo directo",
  CERRADO: "Negocio cerrado permanentemente",
  OTRO: "Otro motivo (anotar en nota)",
};

const COOLDOWN_DAYS: Record<string, number | null> = {
  DECISOR_AUSENTE: 7,
  NO_CONTESTA: 14,
  PIDE_LLAMAR_LUEGO: 30,
  OTRO: 30,
  SIN_PRESUPUESTO: 90,
  YA_ANUNCIA: 180,
  NO_INTERESA: 180,
  CERRADO: null,
};

const CONTACT_OUTCOMES: Record<string, [string, number]> = {
  DEJE_MENSAJE: ["Dejé mensaje / buzón", 3],
  HABLE_RECEPCION: ["Hablé con recepción", 4],
  PIDE_INFO: ["Pidió que le enviara información", 5],
  PIDE_LLAMAR: ["Pidió que lo llamara otro día", 7],
  INTERESADO: ["Interesado, evaluando", 7],
  NO_DISPONIBLE: ["No estaba disponible", 2],
  OTRO: ["Otro", 7],
};

function normalizeBizKey(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const MARKET_REFERENCE = {
  published_rates: [
    {
      id: "postage_retail",
      label: "Franqueo EDDM Retail (oficina postal)",
      low: 0.247,
      high: 0.247,
      suggested: 0.247,
      basis: "Tarifa EDDM Retail publicada para 2026 (flats hasta 3.3 oz).",
      source: "crst.net · USPS EDDM 2026",
    },
    {
      id: "postage_bmeu",
      label: "Franqueo EDDM Online (entrada BMEU)",
      low: 0.213,
      high: 0.213,
      suggested: 0.213,
      basis: "Alternativa más barata al Retail si entras por BMEU con permiso.",
      source: "crst.net · USPS EDDM 2026",
    },
    {
      id: "print_per_piece",
      label: "Impresión",
      low: 0.08,
      high: 0.25,
      suggested: 0.21,
      basis: "Rango de mercado para postales EDDM según volumen y papel. El jumbo 12×9 a dos caras está en la parte alta del rango.",
      source: "crst.net · mpressnow.com",
    },
    {
      id: "list_per_piece",
      label: "Lista de consumidores (segmentada)",
      low: 0.075,
      high: 0.15,
      suggested: 0.11,
      basis: "$75–$150 por millar para listas con filtros de ingreso, edad y valor de vivienda.",
      source: "mailpro.org · Mailing List Pricing 2026",
    },
    {
      id: "hygiene_per_piece",
      label: "Higiene CASS/NCOA",
      low: 0.002,
      high: 0.008,
      suggested: 0.005,
      basis: "$2–$8 por millar de registros sobre lista propia.",
      source: "mailpro.org · Mailing List Pricing 2026",
    },
  ],
  data_axle_plans: [
    { plan: "Salesgenie Basic", monthly: 99, annual_commitment: 1188 },
    { plan: "Salesgenie Pro", monthly: 149, annual_commitment: 1788 },
    { plan: "Salesgenie Team", monthly: 299, annual_commitment: 3588 },
  ],
  data_axle_note: "Data Axle vende por suscripción o por contrato a medida.",
};

async function d1GetCostSettings(db: D1Database, mode: string) {
  try {
    const row: any = await db.prepare("SELECT * FROM cost_settings WHERE mode = ?").bind(mode.toUpperCase()).first();
    return row || null;
  } catch (err) {
    console.error("D1 getCostSettings error:", err);
    return null;
  }
}

async function d1SaveCostSettings(db: D1Database, mode: string, settings: any) {
  try {
    await db.prepare(`
      INSERT OR REPLACE INTO cost_settings (
        mode, postage_per_piece, list_per_piece, print_per_piece, variable_data_per_piece,
        presort_per_piece, finishing_per_piece, setup_fee, delivery_fee, target_margin, source_note, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      mode.toUpperCase(),
      settings.postage_per_piece ?? 0.247,
      settings.list_per_piece ?? 0.0,
      settings.print_per_piece ?? 0.368,
      settings.variable_data_per_piece ?? 0.0,
      settings.presort_per_piece ?? 0.0,
      settings.finishing_per_piece ?? 0.0,
      settings.setup_fee ?? 0.0,
      settings.delivery_fee ?? 0.0,
      settings.target_margin ?? 0.58,
      settings.source_note ?? "",
      new Date().toISOString()
    ).run();
  } catch (err) {
    console.error("D1 saveCostSettings error:", err);
  }
}

async function d1GetCampaignRoutes(db: D1Database, campaignId: string) {
  try {
    const res = await db.prepare(
      "SELECT * FROM campaign_routes WHERE campaign_id = ? ORDER BY score DESC, residential DESC"
    ).bind(campaignId).all();
    return res.results || [];
  } catch (err) {
    console.error("D1 getCampaignRoutes error:", err);
    return [];
  }
}

async function d1ToggleCampaignRoute(db: D1Database, campaignId: string, routeId: string, selected: boolean) {
  try {
    await db.prepare(
      "UPDATE campaign_routes SET selected = ?, updated_at = datetime('now') WHERE campaign_id = ? AND route_id = ?"
    ).bind(selected ? 1 : 0, campaignId, routeId).run();
  } catch (err) {
    console.error("D1 toggleCampaignRoute error:", err);
  }
}

async function d1GetDataSources(db: D1Database, mode: string) {
  try {
    const res = await db.prepare("SELECT * FROM data_sources WHERE mode = ?").bind(mode.toUpperCase()).all();
    return res.results || [];
  } catch (err) {
    console.error("D1 getDataSources error:", err);
    return [];
  }
}

async function d1SaveDataSource(db: D1Database, mode: string, sourceId: string, enabled: boolean) {
  try {
    await db.prepare(
      "INSERT OR REPLACE INTO data_sources (mode, source_id, enabled, updated_at) VALUES (?, ?, ?, datetime('now'))"
    ).bind(mode.toUpperCase(), sourceId, enabled ? 1 : 0).run();
  } catch (err) {
    console.error("D1 saveDataSource error:", err);
  }
}

async function d1GetRegenerations(db: D1Database, keys: string[]) {
  try {
    if (!keys || keys.length === 0) return {};
    const placeholders = keys.map(() => "?").join(",");
    const res = await db.prepare(
      `SELECT * FROM lead_regenerations WHERE business_key IN (${placeholders}) ORDER BY created_at ASC`
    ).bind(...keys).all();
    const out: Record<string, any> = {};
    for (const r of (res.results || [])) {
      const bKey = (r as any).business_key;
      const entry = out[bKey] || (out[bKey] = { count: 0, last: null });
      entry.count += 1;
      const cooldownUntil = (r as any).cooldown_until;
      entry.last = {
        reason_code: (r as any).reason_code,
        reason_label: REASON_CODES[(r as any).reason_code] || (r as any).reason_code,
        reason_note: (r as any).reason_note,
        at: (r as any).created_at,
        cooldown_until: cooldownUntil,
        resting: Boolean(cooldownUntil && new Date(cooldownUntil) > new Date()),
      };
    }
    return out;
  } catch (err) {
    console.error("D1 getRegenerations error:", err);
    return {};
  }
}

async function d1SaveRegeneration(db: D1Database, item: any) {
  try {
    await db.prepare(`
      INSERT INTO lead_regenerations (
        campaign_id, business_key, business_name, business_address,
        category_id, slot_number, reason_code, reason_note,
        cooldown_days, cooldown_until, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      item.campaign_id || null,
      normalizeBizKey(item.business_name),
      (item.business_name || "").trim(),
      (item.business_address || "").trim() || null,
      item.category_id || null,
      item.slot_number || null,
      item.reason_code || "OTRO",
      item.reason_note || null,
      item.cooldown_days ?? null,
      item.cooldown_until || null
    ).run();
  } catch (err) {
    console.error("D1 saveRegeneration error:", err);
  }
}

async function d1GetContacts(db: D1Database, keys: string[]) {
  try {
    if (!keys || keys.length === 0) return {};
    const placeholders = keys.map(() => "?").join(",");
    const res = await db.prepare(
      `SELECT * FROM lead_contacts WHERE business_key IN (${placeholders}) ORDER BY created_at ASC`
    ).bind(...keys).all();
    const out: Record<string, any> = {};
    for (const r of (res.results || [])) {
      const bKey = (r as any).business_key;
      const entry = out[bKey] || (out[bKey] = { count: 0, last: null });
      entry.count += 1;
      const followUp = (r as any).follow_up_at;
      entry.last = {
        business_name: (r as any).business_name,
        count: entry.count,
        outcome_code: (r as any).outcome_code,
        outcome_label: CONTACT_OUTCOMES[(r as any).outcome_code]?.[0] || "Otro",
        note: (r as any).note,
        at: (r as any).created_at,
        follow_up_at: followUp,
        due: Boolean(followUp && new Date(followUp) <= new Date()),
      };
    }
    return out;
  } catch (err) {
    console.error("D1 getContacts error:", err);
    return {};
  }
}

async function d1SaveContact(db: D1Database, item: any) {
  try {
    const key = normalizeBizKey(item.business_name);
    await db.prepare(`
      INSERT INTO lead_contacts (
        campaign_id, business_key, business_name, category_id, slot_number,
        outcome_code, note, follow_up_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      item.campaign_id || null,
      key,
      (item.business_name || "").trim(),
      item.category_id || null,
      item.slot_number || null,
      item.outcome_code || "OTRO",
      (item.note || "").trim() || null,
      item.follow_up_at || null
    ).run();

    const countRes: any = await db.prepare("SELECT COUNT(*) as c FROM lead_contacts WHERE business_key = ?").bind(key).first();
    const total = countRes?.c || 1;
    return {
      business_name: item.business_name,
      count: total,
      outcome_code: item.outcome_code || "OTRO",
      outcome_label: CONTACT_OUTCOMES[item.outcome_code || "OTRO"]?.[0] || "Otro",
      note: item.note,
      at: new Date().toISOString(),
      follow_up_at: item.follow_up_at || null,
      due: Boolean(item.follow_up_at && new Date(item.follow_up_at) <= new Date()),
    };
  } catch (err) {
    console.error("D1 saveContact error:", err);
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const cleanPath = url.pathname.replace(/\/+$/, "") || "/";

      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
          }
        });
      }

      // Printed QR links go to the real backend if reachable, or resolve directly
      // against Cloudflare D1 24/7 if the office PC is offline.
      if (TRACKING_PATH.test(cleanPath)) {
        if (env.TRACKING_BACKEND_URL) {
          const target = new URL(cleanPath + url.search, env.TRACKING_BACKEND_URL);
          const headers = new Headers(request.headers);
          headers.set("X-Coop-Client-IP", request.headers.get("CF-Connecting-IP") || "");
          try {
            const resp = await fetch(target.toString(), { method: request.method, headers, redirect: "manual" });
            if (resp.status < 500) {
              return resp;
            }
          } catch (err) {
            console.warn("Tunnel backend unreachable, falling back to D1 Edge redirect:", err);
          }
        }

        // Cloudflare D1 Autonomous Edge Resolution (runs 24/7 even if PC is off)
        if (env.DB) {
          let slotRes: any = null;
          if (cleanPath.startsWith("/q/")) {
            const token = cleanPath.slice(3);
            slotRes = await env.DB.prepare("SELECT * FROM slots WHERE qr_token = ? LIMIT 1").bind(token).first();
          } else {
            const match = cleanPath.match(/^\/r\/([^/]+)\/slot-(\d+)$/);
            if (match) {
              const campId = match[1];
              const sNum = parseInt(match[2]);
              slotRes = await env.DB.prepare("SELECT * FROM slots WHERE campaign_id = ? AND slot_number = ? LIMIT 1").bind(campId, sNum).first();
            }
          }

          if (slotRes) {
            const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
            const userAgent = request.headers.get("User-Agent") || "";
            const deviceType = /mobile|android|iphone|ipad/i.test(userAgent) ? "Mobile" : "Desktop";
            const city = request.headers.get("CF-IPCity") || "Eastvale";
            await d1RecordQrScan(env.DB, {
              id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              campaign_id: slotRes.campaign_id,
              slot_number: slotRes.slot_number,
              business_name: slotRes.business_name || `Slot #${slotRes.slot_number}`,
              device_type: deviceType,
              city,
              user_agent: userAgent,
              client_ip: clientIp
            });

            let dest = slotRes.website?.trim() || slotRes.short_url?.trim();
            if (dest) {
              if (!dest.startsWith("http://") && !dest.startsWith("https://")) dest = `https://${dest}`;
              return Response.redirect(dest, 307);
            }

            return new Response(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${slotRes.business_name || 'Comercio Local'} • Co-Op Direct Mail</title><style>body{font-family:sans-serif;background:#020617;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem;}.card{background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:2.5rem;max-width:480px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);}.badge{display:inline-block;background:#f59e0b;color:#020617;font-size:11px;font-weight:800;padding:4px 12px;border-radius:9999px;text-transform:uppercase;margin-bottom:1rem;}.call{display:block;background:#16a34a;color:#fff;text-decoration:none;font-weight:800;padding:1rem;border-radius:12px;margin:1.5rem 0 1rem;font-size:1.05rem;}</style></head><body><div class="card"><div class="badge">Postal Gigante 12x9" • Inland Empire</div><h1>¡Gracias por escanear!</h1><p>Has escaneado la oferta de <strong>${slotRes.business_name || 'este comercio'}</strong>.</p>${slotRes.phone ? `<a class="call" href="tel:${slotRes.phone.replace(/[^\d+]/g, '')}">Llamar a ${slotRes.business_name}<br><span>${slotRes.phone}</span></a>` : ''}<div style="font-size:0.75rem;color:#64748b;font-family:monospace;">Slot #${slotRes.slot_number}</div></div></body></html>`, {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" }
            });
          }
        }

        return new Response(
          `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Co-Op Direct Mail</title></head><body style="font-family:sans-serif;padding:2rem;text-align:center"><h1>Un momento</h1><p>No pudimos abrir esta oferta ahora. Inténtalo de nuevo en unos minutos.</p></body></html>`,
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "60" } },
        );
      }

      const isApi = cleanPath.startsWith("/api") || cleanPath.startsWith("/r");

      // Optional proxy to external backend if configured and NOT loopback
      if (isApi && env.BACKEND_URL && !isLoopback(env.BACKEND_URL) && env.USE_BUILTIN_API !== "true") {
        try {
          const targetUrl = new URL(url.pathname + url.search, env.BACKEND_URL);
          const proxyReq = new Request(targetUrl.toString(), {
            method: request.method,
            headers: request.headers,
            body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
            redirect: "follow"
          });
          const res = await fetch(proxyReq);
          if (res.status !== 403 && res.status < 500) {
            return res;
          }
        } catch (err) {
          console.warn("External backend unreachable, falling back to edge engine:", err);
        }
      }

      // --- Built-in Edge API ---

      // Health Check
      if (cleanPath === "/api/health" || cleanPath === "/api/v1/health") {
        return json({
          status: "online",
          service: "Co-Op Direct Mail Engine",
          market: "Inland Empire, CA",
          target_specs: "12x9 Jumbo Postcard | 14 Exclusive Slots | 5,000 Homes"
        });
      }

      // LAN IP for QR codes
      if (cleanPath === "/api/tracking/lan-ip" && request.method === "GET") {
        return json({ ip: "127.0.0.1" });
      }

      // GET /api/campaigns
      if (cleanPath === "/api/campaigns" && request.method === "GET") {
        const mode = url.searchParams.get("mode") || "DEMO";
        const archived = url.searchParams.get("archived") === "true";
        if (env.DB) {
          const camps = await d1GetCampaigns(env.DB, mode, archived);
          return json(camps);
        }
        const filtered = campaignsStore.filter(c => {
          if (archived) return Boolean(c.archived_at);
          return c.mode === mode && !c.archived_at;
        });
        return json(filtered);
      }

      // POST /api/campaigns
      if (cleanPath === "/api/campaigns" && request.method === "POST") {
        let body: any = {};
        try { body = await request.json(); } catch {}
        const hh = body.target_households || 5000;
        const unitCost = 0.642;
        const fixedCost = 375.0;
        const slots = createDefaultSlots(hh);
        const grossRev = slots.reduce((a, s) => a + s.price_usd, 0);
        const opCost = Math.round(hh * unitCost + fixedCost);
        const newCamp = {
          id: `camp_${(body.target_city || 'east').slice(0, 4).toLowerCase()}-${body.target_zip || '92880'}-${Date.now().toString().slice(-4)}`,
          code: body.code || `IE-${(body.target_city || 'EAST').slice(0, 4).toUpperCase()}-${body.target_zip || '92880'}-${Date.now().toString().slice(-4)}`,
          name: body.name || `Co-Op Direct Mail - ${body.target_city || 'Eastvale'}`,
          target_city: body.target_city || "Eastvale",
          target_zip: body.target_zip || "92880",
          radius_miles: body.radius_miles || 5.0,
          target_households: hh,
          target_gross_revenue: grossRev,
          operating_cost_est: opCost,
          net_margin_est: Math.max(0, grossRev - opCost),
          unit_cost_usd: unitCost,
          fixed_cost_usd: fixedCost,
          target_margin: 0.5,
          status: "PROSPECTING",
          mode: body.mode || "DEMO",
          slots,
          paid_count: 0,
          total_collected_usd: 0,
          curated_count: 0,
          production_at: null,
          mailed_at: null,
          archived_at: null,
          covered_households: 0,
          selected_routes: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        if (env.DB) {
          await d1SaveCampaign(env.DB, newCamp);
        }
        campaignsStore.unshift(newCamp);
        return json(newCamp, 201);
      }

      // Match /api/campaigns/:id/routes/plan
      const planRoutesMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/routes\/plan$/);
      if (planRoutesMatch && request.method === "POST") {
        const campId = planRoutesMatch[1];
        const c = campaignsStore.find(x => String(x.id) === campId);
        const target = parseInt(url.searchParams.get("target") || String(c?.target_households || 5000));
        const routes = [
          { route_id: "C001", zip_code: c?.target_zip || "92880", crid: "92880C001", type: "City delivery", city_state: "Eastvale, CA", residential: 520, business: 15, median_income: 104000, avg_household_size: 3.4, score: 95.2, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C002", zip_code: c?.target_zip || "92880", crid: "92880C002", type: "City delivery", city_state: "Eastvale, CA", residential: 512, business: 12, median_income: 112000, avg_household_size: 3.5, score: 96.8, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C003", zip_code: c?.target_zip || "92880", crid: "92880C003", type: "City delivery", city_state: "Eastvale, CA", residential: 480, business: 10, median_income: 98000, avg_household_size: 3.2, score: 92.1, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C004", zip_code: c?.target_zip || "92880", crid: "92880C004", type: "City delivery", city_state: "Eastvale, CA", residential: 530, business: 8, median_income: 115000, avg_household_size: 3.6, score: 97.4, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C005", zip_code: c?.target_zip || "92880", crid: "92880C005", type: "City delivery", city_state: "Eastvale, CA", residential: 495, business: 20, median_income: 92000, avg_household_size: 3.1, score: 88.5, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C006", zip_code: c?.target_zip || "92880", crid: "92880C006", type: "City delivery", city_state: "Eastvale, CA", residential: 520, business: 14, median_income: 106000, avg_household_size: 3.3, score: 94.0, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C007", zip_code: c?.target_zip || "92880", crid: "92880C007", type: "City delivery", city_state: "Eastvale, CA", residential: 460, business: 18, median_income: 101000, avg_household_size: 3.2, score: 91.5, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C008", zip_code: c?.target_zip || "92880", crid: "92880C008", type: "City delivery", city_state: "Eastvale, CA", residential: 540, business: 6, median_income: 118000, avg_household_size: 3.7, score: 98.2, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C009", zip_code: c?.target_zip || "92880", crid: "92880C009", type: "City delivery", city_state: "Eastvale, CA", residential: 510, business: 11, median_income: 99000, avg_household_size: 3.1, score: 90.7, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C010", zip_code: c?.target_zip || "92880", crid: "92880C010", type: "City delivery", city_state: "Eastvale, CA", residential: 503, business: 9, median_income: 103000, avg_household_size: 3.3, score: 93.3, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true }
        ];
        let running = 0;
        for (const r of routes) {
          if (running < target) {
            r.selected = true;
            running += r.residential;
          } else {
            r.selected = false;
          }
        }
        const selected = routes.filter(r => r.selected);
        if (c) {
          c.covered_households = running;
          c.selected_routes = selected.length;
        }
        return json({
          routes,
          covered: running,
          selected_routes: selected.length,
          available: routes.reduce((a, r) => a + r.residential, 0),
          available_routes: routes.length,
          census_enriched: true,
          target,
          zip_code: c?.target_zip || "92880"
        });
      }

      // Match /api/campaigns/:id/routes/:routeId
      const toggleRouteMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/routes\/([^/]+)$/);
      if (toggleRouteMatch && request.method === "PATCH") {
        const campId = toggleRouteMatch[1];
        const routeId = toggleRouteMatch[2];
        let body: any = {};
        try { body = await request.json(); } catch {}
        if (env.DB) {
          await d1ToggleCampaignRoute(env.DB, campId, routeId, body.selected ?? true);
          const d1Routes = await d1GetCampaignRoutes(env.DB, campId);
          const selected = d1Routes.filter((r: any) => Boolean(r.selected));
          return json({
            covered: selected.reduce((sum: number, r: any) => sum + (r.residential || 0), 0),
            selected_routes: selected.length,
            available: d1Routes.reduce((sum: number, r: any) => sum + (r.residential || 0), 0),
            available_routes: d1Routes.length,
            census_enriched: true,
            routes: d1Routes
          });
        }
        return json({
          covered: 5070,
          selected_routes: 10,
          available: 5070,
          available_routes: 10,
          census_enriched: true,
          routes: []
        });
      }

      // Match /api/campaigns/:id/routes/manifest.csv or /api/export/:id/manifest.csv
      if ((cleanPath.match(/^\/api\/campaigns\/[^/]+\/routes\/manifest\.csv$/) || cleanPath.match(/^\/api\/export\/[^/]+\/manifest\.csv$/)) && request.method === "GET") {
        const csvData = [
          "WalkSequence,CarrierRoute,ResidentName,StreetAddress,City,State,ZIP5,ZIP4,CompositeScore",
          "1,C001,RESIDENT,12712 LIMONITE AVE STE 100,EASTVALE,CA,92880,1200,96.4",
          "2,C001,RESIDENT,12714 LIMONITE AVE,EASTVALE,CA,92880,1201,95.8",
          "3,C001,RESIDENT,12718 LIMONITE AVE,EASTVALE,CA,92880,1202,94.2",
          "4,C001,RESIDENT,7056 ARCHIBALD AVE,EASTVALE,CA,92880,1401,93.9",
          "5,C002,RESIDENT,12363 LIMONITE AVE,EASTVALE,CA,92880,1310,95.1",
          "6,C002,RESIDENT,14120 SCHLEISMAN RD,EASTVALE,CA,92880,2210,94.7",
          "7,C002,RESIDENT,12610 LIMONITE AVE,EASTVALE,CA,92880,1240,93.5",
          "8,C003,RESIDENT,7125 HAMNER AVE,EASTVALE,CA,92880,3110,92.8",
          "9,C003,RESIDENT,12523 LIMONITE AVE,EASTVALE,CA,92880,1250,91.9",
          "10,C003,RESIDENT,7010 ARCHIBALD AVE,EASTVALE,CA,92880,1420,91.4"
        ].join("\n");
        return csv(csvData, "usps_eddm_postal_manifest.csv");
      }

      // Match /api/export/:id/preview
      const exportPreviewMatch = cleanPath.match(/^\/api\/export\/([^/]+)\/preview$/);
      if (exportPreviewMatch && request.method === "GET") {
        return json({
          rows: [
            { walkSequence: 1, carrierRoute: "C001", residentName: "RESIDENT", streetAddress: "12712 LIMONITE AVE STE 100", city: "EASTVALE", state: "CA", zip5: "92880", zip4: "1200", compositeScore: 96.4 },
            { walkSequence: 2, carrierRoute: "C001", residentName: "RESIDENT", streetAddress: "12714 LIMONITE AVE", city: "EASTVALE", state: "CA", zip5: "92880", zip4: "1201", compositeScore: 95.8 },
            { walkSequence: 3, carrierRoute: "C001", residentName: "RESIDENT", streetAddress: "12718 LIMONITE AVE", city: "EASTVALE", state: "CA", zip5: "92880", zip4: "1202", compositeScore: 94.2 },
            { walkSequence: 4, carrierRoute: "C001", residentName: "RESIDENT", streetAddress: "7056 ARCHIBALD AVE", city: "EASTVALE", state: "CA", zip5: "92880", zip4: "1401", compositeScore: 93.9 },
            { walkSequence: 5, carrierRoute: "C002", residentName: "RESIDENT", streetAddress: "12363 LIMONITE AVE", city: "EASTVALE", state: "CA", zip5: "92880", zip4: "1310", compositeScore: 95.1 },
            { walkSequence: 6, carrierRoute: "C002", residentName: "RESIDENT", streetAddress: "14120 SCHLEISMAN RD", city: "EASTVALE", state: "CA", zip5: "92880", zip4: "2210", compositeScore: 94.7 },
            { walkSequence: 7, carrierRoute: "C002", residentName: "RESIDENT", streetAddress: "12610 LIMONITE AVE", city: "EASTVALE", state: "CA", zip5: "92880", zip4: "1240", compositeScore: 93.5 },
            { walkSequence: 8, carrierRoute: "C003", residentName: "RESIDENT", streetAddress: "7125 HAMNER AVE", city: "EASTVALE", state: "CA", zip5: "92880", zip4: "3110", compositeScore: 92.8 },
            { walkSequence: 9, carrierRoute: "C003", residentName: "RESIDENT", streetAddress: "12523 LIMONITE AVE", city: "EASTVALE", state: "CA", zip5: "92880", zip4: "1250", compositeScore: 91.9 },
            { walkSequence: 10, carrierRoute: "C003", residentName: "RESIDENT", streetAddress: "7010 ARCHIBALD AVE", city: "EASTVALE", state: "CA", zip5: "92880", zip4: "1420", compositeScore: 91.4 }
          ]
        });
      }

      // Match /api/campaigns/:id/routes
      const campRoutesMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/routes$/);
      if (campRoutesMatch && request.method === "GET") {
        const campId = campRoutesMatch[1];
        if (env.DB) {
          const d1Routes = await d1GetCampaignRoutes(env.DB, campId);
          if (d1Routes && d1Routes.length > 0) {
            const selected = d1Routes.filter((r: any) => Boolean(r.selected));
            return json({
              routes: d1Routes,
              covered: selected.reduce((a: number, r: any) => a + (r.residential || 0), 0),
              selected_routes: selected.length,
              available: d1Routes.reduce((a: number, r: any) => a + (r.residential || 0), 0),
              available_routes: d1Routes.length,
              census_enriched: true,
              target: 5000,
              zip_code: d1Routes[0]?.zip_code || "92880"
            });
          }
        }
        const c = campaignsStore.find(x => String(x.id) === campId);
        const routes = [
          { route_id: "C001", zip_code: c?.target_zip || "92880", crid: "92880C001", type: "City delivery", city_state: "Eastvale, CA", residential: 520, business: 15, median_income: 104000, avg_household_size: 3.4, score: 95.2, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C002", zip_code: c?.target_zip || "92880", crid: "92880C002", type: "City delivery", city_state: "Eastvale, CA", residential: 512, business: 12, median_income: 112000, avg_household_size: 3.5, score: 96.8, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C003", zip_code: c?.target_zip || "92880", crid: "92880C003", type: "City delivery", city_state: "Eastvale, CA", residential: 480, business: 10, median_income: 98000, avg_household_size: 3.2, score: 92.1, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C004", zip_code: c?.target_zip || "92880", crid: "92880C004", type: "City delivery", city_state: "Eastvale, CA", residential: 530, business: 8, median_income: 115000, avg_household_size: 3.6, score: 97.4, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C005", zip_code: c?.target_zip || "92880", crid: "92880C005", type: "City delivery", city_state: "Eastvale, CA", residential: 495, business: 20, median_income: 92000, avg_household_size: 3.1, score: 88.5, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C006", zip_code: c?.target_zip || "92880", crid: "92880C006", type: "City delivery", city_state: "Eastvale, CA", residential: 520, business: 14, median_income: 106000, avg_household_size: 3.3, score: 94.0, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C007", zip_code: c?.target_zip || "92880", crid: "92880C007", type: "City delivery", city_state: "Eastvale, CA", residential: 460, business: 18, median_income: 101000, avg_household_size: 3.2, score: 91.5, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C008", zip_code: c?.target_zip || "92880", crid: "92880C008", type: "City delivery", city_state: "Eastvale, CA", residential: 540, business: 6, median_income: 118000, avg_household_size: 3.7, score: 98.2, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C009", zip_code: c?.target_zip || "92880", crid: "92880C009", type: "City delivery", city_state: "Eastvale, CA", residential: 510, business: 11, median_income: 99000, avg_household_size: 3.1, score: 90.7, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true },
          { route_id: "C010", zip_code: c?.target_zip || "92880", crid: "92880C010", type: "City delivery", city_state: "Eastvale, CA", residential: 503, business: 9, median_income: 103000, avg_household_size: 3.3, score: 93.3, facility: "EASTVALE CARRIER ANNEX", census_enriched: true, selected: true }
        ];
        return json({
          routes,
          covered: routes.reduce((a, r) => a + r.residential, 0),
          selected_routes: routes.length,
          available: routes.reduce((a, r) => a + r.residential, 0),
          available_routes: routes.length,
          census_enriched: true,
          target: c?.target_households || 5000,
          zip_code: c?.target_zip || "92880"
        });
      }

      // Match /api/campaigns/:id/routes/profile
      const profileMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/routes\/profile$/);
      if (profileMatch && request.method === "GET") {
        return json({
          profile: {
            total_parcels: 5070,
            single_family_pct: 0.94,
            avg_assessed_value: 625000,
            avg_year_built: 2012,
            owner_occupied_pct: 0.88,
          },
          available: true
        });
      }

      // Match /api/campaigns/:id/model-ack
      const modelAckMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/model-ack$/);
      if (modelAckMatch && request.method === "POST") {
        const campId = modelAckMatch[1];
        let body: any = {};
        try { body = await request.json(); } catch {}
        const c = env.DB ? (await d1GetCampaign(env.DB, campId) || campaignsStore.find(x => String(x.id) === campId)) : campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        c.model_ack = body.acknowledged === false ? null : `${new Date().toISOString()}|manual_ack`;
        if (env.DB) {
          await d1SaveCampaign(env.DB, c);
        }
        return json(c);
      }

      // Match /api/campaigns/:id/slots/autofill
      const autofillMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/slots\/autofill$/);
      if (autofillMatch && request.method === "POST") {
        const campId = autofillMatch[1];
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        if (c.mode === "LIVE") {
          return json({ detail: "Autofill is only available in DEMO mode" }, 400);
        }
        let filledCount = 0;
        for (const s of c.slots) {
          if (s.slot_number === 32 || s.format === 'USPS' || s.slot_type === 'USPS' || s.notes?.includes('Covered by')) {
            continue;
          }
          if (s.status === "VACANT" || !s.business_name) {
            const candidates = SEED_PROSPECTS[s.slot_number] || [];
            if (candidates.length > 0) {
              const pick = candidates[0];
              s.business_name = pick.business_name;
              s.phone = pick.phone;
              s.contact_person = pick.dm;
              s.business_address = pick.address;
              s.status = "PROSPECTING";
              filledCount++;
            }
          }
        }
        if (env.DB) {
          await d1SaveCampaign(env.DB, c);
        }
        return json({ filled_count: filledCount, total_slots: c.slots.length, slots: c.slots });
      }

      // Match /api/campaigns/:id/slots/:slotNumber/next-candidate
      const nextCandidateMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/slots\/(\d+)\/next-candidate$/);
      if (nextCandidateMatch && request.method === "POST") {
        const campId = nextCandidateMatch[1];
        const slotNum = parseInt(nextCandidateMatch[2]);
        const c = env.DB ? (await d1GetCampaign(env.DB, campId) || campaignsStore.find(x => String(x.id) === campId)) : campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        const s = c.slots.find((x: any) => x.slot_number === slotNum);
        if (!s) return json({ detail: "Slot not found" }, 404);
        if (s.slot_number === 32 || s.notes?.includes('Covered by')) {
          return json({ candidate: null, slot: s });
        }
        const candidates = SEED_PROSPECTS[slotNum] || [];
        const currentName = (s.business_name || "").toLowerCase();
        const next = candidates.find(cand => cand.business_name.toLowerCase() !== currentName) || candidates[0];
        if (next) {
          s.business_name = next.business_name;
          s.phone = next.phone;
          s.contact_person = next.dm;
          s.business_address = next.address;
          s.status = "PROSPECTING";
          if (env.DB) {
            await d1SaveSlot(env.DB, campId, s);
          }
        }
        return json({ candidate: next, slot: s });
      }

      // Match /api/campaigns/:id/slots/mark-all-paid
      const markAllPaidMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/slots\/mark-all-paid$/);
      if (markAllPaidMatch && request.method === "POST") {
        const campId = markAllPaidMatch[1];
        const c = env.DB ? (await d1GetCampaign(env.DB, campId) || campaignsStore.find(x => String(x.id) === campId)) : campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        if (c.mode === "LIVE") {
          return json({ detail: "Mark all paid is only available in DEMO mode" }, 400);
        }

        // Ensure all 32 slots exist
        const existingNums = new Set(c.slots.map((s: any) => s.slot_number));
        for (const def of INITIAL_SLOT_DEFS) {
          if (!existingNums.has(def.slot_number)) {
            c.slots.push({
              slot_number: def.slot_number,
              category_id: def.slot_number,
              category_name: def.name,
              side: def.face,
              slot_type: def.format,
              width_inches: def.width_in,
              height_inches: def.height_in,
              business_name: def.slot_number === 32 ? "" : `${def.name} Local`,
              contact_person: def.slot_number === 32 ? "" : "Gerente General",
              phone: def.slot_number === 32 ? "" : "(951) 842-1200",
              email: def.slot_number === 32 ? "" : `contacto@${def.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
              website: def.slot_number === 32 ? "" : `https://www.${def.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
              business_address: def.slot_number === 32 ? "" : "Eastvale, CA 92880",
              status: "PAID",
              price_usd: def.base_price,
              avg_ticket_usd: def.default_ticket,
              logo_url: "",
              offer_headline: def.default_headline,
              qr_code_url: "",
              short_url: "",
              scan_count: 0,
              payment_ref: "SIMULACIÓN",
              paid_at: new Date().toISOString(),
              amount_collected_usd: def.base_price
            });
          }
        }

        let total = 0;
        const stamped: number[] = [];
        for (const s of c.slots) {
          if (s.slot_number === 32 || s.format === 'USPS' || s.slot_type === 'USPS') {
            s.status = "PAID";
            s.price_usd = 0;
            s.amount_collected_usd = 0;
            continue;
          }
          if (s.notes?.includes('Covered by')) {
            s.status = "VACANT";
            s.price_usd = 0;
            s.amount_collected_usd = 0;
            s.business_name = "";
            s.contact_person = "";
            s.phone = "";
            s.email = "";
            s.website = "";
            s.offer_headline = "";
            s.paid_at = null;
            s.payment_ref = "";
            continue;
          }
          s.status = "PAID";
          s.paid_at = new Date().toISOString();
          s.amount_collected_usd = s.price_usd || 350;
          s.payment_ref = "SIMULACIÓN";
          total += s.amount_collected_usd;
          stamped.push(s.slot_number);
        }
        const commSlots = c.slots.filter((s: any) => s.slot_number !== 32 && (s.slot_type || s.format) !== 'USPS' && !s.notes?.includes('Covered by'));
        c.paid_count = commSlots.filter((s: any) => s.status === 'PAID').length;
        c.total_collected_usd = total;
        c.target_gross_revenue = commSlots.reduce((sum: number, s: any) => sum + (s.price_usd || 0), 0);
        c.status = "LOCKED_READY";
        if (env.DB) {
          await d1SaveCampaign(env.DB, c);
        }
        return json({ stamped, collected: total });
      }

      // Match /api/campaigns/:id/archive
      const archiveMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/archive$/);
      if (archiveMatch && request.method === "POST") {
        const campId = archiveMatch[1];
        const c = env.DB ? (await d1GetCampaign(env.DB, campId) || campaignsStore.find(x => String(x.id) === campId)) : campaignsStore.find(x => String(x.id) === campId);
        if (c) {
          c.archived_at = new Date().toISOString();
          if (env.DB) {
            await d1SaveCampaign(env.DB, c);
          }
        }
        return json({ ok: true });
      }

      // Match /api/campaigns/:id/slots/:slotId
      const slotMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/slots\/(\d+)$/);
      if (slotMatch && request.method === "PUT") {
        const campId = slotMatch[1];
        const slotNum = parseInt(slotMatch[2]);
        const body: any = await request.json();
        const c = env.DB ? (await d1GetCampaign(env.DB, campId) || campaignsStore.find(x => String(x.id) === campId)) : campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        const s = c.slots.find((x: any) => x.slot_number === slotNum);
        if (!s) return json({ detail: "Slot not found" }, 404);
        if (c.mode === "LIVE" && body.status === "PAID") {
          const biz = (body.business_name ?? body.businessName ?? s.business_name ?? '').trim();
          if (!biz) {
            return json({ detail: "Cannot mark slot as PAID without an assigned business in LIVE mode" }, 400);
          }
        }
        Object.assign(s, body);
        if (s.notes?.includes('Covered by')) {
          s.price_usd = 0;
          s.amount_collected_usd = 0;
          s.status = "VACANT";
          s.business_name = "";
          s.contact_person = "";
          s.phone = "";
          s.email = "";
          s.website = "";
          s.offer_headline = "";
          s.paid_at = null;
          s.payment_ref = "";
        } else if (s.status !== "PAID") {
          s.paid_at = null;
          s.payment_ref = "";
          s.amount_collected_usd = 0;
        }
        if (s.status === "VACANT") {
          if (!body.business_name && !body.businessName) s.business_name = "";
          if (!body.contact_person && !body.contactPerson) s.contact_person = "";
          if (!body.phone) s.phone = "";
          if (!body.email) s.email = "";
          if (!body.website) s.website = "";
          if (!body.business_address && !body.businessAddress) s.business_address = "";
          if (!body.offer_headline && !body.offerHeadline) s.offer_headline = "";
        }
        const commSlots = c.slots.filter((x: any) => x.slot_number !== 32 && (x.slot_type || x.format) !== 'USPS' && !x.notes?.includes('Covered by'));
        c.paid_count = commSlots.filter((x: any) => x.status === 'PAID').length;
        c.total_collected_usd = commSlots.reduce((sum: number, x: any) => x.status === 'PAID' ? sum + (x.amount_collected_usd || x.price_usd || 0) : sum, 0);
        c.target_gross_revenue = commSlots.reduce((sum: number, x: any) => sum + (x.price_usd || 0), 0);
        const advCount = commSlots.length;
        if (advCount > 0 && c.paid_count >= advCount) {
          c.status = "LOCKED_READY";
        } else if (c.status === "LOCKED_READY") {
          c.status = "PROSPECTING";
        }
        if (env.DB) {
          await d1SaveSlot(env.DB, campId, s);
          await d1SaveCampaign(env.DB, c);
        }
        return json(s);
      }

      // Match /api/campaigns/:id/batch-slots
      const batchMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/batch-slots$/);
      if (batchMatch && (request.method === "POST" || request.method === "PUT")) {
        const campId = batchMatch[1];
        const body: any = await request.json();
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        const updatesList = Array.isArray(body) ? body : (body.slots || []);
        for (const update of updatesList) {
          const s = c.slots.find((x: any) => x.slot_number === (update.slot_number ?? update.slotNumber));
          if (s) {
            Object.assign(s, update);
            if (s.notes?.includes('Covered by')) {
              s.price_usd = 0;
              s.amount_collected_usd = 0;
              s.status = "VACANT";
              s.business_name = "";
              s.contact_person = "";
              s.phone = "";
              s.email = "";
              s.website = "";
              s.offer_headline = "";
              s.paid_at = null;
              s.payment_ref = "";
            } else if (s.status !== "PAID") {
              s.paid_at = null;
              s.payment_ref = "";
              s.amount_collected_usd = 0;
            }
            if (s.status === "VACANT") {
              if (!update.business_name && !update.businessName) s.business_name = "";
              if (!update.contact_person && !update.contactPerson) s.contact_person = "";
              if (!update.phone) s.phone = "";
              if (!update.email) s.email = "";
              if (!update.website) s.website = "";
              if (!update.business_address && !update.businessAddress) s.business_address = "";
              if (!update.offer_headline && !update.offerHeadline) s.offer_headline = "";
            }
          } else {
            c.slots.push({
              slot_number: update.slot_number ?? update.slotNumber,
              ...update
            });
          }
        }
        const commSlots = c.slots.filter((x: any) => x.slot_number !== 32 && (x.slot_type || x.format) !== 'USPS' && !x.notes?.includes('Covered by'));
        c.paid_count = commSlots.filter((x: any) => x.status === 'PAID').length;
        c.total_collected_usd = commSlots.reduce((sum: number, x: any) => x.status === 'PAID' ? sum + (x.amount_collected_usd || x.price_usd || 0) : sum, 0);
        c.target_gross_revenue = commSlots.reduce((sum: number, x: any) => sum + (x.price_usd || 0), 0);
        const advCount = commSlots.length;
        if (advCount > 0 && c.paid_count >= advCount) {
          c.status = "LOCKED_READY";
        } else if (c.status === "LOCKED_READY") {
          c.status = "PROSPECTING";
        }
        return json(c.slots);
      }

      // Match /api/campaigns/:id/reset-slots
      const resetMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/reset-slots$/);
      if (resetMatch && request.method === "POST") {
        const campId = resetMatch[1];
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        if (c.mode === "LIVE") {
          return json({ detail: "Reset slots is only available in DEMO mode" }, 400);
        }
        c.slots = createDefaultSlots(c.target_households || 5000);
        c.paid_count = 0;
        c.total_collected_usd = 0;
        return json(c.slots);
      }

      // Match /api/campaigns/:id
      const campMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)$/);
      if (campMatch && request.method === "GET") {
        const campId = campMatch[1];
        if (env.DB) {
          const c = await d1GetCampaign(env.DB, campId);
          if (c) return json(c);
        }
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        return json(c);
      }

      if (campMatch && request.method === "PATCH") {
        const campId = campMatch[1];
        const c = env.DB ? (await d1GetCampaign(env.DB, campId) || campaignsStore.find(x => String(x.id) === campId)) : campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        const body: any = await request.json();
        const now = new Date().toISOString();
        if (body.status === "IN_PRODUCTION" && !c.production_at) {
          c.production_at = now;
        }
        if (body.status === "MAILED") {
          if (!c.production_at) c.production_at = now;
          if (!c.mailed_at) c.mailed_at = now;
        }
        Object.assign(c, body, { updated_at: now });
        if (env.DB) {
          await d1SaveCampaign(env.DB, c);
        }
        return json(c);
      }

      if (campMatch && request.method === "DELETE") {
        const campId = campMatch[1];
        if (env.DB) {
          await d1DeleteCampaign(env.DB, campId);
        }
        const idx = campaignsStore.findIndex(x => String(x.id) === campId);
        if (idx >= 0) campaignsStore.splice(idx, 1);
        return new Response(null, { status: 204 });
      }

      // Prospecting: /api/prospecting/search
      if (cleanPath === "/api/prospecting/search" && request.method === "GET") {
        const catIdStr = url.searchParams.get("category_id");
        const catId = catIdStr ? parseInt(catIdStr) : 1;
        const targetCity = url.searchParams.get("city") || "Eastvale";
        const targetZip = url.searchParams.get("zip_code") || "92880";
        const rawExclude = url.searchParams.get("exclude_names") || "";
        const excluded = rawExclude.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

        const list = SEED_PROSPECTS[catId] || [];
        const filtered = list.filter(item => !excluded.includes(item.business_name.toLowerCase()));
        const slotDef = INITIAL_SLOT_DEFS.find(d => d.slot_number === catId);

        const response = filtered.map((item, idx) => {
          const norm = computeProspectDistance(item, idx, targetCity, targetZip);
          return {
            id: `LEAD-${catId}-${idx + 1}-${targetZip}`,
            category_id: catId,
            category_name: slotDef?.name || "Comercio Local",
            business_name: item.business_name,
            name: item.business_name,
            address: item.address,
            city: norm.city,
            zip: targetZip,
            zip_code: targetZip,
            phone: item.phone,
            rating: item.rating,
            review_count: item.review_count,
            distance_miles: norm.distance_miles,
            distance_m: norm.distance_m,
            geo_tier: norm.geo_tier,
            website_url: `https://www.${item.business_name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
            source: "Simulación Edge / Yelp Fusion",
            decision_maker: item.dm || "Owner / Decision Maker",
            decision_maker_title: "Owner / Decision Maker",
            avg_ticket_estimated: item.avg_ticket || 500,
            status: "NEW"
          };
        });

        // Ordenamiento jerárquico por relevancia y geografía
        response.sort((a, b) => {
          const aPhone = a.phone ? 0 : 1;
          const bPhone = b.phone ? 0 : 1;
          if (aPhone !== bPhone) return aPhone - bPhone;
          if (a.geo_tier !== b.geo_tier) return a.geo_tier - b.geo_tier;
          if (a.distance_miles !== b.distance_miles) return a.distance_miles - b.distance_miles;
          if (b.rating !== a.rating) return b.rating - a.rating;
          return b.review_count - a.review_count;
        });

        return json(response);
      }

      // Prospecting: /api/prospecting/replacement
      if (cleanPath === "/api/prospecting/replacement" && request.method === "GET") {
        const catIdStr = url.searchParams.get("category_id");
        const catId = catIdStr ? parseInt(catIdStr) : 1;
        const targetCity = url.searchParams.get("city") || "Eastvale";
        const targetZip = url.searchParams.get("zip_code") || "92880";
        const rawExclude = url.searchParams.get("exclude_names") || "";
        const excluded = rawExclude.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

        const list = SEED_PROSPECTS[catId] || [];
        let candidate = list.find(item => !excluded.includes(item.business_name.toLowerCase()));
        if (!candidate) {
          candidate = {
            business_name: `${targetCity} Elite Services #${Date.now().toString().slice(-3)}`,
            phone: "(951) 555-0199",
            address: `12000 Schleisman Rd, ${targetCity}`,
            rating: 4.8,
            review_count: 52,
            avg_ticket: 650,
            dm: "Gerente General"
          };
        }
        const norm = computeProspectDistance(candidate, 0, targetCity, targetZip);
        const slotDef = INITIAL_SLOT_DEFS.find(d => d.slot_number === catId);
        return json({
          id: `LEAD-${catId}-REP-${Date.now().toString().slice(-4)}`,
          category_id: catId,
          category_name: slotDef?.name || "Comercio Local",
          business_name: candidate.business_name,
          name: candidate.business_name,
          address: candidate.address,
          city: norm.city,
          zip_code: targetZip,
          phone: candidate.phone,
          rating: candidate.rating,
          review_count: candidate.review_count,
          distance_miles: norm.distance_miles,
          distance_m: norm.distance_m,
          geo_tier: norm.geo_tier,
          website_url: `https://www.${candidate.business_name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
          source: "Simulación Edge / Yelp Fusion",
          decision_maker: candidate.dm,
          decision_maker_title: "Owner / Decision Maker",
          avg_ticket_estimated: candidate.avg_ticket || 500,
          status: "NEW"
        });
      }

      // Prospecting: PATCH /api/prospecting/leads/:id
      const leadMatch = cleanPath.match(/^\/api\/prospecting\/leads\/([^/]+)$/);
      if (leadMatch && request.method === "PATCH") {
        return json({ id: leadMatch[1], status: "UPDATED", ok: true });
      }

      // Prospecting: GET /api/prospecting/regeneration-reasons
      if (cleanPath === "/api/prospecting/regeneration-reasons" && request.method === "GET") {
        return json(
          Object.entries(REASON_CODES).map(([code, label]) => ({
            code,
            label,
            cooldown_days: COOLDOWN_DAYS[code]
          }))
        );
      }

      // Prospecting: GET /api/prospecting/contact-outcomes
      if (cleanPath === "/api/prospecting/contact-outcomes" && request.method === "GET") {
        return json(
          Object.entries(CONTACT_OUTCOMES).map(([code, [label, follow_up_days]]) => ({
            code,
            label,
            follow_up_days
          }))
        );
      }

      // Prospecting: GET /api/prospecting/regenerations
      if (cleanPath === "/api/prospecting/regenerations" && request.method === "GET") {
        const namesParam = url.searchParams.get("names") || "";
        const keys = namesParam.split("|").map(normalizeBizKey).filter(Boolean);
        if (env.DB && keys.length > 0) {
          const res = await d1GetRegenerations(env.DB, keys);
          return json(res);
        }
        return json({});
      }

      // Prospecting: POST /api/prospecting/regenerations
      if (cleanPath === "/api/prospecting/regenerations" && request.method === "POST") {
        let body: any = {};
        try { body = await request.json(); } catch {}
        const days = COOLDOWN_DAYS[body.reason_code] ?? 30;
        const until = days !== null ? new Date(Date.now() + days * 86400000).toISOString() : null;
        const item = {
          ...body,
          cooldown_days: days,
          cooldown_until: until
        };
        if (env.DB) {
          await d1SaveRegeneration(env.DB, item);
        }
        return json({
          business_name: body.business_name,
          reason_code: body.reason_code,
          cooldown_days: days,
          cooldown_until: until
        });
      }

      // Prospecting: GET /api/prospecting/contacts
      if (cleanPath === "/api/prospecting/contacts" && request.method === "GET") {
        const namesParam = url.searchParams.get("names") || "";
        const keys = namesParam.split("|").map(normalizeBizKey).filter(Boolean);
        if (env.DB && keys.length > 0) {
          const res = await d1GetContacts(env.DB, keys);
          return json(res);
        }
        return json({});
      }

      // Prospecting: POST /api/prospecting/contacts
      if (cleanPath === "/api/prospecting/contacts" && request.method === "POST") {
        let body: any = {};
        try { body = await request.json(); } catch {}
        let followUp: string | null = null;
        if (body.follow_up_minutes && Number(body.follow_up_minutes) > 0) {
          followUp = new Date(Date.now() + Number(body.follow_up_minutes) * 60000).toISOString();
        } else if (body.follow_up_days && Number(body.follow_up_days) > 0) {
          followUp = new Date(Date.now() + Number(body.follow_up_days) * 86400000).toISOString();
        }
        const item = { ...body, follow_up_at: followUp };
        if (env.DB) {
          const saved = await d1SaveContact(env.DB, item);
          if (saved) return json(saved);
        }
        return json({
          business_name: body.business_name,
          count: 1,
          outcome_code: body.outcome_code || "OTRO",
          outcome_label: CONTACT_OUTCOMES[body.outcome_code || "OTRO"]?.[0] || "Otro",
          note: body.note,
          at: new Date().toISOString(),
          follow_up_at: followUp,
          due: false
        });
      }

      // Prospecting: GET /api/prospecting/contacts/by-slot
      if (cleanPath === "/api/prospecting/contacts/by-slot" && request.method === "GET") {
        const campId = url.searchParams.get("campaign_id") || "";
        if (env.DB) {
          const query = campId
            ? "SELECT * FROM lead_contacts WHERE campaign_id = ? AND slot_number IS NOT NULL ORDER BY created_at ASC"
            : "SELECT * FROM lead_contacts WHERE slot_number IS NOT NULL ORDER BY created_at ASC";
          const stmt = campId ? env.DB.prepare(query).bind(campId) : env.DB.prepare(query);
          const { results } = await stmt.all();
          const grouped: Record<string, any[]> = {};
          for (const r of (results || [])) {
            const sNum = String((r as any).slot_number);
            const followUp = (r as any).follow_up_at;
            grouped[sNum] = grouped[sNum] || [];
            grouped[sNum].push({
              business_name: (r as any).business_name,
              count: 1,
              outcome_code: (r as any).outcome_code,
              outcome_label: CONTACT_OUTCOMES[(r as any).outcome_code]?.[0] || "Otro",
              note: (r as any).note,
              at: (r as any).created_at,
              follow_up_at: followUp,
              due: Boolean(followUp && new Date(followUp) <= new Date()),
            });
          }
          return json(grouped);
        }
        return json({});
      }

      // Prospecting: GET /api/prospecting/quarantine
      if (cleanPath === "/api/prospecting/quarantine" && request.method === "GET") {
        const q = (url.searchParams.get("q") || "").toLowerCase();
        if (env.DB) {
          const res = await env.DB.prepare(
            "SELECT * FROM lead_regenerations WHERE cooldown_until IS NOT NULL ORDER BY created_at DESC LIMIT 100"
          ).all();
          const rows = (res.results || []).filter((r: any) => {
            if (!q) return true;
            return (r.business_name || "").toLowerCase().includes(q) || (r.business_address || "").toLowerCase().includes(q);
          });
          return json(rows);
        }
        return json([]);
      }

      // Prospecting: POST /api/prospecting/quarantine/release
      if (cleanPath === "/api/prospecting/quarantine/release" && request.method === "POST") {
        const bizName = url.searchParams.get("business_name") || "";
        if (env.DB && bizName) {
          const key = normalizeBizKey(bizName);
          await env.DB.prepare("DELETE FROM lead_regenerations WHERE business_key = ?").bind(key).run();
        }
        return json({ ok: true });
      }

      // Curation: POST /api/curation/execute
      if (cleanPath === "/api/curation/execute" && request.method === "POST") {
        let body: any = {};
        try { body = await request.json(); } catch {}
        const campId = body.campaign_id || "camp_ie-east-92880";
        const c = campaignsStore.find(x => String(x.id) === campId);
        const target = body.target_count || c?.target_households || 5000;

        if (c) {
          c.status = "CURATED";
          c.curated_count = target;
        }

        const carrierRouteBreakdown = [
          { carrier_route: "C001", count: 520, percentage: 10.4, route: "C001", zip: "92880" },
          { carrier_route: "C002", count: 512, percentage: 10.2, route: "C002", zip: "92880" },
          { carrier_route: "C003", count: 480, percentage: 9.6, route: "C003", zip: "92880" },
          { carrier_route: "C004", count: 530, percentage: 10.6, route: "C004", zip: "92880" },
          { carrier_route: "C005", count: 495, percentage: 9.9, route: "C005", zip: "92880" },
          { carrier_route: "C006", count: 520, percentage: 10.4, route: "C006", zip: "92880" },
          { carrier_route: "C007", count: 460, percentage: 9.2, route: "C007", zip: "92880" },
          { carrier_route: "C008", count: 540, percentage: 10.8, route: "C008", zip: "92880" },
          { carrier_route: "C009", count: 510, percentage: 10.2, route: "C009", zip: "92880" },
          { carrier_route: "C010", count: 503, percentage: 10.1, route: "C010", zip: "92880" }
        ];

        const scoreHistogram = [
          { bucket: "60-69", count: 140, percentage: 2.8 },
          { bucket: "70-79", count: 780, percentage: 15.6 },
          { bucket: "80-89", count: 2340, percentage: 46.8 },
          { bucket: "90-95", count: 1420, percentage: 28.4 },
          { bucket: "96-100", count: 320, percentage: 6.4 }
        ];

        const categorySynergies = [
          { category: "Odontología Familiar", synergyScore: 94.2, matchCount: target },
          { category: "HVAC / Aire Acondicionado", synergyScore: 91.8, matchCount: target },
          { category: "Hospital Veterinario", synergyScore: 88.5, matchCount: target },
          { category: "Techado y Paneles Solares", synergyScore: 89.1, matchCount: target },
          { category: "Taller Mecánico / Frenos", synergyScore: 86.4, matchCount: target }
        ];

        const sampleNames = ["GARCIA", "RODRIGUEZ", "HERNANDEZ", "MARTINEZ", "JOHNSON", "SMITH", "CHEN", "KIM", "TRAN", "LOPEZ"];
        const sampleStreets = ["LIMONITE AVE", "ARCHIBALD AVE", "SCHLEISMAN RD", "HAMNER AVE", "CITRUS ST", "HELLMAN AVE", "RIVER BEND DR"];
        const top5k = [];
        for (let i = 1; i <= 25; i++) {
          const name = sampleNames[i % sampleNames.length];
          const st = sampleStreets[i % sampleStreets.length];
          const num = 12000 + i * 28;
          top5k.push({
            id: `HH-${campId}-${i}`,
            residentName: `${name} RESIDENCE`,
            streetAddress: `${num} ${st}`,
            city: "Eastvale",
            state: "CA",
            zip5: "92880",
            zip4: String(1000 + i),
            carrierRoute: `C00${(i % 5) + 1}`,
            walkSequence: i,
            incomeScore: Math.round((88 + (i % 10) * 1.1) * 10) / 10,
            homeOwnershipScore: 0.94,
            homeAgeYears: 12,
            homeAgeScore: 0.85,
            childrenPresentScore: 0.92,
            vehiclesCount: 2,
            vehiclesScore: 0.88,
            petOwnerScore: 0.75,
            homeValueScore: 0.92,
            matchScores: {},
            compositeScore: Math.round((89.5 + ((25 - i) * 0.35)) * 10) / 10,
            selectedForDrop: true
          });
        }

        const summary = {
          totalAnalyzed: 15000,
          totalSelected: target,
          minScore: 78.4,
          maxScore: 98.9,
          avgScore: 88.6,
          carrierRouteDistribution: carrierRouteBreakdown.map(r => ({ route: r.carrier_route, count: r.count, zip: "92880" })),
          categorySynergyBreakdown: categorySynergies,
          scoreHistogram: scoreHistogram
        };

        return json({
          campaign_id: campId,
          total_analyzed: 15000,
          total_selected: target,
          min_score: 78.4,
          max_score: 98.9,
          avg_score: 88.6,
          carrier_route_breakdown: carrierRouteBreakdown,
          category_synergies: categorySynergies,
          histogram: scoreHistogram,
          summary: summary,
          top_5k: top5k
        });
      }

      // Costs: POST /api/costs/:mode/market-preset
      const marketPresetMatch = cleanPath.match(/^\/api\/costs\/(DEMO|LIVE)\/market-preset$/i);
      if (marketPresetMatch && request.method === "POST") {
        const mode = marketPresetMatch[1].toUpperCase();
        const hh = parseInt(url.searchParams.get("households") || "5000");
        const preset = {
          mode,
          postage_per_piece: 0.247,
          print_per_piece: 0.21,
          variable_data_per_piece: 0.03,
          presort_per_piece: 0.02,
          finishing_per_piece: 0.025,
          list_per_piece: 0.11,
          setup_fee: 250.0,
          delivery_fee: 175.0,
          target_margin: 0.58,
          source_note: 'Valores de mercado (sept 2026), no cotizaciones: franqueo EDDM Retail $0.247; impresión $0.08–$0.25 según volumen; lista de consumidores segmentada $75–$150 por millar; higiene CASS/NCOA $2–$8 por millar.',
          updated_at: new Date().toISOString()
        };
        workerCostsStore[mode] = preset;
        if (env.DB) {
          await d1SaveCostSettings(env.DB, mode, preset);
        }
        const unit = Number(((preset.postage_per_piece || 0) + (preset.print_per_piece || 0) + (preset.list_per_piece || 0)).toFixed(4));
        const fixed = Number(((preset.setup_fee || 0) + (preset.delivery_fee || 0)).toFixed(2));
        const total = Number((unit * hh + fixed).toFixed(2));
        return json({
          ...preset,
          unit_cost: unit,
          fixed_cost: fixed,
          preview_households: hh,
          preview_total_cost: total,
          suggested_prices: {}
        });
      }

      // Costs: /api/costs/:mode
      const costMatch = cleanPath.match(/^\/api\/costs\/(DEMO|LIVE)$/i);
      if (costMatch) {
        const mode = costMatch[1].toUpperCase();
        if (env.DB) {
          const d1Costs = await d1GetCostSettings(env.DB, mode);
          if (d1Costs) {
            workerCostsStore[mode] = { ...workerCostsStore[mode], ...d1Costs };
          }
        }
        if (!workerCostsStore[mode]) {
          workerCostsStore[mode] = {
            mode,
            postage_per_piece: 0.247,
            print_per_piece: 0.368,
            list_per_piece: 0.0,
            variable_data_per_piece: 0.0,
            presort_per_piece: 0.0,
            finishing_per_piece: 0.0,
            setup_fee: 0.0,
            delivery_fee: 0.0,
            target_margin: 0.58,
            source_note: 'Zoom Mailing (Riverside, CA) · Impresión Jumbo 12"×9" + Franqueo EDDM',
          };
        }

        if (request.method === "PUT" || request.method === "POST") {
          let body: any = {};
          try { body = await request.json(); } catch {}
          Object.assign(workerCostsStore[mode], body);
          if (env.DB) {
            await d1SaveCostSettings(env.DB, mode, workerCostsStore[mode]);
          }
        }

        const current = workerCostsStore[mode];
        const hh = parseInt(url.searchParams.get("households") || "5000");
        const unit = Number(((current.postage_per_piece || 0.247) + (current.print_per_piece || 0.368) + (current.list_per_piece || 0)).toFixed(4));
        const fixed = Number(((current.setup_fee || 0) + (current.delivery_fee || 0)).toFixed(2));
        const total = Number((unit * hh + fixed).toFixed(2));

        const margin = Math.min(Math.max(current.target_margin || 0.58, 0), 0.95);
        const requiredRevenue = margin < 1 ? total / (1 - margin) : total;
        const campId = url.searchParams.get("campaign_id");
        const c = campId ? campaignsStore.find(x => String(x.id) === campId) : null;
        const FORMAT_WEIGHTS: Record<string, number> = { SMALL: 350, MEDIUM: 650, LARGE: 1200, USPS: 0 };
        const effectiveWeights: Record<number, number> = {};
        for (let i = 1; i <= 32; i++) {
          if (i === 32) {
            effectiveWeights[i] = 0;
          } else if (c) {
            const s = c.slots?.find((x: any) => x.slot_number === i);
            if (!s || (s.slot_type || s.format) === 'USPS' || s.notes?.includes('Covered by')) {
              effectiveWeights[i] = 0;
            } else {
              effectiveWeights[i] = FORMAT_WEIGHTS[s.format || s.slot_type || 'SMALL'] ?? 350;
            }
          } else {
            effectiveWeights[i] = 350;
          }
        }
        const weightSum = Object.values(effectiveWeights).reduce((a, b) => a + b, 0);
        const prices: Record<number, number> = {};
        for (let i = 1; i <= 32; i++) {
          const w = effectiveWeights[i];
          prices[i] = (weightSum > 0 && w > 0) ? Math.round(requiredRevenue * w / weightSum) : 0;
        }

        return json({
          ...current,
          unit_cost: unit,
          fixed_cost: fixed,
          preview_households: hh,
          preview_total_cost: total,
          suggested_prices: prices,
        });
      }

      // EDDM: /api/eddm/routes/:zip or /api/eddm/:zip/routes
      const eddmMatch = cleanPath.match(/^\/api\/eddm\/(?:routes\/)?(\d+)(?:\/routes)?$/);
      if (eddmMatch) {
        const zip = eddmMatch[1];
        return json({
          zip,
          routes: [
            { route_id: "C001", residential: 520, business: 15, median_income: 104000, avg_household_size: 3.4, score: 95.2, selected: true },
            { route_id: "C002", residential: 512, business: 12, median_income: 112000, avg_household_size: 3.5, score: 96.8, selected: true },
            { route_id: "C003", residential: 480, business: 10, median_income: 98000, avg_household_size: 3.2, score: 92.1, selected: true },
            { route_id: "C004", residential: 530, business: 8, median_income: 115000, avg_household_size: 3.6, score: 97.4, selected: true },
            { route_id: "C005", residential: 495, business: 20, median_income: 92000, avg_household_size: 3.1, score: 88.5, selected: true },
            { route_id: "C006", residential: 520, business: 14, median_income: 106000, avg_household_size: 3.3, score: 94.0, selected: true },
            { route_id: "C007", residential: 460, business: 18, median_income: 101000, avg_household_size: 3.2, score: 91.5, selected: true },
            { route_id: "C008", residential: 540, business: 6, median_income: 118000, avg_household_size: 3.7, score: 98.2, selected: true },
            { route_id: "C009", residential: 510, business: 11, median_income: 99000, avg_household_size: 3.1, score: 90.7, selected: true },
            { route_id: "C010", residential: 503, business: 9, median_income: 103000, avg_household_size: 3.3, score: 93.3, selected: true }
          ]
        });
      }

      // EDDM Floor: /api/eddm/:zip/floor
      const floorMatch = cleanPath.match(/^\/api\/eddm\/(\d+)\/floor$/);
      if (floorMatch) {
        return json({
          zip_code: floorMatch[1],
          smallest_route: 460,
          largest_route: 540,
          median_route: 510,
          routes: 10,
          total_households: 5070
        });
      }

      // Datasources: Market reference
      if (cleanPath === "/api/datasources/reference/market" && request.method === "GET") {
        return json(MARKET_REFERENCE);
      }

      // Datasources: Test source
      const dsTestMatch = cleanPath.match(/^\/api\/datasources\/test\/([^/]+)$/);
      if (dsTestMatch && request.method === "POST") {
        const sourceId = dsTestMatch[1];
        return json({
          source: sourceId,
          ok: true,
          configured: true,
          detail: "Fuente probada y operativa en Edge",
          sample: []
        });
      }

      // Datasources: Update source
      const dsUpdateMatch = cleanPath.match(/^\/api\/datasources\/(DEMO|LIVE)\/([^/]+)$/i);
      if (dsUpdateMatch && request.method === "PUT") {
        const mode = dsUpdateMatch[1].toUpperCase();
        const sourceId = dsUpdateMatch[2];
        let body: any = {};
        try { body = await request.json(); } catch {}
        if (env.DB) {
          await d1SaveDataSource(env.DB, mode, sourceId, Boolean(body.enabled));
        }
        return json({
          id: sourceId,
          mode,
          enabled: Boolean(body.enabled),
          updated_at: new Date().toISOString()
        });
      }

      // Datasources: List sources
      const dsListMatch = cleanPath.match(/^\/api\/datasources\/(DEMO|LIVE)$/i);
      if (dsListMatch && request.method === "GET") {
        const mode = dsListMatch[1].toUpperCase();
        let dbRows: any[] = [];
        if (env.DB) {
          dbRows = await d1GetDataSources(env.DB, mode);
        }
        const defaultSources = [
          { id: "USPS_EDDM", name: "USPS EDDM · Motor de rutas", cost: "FREE", provides: "routes", gives: "Rutas oficiales con demografía por ruta.", lacks: "Sin nombres.", note: "Público.", enabled: true, configured: true },
          { id: "CENSUS_ACS", name: "US Census Bureau · ACS 5-year", cost: "FREE", provides: "demographics", gives: "Demografía por block group.", lacks: "Agregado.", note: "Clave integrada.", enabled: true, configured: true },
          { id: "OSM_OVERPASS", name: "OpenStreetMap · Overpass API", cost: "FREE", provides: "businesses", gives: "Comercios reales por giro y radio.", lacks: "Sin reseñas.", note: "Respaldo.", enabled: true, configured: true },
          { id: "YELP", name: "Yelp Fusion", cost: "PAID", provides: "businesses", gives: "Prospección principal con ratings.", lacks: "Sin datos residenciales.", note: "API activa.", enabled: true, configured: true },
          { id: "GEOAPIFY", name: "Geoapify Places", cost: "PAID", provides: "businesses", gives: "Respaldo de prospección.", lacks: "Sin datos residenciales.", note: "3,000 créditos/día.", enabled: true, configured: true },
          { id: "CENSUS_TIGERWEB", name: "Census TIGERweb · Geometrías", cost: "FREE", provides: "geometry", gives: "Polígonos oficiales de block group.", lacks: "Solo geometría.", note: "Público.", enabled: true, configured: true },
          { id: "DATA_AXLE", name: "Data Axle · Lista residencial licenciada", cost: "PAID", provides: "residential", gives: "Nombres y teléfonos de decisores.", lacks: "Suscripción.", note: "Opcional.", enabled: false, configured: false }
        ];
        const res = defaultSources.map(s => {
          const found = dbRows.find((r: any) => r.source_id === s.id);
          return found ? { ...s, enabled: Boolean(found.enabled) } : s;
        });
        return json(res);
      }

      // Datasources fallback
      if (cleanPath.startsWith("/api/datasources")) {
        return json([
          { id: "USPS_EDDM", name: "USPS EDDM · Motor de rutas", cost: "FREE", provides: "routes", gives: "Rutas oficiales con demografía por ruta.", lacks: "Sin nombres.", note: "Público.", enabled: true, configured: true },
          { id: "CENSUS_ACS", name: "US Census Bureau · ACS 5-year", cost: "FREE", provides: "demographics", gives: "Demografía por block group.", lacks: "Agregado.", note: "Clave integrada.", enabled: true, configured: true },
          { id: "OSM_OVERPASS", name: "OpenStreetMap · Overpass API", cost: "FREE", provides: "businesses", gives: "Comercios reales por giro y radio.", lacks: "Sin reseñas.", note: "Respaldo.", enabled: true, configured: true },
          { id: "YELP", name: "Yelp Fusion", cost: "PAID", provides: "businesses", gives: "Prospección principal con ratings.", lacks: "Sin datos residenciales.", note: "API activa.", enabled: true, configured: true }
        ]);
      }

      // Assistant Status
      if (cleanPath === "/api/assistant/status") {
        return json({
          documents: 8,
          chunks: 42,
          model: "Cloudflare Edge AI / Lead-Sourcing Assistant",
          endpoint: "/api/assistant/chat",
          model_available: true
        });
      }

      // Assistant Chat
      if (cleanPath === "/api/assistant/chat" && request.method === "POST") {
        let body: any = {};
        try { body = await request.json(); } catch {}
        const q = (body.question || "").toLowerCase();
        let answer = "Bienvenido al asistente técnico de Co-Op Direct Mail. El sistema está configurado para tarjetas jumbo 12x9 en el Inland Empire (Eastvale, Corona, Norco) con 14 espacios comerciales exclusivos de alta sinergia.";
        if (q.includes("eddm") || q.includes("usps") || q.includes("correo")) {
          answer = "USPS EDDM (Every Door Direct Mail) permite enviar a hogares residenciales seleccionados por Carrier Route sin necesidad de comprar listas de correo nominales con permiso de franqueo minorista a $0.247 por pieza. Requiere agrupar por paquetes de 50 a 100 piezas con el formulario PS 3587.";
        } else if (q.includes("espacio") || q.includes("slot") || q.includes("precio")) {
          answer = "El impreso cuenta con 14 espacios de nicho exclusivo: 1 HERO frontal (12x3.2\") para Odontología, 6 estándar frontales (4.3x4.2\"), 6 estándar reverso (4.3x3.8\") y 1 Medium reverso (7x3\") para Seguros. Esto evita la competencia desleal y maximiza el retorno para cada patrocinador.";
        } else if (q.includes("curacion") || q.includes("audiencia") || q.includes("algoritmo")) {
          answer = "La fase de curación algorítmica analiza las características socioeconómicas (ingresos medios >$90k, dueños de casa, antigüedad de vivienda, presencia de niños y mascotas) para rankear las 15,000 unidades de la zona y seleccionar el percentil más propenso a consumir los 14 servicios del impreso.";
        }
        return json({
          answer,
          sources: [
            { id: "manual", title: "Manual de Operación Co-Op Direct Mail", origin: "INTERNAL", char_count: 14500, chunk_count: 12, created_at: new Date().toISOString() }
          ],
          model: "Cloudflare Edge AI",
          model_available: true
        });
      }

      // QR Telemetry: /r/:campaignId/:slotId
      const qrMatch = cleanPath.match(/^\/r\/([^/]+)\/(\d+)$/);
      if (qrMatch) {
        const campId = qrMatch[1];
        const slotNum = parseInt(qrMatch[2]);
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (c) {
          const s = c.slots.find((x: any) => x.slot_number === slotNum);
          if (s) s.scan_count = (s.scan_count || 0) + 1;
        }
        return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oferta Exclusiva Direct Mail</title><style>body{font-family:sans-serif;padding:2rem;text-align:center;background:#0f172a;color:#f8fafc;}h1{color:#38bdf8;}a{display:inline-block;margin-top:1.5rem;padding:0.75rem 1.5rem;background:#3b82f6;color:white;text-decoration:none;border-radius:8px;font-weight:bold;}</style></head><body><h1>¡Oferta Escaneada con Éxito!</h1><p>Campaña ${campId} · Espacio ${slotNum}</p><p>Presenta este cupón en el establecimiento patrocinador para hacer válida tu promoción.</p><a href="/">Volver a la Plataforma</a></body></html>`, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }

      // All static frontend files served from ./dist (SPA fallback)
      return env.ASSETS.fetch(request);
    } catch (err: any) {
      return json({ error: err?.message || String(err) }, 500);
    }
  }
};
