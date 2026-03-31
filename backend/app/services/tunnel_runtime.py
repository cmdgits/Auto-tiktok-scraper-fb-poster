from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
MANUAL_TUNNEL_RESTART_COMMAND = "docker compose up -d --force-recreate tunnel"


def _build_compose_commands() -> list[list[str]]:
    commands: list[list[str]] = []

    docker_executable = shutil.which("docker")
    if docker_executable:
        commands.append([docker_executable, "compose"])

    docker_compose_executable = shutil.which("docker-compose")
    if docker_compose_executable:
        commands.append([docker_compose_executable])

    return commands


def restart_tunnel_service(*, timeout_seconds: int = 120) -> dict:
    commands = _build_compose_commands()
    if not commands:
        return {
            "ok": False,
            "message": (
                "Đã lưu TUNNEL_TOKEN nhưng không thể tự khởi động tunnel vì máy chạy backend không có Docker CLI. "
                f"Hãy chạy `{MANUAL_TUNNEL_RESTART_COMMAND}`."
            ),
            "manual_command": MANUAL_TUNNEL_RESTART_COMMAND,
        }

    errors: list[str] = []
    for base_command in commands:
        command = [*base_command, "up", "-d", "--force-recreate", "tunnel"]
        try:
            result = subprocess.run(
                command,
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                check=False,
            )
        except Exception as exc:
            errors.append(str(exc))
            continue

        stdout = (result.stdout or "").strip()
        stderr = (result.stderr or "").strip()
        if result.returncode == 0:
            return {
                "ok": True,
                "message": "Đã lưu token và gửi lệnh khởi động lại tunnel. Cloudflare thường cần vài giây để cập nhật trạng thái kết nối.",
                "command": " ".join(command),
                "stdout": stdout,
                "stderr": stderr,
            }

        errors.append(stderr or stdout or f"Command exited with code {result.returncode}.")

    return {
        "ok": False,
        "message": (
            "Đã lưu TUNNEL_TOKEN nhưng không thể tự khởi động lại service tunnel. "
            f"Hãy chạy `{MANUAL_TUNNEL_RESTART_COMMAND}`."
        ),
        "manual_command": MANUAL_TUNNEL_RESTART_COMMAND,
        "errors": errors,
    }
