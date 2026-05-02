import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        board: {
          light: '#F0D9B5',
          dark: '#B58863',
          selected: '#F6F669',
          highlight: '#CDD26A',
        },
      },
    },
  },
  plugins: [],
};

export default config;
