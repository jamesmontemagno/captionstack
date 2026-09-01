import type { EditableCue } from './converter'
import type { FormatId } from './converter'

export interface SavedCaption {
  id: string
  name: string
  sourceFormat: FormatId
  outputFormat?: FormatId
  cues: EditableCue[]
  size: number
  updatedAt: number
}

const DATABASE_NAME = 'captionstack'
const DATABASE_VERSION = 1
const STORE_NAME = 'saved-captions'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Saved captions are not supported in this browser.'))
      return
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open saved captions.'))
  })
}

export async function listSavedCaptions(): Promise<SavedCaption[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      database.close()
      resolve((request.result as SavedCaption[]).sort((a, b) => b.updatedAt - a.updatedAt))
    }
    request.onerror = () => {
      database.close()
      reject(request.error ?? new Error('Could not read saved captions.'))
    }
  })
}

export async function saveCaption(caption: SavedCaption): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(caption)
    request.onsuccess = () => { database.close(); resolve() }
    request.onerror = () => {
      database.close()
      reject(request.error ?? new Error('Could not save captions.'))
    }
  })
}

export async function deleteSavedCaption(id: string): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id)
    request.onsuccess = () => { database.close(); resolve() }
    request.onerror = () => {
      database.close()
      reject(request.error ?? new Error('Could not delete saved captions.'))
    }
  })
}
