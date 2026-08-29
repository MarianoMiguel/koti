# Installing Koti (rebase path)

Until the Stable channel ships an ISO (PRD §93), Koti installs by rebasing a secureblue system. Target: ThinkPad P14s Gen 6 AMD. The ghcr package is public — no registry auth is needed.

## 1. Install secureblue

Follow [secureblue's install guide](https://secureblue.dev/install) and pick **Kinoite** (`kinoite-main-hardened`). During install: UEFI, Secure Boot **on**, full-disk encryption **on**, Wayland session (PRD §94).

Two facts about the freshly installed host (learned on real hardware, 2026-08-29):

- there is no `sudo` — elevation is systemd's **`run0`**;
- piping into `run0` is unreliable (it runs commands in a fresh PTY) — stage files in `/tmp`, then `run0 cp`.

## 2. Register Koti's signing key (one time)

secureblue's container policy **default-rejects** images it cannot verify — including rebase pulls. Don't weaken it; register Koti's cosign key so the very first pull is signature-verified (default-reject stays intact for every other registry):

```bash
curl -fsSL https://raw.githubusercontent.com/MarianoMiguel/koti/main/cosign.pub -o /tmp/koti.pub
run0 mkdir -p /etc/pki/containers /etc/containers/registries.d
run0 cp /tmp/koti.pub /etc/pki/containers/koti.pub

printf 'docker:\n  ghcr.io/marianomiguel/koti:\n    use-sigstore-attachments: true\n' > /tmp/koti-reg.yaml
run0 cp /tmp/koti-reg.yaml /etc/containers/registries.d/koti.yaml

run0 cp /etc/containers/policy.json /etc/containers/policy.json.bak
python3 - <<'EOF' > /tmp/policy.json
import json
p = json.load(open('/etc/containers/policy.json'))
p.setdefault('transports', {}).setdefault('docker', {})['ghcr.io/marianomiguel/koti'] = [{
    'type': 'sigstoreSigned',
    'keyPath': '/etc/pki/containers/koti.pub',
    'signedIdentity': {'type': 'matchRepository'},
}]
print(json.dumps(p, indent=2))
EOF
run0 cp /tmp/policy.json /etc/containers/policy.json
```

## 3. Rebase to Koti — signature-verified from the first pull

```bash
rpm-ostree rebase ostree-image-signed:docker://ghcr.io/marianomiguel/koti:latest
systemctl reboot
```

## 4. Verify

```bash
rpm-ostree status -b               # booted deployment should be the koti image
cat /usr/share/koti/koti-release
osctl status
```

## Updating

```bash
rpm-ostree upgrade                 # pulls the latest signed image
```

## Rollback

```bash
rpm-ostree rollback && systemctl reboot
```

The previous deployment is always kept (PRD §88).
