const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './src/index.ts',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  devtool: 'inline-source-map',
  devServer: {
    static: './dist',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.obj$/,
        type: 'asset/resource',
      }
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      'three/addons': path.resolve(__dirname, 'node_modules/three/examples/jsm/'),
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'index-template.html',
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: './assets', to: './assets' },
      ],
    }),
  ],
};
