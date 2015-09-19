'use strict'

import $ from 'dominus'
import {parse} from 'omnibox/querystring'
import ace from 'brace'
import 'brace/mode/javascript'
import 'brace/theme/tomorrow'
import vectorcam from 'vectorcam'
import injection from './injection'
import visualizer from './visualizer'
import promisees from './lib'
import debounce from 'lodash/function/debounce'
var container = $('.ly-container')
var input = $('.ly-input')
var output = $('.ly-output')
var perma = $('.ng-perma')
var save = $('.ng-save')
var replay = $('.ng-replay')
var first = $('.ng-first')
var prev = $('.ng-prev')
var next = $('.ng-next')
var last = $('.ng-last')
var x = $('.ng-x')
var recorder = $('.ng-recorder')
var download = $('.ng-download')
var downloadIcon = $('i', '.ng-download')
var dreload = debounce(reload, 300)
var original = `var p = fetch('/foo')
  .then(res => res.status, err => console.error(err))

p.catch(err => console.error(err))
p.then(status => console.log(status))
p
  .then(status => status.a.b.c)
  .catch(err => console.error(err))
`
var state = {}
var base = location.pathname.slice(1)
var visualization
var cam
var editor = ace.edit(input[0])
var editorSession = editor.getSession()

editor.setTheme('ace/theme/tomorrow')
editor.setShowPrintMargin(false)
editor.commands.removeCommands(['gotoline', 'find']) // yuck, leave my keyboard alone
editor.$blockScrolling = Infinity
editorSession.setMode('ace/mode/javascript')
editorSession.setUseSoftTabs(true)
editorSession.setTabSize(2)
editorSession.setUseWorker(false)

read(location)
listen()

function listen () {
  editorSession.on('change', dreload)
  save.on('click', permalink)
  perma.on('click', follow)
  first.on('click', (e) => to(e, 'first'))
  prev.on('click', (e) => to(e, 'prev'))
  next.on('click', (e) => to(e, 'next'))
  last.on('click', (e) => to(e, 'last'))
  x.on('click', refactor)
  replay.on('click', refresh)
  recorder.on('click', toggleRecorder)
}

function follow (e) {
  if (e.which === 1 && !e.metaKey && !e.ctrlKey) {
    read(e.currentTarget)
  }
}

function reload () {
  var code = editor.getValue().trim()
  if (code === state.code) {
    return false
  }
  reset(code)
  if (state.visualization) {
    state.visualization.off()
  }
  var options = {
    speed: parseInt(x.text())
  }
  state.visualization = visualizer(injection(code), options)
  state.visualization.on('frame', resetPlayback)
  if (recording()) {
    record()
  }
}

function to (e, position) {
  if ($(e.currentTarget).hasClass('ng-playback-disabled')) {
    return
  }
  if (state.visualization) {
    state.visualization[position]()
    resetPlayback()
    resetCam()
  }
}

function refresh () {
  forced(state.code)
}

function refactor () {
  var speed = parseInt(x.text())
  if (speed === 32) {
    speed = 1
    x.text(speed + 'x')
  } else {
    speed *= 2
    x.text(speed + 'x (slower)')
  }
  refresh()
}

function resetPlayback () {
  var vis = state.visualization
  if (!vis || !vis.history.length) {
    set(first, false)
    set(prev, false)
    set(next, false)
    set(last, false)
    return
  }
  var current = vis.historyIndex
  var total = vis.history.length - 1
  set(first, current > 0)
  set(prev, current > 0)
  set(next, current < total)
  set(last, current < total)

  function set (element, enabled) {
    element[enabled ? 'removeClass' : 'addClass']('ng-playback-disabled')
  }
}

function recording () {
  return recorder.hasClass('ng-recorder-off') === false
}

function toggleRecorder () {
  if (recording()) {
    recorder.addClass('ng-recorder-off')
    download.addClass('ng-recorder-off')
    resetCam()
  } else {
    recorder.removeClass('ng-recorder-off')
    download.removeClass('ng-recorder-off')
    forced(state.code)
  }
}

function reset (code) {
  console.clear()
  state = { code }
  resetCam()
  resetPlayback()
  download.removeClass('ng-download-ready')
  download.attr('href', null)
  download.attr('download', null)
}

function resetCam () {
  if (cam) {
    cam.reset()
    cam = null
  }
  download.removeClass('ng-download-ready')
  downloadIcon.setClass('fa fa-battery-empty')
}

function record () {
  var svg = $.findOne('.ly-svg')
  var active = debounce(inactive, 4000)

  promisees.on('construct', active)
  promisees.on('blocked', active)
  promisees.on('state', active)

  cam = vectorcam(svg)
  cam.start()
  downloadIcon.setClass('fa fa-battery-quarter')

  function inactive () {
    if (cam) {
      downloadIcon.setClass('fa fa-battery-half')
      cam.stop(recorded)
      cam = null
    }
  }

  function recorded (err, image) {
    if (err) {
      downloadIcon.setClass('fa fa-battery-empty')
      throw err
    }
    state.recording = image
    download.addClass('ng-download-ready')
    download.attr('href', state.recording)
    download.attr('download', new Date().valueOf() + '.gif')
    downloadIcon.setClass('fa fa-battery-full')
  }
}

function forced (code) {
  state.code = null
  editor.setValue(code, 1)
  reload()
}

function read (source) {
  var qs = parse(source.hash.slice(1))
  if (qs.code) {
    forced(qs.code)
  } else {
    forced(original)
  }
}

function permalink () {
  if (state.code === original) {
    location.hash = ''
  } else {
    location.hash = '#code=' + encodeURIComponent(state.code).replace(/%20/g, '+')
  }
}
