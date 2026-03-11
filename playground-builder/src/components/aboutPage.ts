import { checkIcon } from '../icons'
import { styles } from '../styles'
import { pageLayout } from './pageLayout'

export function getAboutPage(): string {
  const content = `
    <div ${styles('flex', 'justify-center')}>
      <div ${styles('font-sans', 'text-color-gray-300', 'flex', 'flex-col')}>
        <div ${styles('mt-4')}>Dvala is a sandboxed, suspendable virtual machine that embeds in any JavaScript runtime. With algebraic effects and serializable continuations, execution state becomes a JSON blob — pause anywhere, resume across processes and time, and debug backward through history.</div>
        <div ${styles('mt-4')}>Features</div>
        <div ${styles('mt-4', 'ml-6', 'flex', 'flex-col', 'text-base', 'gap-2')}>
          <div ${styles('flex', 'flex-row', 'gap-4', 'items-start')}>
            <div ${styles('mt-px')}>${checkIcon}</div>
            <div>
              <span ${styles('font-bold')}>Algebraic effects</span>
              <span ${styles('text-color-gray-400')}> - <code ${styles('font-mono', 'text-color-gray-300')}>perform</code> is the only IO boundary; host handlers decide to resume, await, or suspend</span>
            </div>
          </div>
          <div ${styles('flex', 'flex-row', 'gap-4', 'items-start')}>
            <div ${styles('mt-px')}>${checkIcon}</div>
            <div>
              <span ${styles('font-bold')}>Serializable continuations</span>
              <span ${styles('text-color-gray-400')}> - Execution state freezes to JSON, resumable across processes and time</span>
            </div>
          </div>
          <div ${styles('flex', 'flex-row', 'gap-4', 'items-start')}>
            <div ${styles('mt-px')}>${checkIcon}</div>
            <div>
              <span ${styles('font-bold')}>Time-travel debugging</span>
              <span ${styles('text-color-gray-400')}> - Step backward, jump to any state, explore alternate timelines</span>
            </div>
          </div>
          <div ${styles('flex', 'flex-row', 'gap-4', 'items-start')}>
            <div ${styles('mt-px')}>${checkIcon}</div>
            <div>
              <span ${styles('font-bold')}>Sandboxed execution</span>
              <span ${styles('text-color-gray-400')}> - No file system, network, or global access — safe for untrusted code</span>
            </div>
          </div>
          <div ${styles('flex', 'flex-row', 'gap-4', 'items-start')}>
            <div ${styles('mt-px')}>${checkIcon}</div>
            <div>
              <span ${styles('font-bold')}>Pure functional</span>
              <span ${styles('text-color-gray-400')}> - Immutable data, no side effects, predictable behavior</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
  return pageLayout('about-page', 'About', content)
}
