import { Household, CurationSummary } from '../types.ts';
import { CLOSED_CATEGORIES } from '../data/categories.ts';

// Deterministic Pseudo-Random Generator for repeatable mock runs
class SeededRandom {
  private s: number;
  constructor(seed = 1337) {
    this.s = seed;
  }
  next(): number {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }
}

const FIRST_NAMES = [
  'Michael', 'Jessica', 'David', 'Sarah', 'Carlos', 'Maria', 'Robert', 'Jennifer',
  'Alejandro', 'Ashley', 'Jose', 'Amanda', 'Luis', 'Stephanie', 'Brian', 'Patricia',
  'Anthony', 'Elizabeth', 'Daniel', 'Melissa', 'Marco', 'Vanessa', 'Richard', 'Gabriela',
  'James', 'Sandra', 'Victor', 'Nicole', 'Eduardo', 'Diana', 'William', 'Laura'
];

const LAST_NAMES = [
  'Hernandez', 'Smith', 'Garcia', 'Johnson', 'Rodriguez', 'Williams', 'Martinez', 'Brown',
  'Lopez', 'Jones', 'Gonzalez', 'Miller', 'Perez', 'Davis', 'Sanchez', 'Wilson',
  'Ramirez', 'Anderson', 'Torres', 'Taylor', 'Flores', 'Thomas', 'Rivera', 'Moore',
  'Gomez', 'Jackson', 'Diaz', 'Martin', 'Reyes', 'Lee', 'Morales', 'Thompson'
];

const STREET_NAMES: Record<string, string[]> = {
  'Eastvale': [
    'Citrus Valley Pkwy', 'Limonite Ave', 'Archibald Ave', 'Sumner Ave', 'Hamner Ave',
    'Scholar Way', 'Cleveland Ave', 'Cloverdale St', 'Bellegrave Ave', '58th St', 'Amberhill Dr'
  ],
  'Rancho Cucamonga': [
    'Haven Ave', 'Foothill Blvd', 'Milliken Ave', 'Arrow Rte', 'Hermosa Ave',
    'Carnelian St', 'Baseline Rd', 'Day Creek Blvd', 'Victoria Gardens Ln', 'Church St'
  ],
  'Corona': [
    'Green River Rd', 'Ontario Ave', 'Main St', 'Lincoln Ave', 'Magnolia Ave',
    'Border Ave', 'McKinley St', 'Auto Center Dr', 'Rimpau Ave', 'Hidden Valley Pkwy'
  ],
  'Ontario': [
    'Euclid Ave', 'Mountain Ave', 'Holt Blvd', '4th St', 'Inland Empire Blvd',
    'Vineyard Ave', 'Grove Ave', 'Philadelphia St', 'Francis St', 'Campus Ave'
  ]
};

const CARRIER_ROUTES = [
  'C001', 'C002', 'C003', 'C004', 'C005', 'C006', 'C007', 'C008',
  'C009', 'C010', 'C011', 'C012', 'C014', 'C015', 'C018', 'C021',
  'R001', 'R002', 'R003', 'R004'
];

/**
 * Generates 15,000 synthetic households from Inland Empire microzone for Algorithmic Curation
 */
export function generateSyntheticHouseholds(
  targetCity = 'Eastvale',
  targetZip = '92880',
  count = 15000,
  seed = 42
): Household[] {
  const rng = new SeededRandom(seed);
  const streetList = STREET_NAMES[targetCity] || STREET_NAMES['Eastvale'];
  const households: Household[] = [];

  for (let i = 0; i < count; i++) {
    const fn = FIRST_NAMES[Math.floor(rng.next() * FIRST_NAMES.length)];
    const ln = LAST_NAMES[Math.floor(rng.next() * LAST_NAMES.length)];
    const streetNum = Math.floor(1000 + rng.next() * 14000);
    const streetName = streetList[Math.floor(rng.next() * streetList.length)];
    const zip4 = String(Math.floor(1000 + rng.next() * 8999));
    const carrierRoute = CARRIER_ROUTES[Math.floor(rng.next() * CARRIER_ROUTES.length)];
    const walkSequence = Math.floor(1 + rng.next() * 450);

    // Demographic attribute factors
    // Inland Empire suburban single-family vs multi-family bias
    const isOwner = rng.next() > 0.18 ? 1 : 0; // ~82% owner in suburbs like Eastvale
    
    // Income distribution: skewed towards middle-high in target suburbs
    const incomeBase = 55000 + Math.pow(rng.next(), 1.6) * 165000;
    const incomeScore = Math.min(1.0, Math.max(0.1, incomeBase / 220000));

    // Home age in years: 2 to 45 years
    const homeAgeYears = Math.floor(2 + rng.next() * 38);
    const homeAgeScore = Math.min(1.0, homeAgeYears / 30); // older homes have higher score for repairs

    // Children present
    const childrenPresentScore = rng.next() > 0.42 ? 1 : 0;

    // Vehicles count: 1 to 4
    const vehiclesRandom = rng.next();
    const vehiclesCount = vehiclesRandom < 0.15 ? 1 : vehiclesRandom < 0.55 ? 2 : vehiclesRandom < 0.85 ? 3 : 4;
    const vehiclesScore = vehiclesCount / 4;

    // Pet owner: ~62% in single family homes
    const petOwnerScore = rng.next() > 0.38 ? 1 : 0;

    // Home Value proxy (correlated with income and ownership)
    const homeValueScore = Math.min(1.0, (incomeScore * 0.6 + isOwner * 0.4) + (rng.next() * 0.2 - 0.1));

    households.push({
      id: `HH-${targetZip}-${String(i + 1).padStart(5, '0')}`,
      residentName: `${fn} ${ln}`,
      streetAddress: `${streetNum} ${streetName}`,
      city: targetCity,
      state: 'CA',
      zip5: targetZip,
      zip4,
      carrierRoute,
      walkSequence,
      incomeScore,
      homeOwnershipScore: isOwner,
      homeAgeYears,
      homeAgeScore,
      childrenPresentScore,
      vehiclesCount,
      vehiclesScore,
      petOwnerScore,
      homeValueScore,
      matchScores: {},
      compositeScore: 0,
      selectedForDrop: false,
    });
  }

  return households;
}

