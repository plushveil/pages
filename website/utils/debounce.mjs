/**
 * Create a debounced function that delays invoking fn until after delay milliseconds have elapsed since the last time the debounced function was invoked.
 * @param {Function} fn - The function to debounce.
 * @param {number} delay - The number of milliseconds
 * @returns {Function} The debounced function.
 */
export default function debounce (fn, delay) {
  let timeoutId
  return function (...args) {
    const context = this
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => { fn.call(context, args) }, delay)
  }
}
