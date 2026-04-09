/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0F5132',
        accent: '#C9A227',
        muted: '#F7F4EA'
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        heading: ['Merriweather', 'serif']
      }
    }
  },
  plugins: []
};
