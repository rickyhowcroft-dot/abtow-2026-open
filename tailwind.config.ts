import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'serif': ['Georgia', 'Times New Roman', 'serif'],
        'sans': ['Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        'newspaper': {
          'dark': '#1a1a1a',
          'light': '#f8f8f8',
          'gold': '#d4af37',
        },
        'team': {
          'shafts': '#1e40af', // Blue
          'balls': '#dc2626', // Red
        }
      },
      screens: {
        'mobile': '320px',
      }
    },
  },
  plugins: [],
}
export default config