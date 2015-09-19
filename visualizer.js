'use strict'

import $ from 'dominus'
import d3 from 'd3'
import raf from 'raf'
import sum from 'hash-sum'
import clone from 'lodash/lang/cloneDeep'
import emitter from 'contra/emitter'
import queue from 'contra/queue'
import promisees from './lib'
var PENDING = void 0
var FULFILLED = 1
var REJECTED = 2
var states = {
  [PENDING]: 'pending',
  [FULFILLED]: 'fulfilled',
  [REJECTED]: 'rejected'
}

function visualizer (result, options = {}) {
  if (result === false) {
    return
  }

  var frameByFrame
  var historyFrame
  var history = []
  var promises = []
  var selector = '.ly-output'
  var parent = $.findOne(selector)
  var renderer = queue(pace)

  $(selector).find('*').remove()

  var svg = d3
    .select(selector)
    .append('svg')
    .attr('class', 'ly-svg')
    .style('background-color', '#ecf0f1')

  var tip = d3
    .select(selector)
    .append('div')
    .attr('class', 'tt-container')

  promisees.off()
  promisees.on('construct', add)
  promisees.on('blocked', (p, parent) => {
    blocked(p, parent); persist()
  })
  promisees.on('state', state)

  var visualization = emitter({
    first () {
      frameByFrame = true
      draw(history[0])
    },
    prev () {
      frameByFrame = true
      draw(previousSnapshot())
    },
    next () {
      frameByFrame = true
      draw(history[historyIndex() + 1])
    },
    last () {
      frameByFrame = true
      draw(history[history.length - 1])
    },
    history,
    get historyIndex () { return historyIndex() }
  })

  return visualization

  function previousSnapshot () {
    return history[historyIndex() - 1]
  }
  function historyIndex () {
    return history.indexOf(historyFrame)
  }
  function promiseInTime (mutable) {
    return historyFrame.ids[mutable._id]
  }

  function add (p) {
    p.meta = {
      blockers: 0,
      blocking: [],
      resolver: methodInfo(p._resolver),
      fulfillment: methodInfo(p._fulfillment),
      rejection: methodInfo(p._rejection)
    }
    promises.push(p)
    persist()
    raf(() => blockcheck(p))
  }

  function state (p) {
    unblock(p)
    persist()
  }

  function blockcheck (p) {
    if (p._role !== '[all]' && p._role !== '[race]') {
      return
    }
    if (p._state === PENDING) {
      let blocks = 0
      p._parents.forEach(parent => {
        if (parent._state === PENDING) {
          blocked(p, parent)
          blocks++
        }
      })
      if (blocks) {
        persist()
      }
    }
  }

  function blocked (p, blocker) {
    p.meta.blockers++
    blocker.meta.blocking.push([p, true])
  }

  function unblock (p) {
    p.meta.blocking.filter(([p, on]) => on).forEach((vector, i) => {
      var [p] = vector
      var m = p.meta
      if (p._role === '[race]' && !m.raceEnded) {
        m.raceEnded = true
        p._parents.filter(p => p._state === PENDING).forEach(unblock)
      }
      m.blockers--
      vector[1] = false
    })
  }

  function persist () {
    var last = history[history.length - 1]
    var snapshot = promises.map(clone)
    snapshot.ids = snapshot.reduce((acc, p) => (acc[p._id] = p, acc), {})
    snapshot.date = new Date()
    snapshot.offset = last ? snapshot.date - last.date + 1 : 0
    rematrix(snapshot)
    history.push(snapshot)
    renderer.unshift({ snapshot })
  }

  function pace ({ snapshot }, done) {
    setTimeout(paced, options.speed * snapshot.offset - snapshot.offset)
    function paced () {
      if (frameByFrame !== true) {
        draw(snapshot)
        visualization.emit('frame', snapshot)
      } else {
        renderer.pause()
      }
      done()
    }
  }

  function draw (snapshot) {
    historyFrame = snapshot

    var hash = sum(snapshot)
    var dots = svg
      .selectAll('g')
      .data(snapshot, identity.bind(null, previousSnapshot()))

    var dotEnter = dots
      .enter()
      .append('g')

    var circleEnter = dotEnter
      .append('circle')
      .attr('r', 45)

    renderDots()
    renderDotText()
    renderConnectors()
    renderBlockers()
    addTips()

    function renderDots () {
      dots
        .selectAll('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('class', p => `p-circle ${promiseInTime(p).meta.blockers ? 'p-blocked' : 'p-' + states[promiseInTime(p)._state]}`)

      dots
        .exit()
        .remove()
    }

    function renderDotText () {
      dotEnter
        .append('text')

      dots
        .selectAll('text')
        .attr('dx', x)
        .attr('dy', y)
        .attr('class', p => {
          var m = p.meta
          var dual = m.fulfillment && m.rejection
          return 'p-name' + (dual ? ' p-name-dual' : '')
        })
        .html(p => {
          var m = p.meta
          if (m.resolver) {
            return m.resolver.name || 'new()'
          }
          if (m.fulfillment && m.rejection) {
            return `<tspan dx='${x(p) - 30}' dy='${y(p) - 10}'>${m.fulfillment.name || '.then()'}</tspan><tspan dx='-60' dy='25'>${m.rejection.name || '.catch()'}</tspan>`
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

    function renderConnectors () {
      var connections = [].concat(...snapshot
        .filter(p => p._role !== '[all]' && p._role !== '[race]')
        .map(p => p._parents.map(parent => [p, parent]))
      )
      var connectors = svg
        .selectAll('.p-connector')
        .data(connections)

      connectors
        .enter()
        .insert('line', ':first-child')
        .attr('class', ([p, parent]) => `p-connector p-connector-${parent._id}-${p._id}`)

      connectors
        .attr('x1', ([p, parent]) => x(parent))
        .attr('y1', ([p, parent]) => y(parent))
        .attr('x2', ([p, parent]) => x(p))
        .attr('y2', ([p, parent]) => y(p))

      connectors
        .exit()
        .remove()
    }

    function identity (old, p) {
      var prev = old ? old.ids[p._id] : null
      if (!prev) {
        return hash + Math.random()
      }
      if (prev._state === p._state) {
        return p._id
      }
      return hash + Math.random()
    }

    function renderBlockers () {
      var vectors = [].concat(...snapshot.map(p => p.meta.blocking
        .filter(([blocker]) => blocker._id in snapshot.ids)
        .map(vector => [p, ...vector])
      ))
      var blockers = svg
        .selectAll('.p-blocker-arrow')
        .data(vectors, ([blocker, p]) => `${blocker._id}-${p._id}`)

      blockers
        .enter()
        .insert('line', ':first-child')

      blockers
        .attr('class', ([blocker, p, on]) => `p-blocker-arrow ${on ? '' : 'p-blocker-leftover'}`)
        .attr('x1', ([blocker]) => x(blocker))
        .attr('y1', ([blocker]) => y(blocker))
        .attr('x2', ([blocker, p]) => x(p))
        .attr('y2', ([blocker, p]) => y(p))

      blockers
        .exit()
        .remove()
    }

    function addTips () {
      circleEnter.on('mouseover', p => tip
        .html(pullMethods(p))
        .attr('class', 'tt-container tt-show')
      )
      svg.on('mousemove', p => {
        var r = tip.node().getBoundingClientRect()
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

      $('body')
        .off('mousemove')
        .on('mousemove', e => {
          if (over(e)) {
            return
          }
          tip.attr('class', 'tt-container')
        })
    }
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
    var status = p.meta.blockers ? 'blocked' : states[p._state]
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
    var m = p.meta
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

  function rematrix (snapshot) {
    snapshot.matrix = snapshot.reduce(reducer, [])
    function reducer (matrix, p) {
      if (p._parents.length) {
        let parent = p._parents[0]
        let depth = parentCount(p)
        let row = matrix
          .filter(row => row.some(col => col.map(p => p._id).indexOf(parent._id) !== -1))
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
      return matrix
      function assigned (p, row, depth) {
        p.meta.row = row
        p.meta.col = row[depth]
        row._id = matrix.indexOf(row)
      }
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

  function x (mutable) {
    var p = promiseInTime(mutable)
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

  function y (mutable) {
    var p = promiseInTime(mutable)
    var col = p.meta.col
    var col_index = col.map(p => p._id).indexOf(p._id) + 1
    var row_length = Math.max(...p.meta.row.map(col => col.length))
    var row_height = row_length * 100
    var accumulated = 0
    var level = historyFrame.matrix.findIndex(row => row._id === p.meta.row._id)
    var n = level
    while (n > 0) {
      n--
      accumulated += Math.max(...historyFrame.matrix[n].map(col => col.length)) * 100 + 50
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
      if (svg.node() === target) {
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
