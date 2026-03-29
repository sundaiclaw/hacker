# GCloud SSH Reference

Common patterns for working with the OpenClaw VM via `gcloud compute ssh`.

## Connection details

```
VM:      openclaw-vm
Zone:    us-central1-a
Project: project-3930b9ab-6eae-4b3a-959
```

## Basic SSH

```bash
gcloud compute ssh --zone "us-central1-a" "openclaw-vm" --project "project-3930b9ab-6eae-4b3a-959"
```

## Run a remote command

Use `--` to separate gcloud args from the remote command:

```bash
gcloud compute ssh --zone "us-central1-a" "openclaw-vm" \
  --project "project-3930b9ab-6eae-4b3a-959" \
  -- "ls /home/openclaw"
```

Without `--`, gcloud treats the remote command as its own arguments and errors with `unrecognized arguments`.

## Run as a different user

### Option 1: sudo -u (no key setup needed)

SSH in as yourself, run command as another user:

```bash
gcloud compute ssh --zone "us-central1-a" "openclaw-vm" \
  --project "project-3930b9ab-6eae-4b3a-959" \
  -- "sudo -u openclaw fabro provider login --provider openai"
```

### Option 2: --ssh-flag="-l <user>" (requires authorized_keys)

```bash
gcloud compute ssh --zone "us-central1-a" "openclaw-vm" \
  --project "project-3930b9ab-6eae-4b3a-959" \
  --ssh-flag="-l openclaw"
```

This requires your public key in `/home/openclaw/.ssh/authorized_keys`. To set that up:

```bash
gcloud compute ssh --zone "us-central1-a" "openclaw-vm" \
  --project "project-3930b9ab-6eae-4b3a-959" \
  -- "sudo mkdir -p /home/openclaw/.ssh && \
      cat ~/.ssh/authorized_keys | sudo tee -a /home/openclaw/.ssh/authorized_keys > /dev/null && \
      sudo chown -R openclaw:openclaw /home/openclaw/.ssh && \
      sudo chmod 700 /home/openclaw/.ssh && \
      sudo chmod 600 /home/openclaw/.ssh/authorized_keys"
```

### Option 3: sudo su (interactive shell as another user)

SSH in as yourself, then switch:

```bash
gcloud compute ssh --zone "us-central1-a" "openclaw-vm" \
  --project "project-3930b9ab-6eae-4b3a-959"
# then on the machine:
sudo su - openclaw
```

This gives a full interactive shell with `HOME=/home/openclaw`.

## Port forwarding / SSH tunnels

Use `--ssh-flag` for each SSH option:

```bash
gcloud compute ssh --zone "us-central1-a" "openclaw-vm" \
  --project "project-3930b9ab-6eae-4b3a-959" \
  --ssh-flag="-N" \
  --ssh-flag="-L 18789:127.0.0.1:18789"
```

This forwards local port 18789 to the VM's 127.0.0.1:18789. Works regardless of which user you SSH in as — the tunnel is at the network level.

## Fabro setup on the VM

Fabro is self-contained — it calls LLM APIs directly, no `claude` or `codex` CLI needed. Just needs:

1. The `fabro` binary installed
2. API keys configured via `fabro provider login`

### Known issue: glibc compatibility

The official fabro binary requires glibc >= 2.38. On Ubuntu 22.04 (glibc 2.35) it fails with:

```
/lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.38' not found
```

Workarounds:
- Use Ubuntu 24.04+ (glibc 2.39)
- Build from source: `apt-get install -y pkg-config libssl-dev && cargo install fabro`
- Upstream issue: https://github.com/fabro-sh/fabro/issues/147

### Configure API keys

SSH in as the openclaw user (or use sudo), then:

```bash
fabro provider login --provider openai
fabro provider login --provider anthropic
```

Keys are stored in `~/.fabro/.env`.
