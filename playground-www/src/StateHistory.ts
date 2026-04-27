export interface HistoryStatus {
  canUndo: boolean
  canRedo: boolean
}

export interface HistoryEntry {
  text: string
  selectionStart: number
  selectionEnd: number
}

interface SerializedStateHistory {
  history: HistoryEntry[]
  index: number
}

export class StateHistory {
  private history: HistoryEntry[] = []
  private index: number
  private listener: (status: HistoryStatus) => void
  private lastStatus: HistoryStatus = { canUndo: false, canRedo: false }
  constructor(
    initial: HistoryEntry,
    listener: (status: HistoryStatus) => void,
    private readonly maxEntries = Number.POSITIVE_INFINITY,
  ) {
    this.history.push(initial)
    this.index = 0
    this.listener = listener
  }

  private get canUndo() {
    return this.index > 0
  }

  private get canRedo() {
    return this.index < this.history.length - 1
  }

  private get current(): HistoryEntry {
    return this.history[this.index]!
  }

  public push(entry: HistoryEntry) {
    if (entry.text !== this.current.text) {
      this.history.splice(this.index + 1)
      this.history.push(entry)
      this.trimToMaxEntries()
      this.index = this.history.length - 1
      this.notify()
    } else {
      this.replace(entry)
    }
  }

  private replace(entry: HistoryEntry) {
    this.current.text = entry.text
    this.current.selectionStart = entry.selectionStart
    this.current.selectionEnd = entry.selectionEnd
    this.notify()
  }

  public undo(): HistoryEntry {
    if (!this.canUndo) throw new Error('Cannot undo')
    this.index -= 1
    this.notify()
    return this.history[this.index]!
  }

  public redo(): HistoryEntry {
    if (!this.canRedo) throw new Error('Cannot redo')
    this.index += 1
    this.notify()
    return this.current
  }

  peek(): HistoryEntry {
    return this.current
  }

  getStatus(): HistoryStatus {
    return { canUndo: this.canUndo, canRedo: this.canRedo }
  }

  setListener(listener: (status: HistoryStatus) => void) {
    this.listener = listener
    this.notify()
  }

  reset(initialState: HistoryEntry) {
    this.history = [initialState]
    this.index = 0
    this.notify()
  }

  hydrate(serialized: SerializedStateHistory | undefined, fallbackInitialState: HistoryEntry) {
    if (!serialized || serialized.history.length === 0) {
      this.reset(fallbackInitialState)
      return
    }

    this.history = serialized.history.map(entry => ({ ...entry }))
    this.trimToMaxEntries()
    this.index = Math.min(Math.max(serialized.index, 0), this.history.length - 1)
    this.notify()
  }

  serialize(): SerializedStateHistory {
    return {
      history: this.history.map(entry => ({ ...entry })),
      index: this.index,
    }
  }

  private trimToMaxEntries() {
    if (this.history.length <= this.maxEntries) return

    const overflow = this.history.length - this.maxEntries
    this.history.splice(0, overflow)
    this.index = Math.max(0, this.index - overflow)
  }

  notify() {
    const status = this.getStatus()
    if (status.canUndo !== this.lastStatus.canUndo || status.canRedo !== this.lastStatus.canRedo) {
      this.lastStatus = status
      setTimeout(() => this.listener(status), 0)
    }
  }
}
