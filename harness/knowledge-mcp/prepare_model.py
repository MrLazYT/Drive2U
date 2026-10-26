"""Download public pinned model artifacts only. Never opens the vault."""
import json
import os
from pathlib import Path
import time

from semantic import MODEL_ID, MODEL_REVISION, safe_directory


def main():
    from huggingface_hub import snapshot_download
    app = Path(os.environ['DRIVE2U_APP_ROOT']).resolve(strict=True)
    target = safe_directory(app, '.knowledge-models/' + MODEL_REVISION)
    start = time.perf_counter()
    snapshot_download(MODEL_ID, revision=MODEL_REVISION, local_dir=target,
        token=False, allow_patterns=['*.json', '*.txt', '*.model', 'model.safetensors',
                                     '1_Pooling/config.json'],
        ignore_patterns=['onnx/*', 'openvino/*'])
    print(json.dumps({'model':MODEL_ID,'revision':MODEL_REVISION,
                      'download_seconds':time.perf_counter()-start}))


if __name__ == '__main__':
    main()
