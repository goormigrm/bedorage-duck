import { defineConfig, Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * 개발 서버 전용 스크린샷 저장 엔드포인트.
 * 페이지에서 캔버스를 합쳐 POST /__shot {name, data} 하면 docs/img/<name>.png 로 떨어진다.
 * 빌드 결과물에는 포함되지 않는다(apply: 'serve').
 */
function shotEndpoint(): Plugin {
  return {
    name: 'bd-shot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('POST only')
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(c as Buffer))
        req.on('end', () => {
          try {
            const { name, data } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              name: string
              data: string
            }
            const safe = name.replace(/[^a-z0-9_-]/gi, '')
            const dir = root + 'docs/img'
            mkdirSync(dir, { recursive: true })
            const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64')
            const ext = data.startsWith('data:image/jpeg') ? 'jpg' : 'png'
            writeFileSync(`${dir}/${safe}.${ext}`, buf)
            res.end(`${safe}.${ext} ${buf.length}`)
          } catch (e) {
            res.statusCode = 500
            res.end(String(e))
          }
        })
      })
    },
  }
}

export default defineConfig({
  base: '/bedorage-duck/',
  plugins: [shotEndpoint()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: root + 'index.html',
        preview: root + 'preview.html',
      },
    },
  },
  server: {
    port: 5173,
  },
})
