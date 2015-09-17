import assign from 'assignment'
import raf from 'raf'
import computedStyle from 'computed-style'
import gifshot from 'gifshot'

function vectorcam (svg, options={}) {
  var props = [ // copied from classes through computed-style
    'background-color',
    'color',
    'dominant-baseline',
    'fill',
    'font-family',
    'font-size',
    'opacity',
    'r',
    'stroke',
    'stroke-dasharray',
    'stroke-width',
    'text-anchor'
  ]
  var defaults = {
    fps: 4
  }
  var o = assign({}, defaults, options)
  var frames = []
  var recording = false
  var lastCapture = -Infinity
  var captureInterval = 1000 / o.fps
  var cam = {
    get frames () { return frames },
    get recording () { return recording },
    start () {
      cam.reset()
      recording = true
      raf(record)
      return cam
    },
    stop (done) {
      var rect = svg.getBoundingClientRect()
      var width = rect.width
      var height = rect.height

      recording = false
      frames = frames.map(f => f // resize all frames to final width and height
        .replace(/width="\d+"/, `width="${width}"`)
        .replace(/height="\d+"/, `height="${height}"`)
      )

      if (!done) {
        return
      }
      var options = {
        images: frames,
        gifWidth: width,
        gifHeight: height
      }
      gifshot.createGIF(options, res => done(res.error, res.image))
      return cam
    },
    reset () {
      frames = []
      cam.pause()
      return cam
    },
    pause () {
      recording = false
      return cam
    },
    resume () {
      recording = true
      return cam
    }
  }

  return cam

  function record (diff) {
    if (diff - lastCapture > captureInterval) {
      lastCapture = diff
      capture()
    }
    if (recording) {
      raf(record)
    }
  }

  function capture () {
    var mirror = svg.cloneNode(true)
    document.body.appendChild(mirror);
    [...mirror.querySelectorAll('*')].forEach(el => {
      props.forEach(prop => el.style[prop] = computedStyle(el, prop))
    })
    var serialized = new XMLSerializer().serializeToString(mirror)
    frames.push('data:image/svg+xml;utf8,' + serialized)
    document.body.removeChild(mirror)
  }
}

export default vectorcam
