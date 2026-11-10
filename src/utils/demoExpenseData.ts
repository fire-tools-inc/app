/**
 * Demo Expense Data Generator
 * Generates realistic demo expense data for an entire year
 */

import { 
  ExpenseTrackerData, 
  createEmptyMonthData, 
  generateTransactionId,
  IncomeEntry,
  ExpenseEntry,
  ExpenseCategory,
  ExpenseType,
} from '../types/expenseTracker';
import { getDemoExpensePlanning } from './demoExpensePlanning';

// Expense templates with humorous descriptions and easter eggs
const EXPENSE_TEMPLATES: Array<{
  category: ExpenseCategory;
  type: ExpenseType;
  baseAmount: number;
  variance: number; // +/- percentage
  descriptions: string[];
  frequency: 'monthly' | 'occasional' | 'rare';
}> = [
  {
    category: 'HOUSING',
    type: 'NEED',
    baseAmount: 1200,
    variance: 0,
    descriptions: ['Rent - The landlord needs his yacht payment'],
    frequency: 'monthly',
  },
  {
    category: 'UTILITIES',
    type: 'NEED',
    baseAmount: 120,
    variance: 20,
    descriptions: [
      'Electric bill - Mining Bitcoin at home (just kidding)',
      'Electric bill - Too many LEDs',
      'Gas & Electric - Winter is coming',
      'Water bill - Long showers thinking about FIRE',
    ],
    frequency: 'monthly',
  },
  {
    category: 'GROCERIES',
    type: 'NEED',
    baseAmount: 500, // Increased from 400
    variance: 30,
    descriptions: [
      'Weekly groceries - Rice and beans FIRE diet',
      'Supermarket - Bulk buying ramen again',
      'Grocery shopping - Found expired coupons!',
      'Weekly food shop - Mostly vegetables this time',
    ],
    frequency: 'monthly',
  },
  {
    category: 'DINING_OUT',
    type: 'WANT',
    baseAmount: 100, // Increased from 80
    variance: 50,
    descriptions: [
      'Restaurant - Treating myself before retiring early',
      'Pizza delivery - Too tired to cook',
      'Sushi night - YOLO (You Only Live Once)',
      'Coffee shop - Overpriced lattes fuel productivity',
      'Lunch with coworkers - Networking for FIRE tips',
    ],
    frequency: 'occasional',
  },
  {
    category: 'TRANSPORTATION',
    type: 'NEED',
    baseAmount: 100, // Increased from 80
    variance: 20,
    descriptions: [
      'Public transport pass - Saving on car insurance',
      'Gas for car - Rising prices again!',
      'Uber to airport - Convenience tax',
      'Bus pass - Environmental warrior mode',
    ],
    frequency: 'monthly',
  },
  {
    category: 'ENTERTAINMENT',
    type: 'WANT',
    baseAmount: 60,
    variance: 100,
    descriptions: [
      'Movie tickets - Avoiding spoilers is priceless',
      'Concert - Live music > Spotify',
      'Gaming - New DLC just dropped',
      'Museum entry - Culture is important',
      'Theater tickets - Supporting the arts',
    ],
    frequency: 'occasional',
  },
  {
    category: 'SUBSCRIPTIONS',
    type: 'WANT',
    baseAmount: 45,
    variance: 10,
    descriptions: [
      'Netflix + Spotify - The essentials',
      'Streaming services - All of them somehow',
      'Cloud storage - Digital hoarder problems',
      'Gym membership - Used it twice this month!',
    ],
    frequency: 'monthly',
  },
  {
    category: 'SHOPPING',
    type: 'WANT',
    baseAmount: 100,
    variance: 80,
    descriptions: [
      'New clothes - Old ones still work but...',
      'Amazon impulse buy - It was on sale!',
      'Bookstore haul - Knowledge is wealth',
      'Tech gadget - Will help with productivity',
      'Home decor - Making the space nice',
    ],
    frequency: 'occasional',
  },
  {
    category: 'HEALTHCARE',
    type: 'NEED',
    baseAmount: 50,
    variance: 100,
    descriptions: [
      'Pharmacy - Vitamins and supplements',
      'Doctor visit - Annual checkup',
      'Dentist - Regular cleaning',
      'Gym physio - Pulled something showing off',
    ],
    frequency: 'occasional',
  },
  {
    category: 'INSURANCE',
    type: 'NEED',
    baseAmount: 80,
    variance: 5,
    descriptions: [
      'Health insurance - Adult responsibilities',
      'Life insurance - Planning for the future',
    ],
    frequency: 'monthly',
  },
  {
    category: 'PERSONAL_CARE',
    type: 'WANT',
    baseAmount: 40,
    variance: 50,
    descriptions: [
      'Haircut - Looking sharp for Zoom calls',
      'Spa day - Self-care Sunday',
      'Beauty products - Gotta look presentable',
    ],
    frequency: 'occasional',
  },
  {
    category: 'EDUCATION',
    type: 'NEED',
    baseAmount: 50,
    variance: 100,
    descriptions: [
      'Online course - Investing in myself',
      'Books - Reading is learning',
      'Udemy sale - $10 for 10 courses!',
      'Certification exam - Career advancement',
    ],
    frequency: 'occasional',
  },
  {
    category: 'GIFTS_DONATIONS',
    type: 'WANT',
    baseAmount: 60,
    variance: 100,
    descriptions: [
      "Friend's birthday - Another year older",
      'Wedding gift - Love is expensive',
      'Charity donation - Giving back feels good',
      'Secret Santa - Office tradition',
    ],
    frequency: 'occasional',
  },
  {
    category: 'TRAVEL',
    type: 'WANT',
    baseAmount: 300,
    variance: 50,
    descriptions: [
      'Weekend getaway - Need a break from the grind',
      'Flight tickets - Visiting family',
      'Hotel booking - Mini vacation',
      'Road trip - Adventure awaits',
    ],
    frequency: 'rare',
  },
  {
    category: 'HOLIDAYS',
    type: 'WANT',
    baseAmount: 400,
    variance: 30,
    descriptions: [
      'Christmas shopping - Tis the season',
      'Holiday decorations - Making it festive',
      'Thanksgiving dinner - Family feast',
      'New Year celebration - Ringing it in right',
    ],
    frequency: 'rare',
  },
  {
    category: 'COLLECTIBLES',
    type: 'WANT',
    baseAmount: 80,
    variance: 100,
    descriptions: [
      'Limited edition vinyl - Collector mode activated',
      'Trading cards - Investment strategy?',
      'Comic books - Original issues!',
      'Vintage poster - Wall needs decoration',
    ],
    frequency: 'rare',
  },
  {
    category: 'MUSIC',
    type: 'NEED',
    baseAmount: 30,
    variance: 100,
    descriptions: [
      'Guitar strings - Rock on!',
      'Music lessons - Never too late to learn',
      'Vinyl record - Analog sounds better',
      'Concert tickets - Live music therapy',
    ],
    frequency: 'occasional',
  },
  {
    category: 'LIFESTYLE_LEISURE',
    type: 'WANT',
    baseAmount: 70,
    variance: 80,
    descriptions: [
      'Hobby supplies - Craft time',
      'Sports equipment - Getting fit',
      'Photography gear - Capturing memories',
      'Cooking class - Master chef dreams',
    ],
    frequency: 'occasional',
  },
  {
    category: 'BUSINESS',
    type: 'NEED',
    baseAmount: 50,
    variance: 100,
    descriptions: [
      'Co-working space - Productivity boost',
      'Professional development - Network effect',
      'Business cards - Still relevant in 2024?',
      'LinkedIn Premium - Job hunting mode',
    ],
    frequency: 'rare',
  },
  {
    category: 'FEES',
    type: 'NEED',
    baseAmount: 30,
    variance: 50,
    descriptions: [
      'Bank fees - They need to make money somehow',
      'Late payment fee - Forgot to set reminder',
      'ATM fee - Convenience has a price',
    ],
    frequency: 'rare',
  },
];

