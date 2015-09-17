'use strict'

import $ from 'dominus'
import d3 from 'd3'
import raf from 'raf'
import promisees from './lib'
var PENDING = void 0
var FULFILLED = 1
var REJECTED = 2
var states = {
  [PENDING]: 'pending',
  [FULFILLED]: 'fulfilled',
  [REJECTED]: 'rejected'
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

  var tip = d3
    .select(selector)
    .append('div')
    .attr('class', 'tt-container')

  $('body')
    .off('mouseout')
    .on('mousemove', e => {
      if (over(e)) {
        return
      }
      tip.attr('class', 'tt-container')
    })

  promisees.off()
  promisees.on('construct', add)
  promisees.on('blocked', blocked)
  promisees.on('state', state)

  function add (p) {
    meta.set(p, {
      blockers: 0,
      blocking: [],
      blocklines: [],
      resolver: methodInfo(p._resolver),
      fulfillment: methodInfo(p._fulfillment),
      rejection: methodInfo(p._rejection)
    })
    promises.push(p)
    rematrix()
    refresh()
    raf(() => blockcheck(p))
  }

  function state (p) {
    unblock(p)
    refresh()
  }

  function blockcheck (p) {
    if (p._role !== '[all]' && p._role !== '[race]') {
      return
    }
    if (p._state === PENDING) {
      p._parents.forEach(parent => {
        if (parent._state === PENDING) {
          blocked(p, parent)
        }
      })
    }
  }

  function blocked (p, blocker) {
    var metadata = meta.get(blocker)
    meta.get(p).blockers++
    metadata.blocking.push(p)
    metadata.blocklines.push(svg
      .insert('line', ':first-child')
      .attr('class', 'p-blocker-arrow')
      .attr('x1', cx(blocker))
      .attr('y1', cy(blocker))
      .attr('x2', cx(p))
      .attr('y2', cy(p))
    )
    refresh()
  }

  function unblock (p) {
    var metadata = meta.get(p)
    if (metadata.blocking.length) {
      metadata.blocking.forEach(p => {
        var m = meta.get(p)
        if (p._role === '[race]' && !m.raceEnded) {
          m.raceEnded = true
          p._parents.filter(p => p._state === PENDING).forEach(unblock)
        }
        m.blockers--
      })
      metadata.blocking = []
      metadata.blocklines.forEach(line => line.attr('class', 'p-blocker-arrow p-blocker-leftover'))
      metadata.blocklines = []
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
      .each(p => p._role === '[all]' || p._role === '[race]' || p._parents.forEach(parent => svg
        .insert('line', ':first-child')
        .attr('class', `p-connector p-connector-${parent._id}-${p._id}`)
      ))
      .on('mouseover', p => tip
        .html(pullMethods(p))
        .attr('class', 'tt-container tt-show')
      )

    svg
      .on('mousemove', p => {
        var r = tip[0][0].getBoundingClientRect()
        var ex = d3.event.pageX
        var ey = d3.event.pageY
        var sx = getScroll('scrollLeft', 'pageXOffset')
        var sy = getScroll('scrollTop', 'pageYOffset')
        var vw = Math.max(document.documentElement.clientWidth, global.innerWidth || 0)
        var vh = Math.max(document.documentElement.clientHeight, global.innerHeight || 0)
        var xx = Math.min(ex + 20 + r.width, vw + sx - 20) - r.width
        var yy = Math.min(ey + 20 + r.height, vh + sy - 20) - r.height

        tip
          .style('left', xx + 'px')
          .style('top', yy + 'px')
      })

    intro
      .append('text')

    selection
      .selectAll('circle')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('class', p => `p-circle ${meta.get(p).blockers ? 'p-blocked' : 'p-' + states[p._state]}`)
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
      .attr('class', p => {
        var m = meta.get(p)
        var dual = m.fulfillment && m.rejection
        return 'p-name' + (dual ? ' p-name-dual' : '')
      })
      .html(p => {
        var m = meta.get(p)
        if (m.resolver) {
          return m.resolver.name || 'new()'
        }
        if (m.fulfillment && m.rejection) {
          return `<tspan dx='${cx(p) - 30}' dy='${cy(p) - 10}'}'>${m.fulfillment.name || '.then()'}</tspan><tspan dx='-60' dy='25'>${m.rejection.name || '.catch()'}</tspan>`
        }
        if (m.fulfillment) {
          return m.fulfillment.name || '.then()'
        }
        if (m.rejection) {
          return m.rejection.name || '.catch()'
        }
        return p._role
      })
  }

  function methodInfo (fn) {
    if (!fn) { return null }
    var name = fn.name ? fn.name + '()' : null
    var full = fn.toString().trim()
    if (full.length > 500) {
      full = full.slice(0, 500) + ' [...]'
    }
    if (fn.polyfetch) {
      full = null
    }
    return { full, name }
  }

  function pullMethods (p) {
    var metadata = meta.get(p)
    var status = metadata.blockers ? 'blocked' : states[p._state]
    return block(status, null, 'tt-state tt-' + status) + getCode(p)
  }

  function spellOut (p) {
    if (p._role === '[reject]') {
      return 'Rejected with: ' + tryParse(p._result)
    }
    if (p._state === FULFILLED) {
      return 'Resolved with: ' + tryParse(p._result)
    }
    if (p._role === '[all]' || p._role === '[race]') {
      return 'Waiting on: ' + toStateText(p._parents.reduce(toStateBuckets, {}))
    }
    return '???'
  }
  function toStateBuckets (buckets, p) {
    buckets[p._state] = buckets[p._state] || 0
    buckets[p._state]++
    return buckets
  }
  function toStateText (buckets) {
    var text = []
    if (buckets[PENDING]) {
      text.push(buckets[PENDING] + ' pending promise' + pluralize(buckets[PENDING]))
    }
    if (buckets[REJECTED]) {
      text.push(buckets[REJECTED] + ' rejected promise' + pluralize(buckets[REJECTED]))
    }
    if (buckets[FULFILLED]) {
      text.push(buckets[FULFILLED] + ' fulfilled promise' + pluralize(buckets[FULFILLED]))
    }
    return text.join(', ')
    function pluralize (count) {
      return count === 1 ? '' : 's'
    }
  }
  function tryParse (result) {
    try {
      if (typeof result === 'function') {
        let info = methodInfo(result)
        return info.full || info.name
      }
      return JSON.stringify(result, null, 2)
    } catch (e) {
      return `error {${e.message}}`
    }
  }

  function getCode (p) {
    var m = meta.get(p)
    if (m.resolver) {
      return block('Resolver', m.resolver, 'tt-resolver')
    }
    if (m.fulfillment && m.rejection) {
      return (
        block('Fulfillment', m.fulfillment, 'tt-fulfillment') +
        block('Rejection', m.rejection, 'tt-rejection')
      )
    }
    if (m.fulfillment) {
      return block('Fulfillment', m.fulfillment, 'tt-fulfillment')
    }
    if (m.rejection) {
      return block('Rejection', m.rejection, 'tt-rejection')
    }
    return block(p._role, { name: spellOut(p) }, 'tt-' + p._role.replace(/^\[|\]$/g, ''))
  }

  function block (name, method, classes) {
    return `<article class='tt-wrapper ${classes}'>
      <header class='tt-header'>${name}</header>
      ${method && `<pre class='tt-code'><code>${method.full || method.name}</code></pre>` || ''}
    </article>`
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

  function over (e) {
    var target = e.target
    while (target) {
      if (svg[0][0] === target) {
        return true
      }
      target = target.parentElement
    }
  }

  function getScroll (scrollProp, offsetProp) {
    if (typeof global[offsetProp] !== 'undefined') {
      return global[offsetProp]
    }
    var documentElement = document.documentElement
    if (documentElement.clientHeight) {
      return documentElement[scrollProp]
    }
    var body = document.body
    return body[scrollProp]
  }
}

export default visualizer
