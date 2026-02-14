import { PrismaClient } from '@prisma/client';

// Inline enum types matching prisma schema
type Category = 'FULL_FACE' | 'HALF_FACE' | 'OPEN_FACE' | 'MODULAR' | 'OFF_ROAD' | 'KIDS';
type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'FREE_SIZE';
type Role = 'CUSTOMER' | 'ADMIN';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/* ──────────────────────────── HELPER ──────────────────────────── */

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

const IMG = (n: number) =>
  `https://placehold.co/800x800/1F2937/FF6B35?text=Helmet+${n}`;

/* ──────────────────────────── PRODUCTS ─────────────────────────── */

interface SeedProduct {
  name: string;
  brand: string;
  category: Category;
  description: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  sku: string;
  spec: {
    weight: string;
    material: string;
    certifications: string[];
    visorType: string;
    ventilation: boolean;
    features: string[];
  };
  variants: { size: Size; color: string; stock: number }[];
}

const products: SeedProduct[] = [
  /* ── FULL FACE (10) ────────────────────────────────────────── */
  {
    name: 'Vega Bolt Full Face Helmet',
    brand: 'Vega',
    category: 'FULL_FACE',
    description:
      'The Vega Bolt is a lightweight full-face helmet designed for daily riders. With a robust ABS shell, aerodynamic design, and a quick-release visor, it provides excellent protection and comfort for your everyday commute. The helmet features multiple ventilation channels, a removable and washable interior liner, and ISI certification for assured safety.',
    price: 2499,
    discountPrice: 1999,
    stock: 40,
    sku: 'VEG-BOLT-001',
    spec: {
      weight: '1250g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Quick-release Anti-scratch',
      ventilation: true,
      features: ['Quick release visor', 'Removable liner', 'Chin curtain', 'Multiple vents'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 15 },
      { size: 'L', color: 'Matte Black', stock: 10 },
      { size: 'M', color: 'Glossy Red', stock: 8 },
      { size: 'XL', color: 'White', stock: 7 },
    ],
  },
  {
    name: 'Steelbird SBA-21 GT Full Face Helmet',
    brand: 'Steelbird',
    category: 'FULL_FACE',
    description:
      'The Steelbird SBA-21 GT features an advanced polycarbonate shell with high-impact resistance. Its multi-channel ventilation system keeps you cool on long rides. Comes with a chrome-plated visor mechanism and breathable fabric interior.',
    price: 3299,
    discountPrice: 2799,
    stock: 35,
    sku: 'STL-SBA21-001',
    spec: {
      weight: '1350g',
      material: 'High-Impact Polycarbonate',
      certifications: ['ISI', 'DOT'],
      visorType: 'Chrome plated anti-scratch',
      ventilation: true,
      features: ['Multi-channel ventilation', 'Chrome visor mechanism', 'Breathable interior', 'Aerodynamic design'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 12 },
      { size: 'L', color: 'Matte Black', stock: 10 },
      { size: 'L', color: 'Blue', stock: 8 },
      { size: 'XL', color: 'White & Red', stock: 5 },
    ],
  },
  {
    name: 'LS2 FF320 Stream Evo Full Face',
    brand: 'LS2',
    category: 'FULL_FACE',
    description:
      'A premium entry-level full-face from LS2 featuring HPTT (High Pressure Thermoplastic Technology) shell. Dual visor system with inner sun visor, pinlock-ready outer visor, and excellent ventilation. Perfect for riders who want international-quality safety at an accessible price.',
    price: 5499,
    discountPrice: 4799,
    stock: 20,
    sku: 'LS2-FF320-001',
    spec: {
      weight: '1450g',
      material: 'HPTT Shell',
      certifications: ['ISI', 'DOT', 'ECE'],
      visorType: 'Pinlock-ready dual visor',
      ventilation: true,
      features: ['Dual visor system', 'Pinlock ready', 'Quick release buckle', 'Laser cut comfort liner'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 8 },
      { size: 'L', color: 'Matte Black', stock: 6 },
      { size: 'L', color: 'White', stock: 4 },
      { size: 'XL', color: 'Gloss Black', stock: 2 },
    ],
  },
  {
    name: 'MT Thunder 4 SV Full Face',
    brand: 'MT Helmets',
    category: 'FULL_FACE',
    description:
      'MT Thunder 4 SV is a mid-range full-face helmet with advanced thermo-polymer shell. Features an integrated sun visor, wind-tunnel tested aerodynamics, and premium Coolmax interior lining. Excellent value for money.',
    price: 4999,
    discountPrice: 4499,
    stock: 18,
    sku: 'MT-THN4-001',
    spec: {
      weight: '1400g',
      material: 'Thermo-Polymer Shell',
      certifications: ['ISI', 'ECE'],
      visorType: 'Integrated sun visor + clear visor',
      ventilation: true,
      features: ['Integrated sun visor', 'Coolmax liner', 'Wind-tunnel tested', 'Emergency release system'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 6 },
      { size: 'L', color: 'Matte Black', stock: 5 },
      { size: 'L', color: 'Blue Graphic', stock: 4 },
      { size: 'XL', color: 'Red Graphic', stock: 3 },
    ],
  },
  {
    name: 'Axor Apex Carbon Full Face',
    brand: 'Axor',
    category: 'FULL_FACE',
    description:
      'Top-of-the-line full-face from Axor with a genuine carbon fibre shell. Ultra lightweight at just 1100g, with triple-certified safety. Features multi-density EPS liner, anti-fog pinlock visor, and premium Alcantara cheek pads.',
    price: 7999,
    discountPrice: 6999,
    stock: 10,
    sku: 'AXR-APEX-001',
    spec: {
      weight: '1100g',
      material: 'Carbon Fibre',
      certifications: ['ISI', 'DOT', 'ECE'],
      visorType: 'Anti-fog Pinlock with tear-off posts',
      ventilation: true,
      features: ['Carbon fibre shell', 'Pinlock visor', 'Alcantara cheek pads', 'Multi-density EPS', 'Aerodynamic spoiler'],
    },
    variants: [
      { size: 'M', color: 'Carbon Black', stock: 4 },
      { size: 'L', color: 'Carbon Black', stock: 3 },
      { size: 'L', color: 'Carbon Red', stock: 2 },
      { size: 'XL', color: 'Carbon Black', stock: 1 },
    ],
  },
  {
    name: 'Studds Thunder D5 Full Face',
    brand: 'Studds',
    category: 'FULL_FACE',
    description:
      'An affordable full-face helmet perfect for budget-conscious riders. The Studds Thunder D5 features high-density ABS shell, comfortable foam padding, and scratch-resistant visor. ISI certified for Indian roads.',
    price: 1999,
    discountPrice: 1699,
    stock: 50,
    sku: 'STD-THD5-001',
    spec: {
      weight: '1300g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Scratch-resistant clear visor',
      ventilation: true,
      features: ['High-density shell', 'Comfort foam padding', 'Air vents', 'Chin strap lock'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 20 },
      { size: 'L', color: 'Matte Black', stock: 15 },
      { size: 'L', color: 'White', stock: 10 },
      { size: 'XL', color: 'Glossy Black', stock: 5 },
    ],
  },
  {
    name: 'SMK Stellar Full Face Helmet',
    brand: 'SMK',
    category: 'FULL_FACE',
    description:
      'SMK Stellar combines safety with style. Polycarbonate shell with dual homologation visor, Bluetooth-ready intercom slot, and advanced ventilation. Great for city commuting and weekend rides.',
    price: 3999,
    discountPrice: 3499,
    stock: 22,
    sku: 'SMK-STLR-001',
    spec: {
      weight: '1380g',
      material: 'Polycarbonate Shell',
      certifications: ['ISI', 'ECE'],
      visorType: 'Dual homologation visor',
      ventilation: true,
      features: ['Bluetooth ready', 'Dual visor', 'Quick release buckle', 'Washable liner'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 8 },
      { size: 'L', color: 'Matte Black', stock: 7 },
      { size: 'L', color: 'Grey & Orange', stock: 4 },
      { size: 'XL', color: 'Matte Blue', stock: 3 },
    ],
  },
  {
    name: 'Royal Enfield Street Prime Full Face',
    brand: 'Royal Enfield',
    category: 'FULL_FACE',
    description:
      'Officially licensed Royal Enfield helmet with premium build quality. Features a reinforced shell, clear anti-fog visor, and RE-branded graphics. Designed for RE riders who want matching gear.',
    price: 3499,
    discountPrice: null,
    stock: 15,
    sku: 'RE-STRPR-001',
    spec: {
      weight: '1350g',
      material: 'Reinforced ABS Shell',
      certifications: ['ISI', 'DOT'],
      visorType: 'Anti-fog clear visor',
      ventilation: true,
      features: ['RE branded design', 'Anti-fog visor', 'Padded chin guard', 'Removable liner'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 5 },
      { size: 'L', color: 'Matte Black', stock: 5 },
      { size: 'L', color: 'Olive Green', stock: 3 },
      { size: 'XL', color: 'Matte Black', stock: 2 },
    ],
  },
  {
    name: 'Vega Storm Drift Full Face',
    brand: 'Vega',
    category: 'FULL_FACE',
    description:
      'The Vega Storm Drift features eye-catching graphics and solid protection. Aerodynamic shell design with air-flow channels keeps riders cool. Great for sports bike riders on a budget.',
    price: 2799,
    discountPrice: 2399,
    stock: 30,
    sku: 'VEG-STORM-001',
    spec: {
      weight: '1280g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Anti-scratch visor',
      ventilation: true,
      features: ['Aerodynamic design', 'Air-flow channels', 'Sporty graphics', 'Padded interior'],
    },
    variants: [
      { size: 'M', color: 'Black & Orange', stock: 10 },
      { size: 'L', color: 'Black & Orange', stock: 8 },
      { size: 'L', color: 'Black & Red', stock: 7 },
      { size: 'XL', color: 'Black & Blue', stock: 5 },
    ],
  },
  {
    name: 'Steelbird SBH-17 Terminator Full Face',
    brand: 'Steelbird',
    category: 'FULL_FACE',
    description:
      'The Terminator from Steelbird features an aggressive, sport-oriented design with hygienic interior and clear visor. Ideal for daily riders who want a stylish full-face helmet at an entry-level price.',
    price: 2199,
    discountPrice: 1899,
    stock: 45,
    sku: 'STL-SBH17-001',
    spec: {
      weight: '1300g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Clear polycarbonate visor',
      ventilation: true,
      features: ['Aggressive design', 'Hygienic interior', 'Adjustable visor', 'Chin vent'],
    },
    variants: [
      { size: 'S', color: 'Matte Black', stock: 10 },
      { size: 'M', color: 'Matte Black', stock: 15 },
      { size: 'L', color: 'Matte Black', stock: 10 },
      { size: 'L', color: 'Red', stock: 5 },
      { size: 'XL', color: 'Matte Black', stock: 5 },
    ],
  },

  /* ── HALF FACE (8) ─────────────────────────────────────────── */
  {
    name: 'Studds Cub 07 Half Face Helmet',
    brand: 'Studds',
    category: 'HALF_FACE',
    description:
      'Ultra-lightweight half-face helmet perfect for short city commutes. Simple, comfortable design with a clear visor and easy-to-use chinstrap. ISI certified and available in multiple colors.',
    price: 849,
    discountPrice: 749,
    stock: 60,
    sku: 'STD-CUB07-001',
    spec: {
      weight: '800g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Clear visor',
      ventilation: false,
      features: ['Lightweight design', 'Easy chin strap', 'Multiple colors', 'Comfortable padding'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 20 },
      { size: 'L', color: 'Matte Black', stock: 15 },
      { size: 'L', color: 'Silver', stock: 10 },
      { size: 'XL', color: 'White', stock: 15 },
    ],
  },
  {
    name: 'Vega Cruiser Open Face Half Helmet',
    brand: 'Vega',
    category: 'HALF_FACE',
    description:
      'Classic cruiser-style half helmet with peak visor. Perfect for scooter and cruiser riders. Lightweight construction with comfortable inner padding.',
    price: 1299,
    discountPrice: 1099,
    stock: 40,
    sku: 'VEG-CRSR-001',
    spec: {
      weight: '850g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Peak visor + clear visor',
      ventilation: true,
      features: ['Peak visor', 'Cruiser style', 'Inner padding', 'Quick-lock chin strap'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 12 },
      { size: 'L', color: 'Matte Black', stock: 12 },
      { size: 'L', color: 'Desert Storm', stock: 8 },
      { size: 'XL', color: 'Matte Black', stock: 8 },
    ],
  },
  {
    name: 'Steelbird SB-02 Classic Half Face',
    brand: 'Steelbird',
    category: 'HALF_FACE',
    description:
      'The SB-02 Classic is a no-frills half-face helmet for everyday use. Durable construction, adjustable visor, and padded interior provide a comfortable ride experience.',
    price: 999,
    discountPrice: null,
    stock: 55,
    sku: 'STL-SB02-001',
    spec: {
      weight: '780g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Adjustable clear visor',
      ventilation: false,
      features: ['Classic design', 'Durable build', 'Adjustable visor', 'Padded interior'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 20 },
      { size: 'L', color: 'Matte Black', stock: 15 },
      { size: 'L', color: 'White', stock: 10 },
      { size: 'XL', color: 'Silver', stock: 10 },
    ],
  },
  {
    name: 'Studds Urban Half Face Helmet',
    brand: 'Studds',
    category: 'HALF_FACE',
    description:
      'Trendy urban-style half-face helmet with smoked visor. Modern graphics and lightweight construction make it perfect for city riding. Comfortable for hot weather with excellent ventilation.',
    price: 1499,
    discountPrice: 1249,
    stock: 35,
    sku: 'STD-URBN-001',
    spec: {
      weight: '820g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Smoked visor',
      ventilation: true,
      features: ['Urban styling', 'Smoked visor', 'Ventilation channels', 'Modern graphics'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 12 },
      { size: 'L', color: 'Matte Black', stock: 10 },
      { size: 'L', color: 'Orange Graphic', stock: 8 },
      { size: 'XL', color: 'Blue Graphic', stock: 5 },
    ],
  },
  {
    name: 'Vega Eclipse Half Face',
    brand: 'Vega',
    category: 'HALF_FACE',
    description:
      'Budget-friendly half-face helmet from Vega. Simple, reliable, and comfortable — perfect for short trips. Available in a wide range of sizes.',
    price: 799,
    discountPrice: null,
    stock: 70,
    sku: 'VEG-ECLP-001',
    spec: {
      weight: '750g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Clear visor',
      ventilation: false,
      features: ['Budget friendly', 'Reliable build', 'Wide size range', 'Comfortable fit'],
    },
    variants: [
      { size: 'S', color: 'Matte Black', stock: 15 },
      { size: 'M', color: 'Matte Black', stock: 20 },
      { size: 'L', color: 'Matte Black', stock: 15 },
      { size: 'L', color: 'White', stock: 10 },
      { size: 'XL', color: 'Matte Black', stock: 10 },
    ],
  },
  {
    name: 'SMK Cooper Half Face',
    brand: 'SMK',
    category: 'HALF_FACE',
    description:
      'Premium half-face from SMK with retractable inner sun visor. ECE-certified for added safety. High-quality build with quick-release buckle system.',
    price: 2799,
    discountPrice: 2399,
    stock: 15,
    sku: 'SMK-COPR-001',
    spec: {
      weight: '900g',
      material: 'Polycarbonate Shell',
      certifications: ['ISI', 'ECE'],
      visorType: 'Retractable inner sun visor + clear',
      ventilation: true,
      features: ['Inner sun visor', 'ECE certified', 'Quick release buckle', 'Premium build'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 5 },
      { size: 'L', color: 'Matte Black', stock: 5 },
      { size: 'L', color: 'Anthracite', stock: 3 },
      { size: 'XL', color: 'White', stock: 2 },
    ],
  },
  {
    name: 'Royal Enfield MLG Half Face',
    brand: 'Royal Enfield',
    category: 'HALF_FACE',
    description:
      'Officially licensed RE half-face with vintage-inspired design. Premium padding, detachable peak visor, and RE logo embroidery. Made for the classic RE rider look.',
    price: 1999,
    discountPrice: 1799,
    stock: 25,
    sku: 'RE-MLG-001',
    spec: {
      weight: '880g',
      material: 'Fiberglass Composite',
      certifications: ['ISI', 'DOT'],
      visorType: 'Detachable peak + bubble visor',
      ventilation: false,
      features: ['Vintage design', 'RE branding', 'Premium padding', 'Detachable peak'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 8 },
      { size: 'L', color: 'Matte Black', stock: 8 },
      { size: 'L', color: 'Battle Green', stock: 5 },
      { size: 'XL', color: 'Matte Black', stock: 4 },
    ],
  },
  {
    name: 'Axor Jet Half Face Retro',
    brand: 'Axor',
    category: 'HALF_FACE',
    description:
      'Retro-styled half-face helmet from Axor. Leather-trim padding with goggle strap holder. Perfect for café racer enthusiasts. ISI + DOT dual certified.',
    price: 2499,
    discountPrice: 2199,
    stock: 12,
    sku: 'AXR-JET-001',
    spec: {
      weight: '870g',
      material: 'Fiberglass Shell',
      certifications: ['ISI', 'DOT'],
      visorType: 'Retractable bubble visor',
      ventilation: false,
      features: ['Retro design', 'Leather trim', 'Goggle strap', 'Dual certified'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 4 },
      { size: 'L', color: 'Matte Black', stock: 4 },
      { size: 'L', color: 'Cream & Brown', stock: 2 },
      { size: 'XL', color: 'Matte Black', stock: 2 },
    ],
  },

  /* ── OPEN FACE (5) ─────────────────────────────────────────── */
  {
    name: 'Studds Ninja Elite Open Face',
    brand: 'Studds',
    category: 'OPEN_FACE',
    description:
      'The Ninja Elite is a sporty open-face helmet with a wide visor for maximum field of vision. Features a scratch-resistant visor, comfortable EPS liner, and bold graphic designs.',
    price: 1499,
    discountPrice: 1299,
    stock: 30,
    sku: 'STD-NINJ-001',
    spec: {
      weight: '950g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Wide scratch-resistant visor',
      ventilation: true,
      features: ['Wide field of vision', 'Sporty graphics', 'EPS liner', 'Comfortable fit'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 10 },
      { size: 'L', color: 'Matte Black', stock: 8 },
      { size: 'L', color: 'Red & Black', stock: 7 },
      { size: 'XL', color: 'White', stock: 5 },
    ],
  },
  {
    name: 'Vega Jet Star Open Face',
    brand: 'Vega',
    category: 'OPEN_FACE',
    description:
      'Stylish open-face helmet ideal for scooter riders. The Jet Star offers a wide visor, lightweight shell, and comfortable padding. Available in trendy color options.',
    price: 1199,
    discountPrice: 999,
    stock: 35,
    sku: 'VEG-JSTR-001',
    spec: {
      weight: '900g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Clear flip-up visor',
      ventilation: true,
      features: ['Flip-up visor', 'Lightweight', 'Scooter friendly', 'Trendy colors'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 12 },
      { size: 'L', color: 'Matte Black', stock: 10 },
      { size: 'L', color: 'Baby Pink', stock: 5 },
      { size: 'L', color: 'Teal Blue', stock: 5 },
      { size: 'XL', color: 'White', stock: 3 },
    ],
  },
  {
    name: 'LS2 OF600 Copter Open Face',
    brand: 'LS2',
    category: 'OPEN_FACE',
    description:
      'Premium open-face from LS2 with HPTT shell. Features an internal drop-down sun visor, multi-position visor lock, and A-Class polycarbonate outer visor. Triple certified.',
    price: 3999,
    discountPrice: 3499,
    stock: 12,
    sku: 'LS2-OF600-001',
    spec: {
      weight: '1100g',
      material: 'HPTT Shell',
      certifications: ['ISI', 'DOT', 'ECE'],
      visorType: 'Drop-down sun visor + A-Class outer visor',
      ventilation: true,
      features: ['HPTT shell', 'Drop-down sun visor', 'Triple certified', 'Quick release buckle'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 4 },
      { size: 'L', color: 'Matte Black', stock: 4 },
      { size: 'L', color: 'Sand Matt', stock: 2 },
      { size: 'XL', color: 'Gloss White', stock: 2 },
    ],
  },
  {
    name: 'Steelbird SB-29 Open Face',
    brand: 'Steelbird',
    category: 'OPEN_FACE',
    description:
      'Versatile open-face helmet with detachable cap visor. Modern design with padded interior and reflective strips for night visibility. Great all-rounder for city use.',
    price: 1799,
    discountPrice: 1499,
    stock: 28,
    sku: 'STL-SB29-001',
    spec: {
      weight: '920g',
      material: 'ABS Shell',
      certifications: ['ISI'],
      visorType: 'Detachable cap visor + clear visor',
      ventilation: true,
      features: ['Detachable visor', 'Reflective strips', 'Modern design', 'Padded interior'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 10 },
      { size: 'L', color: 'Matte Black', stock: 8 },
      { size: 'L', color: 'Military Green', stock: 5 },
      { size: 'XL', color: 'Grey', stock: 5 },
    ],
  },
  {
    name: 'MT Street Open Face Helmet',
    brand: 'MT Helmets',
    category: 'OPEN_FACE',
    description:
      'MT Street is a feature-packed open-face with drop-down sun visor and micrometric quick-release buckle. Thermoplastic shell with advanced ventilation. Great value in the premium segment.',
    price: 3499,
    discountPrice: 2999,
    stock: 14,
    sku: 'MT-STRT-001',
    spec: {
      weight: '1050g',
      material: 'Thermoplastic Shell',
      certifications: ['ISI', 'ECE'],
      visorType: 'Drop-down sun visor + clear visor',
      ventilation: true,
      features: ['Drop-down sun visor', 'Micrometric buckle', 'Advanced ventilation', 'Washable liner'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 5 },
      { size: 'L', color: 'Matte Black', stock: 4 },
      { size: 'L', color: 'Hi-Vis Yellow', stock: 3 },
      { size: 'XL', color: 'Matte Black', stock: 2 },
    ],
  },

  /* ── MODULAR (2) ───────────────────────────────────────────── */
  {
    name: 'LS2 FF399 Valiant Modular Helmet',
    brand: 'LS2',
    category: 'MODULAR',
    description:
      'The FF399 Valiant is a top-tier modular (flip-up) helmet with 180° flip mechanism. Triple-certified with HPTT shell, pinlock visor, internal sun visor, and emergency release cheek pads. Perfect for touring riders who need versatility.',
    price: 11999,
    discountPrice: 9999,
    stock: 6,
    sku: 'LS2-FF399-001',
    spec: {
      weight: '1600g',
      material: 'HPTT Shell',
      certifications: ['ISI', 'DOT', 'ECE'],
      visorType: '180° flip + Pinlock + internal sun visor',
      ventilation: true,
      features: ['180° flip mechanism', 'Pinlock visor', 'Emergency release', 'Touring focused', 'Bluetooth ready'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 2 },
      { size: 'L', color: 'Matte Black', stock: 2 },
      { size: 'XL', color: 'Titanium Matt', stock: 1 },
      { size: 'XXL', color: 'Matte Black', stock: 1 },
    ],
  },
  {
    name: 'SMK Gullwing Modular Helmet',
    brand: 'SMK',
    category: 'MODULAR',
    description:
      'The Gullwing offers flip-up convenience at a mid-range price. Features a polycarbonate shell, integrated sun visor, anti-scratch outer visor, and hypoallergenic liner. ECE-certified for European-level safety.',
    price: 5999,
    discountPrice: 4999,
    stock: 10,
    sku: 'SMK-GULL-001',
    spec: {
      weight: '1550g',
      material: 'Polycarbonate Shell',
      certifications: ['ISI', 'ECE'],
      visorType: 'Flip-up + integrated sun visor',
      ventilation: true,
      features: ['Flip-up chin bar', 'Integrated sun visor', 'Hypoallergenic liner', 'Anti-scratch visor', 'Quick release buckle'],
    },
    variants: [
      { size: 'M', color: 'Matte Black', stock: 3 },
      { size: 'L', color: 'Matte Black', stock: 3 },
      { size: 'L', color: 'Anthracite', stock: 2 },
      { size: 'XL', color: 'Gloss White', stock: 2 },
    ],
  },
];

