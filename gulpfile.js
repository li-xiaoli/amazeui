/* jshint -W097*/
/* jshint node:true */

'use strict';

var path = require('path');
var fs = require('fs-extra');
var _ = require('lodash');
var format = require('util').format;
var exec = require('child_process').exec;

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();

var pkg = require('./package.json');
var transportDir = '.build/ts/';
var buildTmpDir = '.build/tmp/';
var jsPaths = {
  widgets: [
    '*/src/*.js',
    '!{powered_by,switch_mode,toolbar,tech_support,layout*,blank,container}' +
    '/src/*.js'],
  hbsHelper: [
    'vendor/amazeui.hbs.helper.js',
    'vendor/amazeui.hbs.partials.js']
};

var dist = {
  js: './dist/js',
  css: './dist/css'
};

var jsBase = [
  'core.js',
  'util.fastclick.js',
  'util.hammer.js',
  'zepto.outerdemension.js',
  'zepto.extend.data.js',
  'zepto.extend.fx.js',
  'zepto.extend.selector.js'
];

var dateFormat = 'UTC:yyyy-mm-dd"T"HH:mm:ss Z';

var banner = [
  '/*! <%= pkg.title %> v<%= pkg.version %><%=ver%>',
  'by Amaze UI Team',
  '(c) ' + $.util.date(Date.now(), 'UTC:yyyy') + ' AllMobilize, Inc.',
  'Licensed under <%= pkg.license.type %>',
  $.util.date(Date.now(), dateFormat) + ' */ \n'
].join(' | ');

var seajs = path.join(__dirname, 'vendor/seajs/sea.js');
var seaUse = '';
var seaUseBasic = '';
var seaUseWidgets = '';
var jsWidgets = [];
var plugins;
var allPlugins;
var pluginsUsed;
var pluginsNotUsed;
var jsAll;
var jsAllSorted;
var jsBasic;
var jsBasicSorted;
var jsWidgetsSorted;

// write widgets style and tpl
var preparingData = function() {
  var fsOptions = {encoding: 'utf8'};
  var uiBase = fs.readFileSync('./less/amui.less', fsOptions);
  var widgetsStyleDeps = [];
  var widgetsStyle = '';
  var widgetsStyleWithDeps = '';
  var WIDGET_DIR = './widget';
  var rejectWidgets = ['.DS_Store', 'blank', 'layout2', 'layout3', 'layout4',
    'container', 'powered_by', 'tech_support', 'toolbar', 'switch_mode'];
  var allWidgets = _.reject(fs.readdirSync(WIDGET_DIR), function(widget) {
    return rejectWidgets.indexOf(widget) > -1;
  });

  var modules = [];
  var modulesBasic = [];
  var modulesWidgets = [];

  allPlugins = fs.readdirSync('./js');
  plugins = fs.readdirSync('./js');

  var partials = '(function(undefined){\n';
  partials += '  \'use strict\';\n\n';
  partials += '  var registerAMUIPartials = function(hbs) {\n';

  allWidgets.forEach(function(widget, i) {
    // read widget package.json
    var pkg = fs.readJsonFileSync(path.
        join(WIDGET_DIR, widget, 'package.json'));
    var srcPath = '../widget/' + widget + '/src/';

    if (i === 0) {
      widgetsStyleDeps = _.union(widgetsStyleDeps, pkg.styleBase);
    }

    widgetsStyleDeps = _.union(widgetsStyleDeps, pkg.styleDependencies);
    jsWidgets.push(pkg.script);

    jsWidgets = _.union(jsWidgets, pkg.jsDependencies);

    widgetsStyle += '\r\n// ' + widget + '\r\n';

    widgetsStyle += '@import "' + srcPath + pkg.style + '";' + '\r\n';
    _.forEach(pkg.themes, function(item, index) {
      if (!item.hidden && item.name) {
        widgetsStyle += '@import "' + srcPath + widget + '.' +
            item.name + '.less";' + '\r\n';
      }
    });

    // read tpl
    var tpl = fs.readFileSync(path.
        join(WIDGET_DIR, widget, 'src', widget + '.hbs'), fsOptions);
    partials += format('    hbs.registerPartial(\'%s\', %s);\n\n',
        widget, JSON.stringify(tpl));
  });

  widgetsStyleDeps.forEach(function(dep) {
    widgetsStyleWithDeps += format('@import "%s";\n', dep);
  });

  fs.writeFileSync('./less/amazeui.less', uiBase + widgetsStyle);

  fs.writeFileSync('./less/amazeui.widgets.less',
      widgetsStyleWithDeps + widgetsStyle);

  /**
   *  Prepare JavaScript Data
   */

    // for amazeui.basic.js
  jsBasic = _.union(jsBase, allPlugins);

  // for amazeui.js
  jsAll = _.union(jsBasic, jsWidgets);

  jsWidgets = _.union(jsBase, jsWidgets);

  pluginsNotUsed = _.difference(plugins, jsWidgets);

  pluginsUsed = _.remove(plugins, function(plugin) {
    return pluginsNotUsed.indexOf(plugin) == -1;
  });

  jsWidgets = _.union(jsBase, pluginsUsed, jsWidgets);

  // seajs.use[''...]
  jsAll.forEach(function(js) {
    var basename = path.basename(js, '.js');
    modules.push(basename);

    if (jsWidgets.indexOf(js) > -1) {
      modulesWidgets.push(basename);
    }

    if (jsBasic.indexOf(js) > -1) {
      modulesBasic.push(basename);
    }
  });

  seaUse = 'seajs.use(' + JSON.stringify(modules) + ');';
  seaUseBasic = 'seajs.use(' + JSON.stringify(modulesBasic) + ');';
  seaUseWidgets = 'seajs.use(' + JSON.stringify(modulesWidgets) + ');';

  // sort for concat
  jsWidgetsSorted = _.union([seajs], jsWidgets, [seaUseWidgets]);

  jsAllSorted = _.union([seajs], jsAll);

  jsBasicSorted = _.union([seajs], jsBasic, [seaUseBasic]);

  partials += '  };\n\n';
  partials += '  if (typeof module !== \'undefined\' && module.exports) {\n';
  partials += '    module.exports = registerAMUIPartials;\n' +
  '  }\n\n';
  partials += '  this.Handlebars && registerAMUIPartials(Handlebars);\n';
  partials += '}).call(this);\n';

  // write partials
  fs.writeFileSync(path.join('./vendor/amazeui.hbs.partials.js'), partials);
};

