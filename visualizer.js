'use strict'

import $ from 'dominus'
import d3 from 'd3'
import promisees from './lib'
var PENDING = void 0
var FULFILLED = 1
var REJECTED = 2
var classes = {
  [PENDING]: 'p-pending',
  [FULFILLED]: 'p-fulfilled',
  [REJECTED]: 'p-rejected'
}

function visualizer (result) {
  if (result === false) {
    return
  }

  var meta = new WeakMap()
  var matrix
  var roots = []
  var promises = []
  var selector = '.ly-output'
  var parent = $.findOne(selector)

  $(selector).find('*').remove()

  var svg = d3
    .select(selector)
    .append('svg')
    .attr('class', 'ly-svg')

  promisees.off()
  promisees.on('construct', add)
  promisees.on('state', state)
  promisees.on('blocked', blocked)

  function add (p) {
    meta.set(p, { blocking: [], blockers: 0 })
    promises.push(p)
    rematrix()
    refresh()
  }

  function state (p) {
    unblock(p)
    refresh()
  }

  function blocked (p, blocker) {
    var block = meta.get(blocker);
    meta.get(p).blockers++
    block.blocking.push(p)
    block.line = svg.insert('line', ':first-child')
      .attr('class', 'p-blocker-arrow')
      .attr('x1', cx(blocker))
      .attr('y1', cy(blocker))
      .attr('x2', cx(p))
      .attr('y2', cy(p))
    refresh()
  }

  function unblock (p) {
    var block = meta.get(p)
    if (block.blocking.length) {
      block.blocking.map(p => meta.get(p)).forEach(m => m.blockers--)
      block.blocking = []
      block.line.attr('class', 'p-blocker-arrow p-blocker-fade')
    }
  }

  function refresh () {
    var selection = svg
      .selectAll('g')
      .data(promises)

    var intro = selection
      .enter()
      .append('g')

    intro
      .append('circle')
      .attr('r', 45)
      .each(p => p._parents.forEach((parent) => {
        svg
          .insert('line', ':first-child')
          .attr('class', `p-connector p-connector-${parent._id}-${p._id}`)
      }))

    intro
      .append('text')
      .attr('class', 'p-text')
      .text(p => p._role)

    selection
      .selectAll('circle')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('class', p => `p-circle ${meta.get(p).blockers ? 'p-blocked' : classes[p._state]}`)
      .each(p => p._parents.forEach((parent) => {
        svg
          .selectAll(`.p-connector-${parent._id}-${p._id}`)
          .attr('x1', cx(parent))
          .attr('y1', cy(parent))
          .attr('x2', cx(p))
          .attr('y2', cy(p))
      }))

    selection
      .selectAll('text')
      .attr('dx', cx)
      .attr('dy', cy)
  }

  function rematrix () {
    matrix = []
    promises.forEach(p => {
      if (p._parents.length) {
        let parent = p._parents[0]
        let depth = parentCount(p)
        let row = matrix
          .filter(row => row.some(col => col.indexOf(parent) !== -1))
          .shift()
        if (row[depth]) {
          row[depth].push(p)
        } else {
          row[depth] = [p]
        }
        assigned(p, row, depth)
      } else {
        let row = [[p]]
        let depth = matrix.push(row)
        assigned(p, row, 0)
      }
    })
    function assigned (p, row, depth) {
      var metadata = meta.get(p)
      metadata.row = row
      metadata.col = row[depth]
    }
  }

  function parentCount (p) {
    var depth = 1
    var next = p._parents[0]
    while (next._parents.length) {
      next = next._parents[0]
      depth++
    }
    return depth
  }

  function cx (p) {
    var x = 70
    while (p._parents.length) {
      x += 100
      p = p._parents[0]
    }
    if (svg.attr('width') < x + 50) {
      svg.attr('width', x + 100)
    }
    return x
  }

  function cy (p) {
    var metadata = meta.get(p)
    var col = metadata.col
    var col_index = col.indexOf(p) + 1
    var row_length = Math.max(...metadata.row.map(col => col.length))
    var row_height = row_length * 100
    var accumulated = 0
    var level = matrix.indexOf(metadata.row)
    var n = level
    while (n > 0) {
      n--
      accumulated += Math.max(...matrix[n].map(col => col.length)) * 100 + 50
    }
    var item_height = col_index * 100
    var offset = (row_length - col.length) * 50
    var y = accumulated + item_height + offset - 50 * (level + 1)
    if (svg.attr('height') < y + 50) {
      svg.attr('height', y + 100)
    }
    return y + 20
  }
}

export default visualizer