/* ──────────────────────────── REVIEWS ──────────────────────────── */

const reviewData = [
  { rating: 5, title: 'Excellent quality!', comment: 'This helmet fits perfectly and the build quality is outstanding. Very comfortable for long rides. The ventilation is great and the visor is crystal clear.' },
  { rating: 4, title: 'Good value for money', comment: 'Solid helmet at this price point. The padding is comfortable and the visor mechanism works well. Could improve the chin strap buckle though.' },
  { rating: 5, title: 'Best helmet I have owned', comment: 'After trying many brands, this one stands out. Lightweight, great finish, and the safety certifications give me confidence on the road.' },
  { rating: 4, title: 'Comfortable fit', comment: 'Fits my head shape well. The interior lining is soft and breathable. Good for daily commutes in hot weather. Visor could be a bit wider.' },
  { rating: 3, title: 'Decent but heavy', comment: 'The quality is good but it feels a bit heavy after an hour of riding. Paint finish is nice and the visor is scratch-resistant. Average ventilation.' },
  { rating: 5, title: 'Premium feel', comment: 'Love the carbon fibre shell — so lightweight! The pinlock visor is a game changer in foggy mornings. Worth every rupee. Highly recommend.' },
  { rating: 4, title: 'Great for daily use', comment: 'Using this for my daily 30 km commute and it handles well. Good visibility, comfortable padding, and easy to clean. The graphics look cool too.' },
  { rating: 5, title: 'Safety first!', comment: 'Bought this because of the triple certification (ISI + DOT + ECE). Feels very secure on the head. The EPS foam is thick and the shell is rigid.' },
  { rating: 3, title: 'Average helmet', comment: 'Does the job but nothing extraordinary. The ventilation could be better and the visor fogs up in cold weather. Padding is OK for the price.' },
  { rating: 4, title: 'Stylish design', comment: 'Gets me compliments every time I wear it. The matte finish looks premium and doesn\'t show fingerprints. Fit is snug but comfortable.' },
  { rating: 5, title: 'Perfect for touring', comment: 'Used this on a 500 km trip and my neck didn\'t hurt at all. Superb weight distribution. The flip-up mechanism is smooth and locks securely.' },
  { rating: 4, title: 'Impressed with the quality', comment: 'For the price, this helmet offers incredible value. The inner sun visor is very convenient. Build quality is comparable to more expensive helmets.' },
  { rating: 5, title: 'Highly recommended!', comment: 'Third helmet from this brand and they never disappoint. The quick-release buckle is so convenient. Visor is easy to replace too.' },
  { rating: 3, title: 'Good but runs small', comment: 'Had to exchange for a larger size. Once I got the right size, it fits well. Quality and finish are good. The chin curtain helps with wind noise.' },
  { rating: 4, title: 'Nice retro look', comment: 'Love the vintage design — perfect for my Royal Enfield Classic. The leather trim adds a premium touch. Visor clarity is good.' },
  { rating: 5, title: 'ISI certified peace of mind', comment: 'Safety is my priority and this helmet delivers. The multi-density EPS provides excellent shock absorption. Passed all safety tests.' },
  { rating: 4, title: 'Ventilation is superb', comment: 'Multiple vents keep air flowing even in traffic. The visor anti-fog coating works great. Only wish the chin strap was softer.' },
  { rating: 5, title: 'Worth the upgrade', comment: 'Upgraded from a basic helmet and the difference is night and day. The noise reduction is amazing and the fit is like a custom mold.' },
  { rating: 3, title: 'OK for beginners', comment: 'My first full-face helmet and it serves the purpose. The visor could be clearer and the weight takes getting used to. Overall decent.' },
  { rating: 4, title: 'Good grip and padding', comment: 'The cheek pads hold my head firmly without pressure points. Removable and washable which is a big plus. Clear visor with no distortion.' },
  { rating: 5, title: 'Exceptional build quality', comment: 'You can feel the quality as soon as you hold it. The shell is perfectly finished with no rough edges. Interior is plush and comfortable.' },
  { rating: 4, title: 'Better than expected', comment: 'Was skeptical at this price but pleasantly surprised. The helmet looks and feels more expensive than it is. Would buy again.' },
  { rating: 5, title: 'Super lightweight', comment: 'At just over 1 kg, this is the lightest helmet I\'ve owned. No neck strain even on 2-hour rides. The carbon fibre shell is incredible.' },
  { rating: 3, title: 'Mixed feelings', comment: 'The design and fit are great but the visor mechanism feels a bit flimsy. Hope it holds up over time. Paint quality is excellent though.' },
  { rating: 4, title: 'Great for scooter riders', comment: 'Perfect helmet for my Activa. Light, easy to wear, and the flip-up visor is very convenient at traffic lights. Good sun protection.' },
  { rating: 5, title: 'Professional grade', comment: 'This ECE-certified helmet gives me confidence on highways. The wind noise at 100 kmph is minimal. The aerodynamic design really works.' },
  { rating: 4, title: 'Comfortable even in summer', comment: 'The mesh liner breathes well in hot weather. Don\'t feel too sweaty even in 40°C heat. Good moisture-wicking fabric inside.' },
  { rating: 5, title: 'Saved my life!', comment: 'Had a minor accident and this helmet took the impact without cracking. The multi-layer EPS did its job. Don\'t compromise on safety, buy a good helmet!' },
  { rating: 4, title: 'Kids love it', comment: 'Bought for my college-going son. He loves the sporty graphics. Fits well and the ISI certification gives us peace of mind as parents.' },
  { rating: 5, title: 'Dream helmet', comment: 'Always wanted a premium flip-up helmet and this is perfect. The 180-degree flip mechanism is smooth. Pinlock visor keeps fog at bay. Love it!' },
  { rating: 3, title: 'Acceptable quality', comment: 'For the price, it does what it needs to. The finish could be better and the padding compresses over time. But it\'s ISI certified and that matters.' },
  { rating: 4, title: 'Great all-rounder', comment: 'Works well for both city and highway riding. Not too heavy, not too light. The dual visor system is very practical. Good value.' },
  { rating: 5, title: 'Five stars, no question', comment: 'This is my go-to helmet recommendation for everyone. Perfect fit, great safety, cool design, and affordable. What more do you need?' },
  { rating: 4, title: 'Noise reduction is good', comment: 'Significantly quieter than my previous helmet. The chin curtain and tight visor seal make a big difference on the highway.' },
  { rating: 5, title: 'Visor clarity is amazing', comment: 'The anti-scratch, anti-fog visor provides crystal-clear vision in all conditions. Day or night, rain or shine, visibility is excellent.' },
  { rating: 3, title: 'Size runs a bit large', comment: 'Ordered my usual size but it felt slightly loose. Adding extra padding helped. Otherwise, the helmet quality and features are satisfactory.' },
  { rating: 4, title: 'Perfect for my Bullet', comment: 'Matches the retro vibe of my Bullet perfectly. The olive green color is unique. Build quality is premium and it feels very secure.' },
  { rating: 5, title: 'Quick delivery, great product', comment: 'Received within 3 days and the helmet exceeded expectations. Packaging was excellent, no scratches. The helmet fits like a glove.' },
  { rating: 4, title: 'Aerodynamic design works', comment: 'Noticed less buffeting at high speeds compared to my old helmet. The wind-tunnel tested design really makes a difference. Stable and comfortable.' },
  { rating: 5, title: 'Best budget helmet', comment: 'At under ₹2000, this is the best you can get. ISI certified, comfortable, decent ventilation, and good visor. Don\'t need to spend more for daily use.' },
  { rating: 4, title: 'Removable liner is a lifesaver', comment: 'After a sweaty ride, just pull out the liner and wash it. Dries quickly and smells fresh again. Brilliant feature that every helmet should have.' },
  { rating: 5, title: 'Gift for my husband', comment: 'He absolutely loves it. The matte black finish looks very premium. Fits his head perfectly and he says it\'s the most comfortable helmet he\'s worn.' },
  { rating: 3, title: 'Decent but basic', comment: 'Does the job for short commutes. Don\'t expect premium features at this price. The visor is thin and the padding is basic. But it\'s safe and certified.' },
  { rating: 4, title: 'Good for glasses wearers', comment: 'Has enough space for my spectacles without pressing on the temples. The visor opens wide enough for easy access. A rare find!' },
  { rating: 5, title: 'Track day approved', comment: 'Used this at a track day event and it performed flawlessly. The ECE + DOT certification meant it was accepted at the track. Excellent protection.' },
  { rating: 4, title: 'Beautiful graphics', comment: 'The orange and black graphic design is stunning. Gets a lot of attention at meets. The helmet itself is well-made and comfortable.' },
  { rating: 5, title: 'Replaced my expensive helmet', comment: 'Sold my ₹15,000 helmet because this one at half the price is just as good. Triple certification, great fit, and lighter too. Smart buy.' },
  { rating: 3, title: 'Okay for the price', comment: 'It\'s an entry-level helmet and does what you\'d expect. Not the best ventilation and the visor could be improved. But it\'s safe and affordable.' },
  { rating: 4, title: 'Solid construction', comment: 'The shell feels very sturdy. Dropped it once (accidentally) and no cracks or damage. The EPS foam absorbed the impact well. Reliable helmet.' },
  { rating: 5, title: 'Cannot recommend enough!', comment: 'Everyone in my riding group now owns this helmet because I kept recommending it. Great fit, excellent safety, premium look. Buy it, you won\'t regret it.' },
];