/**
 * Seeded random number generator for deterministic testing
 * Uses sine-based pseudo-random for consistent values
 */
function seededRandom(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return min + (x - Math.floor(x)) * (max - min);
}

/**
 * Generate random amount with variance
 */
function randomAmount(base: number, variancePercent: number, seed?: number): number {
  const variance = base * (variancePercent / 100);
  const min = base - variance;
  const max = base + variance;
  const amount = seed !== undefined 
    ? seededRandom(seed, min, max)
    : Math.random() * (max - min) + min;
  // Ensure we never return 0 or negative amounts
  return Math.max(1, Math.round(amount));
}

/**
 * Pick random item from array
 */
function randomPick<T>(array: T[], seed?: number): T {
  const index = seed !== undefined
    ? Math.floor(seededRandom(seed, 0, array.length))
    : Math.floor(Math.random() * array.length);
  return array[index];
}

/**
 * Generate monthly income entries
 */
function generateMonthlyIncome(year: number, month: number): IncomeEntry[] {
  const monthlyIncome = 5000; // €5,000 per month = €60,000 annually
  
  // Format date as 15th of the month (payday)
  const dateStr = `${year}-${String(month).padStart(2, '0')}-15`;
  
  return [
    {
      id: generateTransactionId(),
      type: 'income',
      date: dateStr,
      amount: monthlyIncome,
      description: 'Monthly Salary',
      source: 'SALARY',
      currency: 'EUR',
    },
  ];
}

