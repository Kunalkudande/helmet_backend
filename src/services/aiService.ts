import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';

/* ─── Types ─── */
export interface AutofillResult {
  name: string;
  brand: string;
  category:
    | 'FULL_FACE' | 'HALF_FACE' | 'OPEN_FACE' | 'MODULAR' | 'OFF_ROAD' | 'KIDS' | 'LADIES'
    | 'JACKETS' | 'GLOVES' | 'BOOTS' | 'RIDING_PANTS'
    | 'ACCESSORIES' | 'PARTS' | 'LUGGAGE' | 'ELECTRONICS';
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

/* ─── System Prompt ─── */
const SYSTEM_PROMPT = `You are a helmet product data specialist for an Indian e-commerce store. 
When given a helmet product name, you should provide accurate product details based on your knowledge of that product.
Return ONLY valid JSON (no markdown, no code blocks, no explanation) matching this exact schema:

{
  "name": "Full product name with brand and model",
  "brand": "Brand name only (e.g. Steelbird, HJC, Arai, Shoei, MT, LS2, Studds, Vega, AGV, Bell)",
  "category": "One of: FULL_FACE, HALF_FACE, OPEN_FACE, MODULAR, OFF_ROAD, KIDS, LADIES",
  "description": "Detailed 150-300 word SEO-friendly product description with features, specs, and benefits. Use natural language, not bullet points. Mention safety certifications, comfort features, material quality, and target audience.",
  "price": <number in INR, the MRP/retail price>,
  "discountPrice": <number in INR, a reasonable selling price (5-15% less than MRP), or null if unknown>,
  "sku": "AUTO-GENERATED SKU like BRAND-MODEL-001",
  "stock": 50,
  "specifications": {
    "weight": "Weight in grams or kg (e.g. '1450g' or '1.45 kg')",
    "material": "One of: ABS, Polycarbonate, Fiberglass, Carbon Fiber, Kevlar Composite, Thermoplastic",
    "certifications": ["Array of applicable: ISI, DOT, ECE 22.05, ECE 22.06, SNELL, FIM, SHARP 5-Star"],
    "visorType": "One of: Clear, Tinted, Smoke, Iridium, Pinlock Ready, Anti-fog, Double Visor, None",
    "ventilation": true,
    "features": ["Array of 3-8 key features like 'Removable inner lining', 'Quick-release buckle', etc."]
  },
  "variants": [
    {"size": "S", "color": "Main color", "stock": 10, "additionalPrice": 0},
    {"size": "M", "color": "Main color", "stock": 15, "additionalPrice": 0},
    {"size": "L", "color": "Main color", "stock": 15, "additionalPrice": 0},
    {"size": "XL", "color": "Main color", "stock": 10, "additionalPrice": 0}
  ]
}

IMPORTANT RULES:
1. Provide accurate REAL product details based on your knowledge. Do NOT make up unrealistic information.
2. Prices MUST be in Indian Rupees (INR). If you know USD/EUR prices, convert to INR.
3. If exact price is not found in your knowledge, estimate based on similar products from the same brand.
4. Include ALL available sizes the helmet typically comes in.
5. If multiple color options exist, create variant entries for the most popular 2-3 colors across sizes.
6. The category must be one of the exact enum values listed.
7. Valid sizes are: XS, S, M, L, XL, XXL, FREE_SIZE
8. Return ONLY the JSON object, nothing else. No markdown fences.`;

/**
 * Use Google Gemini with Google Search grounding to find real helmet product details
 */
export async function autofillProductDetails(productName: string): Promise<AutofillResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please add it to your .env file.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  logger.info(`🤖 AI Autofill: Searching for "${productName}" using Gemini...`);

