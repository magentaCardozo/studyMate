import typography from '@tailwindcss/typography';

/** Système de design StudyMate AI : cramoisi académique, ivoire, typographie éditoriale. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        crimson: { DEFAULT: '#A51C30', dark: '#7F1425', soft: '#F6E8EA' },
        ivory: '#F7F4ED',
        charcoal: '#1F2937',
        muted: '#6B7280',
        line: '#E5E7EB',
        success: { DEFAULT: '#287D55', soft: '#E7F3EC' },
        warning: { DEFAULT: '#B7791F', soft: '#FBF1E1' },
        danger: { DEFAULT: '#B42318', soft: '#FCEBEA' },
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '8px', lg: '10px', xl: '12px' },
      boxShadow: { card: '0 1px 2px rgba(31,41,55,0.04)', pop: '0 8px 24px rgba(31,41,55,0.12)' },
      maxWidth: { content: '1200px' },
    },
  },
  plugins: [typography],
};
