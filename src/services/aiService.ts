import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';

/* ─── Types ─── */
export interface AutofillResult {
  name: string;
  brand: string;
  category: string;
  description: string;
  price: number;
  discountPrice: number | null;
  sku: string;
  stock: number;
  specifications: {
    weight: string;
    material: string;
    certifications: string[];
    visorType: string;
    ventilation: boolean;
    features: string[];
  };
  variants: {
    size: string;
    color: string;
    stock: number;
    additionalPrice: number;
  }[];
}

/* ─── Category-specific prompt context ─── */
interface CategoryContext {
  productType: string;
  brandExamples: string;
  materialOptions: string;
  specField1Label: string;
  specField1Options: string;
  specField2Label: string;
  certOptions: string;
  sizeNote: string;
  priceRange: string;
  categoryValues: string;
}

const CATEGORY_CONTEXTS: Record<string, CategoryContext> = {
  helmet: {
    productType: 'motorcycle helmet',
    brandExamples: 'Steelbird, HJC, Arai, Shoei, MT, LS2, Studds, Vega, AGV, Bell, Axor, SMK',
    materialOptions: 'ABS, Polycarbonate, Fiberglass, Carbon Fiber, Kevlar Composite, Thermoplastic',
    specField1Label: 'visorType',
    specField1Options: 'Clear, Tinted, Smoke, Iridium, Pinlock Ready, Anti-fog, Double Visor, None',
    specField2Label: 'ventilation (boolean: true/false)',
    certOptions: 'ISI, DOT, ECE 22.05, ECE 22.06, SNELL, FIM, SHARP 5-Star',
    sizeNote: 'Helmets come in sizes: XS, S, M, L, XL, XXL. Include multiple sizes.',
    priceRange: '₹1,500 to ₹60,000',
    categoryValues: 'FULL_FACE, HALF_FACE, OPEN_FACE, MODULAR, OFF_ROAD, KIDS, LADIES',
  },
  gear: {
    productType: 'motorcycle riding gear',
    brandExamples: 'Rynox, Alpinestars, Dainese, Royal Enfield, Raida, Solace, Mototech, Viaterra',
    materialOptions: 'Leather, Textile, Mesh, Cordura, Polyester, Nylon, Kevlar, Gore-Tex, Drystar',
    specField1Label: 'visorType (use this as Protection Level)',
    specField1Options: 'CE Level 1, CE Level 2, D3O, Knox, SAS-TEC, Foam, None',
    specField2Label: 'ventilation (use as waterproof boolean)',
    certOptions: 'CE, EN 13594, EN 13595, EN 17092, EN 13634',
    sizeNote: 'Available in sizes: XS, S, M, L, XL, XXL. Include popular sizes.',
    priceRange: '₹1,000 to ₹25,000',
    categoryValues: 'JACKETS, GLOVES, BOOTS, RIDING_PANTS',
  },
  parts: {
    productType: 'motorcycle/two-wheeler spare part or component',
    brandExamples: 'Rolon, RK, DID, Brembo, Ferodo, EBC, NGK, Bosch, Denso, Endurance, Minda',
    materialOptions: 'Steel, Aluminium, Rubber, Plastic, Carbon Fiber, Brass, Chrome, Cast Iron',
    specField1Label: 'visorType (use this as Fitment/Compatibility — list compatible bike models)',
    specField1Options: 'Free text — e.g. "Honda CB350, Royal Enfield Classic 350"',
    specField2Label: 'ventilation (use as OEM Compatible boolean)',
    certOptions: 'OEM, Aftermarket, ISO Certified',
    sizeNote: 'Use FREE_SIZE for most parts. If size-specific (e.g. brake pads for different models), create variants by model name in the color field.',
    priceRange: '₹100 to ₹15,000',
    categoryValues: 'PARTS, SPARE_PARTS',
  },
  oil: {
    productType: 'motorcycle engine oil / lubricant / fluid',
    brandExamples: 'Motul, Castrol, Shell, Liqui Moly, HP, Gulf, Mobil, Repsol, Ipone',
    materialOptions: 'Mineral, Semi-Synthetic, Fully Synthetic, Gear Oil, Fork Oil, Chain Lube, Coolant',
    specField1Label: 'visorType (use this as Viscosity Grade)',
    specField1Options: '10W-30, 10W-40, 10W-50, 15W-40, 15W-50, 20W-40, 20W-50, 5W-40, 75W-90, 80W-90, N/A',
    specField2Label: 'ventilation (use as Suitable for 4-Stroke boolean)',
    certOptions: 'JASO MA, JASO MA2, JASO MB, API SL, API SN, API SM, API SG',
    sizeNote: 'Use FREE_SIZE. Create variants for different volumes (500ml, 1L, 2.5L, 4L) using the color field for volume label.',
    priceRange: '₹200 to ₹3,000',
    categoryValues: 'OIL, OILS, ENGINE_OIL',
  },
  luggage: {
    productType: 'motorcycle luggage / bag / touring accessory',
    brandExamples: 'Viaterra, Rynox, RA Accessories, Guardian Gears, Solace, SW-Motech, Givi, Shad',
    materialOptions: 'Nylon, Polyester, Cordura, Semi-Hard, Hard Case, Aluminium, Canvas, PVC',
    specField1Label: 'visorType (use this as Capacity)',
    specField1Options: '5-10L, 10-20L, 20-30L, 30-40L, 40-50L, 50L+',
    specField2Label: 'ventilation (use as Waterproof boolean)',
    certOptions: 'Reflective, Rain Cover Included, Quick Release, Lockable, Expandable',
    sizeNote: 'Use FREE_SIZE for most luggage. Create color variants if product comes in different colors.',
    priceRange: '₹500 to ₹20,000',
    categoryValues: 'LUGGAGE',
  },
  electronics: {
    productType: 'motorcycle electronic accessory (intercom, camera, charger, lights etc.)',
    brandExamples: 'Cardo, Sena, GoPro, Bobo, RAM Mounts, Minda, Osram, Philips',
    materialOptions: 'Plastic, Metal, Rubber, ABS, Aluminium, Silicone',
    specField1Label: 'visorType (use this as Connectivity type)',
    specField1Options: 'Bluetooth 5.0, Bluetooth 5.3, USB-C, Wired, WiFi, N/A',
    specField2Label: 'ventilation (use as Waterproof boolean)',
    certOptions: 'CE, FCC, RoHS, IP65, IP67, BIS',
    sizeNote: 'Use FREE_SIZE for most electronics.',
    priceRange: '₹300 to ₹30,000',
    categoryValues: 'ELECTRONICS',
  },
  accessories: {
    productType: 'motorcycle accessory',
    brandExamples: 'Royal Enfield, Bobo, RA Accessories, Pro Biker, Cramster, Generic',
    materialOptions: 'Plastic, Metal, Rubber, Nylon, Leather, Silicone, Carbon Fiber, Neoprene',
    specField1Label: 'visorType (use this as Type/Sub-category description)',
    specField1Options: 'Free text — e.g. "Phone Mount", "Handlebar Grip"',
    specField2Label: 'ventilation (use as Universal Fit boolean)',
    certOptions: 'CE, ISO, OEM, RoHS',
    sizeNote: 'Use FREE_SIZE. Create variants by color if available.',
    priceRange: '₹100 to ₹5,000',
    categoryValues: 'ACCESSORIES',
  },
};

