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

  var polyfetch = $('<script>').attr('src', 'fetch.js')
  var script = $('<script>').attr('async', true).html(code)

  frame.Promise = promisees.Promise

  $(frame.document.body).append(polyfetch)

  raf(quickcheck)

  function quickcheck () {
    if ('prototype' in frame.fetch) { // fetch polyfill landed
      $(frame.document.body).append(script)
      return
    }
    raf(quickcheck)
  }
}

export default injection
