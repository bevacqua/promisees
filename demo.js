'use strict'

import $ from 'dominus'
import {parse} from 'omnibox/querystring'
import injection from './injection'
import visualizer from './visualizer'
import debounce from 'lodash/function/debounce'
var container = $('.ly-container')
var title = $('.lh-title')
var input = $('.ly-input')
var output = $('.ly-output')
var save = $('.ng-save')
var perma = $('.ng-perma')
var dreload = debounce(reload, 300)
var original = `fetch('/foo')
  .then(res => res.status)
  .then(status => console.log(status))`
var latest

read(location)

global.onpopstate = back
input.on('keypress change keydown', dreload)
save.on('click', () => push('pushState'))
title.on('click', () => home('pushState'))
perma.on('click', capture)

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

function capture (e) {
  if (e.which === 1 && !e.metaKey && !e.ctrlKey) {
    read(e.target)
    e.preventDefault()
  }
}

function read (source) {
  var qs = parse(source.search.slice(1))
  if (qs.code) {
    forced(qs.code)
    push(source === location ? 'replaceState' : 'pushState')
  } else {
    home('replaceState')
  }
}

function home (direction) {
  forced(original)
  state(direction, '/promisees')
}

function push (direction) {
  if (latest === original) {
    home(direction)
  } else {
    state(direction)
  }
}

function state (direction, url) {
  history[direction]({p:1}, null, url || `/promisees?code=${encodeURIComponent(latest).replace(/%20/g, '+')}`)
}

function back (e) {
  var s = e.state;
  var empty = !s || !s.p;
  if (empty) {
    return;
  }
  var code = parse(location.search.slice(1)).code || original
  forced(code)
}
