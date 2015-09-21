var tag = 'script'

function loadScript (url, done) {
  var first = document.getElementsByTagName(tag)[0]
  var script = document.createElement(tag)
  script.async = true
  script.src = url
  if (done) { script.onload = done }
  first.parentNode.insertBefore(script, first)
  return script
}

export default loadScript