  const userPrompt = `Provide complete, accurate product details for this helmet: "${productName}"

Based on your knowledge, provide the real MRP price in INR, actual specifications, certifications, available sizes, colors, and all other details. For Indian brands (like Steelbird, Studds, Vega, Axor, etc.) use Indian market pricing. For international brands (AGV, Shoei, Arai, HJC, etc.) provide Indian market prices.

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

    // Remove markdown code fences if present
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

    // Validate and sanitize the response
    const sanitized = sanitizeResult(parsed, productName);

    logger.info(`✅ AI Autofill: Successfully parsed data for "${sanitized.name}"`);

    return sanitized;
  } catch (error: any) {
    // Log full error details for debugging
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
      throw new Error(`AI API Key error (${error.status}): ${error.message}. Check your GEMINI_API_KEY is valid and has Generative AI API enabled.`);
    }

    if (error.message?.includes('API key') || error.message?.includes('API_KEY')) {
      throw new Error(`AI service authentication failed: ${error.message}. Please check your GEMINI_API_KEY.`);
    }

    if (error.status === 429) {
      throw new Error('AI service rate limit exceeded. Please wait a moment and try again.');
    }

    // Return the actual error message for better debugging
    throw new Error(`AI autofill failed: ${error.message || error.toString()}`);
  }
}

/* ─── Sanitize & Validate Result ─── */
function sanitizeResult(raw: any, originalQuery: string): AutofillResult {
  const validCategories = [
    'FULL_FACE', 'HALF_FACE', 'OPEN_FACE', 'MODULAR', 'OFF_ROAD', 'KIDS', 'LADIES',
    'JACKETS', 'GLOVES', 'BOOTS', 'RIDING_PANTS',
    'ACCESSORIES', 'PARTS', 'LUGGAGE', 'ELECTRONICS',
  ];
  const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE_SIZE'];

  // Ensure category is valid
  let category = raw.category?.toUpperCase?.()?.replace(/\s+/g, '_') || 'FULL_FACE';
  if (!validCategories.includes(category)) {
    category = 'FULL_FACE';
  }

  // Ensure price is a positive number
  let price = parseFloat(raw.price) || 0;
  if (price <= 0) price = 2999; // Sensible default for helmets

  let discountPrice = raw.discountPrice ? parseFloat(raw.discountPrice) : null;
  if (discountPrice && discountPrice >= price) {
    discountPrice = Math.round(price * 0.9); // 10% discount
  }

  // Generate SKU if missing
  const brand = raw.brand || 'UNKNOWN';
  const sku = raw.sku || `${brand.toUpperCase().replace(/\s+/g, '-')}-${Date.now().toString(36).toUpperCase()}`;

  // Sanitize specifications
  const specs = raw.specifications || {};
  const validMaterials = ['ABS', 'Polycarbonate', 'Fiberglass', 'Carbon Fiber', 'Kevlar Composite', 'Thermoplastic'];
  const material = validMaterials.includes(specs.material) ? specs.material : (specs.material || 'ABS');

  const validCerts = ['ISI', 'DOT', 'ECE 22.05', 'ECE 22.06', 'SNELL', 'FIM', 'SHARP 5-Star'];
  const certifications = Array.isArray(specs.certifications)
    ? specs.certifications.filter((c: string) => validCerts.includes(c))
    : [];

  // Sanitize variants
  const variants = Array.isArray(raw.variants)
    ? raw.variants
        .filter((v: any) => v.size && validSizes.includes(v.size))
        .map((v: any) => ({
          size: v.size,
          color: v.color || 'Matt Black',
          stock: Math.max(0, parseInt(v.stock) || 10),
          additionalPrice: parseFloat(v.additionalPrice) || 0,
        }))
    : [
        { size: 'M', color: 'Matt Black', stock: 15, additionalPrice: 0 },
        { size: 'L', color: 'Matt Black', stock: 15, additionalPrice: 0 },
        { size: 'XL', color: 'Matt Black', stock: 10, additionalPrice: 0 },
      ];

  return {
    name: raw.name || originalQuery,
    brand,
    category: category as AutofillResult['category'],
    description: raw.description || `Premium quality ${brand} helmet. ${originalQuery}.`,
    price,
    discountPrice,
    sku,
    stock: Math.max(0, parseInt(raw.stock) || 50),
    specifications: {
      weight: specs.weight || 'N/A',
      material,
      certifications,
      visorType: specs.visorType || 'Clear',
      ventilation: specs.ventilation !== false,
      features: Array.isArray(specs.features) ? specs.features.slice(0, 10) : [],
    },
    variants,
  };
}
