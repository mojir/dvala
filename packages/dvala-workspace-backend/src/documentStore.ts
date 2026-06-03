import type {
  BackendAccepted,
  BackendDocumentSyncResult,
  BackendDocumentVersion,
  BackendPersistFileRequest,
  BackendRemoveFileRequest,
  BackendResyncRequired,
  BackendTextDocument,
  BackendWorkspaceSnapshotFile,
} from './requests'

export type BackendOpenDocument = BackendTextDocument

export interface BackendDocumentStore {
  open(document: BackendOpenDocument): void
  update(document: BackendOpenDocument, previousVersion: BackendDocumentVersion): BackendDocumentSyncResult
  close(path: string): void
  persistFile(request: BackendPersistFileRequest): void
  removeFile(request: BackendRemoveFileRequest): void
  getOpenDocuments(): readonly BackendOpenDocument[]
  getOpenDocument(path: string): BackendOpenDocument | undefined
  getWorkspaceDocument(path: string): BackendWorkspaceSnapshotFile | undefined
  getWorkspaceSnapshot(): readonly BackendWorkspaceSnapshotFile[]
  getEffectiveSource(path: string): string | undefined
}

const accepted: BackendAccepted = { ok: true }

function resyncRequired(path: string): BackendResyncRequired {
  return {
    ok: false,
    error: {
      kind: 'resync-required',
      path,
    },
  }
}

export function createInMemoryDocumentStore(): BackendDocumentStore {
  const openDocuments = new Map<string, BackendOpenDocument>()
  const workspaceSnapshot = new Map<string, BackendWorkspaceSnapshotFile>()

  return {
    open(document: BackendOpenDocument): void {
      const current = openDocuments.get(document.path)
      if (current && current.version > document.version) return
      openDocuments.set(document.path, document)
    },

    update(document: BackendOpenDocument, previousVersion: BackendDocumentVersion): BackendDocumentSyncResult {
      const current = openDocuments.get(document.path)
      if (!current || current.version !== previousVersion) {
        return resyncRequired(document.path)
      }
      if (document.version < current.version) {
        return accepted
      }
      openDocuments.set(document.path, document)
      return accepted
    },

    close(path: string): void {
      openDocuments.delete(path)
    },

    persistFile(request: BackendPersistFileRequest): void {
      workspaceSnapshot.set(request.file.path, request.file)
    },

    removeFile(request: BackendRemoveFileRequest): void {
      workspaceSnapshot.delete(request.path)
    },

    getOpenDocuments(): readonly BackendOpenDocument[] {
      return [...openDocuments.values()]
    },

    getOpenDocument(path: string): BackendOpenDocument | undefined {
      return openDocuments.get(path)
    },

    getWorkspaceDocument(path: string): BackendWorkspaceSnapshotFile | undefined {
      return workspaceSnapshot.get(path)
    },

    getWorkspaceSnapshot(): readonly BackendWorkspaceSnapshotFile[] {
      return [...workspaceSnapshot.values()]
    },

    getEffectiveSource(path: string): string | undefined {
      const openDocument = openDocuments.get(path)
      if (openDocument) return openDocument.source
      return workspaceSnapshot.get(path)?.code
    },
  }
}
