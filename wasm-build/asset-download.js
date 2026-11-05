// Synchronous Worker lookups cannot reliably report intermediate byte progress.
// Keep a bounded timeout there; the host reserves one shared retry allowance.
;(function () {
  var remaining = 0
  var budgeted = false
  var sequence = 0
  var post = self.postMessage.bind(self)

  self.addEventListener('message', function (event) {
    var value = event.data && event.data.assetRetryBudget
    if (Number.isInteger(value) && value >= 0 && value <= 8) {
      remaining = value
      budgeted = true
    }
  })

  self.postMessage = function (message, transfer) {
    if (budgeted && message && typeof message === 'object' && 'result' in message) {
      message.assetRetriesRemaining = remaining
      remaining = 0
      budgeted = false
    }
    if (transfer === undefined) post(message)
    else post(message, transfer)
  }

  self.wasmtexDownloadAsset = function (url, asset) {
    if (typeof asset === 'number') asset = asset === 10 ? 'format' :
      [3, 4, 32, 33, 36, 47].indexOf(asset) !== -1 ? 'font' :
      [6, 7, 26].indexOf(asset) !== -1 ? 'package' : 'data'
    var id = ++sequence
    var retries = 0
    var bytes = 0
    function emit(phase, failure, status) {
      var event = {
        cmd: 'assetdownload', requestId: id, asset: asset, phase: phase,
        receivedBytes: bytes, lastByteAgeMs: bytes ? 0 : null, retryCount: retries,
      }
      if (failure) event.failure = failure
      if (status) event.status = status
      post(event)
    }
    while (true) {
      bytes = 0
      emit('start')
      var xhr = new XMLHttpRequest()
      var failure = null
      var status = 0
      try {
        xhr.open('GET', url, false)
        xhr.responseType = 'arraybuffer'
        xhr.timeout = 150000
        xhr.send()
        status = xhr.status
        bytes = xhr.response ? xhr.response.byteLength || 0 : 0
        if (status === 200) {
          var type = xhr.getResponseHeader('content-type') || ''
          if (/text\/html/i.test(type)) failure = 'invalid'
          else {
            emit('end')
            return xhr
          }
        } else if (status === 404) {
          emit('end', 'http', status)
          return xhr
        } else failure = status ? 'http' : 'network'
      } catch (error) {
        failure = error && error.name === 'TimeoutError' ? 'stalled' : 'network'
      }
      var retryable = failure === 'network' || failure === 'stalled' ||
        (failure === 'http' && (status === 408 || status === 429 || status >= 500))
      if (retryable && retries < 3 && remaining > 0) {
        remaining--
        retries++
        emit('retry', failure, status)
        continue
      }
      emit('end', failure, status)
      var error = new Error('TeX asset download failed: ' + failure + (status ? ' (' + status + ')' : ''))
      error.name = 'AssetDownloadError'
      error.failure = failure
      if (status) error.status = status
      throw error
    }
  }
})()
