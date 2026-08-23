/** Keys for the handful of preferences remembered between visits. Nothing about files is stored. */
export const STORAGE_KEYS = {
  theme: 'captionstack:theme',
  outputFormat: 'captionstack:output-format',
} as const

export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private mode or blocked storage: preferences simply don't persist.
  }
}

/**
 * Copies text to the clipboard, preferring the async Clipboard API and falling back to a
 * temporary textarea + execCommand for older browsers or non-secure contexts.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to the legacy path
    }
  }
  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  textarea.remove()
  return copied
}
