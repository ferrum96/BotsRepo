const API_BASE = '/api'

const get = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json())

export const api = {
  boards: {
    list: () => get(`${API_BASE}/boards`),
    get: (id: string) => get(`${API_BASE}/boards/${id}`),
    create: (data: { name: string }) =>
      fetch(`${API_BASE}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    update: (id: string, data: { name: string }) =>
      fetch(`${API_BASE}/boards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    delete: (id: string) =>
      fetch(`${API_BASE}/boards/${id}`, { method: 'DELETE' }).then(r => r.json()),
  },
  tasks: {
    create: (boardId: string, data: any) =>
      fetch(`${API_BASE}/${boardId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    update: (id: string, data: any) =>
      fetch(`${API_BASE}/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    delete: (id: string) =>
      fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' }).then(r => r.json()),
    move: (id: string, data: any) =>
      fetch(`${API_BASE}/tasks/${id}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
  },
  columns: {
    create: (boardId: string, data: any) =>
      fetch(`${API_BASE}/${boardId}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    update: (id: string, data: any) =>
      fetch(`${API_BASE}/columns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    delete: (id: string) =>
      fetch(`${API_BASE}/columns/${id}`, { method: 'DELETE' }).then(r => r.json()),
  },
  epics: {
    create: (boardId: string, data: any) =>
      fetch(`${API_BASE}/${boardId}/epics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    update: (id: string, data: any) =>
      fetch(`${API_BASE}/epics/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    delete: (id: string) =>
      fetch(`${API_BASE}/epics/${id}`, { method: 'DELETE' }).then(r => r.json()),
  },
  labels: {
    create: (boardId: string, data: any) =>
      fetch(`${API_BASE}/${boardId}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    update: (id: string, data: any) =>
      fetch(`${API_BASE}/labels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    delete: (id: string) =>
      fetch(`${API_BASE}/labels/${id}`, { method: 'DELETE' }).then(r => r.json()),
  },
}
