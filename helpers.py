"""Shared helpers for building and probing stream URLs."""
from __future__ import annotations

import asyncio
import logging
from urllib.parse import quote, urlsplit, urlunsplit

from homeassistant.components.ffmpeg import get_ffmpeg_manager
from homeassistant.core import HomeAssistant

from .const import SUPPORTED_SCHEMES

_LOGGER = logging.getLogger(__name__)


def is_supported_url(url: str) -> bool:
    """Return True if the URL uses a scheme we can stream."""
    return url.strip().lower().startswith(SUPPORTED_SCHEMES)


def inject_credentials(url: str, username: str | None, password: str | None) -> str:
    """Add username/password to a URL unless it already carries them."""
    if not url or not username:
        return url
    parts = urlsplit(url)
    if parts.username:  # credentials already in the URL
        return url
    userinfo = quote(username, safe="")
    if password:
        userinfo += ":" + quote(password, safe="")
    netloc = f"{userinfo}@{parts.hostname or ''}"
    if parts.port:
        netloc += f":{parts.port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def redact_url(url: str) -> str:
    """Strip credentials from a URL (for unique IDs and logs)."""
    parts = urlsplit(url)
    if not parts.username:
        return url
    netloc = parts.hostname or ""
    if parts.port:
        netloc += f":{parts.port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


async def async_grab_frame(
    hass: HomeAssistant,
    url: str,
    transport: str = "tcp",
    width: int | None = None,
    height: int | None = None,
    timeout: float = 15,
) -> bytes | None:
    """Grab a single JPEG frame from any stream using Home Assistant's ffmpeg."""
    binary = get_ffmpeg_manager(hass).binary
    args = [binary, "-hide_banner", "-loglevel", "error"]
    if url.lower().startswith(("rtsp://", "rtsps://")):
        args += ["-rtsp_transport", transport]
    args += ["-i", url, "-an", "-frames:v", "1"]
    if width and height:
        args += ["-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease"]
    elif width:
        args += ["-vf", f"scale={width}:-2"]
    args += ["-f", "image2pipe", "-c:v", "mjpeg", "-"]

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as err:
        _LOGGER.error("Could not start ffmpeg: %s", err)
        return None

    try:
        async with asyncio.timeout(timeout):
            stdout, stderr = await proc.communicate()
    except TimeoutError:
        proc.kill()
        await proc.wait()
        _LOGGER.debug("Timed out grabbing frame from %s", redact_url(url))
        return None

    if proc.returncode != 0 or not stdout:
        _LOGGER.debug(
            "ffmpeg failed for %s: %s",
            redact_url(url),
            stderr.decode(errors="ignore").strip()[-300:],
        )
        return None
    return stdout
