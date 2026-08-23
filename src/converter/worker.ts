/// <reference lib="webworker" />
import { handleWorkerRequest, type WorkerRequest, type WorkerResponse } from './pipeline'

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const { id } = event.data
  try {
    const result = await handleWorkerRequest(event.data)
    const response: WorkerResponse = { id, ok: true, result }
    self.postMessage(response)
  } catch (caught) {
    const response: WorkerResponse = {
      id,
      ok: false,
      error: caught instanceof Error ? caught.message : 'This file could not be read.',
    }
    self.postMessage(response)
  }
})
