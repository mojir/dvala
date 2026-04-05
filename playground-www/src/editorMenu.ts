function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface EditorMenuItem {
  action: string
  danger?: boolean
  icon?: string
  label: string
  shortcut?: string
}

export function renderEditorMenu(options: { id: string; items: EditorMenuItem[] }): string {
  const itemsHtml = options.items.map(item => {
    const dangerClass = item.danger ? ' editor-menu__item--danger' : ''
    const iconHtml = item.icon ? `<span class="editor-menu__icon">${item.icon}</span>` : ''
    const shortcutHtml = item.shortcut ? `<span class="editor-menu__shortcut">${escapeHtml(item.shortcut)}</span>` : ''
    return `<button type="button" class="editor-menu__item${dangerClass}" onmousedown="${item.action}">${iconHtml}<span>${escapeHtml(item.label)}</span>${shortcutHtml}</button>`
  }).join('')

  return `<div id="${options.id}" class="editor-menu" style="display:none;">${itemsHtml}</div>`
}