// build to dist dir
gulp.task('buildLess', function() {
  gulp.src(
      [
        './less/amui.less',
        './less/amazeui.widgets.less',
        './less/amazeui.less'
      ]).pipe($.header(banner, {pkg: pkg, ver: ''}))
      .pipe($.less({
        paths: [
          path.join(__dirname, 'less'),
          path.join(__dirname, 'widget/*/src')]
      }))
      .pipe($.rename(function(path) {
        if (path.basename === 'amui') {
          path.basename = pkg.name + '.basic';
        }
      }))
      .pipe(gulp.dest(dist.css))
    // Disable advanced optimizations - selector & property merging, etc.
    // for Issue #19 https://github.com/allmobilize/amazeui/issues/19
      .pipe($.minifyCss({noAdvanced: true}))
      .pipe($.rename({
        suffix: '.min',
        extname: '.css'
      }))
      .pipe(gulp.dest(dist.css));
});

gulp.task('bower', function() {
  $.bower().
      pipe(gulp.dest('vendor/'));
});

// copy ui js files to build dir
gulp.task('copyWidgetJs', function() {
  $.util.log($.util.colors.yellow('Start copy UI js files to build dir....'));
  return gulp.src(jsPaths.widgets, {cwd: './widget'})
      .pipe($.rename(function(path) {
        path.dirname = ''; // remove widget dir
      }))
      .pipe(gulp.dest(buildTmpDir));
});

// copy widgets js files to build dir
gulp.task('copyUIJs', ['copyWidgetJs'], function() {
  return gulp.src(['*.js', '!./js/zepto.calendar.js'], {
    cwd: './js'
  })
      .pipe(gulp.dest(buildTmpDir));
});

// gulp cmd transport
gulp.task('transport', ['copyUIJs'], function() {
  return gulp.src(['*.js'], {cwd: buildTmpDir})
      .pipe($.cmdTransport({paths: [buildTmpDir]}))
      .pipe(gulp.dest(transportDir));
});

// concat amazeui.js
gulp.task('concatAll', ['transport'], function() {
  return gulp.src(jsAllSorted, {cwd: transportDir})
      .pipe($.concat(pkg.name + '.js'))
      .pipe($.header(banner, {pkg: pkg, ver: ''}))
      .pipe($.footer('\n<%=use%>', {use: seaUse}))
      .pipe(gulp.dest(dist.js))
      .pipe($.uglify({
        mangle: {
          except: ['require']
        }
      }))
      .pipe($.header(banner, {pkg: pkg, ver: ''}))
      .pipe($.rename({
        suffix: '.min',
        extname: '.js'
      }))
      .pipe(gulp.dest(dist.js));
});

