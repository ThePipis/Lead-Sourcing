// Cloudflare Worker for Lead-Sourcing
// Serves static frontend assets from ./dist and provides edge API endpoints

interface Env {
  ASSETS: Fetcher;
  BACKEND_URL?: string;
  USE_BUILTIN_API?: string;
}

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
  { slot_number: 1, name: "Odontología Familiar", face: "FRONT", format: "HERO", width_in: 12.0, height_in: 3.2, base_price: 850.0, default_ticket: 1250.0, default_headline: "Sonrisas Saludables para Toda la Familia | $79 Examen + Limpieza + Rayos X" },
  { slot_number: 2, name: "HVAC / Aire Acondicionado", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, base_price: 497.0, default_ticket: 4500.0, default_headline: "Evite el Golpe de Calor en el IE | $49 A/C Super Tune-Up + 15% Off" },
  { slot_number: 3, name: "Hospital Veterinario", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, base_price: 497.0, default_ticket: 450.0, default_headline: "Cuidado Médico Compasivo 7 Días | 50% de Descuento en Primera Consulta" },
  { slot_number: 4, name: "Plomería Residencial", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, base_price: 497.0, default_ticket: 780.0, default_headline: "Plomeros de Confianza 24/7 | $50 Off Desazolve o Inspección con Cámara Gratis" },
  { slot_number: 5, name: "Taller Mecánico / Frenos", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, base_price: 497.0, default_ticket: 550.0, default_headline: "Cambio de Frenos Premium $99 por Eje + Diagnóstico Computarizado Gratis" },
  { slot_number: 6, name: "Pizzería Artesanal", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, base_price: 497.0, default_ticket: 55.0, default_headline: "Sabor a la Leña Auténtico | 1 Pizza Grande + 1 Mediana al 50% de Descuento" },
  { slot_number: 7, name: "Gimnasio Boutique / Fitness", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, base_price: 497.0, default_ticket: 140.0, default_headline: "Transforma tu Cuerpo en 60 Días | 14 Días VIP Pass Ilimitado por solo $19" },
  { slot_number: 8, name: "Techado y Paneles Solares", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, base_price: 497.0, default_ticket: 14500.0, default_headline: "Cero Pago Inicial en Energía Solar + Inspección de Techo 100% Sin Costo" },
  { slot_number: 9, name: "Quiropráctico / Fisioterapia", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, base_price: 497.0, default_ticket: 480.0, default_headline: "Alivio Inmediato del Dolor de Espalda y Cuello | Consulta y Primer Ajuste $39" },
  { slot_number: 10, name: "Limpieza de Alfombras y Pisos", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, base_price: 497.0, default_ticket: 320.0, default_headline: "Vapor a Alta Presión 3 Habitaciones por $119 | Secado Rápido y Desinfección" },
  { slot_number: 11, name: "Detailing Móvil de Autos", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, base_price: 497.0, default_ticket: 220.0, default_headline: "Detailing Profesional a Domicilio | Paquete Interior + Exterior con 25% Off" },
  { slot_number: 12, name: "Peluquería Canina", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, base_price: 497.0, default_ticket: 85.0, default_headline: "El Mejor Consentimiento para tu Mascota | Baño, Corte y Uñas $10 Off" },
  { slot_number: 13, name: "Restaurante Mexicano", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, base_price: 497.0, default_ticket: 68.0, default_headline: "Auténtica Cocina Tradicional | Botana de Cortesía en la Compra de 2 Entrees" },
  { slot_number: 14, name: "Agencia de Seguros", face: "BACK", format: "MEDIUM_BACK", width_in: 7.0, height_in: 3.0, base_price: 640.0, default_ticket: 1400.0, default_headline: "Ahorra hasta $650 al Año Combinando tus Pólizas de Auto y Casa en el IE" }
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

  const paidSlots = [
    { slot_number: 1, name: "Odontología Familiar", face: "FRONT", format: "HERO", width_in: 12.0, height_in: 3.2, price: 168.0, ticket: 1250.0, business: "Eastvale Premier Dental Care", phone: "(951) 842-1200", addr: "12712 Limonite Ave, Eastvale" },
    { slot_number: 2, name: "HVAC / Aire Acondicionado", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, price: 98.0, ticket: 4500.0, business: "Air Pro Solutions IE", phone: "(951) 734-8890", addr: "7056 Archibald Ave, Eastvale" },
    { slot_number: 3, name: "Hospital Veterinario", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, price: 98.0, ticket: 450.0, business: "Eastvale Pet Hospital", phone: "(951) 479-5600", addr: "12363 Limonite Ave, Eastvale" },
    { slot_number: 4, name: "Plomería Residencial", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, price: 98.0, ticket: 780.0, business: "Precision Plumbing IE", phone: "(951) 682-3344", addr: "14120 Schleisman Rd, Eastvale" },
    { slot_number: 5, name: "Taller Mecánico / Frenos", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, price: 98.0, ticket: 550.0, business: "Corona Complete Auto & Brakes", phone: "(951) 371-2211", addr: "13394 Limonite Ave, Eastvale" },
    { slot_number: 6, name: "Pizzería Artesanal", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, price: 98.0, ticket: 55.0, business: "Bella Napoli Pizza Artesanal", phone: "(951) 898-4455", addr: "12610 Limonite Ave, Eastvale" },
    { slot_number: 7, name: "Gimnasio Boutique / Fitness", face: "FRONT", format: "STANDARD_FRONT", width_in: 4.3, height_in: 4.2, price: 98.0, ticket: 140.0, business: "Apex Performance Studio", phone: "(951) 582-9011", addr: "7125 Hamner Ave, Eastvale" },
    { slot_number: 8, name: "Techado y Paneles Solares", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, price: 98.0, ticket: 14500.0, business: "California Sun & Solar IE", phone: "(951) 900-3412", addr: "12523 Limonite Ave, Eastvale" },
    { slot_number: 9, name: "Quiropráctico / Fisioterapia", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, price: 98.0, ticket: 480.0, business: "Spine & Joint Wellness Center", phone: "(951) 817-9922", addr: "12614 Limonite Ave, Eastvale" },
    { slot_number: 10, name: "Limpieza de Alfombras y Pisos", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, price: 98.0, ticket: 320.0, business: "EcoClean Steam Masters IE", phone: "(951) 427-8100", addr: "7010 Archibald Ave, Eastvale" },
    { slot_number: 11, name: "Detailing Móvil de Autos", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, price: 98.0, ticket: 220.0, business: "Mirror Finish Mobile Spa", phone: "(951) 314-7788", addr: "12410 Schleisman Rd, Eastvale" },
    { slot_number: 12, name: "Peluquería Canina", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, price: 98.0, ticket: 85.0, business: "Paws & Bubbles Grooming", phone: "(951) 736-5544", addr: "12750 Limonite Ave, Eastvale" },
    { slot_number: 13, name: "Restaurante Mexicano", face: "BACK", format: "STANDARD_BACK", width_in: 4.3, height_in: 3.8, price: 98.0, ticket: 68.0, business: "Taquería & Cantina El Rancho", phone: "(951) 493-2288", addr: "12569 Limonite Ave, Eastvale" },
    { slot_number: 14, name: "Agencia de Seguros", face: "BACK", format: "MEDIUM_BACK", width_in: 7.0, height_in: 3.0, price: 127.0, ticket: 1400.0, business: "Empire Shield Insurance Agency", phone: "(951) 898-1122", addr: "12716 Limonite Ave, Eastvale" }
  ];

  const slots = paidSlots.map((d, idx) => ({
    id: idx + 1,
    campaign_id: "camp_ie-east-92880",
    slot_number: d.slot_number,
    category_id: d.slot_number,
    category_name: d.name,
    side: d.face,
    slot_type: d.format,
    width_inches: d.width_in,
    height_inches: d.height_in,
    business_name: d.business,
    contact_person: "Gerente General",
    phone: d.phone,
    email: `contacto@${d.business.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
    website: `https://www.${d.business.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
    business_address: d.addr,
    status: "PAID",
    price_usd: d.price,
    avg_ticket_usd: d.ticket,
    logo_url: "",
    offer_headline: INITIAL_SLOT_DEFS[idx]?.default_headline || "",
    qr_code_url: "",
    short_url: "",
    scan_count: 0,
    payment_ref: "SIMULACIÓN",
    paid_at: "2026-09-20T23:42:19.856367",
    amount_collected_usd: d.price
  }));

  return {
    id: "camp_ie-east-92880",
    code: "IE-EAST-92880",
    name: "Co-Op Direct Mail - Eastvale",
    target_city: "Eastvale",
    target_zip: "92880",
    radius_miles: 5.0,
    target_households: hh,
    target_gross_revenue: gross,
    operating_cost_est: op,
    net_margin_est: net,
    unit_cost_usd: unitCost,
    fixed_cost_usd: fixedCost,
    target_margin: 0.5,
    status: "PROSPECTING",
    mode: "DEMO",
    slots,
    paid_count: 14,
    total_collected_usd: gross,
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
    { business_name: "Eastvale Premier Dental Care", phone: "(951) 842-1200", address: "12712 Limonite Ave #100", rating: 4.9, review_count: 128, avg_ticket: 1250, dm: "Dr. Roberto Chen", hook_es: "50% en implantes y blanqueamiento", hook_en: "50% off new patient exam & whitening" },
    { business_name: "Dr. Rodriguez Family Dentistry", phone: "(951) 371-5500", address: "7056 Archibald Ave", rating: 4.8, review_count: 94, avg_ticket: 1100, dm: "Dra. Elena Rodriguez", hook_es: "Chequeo dental infantil y de adultos $49", hook_en: "$49 exam + cleaning" },
    { business_name: "Heritage Valley Smiles Orthodontics", phone: "(951) 902-8811", address: "12610 Limonite Ave", rating: 4.7, review_count: 82, avg_ticket: 2400, dm: "Dr. Mark Vance", hook_es: "Frenos transparentes $500 de descuento", hook_en: "Clear aligners $500 off" }
  ],
  2: [
    { business_name: "Air Pro Solutions IE", phone: "(951) 734-8890", address: "7056 Archibald Ave", rating: 4.9, review_count: 145, avg_ticket: 4500, dm: "Carlos Mendoza", hook_es: "$49 super tune-up A/C de temporada", hook_en: "$49 seasonal A/C super tune-up" },
    { business_name: "All Seasons HVAC Masters", phone: "(951) 493-1122", address: "12363 Limonite Ave", rating: 4.7, review_count: 76, avg_ticket: 3800, dm: "Michael Ortiz", hook_es: "Reemplazo de condensador con financiamiento 0%", hook_en: "0% APR condenser replacement" },
    { business_name: "Eastvale Climate Control", phone: "(951) 582-7700", address: "14120 Schleisman Rd", rating: 4.8, review_count: 63, avg_ticket: 4200, dm: "David Kim", hook_es: "Inspección gratuita de conductos y filtros", hook_en: "Free duct and airflow diagnostic" }
  ],
  3: [
    { business_name: "Eastvale Pet Hospital & Urgent Care", phone: "(951) 479-5600", address: "12363 Limonite Ave", rating: 4.9, review_count: 110, avg_ticket: 450, dm: "Dra. Sandra Miller", hook_es: "50% de descuento en primera consulta", hook_en: "50% off first exam & vaccination check" },
    { business_name: "Valley Veterinary Clinic", phone: "(951) 371-9988", address: "12712 Limonite Ave", rating: 4.7, review_count: 85, avg_ticket: 380, dm: "Dr. Hector Garcia", hook_es: "Plan dental canino con 20% de descuento", hook_en: "20% off pet dental cleanings" },
    { business_name: "Inland Pet Wellness Center", phone: "(951) 842-3344", address: "7125 Hamner Ave", rating: 4.8, review_count: 59, avg_ticket: 420, dm: "Dra. Lisa Cooper", hook_es: "Vacunación preventiva completa $59", hook_en: "Complete core vaccine bundle $59" }
  ],
  4: [
    { business_name: "Precision Plumbing IE 24/7", phone: "(951) 682-3344", address: "14120 Schleisman Rd", rating: 4.8, review_count: 115, avg_ticket: 780, dm: "Jorge Martinez", hook_es: "$50 off desazolve con cámara gratuita", hook_en: "$50 off drain clearing with free camera inspection" },
    { business_name: "Rooter & Drain Masters", phone: "(951) 734-6622", address: "12523 Limonite Ave", rating: 4.7, review_count: 88, avg_ticket: 650, dm: "Anthony Russo", hook_es: "Inspección de calentador de agua sin costo", hook_en: "Free water heater assessment" },
    { business_name: "AquaFlow Plumbers Eastvale", phone: "(951) 493-7711", address: "7010 Archibald Ave", rating: 4.9, review_count: 72, avg_ticket: 920, dm: "Frank Jimenez", hook_es: "Instalación de calentador Tankless con $150 bono", hook_en: "Tankless water heater $150 rebate" }
  ],
  5: [
    { business_name: "Corona Complete Auto & Brakes", phone: "(951) 371-2211", address: "13394 Limonite Ave", rating: 4.8, review_count: 132, avg_ticket: 550, dm: "Ricardo Silva", hook_es: "Pastillas de freno cerámicas $99 por eje", hook_en: "$99 ceramic brake pads per axle" },
    { business_name: "Apex Precision Auto Repair", phone: "(951) 842-9900", address: "12610 Limonite Ave", rating: 4.9, review_count: 98, avg_ticket: 680, dm: "Manuel Vega", hook_es: "Diagnóstico check engine y batería gratis", hook_en: "Free check engine light scan" },
    { business_name: "Eastvale Complete Car Care", phone: "(951) 582-4411", address: "7125 Hamner Ave", rating: 4.7, review_count: 75, avg_ticket: 490, dm: "Sam Patterson", hook_es: "Cambio de aceite sintético + rotación $39.99", hook_en: "$39.99 synthetic oil change + tire rotation" }
  ],
  6: [
    { business_name: "Bella Napoli Pizza Artesanal", phone: "(951) 898-4455", address: "12610 Limonite Ave", rating: 4.9, review_count: 190, avg_ticket: 55, dm: "Marco Rossi", hook_es: "Compra 1 pizza familiar y lleva la 2da al 50%", hook_en: "BOGO 50% off large wood-fired pizzas" },
    { business_name: "Eastvale Wood Fired Pizza & Pasta", phone: "(951) 371-8800", address: "12712 Limonite Ave", rating: 4.7, review_count: 112, avg_ticket: 48, dm: "Giuseppe Ferrara", hook_es: "Combo familiar: 2 pizzas + alitas + bebida $34.99", hook_en: "Family combo 2 pizzas + wings $34.99" },
    { business_name: "Rustica Crust Co.", phone: "(951) 734-5511", address: "7056 Archibald Ave", rating: 4.8, review_count: 85, avg_ticket: 52, dm: "Dante Valenti", hook_es: "Entrada de pan de ajo gratis con orden de $30+", hook_en: "Free garlic knots with $30 order" }
  ],
  7: [
    { business_name: "Apex Performance Studio", phone: "(951) 582-9011", address: "7125 Hamner Ave", rating: 4.9, review_count: 95, avg_ticket: 140, dm: "Brandon Scott", hook_es: "14 días VIP ilimitado por solo $19", hook_en: "14-day VIP pass for just $19" },
    { business_name: "Core & Pulse Boutique Fitness", phone: "(951) 842-7722", address: "12363 Limonite Ave", rating: 4.8, review_count: 67, avg_ticket: 160, dm: "Valeria Gomez", hook_es: "Clase de prueba gratis + evaluación corporal", hook_en: "Free intro class + body composition scan" },
    { business_name: "Eastvale Iron & Cardio Zone", phone: "(951) 493-6600", address: "14120 Schleisman Rd", rating: 4.7, review_count: 81, avg_ticket: 120, dm: "Jason Wright", hook_es: "$0 inscripción en membresías de 1 año", hook_en: "$0 initiation on annual memberships" }
  ],
  8: [
    { business_name: "California Sun & Solar IE", phone: "(951) 900-3412", address: "12523 Limonite Ave", rating: 4.9, review_count: 88, avg_ticket: 14500, dm: "Gabriel Torres", hook_es: "Cero pago inicial en paneles + inspección techo gratis", hook_en: "$0 down solar install + free roof health report" },
    { business_name: "Premier Roofing Solutions CA", phone: "(951) 734-2200", address: "12712 Limonite Ave", rating: 4.8, review_count: 64, avg_ticket: 12000, dm: "Luis Herrera", hook_es: "Garantía de 25 años en re-techado completo", hook_en: "25-year warranty on full reroofing" },
    { business_name: "Apex Roof & Solar Works", phone: "(951) 371-1199", address: "7010 Archibald Ave", rating: 4.7, review_count: 53, avg_ticket: 13500, dm: "Brian Larson", hook_es: "Batería de respaldo con $1,000 crédito federal", hook_en: "Battery backup system with $1,000 local incentive" }
  ],
  9: [
    { business_name: "Spine & Joint Wellness Center", phone: "(951) 817-9922", address: "12614 Limonite Ave", rating: 4.9, review_count: 104, avg_ticket: 480, dm: "Dr. Kevin Ramirez", hook_es: "Consulta quiropráctica + primer ajuste $39", hook_en: "Exam + adjustment introductory offer $39" },
    { business_name: "Active Life Physical Therapy", phone: "(951) 493-8833", address: "12363 Limonite Ave", rating: 4.8, review_count: 73, avg_ticket: 520, dm: "Dra. Monica Reyes", hook_es: "Terapia de descompresión y movilidad 30% off", hook_en: "30% off decompression spinal therapy" },
    { business_name: "Peak Motion Chiropractic", phone: "(951) 582-1144", address: "7125 Hamner Ave", rating: 4.7, review_count: 61, avg_ticket: 450, dm: "Dr. Alan Morales", hook_es: "Alivio ciática y postura: sesión de prueba $45", hook_en: "Sciatica & postural relief trial session $45" }
  ],
  10: [
    { business_name: "EcoClean Steam Masters IE", phone: "(951) 427-8100", address: "7010 Archibald Ave", rating: 4.9, review_count: 119, avg_ticket: 320, dm: "Fernando Castro", hook_es: "3 habitaciones con vapor caliente por $119", hook_en: "3 rooms hot steam clean for $119" },
    { business_name: "ProShine Carpet & Tile Care", phone: "(951) 734-9911", address: "12712 Limonite Ave", rating: 4.8, review_count: 84, avg_ticket: 340, dm: "Oscar Delgado", hook_es: "Limpieza profunda de baldosas y lechada $99", hook_en: "Tile & grout deep scrub $99 special" },
    { business_name: "Fresh & Clean Inland Empire", phone: "(951) 842-5500", address: "14120 Schleisman Rd", rating: 4.7, review_count: 68, avg_ticket: 290, dm: "Steven Ortiz", hook_es: "Desodorización y tratamiento antimanchas gratis", hook_en: "Free pet stain and odor neutralizer" }
  ],
  11: [
    { business_name: "Mirror Finish Mobile Spa", phone: "(951) 314-7788", address: "12410 Schleisman Rd", rating: 4.9, review_count: 140, avg_ticket: 220, dm: "Adrian Ramos", hook_es: "Detailing interior y exterior a domicilio 25% off", hook_en: "Mobile full interior & exterior detail 25% off" },
    { business_name: "Apex Auto Spa on Wheels", phone: "(951) 582-3377", address: "12610 Limonite Ave", rating: 4.8, review_count: 92, avg_ticket: 250, dm: "Hector Navas", hook_es: "Protección cerámica líquida + lavado $129", hook_en: "Liquid ceramic sealant package $129" },
    { business_name: "SoCal Mobile Ceramic & Detail", phone: "(951) 493-2211", address: "7056 Archibald Ave", rating: 4.7, review_count: 77, avg_ticket: 300, dm: "Danny Gomez", hook_es: "Desinfección de cabina con ozono gratis", hook_en: "Free ozone interior sanitization" }
  ],
  12: [
    { business_name: "Paws & Bubbles Grooming", phone: "(951) 736-5544", address: "12750 Limonite Ave", rating: 4.9, review_count: 125, avg_ticket: 85, dm: "Carolina Mejia", hook_es: "Baño, corte y limado de uñas $10 de descuento", hook_en: "Full bath, haircut & nail grind $10 off" },
    { business_name: "The Pampered Pooch Boutique", phone: "(951) 842-6633", address: "12363 Limonite Ave", rating: 4.8, review_count: 89, avg_ticket: 95, dm: "Rachel Adams", hook_es: "Tratamiento deslanado para razas medianas y grandes", hook_en: "Deshedding spa treatment package" },
    { business_name: "Bark & Bath Mobile Eastvale", phone: "(951) 371-7744", address: "7125 Hamner Ave", rating: 4.7, review_count: 64, avg_ticket: 110, dm: "Teresa Ruiz", hook_es: "Van móvil a tu puerta: 15% en primer servicio", hook_en: "Mobile grooming van to your door 15% off" }
  ],
  13: [
    { business_name: "Taquería & Cantina El Rancho", phone: "(951) 493-2288", address: "12569 Limonite Ave", rating: 4.9, review_count: 215, avg_ticket: 68, dm: "Gustavo Morales", hook_es: "Guacamole y totopos gratis con 2 platillos fuertes", hook_en: "Free fresh guacamole with purchase of 2 entrees" },
    { business_name: "Sabor Michoacano Authentic Grill", phone: "(951) 734-1188", address: "12712 Limonite Ave", rating: 4.8, review_count: 140, avg_ticket: 62, dm: "Javier Vargas", hook_es: "Carnitas estilo Michoacán: 2x1 en margaritas", hook_en: "Carnitas fiesta platter: 2-for-1 house margaritas" },
    { business_name: "La Hacienda Mexican Bistro", phone: "(951) 582-8855", address: "7010 Archibald Ave", rating: 4.7, review_count: 98, avg_ticket: 75, dm: "Claudia Nunez", hook_es: "Postre tradicional de cortesía en tu visita", hook_en: "Complimentary churros or flan with dinner" }
  ],
  14: [
    { business_name: "Empire Shield Insurance Agency", phone: "(951) 898-1122", address: "12716 Limonite Ave", rating: 4.9, review_count: 86, avg_ticket: 1400, dm: "Patricio Alarcon", hook_es: "Ahorra hasta $650 combinando auto y hogar", hook_en: "Bundle home & auto to save up to $650/yr" },
    { business_name: "Stateline Auto & Home Coverage", phone: "(951) 371-3322", address: "12363 Limonite Ave", rating: 4.8, review_count: 65, avg_ticket: 1350, dm: "Patricia Campbell", hook_es: "Revisión gratuita de póliza y cotización en 10 min", hook_en: "10-minute free policy comparison" },
    { business_name: "Pacific Choice Financial & Insurance", phone: "(951) 842-4488", address: "14120 Schleisman Rd", rating: 4.7, review_count: 52, avg_ticket: 1500, dm: "Esteban Vega", hook_es: "Cobertura comercial y personal al mejor precio del IE", hook_en: "Personal & commercial umbrella discounts" }
  ]
};

