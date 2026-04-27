// Modal-panel construction and toast notifications.
// Other modal-flow code (pushPanel/popModal stack management, snapshot panels,
// info dialog) still lives in scripts.ts and will move here in follow-up
// extractions once their cross-concern callers are also moved out.

import { hamburgerIcon } from '../icons'
import { renderDvalaMarkdown } from '../renderDvalaMarkdown'
import { closeEffectHandlerMenus, popModal } from '../scripts'
import { elements } from './elements'

export type ModalSize = 'small' | 'medium' | 'large'

export const modalSizeMap: Record<ModalSize, string> = {
  small: '480px',
  medium: '800px',
  large: '1200px',
}

export interface ModalPanelOptions {
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
  closeBtn.textContent = '×'
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