// concat amazeui.basic.js
gulp.task('concatBasic', ['concatAll'], function() {
  return gulp.src(jsBasicSorted, {cwd: transportDir})
      .pipe($.concat(pkg.name + '.basic.js'))
      .pipe($.header(banner, {pkg: pkg, ver: ' ~ basic'}))
      .pipe($.footer('\n<%=use%>', {use: seaUseBasic}))
      .pipe(gulp.dest(dist.js))
      .pipe($.uglify({
        mangle: {
          except: ['require']
        }
      }))
      .pipe($.header(banner, {pkg: pkg, ver: ' ~ basic'}))
      .pipe($.rename({
        suffix: '.min',
        extname: '.js'
      }))
      .pipe(gulp.dest(dist.js));
});

// concat amazeui.widgets.js
gulp.task('concatWidgets', ['concatBasic'], function() {
  return gulp.src(jsWidgetsSorted, {cwd: transportDir})
      .pipe($.concat(pkg.name + '.widgets.js'))
      .pipe($.header(banner, {pkg: pkg, ver: ' ~ widgets'}))
      .pipe($.footer('\n<%=use%>', {use: seaUseWidgets}))
      .pipe(gulp.dest(dist.js))
      .pipe($.uglify({
        mangle: {
          except: ['require']
        }
      }))
      .pipe($.header(banner, {pkg: pkg, ver: ' ~ widgets'}))
      .pipe($.rename({
        suffix: '.min',
        extname: '.js'
      }))
      .pipe(gulp.dest(dist.js));
});

gulp.task('concat', ['concatAll', 'concatBasic', 'concatWidgets']);

gulp.task('clean', ['concatWidgets'], function() {
  $.util.log($.util.colors.green('Finished build js, cleaning...'));
  gulp.src('./.build', {read: false})
      .pipe($.clean({force: true}));
});

gulp.task('hbsHelper', function() {
  gulp.src(jsPaths.hbsHelper)
      .pipe($.concat(pkg.name + '.widgets.helper.js'))
      .pipe($.header(banner, {pkg: pkg, ver: ' ~ helper'}))
      .pipe(gulp.dest(dist.js))
      .pipe($.uglify({
        mangle: {
          except: ['require']
        }
      }))
      .pipe($.header(banner, {pkg: pkg, ver: ' ~ helper'}))
      .pipe($.rename({
        suffix: '.min',
        extname: '.js'
      }))
      .pipe(gulp.dest(dist.js));
});

gulp.task('preparing', preparingData);

gulp.task('appServer', function() {
  exec('npm start', function(err, stdout, stderr) {
    console.log(stdout);
    console.log(stderr);
  });
});

// Rerun the task when a file changes
gulp.task('watch', function() {
  gulp.watch(['js/*.js', 'widget/*/src/*.js'], ['buildJs']);
  gulp.watch(['less/**/*.less', 'widget/*/src/*.less'], ['buildLess']);
  gulp.watch(['dist/amui*js'], ['copyFiles']);
  gulp.watch(['docs/assets/js/main.js'], ['amazeMain']);
  gulp.watch(['widget/**/*.json', 'widget/**/*.hbs'], ['preparing']);
  gulp.watch(jsPaths.hbsHelper, ['hbsHelper']);
});

gulp.task('zipCopyCSS', function() {
  return gulp.src('./dist/css/*.css')
      .pipe(gulp.dest('./docs/examples/assets/css'));
});

gulp.task('zipCopyJs', ['zipCopyCSS'], function() {
  return gulp.src([
    './dist/js/*.js',
    './vendor/handlebars/handlebars.min.js',
    './vendor/zepto/zepto.min.js'])
      .pipe(gulp.dest('./docs/examples/assets/js'));
});

gulp.task('zipAdd', ['zipCopyJs'], function() {
  return gulp.src(['docs/examples/**/*'])
      .pipe($.replace(/\{\{assets\}\}/g, 'assets/', {skipBinary: true}))
      .pipe($.zip(format('AmazeUI-%s-%s.zip',
          pkg.version, $.util.date(Date.now(),'UTC:yyyymmdd')),
          {comment: 'Created on ' + $.util.date(Date.now(), dateFormat)}))
      .pipe(gulp.dest('dist'));
});

gulp.task('zipClean', ['zipAdd'], function() { // zipClean
  return gulp.src(['docs/examples/assets/*/amazeui.*',
    './docs/examples/assets/js/handlebars.min.js',
    './docs/examples/assets/js/zepto.min.js'], {read: false})
      .pipe($.clean({force: true}));
});

gulp.task('zip', ['zipClean']);

gulp.task('buildJs',
    [
      'copyWidgetJs',
      'copyUIJs',
      'transport',
      'concat',
      'clean'
    ]);

// gulp.task('init', ['bower', 'buildJs', 'hbsHelper', 'buildLess', 'watch']);

gulp.task('default',
    [
      'preparing',
      'buildJs',
      'buildLess',
      'hbsHelper',
      'watch'
    ]);

gulp.task('preview',
    ['preparing',
      'buildJs',
      'buildLess',
      'hbsHelper',
      'watch',
      'appServer'
    ]);
