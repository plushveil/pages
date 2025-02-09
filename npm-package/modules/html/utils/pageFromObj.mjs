/**
 * Convert a page object to a page.
 * @param {import('../../../src/pages.mjs').Page} page - The page object.
 * @returns {import('../../../src/pages.mjs').Page} The page.
 */
export default function pageFromObj (page) {
  page.fileUrl = typeof page.fileUrl === 'string' ? new URL(page.fileUrl) : page.fileUrl
  page.url = typeof page.url === 'string' ? new URL(page.url) : page.url
  return page
}
