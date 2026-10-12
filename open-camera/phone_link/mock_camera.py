import argparse
import hashlib
import json
import os
import re
import threading
import time
import uuid
from array import array
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
FRAMES = sorted((ROOT / "fixtures").glob("preview_*.jpg"))
CAPTURE_RE = re.compile(r"^/v1/captures/([0-9a-f-]+)$")
MEDIA_RE = re.compile(r"^/v1/media/([0-9a-f-]+)/raw$")


class CameraState:
    def __init__(self, storage):
        self.storage = Path(storage)
        self.storage.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.captures = {}
        self.requests = {}
        self.sequence = 0
        self.settings = {"exposure_time_us": 10000, "gain_db": 0.0}
        for manifest in self.storage.glob("*.json"):
            item = json.loads(manifest.read_text(encoding="utf-8"))
            if (self.storage / item["file_name"]).exists():
                self.captures[item["capture_id"]] = item
                if item.get("request_id"):
                    self.requests[item["request_id"]] = item["capture_id"]

    def capture(self, source, request_id=None):
        with self.lock:
            if request_id and request_id in self.requests:
                return self.captures[self.requests[request_id]]
            capture_id = str(uuid.uuid4())
            width = 256
            height = 170
            pixels = array("H", ((x * 47 + y * 83) % 15000 + 512 for y in range(height) for x in range(width)))
            if os.sys.byteorder != "little":
                pixels.byteswap()
            content = pixels.tobytes()
            digest = hashlib.sha256(content).hexdigest()
            name = f"{capture_id}.raw16"
            temporary = self.storage / f"{name}.part"
            final = self.storage / name
            with temporary.open("wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            temporary.replace(final)
            item = {
                "capture_id": capture_id,
                "request_id": request_id,
                "source": source,
                "status": "ready",
                "created_unix_ms": int(time.time() * 1000),
                "file_name": name,
                "media_type": "application/octet-stream",
                "format": "synthetic-raw16-le",
                "width": width,
                "height": height,
                "cfa": "RGGB",
                "black_level": 512,
                "white_level": 15511,
                "exposure_time_us": self.settings["exposure_time_us"],
                "gain_db": self.settings["gain_db"],
                "size_bytes": len(content),
                "sha256": digest,
            }
            manifest = self.storage / f"{capture_id}.json"
            temporary_manifest = self.storage / f"{capture_id}.json.part"
            with temporary_manifest.open("w", encoding="utf-8") as handle:
                json.dump(item, handle, sort_keys=True)
                handle.flush()
                os.fsync(handle.fileno())
            temporary_manifest.replace(manifest)
            self.captures[capture_id] = item
            if request_id:
                self.requests[request_id] = capture_id
            return item

    def list_media(self):
        with self.lock:
            return sorted(self.captures.values(), key=lambda item: item["created_unix_ms"], reverse=True)


def make_server(bind, port, storage):
    state = CameraState(storage)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def send_json(self, status, value):
            data = json.dumps(value, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def read_json(self):
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > 16384:
                raise ValueError("invalid-body-size")
            return json.loads(self.rfile.read(size))

        def send_error_json(self, status, code):
            self.send_json(status, {"error": code})

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/v1/health":
                self.send_json(200, {"status": "ok", "mock": True})
            elif path == "/v1/identity":
                self.send_json(200, {"device_id": "formnerd-mock", "api_version": "1.0", "mock": True})
            elif path == "/v1/capabilities":
                self.send_json(200, {"api_version": "1.0", "mock": True, "sensor": {"width": 256, "height": 170, "format": "synthetic-raw16-le"}, "settings": {"exposure_time_us": {"min": 100, "max": 1000000}, "gain_db": {"min": 0, "max": 24}}, "preview": {"width": 800, "height": 533, "format": "image/jpeg"}})
            elif path == "/v1/state":
                self.send_json(200, {"device_id": "formnerd-mock", "sensor_ready": True, "storage_ready": True, "capture_count": len(state.captures), "settings": state.settings.copy(), "mock": True})
            elif path == "/v1/media":
                self.send_json(200, {"items": state.list_media()})
            elif path == "/v1/preview.jpg":
                self.send_preview()
            elif path == "/v1/preview.mjpeg":
                self.send_mjpeg()
            elif match := CAPTURE_RE.match(path):
                item = state.captures.get(match.group(1))
                self.send_json(200, item) if item else self.send_error_json(404, "capture-not-found")
            elif match := MEDIA_RE.match(path):
                item = state.captures.get(match.group(1))
                self.send_media(item) if item else self.send_error_json(404, "media-not-found")
            else:
                self.send_error_json(404, "path-not-found")

        def send_preview(self):
            if not FRAMES:
                self.send_error_json(503, "preview-fixtures-missing")
                return
            with state.lock:
                number = state.sequence
                state.sequence += 1
            data = FRAMES[number % len(FRAMES)].read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Frame-Sequence", str(number))
            self.send_header("X-Frame-Unix-Ms", str(int(time.time() * 1000)))
            self.end_headers()
            self.wfile.write(data)

        def send_mjpeg(self):
            if not FRAMES:
                self.send_error_json(503, "preview-fixtures-missing")
                return
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                while True:
                    with state.lock:
                        number = state.sequence
                        state.sequence += 1
                    data = FRAMES[number % len(FRAMES)].read_bytes()
                    header = f"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {len(data)}\r\nX-Frame-Sequence: {number}\r\nX-Frame-Unix-Ms: {int(time.time() * 1000)}\r\n\r\n".encode("ascii")
                    self.wfile.write(header + data + b"\r\n")
                    self.wfile.flush()
                    time.sleep(1 / 15)
            except (BrokenPipeError, ConnectionResetError):
                return

        def send_media(self, item):
            file = state.storage / item["file_name"]
            size = item["size_bytes"]
            etag = '"' + item["sha256"] + '"'
            range_header = self.headers.get("Range")
            start = 0
            end = size - 1
            status = 200
            if range_header:
                match = re.fullmatch(r"bytes=(\d+)-(\d*)", range_header)
                if not match:
                    self.send_error_json(416, "invalid-range")
                    return
                start = int(match.group(1))
                end = int(match.group(2)) if match.group(2) else size - 1
                if start >= size or end < start:
                    self.send_error_json(416, "invalid-range")
                    return
                end = min(end, size - 1)
                status = 206
            self.send_response(status)
            self.send_header("Content-Type", item["media_type"])
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-store")
            if status == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            with file.open("rb") as handle:
                handle.seek(start)
                self.wfile.write(handle.read(end - start + 1))

        def do_POST(self):
            if urlparse(self.path).path != "/v1/captures":
                self.send_error_json(404, "path-not-found")
                return
            try:
                body = self.read_json()
                request_id = str(uuid.UUID(body["request_id"]))
            except (ValueError, KeyError, TypeError, json.JSONDecodeError):
                self.send_error_json(422, "invalid-capture-request")
                return
            self.send_json(201, state.capture("remote", request_id))

        def do_PATCH(self):
            if urlparse(self.path).path != "/v1/settings":
                self.send_error_json(404, "path-not-found")
                return
            try:
                body = self.read_json()
                if not body or set(body) - {"exposure_time_us", "gain_db"}:
                    raise ValueError("unsupported-setting")
                exposure = body.get("exposure_time_us", state.settings["exposure_time_us"])
                gain = body.get("gain_db", state.settings["gain_db"])
                if not isinstance(exposure, int) or isinstance(exposure, bool) or not 100 <= exposure <= 1000000:
                    raise ValueError("invalid-exposure")
                if not isinstance(gain, (int, float)) or isinstance(gain, bool) or not 0 <= gain <= 24:
                    raise ValueError("invalid-gain")
            except (ValueError, TypeError, json.JSONDecodeError):
                self.send_error_json(422, "invalid-settings")
                return
            with state.lock:
                state.settings.update({"exposure_time_us": exposure, "gain_db": gain})
                result = state.settings.copy()
            self.send_json(200, result)

        def log_message(self, format, *args):
            return

    server = ThreadingHTTPServer((bind, port), Handler)
    server.state = state
    return server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--storage", default=str(ROOT / "mock_storage"))
    arguments = parser.parse_args()
    server = make_server(arguments.bind, arguments.port, arguments.storage)
    print(f"FormNerd mock http://{arguments.bind}:{server.server_port}/v1/identity", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
