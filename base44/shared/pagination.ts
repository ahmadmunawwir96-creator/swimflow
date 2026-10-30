// Complete reads across cursor pages.
//
// filter(query, { limit, sort, cursor }) returns ONE EntityPage
// { items, next_cursor, has_more } (pinned SDK 0.8.52, entities.types.d.ts).
// It never auto-paginates, so reading a single page and unwrapping `.items`
// silently truncates: everything past the page limit is invisible to the caller.
// For a conflict check or a duplicate guard that is a correctness bug, not a
// display bug — the caller concludes "nothing there" and writes.
//
// This helper walks every page and returns the complete record set, or throws.
// It deliberately has no imports so it can be reasoned about and tested alone.
//
// FAIL CLOSED. Every anomaly throws, and no caller catches it locally, so the
// existing outer handler turns it into the endpoint's generic 500. Returning a
// partial list instead would recreate the very bug this fixes, one layer down.

// Page size for server-side internal reads. Kept in one place so every caller
// passes the SAME limit with a cursor (the cursor token carries the query, sort
// and fields of the walk; the limit is re-sent each page).
export const READ_PAGE_SIZE = 200;

// Hard stop so a server that keeps claiming more work can never spin forever.
// At READ_PAGE_SIZE this is 10,000 records, far above any real schedule.
export const MAX_PAGE_WALK = 50;

function pageFailure(label, pageNumber, reason) {
  return new Error(`[pagination] ${label}: ${reason} (page ${pageNumber})`);
}

// `readPage` receives { cursor } and must return one EntityPage.
// Resolution is complete-or-throw: there is no partial success.
export async function readAllPages(readPage, options) {
  const opts = options || {};
  const label = opts.label || 'records';
  const maxPages = opts.maxPages || MAX_PAGE_WALK;

  const all = [];
  const seenCursors = new Set();
  let cursor = null;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    // No try/catch: a transport or SDK failure propagates to the caller's generic
    // handler. Swallowing it here would return a short list that looks complete.
    const page = await readPage({ cursor });

    if (!page || typeof page !== 'object' || Array.isArray(page) || !Array.isArray(page.items)) {
      throw pageFailure(label, pageNumber, 'malformed page (no items array)');
    }
    // has_more is a boolean in the pinned contract. A page that omits it cannot
    // be told apart from a truncated response, so it is refused rather than
    // treated as terminal.
    if (typeof page.has_more !== 'boolean') {
      throw pageFailure(label, pageNumber, 'malformed page (has_more is not a boolean)');
    }

    all.push(...page.items);

    // Terminal page: trust the pinned contract and stop. next_cursor is null here
    // by contract, but it is not re-validated — a correct final page must never be
    // rejected for a cosmetic detail.
    if (!page.has_more) return all;

    const next = page.next_cursor;
    if (typeof next !== 'string' || !next.trim()) {
      throw pageFailure(label, pageNumber, 'has_more without a usable next_cursor');
    }
    // A repeated cursor means the server is not advancing. Looping on it would
    // either spin or duplicate rows, so the read fails instead.
    if (next === cursor || seenCursors.has(next)) {
      throw pageFailure(label, pageNumber, 'cursor did not advance');
    }

    seenCursors.add(next);
    cursor = next;
  }

  // Cap reached with work still claimed: refuse rather than return what we have.
  throw pageFailure(label, maxPages, `page cap of ${maxPages} reached before the end of the results`);
}

// Normalize a single-page read that may be a page object or a bare array.
// Used where only one page is genuinely wanted (bounded option lists), never for
// correctness-critical conflict or duplicate reads.
export function asSinglePage(pageOrArray) {
  if (Array.isArray(pageOrArray)) return pageOrArray;
  if (pageOrArray && Array.isArray(pageOrArray.items)) return pageOrArray.items;
  return [];
}