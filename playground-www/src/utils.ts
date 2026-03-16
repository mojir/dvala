export function isNotNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

export function assertNotNull<T>(value: T | null | undefined): asserts value is T {
  if (!isNotNull(value))
    throw new Error('Value is null or undefined')
}

export function asNotNull<T>(value: T | null | undefined): T {
  assertNotNull(value)
  return value
}

export function getPageHeader(options?: { tagline?: boolean }): string {
  const showTagline = options?.tagline ?? false
  const taglineHtml = showTagline
    ? `<p class="start-page__tagline">Run anywhere - Resume everywhere</p>
    <p class="start-page__subtitle">A suspendable, time-traveling functional language for JavaScript</p>`
    : ''
  return `
  <div class="content-page__header start-page__header">
    <img src="images/dvala-logo.png" alt="Dvala" class="start-page__logo">
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
