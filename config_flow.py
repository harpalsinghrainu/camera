"""Config flow: add a camera by pasting its stream link."""
from __future__ import annotations

import hashlib
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_NAME, CONF_PASSWORD, CONF_USERNAME, CONF_VERIFY_SSL
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.selector import (
    BooleanSelector,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .const import (
    CONF_RTSP_TRANSPORT,
    CONF_SNAPSHOT_URL,
    CONF_STREAM_URL,
    CONF_TEST_CONNECTION,
    DEFAULT_NAME,
    DEFAULT_RTSP_TRANSPORT,
    DOMAIN,
)
from .helpers import async_grab_frame, inject_credentials, is_supported_url, redact_url

_URL = TextSelector(TextSelectorConfig(type=TextSelectorType.URL))
_TEXT = TextSelector()
_PASSWORD = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))
_TRANSPORT = SelectSelector(
    SelectSelectorConfig(
        options=["tcp", "udp", "udp_multicast", "http"],
        mode=SelectSelectorMode.DROPDOWN,
    )
)


def _schema(defaults: dict[str, Any], include_name: bool) -> vol.Schema:
    fields: dict[Any, Any] = {}
    if include_name:
        fields[vol.Required(CONF_NAME, default=defaults.get(CONF_NAME, DEFAULT_NAME))] = _TEXT
    fields.update(
        {
            vol.Required(CONF_STREAM_URL, default=defaults.get(CONF_STREAM_URL, "")): _URL,
            vol.Optional(
                CONF_SNAPSHOT_URL,
                description={"suggested_value": defaults.get(CONF_SNAPSHOT_URL)},
            ): _URL,
            vol.Optional(
                CONF_USERNAME, description={"suggested_value": defaults.get(CONF_USERNAME)}
            ): _TEXT,
            vol.Optional(
                CONF_PASSWORD, description={"suggested_value": defaults.get(CONF_PASSWORD)}
            ): _PASSWORD,
            vol.Required(
                CONF_RTSP_TRANSPORT,
                default=defaults.get(CONF_RTSP_TRANSPORT, DEFAULT_RTSP_TRANSPORT),
            ): _TRANSPORT,
            vol.Required(
                CONF_VERIFY_SSL, default=defaults.get(CONF_VERIFY_SSL, False)
            ): BooleanSelector(),
            vol.Required(CONF_TEST_CONNECTION, default=True): BooleanSelector(),
        }
    )
    return vol.Schema(fields)


async def _validate(hass: HomeAssistant, data: dict[str, Any]) -> dict[str, str]:
    """Return form errors (empty dict when OK)."""
    errors: dict[str, str] = {}
    url = (data.get(CONF_STREAM_URL) or "").strip()
    if not is_supported_url(url):
        errors[CONF_STREAM_URL] = "invalid_url"
    snap = (data.get(CONF_SNAPSHOT_URL) or "").strip()
    if snap and not snap.lower().startswith(("http://", "https://")):
        errors[CONF_SNAPSHOT_URL] = "invalid_snapshot_url"
    if errors or not data.get(CONF_TEST_CONNECTION, True):
        return errors

    full = inject_credentials(url, data.get(CONF_USERNAME), data.get(CONF_PASSWORD))
    frame = await async_grab_frame(
        hass, full, data.get(CONF_RTSP_TRANSPORT, DEFAULT_RTSP_TRANSPORT), width=320
    )
    if not frame:
        errors["base"] = "cannot_connect"
    return errors


def _clean(data: dict[str, Any]) -> dict[str, Any]:
    out = {k: (v.strip() if isinstance(v, str) else v) for k, v in data.items()}
    out.pop(CONF_TEST_CONNECTION, None)
    return out


class StreamCameraConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle adding a camera."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = await _validate(self.hass, user_input)
            if not errors:
                data = _clean(user_input)
                uid = hashlib.sha1(
                    redact_url(data[CONF_STREAM_URL]).encode()
                ).hexdigest()[:16]
                await self.async_set_unique_id(uid)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=data[CONF_NAME], data=data)

        return self.async_show_form(
            step_id="user",
            data_schema=_schema(user_input or {}, include_name=True),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return StreamCameraOptionsFlow()


class StreamCameraOptionsFlow(OptionsFlow):
    """Edit the stream link / credentials of an existing camera."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        current = {**self.config_entry.data, **self.config_entry.options}
        if user_input is not None:
            errors = await _validate(self.hass, user_input)
            if not errors:
                return self.async_create_entry(title="", data=_clean(user_input))

        return self.async_show_form(
            step_id="init",
            data_schema=_schema(user_input or current, include_name=False),
            errors=errors,
        )
