// Seed for the student workspace: the "Week 6 · Mini Cart" lesson (design-docs/07-seed-and-demo.md).
//
// A real Vite + Vue project with a small Express API. `pnpm dev` runs both: Vite on 5173 and
// the API on 3001, with Vite proxying /api. No mock API: lessons ship their own server now.
//
// Shape follows the lessons table (03-data-model.md) in camelCase, as the api layer returns it:
//   files      [{ path, language, content }]   flat list; folders come from the "/" in each path
//   entryFile  the file the dev server starts from
//   devCommand what WebContainer runs after install
//   steps      what parseTodos(files, entryFile) should produce, so the Steps panel has data
//
// Generated from the project folder by scripts/generate-seed-v2.mjs. Edit the project, not this file.

export const miniCartSeed = {
  title: 'Week 6 · Mini Cart',
  week: 6,
  description: 'Props, emits, axios against a real Express API, a computed total and localStorage.',
  entryFile: 'index.html',
  devCommand: 'pnpm dev',
  status: 'ready',
  files: [
    {
      path: 'index.html',
      language: 'html',
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:," />
    <title>Mini Cart</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
    },
    {
      path: 'package.json',
      language: 'json',
      content: `{
  "name": "mini-cart",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently --kill-others --names api,web \\"node server/api.js\\" \\"vite\\"",
    "build": "vite build"
  },
  "dependencies": {
    "axios": "^1.20.0",
    "vue": "^3.5.44"
  },
  "devDependencies": {
    "@napi-rs/wasm-runtime": "1.2.5",
    "@rolldown/binding-wasm32-wasi": "1.2.15",
    "@vitejs/plugin-vue": "^6.0.10",
    "concurrently": "^10.0.6",
    "express": "^5.3.0",
    "vite": "^8.1.5"
  }
}
`,
    },
    {
      path: 'pnpm-lock.yaml',
      language: 'yaml',
      content: `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .:
    dependencies:
      axios:
        specifier: ^1.20.0
        version: 1.20.0(debug@4.4.3(supports-color@10.2.2))(supports-color@10.2.2)
      vue:
        specifier: ^3.5.44
        version: 3.5.44
    devDependencies:
      '@napi-rs/wasm-runtime':
        specifier: 1.2.5
        version: 1.2.5(@emnapi/core@2.0.0-alpha.5)(@emnapi/runtime@2.0.0-alpha.5)
      '@rolldown/binding-wasm32-wasi':
        specifier: 1.2.15
        version: 1.2.15
      '@vitejs/plugin-vue':
        specifier: ^6.0.10
        version: 6.0.10(vite@8.3.5)(vue@3.5.44)
      concurrently:
        specifier: ^10.0.6
        version: 10.0.6
      express:
        specifier: ^5.3.0
        version: 5.3.0(supports-color@10.2.2)
      vite:
        specifier: ^8.1.5
        version: 8.3.5

packages:

  '@babel/helper-string-parser@7.29.11':
    resolution: {integrity: sha512-snZbO7MEDOof+hvNa97EjEY7qD7h2kwvQr5AJC3ZhQudKW5dnej6k3kP9NQV88hJwaS8vDqRLFo9rivLEhle2g==}
    engines: {node: '>=6.9.0'}

  '@babel/helper-validator-identifier@7.29.7':
    resolution: {integrity: sha512-qehxGkRj55h/ff8EMaJ+cYhyaKlHIxqYDn682wQD7RNp9UujOQsHog2uS0r2vzr4pW+sXf90NeeayjcNaX3fFg==}
    engines: {node: '>=6.9.0'}

  '@babel/parser@7.29.11':
    resolution: {integrity: sha512-OZ6+oaK7GMyg3IfCpj8JOmn8n+w2rJbDT0LLfVDTLb1ZFeKDh3AiNELgCMUw175IJHSkLl74hG0M0VLsvx+gag==}
    engines: {node: '>=6.0.0'}
    hasBin: true

  '@babel/types@7.29.11':
    resolution: {integrity: sha512-WCsemW40Cpc6gouC1SrY6PBaZ+oLRlEVY9XBvZBI7il/HyUrb2nJ505wE1MHEFyDZNnrWDEuy4jL50WVHfTTSQ==}
    engines: {node: '>=6.9.0'}

  '@emnapi/core@2.0.0-alpha.5':
    resolution: {integrity: sha512-DbeLFquQJyYGwM3LzPdjvb4IRmAAQuTzEmqUGtIAYxlAO4ArfUZ7WMytLWDSsCAYm6MZJNeojaawQQiFrFVehg==}

  '@emnapi/runtime@2.0.0-alpha.5':
    resolution: {integrity: sha512-SS4jUXRklsrPKTEtW92WHdneh9QBrZGmRyeYEac2ktLN3ie1wd/BrkBbk4DqPWKhjSFfrR8NClXwMlfZ73m60A==}

  '@emnapi/wasi-threads@2.1.0':
    resolution: {integrity: sha512-DM18NXgQ5coifswrwhFgrqeW/UiFRaLj0aLKU0cp0FoYjEfP/hj/yUeF+Hz754ViG+jQmG2HIeDCUeQsPnRwOA==}

  '@jridgewell/sourcemap-codec@1.6.0':
    resolution: {integrity: sha512-T7jf+5zgsZHwNJ4lvQ7/aezbyk0nNX+zJVWpmHA7VYsEx7a7qr5Rg5IbtJFqkgze5Y2sruq1RUY8Q837Od7iFw==}

  '@napi-rs/wasm-runtime@1.2.5':
    resolution: {integrity: sha512-HshSvXzmBxNzqejd3k/KemgQ3hdREUYFRRrgxOZ+gPljDIsO2SDZrVZMd4Z/HsxudQbE62OVyVFE8z9BCurfjA==}
    engines: {node: ^20.19.0 || ^22.13.0 || >=23.5.0}
    peerDependencies:
      '@emnapi/core': ^1.7.1 || ^2.0.0-alpha.4
      '@emnapi/runtime': ^1.7.1 || ^2.0.0-alpha.4

  '@oxc-project/types@0.155.0':
    resolution: {integrity: sha512-SeE8JPwW1xs1tHeNycjUtUBdhorRa8o4jlvjwk49R7/Z291i+4DQa7JJIgOm/TaYQZx+QrPQbVJ/9c8dMIZN8Q==}

  '@rolldown/binding-android-arm-eabi@1.2.15':
    resolution: {integrity: sha512-aLcgK9gIJ3YRvrrtfSBbRa27F5WrpiTaPulnFpsHPxpUHgFlSgnU4854MHwoRGEBhfRJDWCS2WQ7lIjskE9Olw==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [arm]
    os: [android]

  '@rolldown/binding-android-arm64@1.2.15':
    resolution: {integrity: sha512-xD7DdZCrbThKuxNg7ooQmvp07ys4J/pnSEMTG3/OdOWl6daC67m/Q4fL78sRHMxTH/N4fGUbYhcPM0MF5WFHkg==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [arm64]
    os: [android]

  '@rolldown/binding-darwin-arm64@1.2.15':
    resolution: {integrity: sha512-m2WuQ6r0B4OTYxyPpNLtXaMRbRDUbG8YQV2Q3KTdSSK8Th6KHCnC8jVCJt8bvYeSB5WivkkNbc85mKadaSdOxA==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [arm64]
    os: [darwin]

  '@rolldown/binding-darwin-x64@1.2.15':
    resolution: {integrity: sha512-5RtnsHM36nodM9WbMy+zip0LGS/G+y5wro5RHrpOlr4ac24+1zSi9kiV2MP1myZeZ/ifEHfulQcWjnAXzc2C2A==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [x64]
    os: [darwin]

  '@rolldown/binding-freebsd-x64@1.2.15':
    resolution: {integrity: sha512-g3l09pyFqhu+135JKkbkwiKGQmwU5hUMUPJ4VdBADvuqR8d33L6H578rh8m7rtxbdp+VmX/+nzI7nvhSZlzpUQ==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [x64]
    os: [freebsd]

  '@rolldown/binding-linux-arm-gnueabihf@1.2.15':
    resolution: {integrity: sha512-nIe3VugI97nGQtspPxDqA4sXMUpeiocKIP/CqpY/u/vgbT+alX+cVxu1C/oVBPKg4feNTmYovE91v4DgXvXNwQ==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [arm]
    os: [linux]

  '@rolldown/binding-linux-arm64-gnu@1.2.15':
    resolution: {integrity: sha512-iTBjXx+B5QSvgI89lJfmqh4wTh8NabR1YZIIN3hNx4zSG0EVfVqkOvLulNpG4251pbd6/IAmZ/LefVk1Y4rPhw==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [arm64]
    os: [linux]
    libc: [glibc]

  '@rolldown/binding-linux-arm64-musl@1.2.15':
    resolution: {integrity: sha512-uN26XOnVR7rqQupG3V9oAG2EGGatWjcJHOeDOHUFCh4TBWmP2tHTFoVN13aYbwfm0aHqJAEmcwhAu6sooIjfqQ==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [arm64]
    os: [linux]
    libc: [musl]

  '@rolldown/binding-linux-ppc64-gnu@1.2.15':
    resolution: {integrity: sha512-9nWkcdd+H+XhaA3fQIwpHnKIrfx/PQ6rO0pivr78Og07tXlUlctBBJoEYLPfhTmCR/QxEVdn6uPjHV5SymPhdw==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [ppc64]
    os: [linux]
    libc: [glibc]

  '@rolldown/binding-linux-s390x-gnu@1.2.15':
    resolution: {integrity: sha512-Ggh0ciFjLwIusLSLz7LZYEaGdxOAUJXI+Qu5JCbhPJJHEt8vP+IjRATTJheiJsdzzTYgUiHUiw3X1Ea3ZpMBdA==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [s390x]
    os: [linux]
    libc: [glibc]

  '@rolldown/binding-linux-x64-gnu@1.2.15':
    resolution: {integrity: sha512-FHg60rS6DBePAYZ9X9F67x+JObFdmgn6tupA1C/a3B+CufFmTD4mX+e8M75tCiAO3foR/6xwVBI0KQiI7sn/rw==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [x64]
    os: [linux]
    libc: [glibc]

  '@rolldown/binding-linux-x64-musl@1.2.15':
    resolution: {integrity: sha512-/cvV/7v5VGz/moiz0XKRj2dE8DzsKyhIu1KpOvJGPjRywg3yscON889UGvAe8zfiJLHup7VLjBduoGWi3HusWQ==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [x64]
    os: [linux]
    libc: [musl]

  '@rolldown/binding-openharmony-arm64@1.2.15':
    resolution: {integrity: sha512-MyzC5Hrv/sm+Z7TSGKP/j8001RO2xQm1zOpCNVL4j0cY/VhBZviludA2YFQ7i4lH6ZAXxQm0lcMdBzM+99mE7w==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [arm64]
    os: [openharmony]

  '@rolldown/binding-wasm32-wasi@1.2.15':
    resolution: {integrity: sha512-aYj3yBVx9X874dyvngLnvW/a+VEiUJsZ+bqnA+8gLz1jxCEUSnyFFLfifVhHc1WpRKbq1mCN/c+8bHFvOvpiyg==}
    engines: {node: ^20.19.0 || ^22.13.0 || >=23.5.0}

  '@rolldown/binding-win32-arm64-msvc@1.2.15':
    resolution: {integrity: sha512-+PgYiS+AH5omy6L45ZLxybasauJaj3M8buoT83D+nzPmCayXlxUV9hydhciCKVyIg0B/v0BtXPDE1uGqNwCPpg==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [arm64]
    os: [win32]

  '@rolldown/binding-win32-x64-msvc@1.2.15':
    resolution: {integrity: sha512-HFZd2QNQYn1JbIi+Hpd7H+r/lkWxcfIu28nirZ6eCn2LafuvmExMlb/P96Sfx5tf7pPArw39IdhmCF8vmV+NhQ==}
    engines: {node: ^20.19.0 || >=22.12.0}
    cpu: [x64]
    os: [win32]

  '@rolldown/pluginutils@1.0.1':
    resolution: {integrity: sha512-2j9bGt5Jh8hj+vPtgzPtl72j0yRxHAyumoo6TNfAjsLB04UtpSvPbPcDcBMxz7n+9CYB0c1GxQFxYRg2jimqGw==}

  '@tybys/wasm-util@0.10.4':
    resolution: {integrity: sha512-W3c4gRigFS0T/Ma4qIYF3GDAc5AQdHb1yL5znJT1Zv1YaD9Kitx656wBjvr19qbiosmZT8lWDM5BEMynUqX65A==}

  '@vitejs/plugin-vue@6.0.10':
    resolution: {integrity: sha512-b80aUQh3n+qEzzZm5oQp3rT2QImeCx58K6eFl/RkJ3d65KW0kTuv5lNsLRVAjbW9YRUpo/wzmvzMgV34bTAItA==}
    engines: {node: ^20.19.0 || >=22.12.0}
    peerDependencies:
      vite: ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0
      vue: ^3.2.25 || ^3.6.0-rc.10

  '@vue/compiler-core@3.5.44':
    resolution: {integrity: sha512-k34nCytbK8PQ1gR2mGROYOw6Pnv/mumqIdrZ3x2tbyXZDWm7ViKGLTfdB+DRrWqEQsLgGJvn0WN9jBif5zCTLQ==}

  '@vue/compiler-dom@3.5.44':
    resolution: {integrity: sha512-W5AoBFWdw1lQAKiHowkfgFKFab82oSRT6sGsPfw/q1GRjsy/ZJFLHGhJyBRIFN9APLTUduDH9U2JAiPOIyKuYg==}

  '@vue/compiler-sfc@3.5.44':
    resolution: {integrity: sha512-dzHmQ4jXTpdr5FjIQUeykVakN/uzqFbUo9/C5ikBFg3a3PeM6uRxeczx1ZbXBML0/zJstEh3ygYipzR5Z7b2Pw==}

  '@vue/compiler-ssr@3.5.44':
    resolution: {integrity: sha512-xr5gb1JVHlfXJwSlRz1FeP6uxoazdzHuMTVLE7up+4Vrqxk219CvxLPxD9NXBt47yvZW7+p4DXfyp4O1fkByIA==}

  '@vue/reactivity@3.5.44':
    resolution: {integrity: sha512-u+QJdKeBBEADkPdevsL+6E12QlYVfBD8Zcw5qjDQKtamI6l14KyqazJMobhCKelhWN5zpyKUiEDoTyHE93cqWw==}

  '@vue/runtime-core@3.5.44':
    resolution: {integrity: sha512-uEa/ndwjhrrhnOfb2p+sZy6zeoamJOISqaLSJGk/8R6nABT1ZldpzcJoPzKj+zHVomVBPcmQYyC2r4LtvDV6CQ==}

  '@vue/runtime-dom@3.5.44':
    resolution: {integrity: sha512-3fc4ARcXVhVBaJ3ujWiNZJARD6pkyRcwG+ZYhMzjKtKUp7MAY0HLwr7r3Smep3Li6ZaWT6ewdmx8XqdaD5oNZg==}

  '@vue/server-renderer@3.5.44':
    resolution: {integrity: sha512-R4S1UoH4h5Frrauv8Z5XE5TxV9oBiUSgWIC4TyVK1FK+RocRnOLwFA5Xcmo2011RlgJp+AbZCnw6afrhlgRuUQ==}

  '@vue/shared@3.5.44':
    resolution: {integrity: sha512-H82XLH0DjmSOdbEwO15x3QTo1f5PWEtv237eLpYKc0mqLu+B8hnq16lFWmuBmNurkeiG3wr+oM1FhOll/YVFRg==}

  accepts@2.0.0:
    resolution: {integrity: sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==}
    engines: {node: '>= 0.6'}

  agent-base@6.0.2:
    resolution: {integrity: sha512-RZNwNclF7+MS/8bDg70amg32dyeZGZxiDuQmZxKLAlQjr3jGyLx+4Kkk58UO7D2QdgFIQCovuSuZESne6RG6XQ==}
    engines: {node: '>= 6.0.0'}

  ansi-regex@6.4.0:
    resolution: {integrity: sha512-KzTVk2tCWAHtYrvvvaP8bJKJq2pVinhLcGEQdtLIYPbmNGNyYe8QwNaTUYQp2J7/vIsUKt5QCqAfUkYyG9DkOw==}
    engines: {node: '>=12'}

  ansi-styles@6.2.3:
    resolution: {integrity: sha512-4Dj6M28JB+oAH8kFkTLUo+a2jwOFkuqb3yucU0CANcRRUbxS0cP0nZYCGjcc3BNXwRIsUVmDGgzawme7zvJHvg==}
    engines: {node: '>=12'}

  asynckit@0.4.0:
    resolution: {integrity: sha512-Oei9OH4tRh0YqU3GxhX79dM/mwVgvbZJaSNaRk+bshkj0S5cfHcgYakreBjrHwatXKbz+IoIdYLxrKim2MjW0Q==}

  axios@1.20.0:
    resolution: {integrity: sha512-r8aOh8j9cGKpgQAqpzrUHnSIc6a59Y3Xf/cv8sy1DrHCkZHzQGEuoq1tARk6qSyDdtQGSDgpb9kFlruzPvrgwg==}

  body-parser@2.4.0:
    resolution: {integrity: sha512-Ifk1KcLrxaGt1occQagQNFNNOqRt1LFuehEnHHzB8Z6cRgIxRU1TBaiIsUiCdA+gy5PL7Y1IX31DNKkRmxtXjQ==}
    engines: {node: '>=18'}

  bytes@3.1.2:
    resolution: {integrity: sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==}
    engines: {node: '>= 0.8'}

  call-bind-apply-helpers@1.0.2:
    resolution: {integrity: sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==}
    engines: {node: '>= 0.4'}

  call-bound@1.0.4:
    resolution: {integrity: sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==}
    engines: {node: '>= 0.4'}

  chalk@5.6.2:
    resolution: {integrity: sha512-7NzBL0rN6fMUW+f7A6Io4h40qQlG+xGmtMxfbnH/K7TAtt8JQWVQK+6g0UXKMeVJoyV5EkkNsErQ8pVD3bLHbA==}
    engines: {node: ^12.17.0 || ^14.13 || >=16.0.0}

  cliui@9.0.1:
    resolution: {integrity: sha512-k7ndgKhwoQveBL+/1tqGJYNz097I7WOvwbmmU2AR5+magtbjPWQTS1C5vzGkBC8Ym8UWRzfKUzUUqFLypY4Q+w==}
    engines: {node: '>=20'}

  combined-stream@1.0.8:
    resolution: {integrity: sha512-FQN4MRfuJeHf7cBbBMJFXhKSDq+2kAArBlmRBvcvFE5BB1HZKXtSFASDhdlz9zOYwxh8lDdnvmMOe/+5cdoEdg==}
    engines: {node: '>= 0.8'}

  concurrently@10.0.6:
    resolution: {integrity: sha512-qgICXXFp2/3nAebRLmxcINKEXM1mLK3ij/y31P02VTs/KIkddIeC05n73DxOXsXMB9LFSqNU1/na3lDlOhcbIw==}
    engines: {node: '>=22'}
    hasBin: true

  content-disposition@2.0.1:
    resolution: {integrity: sha512-e+H0ZXHSWYrENhQzw1LPuP4oF5MzVKmDU6d3hxlvaPEYLLg62MxtQNPRx4SYSuYJSBUgnQIG4HIN2tEtNv7Dog==}
    engines: {node: '>=18'}

  content-type@2.1.0:
    resolution: {integrity: sha512-mj7UPXE0jaqaOsukNZRUEfEi2AcL7C/vwmwcHV0O97eO1E1pxBZuyjlZrx5seTaNBg1U6+o35wpa35Qfcc+7ag==}
    engines: {node: '>=18'}

  cookie-signature@1.2.2:
    resolution: {integrity: sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==}
    engines: {node: '>=6.6.0'}

  cookie@0.7.2:
    resolution: {integrity: sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==}
    engines: {node: '>= 0.6'}

  csstype@3.2.3:
    resolution: {integrity: sha512-z1HGKcYy2xA8AGQfwrn0PAy+PB7X/GSj3UVJW9qKyn43xWa+gl5nXmU4qqLMRzWVLFC8KusUX8T/0kCiOYpAIQ==}

  debug@4.4.3:
    resolution: {integrity: sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==}
    engines: {node: '>=6.0'}
    peerDependencies:
      supports-color: '*'
    peerDependenciesMeta:
      supports-color:
        optional: true

  delayed-stream@1.0.0:
    resolution: {integrity: sha512-ZySD7Nf91aLB0RxL4KGrKHBXl7Eds1DAmEdcoVawXnLD7SDhpNgtuII2aAkg7a7QS41jxPSZ17p4VdGnMHk3MQ==}
    engines: {node: '>=0.4.0'}

  depd@2.0.0:
    resolution: {integrity: sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==}
    engines: {node: '>= 0.8'}

  detect-libc@2.1.2:
    resolution: {integrity: sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==}
    engines: {node: '>=8'}

  dunder-proto@1.0.1:
    resolution: {integrity: sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==}
    engines: {node: '>= 0.4'}

  ee-first@1.1.1:
    resolution: {integrity: sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==}

  emoji-regex@10.6.0:
    resolution: {integrity: sha512-toUI84YS5YmxW219erniWD0CIVOo46xGKColeNQRgOzDorgBi1v4D71/OFzgD9GO2UGKIv1C3Sp8DAn0+j5w7A==}

  encodeurl@2.0.0:
    resolution: {integrity: sha512-Q0n9HRi4m6JuGIV1eFlmvJB7ZEVxu93IrMyiMsGC0lrMJMWzRgx6WGquyfQgZVb31vhGgXnfmPNNXmxnOkRBrg==}
    engines: {node: '>= 0.8'}

  entities@7.0.1:
    resolution: {integrity: sha512-TWrgLOFUQTH994YUyl1yT4uyavY5nNB5muff+RtWaqNVCAK408b5ZnnbNAUEWLTCpum9w6arT70i1XdQ4UeOPA==}
    engines: {node: '>=0.12'}

  es-define-property@1.0.1:
    resolution: {integrity: sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==}
    engines: {node: '>= 0.4'}

  es-errors@1.3.0:
    resolution: {integrity: sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==}
    engines: {node: '>= 0.4'}

  es-object-atoms@1.1.2:
    resolution: {integrity: sha512-HWcBoN6NileqtSydK2FqHbS/LoDd2pqrnQHLyJzBj4kOp/ky2MWMN694xOfkK8/SnUsW2DH7EfyVlydKCsm1Zw==}
    engines: {node: '>= 0.4'}

  es-set-tostringtag@2.1.0:
    resolution: {integrity: sha512-j6vWzfrGVfyXxge+O0x5sh6cvxAog0a/4Rdd2K36zCMV5eJ+/+tOAngRO8cODMNWbVRdVlmGZQL2YS3yR8bIUA==}
    engines: {node: '>= 0.4'}

  escalade@3.2.0:
    resolution: {integrity: sha512-WUj2qlxaQtO4g6Pq5c29GTcWGDyd8itL8zTlipgECz3JesAiiOKotd8JU6otB3PACgG6xkJUyVhboMS+bje/jA==}
    engines: {node: '>=6'}

  escape-html@1.0.3:
    resolution: {integrity: sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==}

  estree-walker@2.0.2:
    resolution: {integrity: sha512-Rfkk/Mp/DL7JVje3u18FxFujQlTNR2q6QfMSMB7AvCBx91NGj/ba3kCfza0f6dVDbw7YlRf/nDrn7pQrCCyQ/w==}

  etag@1.8.1:
    resolution: {integrity: sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==}
    engines: {node: '>= 0.6'}

  express@5.3.0:
    resolution: {integrity: sha512-qCqy1xSoaugxOD4IVHb1ZWdkvCF2W3aE2okKouWj8VwJ+ztskSiXoBnCSJqfKT+cVPJhuJqe9YLbY425+Zh00g==}
    engines: {node: '>= 18'}

  fdir@6.5.0:
    resolution: {integrity: sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==}
    engines: {node: '>=12.0.0'}
    peerDependencies:
      picomatch: ^3 || ^4
    peerDependenciesMeta:
      picomatch:
        optional: true

  finalhandler@2.1.1:
    resolution: {integrity: sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==}
    engines: {node: '>= 18.0.0'}

  follow-redirects@1.16.1:
    resolution: {integrity: sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==}
    engines: {node: '>=4.0'}
    peerDependencies:
      debug: '*'
    peerDependenciesMeta:
      debug:
        optional: true

  form-data@4.0.6:
    resolution: {integrity: sha512-vKatAh4SlVfgbv+YtmhiRjhEMJsYpsG1Y2rMQtR+SVSbytsSD1YGzDIcrAJmdFec88u/+VoGmxnl+80gL1tRCQ==}
    engines: {node: '>= 6'}

  forwarded@0.2.0:
    resolution: {integrity: sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==}
    engines: {node: '>= 0.6'}

  fresh@2.0.0:
    resolution: {integrity: sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==}
    engines: {node: '>= 0.8'}

  fsevents@2.3.3:
    resolution: {integrity: sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==}
    engines: {node: ^8.16.0 || ^10.6.0 || >=11.0.0}
    os: [darwin]

  function-bind@1.1.2:
    resolution: {integrity: sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==}

  get-caller-file@2.0.5:
    resolution: {integrity: sha512-DyFP3BM/3YHTQOCUL/w0OZHR0lpKeGrxotcHWcqNEdnltqFwXVfhEBQ94eIo34AfQpo0rGki4cyIiftY06h2Fg==}
    engines: {node: 6.* || 8.* || >= 10.*}

  get-east-asian-width@1.7.0:
    resolution: {integrity: sha512-XjH1AECxf0giL2V1aU8vKyRR2ppRUb5c0EvT7zuJTokQ74bNo52zOtghqdWIqrhUD79fo3x0WfKZdOqxF6LG1Q==}
    engines: {node: '>=18'}

  get-intrinsic@1.3.0:
    resolution: {integrity: sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==}
    engines: {node: '>= 0.4'}

  get-proto@1.0.1:
    resolution: {integrity: sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==}
    engines: {node: '>= 0.4'}

  gopd@1.2.0:
    resolution: {integrity: sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==}
    engines: {node: '>= 0.4'}

  has-symbols@1.1.0:
    resolution: {integrity: sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==}
    engines: {node: '>= 0.4'}

  has-tostringtag@1.0.2:
    resolution: {integrity: sha512-NqADB8VjPFLM2V0VvHUewwwsw0ZWBaIdgo+ieHtK3hasLz4qeCRjYcqfB6AQrBggRKppKF8L52/VqdVsO47Dlw==}
    engines: {node: '>= 0.4'}

  hasown@2.0.4:
    resolution: {integrity: sha512-T2UbfbBEF32wiepXIsMlTW9+dDYC6wMh/t/vYA4tuOMKqWz/n3vr1NFSxQiyP+zk2mXsoMA/i/7qV6LKut1t1A==}
    engines: {node: '>= 0.4'}

  http-errors@2.0.1:
    resolution: {integrity: sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==}
    engines: {node: '>= 0.8'}

  https-proxy-agent@5.0.1:
    resolution: {integrity: sha512-dFcAjpTQFgoLMzC2VwU+C/CbS7uRL0lWmxDITmqm7C+7F0Odmj6s9l6alZc6AELXhrnggM2CeWSXHGOdX2YtwA==}
    engines: {node: '>= 6'}

  iconv-lite@0.7.3:
    resolution: {integrity: sha512-IKXpvIzjnC9XTAUbVBcMfGS0EPaIXtW6v+zr+RRp+hqULEpo0owZax6wyRwPOJbWbzjYspQwusTsfVr0ifh4uQ==}
    engines: {node: '>=0.10.0'}

  inherits@2.0.4:
    resolution: {integrity: sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==}

  ipaddr.js@1.9.1:
    resolution: {integrity: sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==}
    engines: {node: '>= 0.10'}

  is-promise@4.0.0:
    resolution: {integrity: sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==}

  lightningcss-android-arm64@1.33.0:
    resolution: {integrity: sha512-gEpRTalKdosp4Bb8qWtc2iOgE5SeIHlpS1up9bFq2wAyYhl1UdTObYiHe98zEM9SQvSoqQZ1IQD0JNpg3Ml5pg==}
    engines: {node: '>= 12.0.0'}
    cpu: [arm64]
    os: [android]

  lightningcss-darwin-arm64@1.33.0:
    resolution: {integrity: sha512-Sciaz8eenNTKn9b3t7+xr0ipTp9YxKQY4npwQ3mrRuL0BAVHBLyZxofhaKBAVtzmtRZ/zTyo0/to4B1uWG/Djg==}
    engines: {node: '>= 12.0.0'}
    cpu: [arm64]
    os: [darwin]

  lightningcss-darwin-x64@1.33.0:
    resolution: {integrity: sha512-Z5UPAxzrjlWNNyGy6i65cJzzvgJ5D3T6wMvs+gWpY9d7qRhANrxqAp6LhxIgZhWEw18RfJTGcRxjuLIBr+m8XQ==}
    engines: {node: '>= 12.0.0'}
    cpu: [x64]
    os: [darwin]

  lightningcss-freebsd-x64@1.33.0:
    resolution: {integrity: sha512-QQM/Ti/hQajJwCY+RiWuCZ9sdtI/XQk7nDK5vC8kkdwixezOlDgvDx7+RT+QjK6FcFT4MpsuoBnHIo/O3StRRg==}
    engines: {node: '>= 12.0.0'}
    cpu: [x64]
    os: [freebsd]

  lightningcss-linux-arm-gnueabihf@1.33.0:
    resolution: {integrity: sha512-N7FVBe6iS24MlM6R/4RBTxGhQheZGs7tiQ9U32UtF75NzP5Q7xWPRqLBCKxlRQRk3rY1jCIPLzx7WzOhuUIRLQ==}
    engines: {node: '>= 12.0.0'}
    cpu: [arm]
    os: [linux]

  lightningcss-linux-arm64-gnu@1.33.0:
    resolution: {integrity: sha512-j2v/itmy4HlNxlc6voKXYgBqNi0Ng2LShg4z7GufpEgs05P+2suBVyi9I6YHq5uoVFx9ETin3eCEhLVyXGQnKg==}
    engines: {node: '>= 12.0.0'}
    cpu: [arm64]
    os: [linux]
    libc: [glibc]

  lightningcss-linux-arm64-musl@1.33.0:
    resolution: {integrity: sha512-yiO5ROMuYQgXbC60yjZU5CYSFZGKXL0HFATXt9mHJn1+zW55oCtMI9NfcVhYLMFDL7gV7oBPon/EmMMGg2OvtQ==}
    engines: {node: '>= 12.0.0'}
    cpu: [arm64]
    os: [linux]
    libc: [musl]

  lightningcss-linux-x64-gnu@1.33.0:
    resolution: {integrity: sha512-ar+Ju7LmcN0Jo4FpL4hpFybwNG9/3A/Br5KW2n2jyODg3MEZXaDYADdemoNS+BDNfMgKvylJLj4S5tyRActuAg==}
    engines: {node: '>= 12.0.0'}
    cpu: [x64]
    os: [linux]
    libc: [glibc]

  lightningcss-linux-x64-musl@1.33.0:
    resolution: {integrity: sha512-RYiYbkokw0trfKqqzfF55lginwEPrD3OJDfTuJzFs1MK6iFnDenaz1fqLLtX4ITG3OktJQXOeTaw1awrBAlZPw==}
    engines: {node: '>= 12.0.0'}
    cpu: [x64]
    os: [linux]
    libc: [musl]

  lightningcss-win32-arm64-msvc@1.33.0:
    resolution: {integrity: sha512-1K+MPfLSFVpphzpdbfkhlWk6wBrTObBzS2T6db10PNOZgR9GoVsAWzwNyuhUYYbTp23j+4RrncfujZ4uAzXvwA==}
    engines: {node: '>= 12.0.0'}
    cpu: [arm64]
    os: [win32]

  lightningcss-win32-x64-msvc@1.33.0:
    resolution: {integrity: sha512-OlEICDx/Xl0FqSp4bry8zFnCvGpig3Gl4gCquvYwHuqJKEC1+n9NgDniFvqHGmMv1ZkqDJrDqKKSykTDX+ehuA==}
    engines: {node: '>= 12.0.0'}
    cpu: [x64]
    os: [win32]

  lightningcss@1.33.0:
    resolution: {integrity: sha512-WkUDrojuJs0xkgGf2udWxa3yGBRxPtxUkB79i6aCZLRgc7PM8fZe9TosfPDcvEpQZbuFASnHYmRLBLUbmLOIIA==}
    engines: {node: '>= 12.0.0'}

  magic-string@0.30.21:
    resolution: {integrity: sha512-vd2F4YUyEXKGcLHoq+TEyCjxueSeHnFxyyjNp80yg0XV4vUhnDer/lvvlqM/arB5bXQN5K2/3oinyCRyx8T2CQ==}

  math-intrinsics@1.1.0:
    resolution: {integrity: sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==}
    engines: {node: '>= 0.4'}

  media-typer@1.1.1:
    resolution: {integrity: sha512-yz3xRaG20c6/BOzvYoDaGtPmGscs7YivItZEEqe6GbwNfHuxu9YNmvnEkMzKldAGY4/80pRcQRZSEnhquk9XuQ==}
    engines: {node: '>= 0.8'}

  merge-descriptors@2.0.0:
    resolution: {integrity: sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==}
    engines: {node: '>=18'}

  mime-db@1.52.0:
    resolution: {integrity: sha512-sPU4uV7dYlvtWJxwwxHD0PuihVNiE7TyAbQ5SWxDCB9mUYvOgroQOwYQQOKPJ8CIbE+1ETVlOoK1UC2nU3gYvg==}
    engines: {node: '>= 0.6'}

  mime-db@1.54.0:
    resolution: {integrity: sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==}
    engines: {node: '>= 0.6'}

  mime-types@2.1.35:
    resolution: {integrity: sha512-ZDY+bPm5zTTF+YpCrAU9nK0UgICYPT0QtT1NZWFv4s++TNkcgVaT0g6+4R2uI4MjQjzysHB1zxuWL50hzaeXiw==}
    engines: {node: '>= 0.6'}

  mime-types@3.0.2:
    resolution: {integrity: sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==}
    engines: {node: '>=18'}

  ms@2.1.3:
    resolution: {integrity: sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==}

  nanoid@3.3.20:
    resolution: {integrity: sha512-uKdg2G3GNCKQn9byYOpxbGqrT2fGO5KRt5J/8b3pok8rT6qxGWF6hxMyJiEYtAf+FVyYuD9hRaDqX5uPFYJ4ZQ==}
    engines: {node: ^10 || ^12 || ^13.7 || ^14 || >=15.0.1}
    hasBin: true

  negotiator@1.1.0:
    resolution: {integrity: sha512-NMPBRMJgiQHjbd8phG3Vebdx4kZ1H121rbl5IkMqeOsahptB9BKo/d7oJ3zTXqTgagn2bWlNSXkh0QUGM31RYg==}
    engines: {node: '>=18'}

  object-inspect@1.13.4:
    resolution: {integrity: sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==}
    engines: {node: '>= 0.4'}

  on-finished@2.4.2:
    resolution: {integrity: sha512-ATWUv387i+nLD49EiDoOft5scf32Vsdz3ktrQJG9bi7jRFmaXTssvyvj1EmeKVVgvesbqUtvQQvaS2TpTukAZQ==}
    engines: {node: '>= 0.8'}

  once@1.4.0:
    resolution: {integrity: sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==}

  parseurl@1.3.3:
    resolution: {integrity: sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==}
    engines: {node: '>= 0.8'}

  path-to-regexp@8.4.2:
    resolution: {integrity: sha512-qRcuIdP69NPm4qbACK+aDogI5CBDMi1jKe0ry5rSQJz8JVLsC7jV8XpiJjGRLLol3N+R5ihGYcrPLTno6pAdBA==}

  picocolors@1.1.1:
    resolution: {integrity: sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==}

  picomatch@4.0.7:
    resolution: {integrity: sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==}
    engines: {node: '>=12'}

  postcss@8.5.31:
    resolution: {integrity: sha512-YUbWYCgErwnMAVkjUnYa+KlMBzGpHwiIt/DE7f0G33AuX2LH9UcTk6KgWxd3zRU+pN3u/C+Xl3EnMLM4Hea7Sg==}
    engines: {node: ^10 || ^12 || >=14}

  proxy-addr@2.0.8:
    resolution: {integrity: sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==}
    engines: {node: '>= 0.10'}

  proxy-from-env@2.1.0:
    resolution: {integrity: sha512-cJ+oHTW1VAEa8cJslgmUZrc+sjRKgAKl3Zyse6+PV38hZe/V6Z14TbCuXcan9F9ghlz4QrFr2c92TNF82UkYHA==}
    engines: {node: '>=10'}

  qs@6.16.1:
    resolution: {integrity: sha512-5Px6J7rfHBAGUhNQ3es4YzcOdBBw0SDcVtThJml4RdnKw4tKs2epA0kPZ+K8X+WiHktT93RHVcQ/3ym5aTCgtg==}
    engines: {node: '>=0.6'}

  range-parser@1.3.0:
    resolution: {integrity: sha512-hek2mFQpPuI4E1BBKrSto+BU3e3x4xuarsbiwr3+lf7p44juvFMV0XFWQAP3xUyqXA4RrXLIoaSUGbSt056ZMw==}
    engines: {node: '>= 0.6'}

  raw-body@3.0.2:
    resolution: {integrity: sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==}
    engines: {node: '>= 0.10'}

  rolldown@1.2.15:
    resolution: {integrity: sha512-6odND+fel5zVw3I4Yc2e69gvguDnX0CAAGiNDZSq4ik5WUcaLrkD2GLuog0XcODbor31hZ5ayEMgVDno+KPV5g==}
    engines: {node: ^20.19.0 || >=22.12.0}
    hasBin: true

  router@2.2.0:
    resolution: {integrity: sha512-nLTrUKm2UyiL7rlhapu/Zl45FwNgkZGaCpZbIHajDYgwlJCOzLSk+cIPAnsEqV955GjILJnKbdQC1nVPz+gAYQ==}
    engines: {node: '>= 18'}

  rxjs@7.8.2:
    resolution: {integrity: sha512-dhKf903U/PQZY6boNNtAGdWbG85WAbjT/1xYoZIC7FAY0yWapOBQVsVrDl58W86//e1VpMNBtRV4MaXfdMySFA==}

  safer-buffer@2.1.2:
    resolution: {integrity: sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==}

  send@1.2.1:
    resolution: {integrity: sha512-1gnZf7DFcoIcajTjTwjwuDjzuz4PPcY2StKPlsGAQ1+YH20IRVrBaXSWmdjowTJ6u8Rc01PoYOGHXfP1mYcZNQ==}
    engines: {node: '>= 18'}

  serve-static@2.2.1:
    resolution: {integrity: sha512-xRXBn0pPqQTVQiC8wyQrKs2MOlX24zQ0POGaj0kultvoOCstBQM5yvOhAVSUwOMjQtTvsPWoNCHfPGwaaQJhTw==}
    engines: {node: '>= 18'}

  setprototypeof@1.2.0:
    resolution: {integrity: sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==}

  shell-quote@1.12.0:
    resolution: {integrity: sha512-PcByqNyT/38F2kDNi006HAMRJaULuBzq/FOsw3qdZvX/GA9W/jamDaRskgHjubHiftXK5sIFxLNkvrXUwcof6Q==}
    engines: {node: '>= 0.4'}

  side-channel-list@1.0.1:
    resolution: {integrity: sha512-mjn/0bi/oUURjc5Xl7IaWi/OJJJumuoJFQJfDDyO46+hBWsfaVM65TBHq2eoZBhzl9EchxOijpkbRC8SVBQU0w==}
    engines: {node: '>= 0.4'}

  side-channel-map@1.0.1:
    resolution: {integrity: sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==}
    engines: {node: '>= 0.4'}

  side-channel-weakmap@1.0.2:
    resolution: {integrity: sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==}
    engines: {node: '>= 0.4'}

  side-channel@1.1.1:
    resolution: {integrity: sha512-6x6dK6zJdpTzF4sQeNYxwtvBzf6Eg4GtlesS94HOvTudUeyK2WXAaIfmDgsyslYrRBeFIlsi54AYsFGUuhmvrQ==}
    engines: {node: '>= 0.4'}

  source-map-js@1.2.2:
    resolution: {integrity: sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==}
    engines: {node: '>=0.10.0'}

  statuses@2.0.2:
    resolution: {integrity: sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==}
    engines: {node: '>= 0.8'}

  string-width@7.2.0:
    resolution: {integrity: sha512-tsaTIkKW9b4N+AEj+SVA+WhJzV7/zMhcSu78mLKWSk7cXMOSHsBKFWUs0fWwq8QyK3MgJBQRX6Gbi4kYbdvGkQ==}
    engines: {node: '>=18'}

  strip-ansi@7.2.0:
    resolution: {integrity: sha512-yDPMNjp4WyfYBkHnjIRLfca1i6KMyGCtsVgoKe/z1+6vukgaENdgGBZt+ZmKPc4gavvEZ5OgHfHdrazhgNyG7w==}
    engines: {node: '>=12'}

  supports-color@10.2.2:
    resolution: {integrity: sha512-SS+jx45GF1QjgEXQx4NJZV9ImqmO2NPz5FNsIHrsDjh2YsHnawpan7SNQ1o8NuhrbHZy9AZhIoCUiCeaW/C80g==}
    engines: {node: '>=18'}

  tinyglobby@0.2.17:
    resolution: {integrity: sha512-wXR/dYpcqKmfWpEdZjiKJOwCNFndD0DMnrW/cYjVGttEkBfVgcLFHoNrlj47mjOVic9yyNu65alsgF4NQyTa2g==}
    engines: {node: '>=12.0.0'}

  toidentifier@1.0.1:
    resolution: {integrity: sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==}
    engines: {node: '>=0.6'}

  tree-kill@1.2.2:
    resolution: {integrity: sha512-L0Orpi8qGpRG//Nd+H90vFB+3iHnue1zSSGmNOOCh1GLJ7rUKVwV2HvijphGQS2UmhUZewS9VgvxYIdgr+fG1A==}
    hasBin: true

  tslib@2.8.1:
    resolution: {integrity: sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==}

  type-is@2.1.0:
    resolution: {integrity: sha512-faYHw0anBbc/kWF3zFTEnxSFOAGUX9GFbOBthvDdLsIlEoWOFOtS0zgCiQYwIskL9iGXZL3kAXD8OoZ4GmMATA==}
    engines: {node: '>= 18'}

  unpipe@1.0.0:
    resolution: {integrity: sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==}
    engines: {node: '>= 0.8'}

  vary@1.1.2:
    resolution: {integrity: sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==}
    engines: {node: '>= 0.8'}

  vite@8.3.5:
    resolution: {integrity: sha512-z1YpjieJ9g0ebTmQpLBv/oq9E3F9EIlOe+7LahW8SrE3LTiG3udBRUXQOlYXP9b+IC2q2phHeVxj9xGlw34OEQ==}
    engines: {node: ^20.19.0 || >=22.12.0}
    hasBin: true
    peerDependencies:
      '@types/node': ^20.19.0 || >=22.12.0
      '@vitejs/devtools': ^0.7.1 || ^0.8.0
      esbuild: ^0.27.0 || ^0.28.0
      jiti: '>=1.21.0'
      less: ^4.0.0
      sass: ^1.70.0
      sass-embedded: ^1.70.0
      stylus: '>=0.54.8'
      sugarss: ^5.0.0
      terser: ^5.16.0
      tsx: ^4.8.1
      yaml: ^2.4.2
    peerDependenciesMeta:
      '@types/node':
        optional: true
      '@vitejs/devtools':
        optional: true
      esbuild:
        optional: true
      jiti:
        optional: true
      less:
        optional: true
      sass:
        optional: true
      sass-embedded:
        optional: true
      stylus:
        optional: true
      sugarss:
        optional: true
      terser:
        optional: true
      tsx:
        optional: true
      yaml:
        optional: true

  vue@3.5.44:
    resolution: {integrity: sha512-dvvmaOCG7lAMkJTPqPwWeGMsPS6DIsFsfZDUgBp9V6mHf9b3+/wyVwYR4Es+WV6uJC0FKRxp81Obcq0ZwUcGFQ==}
    peerDependencies:
      typescript: '*'
    peerDependenciesMeta:
      typescript:
        optional: true

  wrap-ansi@9.0.2:
    resolution: {integrity: sha512-42AtmgqjV+X1VpdOfyTGOYRi0/zsoLqtXQckTmqTeybT+BDIbM/Guxo7x3pE2vtpr1ok6xRqM9OpBe+Jyoqyww==}
    engines: {node: '>=18'}

  wrappy@1.0.2:
    resolution: {integrity: sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==}

  y18n@5.0.8:
    resolution: {integrity: sha512-0pfFzegeDWJHJIAmTLRP2DwHjdF5s7jo9tuztdQxAhINCdvS+3nGINqPd00AphqJR/0LhANUS6/+7SCb98YOfA==}
    engines: {node: '>=10'}

  yargs-parser@22.0.0:
    resolution: {integrity: sha512-rwu/ClNdSMpkSrUb+d6BRsSkLUq1fmfsY6TOpYzTwvwkg1/NRG85KBy3kq++A8LKQwX6lsu+aWad+2khvuXrqw==}
    engines: {node: ^20.19.0 || ^22.12.0 || >=23}

  yargs@18.0.0:
    resolution: {integrity: sha512-4UEqdc2RYGHZc7Doyqkrqiln3p9X2DZVxaGbwhn2pi7MrRagKaOcIKe8L3OxYcbhXLgLFUS3zAYuQjKBQgmuNg==}
    engines: {node: ^20.19.0 || ^22.12.0 || >=23}

snapshots:

  '@babel/helper-string-parser@7.29.11': {}

  '@babel/helper-validator-identifier@7.29.7': {}

  '@babel/parser@7.29.11':
    dependencies:
      '@babel/types': 7.29.11

  '@babel/types@7.29.11':
    dependencies:
      '@babel/helper-string-parser': 7.29.11
      '@babel/helper-validator-identifier': 7.29.7

  '@emnapi/core@2.0.0-alpha.5':
    dependencies:
      '@emnapi/wasi-threads': 2.1.0
      tslib: 2.8.1

  '@emnapi/runtime@2.0.0-alpha.5':
    dependencies:
      tslib: 2.8.1

  '@emnapi/wasi-threads@2.1.0':
    dependencies:
      tslib: 2.8.1

  '@jridgewell/sourcemap-codec@1.6.0': {}

  '@napi-rs/wasm-runtime@1.2.5(@emnapi/core@2.0.0-alpha.5)(@emnapi/runtime@2.0.0-alpha.5)':
    dependencies:
      '@emnapi/core': 2.0.0-alpha.5
      '@emnapi/runtime': 2.0.0-alpha.5
      '@tybys/wasm-util': 0.10.4

  '@oxc-project/types@0.155.0': {}

  '@rolldown/binding-android-arm-eabi@1.2.15':
    optional: true

  '@rolldown/binding-android-arm64@1.2.15':
    optional: true

  '@rolldown/binding-darwin-arm64@1.2.15':
    optional: true

  '@rolldown/binding-darwin-x64@1.2.15':
    optional: true

  '@rolldown/binding-freebsd-x64@1.2.15':
    optional: true

  '@rolldown/binding-linux-arm-gnueabihf@1.2.15':
    optional: true

  '@rolldown/binding-linux-arm64-gnu@1.2.15':
    optional: true

  '@rolldown/binding-linux-arm64-musl@1.2.15':
    optional: true

  '@rolldown/binding-linux-ppc64-gnu@1.2.15':
    optional: true

  '@rolldown/binding-linux-s390x-gnu@1.2.15':
    optional: true

  '@rolldown/binding-linux-x64-gnu@1.2.15':
    optional: true

  '@rolldown/binding-linux-x64-musl@1.2.15':
    optional: true

  '@rolldown/binding-openharmony-arm64@1.2.15':
    optional: true

  '@rolldown/binding-wasm32-wasi@1.2.15':
    dependencies:
      '@emnapi/core': 2.0.0-alpha.5
      '@emnapi/runtime': 2.0.0-alpha.5
      '@napi-rs/wasm-runtime': 1.2.5(@emnapi/core@2.0.0-alpha.5)(@emnapi/runtime@2.0.0-alpha.5)

  '@rolldown/binding-win32-arm64-msvc@1.2.15':
    optional: true

  '@rolldown/binding-win32-x64-msvc@1.2.15':
    optional: true

  '@rolldown/pluginutils@1.0.1': {}

  '@tybys/wasm-util@0.10.4':
    dependencies:
      tslib: 2.8.1

  '@vitejs/plugin-vue@6.0.10(vite@8.3.5)(vue@3.5.44)':
    dependencies:
      '@rolldown/pluginutils': 1.0.1
      vite: 8.3.5
      vue: 3.5.44

  '@vue/compiler-core@3.5.44':
    dependencies:
      '@babel/parser': 7.29.11
      '@vue/shared': 3.5.44
      entities: 7.0.1
      estree-walker: 2.0.2
      source-map-js: 1.2.2

  '@vue/compiler-dom@3.5.44':
    dependencies:
      '@vue/compiler-core': 3.5.44
      '@vue/shared': 3.5.44

  '@vue/compiler-sfc@3.5.44':
    dependencies:
      '@babel/parser': 7.29.11
      '@vue/compiler-core': 3.5.44
      '@vue/compiler-dom': 3.5.44
      '@vue/compiler-ssr': 3.5.44
      '@vue/shared': 3.5.44
      estree-walker: 2.0.2
      magic-string: 0.30.21
      postcss: 8.5.31
      source-map-js: 1.2.2

  '@vue/compiler-ssr@3.5.44':
    dependencies:
      '@vue/compiler-dom': 3.5.44
      '@vue/shared': 3.5.44

  '@vue/reactivity@3.5.44':
    dependencies:
      '@vue/shared': 3.5.44

  '@vue/runtime-core@3.5.44':
    dependencies:
      '@vue/reactivity': 3.5.44
      '@vue/shared': 3.5.44

  '@vue/runtime-dom@3.5.44':
    dependencies:
      '@vue/reactivity': 3.5.44
      '@vue/runtime-core': 3.5.44
      '@vue/shared': 3.5.44
      csstype: 3.2.3

  '@vue/server-renderer@3.5.44':
    dependencies:
      '@vue/compiler-ssr': 3.5.44
      '@vue/runtime-dom': 3.5.44
      '@vue/shared': 3.5.44

  '@vue/shared@3.5.44': {}

  accepts@2.0.0:
    dependencies:
      mime-types: 3.0.2
      negotiator: 1.1.0

  agent-base@6.0.2(supports-color@10.2.2):
    dependencies:
      debug: 4.4.3(supports-color@10.2.2)
    transitivePeerDependencies:
      - supports-color

  ansi-regex@6.4.0: {}

  ansi-styles@6.2.3: {}

  asynckit@0.4.0: {}

  axios@1.20.0(debug@4.4.3(supports-color@10.2.2))(supports-color@10.2.2):
    dependencies:
      follow-redirects: 1.16.1(debug@4.4.3(supports-color@10.2.2))
      form-data: 4.0.6
      https-proxy-agent: 5.0.1(supports-color@10.2.2)
      proxy-from-env: 2.1.0
    transitivePeerDependencies:
      - debug
      - supports-color

  body-parser@2.4.0(supports-color@10.2.2):
    dependencies:
      bytes: 3.1.2
      content-type: 2.1.0
      debug: 4.4.3(supports-color@10.2.2)
      http-errors: 2.0.1
      iconv-lite: 0.7.3
      on-finished: 2.4.2
      qs: 6.16.1
      raw-body: 3.0.2
      type-is: 2.1.0
    transitivePeerDependencies:
      - supports-color

  bytes@3.1.2: {}

  call-bind-apply-helpers@1.0.2:
    dependencies:
      es-errors: 1.3.0
      function-bind: 1.1.2

  call-bound@1.0.4:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      get-intrinsic: 1.3.0

  chalk@5.6.2: {}

  cliui@9.0.1:
    dependencies:
      string-width: 7.2.0
      strip-ansi: 7.2.0
      wrap-ansi: 9.0.2

  combined-stream@1.0.8:
    dependencies:
      delayed-stream: 1.0.0

  concurrently@10.0.6:
    dependencies:
      chalk: 5.6.2
      rxjs: 7.8.2
      shell-quote: 1.12.0
      supports-color: 10.2.2
      tree-kill: 1.2.2
      yargs: 18.0.0

  content-disposition@2.0.1: {}

  content-type@2.1.0: {}

  cookie-signature@1.2.2: {}

  cookie@0.7.2: {}

  csstype@3.2.3: {}

  debug@4.4.3(supports-color@10.2.2):
    dependencies:
      ms: 2.1.3
    optionalDependencies:
      supports-color: 10.2.2

  delayed-stream@1.0.0: {}

  depd@2.0.0: {}

  detect-libc@2.1.2: {}

  dunder-proto@1.0.1:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-errors: 1.3.0
      gopd: 1.2.0

  ee-first@1.1.1: {}

  emoji-regex@10.6.0: {}

  encodeurl@2.0.0: {}

  entities@7.0.1: {}

  es-define-property@1.0.1: {}

  es-errors@1.3.0: {}

  es-object-atoms@1.1.2:
    dependencies:
      es-errors: 1.3.0

  es-set-tostringtag@2.1.0:
    dependencies:
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      has-tostringtag: 1.0.2
      hasown: 2.0.4

  escalade@3.2.0: {}

  escape-html@1.0.3: {}

  estree-walker@2.0.2: {}

  etag@1.8.1: {}

  express@5.3.0(supports-color@10.2.2):
    dependencies:
      accepts: 2.0.0
      body-parser: 2.4.0(supports-color@10.2.2)
      content-disposition: 2.0.1
      content-type: 2.1.0
      cookie: 0.7.2
      cookie-signature: 1.2.2
      debug: 4.4.3(supports-color@10.2.2)
      depd: 2.0.0
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      finalhandler: 2.1.1(supports-color@10.2.2)
      fresh: 2.0.0
      http-errors: 2.0.1
      merge-descriptors: 2.0.0
      mime-types: 3.0.2
      on-finished: 2.4.2
      once: 1.4.0
      parseurl: 1.3.3
      proxy-addr: 2.0.8
      qs: 6.16.1
      range-parser: 1.3.0
      router: 2.2.0(supports-color@10.2.2)
      send: 1.2.1(supports-color@10.2.2)
      serve-static: 2.2.1(supports-color@10.2.2)
      statuses: 2.0.2
      type-is: 2.1.0
      vary: 1.1.2
    transitivePeerDependencies:
      - supports-color

  fdir@6.5.0(picomatch@4.0.7):
    optionalDependencies:
      picomatch: 4.0.7

  finalhandler@2.1.1(supports-color@10.2.2):
    dependencies:
      debug: 4.4.3(supports-color@10.2.2)
      encodeurl: 2.0.0
      escape-html: 1.0.3
      on-finished: 2.4.2
      parseurl: 1.3.3
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  follow-redirects@1.16.1(debug@4.4.3(supports-color@10.2.2)):
    optionalDependencies:
      debug: 4.4.3(supports-color@10.2.2)

  form-data@4.0.6:
    dependencies:
      asynckit: 0.4.0
      combined-stream: 1.0.8
      es-set-tostringtag: 2.1.0
      hasown: 2.0.4
      mime-types: 2.1.35

  forwarded@0.2.0: {}

  fresh@2.0.0: {}

  fsevents@2.3.3:
    optional: true

  function-bind@1.1.2: {}

  get-caller-file@2.0.5: {}

  get-east-asian-width@1.7.0: {}

  get-intrinsic@1.3.0:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-define-property: 1.0.1
      es-errors: 1.3.0
      es-object-atoms: 1.1.2
      function-bind: 1.1.2
      get-proto: 1.0.1
      gopd: 1.2.0
      has-symbols: 1.1.0
      hasown: 2.0.4
      math-intrinsics: 1.1.0

  get-proto@1.0.1:
    dependencies:
      dunder-proto: 1.0.1
      es-object-atoms: 1.1.2

  gopd@1.2.0: {}

  has-symbols@1.1.0: {}

  has-tostringtag@1.0.2:
    dependencies:
      has-symbols: 1.1.0

  hasown@2.0.4:
    dependencies:
      function-bind: 1.1.2

  http-errors@2.0.1:
    dependencies:
      depd: 2.0.0
      inherits: 2.0.4
      setprototypeof: 1.2.0
      statuses: 2.0.2
      toidentifier: 1.0.1

  https-proxy-agent@5.0.1(supports-color@10.2.2):
    dependencies:
      agent-base: 6.0.2(supports-color@10.2.2)
      debug: 4.4.3(supports-color@10.2.2)
    transitivePeerDependencies:
      - supports-color

  iconv-lite@0.7.3:
    dependencies:
      safer-buffer: 2.1.2

  inherits@2.0.4: {}

  ipaddr.js@1.9.1: {}

  is-promise@4.0.0: {}

  lightningcss-android-arm64@1.33.0:
    optional: true

  lightningcss-darwin-arm64@1.33.0:
    optional: true

  lightningcss-darwin-x64@1.33.0:
    optional: true

  lightningcss-freebsd-x64@1.33.0:
    optional: true

  lightningcss-linux-arm-gnueabihf@1.33.0:
    optional: true

  lightningcss-linux-arm64-gnu@1.33.0:
    optional: true

  lightningcss-linux-arm64-musl@1.33.0:
    optional: true

  lightningcss-linux-x64-gnu@1.33.0:
    optional: true

  lightningcss-linux-x64-musl@1.33.0:
    optional: true

  lightningcss-win32-arm64-msvc@1.33.0:
    optional: true

  lightningcss-win32-x64-msvc@1.33.0:
    optional: true

  lightningcss@1.33.0:
    dependencies:
      detect-libc: 2.1.2
    optionalDependencies:
      lightningcss-android-arm64: 1.33.0
      lightningcss-darwin-arm64: 1.33.0
      lightningcss-darwin-x64: 1.33.0
      lightningcss-freebsd-x64: 1.33.0
      lightningcss-linux-arm-gnueabihf: 1.33.0
      lightningcss-linux-arm64-gnu: 1.33.0
      lightningcss-linux-arm64-musl: 1.33.0
      lightningcss-linux-x64-gnu: 1.33.0
      lightningcss-linux-x64-musl: 1.33.0
      lightningcss-win32-arm64-msvc: 1.33.0
      lightningcss-win32-x64-msvc: 1.33.0

  magic-string@0.30.21:
    dependencies:
      '@jridgewell/sourcemap-codec': 1.6.0

  math-intrinsics@1.1.0: {}

  media-typer@1.1.1: {}

  merge-descriptors@2.0.0: {}

  mime-db@1.52.0: {}

  mime-db@1.54.0: {}

  mime-types@2.1.35:
    dependencies:
      mime-db: 1.52.0

  mime-types@3.0.2:
    dependencies:
      mime-db: 1.54.0

  ms@2.1.3: {}

  nanoid@3.3.20: {}

  negotiator@1.1.0:
    dependencies:
      content-type: 2.1.0

  object-inspect@1.13.4: {}

  on-finished@2.4.2:
    dependencies:
      ee-first: 1.1.1

  once@1.4.0:
    dependencies:
      wrappy: 1.0.2

  parseurl@1.3.3: {}

  path-to-regexp@8.4.2: {}

  picocolors@1.1.1: {}

  picomatch@4.0.7: {}

  postcss@8.5.31:
    dependencies:
      nanoid: 3.3.20
      picocolors: 1.1.1
      source-map-js: 1.2.2

  proxy-addr@2.0.8:
    dependencies:
      forwarded: 0.2.0
      ipaddr.js: 1.9.1

  proxy-from-env@2.1.0: {}

  qs@6.16.1:
    dependencies:
      es-define-property: 1.0.1
      side-channel: 1.1.1

  range-parser@1.3.0: {}

  raw-body@3.0.2:
    dependencies:
      bytes: 3.1.2
      http-errors: 2.0.1
      iconv-lite: 0.7.3
      unpipe: 1.0.0

  rolldown@1.2.15:
    dependencies:
      '@oxc-project/types': 0.155.0
      '@rolldown/pluginutils': 1.0.1
    optionalDependencies:
      '@rolldown/binding-android-arm-eabi': 1.2.15
      '@rolldown/binding-android-arm64': 1.2.15
      '@rolldown/binding-darwin-arm64': 1.2.15
      '@rolldown/binding-darwin-x64': 1.2.15
      '@rolldown/binding-freebsd-x64': 1.2.15
      '@rolldown/binding-linux-arm-gnueabihf': 1.2.15
      '@rolldown/binding-linux-arm64-gnu': 1.2.15
      '@rolldown/binding-linux-arm64-musl': 1.2.15
      '@rolldown/binding-linux-ppc64-gnu': 1.2.15
      '@rolldown/binding-linux-s390x-gnu': 1.2.15
      '@rolldown/binding-linux-x64-gnu': 1.2.15
      '@rolldown/binding-linux-x64-musl': 1.2.15
      '@rolldown/binding-openharmony-arm64': 1.2.15
      '@rolldown/binding-win32-arm64-msvc': 1.2.15
      '@rolldown/binding-win32-x64-msvc': 1.2.15

  router@2.2.0(supports-color@10.2.2):
    dependencies:
      debug: 4.4.3(supports-color@10.2.2)
      depd: 2.0.0
      is-promise: 4.0.0
      parseurl: 1.3.3
      path-to-regexp: 8.4.2
    transitivePeerDependencies:
      - supports-color

  rxjs@7.8.2:
    dependencies:
      tslib: 2.8.1

  safer-buffer@2.1.2: {}

  send@1.2.1(supports-color@10.2.2):
    dependencies:
      debug: 4.4.3(supports-color@10.2.2)
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      fresh: 2.0.0
      http-errors: 2.0.1
      mime-types: 3.0.2
      ms: 2.1.3
      on-finished: 2.4.2
      range-parser: 1.3.0
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  serve-static@2.2.1(supports-color@10.2.2):
    dependencies:
      encodeurl: 2.0.0
      escape-html: 1.0.3
      parseurl: 1.3.3
      send: 1.2.1(supports-color@10.2.2)
    transitivePeerDependencies:
      - supports-color

  setprototypeof@1.2.0: {}

  shell-quote@1.12.0: {}

  side-channel-list@1.0.1:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4

  side-channel-map@1.0.1:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4

  side-channel-weakmap@1.0.2:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4
      side-channel-map: 1.0.1

  side-channel@1.1.1:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4
      side-channel-list: 1.0.1
      side-channel-map: 1.0.1
      side-channel-weakmap: 1.0.2

  source-map-js@1.2.2: {}

  statuses@2.0.2: {}

  string-width@7.2.0:
    dependencies:
      emoji-regex: 10.6.0
      get-east-asian-width: 1.7.0
      strip-ansi: 7.2.0

  strip-ansi@7.2.0:
    dependencies:
      ansi-regex: 6.4.0

  supports-color@10.2.2: {}

  tinyglobby@0.2.17:
    dependencies:
      fdir: 6.5.0(picomatch@4.0.7)
      picomatch: 4.0.7

  toidentifier@1.0.1: {}

  tree-kill@1.2.2: {}

  tslib@2.8.1: {}

  type-is@2.1.0:
    dependencies:
      content-type: 2.1.0
      media-typer: 1.1.1
      mime-types: 3.0.2

  unpipe@1.0.0: {}

  vary@1.1.2: {}

  vite@8.3.5:
    dependencies:
      lightningcss: 1.33.0
      picomatch: 4.0.7
      postcss: 8.5.31
      rolldown: 1.2.15
      tinyglobby: 0.2.17
    optionalDependencies:
      fsevents: 2.3.3

  vue@3.5.44:
    dependencies:
      '@vue/compiler-dom': 3.5.44
      '@vue/compiler-sfc': 3.5.44
      '@vue/runtime-dom': 3.5.44
      '@vue/server-renderer': 3.5.44
      '@vue/shared': 3.5.44

  wrap-ansi@9.0.2:
    dependencies:
      ansi-styles: 6.2.3
      string-width: 7.2.0
      strip-ansi: 7.2.0

  wrappy@1.0.2: {}

  y18n@5.0.8: {}

  yargs-parser@22.0.0: {}

  yargs@18.0.0:
    dependencies:
      cliui: 9.0.1
      escalade: 3.2.0
      get-caller-file: 2.0.5
      string-width: 7.2.0
      y18n: 5.0.8
      yargs-parser: 22.0.0
`,
    },
    {
      path: 'vite.config.js',
      language: 'js',
      content: `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// CodeAlong: prints errors from your running app in the terminal, so your workspace can see them.
// src/ca-probe.js sends them here. You don't need to edit this.
function caErrors() {
  return {
    name: 'ca-errors',
    configureServer(server) {
      // server.hot is Vite's connection to every open copy of your app
      server.hot.on('ca:error', (raw) => {
        // one line of JSON, so CodeAlong can read it back
        console.log('ca-error ' + JSON.stringify(raw))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), caErrors()],
  server: {
    // Send every /api request to the Express server in server/api.js
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
`,
    },
    {
      path: 'README.md',
      language: 'md',
      content: `# Mini Cart

You're building a small grocery shop in Vue: pick a category, add items to a cart,
see the total, and check out. Along the way you'll use props and emits to pass data
between components, axios to call a real Express API, a computed property for the
total, and localStorage so the cart survives a refresh. Follow the numbered \`TODO\`
comments in order, starting in \`src/App.vue\`.
`,
    },
    {
      path: 'src/main.js',
      language: 'js',
      content: `// Reports errors and console output to your CodeAlong workspace. Keep this import first.
import './ca-probe.js'

import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
`,
    },
    {
      path: 'src/ca-probe.js',
      language: 'js',
      content: `// CodeAlong runtime probe: reports errors in your app to your CodeAlong workspace.
// You don't need to edit this file.
//
// Each error goes to the Vite dev server, which prints it in the terminal for CodeAlong to read
// (the ca-errors plugin in vite.config.js). Works in the preview and when it's popped out.

// sends one error to the Vite dev server over its hot-reload connection.
// import.meta.hot only exists while running under pnpm dev, so ?. skips it otherwise
function sendError(raw) {
  import.meta.hot?.send('ca:error', raw)
}

// errors thrown while the app runs, e.g. TypeError, ReferenceError
window.addEventListener('error', (event) => {
  sendError({
    name: event.error?.name,
    // event.message on its own starts with "Uncaught ", the error object's message doesn't
    message: event.error?.message ?? event.message,
    filename: event.filename,
    lineno: event.lineno,
  })
})

// promises nobody caught, e.g. a failed await axios.get(...)
window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason
  // the browser doesn't say where a promise failed, so filename and lineno stay null
  sendError({ name: err?.name, message: err?.message ?? String(err), filename: null, lineno: null })
})
`,
    },
    {
      path: 'src/App.vue',
      language: 'vue',
      content: `<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const categories = ref([])
const selectedCategory = ref('')
const items = ref([])
const cart = ref([])
const receipt = ref(null)

// TODO 1: Create the Vue app with a list of categories
// Load them from GET /api/categories when the page opens, then select the first one.
onMounted(async () => {
})

// TODO 2: Fetch items for the selected category with axios
// Call GET /api/items with the selected category as a query parameter.
async function loadItems() {
}

// TODO 5: Add the item to the cart in the parent (increase quantity if it's already there)
function addToCart(item) {
}

// TODO 6: Show the cart total with a computed property

// TODO 7: Save the cart to localStorage and load it on start

// TODO 8: Add Reset and Checkout buttons (POST /api/checkout)
// Reset empties the cart. Checkout sends { cart } and shows the receipt that comes back.
</script>

<template>
  <header class="topbar">
    <h1>Mini Cart</h1>
    <span class="badge">{{ cart.length }} in cart</span>
  </header>

  <main class="layout">
    <section>
      <label for="category">Category</label>
      <select id="category" v-model="selectedCategory" @change="loadItems">
        <option v-for="category in categories" :key="category" :value="category">
          {{ category }}
        </option>
      </select>

      <!-- TODO 3: Create the ItemCard component with an items prop -->
      <!-- Then import ItemCard above, show it here, and listen for its add-to-cart event. -->
    </section>

    <aside class="cart">
      <h2>Your cart</h2>
      <p v-if="cart.length === 0" class="muted">Nothing here yet.</p>
      <ul v-else>
        <li v-for="line in cart" :key="line.id">
          <span>{{ line.name }} × {{ line.quantity }}</span>
          <span>\${{ (line.price * line.quantity).toFixed(2) }}</span>
        </li>
      </ul>

      <div v-if="receipt" class="receipt">
        <strong>Receipt #{{ receipt.receiptId }}</strong>
        <span>Paid \${{ receipt.total.toFixed(2) }}</span>
      </div>
    </aside>
  </main>
</template>
`,
    },
    {
      path: 'src/components/ItemCard.vue',
      language: 'vue',
      content: `<script setup>
// TODO 3: Create the ItemCard component with an items prop
// Declare the prop with defineProps. Each item looks like { id, name, price, emoji }.

// TODO 4: Emit add-to-cart from ItemCard
// Declare the event with defineEmits, then emit it from addToCart with the matching item.
function addToCart(id) {
}
</script>

<template>
  <div class="grid">
    <article v-for="item in items" :key="item.id" class="card">
      <div class="emoji">{{ item.emoji }}</div>
      <h3>{{ item.name }}</h3>
      <p class="price">\${{ item.price.toFixed(2) }}</p>
      <button @click="addToCart(item.id)">Add to cart</button>
    </article>
  </div>
</template>
`,
    },
    {
      path: 'src/style.css',
      language: 'css',
      content: `:root {
  --ink: #1f2933;
  --muted: #6b7280;
  --line: #e5e7eb;
  --accent: #2563eb;
  --bg: #f8fafc;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--ink);
  background: var(--bg);
}

body {
  margin: 0;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: white;
  border-bottom: 1px solid var(--line);
}

.topbar h1 {
  margin: 0;
  font-size: 1.25rem;
}

.badge {
  font-size: 0.875rem;
  color: var(--muted);
}

.layout {
  display: grid;
  gap: 20px;
  padding: 20px;
}

@media (min-width: 768px) {
  .layout {
    grid-template-columns: 1fr 300px;
  }
}

label {
  display: block;
  margin-bottom: 4px;
  font-weight: 600;
}

select {
  padding: 6px 8px;
  margin-bottom: 16px;
  text-transform: capitalize;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.card {
  padding: 12px;
  background: white;
  border: 1px solid var(--line);
  border-radius: 8px;
  text-align: center;
}

.card h3 {
  margin: 4px 0;
  font-size: 1rem;
}

.emoji {
  font-size: 2rem;
}

.price {
  margin: 0 0 8px;
  color: var(--muted);
}

button {
  padding: 6px 12px;
  border: 0;
  border-radius: 6px;
  background: var(--accent);
  color: white;
  cursor: pointer;
}

.cart {
  padding: 16px;
  background: white;
  border: 1px solid var(--line);
  border-radius: 8px;
  align-self: start;
}

.cart h2 {
  margin-top: 0;
  font-size: 1.1rem;
}

.cart ul {
  padding: 0;
  list-style: none;
}

.cart li {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.muted {
  color: var(--muted);
}

.receipt {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
  padding: 8px;
  background: #ecfdf5;
  border-radius: 6px;
}
`,
    },
    {
      path: 'server/api.js',
      language: 'js',
      content: `// Mini Cart API: a tiny Express server. Vite forwards every /api request here (see vite.config.js).
import express from 'express'
import { readFileSync } from 'node:fs'

const { categories, items } = JSON.parse(readFileSync(new URL('./data.json', import.meta.url), 'utf8'))

const app = express()
app.use(express.json())

app.get('/api/categories', (req, res) => {
  res.json(categories)
})

app.get('/api/items', (req, res) => {
  const { category } = req.query
  res.json(category ? items.filter((item) => item.category === category) : items)
})

// TODO 8: Add Reset and Checkout buttons (POST /api/checkout)
// Read req.body.cart, add up price × quantity, and send back { receiptId, cart, total }.
app.post('/api/checkout', (req, res) => {
  res.status(501).json({ error: 'Checkout is not built yet' })
})

app.listen(3001, () => {
  console.log('Mini Cart API running on http://localhost:3001')
})
`,
    },
    {
      path: 'server/data.json',
      language: 'json',
      content: `{
  "categories": ["fruit", "bakery", "drinks"],
  "items": [
    { "id": "fr1", "category": "fruit", "name": "Banana", "price": 0.6, "emoji": "🍌" },
    { "id": "fr2", "category": "fruit", "name": "Mango", "price": 2.4, "emoji": "🥭" },
    { "id": "fr3", "category": "fruit", "name": "Strawberries", "price": 4.9, "emoji": "🍓" },
    { "id": "fr4", "category": "fruit", "name": "Green apple", "price": 0.95, "emoji": "🍏" },
    { "id": "bk1", "category": "bakery", "name": "Wholemeal loaf", "price": 3.2, "emoji": "🍞" },
    { "id": "bk2", "category": "bakery", "name": "Croissant", "price": 2.1, "emoji": "🥐" },
    { "id": "bk3", "category": "bakery", "name": "Bagel", "price": 1.5, "emoji": "🥯" },
    { "id": "dr1", "category": "drinks", "name": "Soy milk", "price": 2.75, "emoji": "🥛" },
    { "id": "dr2", "category": "drinks", "name": "Sparkling water", "price": 1.3, "emoji": "💧" },
    { "id": "dr3", "category": "drinks", "name": "Iced lemon tea", "price": 1.8, "emoji": "🍋" }
  ]
}
`,
    },
  ],
  steps: [
    { order: 1, title: "Create the Vue app with a list of categories", todoRefs: [{file: "src/App.vue", line: 11}] },
    { order: 2, title: "Fetch items for the selected category with axios", todoRefs: [{file: "src/App.vue", line: 16}] },
    { order: 3, title: "Create the ItemCard component with an items prop", todoRefs: [{file: "src/App.vue", line: 48}, {file: "src/components/ItemCard.vue", line: 2}] },
    { order: 4, title: "Emit add-to-cart from ItemCard", todoRefs: [{file: "src/components/ItemCard.vue", line: 5}] },
    { order: 5, title: "Add the item to the cart in the parent (increase quantity if it's already there)", todoRefs: [{file: "src/App.vue", line: 21}] },
    { order: 6, title: "Show the cart total with a computed property", todoRefs: [{file: "src/App.vue", line: 25}] },
    { order: 7, title: "Save the cart to localStorage and load it on start", todoRefs: [{file: "src/App.vue", line: 27}] },
    { order: 8, title: "Add Reset and Checkout buttons (POST /api/checkout)", todoRefs: [{file: "src/App.vue", line: 29}, {file: "server/api.js", line: 19}] },
  ],
}

export default miniCartSeed