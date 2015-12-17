const gulp = require('gulp');
const gutil = require('gulp-util');
const webpack = require('webpack');
const runSequence = require('run-sequence');
const browserSync = require('browser-sync');
const del = require('del');
const vinylPaths = require('vinyl-paths');
const syntax = require('postcss-scss');
const webpackConfig = require('./webpack.config');

const $ = require('gulp-load-plugins')({ lazy: false });

const postcssProcessors = [
  require('autoprefixer')({ browsers: ['last 2 version'] }),
  require('css-mqpacker'),
  require('postcss-nested')
];
const assetsPaths = {
  app: './app/assets',
  javascripts: [],
  stylesheets: [],
  images: []
};
const destPath = './public/assets';
const production = process.env.NODE_ENV === 'production';

$.sprockets.declare(assetsPaths, destPath);

gulp.task('clean', () => del(destPath));

const devWebpack = webpack(Object.assign({}, webpackConfig, {
  devtool: 'hidden-source-map',
  debug: true
}));
gulp.task('webpack:dev', cb => {
  devWebpack.run((err, stats) => {
    if (err) { throw new gutil.PluginError('webpack:dev', err); }
    gutil.log('[webpack:dev]', stats.toString({ colors: true }));
    cb();
  });
});

gulp.task('webpack:build', cb => {
  const finalWebpackConfig = Object.assign({}, webpackConfig, {
    plugins: [
      new webpack.optimize.UglifyJsPlugin({
        compress: { warnings: false }
      })
    ]
  });

  webpack(finalWebpackConfig, (err, stats) => {
    if (err) { throw new gutil.PluginError('webpack:build', err); }
    gutil.log('[webpack:build]', stats.toString({ colors: true }));
    cb();
  });
});

gulp.task('build:image', () => {
  return gulp.src([`${assetsPaths.app}/images/**/*.{jpg,gif,png}`])
    .pipe($.if(production, $.sprockets.precompile()))
    .pipe(gulp.dest(destPath));
});

// webpackからのstreamで（webpack-stream利用）vinylオブジェクトの値が正しくなく
// sprockets.precompileでエラーになるので
// 一旦`webpack:build`でpublic/assetsに吐いたあとでprecompile
gulp.task('build:js', () => {
  return new Promise((resolve, reject) => {
    const vPaths = vinylPaths();
    gulp.src([`${destPath}/*.js`])
      .pipe(vPaths)
      .pipe($.sprockets.precompile())
      .pipe(gulp.dest(destPath))
      .on('end', () => del(vPaths.paths).then(resolve).catch(reject));
  });
});

gulp.task('build:scss', () => {
  return gulp.src([`${assetsPaths.app}/stylesheets/entries/*.scss`])
    .pipe($.cached('scss'))
    .pipe($.postcss(postcssProcessors, { syntax }))
    .pipe($.sprockets.scss({ precompile: production }))
    .pipe($.if(production, $.minifyCss()))
    .pipe($.if(production, $.sprockets.precompile()))
    .pipe(gulp.dest(destPath))
});

gulp.task('preserver', cb => {
  runSequence(
    'clean',
    ['build:image', 'webpack:dev', 'build:scss'],
    cb
  );
});

gulp.task('server', ['preserver'], () => {
  browserSync({
    files: [
      './app/views/**/*.html.*',
      `${destPath}/*.js`,
      `${destPath}/*.css`
    ],
    proxy: {
      target: 'localhost:3000'
    },
    ui: false,
    notify: false,
    ghostMode: false
  });
});

gulp.task('watch', ['server'], () => {
  gulp.watch([`${assetsPaths.app}/stylesheets/**/*.scss`], ['build:scss'])
    .on('change', ev => {
      console.log(`File ${ev.path} was ${ev.type}, running build task...`);
    });
  gulp.watch([`${assetsPaths.app}/javascripts/**/*.{js,jsx,ts,tsx}`], ['webpack:dev'])
    .on('change', ev => {
      console.log(`File ${ev.path} was ${ev.type}, running build task...`);
    });
});

gulp.task('build', () => {
  runSequence('clean', ['build:image', 'build:scss', 'webpack:build'], 'build:js');
});
