import { infoIcon, labIcon, lampIcon, penIcon } from '../../icons'
import { renderExample } from '../../renderExample'
import { styles } from '../../styles'
import startPageExample from './example.dvala'

export async function getStartPage(): Promise<string> {
  const renderedExample = await renderExample(startPageExample, 'start-page-example', { noRun: true })
  const encodedExample = btoa(encodeURIComponent(startPageExample))
  return `
  <div id="index" class="content">
    <div ${styles('flex', 'flex-col', 'items-center', 'p-8')}>
      <img src="images/dvala-logo.png" alt="Dvala" ${styles('max-width: 400px;', 'width: 100%;')}>
      <p ${styles('text-color-gray-300', 'text-xl', 'italic', 'text-center', 'margin-bottom: 0rem;')}>Run anywhere - Resume everywhere</p>
      <p ${styles('text-color-gray-400', 'text-base', 'margin-bottom: 3rem;', 'text-center')}>A suspendable, time-traveling functional language for JavaScript</p>
      <div ${styles('flex', 'justify-center', 'gap: 6rem;', 'margin-bottom: 4rem;')}>
        <a class="external-links" ${styles('flex', 'flex-col', 'items-center', 'cursor-pointer')} onclick="Playground.showPage('about-page', 'smooth')" title="About Dvala">
          <span ${styles('font-size: 4rem;')}>${infoIcon}</span>
          <span ${styles('text-lg')}>About Dvala</span>
        </a>
        <a class="external-links" ${styles('flex', 'flex-col', 'items-center', 'cursor-pointer')} onclick="Playground.showTutorialsPage()" title="Tutorials">
          <span ${styles('font-size: 4rem;')}>${lampIcon}</span>
          <span ${styles('text-lg')}>Tutorials</span>
        </a>
        <a class="external-links" ${styles('flex', 'flex-col', 'items-center', 'cursor-pointer')} onclick="Playground.showPage('example-page', 'smooth')" title="Examples">
          <span ${styles('font-size: 4rem;')}>${labIcon}</span>
          <span ${styles('text-lg')}>Examples</span>
        </a>
      </div>
      <div ${styles('max-width: 60rem;', 'width: 100%;')}>
        ${renderedExample}
        <div ${styles('flex', 'justify-center', 'mt-4')}>
          <a class="tutorial-nav-link" ${styles('text-lg', 'cursor-pointer', 'display: inline-flex;', 'align-items: center;', 'gap-2', 'px-6', 'py-3', 'border-radius: 0.5rem;', 'background-color: #404040;', 'border: 1px solid #525252;')} onclick="Playground.addToPlayground('start-page-example', '${encodedExample}')">${penIcon} Try it out</a>
        </div>
      </div>
    </div>
  </div>
  `
}
