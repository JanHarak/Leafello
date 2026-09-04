/**
 * Malá ukázková sada potravin pro deník „nasucho" (bez databáze).
 * Hodnoty jsou na 100 g. Nahradí je import z Open Food Facts (fáze 2),
 * jakmile bude deník napojený na Supabase.
 */
export interface SampleFood {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const SAMPLE_FOODS: SampleFood[] = [
  { id: 'rice', name: 'Rýže vařená', kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { id: 'chicken', name: 'Kuřecí prsa', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: 'egg', name: 'Vejce', kcal: 155, protein: 13, carbs: 1.1, fat: 11 },
  { id: 'banana', name: 'Banán', kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 },
  { id: 'apple', name: 'Jablko', kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 },
  { id: 'bread', name: 'Chléb', kcal: 265, protein: 9, carbs: 49, fat: 3.2 },
  { id: 'milk', name: 'Mléko polotučné', kcal: 47, protein: 3.3, carbs: 4.8, fat: 1.5 },
  { id: 'quark', name: 'Tvaroh', kcal: 98, protein: 12, carbs: 3.5, fat: 4 },
  { id: 'oats', name: 'Ovesné vločky', kcal: 379, protein: 13, carbs: 67, fat: 7 },
  { id: 'salmon', name: 'Losos', kcal: 208, protein: 20, carbs: 0, fat: 13 },
  { id: 'potato', name: 'Brambory vařené', kcal: 87, protein: 2, carbs: 20, fat: 0.1 },
  { id: 'yogurt', name: 'Bílý jogurt', kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.3 },
];
