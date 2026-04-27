// Modal-panel construction and toast notifications.
// Other modal-flow code (pushPanel/popModal stack management, snapshot panels,
// info dialog) still lives in scripts.ts and will move here in follow-up
// extractions once their cross-concern callers are also moved out.

import { hamburgerIcon } from '../icons'
import { renderDvalaMarkdown } from '../renderDvalaMarkdown'
import { closeEffectHandlerMenus, popModal, pushPanel } from '../scripts'
import { elements } from './elements'
import { state } from './playgroundState'

export type ModalSize = 'small' | 'medium' | 'large'

export const modalSizeMap: Record<ModalSize, string> = {
  small: '480px',
  medium: '800px',
  large: '1200px',
}

interface ModalPanelOptions {
  title?: string
  icon?: string
  size?: ModalSize
  markdown?: string
  hamburgerItems?: { label: string; action: () => void }[]
  footerActions?: { label: string; primary?: boolean; action: () => void }[]
  noClose?: boolean
  onClose?: () => void
}

/** Build a standard modal panel: modal-header with breadcrumbs + optional hamburger, body div, footer div. */
export function createModalPanel(options?: ModalPanelOptions): {
  panel: HTMLElement
  body: HTMLElement
  footer: HTMLElement | null
} {
  const panel = document.createElement('div')
  panel.className = 'modal-panel'
  if (options?.size) {
    panel.dataset.size = options.size
  }
  if (options?.icon) {
    panel.dataset.icon = options.icon
  }

  const header = document.createElement('div')
  header.className = 'modal-header'

  const crumbs = document.createElement('div')
  crumbs.setAttribute('data-ref', 'breadcrumbs')
  crumbs.className = 'snapshot-panel__breadcrumbs'
  header.appendChild(crumbs)

  if (options?.hamburgerItems?.length) {
    const moreWrap = document.createElement('div')
    moreWrap.className = 'modal-header__more'

    const moreBtn = document.createElement('a')
    moreBtn.className = 'modal-header__more-btn'
    moreBtn.innerHTML = hamburgerIcon

    const menu = document.createElement('div')
    menu.className = 'modal-more-menu'

    options.hamburgerItems.forEach(item => {
      const a = document.createElement('a')
      a.textContent = item.label
      a.addEventListener('click', () => {
        menu.style.display = 'none'
        item.action()
      })
      menu.appendChild(a)
    })

    moreBtn.addEventListener('click', () => {
      closeEffectHandlerMenus()
      menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex'
    })

    moreWrap.appendChild(moreBtn)
    moreWrap.appendChild(menu)
    header.appendChild(moreWrap)
  }

  if (!options?.noClose) {
    const closeBtn = document.createElement('a')
    closeBtn.className = 'modal-header__close-btn'
    closeBtn.textContent = '✕'
    closeBtn.title = 'Close'
    closeBtn.addEventListener('click', () => (options?.onClose ? options.onClose() : popModal()))
    header.appendChild(closeBtn)
  }

  panel.appendChild(header)

  const body = document.createElement('div')
  body.className = 'modal-panel__body'
  if (options?.markdown) {
    body.innerHTML = `<div class="book-page">${renderDvalaMarkdown(options.markdown)}</div>`
  }
  panel.appendChild(body)

  let footer: HTMLElement | null = null
  if (options?.footerActions?.length) {
    footer = document.createElement('div')
    footer.className = 'modal-panel__footer'
    for (const action of options.footerActions) {
      const btn = document.createElement('button')
      btn.className = action.primary ? 'button button--primary' : 'button'
      btn.textContent = action.label
      btn.addEventListener('click', () => action.action())
      footer.appendChild(btn)
    }
    panel.appendChild(footer)
  }

  return { panel, body, footer }
}

const TOAST_DURATION = 4_000

export function showToast(message: string, options?: { severity?: 'info' | 'error' }) {
  const severity = options?.severity ?? 'info'
  const toast = document.createElement('div')
  toast.className = `toast toast-${severity}`

  const text = document.createElement('span')
  text.textContent = message
  toast.appendChild(text)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'toast-close'
  closeBtn.textContent = '\u00D7'
  closeBtn.addEventListener('click', () => dismissToast(toast))
  toast.appendChild(closeBtn)

  elements.toastContainer.prepend(toast)

  setTimeout(() => dismissToast(toast), TOAST_DURATION)
}

function dismissToast(toast: HTMLElement) {
  if (!toast.parentElement) return
  toast.style.animation = 'toast-out 0.2s ease forwards'
  toast.addEventListener('animationend', () => toast.remove())
}

export function showInfoModal(title: string, message: string, onConfirm?: () => void | Promise<void>): Promise<void> {
  const actions: ModalPanelOptions['footerActions'] = []
  if (onConfirm) {
    actions.push({ label: 'Cancel', action: () => dismissInfoModal() })
  }
  actions.push({ label: 'OK', primary: true, action: () => closeInfoModal() })

  const { panel, body } = createModalPanel({
    size: 'small',
    footerActions: actions,
  })

  const messageEl = document.createElement('div')
  messageEl.className = 'modal-body-row'
  messageEl.style.whiteSpace = 'pre-line'
  messageEl.textContent = message
  body.appendChild(messageEl)

  state.infoModalOnConfirm = onConfirm ?? null
  pushPanel(panel, title)

  return new Promise<void>(resolve => {
    state.resolveInfoModal = resolve
  })
}

export function closeInfoModal() {
  const onConfirm = state.infoModalOnConfirm
  state.resolveInfoModal?.()
  state.resolveInfoModal = null
  state.infoModalOnConfirm = null
  popModal()
  if (onConfirm) void onConfirm()
}

export function dismissInfoModal() {
  state.resolveInfoModal?.()
  state.resolveInfoModal = null
  state.infoModalOnConfirm = null
  popModal()
}

/** Slide in a "Save As" form panel within the snapshot modal. */
export function pushSavePanel(onSave: (name: string) => void) {
  const panel = document.createElement('div')
  panel.className = 'modal-panel'
  panel.innerHTML = `
    <div class="modal-header">
      <div data-ref="breadcrumbs" class="snapshot-panel__breadcrumbs"></div>
    </div>
    <div class="modal-panel__body" style="display:flex;flex-direction:column;gap:var(--space-2);">
      <label for="save-snapshot-name" class="snapshot-panel__section-label">Name (optional)</label>
      <input id="save-snapshot-name" type="text" class="readline-input" placeholder="My snapshot…" style="width:100%;box-sizing:border-box;">
    </div>
    <div class="modal-panel__footer">
      <button class="button cancel-btn">Cancel</button>
      <button class="button button--primary save-btn" style="margin-left:auto;">Save</button>
    </div>
  `
  const input = panel.querySelector('input') as HTMLInputElement
  const dismissSavePanel = () => popModal()
  const doSave = () => {
    onSave(input.value.trim())
    dismissSavePanel()
  }
  panel.querySelector('.cancel-btn')!.addEventListener('click', dismissSavePanel)
  panel.querySelector('.save-btn')!.addEventListener('click', doSave)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSave()
    else if (e.key === 'Escape') dismissSavePanel()
  })
  pushPanel(panel, 'Save As')
  setTimeout(() => input.focus(), 260)
}

export function slideBackSnapshotModal() {
  if (state.modalStack.length <= 1) return
  popModal()
}