let campaignsStore: any[] = [seedDefaultCampaign()];
let nextCampaignId = 2;

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

      // GET /api/campaigns
      if (cleanPath === "/api/campaigns" && request.method === "GET") {
        const mode = url.searchParams.get("mode") || "DEMO";
        const archived = url.searchParams.get("archived") === "true";
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

      // Match /api/campaigns/:id/slots/autofill
      const autofillMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/slots\/autofill$/);
      if (autofillMatch && request.method === "POST") {
        const campId = autofillMatch[1];
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        let filledCount = 0;
        for (const s of c.slots) {
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
        return json({ filled_count: filledCount, total_slots: c.slots.length, slots: c.slots });
      }

      // Match /api/campaigns/:id/slots/:slotNumber/next-candidate
      const nextCandidateMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/slots\/(\d+)\/next-candidate$/);
      if (nextCandidateMatch && request.method === "POST") {
        const campId = nextCandidateMatch[1];
        const slotNum = parseInt(nextCandidateMatch[2]);
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        const s = c.slots.find((x: any) => x.slot_number === slotNum);
        if (!s) return json({ detail: "Slot not found" }, 404);
        const candidates = SEED_PROSPECTS[slotNum] || [];
        const currentName = (s.business_name || "").toLowerCase();
        const next = candidates.find(cand => cand.business_name.toLowerCase() !== currentName) || candidates[0];
        if (next) {
          s.business_name = next.business_name;
          s.phone = next.phone;
          s.contact_person = next.dm;
          s.business_address = next.address;
          s.status = "PROSPECTING";
        }
        return json({ candidate: next, slot: s });
      }

      // Match /api/campaigns/:id/slots/mark-all-paid
      const markAllPaidMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/slots\/mark-all-paid$/);
      if (markAllPaidMatch && request.method === "POST") {
        const campId = markAllPaidMatch[1];
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        let total = 0;
        const stamped: number[] = [];
        for (const s of c.slots) {
          s.status = "PAID";
          s.paid_at = new Date().toISOString();
          s.amount_collected_usd = s.price_usd;
          s.payment_ref = "SIMULACIÓN";
          total += s.price_usd;
          stamped.push(s.slot_number);
        }
        c.paid_count = c.slots.length;
        c.total_collected_usd = total;
        c.status = "LOCKED_READY";
        return json({ stamped, collected: total });
      }

      // Match /api/campaigns/:id/archive
      const archiveMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/archive$/);
      if (archiveMatch && request.method === "POST") {
        const campId = archiveMatch[1];
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (c) c.archived_at = new Date().toISOString();
        return json({ ok: true });
      }

      // Match /api/campaigns/:id/slots/:slotId
      const slotMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/slots\/(\d+)$/);
      if (slotMatch && request.method === "PUT") {
        const campId = slotMatch[1];
        const slotNum = parseInt(slotMatch[2]);
        const body: any = await request.json();
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        const s = c.slots.find((x: any) => x.slot_number === slotNum);
        if (!s) return json({ detail: "Slot not found" }, 404);
        Object.assign(s, body);
        return json(s);
      }

      // Match /api/campaigns/:id/batch-slots
      const batchMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/batch-slots$/);
      if (batchMatch && (request.method === "POST" || request.method === "PUT")) {
        const campId = batchMatch[1];
        const body: any = await request.json();
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        for (const update of (body.slots || [])) {
          const s = c.slots.find((x: any) => x.slot_number === update.slot_number);
          if (s) Object.assign(s, update);
        }
        return json(c.slots);
      }

      // Match /api/campaigns/:id/reset-slots
      const resetMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)\/reset-slots$/);
      if (resetMatch && request.method === "POST") {
        const campId = resetMatch[1];
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        c.slots = createDefaultSlots(c.target_households || 5000);
        c.paid_count = 0;
        c.total_collected_usd = 0;
        return json(c.slots);
      }

      // Match /api/campaigns/:id
      const campMatch = cleanPath.match(/^\/api\/campaigns\/([^/]+)$/);
      if (campMatch && request.method === "GET") {
        const campId = campMatch[1];
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        return json(c);
      }

      if (campMatch && request.method === "PATCH") {
        const campId = campMatch[1];
        const c = campaignsStore.find(x => String(x.id) === campId);
        if (!c) return json({ detail: "Campaign not found" }, 404);
        const body: any = await request.json();
        Object.assign(c, body, { updated_at: new Date().toISOString() });
        return json(c);
      }

      if (campMatch && request.method === "DELETE") {
        const campId = campMatch[1];
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

        const response = filtered.map((item, idx) => ({
          id: `LEAD-${catId}-${idx + 1}-${targetZip}`,
          category_id: catId,
          category_name: slotDef?.name || "Comercio Local",
          business_name: item.business_name,
          name: item.business_name,
          address: item.address,
          city: targetCity,
          zip: targetZip,
          zip_code: targetZip,
          phone: item.phone,
          rating: item.rating,
          review_count: item.review_count,
          website_url: `https://www.${item.business_name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
          source: "Simulación Edge / Yelp Fusion",
          decision_maker: item.dm || "Owner / Decision Maker",
          decision_maker_title: "Owner / Decision Maker",
          avg_ticket_estimated: item.avg_ticket || 500,
          hook_en: item.hook_en,
          hook_es: item.hook_es,
          roi_pitch: `Con solo 1 o 2 clientes nuevos este espacio se amortiza al 100%. Ticket estimado $${item.avg_ticket || 500}.`,
          status: "NEW"
        }));

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
            dm: "Gerente General",
            hook_es: "Promoción especial para residentes locales",
            hook_en: "Exclusive neighborhood resident promotion"
          };
        }
        const slotDef = INITIAL_SLOT_DEFS.find(d => d.slot_number === catId);
        return json({
          id: `LEAD-${catId}-REP-${Date.now().toString().slice(-4)}`,
          category_id: catId,
          category_name: slotDef?.name || "Comercio Local",
          business_name: candidate.business_name,
          name: candidate.business_name,
          address: candidate.address,
          city: targetCity,
          zip_code: targetZip,
          phone: candidate.phone,
          rating: candidate.rating,
          review_count: candidate.review_count,
          website_url: `https://www.${candidate.business_name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
          source: "Simulación Edge / Yelp Fusion",
          decision_maker: candidate.dm,
          decision_maker_title: "Owner / Decision Maker",
          avg_ticket_estimated: candidate.avg_ticket || 500,
          hook_en: candidate.hook_en,
          hook_es: candidate.hook_es,
          status: "NEW"
        });
      }

      // Prospecting: PATCH /api/prospecting/leads/:id
      const leadMatch = cleanPath.match(/^\/api\/prospecting\/leads\/([^/]+)$/);
      if (leadMatch && request.method === "PATCH") {
        return json({ id: leadMatch[1], status: "UPDATED", ok: true });
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

      // Costs: /api/costs/:mode
      const costMatch = cleanPath.match(/^\/api\/costs\/(DEMO|LIVE)$/i);
      if (costMatch) {
        return json({
          mode: costMatch[1].toUpperCase(),
          data_cpm: 0.0,
          print_per_piece: 0.12,
          inkjet_per_piece: 0.02,
          presort_per_piece: 0.01,
          finish_per_piece: 0.01,
          postage_per_piece: 0.247,
          setup_flat: 0.0,
          delivery_flat: 0.0,
          target_margin: 0.50,
          target_households: 5000,
          unit_cost: 0.642,
          fixed_cost: 375.0,
          preview_households: 5000,
          preview_total_cost: 3585.0,
          suggested_prices: {
            1: 850.0, 2: 497.0, 3: 497.0, 4: 497.0, 5: 497.0,
            6: 497.0, 7: 497.0, 8: 497.0, 9: 497.0, 10: 497.0,
            11: 497.0, 12: 497.0, 13: 497.0, 14: 640.0
          }
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

      // Datasources
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
