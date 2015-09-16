'use strict'

import $ from 'dominus'
import raf from 'raf'
import promisees from './lib'
import polyfetch from './polyfetch'

function injection (code) {
  $('.ly-frame').remove()

  var frame = $('<iframe>')
    .addClass('ly-frame')
    .attr('frameborder', 0)
    .appendTo(document.body)[0]
    .contentWindow

  frame.Promise = promisees.Promise
  frame.eval(polyfetch)

  raf(() => frame.eval(code))
}

export default injection
