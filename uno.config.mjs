import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss'

export default defineConfig(
    {
        presets:
            [presetUno()
                , presetAttributify()
                , presetIcons()
            ]
        , shortcuts:
        {
            'rave-bg': 'bg-black text-white'
            , 'premium-gradient': 'bg-gradient-to-br from-purple-900 via-black to-blue-900'
            , 'glass': 'bg-white/3 border border-white/10 backdrop-blur-xl'
        }
        , preflights:
            [{
                getCSS: () => `
        /* Paul Irish's CSS Reset (simplified) */
        *, *::before, *::after { box-sizing: border-box }
        * { margin: 0 }
        body { line-height: 1.5; -webkit-font-smoothing: antialiased }
        img, picture, video, canvas, svg { display: block; max-width: 100% }
        input, button, textarea, select { font: inherit }
        p, h1, h2, h3, h4, h5, h6 { overflow-wrap: break-word }
        #root, #__next { isolation: isolate }
      `
            }
            ]
    })
