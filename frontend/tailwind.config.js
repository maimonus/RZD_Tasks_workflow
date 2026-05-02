import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#D22630',
          redDark: '#B4202A',
          redDeep: '#95141D',
          blush: '#FBE8EA',
          paper: '#FBF7F4',
          sand: '#F4EEEA',
          ink: '#231815',
          border: '#DECFC8',
        },
      },
      fontFamily: {
        sans: ['Verdana', 'Geneva', ...defaultTheme.fontFamily.sans],
        serif: ['"RussianRail G Pro"', '"FSRailway"', 'Verdana', 'Geneva', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
}