/**
 * Propensity Engine: Calculates demographic match scores for 14 businesses and selects top 5,000
 */
export function executePropensityCuration(
  households: Household[],
  categories = CLOSED_CATEGORIES,
  targetCutoff = 5000
): {
  curatedHouseholds: Household[];
  allScoredHouseholds: Household[];
  summary: CurationSummary;
} {
  // Score each household against the 14 category demographic weight vectors
  for (const hh of households) {
    let composite = 0;
    const matchScores: Record<number, number> = {};

    for (const cat of categories) {
      const w = cat.demographicWeights;
      // Dot product: Match(i, j) = sum(W_j,k * Household_i,k)
      const score = 
        (w.income * hh.incomeScore * 1.5) +
        (w.homeOwnership * hh.homeOwnershipScore * 2.0) +
        (w.homeAgeYears * hh.homeAgeScore * 1.2) +
        (w.childrenPresent * hh.childrenPresentScore * 1.4) +
        (w.vehiclesCount * hh.vehiclesScore * 1.3) +
        (w.petOwner * hh.petOwnerScore * 1.6) +
        (w.homeValue * hh.homeValueScore * 1.0);

      // Normalize match score to 0 - 10 scale
      const normalizedScore = Number((score * 1.2).toFixed(2));
      matchScores[cat.id] = normalizedScore;
      composite += normalizedScore;
    }

    hh.matchScores = matchScores;
    hh.compositeScore = Number(composite.toFixed(2));
    hh.selectedForDrop = false;
  }

  // Sort strictly descending by composite score
  households.sort((a, b) => b.compositeScore - a.compositeScore);

  // Mark the top 5,000 households
  const topCut = households.slice(0, targetCutoff);
  topCut.forEach((hh) => {
    hh.selectedForDrop = true;
  });

  // Calculate statistics and distribution
  const scores = topCut.map((h) => h.compositeScore);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const avgScore = Number((scores.reduce((acc, v) => acc + v, 0) / scores.length).toFixed(2));

  // Carrier Route Distribution for the top 5,000
  const routeCounts: Record<string, { count: number; zip: string }> = {};
  topCut.forEach((hh) => {
    const key = `${hh.carrierRoute}`;
    if (!routeCounts[key]) {
      routeCounts[key] = { count: 0, zip: hh.zip5 };
    }
    routeCounts[key].count++;
  });

  const carrierRouteDistribution = Object.entries(routeCounts)
    .map(([route, info]) => ({
      route,
      count: info.count,
      zip: info.zip,
    }))
    .sort((a, b) => b.count - a.count);

  // Category synergy breakdown
  const categorySynergyBreakdown = categories.map((cat) => {
    const sum = topCut.reduce((acc, h) => acc + (h.matchScores[cat.id] || 0), 0);
    return {
      categoryId: cat.id,
      name: cat.name,
      avgAffinity: Number((sum / topCut.length).toFixed(2)),
    };
  });

  // Histogram bins for score distribution
  const binStep = (maxScore - minScore) / 8;
  const scoreHistogram: { binRange: string; count: number }[] = [];
  for (let b = 0; b < 8; b++) {
    const start = minScore + b * binStep;
    const end = start + binStep;
    const count = topCut.filter((h) => h.compositeScore >= start && (b === 7 ? h.compositeScore <= end : h.compositeScore < end)).length;
    scoreHistogram.push({
      binRange: `${start.toFixed(0)}-${end.toFixed(0)}`,
      count,
    });
  }

  const summary: CurationSummary = {
    totalAnalyzed: households.length,
    totalSelected: topCut.length,
    minScore,
    maxScore,
    avgScore,
    carrierRouteDistribution,
    categorySynergyBreakdown,
    scoreHistogram,
  };

  return {
    curatedHouseholds: topCut,
    allScoredHouseholds: households,
    summary,
  };
}
