# AI endpoint integration (Compute Community)

Use this endpoint for every Sundai project that requires AI.

## Environment variables

```bash
CC_API_KEY=...
CC_BASE_URL=https://computecommunity.com/sundai-server/v1
CC_MODEL=MiniMaxAI/MiniMax-M2.5
```

## Python example

```python
import os
import requests
import time

API_KEY = os.environ["CC_API_KEY"]
BASE_URL = os.getenv("CC_BASE_URL", "https://computecommunity.com/sundai-server/v1")
MODEL = os.getenv("CC_MODEL", "MiniMaxAI/MiniMax-M2.5")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

def chat(messages, retries=3):
    for attempt in range(retries):
        resp = requests.post(
            f"{BASE_URL}/chat/completions",
            headers=headers,
            json={"model": MODEL, "messages": messages},
            timeout=120,
        )
        if resp.status_code == 500 and attempt < retries - 1:
            time.sleep(5)
            continue
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
```

## Minimal test prompt

```python
reply = chat([
  {"role": "user", "content": "Say hello in one line and confirm model identity briefly."}
])
print(reply)
```
