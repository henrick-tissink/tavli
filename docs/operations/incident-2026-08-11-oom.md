# Incident 2026-08-11 — both sites down for ~25 min (on-box build OOM)

> **Status:** Resolved. Root cause identified, box resized and hardened.
> The underlying cause — building on the production host — is **mitigated, not
> removed**. See "What is still not fixed".

`tavli.ro` and `demo.tavli.ro` were both unreachable from roughly **07:36 to
08:00 UTC**, returning Cloudflare **error 522**. Recovery required a hard reset
from the Hetzner Cloud console; the server could not be reached over SSH.

## What happened

Coolify started a deploy at ~07:19. BuildKit ran a full Next.js production build
**on the live server**, which already hosted the Coolify control plane, prod web,
prod worker, and demo. The build's heap request (`--max-old-space-size=4096`)
did not fit in the 3.7 GB the box had at the time.

| Time (UTC) | Event |
|---|---|
| 07:19–07:23 | Deploy starts; BuildKit begins the image build |
| 07:23:15 | `dockerd` logs `span="[builder 5/5] RUN npm run build"` |
| 07:29:19 | Container health checks begin timing out |
| 07:29:23 | First `systemd-journald: Under memory pressure, flushing caches` |
| ~07:30 | RAM 89%, **swap 100% full** (208 KB free of 4 GB), 54 MB available |
| 07:36:50 | Last journal entry — the host stops logging entirely |
| ~08:00 | Hard reset from Hetzner console; services return on their own |

Memory history from `sar` (the box runs `sysstat`, which is why this is
reconstructible at all):

| Time | RAM used | Swap used | Available |
|---|---|---|---|
| 07:10 | 39% | 15% | 1.7 GB |
| 07:20 | 56% | 15% | 1.0 GB |
| 07:30 | **89%** | **100%** | **54 MB** |

**No OOM kill ever fired.** Neither `systemd-oomd` nor `earlyoom` was present, so
nothing selected a victim. With commit at 108.9% and swap exhausted, the kernel
had nowhere to reclaim from and spent all its time in direct reclaim. Userspace
starved rather than any single process being killed.

The deploy that caused this never produced an image — prod continued serving the
previous build (`c4b9b55`).

## Why the diagnosis was non-obvious

The kernel stayed healthy while userspace was paralysed. From outside, that
looked like:

- ICMP: fine, ~30 ms, 0% loss
- TCP handshakes on 22, 80, 443: **all completed**
- HTTP on :80: connected, then **zero bytes**, hang
- Cloudflare: 522 after 90 seconds

A completed TCP handshake with no application response is the kernel accepting
connections into a listen backlog that no process is draining. It is easy to read
this as "the reverse proxy is down".

**The tell that it was host-level: `sshd` was failing the same way as HTTP** —
TCP connect succeeded, then no version banner, even after 70 seconds. If only
Traefik and the app containers were down, SSH would still have worked. Whenever
more than one unrelated service fails at the application layer simultaneously,
suspect the host, not the services.

## What changed

| Change | Detail |
|---|---|
| Server resized | 3.7 GB / 2 vCPU → **7.6 GB / 4 vCPU** |
| `earlyoom` installed | SIGTERM at ≤10% mem+swap, SIGKILL at ≤5%, `--avoid ^(sshd\|systemd\|systemd-journald\|dockerd\|containerd)$` — enabled, survives reboot |
| Build cache pruned | 6.3 GB reclaimed |
| Weekly cleanup cron | `/etc/cron.d/docker-cleanup` — Sundays 04:15, prunes build cache older than 7 d + dangling images (not `-a`, so rollback images survive) |
| journald capped | `SystemMaxUse=500M` (was uncapped, sitting at 2.9 GB) |
| `sysstat` retention | `HISTORY=7` → `HISTORY=30`, so the next incident is still reconstructible a month later |

Disk went from 56% to 33% as a side effect.

`earlyoom` is the load-bearing change. It converts this failure mode from "whole
host livelocks, needs a console reset" into "the build gets killed, the site
stays up, SSH still works".

Already in place and confirmed adequate: Docker log rotation (`10m × 3`) and
`unattended-upgrades`.

## What is still not fixed

Builds still run on the production box, and the Next build still asks for a 4 GB
heap. With 7.6 GB and `earlyoom` the realistic worst case is now a failed deploy
rather than an outage — but a **concurrent prod + demo build** would still be
tight. The real fix is to build in CI (GitHub Actions → registry) and have
Coolify pull the image. That was proposed and deliberately deferred.

There is also **no uptime monitoring** as of this incident; the outage was
noticed by a person. If a monitor is added, set its timeout to ~30 s — Cloudflare
took 90 s to turn the hang into a 522, so a longer timeout would wait rather than
alert.

## Next time a site returns 522

1. `ping` the origin and try TCP on 22/80/443. Kernel alive + ports accepting is
   *not* evidence the host is healthy.
2. **Try SSH and watch for the banner.** No banner = host-level resource
   starvation, and no amount of container restarting will help.
3. If SSH is dead, recover via the Hetzner Cloud console (VNC, or Power → Reset).
   The database is on Supabase, not this box, so a hard reset risks no
   persistent data.
4. After recovery, before cleaning anything up: `journalctl --list-boots` to find
   when logging stopped, then
   `sar -r -f /var/log/sysstat/saNN -s HH:MM:SS -e HH:MM:SS` for the memory and
   swap curve across the incident. Pruning first destroys the evidence.
5. Bound every `journalctl -b -1` query with `--since`/`--until`. This box has
   run 100+ day uptimes; an unbounded scan pegs a CPU for minutes.

## Note on topology

`docs/operations/official-launch-runbook.md` still describes prod as moving to a
"new, separate server". That has not happened — prod and demo share this one box,
which is why a single build outage took both down at once.
