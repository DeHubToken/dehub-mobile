const variableColor = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

const dynamicZinc = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
    step,
    variableColor(`zinc-${step}`),
  ]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./screens/**/*.{js,jsx,ts,tsx}",
    "./theme/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        black: variableColor("black"),
        white: variableColor("white"),
        zinc: dynamicZinc,
        blue: dynamicZinc,
        cyan: dynamicZinc,
        sky: dynamicZinc,
        teal: dynamicZinc,
        indigo: dynamicZinc,
        purple: dynamicZinc,
        violet: dynamicZinc,
        fuchsia: dynamicZinc,
        pink: dynamicZinc,
        rose: dynamicZinc,
        orange: dynamicZinc,
        amber: dynamicZinc,
        yellow: dynamicZinc,
        lime: dynamicZinc,
        border: "hsl(214.3 31.8% 91.4%)",
        input: "hsl(214.3 31.8% 91.4%)",
        ring: "hsl(222.2 84% 4.9%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(222.2 84% 4.9%)",
        primary: {
          DEFAULT: "hsl(222.2 47.4% 11.2%)",
          foreground: "hsl(210 40% 98%)",
        },
        secondary: {
          DEFAULT: "hsl(210 40% 96.1%)",
          foreground: "hsl(222.2 47.4% 11.2%)",
        },
        destructive: {
          DEFAULT: "hsl(0 84.2% 60.2%)",
          foreground: "hsl(210 40% 98%)",
        },
        muted: {
          DEFAULT: "hsl(210 40% 96.1%)",
          foreground: "hsl(215.4 16.3% 46.9%)",
        },
        accent: {
          DEFAULT: "hsl(210 40% 96.1%)",
          foreground: "hsl(222.2 47.4% 11.2%)",
        },
        popover: {
          DEFAULT: "hsl(0 0% 100%)",
          foreground: "hsl(222.2 84% 4.9%)",
        },
        card: {
          DEFAULT: "hsl(0 0% 100%)",
          foreground: "hsl(222.2 84% 4.9%)",
        },
        theme: {
          background: variableColor("theme-background"),
          "mine-shaft-dark": "hsl(0 0% 16%)" /* #292929 */,
          "cloud-burst": "hsl(215 35% 20%)" /* #223146 */,
          "mine-shaft": "hsl(0 0% 23%)" /* #3a3a3a */,
          "titan-white": "hsl(0 0% 95%)" /* #f1f1f1 */,
          yellow: {
            25: "hsl(42 100% 98%)" /* #FFFCF5 */,
            50: "hsl(45 100% 96%)" /* #FFFAEB */,
            100: "hsl(45 96% 89%)" /* #FEF0C7 */,
            200: "hsl(44 98% 77%)" /* #FEDF89 */,
            300: "hsl(42 99% 65%)" /* #FEC84B */,
            400: "hsl(39 98% 56%)" /* #FDB022 */,
            500: "hsl(34 94% 50%)" /* #F79009 */,
            600: "hsl(28 97% 44%)" /* #DC6803 */,
            700: "hsl(22 92% 37%)" /* #B54708 */,
            800: "hsl(19 84% 31%)" /* #93370D */,
            900: "hsl(18 79% 27%)" /* #7A2E0E */,
          },
          red: {
            25: "hsl(12 100% 99%)" /* #FFFBFA */,
            50: "hsl(5 86% 97%)" /* #FEF3F2 */,
            100: "hsl(4 93% 94%)" /* #FEE4E2 */,
            200: "hsl(3 96% 89%)" /* #FECDCA */,
            300: "hsl(4 96% 80%)" /* #FDA29B */,
            400: "hsl(4 92% 69%)" /* #F97066 */,
            500: "hsl(4 86% 58%)" /* #F04438 */,
            600: "hsl(4 74% 49%)" /* #D92D20 */,
            700: "hsl(4 76% 40%)" /* #B42318 */,
            800: "hsl(4 72% 33%)" /* #912018 */,
            900: "hsl(8 65% 29%)" /* #7A271A */,
          },
          green: {
            25: "hsl(142 80% 98%)" /* #F6FEF9 */,
            50: "hsl(145 81% 96%)" /* #ECFDF3 */,
            100: "hsl(140 80% 90%)" /* #D1FADF */,
            200: "hsl(144 78% 80%)" /* #A6F4C5 */,
            300: "hsl(148 74% 67%)" /* #6CE9A6 */,
            400: "hsl(150 66% 52%)" /* #32D583 */,
            500: "hsl(152 82% 39%)" /* #12B76A */,
            600: "hsl(153 96% 30%)" /* #039855 */,
            700: "hsl(155 97% 24%)" /* #027A48 */,
            800: "hsl(155 90% 20%)" /* #05603A */,
            900: "hsl(156 88% 16%)" /* #054F31 */,
          },
          blue: dynamicZinc,
          sky: {
            25: "hsl(192 100% 99%)" /* #FAFEFF */,
            50: "hsl(198 100% 98%)" /* #F5FCFF */,
            100: "hsl(199 100% 95%)" /* #E6F7FF */,
            200: "hsl(202 100% 92%)" /* #D4EFFF */,
            300: "hsl(206 92% 85%)" /* #B3DCFC */,
            400: "hsl(212 96% 78%)" /* #93C5FD */,
            500: "hsl(213 66% 68%)" /* #76A7E3 */,
            600: "hsl(216 45% 53%)" /* #517CBD */,
            700: "hsl(218 48% 40%)" /* #355996 */,
            800: "hsl(220 59% 28%)" /* #1E3A73 */,
            900: "hsl(222 70% 17%)" /* #0D1F4A */,
          },
          neutrals: {
            50: variableColor("theme-neutrals-50"),
            100: variableColor("theme-neutrals-100"),
            200: variableColor("theme-neutrals-200"),
            300: variableColor("theme-neutrals-300"),
            400: variableColor("theme-neutrals-400"),
            500: variableColor("theme-neutrals-500"),
            600: variableColor("theme-neutrals-600"),
            700: variableColor("theme-neutrals-700"),
            800: variableColor("theme-neutrals-800"),
            900: variableColor("theme-neutrals-900"),
          },
          accent: {
            DEFAULT: variableColor("theme-accent"),
            foreground: variableColor("theme-accent-foreground"),
            secondary: variableColor("theme-accent-secondary")
          },
        },
      },
      // Same radii as web (--radius: 0.5rem), but written in px. Web spells md
      // and sm as calc() and NativeWind drops any border-radius it cannot fold
      // to a single number, so rounded-md and rounded-sm compiled to nothing at
      // all and every chip, badge and skeleton using them rendered with square
      // corners. rem is no help either: NativeWind resolves it against React
      // Native's 14px root, so "0.5rem" is 7px here and 8px in the browser.
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
    },
  },
  plugins: [],
};