/** Map a category value to its context key */
function getCategoryContext(category?: string): CategoryContext {
  if (!category) return CATEGORY_CONTEXTS.accessories; // fallback
  const upper = category.toUpperCase().replace(/\s+/g, '_');

  // Check direct matches
  const helmetCats = ['FULL_FACE', 'HALF_FACE', 'OPEN_FACE', 'MODULAR', 'OFF_ROAD', 'KIDS', 'LADIES'];
  const gearCats = ['JACKETS', 'GLOVES', 'BOOTS', 'RIDING_PANTS'];
  const partsCats = ['PARTS', 'SPARE_PARTS', 'SPEAR_PARTS'];
  const oilCats = ['OIL', 'OILS', 'ENGINE_OIL'];
  const luggageCats = ['LUGGAGE'];
  const electronicsCats = ['ELECTRONICS'];

  if (helmetCats.includes(upper)) return CATEGORY_CONTEXTS.helmet;
  if (gearCats.includes(upper)) return CATEGORY_CONTEXTS.gear;
  if (partsCats.includes(upper)) return CATEGORY_CONTEXTS.parts;
  if (oilCats.includes(upper)) return CATEGORY_CONTEXTS.oil;
  if (luggageCats.includes(upper)) return CATEGORY_CONTEXTS.luggage;
  if (electronicsCats.includes(upper)) return CATEGORY_CONTEXTS.electronics;
  return CATEGORY_CONTEXTS.accessories;
}

/** Build a category-aware system prompt */
function buildSystemPrompt(ctx: CategoryContext): string {
  return `You are a ${ctx.productType} product data specialist for BikersBrain, an Indian e-commerce store for motorcycle parts, accessories & riding gear.
When given a product name, provide accurate details based on your knowledge.
Return ONLY valid JSON (no markdown, no code blocks, no explanation) matching this exact schema:

{
  "name": "Full product name with brand and model",
  "brand": "Brand name only (e.g. ${ctx.brandExamples})",
  "category": "One of: ${ctx.categoryValues}",
  "description": "Detailed 150-300 word SEO-friendly product description. Mention features, specifications, benefits, material quality, and target audience. Use natural language.",
  "price": <number in INR, the MRP/retail price — typical range: ${ctx.priceRange}>,
  "discountPrice": <number in INR, a reasonable selling price (5-15% less than MRP), or null>,
  "sku": "AUTO-GENERATED SKU like BRAND-MODEL-001",
  "stock": 50,
  "specifications": {
    "weight": "Weight or volume (e.g. '1450g', '1L', '350g')",
    "material": "One of: ${ctx.materialOptions}",
    "certifications": ["Applicable from: ${ctx.certOptions}"],
    "${ctx.specField1Label}": "${ctx.specField1Options}",
    "${ctx.specField2Label}": true or false,
    "features": ["Array of 3-8 key product features"]
  },
  "variants": [
    {"size": "M", "color": "Main variant", "stock": 15, "additionalPrice": 0}
  ]
}

IMPORTANT RULES:
1. Product is a ${ctx.productType}. Do NOT generate helmet data for non-helmet products.
2. Prices MUST be in Indian Rupees (INR). Indian market prices only.
3. ${ctx.sizeNote}
4. Valid sizes: XS, S, M, L, XL, XXL, FREE_SIZE
5. Return ONLY the JSON object, nothing else.
6. Use realistic product data — real brand names, real specs, actual Indian pricing.`;
}

