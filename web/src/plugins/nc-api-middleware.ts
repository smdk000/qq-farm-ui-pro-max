// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'

// 这是一个 Vite 插件栈，用于在开发环境下直接读取根目录的 nc_api_version
export function ncApiMiddleware(): Plugin {
    return {
        name: 'nc-api-middleware',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url?.startsWith('/nc_api_version/')) {
                    // 当前进程 cwd 在根目录或者是 web 下，动态计算项目的真是 Root
                    let projectRoot = process.cwd()
                    if (projectRoot.endsWith('/web')) {
                        projectRoot = projectRoot.replace('/web', '')
                    }

                    let urlPath = (req.url || '').split('?')[0]
                    if (urlPath.startsWith('/')) {
                        urlPath = urlPath.substring(1)
                    }
                    const filePath = path.join(projectRoot, decodeURIComponent(urlPath))
                    console.log(`[NC API Check] Requesting: ${urlPath}, Resolved File: ${filePath}`)

                    if (fs.existsSync(filePath)) {
                        let contentType = 'text/html; charset=utf-8'
                        if (filePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8'
                        else if (filePath.endsWith('.css')) contentType = 'text/css; charset=utf-8'
                        else if (filePath.endsWith('.png')) contentType = 'image/png'
                        else if (filePath.endsWith('.ico')) contentType = 'image/x-icon'
                        else if (filePath.endsWith('.json')) contentType = 'application/json; charset=utf-8'

                        res.setHeader('Content-Type', contentType)
                        res.end(fs.readFileSync(filePath))
                        return
                    }
                }
                next()
            })
        }
    }
}
