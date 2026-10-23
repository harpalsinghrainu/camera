"""Camera platform for Stream Camera."""
from __future__ import annotations

import logging

import httpx

from homeassistant.components.camera import Camera, CameraEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_NAME, CONF_PASSWORD, CONF_USERNAME, CONF_VERIFY_SSL
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.httpx_client import get_async_client

from .const import (
    CONF_RTSP_TRANSPORT,
    CONF_SNAPSHOT_URL,
    CONF_STREAM_URL,
    DEFAULT_NAME,
    DEFAULT_RTSP_TRANSPORT,
    DOMAIN,
    VERSION,
)
from .helpers import async_grab_frame, inject_credentials, redact_url

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Add the camera for this config entry."""
    async_add_entities([StreamCamera(hass, entry)])


class StreamCamera(Camera):
    """A camera backed by an RTSP / RTMP / HLS / HTTP stream URL."""

    _attr_has_entity_name = True
    _attr_name = None  # entity takes the device name
    _attr_supported_features = CameraEntityFeature.STREAM

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__()
        self.hass = hass
        self._entry = entry
        data = {**entry.data, **entry.options}

        username = data.get(CONF_USERNAME) or None
        password = data.get(CONF_PASSWORD) or None
        self._stream_url: str = inject_credentials(data[CONF_STREAM_URL], username, password)
        snapshot = data.get(CONF_SNAPSHOT_URL) or ""
        self._snapshot_url: str | None = (
            inject_credentials(snapshot, username, password) if snapshot else None
        )
        self._transport: str = data.get(CONF_RTSP_TRANSPORT, DEFAULT_RTSP_TRANSPORT)
        self._verify_ssl: bool = data.get(CONF_VERIFY_SSL, False)
        self._last_image: bytes | None = None

        name = data.get(CONF_NAME) or DEFAULT_NAME
        self._attr_unique_id = entry.entry_id
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=name,
            manufacturer="Stream Camera",
            model="Wi-Fi / IP camera",
            sw_version=VERSION,
        )
        # RTSP options passed through to HA's stream component
        if self._stream_url.lower().startswith(("rtsp://", "rtsps://")):
            self.stream_options["rtsp_transport"] = self._transport

    @property
    def extra_state_attributes(self) -> dict[str, str]:
        """Expose the (credential-free) source so it's visible in the UI."""
        return {"stream_source": redact_url(self._stream_url)}

    async def stream_source(self) -> str | None:
        """Return the stream URL used for the live view."""
        return self._stream_url

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """Return a still image (used for thumbnails and as a fallback)."""
        image: bytes | None = None
        if self._snapshot_url:
            image = await self._fetch_snapshot()
        if image is None:
            image = await async_grab_frame(
                self.hass, self._stream_url, self._transport, width, height
            )
        if image is not None:
            self._last_image = image
        return image or self._last_image

    async def _fetch_snapshot(self) -> bytes | None:
        client = get_async_client(self.hass, verify_ssl=self._verify_ssl)
        try:
            resp = await client.get(self._snapshot_url, timeout=10, follow_redirects=True)
            resp.raise_for_status()
            return resp.content
        except (httpx.HTTPError, ValueError) as err:
            _LOGGER.debug("Snapshot failed for %s: %s", redact_url(self._snapshot_url), err)
            return None
