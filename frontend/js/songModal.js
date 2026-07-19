/**
 * songModal.js
 * -----------------------------------------------------------------------------
 * The song detail popup opened by clicking a song on Home or Search. It has
 * five tabs:
 *
 *   - Spotify          : embedded player via Spotify's official iFrame API
 *                        (https://developer.spotify.com/documentation/embeds/tutorials/using-the-iframe-api)
 *   - YouTube           : embeds song.track_youtube_link (a field the
 *                        backend returns directly on each song)
 *   - Recommendations    : GET /recommend/{track_id}, shown as a list, with
 *                        a button to open the raw backend response in a new tab
 *   - Song Features       : the song's actual audio features + genre/
 *                        popularity/explicit, as returned by the backend
 *   - Predict Features     : sends the song's features to POST
 *                        /predict-features and shows the predicted genre
 *                        and popularity back
 *
 * FIELD NAMES: song objects are flat — audio features (see FEATURE_DEFS in
 * featureForm.js) are top-level fields directly on the song, NOT nested
 * under a "features" key. Use extractFeatures(song) (featureForm.js) to
 * pull them into their own object when sending to /predict-features.
 * -----------------------------------------------------------------------------
 */

let modalCurrentSong = null;
let modalActiveTab = 'spotify';

// Spotify's iFrame API loads asynchronously and calls this once, globally,
// whenever it's ready — see the <script src="https://open.spotify.com/embed/iframe-api/v1">
// tag in index.html. We stash the API object so renderSpotifyTab() can use
// it any time afterwards, however long the popup has been open.
window.onSpotifyIframeApiReady = (IFrameAPI) => {
  window.SpotifyIFrameAPI = IFrameAPI;
};

function openSongModal(songId, initialTab = 'spotify') {
  // dataset.id (from data-id="...") is always a string, but the backend
  // may return a numeric track_id — compare as strings so both cases match.
  const song = ALL_SONGS.find(s => String(s.track_id) === String(songId));
  if (!song) return;

  modalCurrentSong = song;
  modalActiveTab = initialTab;

  document.getElementById('modalSongTitle').textContent = song.track_name;
  document.getElementById('modalSongArtist').textContent = song.artists;

  document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === modalActiveTab));
  renderModalTab();

  document.getElementById('songModalOverlay').classList.add('open');
}

function closeSongModal() {
  document.getElementById('songModalOverlay').classList.remove('open');
  modalCurrentSong = null;
}

function renderModalTab() {
  if (!modalCurrentSong) return;

  if (modalActiveTab === 'spotify') renderSpotifyTab(modalCurrentSong);
  else if (modalActiveTab === 'youtube') renderYouTubeTab(modalCurrentSong);
  else if (modalActiveTab === 'recommend') loadRecommendTab(modalCurrentSong);
  else if (modalActiveTab === 'features') renderFeaturesTab(modalCurrentSong);
  else if (modalActiveTab === 'predict') renderPredictFeaturesTab(modalCurrentSong);
}

document.querySelectorAll('.modal-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    modalActiveTab = tab.dataset.tab;
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t === tab));
    renderModalTab();
  });
});

document.getElementById('modalCloseBtn').addEventListener('click', closeSongModal);
document.getElementById('songModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'songModalOverlay') closeSongModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSongModal();
});

/* ---------------- Spotify tab ---------------- */

/**
 * Uses Spotify's official iFrame API instead of a plain embed <iframe src=...>,
 * so the player can be controlled/reused via JS if you build on this later.
 * See: https://developer.spotify.com/documentation/embeds/tutorials/using-the-iframe-api
 *
 * ASSUMPTION: song.track_id is the actual Spotify track ID (true for the
 * "Spotify Tracks Dataset" this schema matches), so the Spotify URI is
 * built as spotify:track:{track_id}. If your backend's track_id isn't a
 * real Spotify ID, this tab won't be able to find a matching track.
 */
