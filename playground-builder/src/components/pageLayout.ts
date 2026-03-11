import { styles } from '../styles'

export function pageLayout(id: string, title: string, content: string): string {
  return `
  <div id="${id}" class="content">
    <div ${styles('mb-6', 'p-4', 'bg-gray-800', 'text-color-gray-300')}>
      <div ${styles('text-3xl', 'text-center', 'mb-6')}>${title}</div>
      ${content}
    </div>
  </div>
  `
}
