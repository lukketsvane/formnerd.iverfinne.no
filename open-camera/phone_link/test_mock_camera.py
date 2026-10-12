import hashlib
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import uuid

from mock_camera import CameraState, make_server


class MockCameraTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.storage = tempfile.TemporaryDirectory()
        cls.server = make_server("127.0.0.1", 0, cls.storage.name)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.storage.cleanup()

    def request(self, path, method="GET", data=None, headers=None):
        body = json.dumps(data).encode("utf-8") if data is not None else None
        header = {"Content-Type": "application/json"} if data is not None else {}
        header.update(headers or {})
        request = urllib.request.Request(self.base + path, data=body, headers=header, method=method)
        return urllib.request.urlopen(request, timeout=5)

    def test_health_identity_state_and_capabilities(self):
        with self.request("/v1/health") as response:
            self.assertEqual(json.load(response)["status"], "ok")
        with self.request("/v1/identity") as response:
            self.assertTrue(json.load(response)["mock"])
        with self.request("/v1/capabilities") as response:
            self.assertEqual(json.load(response)["sensor"]["format"], "synthetic-raw16-le")
        with self.request("/v1/state") as response:
            self.assertTrue(json.load(response)["sensor_ready"])

    def test_settings_validation_and_capture_idempotency(self):
        with self.request("/v1/settings", "PATCH", {"exposure_time_us": 12000, "gain_db": 2.5}) as response:
            self.assertEqual(json.load(response)["gain_db"], 2.5)
        with self.assertRaises(urllib.error.HTTPError) as invalid:
            self.request("/v1/settings", "PATCH", {"gain_db": 50})
        self.assertEqual(invalid.exception.code, 422)
        request_id = str(uuid.uuid4())
        with self.request("/v1/captures", "POST", {"request_id": request_id}) as response:
            first = json.load(response)
        with self.request("/v1/captures", "POST", {"request_id": request_id}) as response:
            second = json.load(response)
        self.assertEqual(first["capture_id"], second["capture_id"])
        self.assertEqual(first["exposure_time_us"], 12000)
        self.assertEqual(first["source"], "remote")
        with self.request("/v1/captures/" + first["capture_id"]) as response:
            self.assertEqual(json.load(response)["status"], "ready")

    def test_raw_transfer_range_etag_and_hash(self):
        capture = self.server.state.capture("physical")
        path = f"/v1/media/{capture['capture_id']}/raw"
        with self.request(path) as response:
            content = response.read()
            self.assertEqual(response.headers["ETag"], '"' + capture["sha256"] + '"')
            self.assertEqual(response.headers["Accept-Ranges"], "bytes")
        self.assertEqual(hashlib.sha256(content).hexdigest(), capture["sha256"])
        self.assertEqual(len(content), 256 * 170 * 2)
        with self.request(path, headers={"Range": "bytes=100-199"}) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.headers["Content-Range"], f"bytes 100-199/{len(content)}")
            self.assertEqual(response.read(), content[100:200])
        with self.assertRaises(urllib.error.HTTPError) as invalid:
            self.request(path, headers={"Range": "bytes=999999-"})
        self.assertEqual(invalid.exception.code, 416)
        restored = CameraState(self.storage.name)
        self.assertIn(capture["capture_id"], restored.captures)

    def test_jpeg_preview_and_mjpeg(self):
        with self.request("/v1/preview.jpg") as response:
            frame = response.read()
            self.assertEqual(response.headers["Content-Type"], "image/jpeg")
            self.assertEqual(frame[:2], b"\xff\xd8")
            first_sequence = int(response.headers["X-Frame-Sequence"])
        with self.request("/v1/preview.jpg") as response:
            self.assertEqual(int(response.headers["X-Frame-Sequence"]), first_sequence + 1)
        with self.request("/v1/preview.mjpeg") as response:
            self.assertTrue(response.headers["Content-Type"].startswith("multipart/x-mixed-replace"))
            self.assertIn(b"Content-Type: image/jpeg", response.read(120))


if __name__ == "__main__":
    unittest.main()