function renderSpotifyTab(song) {
  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <div class="tab-panel">
      <p class="tab-hint">Spotify player, via Spotify's official iFrame API.</p>
      <div id="spotifyEmbedIframe"></div>
    </div>
  `;
  mountSpotifyEmbed(song, 0);
}

function mountSpotifyEmbed(song, attempt) {
  const container = document.getElementById('spotifyEmbedIframe');
  // Bail out if the tab/popup was closed or switched away before this ran.
  if (!container || modalActiveTab !== 'spotify' || modalCurrentSong !== song) return;

  if (window.SpotifyIFrameAPI) {
    container.innerHTML = '';
    window.SpotifyIFrameAPI.createController(container, {
      uri: `spotify:track:${song.track_id}`,
      width: '100%',
      height: '160',
    }, () => {});
    return;
  }

  // The iFrame API script (loaded in index.html) may not have finished
  // loading yet — retry for a few seconds before giving up.
  if (attempt < 20) {
    setTimeout(() => mountSpotifyEmbed(song, attempt + 1), 300);
  } else {
    container.innerHTML = `<div class="empty-state"><p>${ERROR_MESSAGE}</p></div>`;
  }
}

/* ---------------- YouTube tab ---------------- */

/**
 * Embeds song.track_youtube_link directly — this field is returned by the
 * backend on every song, right alongside track_name/artists/etc.
 */
function renderYouTubeTab(song) {
  const body = document.getElementById('modalBody');

  if (!song.track_youtube_link) {
    body.innerHTML = `<div class="empty-state"><p>No YouTube link available for this song.</p></div>`;
    return;
  }

  body.innerHTML = `
    <div class="tab-panel">
      <iframe class="embed-frame"
        src="${escapeHTML(song.track_youtube_link)}"
        allow="autoplay; encrypted-media" allowfullscreen></iframe>
    </div>
  `;
}

/* ---------------- Recommendations tab ---------------- */

async function loadRecommendTab(song) {
  const body = document.getElementById('modalBody');
  body.innerHTML = `<div class="loading"><div class="spinner"></div> Finding similar songs…</div>`;

  const recs = await apiCall(ENDPOINTS.recommend(song.track_id));

  if (recs === null) {
    body.innerHTML = errorStateHTML();
    return;
  }

  if (recs.length === 0) {
    body.innerHTML = `<div class="empty-state"><p>No recommendations available.</p></div>`;
    return;
  }

  body.innerHTML = `
    <div class="tab-panel">
      <ul class="rec-list">
        ${recs.map(s => `
          <li class="rec-list-item" data-id="${s.track_id}">
            <div class="rec-list-info">
              <strong>${escapeHTML(s.track_name)}</strong>
              <span>${escapeHTML(s.artists)}</span>
            </div>
            ${s.similarity !== undefined ? `<span class="similarity-pill">${Math.round(s.similarity * 100)}% match</span>` : ''}
          </li>
        `).join('')}
      </ul>
      <button class="btn btn-secondary" id="openRecommendationsNewTab">Open raw results in new tab</button>
    </div>
  `;

  body.querySelectorAll('.rec-list-item').forEach(item => {
    item.addEventListener('click', () => openSongModal(item.dataset.id, 'recommend'));
  });
  document.getElementById('openRecommendationsNewTab').addEventListener('click', () => {
    window.open(ENDPOINTS.recommend(song.track_id), '_blank');
  });
}

/* ---------------- Song Features tab ---------------- */

/**
 * Shows the song's data exactly as the backend returned it — no predicting
 * here, just display. (See the Predict Features tab below for predictions.)
 */
function renderFeaturesTab(song) {
  const body = document.getElementById('modalBody');

  const genreMissing = !song.track_genre;
  const popularityMissing = song.popularity === undefined || song.popularity === null;
  const explicitMissing = song.explicit === undefined || song.explicit === null;

  const featureRows = FEATURE_DEFS.map(f => `
    <div class="feature-row">
      <span class="feature-label">${f.label}</span>
      <span class="feature-value">${song[f.key] !== undefined && song[f.key] !== null ? song[f.key] : '<span class="missing">Missing</span>'}</span>
    </div>
  `).join('');

  body.innerHTML = `
    <div class="tab-panel">
      <div class="feature-row">
        <span class="feature-label">Genre</span>
        <span class="feature-value">${genreMissing ? '<span class="missing">Missing</span>' : escapeHTML(song.track_genre)}</span>
      </div>
      <div class="feature-row">
        <span class="feature-label">Popularity</span>
        <span class="feature-value">${popularityMissing ? '<span class="missing">Missing</span>' : song.popularity}</span>
      </div>
      <div class="feature-row">
        <span class="feature-label">Explicit</span>
        <span class="feature-value">${explicitMissing ? '<span class="missing">Missing</span>' : (song.explicit ? 'Yes' : 'No')}</span>
      </div>
      ${featureRows}
    </div>
  `;
}

/* ---------------- Predict Features tab ---------------- */

/**
 * Sends this song's audio features to POST /predict-features and shows
 * back the predicted genre + popularity. Expects a JSON response shaped
 * like: { "genre": "pop", "popularity": 62 }
 */
function renderPredictFeaturesTab(song) {
  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <div class="tab-panel">
      <p class="tab-hint">Predict this song's genre and popularity from its audio features.</p>
      <button class="btn btn-primary" id="predictFeaturesBtn">Predict Genre &amp; Popularity</button>
      <div id="predictFeaturesResult"></div>
    </div>
  `;

  document.getElementById('predictFeaturesBtn').addEventListener('click', async () => {
    const btn = document.getElementById('predictFeaturesBtn');
    const resultDiv = document.getElementById('predictFeaturesResult');
    btn.disabled = true;
    btn.textContent = 'Predicting…';

    const features = extractFeatures(song);
    const result = await apiCall(ENDPOINTS.predictFeatures(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(features)
    });

    btn.disabled = false;
    btn.textContent = 'Predict Genre & Popularity';

    if (result === null) {
      resultDiv.innerHTML = errorStateHTML();
      return;
    }

    resultDiv.innerHTML = `
      <div class="feature-row">
        <span class="feature-label">Predicted Genre</span>
        <span class="feature-value">${escapeHTML(String(result.genre))}</span>
      </div>
      <div class="feature-row">
        <span class="feature-label">Predicted Popularity</span>
        <span class="feature-value">${result.popularity}</span>
      </div>
    `;
  });
}
