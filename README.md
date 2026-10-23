# Stream Camera for Home Assistant

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories)
[![Validate](https://github.com/YOUR_GITHUB_USERNAME/ha-stream-camera/actions/workflows/validate.yml/badge.svg)](https://github.com/YOUR_GITHUB_USERNAME/ha-stream-camera/actions/workflows/validate.yml)

Add any Wi-Fi / IP camera to Home Assistant just by pasting its **streaming link**, then show it on your dashboard with a **resizable live card**.

- ✅ Add cameras from the UI (no YAML) — RTSP, RTSPS, RTMP, HLS (`.m3u8`) and HTTP/MJPEG
- ✅ Tests the stream before saving, edit the link or password later
- ✅ Built-in **Stream Camera Card** — loaded automatically, no extra resource to add
- ✅ Resizable in the Sections dashboard (drag to any width/height), aspect ratio in classic views
- ✅ Low-latency WebRTC/HLS with automatic MJPEG fallback, fullscreen button, visual editor

---

## Installation

### HACS (recommended)
1. HACS → ⋮ → **Custom repositories**
2. Add `https://github.com/YOUR_GITHUB_USERNAME/ha-stream-camera` with category **Integration**
3. Search for **Stream Camera**, download it, and **restart Home Assistant**

### Manual
Copy `custom_components/stream_camera` into your Home Assistant `config/custom_components/` folder and restart.

## Add a camera
**Settings → Devices & services → Add integration → Stream Camera**

| Field | Example |
|---|---|
| Camera name | `Front door` |
| Stream URL | `rtsp://192.168.1.50:554/stream1` |
| Snapshot URL *(optional)* | `http://192.168.1.50/snapshot.jpg` |
| Username / Password *(optional)* | added to the URL for you (special characters are escaped) |
| RTSP transport | `tcp` (best for Wi-Fi cameras) |

Repeat for each camera. To change a link later: open the integration → **Configure**.

### Common stream URLs
| Brand | URL |
|---|---|
| TP-Link Tapo | `rtsp://USER:PASS@IP:554/stream1` (HD) · `/stream2` (SD) — create a *camera account* in the Tapo app |
| Hikvision / EZVIZ | `rtsp://USER:PASS@IP:554/Streaming/Channels/101` |
| Dahua / Imou | `rtsp://USER:PASS@IP:554/cam/realmonitor?channel=1&subtype=0` |
| Reolink | `rtsp://USER:PASS@IP:554/h264Preview_01_main` |
| CP Plus | `rtsp://USER:PASS@IP:554/cam/realmonitor?channel=1&subtype=0` |
| ONVIF / generic | `rtsp://USER:PASS@IP:554/onvif1` or `/live/ch0` |
| Android IP Webcam | `http://IP:8080/video` |

> Tip: test the link first in VLC (*Media → Open Network Stream*).

## Add the live card to Overview

1. Open **Overview** → ✏️ **Edit dashboard** → **Add card**
2. Search **Stream Camera Card** and pick your camera
3. **Resize** it: in a Sections dashboard drag the card's corner or use the *Layout* tab; in other views choose an aspect ratio

### YAML
```yaml
type: custom:stream-camera-card
entity: camera.front_door
title: Front door        # optional
aspect_ratio: "16:9"     # used when height is "auto"
fit: cover               # cover | contain | fill
mode: auto               # auto (WebRTC/HLS) | mjpeg
muted: true
controls: false
show_title: true
show_fullscreen: true
tap_action: more-info    # more-info | fullscreen | none
grid_options:            # sections dashboard size
  columns: 12
  rows: 6
```

| Option | Default | Description |
|---|---|---|
| `entity` | — | **Required.** A `camera.*` entity |
| `title` | friendly name | Text in the top bar |
| `aspect_ratio` | `16:9` | `16:9`, `4:3`, `1:1`, `56%`, … |
| `fit` | `cover` | How video fills the card when sized freely |
| `mode` | `auto` | `mjpeg` works everywhere but uses more CPU/bandwidth |
| `muted` / `controls` | `true` / `false` | Video player options |
| `show_title` / `show_fullscreen` | `true` | Overlay elements |
| `tap_action` | `more-info` | What tapping the video does |

## Troubleshooting
- **"Couldn't read a frame"** — check the URL in VLC from the same network as Home Assistant; try transport `udp`; untick *Test the stream* to save anyway.
- **Card shows a still image / spins** — set `mode: mjpeg`, or make sure `stream:` (part of `default_config`) is enabled.
- **Card not in the picker** — hard-refresh the browser (Ctrl+F5) after installing or updating.
- Debug logs:
  ```yaml
  logger:
    logs:
      custom_components.stream_camera: debug
  ```

## License
MIT
