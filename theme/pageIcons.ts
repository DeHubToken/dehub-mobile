/** Page identities bundled from the same original packs as web. */
const PAGE_ICONS: Record<string, { settings: number; features: number }> = {
  system: { settings: require('../assets/theme-icons/settings-system.webp'), features: require('../assets/theme-icons/features-system.webp') },
  minimal: { settings: require('../assets/theme-icons/settings-minimal.webp'), features: require('../assets/theme-icons/features-minimal.webp') },
  cosmic: { settings: require('../assets/theme-icons/settings-cosmic.webp'), features: require('../assets/theme-icons/features-cosmic.webp') },
  hazy: { settings: require('../assets/theme-icons/settings-hazy.webp'), features: require('../assets/theme-icons/features-hazy.webp') },
  swarms: { settings: require('../assets/theme-icons/settings-swarms.webp'), features: require('../assets/theme-icons/features-swarms.webp') },
  lavalamp: { settings: require('../assets/theme-icons/settings-lavalamp.webp'), features: require('../assets/theme-icons/features-lavalamp.webp') },
  winter: { settings: require('../assets/theme-icons/settings-winter.webp'), features: require('../assets/theme-icons/features-winter.webp') },
  war: { settings: require('../assets/theme-icons/settings-war.webp'), features: require('../assets/theme-icons/features-war.webp') },
  osaka: { settings: require('../assets/theme-icons/settings-osaka.webp'), features: require('../assets/theme-icons/features-osaka.webp') },
  jungle: { settings: require('../assets/theme-icons/settings-jungle.webp'), features: require('../assets/theme-icons/features-jungle.webp') },
  island: { settings: require('../assets/theme-icons/settings-island.webp'), features: require('../assets/theme-icons/features-island.webp') },
  hacker: { settings: require('../assets/theme-icons/settings-hacker.webp'), features: require('../assets/theme-icons/features-hacker.webp') },
  horror: { settings: require('../assets/theme-icons/settings-horror.webp'), features: require('../assets/theme-icons/features-horror.webp') },
};

export function themePageIcon(theme: string, key: 'settings' | 'features'): number {
  return (PAGE_ICONS[theme] ?? PAGE_ICONS.system)[key];
}
