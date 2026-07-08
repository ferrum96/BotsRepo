"""Google Sheets sync for member data."""

from __future__ import annotations

import logging
from typing import Optional

import gspread
from google.oauth2.service_account import Credentials

from bot.config import Config
from bot.database import Member

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

HEADERS = [
    "TG Nick",
    "In-game Nick",
    "Discord Nick",
    "Real Name",
    "Perspective",
    "User ID",
    "Date",
]


class SheetsSync:
    def __init__(self, config: Config) -> None:
        self._config = config
        self._client: Optional[gspread.Client] = None
        self._sheet: Optional[gspread.Worksheet] = None

    @property
    def enabled(self) -> bool:
        return bool(
            self._config.google_sheets_credentials_file
            and self._config.google_sheet_id
        )

    def _ensure_connected(self) -> gspread.Worksheet:
        if self._sheet is not None:
            return self._sheet

        creds = Credentials.from_service_account_file(
            self._config.google_sheets_credentials_file,
            scopes=SCOPES,
        )
        self._client = gspread.authorize(creds)
        spreadsheet = self._client.open_by_key(self._config.google_sheet_id)
        self._sheet = spreadsheet.sheet1

        existing = self._sheet.row_values(1)
        if existing != HEADERS:
            self._sheet.update("A1:G1", [HEADERS])

        return self._sheet

    def append_member(self, member: Member) -> None:
        if not self.enabled:
            return

        try:
            sheet = self._ensure_connected()
            tg_nick = member.tg_username or member.tg_first_name or str(
                member.user_id
            )
            sheet.append_row(
                [
                    tg_nick,
                    member.game_nick,
                    member.discord_nick or "—",
                    member.real_name,
                    member.perspective,
                    str(member.user_id),
                    member.created_at,
                ],
                value_input_option="USER_ENTERED",
            )
        except Exception:
            logger.exception("Failed to sync member to Google Sheets")
