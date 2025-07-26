/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./screens/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#111111',
        foreground: '#FFFFFF',
        card: '#1C1C1C',
        'card-foreground': '#FFFFFF',
        border: '#333333',
        accent: '#3B82F6',
        'accent-secondary': '#62B0F0',
        'accent-foreground': '#FFFFFF',
        muted: '#2F2F2F',
        'muted-foreground': '#AAAAAA',
        destructive: '#EF4444',
        'destructive-foreground': '#FFFFFF',
      },
      borderRadius: {
        'none': '0px',
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
      },
    },
  },
  plugins: [],
}