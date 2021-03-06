'use strict';

const _ = require('lodash/fp');
const path = require('path');
const express = require('express');
const gutil = require('gulp-util');
const webpack = require('webpack');
const {exists} = require('../utils');
const webpackConfig = require('../../config/webpack.config.client');
const projectConfig = require('../../config/project');
const webpackMiddleware = require('webpack-dev-middleware');

const compiler = options => {
  gutil.log(`Bundling with Webpack (${options.debug ? 'debug' : 'release'})`);

  const config = [webpackConfig]
    .map(config => config(options))
    .filter(hasEntries)
    .shift() || [];

  return filterNoise(webpack(config));
};

const runWebpack = options => {
  return new Promise((resolve, reject) => {
    compiler(options).run((err, stats) => {
      if (err || stats.hasErrors()) {
        // gutil.log(gutil.colors.red(stats.toJson({}, true).errors.join('\n')));
        return reject(err);
      } else {
        return resolve();
      }
    });
  });
};

function getCorsMiddleware() {
  return (req, res, next) => {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  };
}

function getWebpackDevMiddleware(bundler) {
  try {
    return webpackMiddleware(bundler, {quiet: true});
  } catch (e) {
    return (req, res, next) => next();
  }
}

function startWebpack({hot}) {
  const port = projectConfig.servers.cdn.port();
  const clientFilesPath = projectConfig.clientFilesPath();
  const bundler = compiler({debug: true, hot});
  const app = express().use(getCorsMiddleware());
  if (bundler) {
    app.use(getWebpackDevMiddleware(bundler));
    if (hot) {
      app.use(require('webpack-hot-middleware')(bundler));
    }
  }
  app.use(express.static(clientFilesPath)).listen(port, 'localhost');
}

function hasEntriesWithExtensions(extensions) {
  return entry => {
    return extensions
      .map(ext => `${entry}.${ext}`).concat(entry)
      .some(exists);
  };
}

function hasEntries(webpackConfig) {
  const entries = webpackConfig.entry;
  const context = webpackConfig.context;

  return _(entries)
    .values()
    .map(entry => _.isArray(entry) ? entry : [entry])
    .every(
      modules => _(modules)
        .map(module => path.join(context, module))
        .some(hasEntriesWithExtensions(['js', 'ts', 'tsx']))
  );
}

function filterNoise(comp) {
  comp.plugin('done', stats => {
    // Hack to remove extract-text-webpack-plugin messages
    // https://github.com/webpack/extract-text-webpack-plugin/issues/35
    // const messages = stats.stats || [];
    // messages.forEach(stat => {
    //   stat.compilation.children = stat.compilation.children.filter(child =>
    //     child.name !== 'extract-text-webpack-plugin');
    // });

    gutil.log(stats.toString({
      colors: true,
      hash: false,
      chunks: false,
      assets: false,
      children: false
    }));
  });

  return comp;
}

module.exports = {
  startWebpack,
  runWebpack
};
