export function getPageHeader(options?: { tagline?: boolean }): string {
  const showTagline = options?.tagline ?? false
  const taglineHtml = showTagline
    ? `<p class="start-page__tagline">Run anywhere - Resume everywhere</p>
    <p class="start-page__subtitle">A suspendable runtime with algebraic effects</p>`
    : ''
  return `
  <div class="content-page__header start-page__header">
    <img src="images/dvala-logo.webp" alt="Dvala" class="start-page__logo" width="800" height="232">
    ${taglineHtml}
  </div>`
}

export function throttle(func: () => void) {
  let pending = false
  return function () {
    if (!pending) {
      pending = true
      requestAnimationFrame(() => {
        pending = false
        func()
      })
    }
  }
}

export function isMac(): boolean {
  return navigator.platform.includes('Mac')
}