/* ──────────────────────────── MAIN SEED ──────────────────────────── */

async function main() {
  console.log('🌱 Starting seed...\n');

  // Clean existing data
  console.log('  Cleaning database...');
  await prisma.review.deleteMany();
  await prisma.wishlist.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.productSpecification.deleteMany();
  await prisma.product.deleteMany();
  await prisma.address.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.newsletter.deleteMany();
  await prisma.user.deleteMany();
  console.log('  ✅ Database cleaned\n');

  /* ── Users ─────────────────── */

  console.log('  Creating users...');
  const hashedPassword = await bcrypt.hash('Admin@123', 10);
  const customerPassword = await bcrypt.hash('Customer@123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@helmetstore.com',
      password: hashedPassword,
      fullName: 'Admin User',
      phone: '9876543210',
      role: 'ADMIN',
      isVerified: true,
    },
  });

  const customers = await Promise.all([
    prisma.user.create({
      data: {
        email: 'rahul@example.com',
        password: customerPassword,
        fullName: 'Rahul Sharma',
        phone: '9876543211',
        role: 'CUSTOMER',
        isVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'priya@example.com',
        password: customerPassword,
        fullName: 'Priya Patel',
        phone: '9876543212',
        role: 'CUSTOMER',
        isVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'amit@example.com',
        password: customerPassword,
        fullName: 'Amit Kumar',
        phone: '9876543213',
        role: 'CUSTOMER',
        isVerified: true,
      },
    }),
  ]);

  console.log('  ✅ Users created (admin + 3 customers)\n');

  /* ── Addresses ─────────────────── */

  console.log('  Creating addresses...');
  const addresses = await Promise.all([
    prisma.address.create({
      data: {
        userId: customers[0].id,
        fullName: 'Rahul Sharma',
        phone: '9876543211',
        addressLine1: '42, MG Road, Koramangala',
        addressLine2: 'Near Sony Signal',
        city: 'Bangalore',
        state: 'Karnataka',
        pinCode: '560034',
        addressType: 'HOME',
        isDefault: true,
      },
    }),
    prisma.address.create({
      data: {
        userId: customers[1].id,
        fullName: 'Priya Patel',
        phone: '9876543212',
        addressLine1: '15, SV Road, Andheri West',
        city: 'Mumbai',
        state: 'Maharashtra',
        pinCode: '400058',
        addressType: 'HOME',
        isDefault: true,
      },
    }),
    prisma.address.create({
      data: {
        userId: customers[2].id,
        fullName: 'Amit Kumar',
        phone: '9876543213',
        addressLine1: '78, Sector 15, Noida',
        city: 'Noida',
        state: 'Uttar Pradesh',
        pinCode: '201301',
        addressType: 'OFFICE',
        isDefault: true,
      },
    }),
  ]);
  console.log('  ✅ Addresses created\n');

  /* ── Products ─────────────────── */

  console.log('  Creating products...');
  const createdProducts = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const product = await prisma.product.create({
      data: {
        name: p.name,
        slug: slug(p.name),
        brand: p.brand,
        category: p.category,
        description: p.description,
        price: p.price,
        discountPrice: p.discountPrice,
        stock: p.stock,
        sku: p.sku,
        isActive: true,
        rating: 0,
        totalReviews: 0,
        images: {
          create: Array.from({ length: 5 }, (_, idx) => ({
            imageUrl: IMG(i * 5 + idx + 1),
            isPrimary: idx === 0,
            displayOrder: idx,
          })),
        },
        variants: {
          create: p.variants.map((v, idx) => ({
            size: v.size,
            color: v.color,
            stock: v.stock,
            sku: `${p.sku}-${v.size}-${v.color.replace(/\s/g, '')}-${idx}`.toUpperCase(),
            additionalPrice: 0,
          })),
        },
        specifications: {
          create: p.spec,
        },
      },
    });
    createdProducts.push(product);
  }
  console.log(`  ✅ ${createdProducts.length} products created\n`);

  /* ── Sample Orders (so reviews can reference delivered orders) ── */

  console.log('  Creating sample orders and reviews...');
  const orderedProducts = createdProducts.slice(0, 3);

  for (let c = 0; c < customers.length; c++) {
    const product = orderedProducts[c];
    const order = await prisma.order.create({
      data: {
        orderNumber: `HLM-SEED-${String(c + 1).padStart(4, '0')}`,
        userId: customers[c].id,
        addressId: addresses[c].id,
        subtotal: Number(product.price),
        discount: 0,
        shippingCharge: 50,
        tax: Math.round(Number(product.price) * 0.18),
        total: Number(product.price) + 50 + Math.round(Number(product.price) * 0.18),
        paymentMethod: 'RAZORPAY',
        paymentStatus: 'PAID',
        orderStatus: 'DELIVERED',
        items: {
          create: {
            productId: product.id,
            productName: product.name,
            productImage: IMG(c * 5 + 1),
            size: 'L',
            color: 'Matte Black',
            price: Number(product.price),
            quantity: 1,
            subtotal: Number(product.price),
          },
        },
      },
    });

    // Add one review per delivered order (unique constraint: userId + productId + orderId)
    const rev = reviewData[c];
    await prisma.review.create({
      data: {
        productId: product.id,
        userId: customers[c].id,
        orderId: order.id,
        rating: rev.rating,
        title: rev.title,
        comment: rev.comment,
        isVerifiedPurchase: true,
        isApproved: true,
      },
    });
  }

  // Create additional approved reviews spread across products
  let revIdx = 6;
  for (let p = 0; p < Math.min(createdProducts.length, 15); p++) {
    const product = createdProducts[p];

    // Create a dummy delivered order for each review
    for (let r = 0; r < 2; r++) {
      if (revIdx >= reviewData.length) break;

      const customerIdx = (p + r) % customers.length;
      const customer = customers[customerIdx];
      const address = addresses[customerIdx];

      // Check if this review combo already exists
      const existingReview = await prisma.review.findFirst({
        where: { userId: customer.id, productId: product.id },
      });
      if (existingReview) continue;

      const order = await prisma.order.create({
        data: {
          orderNumber: `HLM-SEED-R${String(revIdx).padStart(4, '0')}`,
          userId: customer.id,
          addressId: address.id,
          subtotal: Number(product.price),
          discount: 0,
          shippingCharge: 50,
          tax: Math.round(Number(product.price) * 0.18),
          total: Number(product.price) + 50 + Math.round(Number(product.price) * 0.18),
          paymentMethod: 'RAZORPAY',
          paymentStatus: 'PAID',
          orderStatus: 'DELIVERED',
          items: {
            create: {
              productId: product.id,
              productName: product.name,
              productImage: IMG(p * 5 + 1),
              size: 'L',
              color: 'Matte Black',
              price: Number(product.price),
              quantity: 1,
              subtotal: Number(product.price),
            },
          },
        },
      });

      await prisma.review.create({
        data: {
          productId: product.id,
          userId: customer.id,
          orderId: order.id,
          rating: reviewData[revIdx].rating,
          title: reviewData[revIdx].title,
          comment: reviewData[revIdx].comment,
          isVerifiedPurchase: true,
          isApproved: true,
        },
      });

      revIdx++;
    }
  }

  // Update product ratings
  for (const product of createdProducts) {
    const reviews = await prisma.review.findMany({
      where: { productId: product.id, isApproved: true },
      select: { rating: true },
    });
    if (reviews.length > 0) {
      const avg = reviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / reviews.length;
      await prisma.product.update({
        where: { id: product.id },
        data: {
          rating: Math.round(avg * 100) / 100,
          totalReviews: reviews.length,
        },
      });
    }
  }
  console.log('  ✅ Orders and reviews created\n');

  /* ── Coupons ─────────────────── */

  console.log('  Creating coupons...');
  await prisma.coupon.createMany({
    data: [
      {
        code: 'WELCOME10',
        description: '10% off on your first order',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minPurchase: 1000,
        maxDiscount: 500,
        usageLimit: 1000,
        validFrom: new Date('2024-01-01'),
        validUntil: new Date('2027-12-31'),
        isActive: true,
      },
      {
        code: 'HELMET20',
        description: 'Flat ₹200 off on orders above ₹2000',
        discountType: 'FIXED',
        discountValue: 200,
        minPurchase: 2000,
        usageLimit: 500,
        validFrom: new Date('2024-01-01'),
        validUntil: new Date('2027-12-31'),
        isActive: true,
      },
      {
        code: 'RIDE15',
        description: '15% off on premium helmets',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        minPurchase: 3000,
        maxDiscount: 1000,
        usageLimit: 200,
        validFrom: new Date('2024-01-01'),
        validUntil: new Date('2027-12-31'),
        isActive: true,
      },
    ],
  });
  console.log('  ✅ Coupons created\n');

  /* ── Newsletter ─────────────────── */

  console.log('  Creating newsletter subscribers...');
  await prisma.newsletter.createMany({
    data: [
      { email: 'subscriber1@example.com' },
      { email: 'subscriber2@example.com' },
      { email: 'subscriber3@example.com' },
    ],
  });
  console.log('  ✅ Newsletter subscribers created\n');

  /* ── Summary ─────────────────── */

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Seed completed successfully!\n');
  console.log('  Admin login:');
  console.log('    Email:    admin@helmetstore.com');
  console.log('    Password: Admin@123\n');
  console.log('  Customer login:');
  console.log('    Email:    rahul@example.com');
  console.log('    Password: Customer@123\n');
  console.log('  Coupons: WELCOME10, HELMET20, RIDE15');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
