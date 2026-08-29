# Installing Koti (Milestone 0 rebase path)

Until the Stable channel ships an ISO (PRD §93), Koti installs by rebasing a secureblue system. Target: ThinkPad P14s Gen 6 AMD.

## 1. Install secureblue

Follow [secureblue's install guide](https://secureblue.dev/install) and pick **Kinoite** (`kinoite-main-hardened`). During install: UEFI, Secure Boot **on**, full-disk encryption **on**, Wayland session (PRD §94).

## 2. Registry auth (only while the package is private)

The device needs a token to pull from a private ghcr package. Create a classic GitHub PAT with the `read:packages` scope (github.com/settings/tokens), then:

```bash
TOKEN='<paste token>'
sudo mkdir -p /etc/ostree
printf '{"auths":{"ghcr.io":{"auth":"%s"}}}' \
  "$(printf '%s' "MarianoMiguel:$TOKEN" | base64 -w0)" | sudo tee /etc/ostree/auth.json >/dev/null
sudo chmod 600 /etc/ostree/auth.json
```

(If the repo goes public — task M0-10 — skip this step.)

## 3. First rebase (unverified hop)

```bash
rpm-ostree rebase ostree-unverified-registry:ghcr.io/marianomiguel/koti:latest
systemctl reboot
```

## 4. Switch to the signed reference

The image's signing module installs the container policy and cosign public key, so after the first boot you can pin to verified pulls:

```bash
rpm-ostree rebase ostree-image-signed:docker://ghcr.io/marianomiguel/koti:latest
systemctl reboot
```

## 5. Verify

```bash
rpm-ostree status          # deployment should show the koti image
cat /usr/share/koti/koti-release
```

## Updating

```bash
rpm-ostree upgrade         # pulls the latest signed image
```

## Rollback

```bash
rpm-ostree rollback && systemctl reboot
```

The previous deployment is always kept (PRD §88).
