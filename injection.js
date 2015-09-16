'use strict'

import $ from 'dominus'
import raf from 'raf'
import promisees from './lib'

function injection (code) {
  $('.ly-frame').remove()

  var frame = $('<iframe>')
    .addClass('ly-frame')
    .attr('frameborder', 0)
    .appendTo(document.body)[0]
    .contentWindow

  var fdoc = frame.document
  var base = location.pathname
  var polyfetch = $('<script>').attr('src', location.pathname + 'fetch.js')
  var script = $('<script>').attr('async', true).html(code)

  frame.Promise = promisees.Promise

  $(fdoc.body).append(polyfetch)

  raf(quickcheck)

  function quickcheck () {
    if ('prototype' in frame.fetch) { // fetch polyfill landed
      $(fdoc.body).append(script)
      return
    }
    raf(quickcheck)
  }
}

export default injection
