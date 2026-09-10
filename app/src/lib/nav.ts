import Feather from '@expo/vector-icons/Feather';
import type { Href } from 'expo-router';

export type FeatherName = keyof typeof Feather.glyphMap;

export interface NavItem {
  route: Href;
  icon: FeatherName;
  labelKey: string;
}

/** Hlavní akce aplikace – sdílené levým pruhem i dlaždicemi na úvodu. */
export const NAV_ITEMS: NavItem[] = [
  { route: '/diary', icon: 'book-open', labelKey: 'diary.open' },
  { route: '/water', icon: 'droplet', labelKey: 'water.open' },
  { route: '/weight', icon: 'activity', labelKey: 'weight.open' },
  { route: '/coach', icon: 'trending-up', labelKey: 'coach.open' },
  { route: '/photo', icon: 'camera', labelKey: 'photo.open' },
  { route: '/recipes', icon: 'clipboard', labelKey: 'recipes.open' },
  { route: '/plans', icon: 'calendar', labelKey: 'plans.open' },
  { route: '/reminders', icon: 'bell', labelKey: 'reminders.open' },
];
