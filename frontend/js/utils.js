/**
 * utils.js
 * -----------------------------------------------------------------------------
 * Small, generic helper functions shared by every page. None of these know
 * anything about "songs" or "genres" specifically — they're plumbing used by
 * the page-specific files (home.js, search.js, etc).
 * -----------------------------------------------------------------------------
 */

const ERROR_MESSAGE = "Something Went Wrong";

/**
 * Formats a duration for display as m:ss.
 * IMPORTANT: the backend returns song duration in MILLISECONDS
 * (`duration_ms`), so this expects milliseconds, not seconds.
 */
function fmtDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * A ready-to-insert error block for any page section that failed to load
 * data from the backend, e.g. `container.innerHTML = errorStateHTML();`.
 */
function errorStateHTML() {
  return `<div class="empty-state"><p>${ERROR_MESSAGE}</p></div>`;
}

/**
 * apiCall(url, options)
 * Thin wrapper around fetch() for talking to the backend (see config.js for
 * the URLs). Returns the parsed JSON response on success, or `null` if the
 * request fails for any reason — backend not running, wrong URL in
 * js/env.js, network error, timeout, non-2xx status, etc.
 *
 * Every caller MUST check for `null` and tell the user something went
 * wrong (see ERROR_MESSAGE / errorStateHTML() above, or showToast() below).
 * Never let a failed request pass through silently.
 */
async function apiCall(url, options = {}) {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('API request failed:', err);
    return null;
  }
}

function showToast(message, type = "success") {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
