# AI endpoint integration (OpenRouter free models)

Use OpenRouter free models for Sundai projects.

## Environment variables

```bash
OPENROUTER_API_KEY=...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openrouter/auto
```

> Prefer an explicit free model from: https://openrouter.ai/openrouter/free

## Python example

```python
import os
import requests
import time

API_KEY = os.environ["OPENROUTER_API_KEY"]
BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/auto")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://www.sundai.club",
    "X-Title": "Sundai Project Pipeline"
}

def chat(messages, retries=3):
    for attempt in range(retries):
        resp = requests.post(
            f"{BASE_URL}/chat/completions",
            headers=headers,
            json={"model": MODEL, "messages": messages},
            timeout=120,
        )
        if resp.status_code >= 500 and attempt < retries - 1:
            time.sleep(5)
            continue
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
```
