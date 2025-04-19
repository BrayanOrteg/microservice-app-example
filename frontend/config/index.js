// Load environment variables from .env file
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// see http://vuejs-templates.github.io/webpack for documentation.
var path = require('path')

module.exports = {
  build: {
    // ... existing build config ...
  },
  dev: {
    env: require('./dev.env'),
    // process.env values will now be populated from .env file (if set)
    // or fallback to existing environment variables or defaults below
    port: process.env.PORT || 8080, // Keep default fallback
    autoOpenBrowser: false,
    assetsSubDirectory: 'static',
    assetsPublicPath: '/',
    proxyTable: {
      '/login': {
        target: process.env.AUTH_API_ADDRESS || 'http://127.0.0.1:8081', // Keep default fallback
        secure: false
      },
      '/todos': {
        target: process.env.TODOS_API_ADDRESS || 'http://127.0.0.1:8082', // Keep default fallback
        secure: false
      },
      '/zipkin': {
        target: process.env.ZIPKIN_URL || 'http://127.0.0.1:9411/api/v2/spans', // Keep default fallback
        pathRewrite: {
          '^/zipkin': ''
        },
        secure: false
      },
    },
    // CSS Sourcemaps off by default because relative paths are "buggy"
    // with this option, according to the CSS-Loader README
    // (https://github.com/webpack/css-loader#sourcemaps)
    // In our experience, they generally work as expected,
    // just be aware of this issue when enabling this option.
    cssSourceMap: false
  }
}