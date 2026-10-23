"""Constants for the Stream Camera integration."""

DOMAIN = "stream_camera"
VERSION = "1.0.0"

CONF_STREAM_URL = "stream_url"
CONF_SNAPSHOT_URL = "snapshot_url"
CONF_VERIFY_SSL = "verify_ssl"
CONF_TEST_CONNECTION = "test_connection"
CONF_RTSP_TRANSPORT = "rtsp_transport"

DEFAULT_NAME = "Wi-Fi Camera"
DEFAULT_RTSP_TRANSPORT = "tcp"

SUPPORTED_SCHEMES = ("rtsp://", "rtsps://", "rtmp://", "http://", "https://")

# URL the Lovelace card is served from (auto-loaded on every dashboard)
CARD_URL = f"/{DOMAIN}/stream-camera-card.js"
