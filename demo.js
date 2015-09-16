'use strict'

import $ from 'dominus'
import {parse} from 'omnibox/querystring'
import injection from './injection'
import visualizer from './visualizer'
import debounce from 'lodash/function/debounce'
var container = $('.ly-container')
var input = $('.ly-input')
var output = $('.ly-output')
var perma = $('.ng-perma')
var save = $('.ng-save')
var dreload = debounce(reload, 300)
var original = `fetch('/foo')
  .then(res => res.status)
  .then(status => console.log(status))`
var latest
var base = location.pathname.slice(1)

read(location)
listen()

function listen () {
  input.on('keypress change keydown', dreload)
  save.on('click', permalink)
  perma.on('click', follow)
}

function follow (e) {
  if (e.which === 1 && !e.metaKey && !e.ctrlKey) {
    read(e.currentTarget)
  }
}

function reload () {
  var code = input.value().trim()
  if (code === latest) {
    return false
  }
  latest = code
  visualizer(injection(code))
}

function forced (code) {
  input.value(code)
  reload(code)
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
  if (latest === original) {
    location.hash = ''
  } else {
    location.hash = `#code=${encodeURIComponent(latest).replace(/%20/g, '+')}`
  }
}
