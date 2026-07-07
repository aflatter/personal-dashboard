#!/usr/bin/env python3
"""SessionEnd hook: stop this worktree's devenv processes and kill any
processes still rooted in the worktree directory when a Claude Code session
ends for real (e.g. it is archived).

Registered in .claude/settings.json under `SessionEnd`. Claude Code pipes a
JSON payload on stdin, e.g.:

    {"session_id": "...", "cwd": "/path/to/worktree",
     "hook_event_name": "SessionEnd", "reason": "other",
     "transcript_path": "/path/to/transcript.jsonl"}

Behaviour by `reason`:
  * clear / resume  -> do NOTHING. `/clear` ends the session but immediately
                       starts a fresh one in the SAME worktree, so tearing
                       processes down would kill the dev server you are still
                       using. `resume` hands the session off elsewhere.
  * everything else -> tear down. `other` is what archiving maps to; `logout`
    (other, logout,    and `prompt_input_exit` also mean this session is done.
     prompt_input_exit)

Cleanup steps (best effort, never blocks session end):
  1. `devenv processes down` in the worktree (graceful stop of collector +
     dashboard/vite that devenv manages).
  2. Scan for any process whose current working directory is inside the
     worktree, SIGTERM then SIGKILL the survivors. This is the backstop for
     dev servers started outside devenv (preview_start, a manual `pnpm dev`)
     and for devenv children that did not exit in step 1.

Safety: the hook never kills its own process ancestry (which includes the
Claude Code app, the launching shell, and this script), nor anything whose
command looks like Claude itself or a login shell, nor a process with no
readable command (already exited / unclassifiable).
"""

import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime

LOG_PATH = "/tmp/claude-worktree-cleanup.log"

# reasons on which we deliberately leave every process running
SKIP_REASONS = {"clear", "resume"}

# command substrings we refuse to kill, even if their cwd is in the worktree
NEVER_KILL = ("Claude.app", "claude-code", "/claude ", "disclaimer",
              "-zsh", "zsh -l", "bash -l", "/sbin/launchd")

DEVENV_DOWN_TIMEOUT = 30   # seconds
TERM_GRACE = 4.0           # seconds to wait after SIGTERM before SIGKILL


def log(msg):
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(f"[stop-worktree-processes] {msg}", file=sys.stderr)
    try:
        with open(LOG_PATH, "a") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def read_payload():
    try:
        return json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return {}


def ancestor_pids(start_pid):
    """Walk parent pids up to the root so we never signal ourselves or the
    Claude Code process that spawned this hook."""
    seen = set()
    pid = start_pid
    while pid and pid > 1 and pid not in seen:
        seen.add(pid)
        try:
            out = subprocess.run(
                ["ps", "-o", "ppid=", "-p", str(pid)],
                capture_output=True, text=True, timeout=5,
            ).stdout.strip()
            pid = int(out) if out else 0
        except (subprocess.SubprocessError, ValueError):
            break
    return seen


def command_of(pid):
    try:
        return subprocess.run(
            ["ps", "-o", "command=", "-p", str(pid)],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()
    except subprocess.SubprocessError:
        return ""


def pids_rooted_in(directory):
    """Return {pid: command} for every process whose cwd is at or under
    `directory`, using `lsof -d cwd`."""
    target = os.path.realpath(directory)
    try:
        out = subprocess.run(
            ["lsof", "-d", "cwd", "-a", "-w", "-Fpn"],
            capture_output=True, text=True, timeout=20,
        ).stdout
    except subprocess.SubprocessError as exc:
        log(f"lsof failed: {exc}")
        return {}

    found = {}
    pid = None
    for line in out.splitlines():
        if not line:
            continue
        tag, val = line[0], line[1:]
        if tag == "p":
            try:
                pid = int(val)
            except ValueError:
                pid = None
        elif tag == "n" and pid is not None:
            path = os.path.realpath(val)
            if path == target or path.startswith(target + os.sep):
                found[pid] = command_of(pid)
            pid = None
    return found


def devenv_down(cwd):
    if not os.path.exists(os.path.join(cwd, "devenv.nix")):
        return
    if not os.path.exists(os.path.join(cwd, ".devenv", "run")):
        log("no .devenv/run present; devenv processes not running here")
        return
    log(f"running `devenv processes down` in {cwd}")
    try:
        result = subprocess.run(
            ["devenv", "processes", "down"],
            cwd=cwd, capture_output=True, text=True,
            timeout=DEVENV_DOWN_TIMEOUT,
        )
        if result.returncode != 0:
            log(f"devenv processes down exited {result.returncode}: "
                f"{result.stderr.strip()[:300]}")
        else:
            log("devenv processes down completed")
    except FileNotFoundError:
        log("devenv not on PATH; skipping graceful stop")
    except subprocess.TimeoutExpired:
        log("devenv processes down timed out; orphan scan will back it up")


def kill_orphans(cwd):
    protected = ancestor_pids(os.getpid())
    candidates = pids_rooted_in(cwd)

    targets = {}
    for pid, cmd in candidates.items():
        if pid in protected:
            continue
        if not cmd.strip():
            # No command means the process already exited (or we cannot read
            # it) — nothing safe to classify, so leave it alone.
            continue
        if any(token in cmd for token in NEVER_KILL):
            log(f"skip protected pid {pid}: {cmd[:80]}")
            continue
        targets[pid] = cmd

    if not targets:
        log("no orphaned processes rooted in the worktree")
        return

    for pid, cmd in targets.items():
        log(f"SIGTERM {pid}: {cmd[:80]}")
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        except PermissionError:
            log(f"not permitted to signal {pid}")

    deadline = time.monotonic() + TERM_GRACE
    while time.monotonic() < deadline:
        if not any(_alive(pid) for pid in targets):
            break
        time.sleep(0.25)

    for pid, cmd in targets.items():
        if _alive(pid):
            log(f"SIGKILL {pid}: {cmd[:80]}")
            try:
                os.kill(pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass


def _alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def main():
    payload = read_payload()
    reason = payload.get("reason", "") or "unknown"
    cwd = payload.get("cwd", "") or ""
    log(f"SessionEnd reason={reason} cwd={cwd or 'unknown'}")

    if reason in SKIP_REASONS:
        log(f"reason={reason}: leaving all processes running")
        return

    if not cwd or not os.path.isdir(cwd):
        log("no usable cwd; nothing to clean up")
        return

    devenv_down(cwd)
    kill_orphans(cwd)
    log("cleanup complete")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # never let cleanup failure surface as an error
        log(f"unexpected error: {exc!r}")
    sys.exit(0)