/**
 * Use Google Gemini to autofill product details — category-aware
 */
export async function autofillProductDetails(productName: string, category?: string): Promise<AutofillResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please add it to your .env file.');
  }

  const ctx = getCategoryContext(category);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: buildSystemPrompt(ctx),
  });

  logger.info(`🤖 AI Autofill: Searching for "${productName}" (${ctx.productType}) using Gemini...`);

  const userPrompt = `Provide complete, accurate product details for this ${ctx.productType}: "${productName}"

Based on your knowledge, provide the real MRP price in INR, actual specifications, certifications, available variants, and all other details. For Indian brands use Indian market pricing. For international brands provide Indian import/market prices.

The category should be one of: ${ctx.categoryValues}

Return ONLY the JSON object.`;

  try {
    const result = await model.generateContent(userPrompt);
    const response = result.response;
    const content = response.text();

    if (!content) {
      throw new Error('No response received from Gemini');
    }

    logger.info(`🤖 AI Autofill: Got response for "${productName}"`);

    // Parse JSON from response (handle potential markdown fences)
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr) as AutofillResult;
    const sanitized = sanitizeResult(parsed, productName, ctx);

    logger.info(`✅ AI Autofill: Successfully parsed data for "${sanitized.name}"`);
    return sanitized;
  } catch (error: any) {
    logger.error(`❌ AI Autofill failed for "${productName}":`, {
      message: error.message,
      status: error.status,
      statusText: error.statusText,
      errorDetails: error.response?.data || error.errorDetails || error.toString(),
    });

    if (error.message?.includes('JSON')) {
      throw new Error('AI returned invalid data format. Please try again with a more specific product name.');
    }
    if (error.status === 401 || error.status === 403) {
      throw new Error(`AI API Key error (${error.status}): ${error.message}. Check your GEMINI_API_KEY is valid.`);
    }
    if (error.message?.includes('API key') || error.message?.includes('API_KEY')) {
      throw new Error(`AI service authentication failed: ${error.message}. Please check your GEMINI_API_KEY.`);
    }
    if (error.status === 429) {
      throw new Error('AI service rate limit exceeded. Please wait a moment and try again.');
    }
    throw new Error(`AI autofill failed: ${error.message || error.toString()}`);
  }
}

/* ─── Sanitize & Validate Result ─── */
function sanitizeResult(raw: any, originalQuery: string, ctx: CategoryContext): AutofillResult {
  const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE_SIZE'];

  // Use category from AI response or first valid value from context
  let category = raw.category?.toUpperCase?.()?.replace(/\s+/g, '_') || ctx.categoryValues.split(', ')[0];

  // Ensure price is a positive number
  let price = parseFloat(raw.price) || 0;
  if (price <= 0) price = 999;

  let discountPrice = raw.discountPrice ? parseFloat(raw.discountPrice) : null;
  if (discountPrice && discountPrice >= price) {
    discountPrice = Math.round(price * 0.9);
  }

  const brand = raw.brand || 'UNKNOWN';
  const sku = raw.sku || `${brand.toUpperCase().replace(/\s+/g, '-')}-${Date.now().toString(36).toUpperCase()}`;

  // Sanitize specifications — accept whatever AI returns (no helmet-forced defaults)
  const specs = raw.specifications || {};
  const material = specs.material || 'N/A';

  const certifications = Array.isArray(specs.certifications)
    ? specs.certifications.slice(0, 10)
    : [];

  // Sanitize variants
  const variants = Array.isArray(raw.variants)
    ? raw.variants
        .filter((v: any) => v.size && validSizes.includes(v.size))
        .map((v: any) => ({
          size: v.size,
          color: v.color || 'Default',
          stock: Math.max(0, parseInt(v.stock) || 10),
          additionalPrice: parseFloat(v.additionalPrice) || 0,
        }))
    : [
        { size: 'FREE_SIZE', color: 'Default', stock: 20, additionalPrice: 0 },
      ];

  return {
    name: raw.name || originalQuery,
    brand,
    category,
    description: raw.description || `Premium quality ${brand} product. ${originalQuery}.`,
    price,
    discountPrice,
    sku,
    stock: Math.max(0, parseInt(raw.stock) || 50),
    specifications: {
      weight: specs.weight || 'N/A',
      material,
      certifications,
      visorType: specs.visorType || 'N/A',
      ventilation: specs.ventilation !== false,
      features: Array.isArray(specs.features) ? specs.features.slice(0, 10) : [],
    },
    variants,
  };
}
