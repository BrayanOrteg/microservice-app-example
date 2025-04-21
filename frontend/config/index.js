var path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') }); // Load environment variables from .env

const AUTH_API_ADDRESS = process.env.AUTH_API_ADDRESS;
const TODOS_API_ADDRESS = process.env.TODOS_API_ADDRESS;
const ZIPKIN_URL = process.env.ZIPKIN_URL;

console.log("AUTH_API_ADDRESS:", AUTH_API_ADDRESS);
console.log("TODOS_API_ADDRESS:", TODOS_API_ADDRESS);
console.log("ZIPKIN_URL:", ZIPKIN_URL);

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
    port: process.env.FRONT_PORT,
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