const TRACKING_URL = 'https://zaicargo.controlbox.net/app/rastreo/rastreo.asp?I='

const decodeHtml = (value) => {
  if (!value) {
    return ''
  }
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

const cleanText = (value) =>
  decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())

const stripJsComments = (value) =>
  String(value || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const looksLikeTemplateText = (value) => {
  if (!value) {
    return false
  }
  return (
    /(?:\bDato\.|\bvalor\.|\bdat\[\d+\]|\bNgui\b|\bNumeroGuia\b|\bComentarios\b|\bdescripcion\b|\bfecha\b|\bhora\b)/i.test(
      value
    ) || /\+/.test(value)
  )
}

const hasDigits = (value) => /\d/.test(value || '')

const extractStatuses = (html) => {
  const results = []
  const startRegex = /<div\b[^>]*class=["'][^"']*widget-activity-item[^"']*["'][^>]*>/gi
  let match = startRegex.exec(html)

  while (match) {
    const startIndex = match.index
    let cursor = match.index + match[0].length
    let depth = 1
    const tagRegex = /<\/?div\b[^>]*>/gi
    tagRegex.lastIndex = cursor

    while (depth > 0) {
      const tagMatch = tagRegex.exec(html)
      if (!tagMatch) {
        cursor = html.length
        break
      }
      if (tagMatch[0].startsWith('</')) {
        depth -= 1
      } else {
        depth += 1
      }
      cursor = tagRegex.lastIndex
    }

    const block = html.slice(startIndex, cursor)
    const cellMatches = [
      ...block.matchAll(/<div\b[^>]*class=["'][^"']*tbl-cell[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi),
    ]

    if (cellMatches.length >= 2) {
      const cellHtml = cellMatches[1][1]
      const pMatches = [...cellHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]

      if (pMatches.length) {
        const spanMatches = [...pMatches[0][1].matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)]
        const timestamp = spanMatches[0] ? cleanText(spanMatches[0][1]) : ''
        const status = spanMatches[1] ? cleanText(spanMatches[1][1]) : ''
        const detail = pMatches[1] ? cleanText(pMatches[1][1]) : ''

        if (
          timestamp &&
          hasDigits(timestamp) &&
          !looksLikeTemplateText(timestamp) &&
          !looksLikeTemplateText(status) &&
          !looksLikeTemplateText(detail)
        ) {
          results.push({ timestamp, status, detail })
        }
      }
    }

    startRegex.lastIndex = cursor
    match = startRegex.exec(html)
  }

  return results
}

const extractTrackingJson = (html) => {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
  const script = scripts
    .map((match) => match[1])
    .find((txt) => txt.includes('AjaxBasicRequestPOSTSE') && txt.includes('JSON.parse'))
  if (!script) {
    throw new Error('Could not find AjaxBasicRequestPOSTSE script block')
  }
  const uncommentedScript = stripJsComments(script)
  const match = uncommentedScript.match(/JSON\.parse\("([\s\S]*?)"\)/)
  if (!match) {
    throw new Error('Could not find JSON.parse("...") in script')
  }
  const raw = match[1]
  const jsonText = JSON.parse(`"${raw}"`)
  return JSON.parse(jsonText)
}

const trackingToSimpleStatus = (events, trackingNumber) => ({
  shipping: trackingNumber || (events[0]?.shipping ?? null),
  last_status: events[0] ?? null,
  events,
})

export default async function handler(req, res) {
  const tracking = String(req.query?.tracking || '').trim()
  if (!tracking) {
    res.status(400).json({ error: 'Falta el número de seguimiento.' })
    return
  }

  try {
    const body = new URLSearchParams({
      nrogui: tracking,
      Submit: 'Buscar',
      ffw: '00001',
    })

    const response = await fetch(TRACKING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Next.js Tracker)',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      throw new Error(`La solicitud de seguimiento falló (${response.status}).`)
    }

    const html = await response.text()
    let data = extractStatuses(html)
    if (!data.length) {
      try {
        data = extractTrackingJson(html)
      } catch {
        data = []
      }
    }
    const result = trackingToSimpleStatus(data, tracking)
    res.status(200).json(result)
  } catch (error) {
    res
      .status(500)
      .json({ error: error.message || 'No se pudo interpretar la respuesta de seguimiento.' })
  }
}
