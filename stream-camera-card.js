/**
 * Stream Camera Card — a resizable live camera card for Home Assistant.
 * Bundled with the stream_camera integration and loaded automatically.
 *
 *   type: custom:stream-camera-card
 *   entity: camera.front_door
 *   title: Front door          # optional
 *   aspect_ratio: "16:9"       # used when the card height is "auto"
 *   fit: cover                 # cover | contain | fill
 *   mode: auto                 # auto (WebRTC/HLS) | mjpeg (always works, more CPU)
 *   muted: true
 *   controls: false
 *   show_title: true
 *   show_fullscreen: true
 *   tap_action: more-info      # more-info | fullscreen | none
 */

const CARD_VERSION = "1.0.0";

const parseRatio = (value) => {
  if (!value) return 9 / 16;
  const s = String(value).trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/i);
  if (m) return Number(m[2]) / Number(m[1]);
  const pct = s.match(/^(\d+(?:\.\d+)?)%$/);
  if (pct) return Number(pct[1]) / 100;
  const n = Number(s);
  return n > 0 ? 1 / n : 9 / 16;
};

const STYLE = `
  :host { display: block; height: 100%; }
  ha-card {
    position: relative; overflow: hidden; height: 100%;
    background: #000; box-sizing: border-box;
  }
  .frame { position: relative; width: 100%; background: #000; }
  .frame.auto { height: 0; }
  .frame.fill { height: 100%; }
  .media { position: absolute; inset: 0; }
  .media > * , .media img, .media video {
    width: 100%; height: 100%; display: block;
  }
  .media img, .media video { object-fit: var(--scc-fit, cover); }
  ha-camera-stream {
    --video-max-height: 100%;
    height: 100%;
  }
  .overlay {
    position: absolute; left: 0; right: 0; top: 0;
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px;
    background: linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,0));
    color: #fff; font-size: 14px; font-weight: 500;
    pointer-events: none;
  }
  .title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .live {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
    background: rgba(0,0,0,.45); padding: 2px 7px; border-radius: 10px;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #e53935; animation: pulse 1.6s infinite; }
  @keyframes pulse { 50% { opacity: .35; } }
  .btn {
    pointer-events: auto; cursor: pointer; border: 0; padding: 4px;
    background: rgba(0,0,0,.35); color: #fff; border-radius: 50%;
    width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
  }
  .btn:hover { background: rgba(0,0,0,.6); }
  .btn svg { width: 18px; height: 18px; fill: currentColor; }
  .msg {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    flex-direction: column; gap: 6px; color: #bbb; font-size: 14px; text-align: center; padding: 16px;
  }
  .tap { position: absolute; inset: 0; cursor: pointer; }
  ha-card:fullscreen .frame { height: 100% !important; padding: 0 !important; }
  ha-card:fullscreen { border-radius: 0; }
`;

const ICON_FULLSCREEN =
  '<svg viewBox="0 0 24 24"><path d="M5 5h5v2H7v3H5V5m9 0h5v5h-2V7h-3V5m3 9h2v5h-5v-2h3v-3m-7 3v2H5v-5h2v3h3z"/></svg>';

class StreamCameraCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
    this._streamEl = null;
    this._mjpegToken = null;
  }

  static getConfigElement() {
    return document.createElement("stream-camera-card-editor");
  }

  static getStubConfig(hass) {
    const cams = Object.keys(hass.states).filter((e) => e.startsWith("camera."));
    return { entity: cams[0] || "", aspect_ratio: "16:9", fit: "cover", muted: true };
  }

  setConfig(config) {
    if (!config || !config.entity || !String(config.entity).startsWith("camera.")) {
      throw new Error("Please choose a camera entity (entity: camera.xxx)");
    }
    this._config = {
      fit: "cover",
      mode: "auto",
      muted: true,
      controls: false,
      show_title: true,
      show_fullscreen: true,
      tap_action: "more-info",
      aspect_ratio: "16:9",
      ...config,
    };
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (!this._built) this._render();
    else this._update();
  }

  /** Masonry view height hint (1 unit ≈ 50px). */
  getCardSize() {
    return Math.max(3, Math.round(parseRatio(this._config?.aspect_ratio) * 8));
  }

  /** Sections view: fully resizable grid card. */
  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 3, min_rows: 2 };
  }

  // Older HA (2024.x) sections API
  getLayoutOptions() {
    return { grid_columns: 4, grid_min_columns: 1, grid_min_rows: 2 };
  }

  get _fillHeight() {
    const g = this._config.grid_options || {};
    const l = this._config.layout_options || {};
    return typeof g.rows === "number" || typeof l.grid_rows === "number";
  }

  _render() {
    const c = this._config;
    const root = this.shadowRoot;
    root.innerHTML = "";
    this._streamEl = null;
    this._mjpegToken = null;

    const style = document.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    card.style.setProperty("--scc-fit", c.fit);

    const frame = document.createElement("div");
    frame.className = "frame " + (this._fillHeight ? "fill" : "auto");
    if (!this._fillHeight) frame.style.paddingBottom = `${parseRatio(c.aspect_ratio) * 100}%`;

    const media = document.createElement("div");
    media.className = "media";
    frame.appendChild(media);

    const tap = document.createElement("div");
    tap.className = "tap";
    tap.addEventListener("click", () => this._onTap());
    frame.appendChild(tap);

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <span class="title"></span>
      <span class="live"><span class="dot"></span>Live</span>`;
    if (c.show_fullscreen) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.title = "Fullscreen";
      btn.innerHTML = ICON_FULLSCREEN;
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._toggleFullscreen();
      });
      overlay.appendChild(btn);
    }
    frame.appendChild(overlay);

    card.appendChild(frame);
    root.appendChild(card);

    this._card = card;
    this._media = media;
    this._overlay = overlay;
    this._built = true;
    this._update();
  }

  _update() {
    const c = this._config;
    const hass = this._hass;
    const stateObj = hass.states[c.entity];

    const titleEl = this._overlay.querySelector(".title");
    const name = c.title ?? stateObj?.attributes.friendly_name ?? c.entity;
    titleEl.textContent = c.show_title ? name : "";
    this._overlay.style.display =
      c.show_title || c.show_fullscreen ? "flex" : "none";

    const offline = !stateObj || stateObj.state === "unavailable";
    this._overlay.querySelector(".live").style.display = offline ? "none" : "";
    if (offline) {
      this._showMessage(stateObj ? "Camera unavailable" : `Entity not found: ${c.entity}`);
      return;
    }
    this._clearMessage();

    const wantMjpeg =
      c.mode === "mjpeg" || !customElements.get("ha-camera-stream");

    if (wantMjpeg) {
      this._renderMjpeg(stateObj);
      if (c.mode !== "mjpeg" && !this._waiting) {
        // Upgrade to the native player once HA has loaded it
        this._waiting = true;
        customElements.whenDefined("ha-camera-stream").then(() => {
          this._waiting = false;
          this._mjpegToken = null;
          this._media.innerHTML = "";
          this._update();
        });
      }
      return;
    }

    if (!this._streamEl) {
      this._media.innerHTML = "";
      const el = document.createElement("ha-camera-stream");
      el.allowExoPlayer = true;
      el.muted = c.muted;
      el.controls = c.controls;
      el.fitMode = c.fit; // newer HA
      el.setAttribute("fit-mode", c.fit);
      this._media.appendChild(el);
      this._streamEl = el;
    }
    this._streamEl.hass = hass;
    if (this._streamEl.stateObj !== stateObj) this._streamEl.stateObj = stateObj;
  }

  _renderMjpeg(stateObj) {
    const token = stateObj.attributes.access_token;
    if (token === this._mjpegToken) return;
    this._mjpegToken = token;
    const img = document.createElement("img");
    img.alt = stateObj.attributes.friendly_name || "camera";
    img.src = `/api/camera_proxy_stream/${stateObj.entity_id}?token=${encodeURIComponent(token)}`;
    img.addEventListener("error", () => this._showMessage("Stream failed to load"));
    this._media.innerHTML = "";
    this._media.appendChild(img);
  }

  _showMessage(text) {
    this._clearMessage();
    this._media.innerHTML = "";
    this._streamEl = null;
    this._mjpegToken = null;
    const m = document.createElement("div");
    m.className = "msg";
    m.textContent = text;
    this._media.appendChild(m);
    this._msg = m;
  }

  _clearMessage() {
    if (this._msg) {
      this._msg.remove();
      this._msg = null;
    }
  }

  _onTap() {
    const action = this._config.tap_action;
    if (action === "none") return;
    if (action === "fullscreen") return this._toggleFullscreen();
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId: this._config.entity },
      })
    );
  }

  _toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else this._card?.requestFullscreen?.();
  }
}

/* ---------------- Visual editor ---------------- */

const SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: "camera" } } },
  { name: "title", selector: { text: {} } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "aspect_ratio", selector: { text: {} } },
      {
        name: "fit",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "cover", label: "Cover (fill, crop edges)" },
              { value: "contain", label: "Contain (show whole image)" },
              { value: "fill", label: "Stretch" },
            ],
          },
        },
      },
      {
        name: "mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: "Auto (WebRTC / HLS)" },
              { value: "mjpeg", label: "MJPEG (most compatible)" },
            ],
          },
        },
      },
      {
        name: "tap_action",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "more-info", label: "More info" },
              { value: "fullscreen", label: "Fullscreen" },
              { value: "none", label: "Nothing" },
            ],
          },
        },
      },
    ],
  },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "show_title", selector: { boolean: {} } },
      { name: "show_fullscreen", selector: { boolean: {} } },
      { name: "muted", selector: { boolean: {} } },
      { name: "controls", selector: { boolean: {} } },
    ],
  },
];

const LABELS = {
  entity: "Camera",
  title: "Title (optional)",
  aspect_ratio: "Aspect ratio (e.g. 16:9, 4:3, 1:1)",
  fit: "Video fit",
  mode: "Stream mode",
  tap_action: "Tap action",
  show_title: "Show title",
  show_fullscreen: "Fullscreen button",
  muted: "Muted",
  controls: "Video controls",
};

class StreamCameraCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = {
      fit: "cover",
      mode: "auto",
      muted: true,
      controls: false,
      show_title: true,
      show_fullscreen: true,
      tap_action: "more-info",
      aspect_ratio: "16:9",
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => LABELS[s.name] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        this._config = ev.detail.value;
        this.dispatchEvent(
          new CustomEvent("config-changed", {
            detail: { config: this._config },
            bubbles: true,
            composed: true,
          })
        );
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = SCHEMA;
    this._form.data = this._config;
  }
}

if (!customElements.get("stream-camera-card")) {
  customElements.define("stream-camera-card", StreamCameraCard);
  customElements.define("stream-camera-card-editor", StreamCameraCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "stream-camera-card",
    name: "Stream Camera Card",
    description: "Resizable live view for your Wi-Fi / IP cameras.",
    preview: true,
    documentationURL: "https://github.com/YOUR_GITHUB_USERNAME/ha-stream-camera",
  });
  console.info(
    `%c STREAM-CAMERA-CARD %c v${CARD_VERSION} `,
    "color:#fff;background:#03a9f4;font-weight:700",
    "color:#03a9f4;background:#fff"
  );
}
