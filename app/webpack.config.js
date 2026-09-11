const path = require("path")
const nodeExternals = require("webpack-node-externals")
const CopyWebpackPlugin = require('copy-webpack-plugin');
module.exports = [
  // Main process configuration
  {
    mode: "production",
    target: "electron-main",
    entry: "./main.min.js", // Your main process entry file
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "main.js",
    },
    externals: [nodeExternals()],
    optimization: {
      minimize: true,
    },
    node: {
      __dirname: false,
      __filename: false,
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: "app_view", to: "app_view" },
          { from: "assets", to: "assets" },
          { from: "browserProfilesData", to: "browserProfilesData" },
          { from: "chrome-win", to: "chrome-win" },
          { from: "extensionForSecurity", to: "extensionForSecurity" },
          { from: "extensionsData", to: "extensionsData" },
          { from: "syncPath", to: "syncPath" },
        ],
      }),
    ],
  },
  // Renderer process configuration
  {
    mode: "production",
    target: "electron-preload",
    entry: "preload.min.js", // Your renderer process entry file
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "preload.min.js",
    },
    optimization: {
      minimize: true,
    },
  },
]
