import type { FormatId } from '../converter'

export interface FormatInfo {
  id: FormatId
  name: string
  extension: string
  /** One-sentence summary for titles and meta descriptions. */
  summary: string
  /** Two or three sentences for the "About" block on format pages. */
  about: string
  usedBy: string[]
  /** Notes about what is kept or lost when converting to/from this format. */
  conversionNotes: string
  sample: string
}

export const FORMAT_INFO: Record<FormatId, FormatInfo> = {
  srt: {
    id: 'srt',
    name: 'SubRip',
    extension: '.srt',
    summary: 'SubRip (.srt) is the most widely supported subtitle format, using numbered cues with comma-separated millisecond timestamps.',
    about: 'SRT files are plain text: a sequence number, a start and end time written as HH:MM:SS,mmm, and one or more lines of caption text. Almost every video player, editing suite, and social platform accepts SRT, which makes it the safest interchange format when you are not sure what a tool supports.',
    usedBy: ['VLC and most desktop players', 'YouTube, Vimeo, LinkedIn, and Facebook uploads', 'Premiere Pro, DaVinci Resolve, and Final Cut Pro'],
    conversionNotes: 'SRT carries timing and text only. Styling, positioning, and speaker metadata from richer formats are dropped; cue identifiers are replaced with sequence numbers.',
    sample: '1\n00:00:01,000 --> 00:00:04,200\nCaption files, meet your new converter.',
  },
  vtt: {
    id: 'vtt',
    name: 'WebVTT',
    extension: '.vtt',
    summary: 'WebVTT (.vtt) is the W3C caption format for HTML5 video, with a WEBVTT header and dot-separated millisecond timestamps.',
    about: 'WebVTT is the native caption format for the HTML5 <track> element and for most web players, including Video.js, Plyr, and HLS streams. It looks similar to SRT but requires a WEBVTT header, uses a period before the milliseconds, and supports optional cue identifiers, positioning settings, and styling.',
    usedBy: ['HTML5 <video> <track> elements', 'HLS and DASH streaming manifests', 'Vimeo, Wistia, and most web video platforms'],
    conversionNotes: 'Cue identifiers are preserved when the source has them. Positioning and styling settings are not carried from other formats, and VTT NOTE, STYLE, and REGION blocks are skipped on import.',
    sample: 'WEBVTT\n\n00:00:01.000 --> 00:00:04.200\nCaption files, meet your new converter.',
  },
  sbv: {
    id: 'sbv',
    name: 'YouTube SBV',
    extension: '.sbv',
    summary: 'SBV (.sbv) is YouTube’s compact caption format: a comma-separated start and end time followed by the caption text.',
    about: 'SBV files come from YouTube’s caption editor and its legacy download option. Each cue is just a timing line such as 0:00:01.000,0:00:04.200 followed by the text, with no sequence numbers or header, which makes them small but poorly supported outside YouTube.',
    usedBy: ['YouTube Studio caption downloads', 'Older YouTube caption uploads'],
    conversionNotes: 'SBV stores timing and text only, so converting to SBV drops cue identifiers. Converting from SBV is lossless.',
    sample: '0:00:01.000,0:00:04.200\nCaption files, meet your new converter.',
  },
  lrc: {
    id: 'lrc',
    name: 'LRC',
    extension: '.lrc',
    summary: 'LRC (.lrc) is the timestamped lyrics format used by music players, with [mm:ss.xx] tags at the start of each line.',
    about: 'LRC was designed for synchronized lyrics rather than video captions. Each line begins with one or more [mm:ss.xx] tags marking when the line should appear; the line stays visible until the next tag. Music apps and karaoke tools read LRC, and it works well for short, single-line captions.',
    usedBy: ['Music players such as foobar2000, Poweramp, and Musicbee', 'Karaoke and lyric-display apps', 'Podcast and audiobook transcript tools'],
    conversionNotes: 'LRC has no end times, so the end of each cue becomes the start of the next (or three seconds after the last). Multi-line cues are joined into a single line when exporting to LRC.',
    sample: '[00:01.00]Caption files, meet your new converter.\n[00:04.60]Everything happens privately in your browser.',
  },
  ttml: {
    id: 'ttml',
    name: 'TTML',
    extension: '.ttml',
    summary: 'TTML (.ttml, .xml) is the XML-based Timed Text Markup Language used in broadcast, IMSC, and streaming delivery.',
    about: 'Timed Text Markup Language is a W3C XML format for captions and subtitles. It underpins broadcast standards such as EBU-TT and IMSC and is required by many streaming platforms and accessibility regulations. Each <p> element carries begin and end (or dur) attributes and the caption text.',
    usedBy: ['Netflix, Amazon, and other streaming deliveries (IMSC/TTML)', 'Broadcast workflows (EBU-TT, SMPTE-TT)', 'Media asset management systems'],
    conversionNotes: 'Text, timing, and xml:id identifiers are converted. Styles, regions, and layout metadata are not preserved, and inline <span> formatting is flattened to plain text with <br/> becoming line breaks.',
    sample: '<tt xmlns="http://www.w3.org/ns/ttml">\n  <body><div>\n    <p begin="00:00:01.000" end="00:00:04.200">Caption files, meet your new converter.</p>\n  </div></body>\n</tt>',
  },
  json: {
    id: 'json',
    name: 'JSON',
    extension: '.json',
    summary: 'JSON (.json) captions store each cue as an object with start, end, and text values, ideal for apps and pipelines.',
    about: 'JSON is the easiest format to consume from code. CaptionStack reads an array of cue objects or an object with a cues array, accepts timestamps as milliseconds or time strings, and writes a versioned document with millisecond start and end values so you can load captions straight into a web app, database, or analytics pipeline.',
    usedBy: ['Custom web players and apps', 'Transcription and speech-to-text APIs', 'Data analysis and search indexing'],
    conversionNotes: 'Lossless for timing, text, and identifiers. Timestamps are exported as integer milliseconds.',
    sample: '{\n  "version": 1,\n  "cues": [\n    { "id": "1", "start": 1000, "end": 4200, "text": "Caption files, meet your new converter." }\n  ]\n}',
  },
  csv: {
    id: 'csv',
    name: 'CSV',
    extension: '.csv',
    summary: 'CSV (.csv) captions put id, start, end, and text in spreadsheet columns for review, translation, and bulk editing.',
    about: 'A CSV export opens directly in Excel, Google Sheets, or Numbers, which makes it the most practical way to proofread captions, hand them to a translator, or run find-and-replace across hundreds of cues. CaptionStack reads any CSV with start, end, and text columns and writes id,start,end,text with proper quoting.',
    usedBy: ['Excel, Google Sheets, and Numbers', 'Translation and localization handoffs', 'QA and review spreadsheets'],
    conversionNotes: 'Timing, text, and identifiers round-trip. Line breaks inside a cue are preserved inside quoted cells.',
    sample: 'id,start,end,text\n1,00:00:01.000,00:00:04.200,"Caption files, meet your new converter."',
  },
  txt: {
    id: 'txt',
    name: 'Plain text',
    extension: '.txt',
    summary: 'Plain text (.txt) exports a clean transcript with one cue per paragraph and no timestamps.',
    about: 'A plain-text transcript is what you want for blog posts, show notes, accessibility documents, or feeding text into a search index or language model. CaptionStack strips all timing and writes each cue as its own paragraph. Importing a .txt file assigns three-second cues so you can add real timing in the editor.',
    usedBy: ['Blog posts, show notes, and documentation', 'Search indexing and AI summarization', 'Accessibility transcripts'],
    conversionNotes: 'Exporting to TXT intentionally drops timing and identifiers. Importing TXT creates evenly spaced three-second cues.',
    sample: 'Caption files, meet your new converter.\n\nEverything happens privately in your browser.',
  },
}
