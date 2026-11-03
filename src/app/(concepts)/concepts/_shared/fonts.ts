import {
  Barlow_Condensed,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Martian_Mono,
  JetBrains_Mono,
  Azeret_Mono,
  Red_Hat_Display,
  Red_Hat_Text,
  Geist,
  Geist_Mono,
  Literata,
  Saira_Condensed,
  Overpass,
  Overpass_Mono,
  Mona_Sans,
  Hubot_Sans,
  Archivo,
  Archivo_Narrow,
  Space_Grotesk,
  Space_Mono,
  Bricolage_Grotesque,
  Chivo_Mono,
  Manrope,
  Fira_Code,
  Doto,
  Sometype_Mono,
  Caveat,
  Figtree,
  Sora,
  DM_Mono,
  Inter,
  Source_Code_Pro,
  Unbounded,
  Onest,
  Plus_Jakarta_Sans,
  Red_Hat_Mono,
  Schibsted_Grotesk,
  Hanken_Grotesk,
  Commissioner,
  Chakra_Petch,
  Titillium_Web,
  Noto_Sans,
  Noto_Sans_Mono,
  Playfair_Display,
} from 'next/font/google';

// Self-hosted by next/font. Not preloaded: each concept only uses its own two or three.
const barlow = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
  preload: false,
});
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
  preload: false,
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
  preload: false,
});
const martian = Martian_Mono({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-martian',
  display: 'swap',
  preload: false,
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
  preload: false,
});
const azeret = Azeret_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-azeret',
  display: 'swap',
  preload: false,
});
const redHatDisplay = Red_Hat_Display({
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  variable: '--font-rh-display',
  display: 'swap',
  preload: false,
});
const redHatText = Red_Hat_Text({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-rh-text',
  display: 'swap',
  preload: false,
});
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
  preload: false,
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
  preload: false,
});
const literata = Literata({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-literata',
  display: 'swap',
  preload: false,
});
const sairaCondensed = Saira_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-saira-cond',
  display: 'swap',
  preload: false,
});
const overpass = Overpass({
  subsets: ['latin'],
  variable: '--font-overpass',
  display: 'swap',
  preload: false,
});
const overpassMono = Overpass_Mono({
  subsets: ['latin'],
  variable: '--font-overpass-mono',
  display: 'swap',
  preload: false,
});
const monaSans = Mona_Sans({
  subsets: ['latin'],
  variable: '--font-mona',
  display: 'swap',
  preload: false,
});
const hubotSans = Hubot_Sans({
  subsets: ['latin'],
  variable: '--font-hubot',
  display: 'swap',
  preload: false,
});
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
  preload: false,
});
const archivoNarrow = Archivo_Narrow({
  subsets: ['latin'],
  variable: '--font-archivo-narrow',
  display: 'swap',
  preload: false,
});
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
  preload: false,
});
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
  preload: false,
});
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
  preload: false,
});
const chivoMono = Chivo_Mono({
  subsets: ['latin'],
  variable: '--font-chivo-mono',
  display: 'swap',
  preload: false,
});
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
  preload: false,
});
const firaCode = Fira_Code({
  subsets: ['latin'],
  variable: '--font-fira-code',
  display: 'swap',
  preload: false,
});
const doto = Doto({ subsets: ['latin'], variable: '--font-doto', display: 'swap', preload: false });
const sometype = Sometype_Mono({
  subsets: ['latin'],
  variable: '--font-sometype',
  display: 'swap',
  preload: false,
});
const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'swap',
  preload: false,
});
const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
  preload: false,
});
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap', preload: false });
const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
  preload: false,
});
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: false,
});
const sourceCode = Source_Code_Pro({
  subsets: ['latin'],
  variable: '--font-source-code',
  display: 'swap',
  preload: false,
});
const unbounded = Unbounded({
  subsets: ['latin'],
  variable: '--font-unbounded',
  display: 'swap',
  preload: false,
});
const onest = Onest({
  subsets: ['latin'],
  variable: '--font-onest',
  display: 'swap',
  preload: false,
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
  preload: false,
});
const redHatMono = Red_Hat_Mono({
  subsets: ['latin'],
  variable: '--font-rh-mono',
  display: 'swap',
  preload: false,
});
const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-schibsted',
  display: 'swap',
  preload: false,
});
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
  preload: false,
});
const commissioner = Commissioner({
  subsets: ['latin'],
  variable: '--font-commissioner',
  display: 'swap',
  preload: false,
});
const chakra = Chakra_Petch({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-chakra',
  display: 'swap',
  preload: false,
});
const titillium = Titillium_Web({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-titillium',
  display: 'swap',
  preload: false,
});
const notoSans = Noto_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-noto-sans',
  display: 'swap',
  preload: false,
});
const notoMono = Noto_Sans_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-noto-mono',
  display: 'swap',
  preload: false,
});
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
  preload: false,
});

export const fontVariables = [
  barlow,
  plexSans,
  plexMono,
  martian,
  jetbrains,
  azeret,
  redHatDisplay,
  redHatText,
  geist,
  geistMono,
  literata,
  sairaCondensed,
  overpass,
  overpassMono,
  monaSans,
  hubotSans,
  archivo,
  archivoNarrow,
  spaceGrotesk,
  spaceMono,
  bricolage,
  chivoMono,
  manrope,
  firaCode,
  doto,
  sometype,
  caveat,
  figtree,
  sora,
  dmMono,
  inter,
  sourceCode,
  unbounded,
  onest,
  jakarta,
  redHatMono,
  schibsted,
  hanken,
  commissioner,
  chakra,
  titillium,
  notoSans,
  notoMono,
  playfair,
]
  .map((font) => font.variable)
  .join(' ');
