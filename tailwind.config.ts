import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app//*.{js,ts,jsx,tsx}',
    './components//*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif','system-ui','Segoe UI','Roboto',
          'Helvetica Neue','Arial','Noto Sans','Apple Color Emoji',
          'Segoe UI Emoji','Segoe UI Symbol'
        ]
      }
    }
  },
  plugins: []
}
export default config