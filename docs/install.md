# Installing Koti (rebase path)

Until the Stable channel ships an ISO (PRD §93), Koti installs by rebasing a secureblue system. Target: ThinkPad P14s Gen 6 AMD. The ghcr package is public — no registry auth is needed.

## 1. Install secureblue

Follow [secureblue's install guide](https://secureblue.dev/install) and pick **Kinoite** (`kinoite-main-hardened`). During install: UEFI, Secure Boot **on**, full-disk encryption **on**, Wayland session (PRD §94).

Two facts about the freshly installed host (learned on real hardware, 2026-08-29):

- there is no `sudo` — elevation is systemd's **`run0`**;
- piping into `run0` is unreliable (it runs commands in a fresh PTY) — stage files in `/tmp`, then `run0 cp`;
- **never put `run0` in front of `rpm-ostree`.** It authenticates fine and then dies on SELinux, because `/usr/bin/rpm-ostree` is labelled `install_exec_t` and `run0` launches it from `unconfined_t`:

  ```text
  avc: denied { entrypoint } for comm="(rpm-ostree)" path="/usr/bin/rpm-ostree"
  scontext=unconfined_u:unconfined_r:unconfined_t tcontext=system_u:object_r:install_exec_t
  Failed at step EXEC spawning /usr/bin/rpm-ostree: Permission denied
  ```

  `rpm-ostree` needs no elevation from you: the CLI talks to `rpm-ostreed` over D-Bus and the daemon authorises you through polkit (`org.projectatomic.rpmostree1.policy`), so run it as yourself and answer the prompt.

## 2. Register Koti's signing key (one time)

secureblue's container policy **default-rejects** images it cannot verify — including rebase pulls. Don't weaken it; register Koti's cosign key so the very first pull is signature-verified (default-reject stays intact for every other registry):

```bash
curl -fsSL https://raw.githubusercontent.com/MarianoMiguel/koti/main/cosign.pub -o /tmp/koti.pub
run0 mkdir -p /etc/pki/containers /etc/containers/registries.d
run0 cp /tmp/koti.pub /etc/pki/containers/koti.pub

# NOTE: do *not* add a registries.d file of your own here. The Koti image
# already ships /usr/etc/containers/registries.d/marianomiguel-koti.yaml with
# exactly this content, and two files declaring the same namespace make the
# whole container config fail to parse:
#
#   Error parsing signature storage configuration: "docker" namespace
#   "ghcr.io/marianomiguel/koti" defined both in ".../marianomiguel-koti.yaml"
#   and ".../koti.yaml"
#
# which blocks every rpm-ostree update until one is removed. Before the first
# pull the image is not on disk yet, so this one file is needed — and it must
# be deleted right after the rebase (step 5).
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

## 4. Remove the bootstrap registries.d file

Now that the image is on disk it carries its own
`/usr/etc/containers/registries.d/marianomiguel-koti.yaml`, and the bootstrap
copy from step 2 is a duplicate declaration of the same namespace. Leave both in
place and every later `rpm-ostree upgrade` fails before it starts:

```text
error: Preparing import: Fetching manifest: failed to invoke method OpenImage:
Error parsing signature storage configuration: "docker" namespace
"ghcr.io/marianomiguel/koti" defined both in
"/etc/containers/registries.d/marianomiguel-koti.yaml" and
"/etc/containers/registries.d/koti.yaml"
```

```bash
run0 rm -f /etc/containers/registries.d/koti.yaml
rpm-ostree upgrade --check   # should now reach the registry
```

Keep `/etc/pki/containers/koti.pub` and the `policy.json` entry — the image does
not ship the public key, so those are what keep the pull signature-verified.

## 5. Verify

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
