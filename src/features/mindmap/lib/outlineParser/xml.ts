// A tolerant reader for the few OOXML pieces the outline parser needs (pure, no DOM, so it runs the
// same in the browser and in tests). Word and PowerPoint XML is machine-written and regular; elements
// are found by their tags, attributes read by name. Anything unexpected is simply skipped.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

const esc = (tag: string) => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Every <tag …>…</tag> (and self-closing <tag …/>) in `xml`, outermost first, not nested in itself.
export function elements(xml: string, tag: string): string[] {
  const re = new RegExp(`<${esc(tag)}(?=[\\s/>])[^>]*?(?:/>|>[\\s\\S]*?</${esc(tag)}>)`, 'g')
  return xml.match(re) ?? []
}

// The first <tag …> start tag (or self-closing tag) in `xml`, or null.
export function startTag(xml: string, tag: string): string | null {
  const m = new RegExp(`<${esc(tag)}(?=[\\s/>])[^>]*>`).exec(xml)
  return m ? m[0] : null
}

// An attribute of a start tag (`name` may carry a prefix: "w:val").
export function attr(tag: string | null, name: string): string | undefined {
  if (!tag) return undefined
  const m = new RegExp(`\\s${esc(name)}="([^"]*)"`).exec(tag)
  return m ? decodeXml(m[1]) : undefined
}

// The text inside every <tag>…</tag> (e.g. w:t, a:t), decoded and joined.
export function texts(xml: string, tag: string): string {
  const re = new RegExp(`<${esc(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(tag)}>`, 'g')
  let out = ''
  for (const m of xml.matchAll(re)) out += decodeXml(m[1])
  return out
}

// A boolean OOXML property: <w:b/>, <w:b w:val="1"/>, b="1" … ("0" / "false" / "off" = no).
export function onOff(value: string | undefined, present: boolean): boolean {
  if (!present) return false
  if (value === undefined) return true
  return !['0', 'false', 'off'].includes(value.toLowerCase())
}
