import { defineConfig, presetAttributify, presetIcons, presetUno, presetWebFonts } from 'unocss'

export default defineConfig({
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        'src/**/*.{js,ts}',
      ],
    },
  },
  theme: {
    colors: {

      primary: {
        50: 'rgb(var(--color-primary-50))',
        100: 'rgb(var(--color-primary-100))',
        200: 'rgb(var(--color-primary-200))',
        300: 'rgb(var(--color-primary-300))',
        400: 'rgb(var(--color-primary-400))',
        500: 'rgb(var(--color-primary-500))',
        600: 'rgb(var(--color-primary-600))',
        700: 'rgb(var(--color-primary-700))',
        800: 'rgb(var(--color-primary-800))',
        900: 'rgb(var(--color-primary-900))',
        950: 'rgb(var(--color-primary-950))',
        DEFAULT: 'rgb(var(--color-primary-500))',
      },
      theme: {
        bg: 'var(--theme-bg)',
        darkbg: 'var(--theme-dark-bg)',
      }
    }
  },
  safelist: [
    'i-carbon-chart-pie',
    'i-carbon-user',
    'i-carbon-user-multiple',
    'i-carbon-sprout',
    'i-carbon-analytics',
    'i-carbon-user-settings',
    'i-carbon-settings',
    'i-carbon-id-management',
    'i-carbon-book',
    // also other icons dynamically loaded like save or edit
    'i-carbon-save',
    'i-carbon-cloud-upload',
    'i-carbon-close',
    'i-carbon-edit',
    'i-carbon-checkmark',
    'i-carbon-notification'
  ],
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
      collections: {
        fas: () => import('@iconify-json/fa-solid/icons.json').then(i => i.default),
      },
    }),
    presetWebFonts({
      fonts: {
        sans: 'DM Sans',
        serif: 'DM Serif Display',
        mono: 'DM Mono',
      },
    }),
  ],
})
