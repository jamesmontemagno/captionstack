import { getFormat, type FormatId } from './converter'
import { FORMAT_INFO } from './seo/formatInfo'
import { POPULAR_CONVERSIONS, routePath, type Route } from './seo/routes'

function FormatLinks({ current }: { current?: FormatId }) {
  return (
    <ul className="seo-link-grid" aria-label="All caption formats">
      {Object.values(FORMAT_INFO).map((info) => (
        <li key={info.id}>
          <a href={routePath({ kind: 'format', format: info.id })} aria-current={info.id === current ? 'page' : undefined}>
            <span className="format-extension">{info.extension}</span>
            <span><strong>{info.name}</strong><small>{getFormat(info.id).description}</small></span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function ConversionLinks({ pairs, title, current }: { pairs: Array<[FormatId, FormatId]>; title: string; current?: Route }) {
  return (
    <>
      <h3>{title}</h3>
      <ul className="seo-chip-list">
        {pairs.map(([from, to]) => {
          const isCurrent = current?.kind === 'convert' && current.from === from && current.to === to
          return (
            <li key={`${from}-${to}`}>
              <a href={routePath({ kind: 'convert', from, to })} aria-current={isCurrent ? 'page' : undefined}>
                {from.toUpperCase()} <span aria-hidden="true">→</span><span className="visually-hidden"> to </span> {to.toUpperCase()}
              </a>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Faq({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="seo-faq">
      {items.map(([question, answer]) => (
        <div key={question}>
          <dt>{question}</dt>
          <dd>{answer}</dd>
        </div>
      ))}
    </dl>
  )
}

function FormatPage({ format }: { format: FormatId }) {
  const info = FORMAT_INFO[format]
  const others = Object.keys(FORMAT_INFO).filter((id) => id !== format) as FormatId[]
  return (
    <>
      <div className="seo-prose">
        <h2>About {info.name} ({info.extension}) files</h2>
        <p>{info.about}</p>
        <h3>Where {info.extension} is used</h3>
        <ul>{info.usedBy.map((item) => <li key={item}>{item}</li>)}</ul>
        <h3>What a {info.extension} file looks like</h3>
        <pre><code>{info.sample}</code></pre>
        <h3>What converts and what doesn’t</h3>
        <p>{info.conversionNotes}</p>
      </div>
      <ConversionLinks title={`Convert ${format.toUpperCase()} to…`} pairs={others.map((to) => [format, to])} />
      <ConversionLinks title={`Convert to ${format.toUpperCase()} from…`} pairs={others.map((from) => [from, format])} />
      <h3>All caption formats</h3>
      <FormatLinks current={format} />
    </>
  )
}

function ConvertPage({ from, to }: { from: FormatId; to: FormatId }) {
  const source = FORMAT_INFO[from]
  const target = FORMAT_INFO[to]
  const FROM = from.toUpperCase()
  const TO = to.toUpperCase()
  return (
    <>
      <div className="seo-prose">
        <h2>How to convert {FROM} to {TO}</h2>
        <ol>
          <li>Drop your {source.extension} file into the converter above, or click to browse. Several files at once become a ZIP.</li>
          <li>Check the quality report and fix timing or text in the editor if you need to.</li>
          <li>{TO} is already selected as the output format. Click <strong>Download converted file</strong>.</li>
        </ol>
        <p>Conversion happens entirely in your browser. Nothing is uploaded, no account is needed, and there is no file count limit.</p>
        <h3>About {source.name} ({source.extension})</h3>
        <p>{source.about}</p>
        <h3>About {target.name} ({target.extension})</h3>
        <p>{target.about}</p>
        <h3>What changes when converting {FROM} to {TO}</h3>
        <p>{target.conversionNotes}</p>
        <h3>Frequently asked questions</h3>
        <Faq
          items={[
            [`Is this ${FROM} to ${TO} converter free?`, 'Yes. CaptionStack is free and open source, with no limits on file count or conversions.'],
            ['Are my caption files uploaded anywhere?', 'No. Parsing and conversion run in your browser using a local Web Worker. Your files never leave your device.'],
            [`Can I edit the captions before exporting to ${TO}?`, 'Yes. After import, open the editor to adjust start and end times, fix text, split, merge, or reorder cues. The quality report flags overlaps, short cues, and fast reading speeds with one-click fixes.'],
            [`Can I convert many ${source.extension} files to ${target.extension} at once?`, 'Yes. Drop multiple files and download all of the results as a single ZIP archive.'],
          ]}
        />
      </div>
      <ConversionLinks title={`Other ${FROM} conversions`} pairs={(Object.keys(FORMAT_INFO) as FormatId[]).filter((id) => id !== from).map((other) => [from, other])} current={{ kind: 'convert', from, to }} />
      <ConversionLinks title={`Other ways to get ${TO}`} pairs={(Object.keys(FORMAT_INFO) as FormatId[]).filter((id) => id !== to).map((other) => [other, to])} current={{ kind: 'convert', from, to }} />
      <h3>All caption formats</h3>
      <FormatLinks />
    </>
  )
}

function HomeLinks() {
  return (
    <>
      <ConversionLinks title="Popular conversions" pairs={POPULAR_CONVERSIONS} />
      <h3>Caption formats</h3>
      <FormatLinks />
    </>
  )
}

function LandingContent({ route }: { route: Route }) {
  return (
    <section className="seo-content" aria-label="Format guides and conversions">
      {route.kind === 'home' && <HomeLinks />}
      {route.kind === 'format' && <FormatPage format={route.format} />}
      {route.kind === 'convert' && <ConvertPage from={route.from} to={route.to} />}
    </section>
  )
}

export default LandingContent