/**
 * Generate monthly expense entries
 * @param year - Year for the expenses
 * @param month - Month for the expenses (1-12)
 * @param useSeed - Whether to use seeded random for deterministic results (for testing)
 */
function generateMonthlyExpenses(year: number, month: number, useSeed: boolean = false): ExpenseEntry[] {
  const expenses: ExpenseEntry[] = [];
  const monthSeed = useSeed ? year * 100 + month : undefined;
  
  // Monthly expenses (always occur)
  const monthlyTemplates = EXPENSE_TEMPLATES.filter(t => t.frequency === 'monthly');
  for (let idx = 0; idx < monthlyTemplates.length; idx++) {
    const template = monthlyTemplates[idx];
    const daySeed = monthSeed !== undefined ? monthSeed * 1000 + idx : undefined;
    const day = daySeed !== undefined 
      ? Math.floor(seededRandom(daySeed, 1, 29))
      : Math.floor(Math.random() * 28) + 1; // 1-28 to avoid month-end issues
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    const amountSeed = monthSeed !== undefined ? monthSeed * 10000 + idx : undefined;
    const descSeed = monthSeed !== undefined ? monthSeed * 100000 + idx : undefined;
    
    expenses.push({
      id: generateTransactionId(),
      type: 'expense',
      date: dateStr,
      amount: randomAmount(template.baseAmount, template.variance, amountSeed),
      description: randomPick(template.descriptions, descSeed),
      category: template.category,
      expenseType: template.type,
      currency: 'EUR',
    });
  }
  
  // Occasional expenses (always occur now to reach ~€40k annual expenses target)
  const occasionalTemplates = EXPENSE_TEMPLATES.filter(t => t.frequency === 'occasional');
  for (let idx = 0; idx < occasionalTemplates.length; idx++) {
    const template = occasionalTemplates[idx];
    // Generate 1-2 of each occasional expense per month
    const countSeed = monthSeed !== undefined ? monthSeed * 500 + idx : undefined;
    const countRand = countSeed !== undefined 
      ? seededRandom(countSeed, 0, 1)
      : Math.random();
    const count = countRand < 0.6 ? 1 : 2;
    
    for (let i = 0; i < count; i++) {
      const daySeed = monthSeed !== undefined ? monthSeed * 2000 + idx * 10 + i : undefined;
      const day = daySeed !== undefined
        ? Math.floor(seededRandom(daySeed, 1, 29))
        : Math.floor(Math.random() * 28) + 1;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      const amountSeed = monthSeed !== undefined ? monthSeed * 20000 + idx * 10 + i : undefined;
      const descSeed = monthSeed !== undefined ? monthSeed * 200000 + idx * 10 + i : undefined;
      
      expenses.push({
        id: generateTransactionId(),
        type: 'expense',
        date: dateStr,
        amount: randomAmount(template.baseAmount, template.variance, amountSeed),
        description: randomPick(template.descriptions, descSeed),
        category: template.category,
        expenseType: template.type,
        currency: 'EUR',
      });
    }
  }
  
  // Rare expenses (35% chance, seasonal for some)
  const rareTemplates = EXPENSE_TEMPLATES.filter(t => t.frequency === 'rare');
  for (let idx = 0; idx < rareTemplates.length; idx++) {
    const template = rareTemplates[idx];
    const shouldIncludeSeed = monthSeed !== undefined ? monthSeed * 300 + idx : undefined;
    const shouldIncludeRand = shouldIncludeSeed !== undefined
      ? seededRandom(shouldIncludeSeed, 0, 1)
      : Math.random();
    let shouldInclude = shouldIncludeRand < 0.35;
    
    // Special handling for holiday expenses
    if (template.category === 'HOLIDAYS') {
      // Higher chance in December, November, January
      if (month === 12) {
        shouldInclude = true;
      } else if (month === 11) {
        const novSeed = monthSeed !== undefined ? monthSeed * 400 + idx : undefined;
        const novRand = novSeed !== undefined ? seededRandom(novSeed, 0, 1) : Math.random();
        shouldInclude = novRand < 0.4;
      } else if (month === 1) {
        const janSeed = monthSeed !== undefined ? monthSeed * 400 + idx : undefined;
        const janRand = janSeed !== undefined ? seededRandom(janSeed, 0, 1) : Math.random();
        shouldInclude = janRand < 0.3;
      }
    }
    
    if (shouldInclude) {
      const daySeed = monthSeed !== undefined ? monthSeed * 3000 + idx : undefined;
      const day = daySeed !== undefined
        ? Math.floor(seededRandom(daySeed, 1, 29))
        : Math.floor(Math.random() * 28) + 1;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      const amountSeed = monthSeed !== undefined ? monthSeed * 30000 + idx : undefined;
      const descSeed = monthSeed !== undefined ? monthSeed * 300000 + idx : undefined;
      
      expenses.push({
        id: generateTransactionId(),
        type: 'expense',
        date: dateStr,
        amount: randomAmount(template.baseAmount, template.variance, amountSeed),
        description: randomPick(template.descriptions, descSeed),
        category: template.category,
        expenseType: template.type,
        currency: 'EUR',
      });
    }
  }
  
  // Sort by date
  expenses.sort((a, b) => a.date.localeCompare(b.date));
  
  return expenses;
}

/**
 * Generate demo expense tracker data for a specific year
 * @param targetYear - The year to generate data for (defaults to current year)
 * @param useSeed - Whether to use seeded random for deterministic results (defaults to false)
 */
export function generateDemoExpenseData(targetYear?: number, useSeed: boolean = false): ExpenseTrackerData {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const year = targetYear ?? currentYear;

  // Create 12 months of data for the target year
  const months = [];
  for (let month = 1; month <= 12; month++) {
    const monthData = createEmptyMonthData(year, month);
    monthData.incomes = generateMonthlyIncome(year, month);
    monthData.expenses = generateMonthlyExpenses(year, month, useSeed);
    months.push(monthData);
  }

  return {
    years: [
      {
        year,
        months,
        isArchived: false,
      },
    ],
    currentYear,
    currentMonth,
    currency: 'EUR',
    globalBudgets: [],
    planning: getDemoExpensePlanning(),
  };
}
