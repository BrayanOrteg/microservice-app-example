var path = require('path');

const AUTH_API_ADDRESS = process.env.AUTH_API_ADDRESS || 'http://127.0.0.1:8081';
const TODOS_API_ADDRESS = process.env.TODOS_API_ADDRESS || 'http://127.0.0.1:8082';
const ZIPKIN_URL = process.env.ZIPKIN_URL || 'http://127.0.0.1:9411/api/v2/spans';

module.exports = {
  build: {
    env: require('./prod.env'),
    index: path.resolve(__dirname, '../dist/index.html'),
    assetsRoot: path.resolve(__dirname, '../dist'),
    assetsSubDirectory: 'static',
    assetsPublicPath: '/',
    productionSourceMap: true,
    productionGzip: false,
    productionGzipExtensions: ['js', 'css'],
    bundleAnalyzerReport: process.env.npm_config_report
  },
  dev: {
    env: require('./dev.env'),
    port: process.env.PORT,
    autoOpenBrowser: false,
    assetsSubDirectory: 'static',
    assetsPublicPath: '/',
    proxyTable: {
      '/login': {
        target: AUTH_API_ADDRESS,
        secure: false
      },
      '/todos': {
        target: TODOS_API_ADDRESS,
        secure: false
      },
      '/zipkin': {
        target: ZIPKIN_URL,
        pathRewrite: {
          '^/zipkin': ''
        },
        secure: false
      }
    },
    cssSourceMap: false
  }
};