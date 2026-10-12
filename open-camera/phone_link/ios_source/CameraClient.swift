import CryptoKit
import Foundation
import SwiftUI
import UIKit

struct CameraIdentity: Decodable {
    let deviceId: String
    let apiVersion: String
    let mock: Bool
}

struct CameraCapabilities: Decodable {
    let settings: CapabilitySettings
}

struct CapabilitySettings: Decodable {
    let exposureTimeUs: ExposureRange
    let gainDb: GainRange
}

struct ExposureRange: Decodable {
    let min: Int
    let max: Int
}

struct GainRange: Decodable {
    let min: Double
    let max: Double
}

struct CameraSettings: Codable {
    let exposureTimeUs: Int
    let gainDb: Double
}

struct CameraState: Decodable {
    let deviceId: String
    let sensorReady: Bool
    let storageReady: Bool
    let captureCount: Int
    let settings: CameraSettings
    let mock: Bool
}

struct CameraMedia: Decodable, Identifiable {
    let captureId: String
    let requestId: String?
    let source: String
    let status: String
    let createdUnixMs: Int64
    let fileName: String
    let mediaType: String
    let format: String
    let width: Int
    let height: Int
    let sizeBytes: Int
    let sha256: String

    var id: String { captureId }
}

struct CameraMediaList: Decodable {
    let items: [CameraMedia]
}

struct CaptureRequest: Encodable {
    let requestId: String
}

struct CaptureStatus: Decodable {
    let captureId: String
    let status: String
}

enum CameraError: LocalizedError {
    case invalidAddress
    case unexpectedResponse
    case httpStatus(Int)
    case hashMismatch

    var errorDescription: String? {
        switch self {
        case .invalidAddress: "Enter a camera URL such as http://192.168.1.10:8765"
        case .unexpectedResponse: "The camera sent an unexpected response"
        case .httpStatus(let code): "Camera HTTP error \(code)"
        case .hashMismatch: "Downloaded RAW hash does not match the camera"
        }
    }
}

@MainActor
final class CameraClient: ObservableObject {
    @Published private(set) var identity: CameraIdentity?
    @Published private(set) var capabilities: CameraCapabilities?
    @Published private(set) var state: CameraState?
    @Published private(set) var media: [CameraMedia] = []
    @Published private(set) var preview: UIImage?
    @Published private(set) var lastSavedFile: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var busy = false

    private var baseURL: URL?
    private var previewTask: Task<Void, Never>?
    private let session = URLSession(configuration: .ephemeral)
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    deinit {
        previewTask?.cancel()
    }

    func connect(_ address: String) async {
        previewTask?.cancel()
        identity = nil
        capabilities = nil
        state = nil
        media = []
        preview = nil
        do {
            guard let url = URL(string: address), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.host != nil else {
                throw CameraError.invalidAddress
            }
            baseURL = url
            identity = try await get("/v1/identity")
            capabilities = try await get("/v1/capabilities")
            state = try await get("/v1/state")
            try await refreshMedia()
            errorMessage = nil
            startPreview()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func applySettings(exposureTimeUs: Int, gainDb: Double) async {
        do {
            let payload = CameraSettings(exposureTimeUs: exposureTimeUs, gainDb: gainDb)
            var request = URLRequest(url: try endpoint("/v1/settings"))
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(payload)
            let (data, response) = try await session.data(for: request)
            try validate(response)
            _ = try decoder.decode(CameraSettings.self, from: data)
            state = try await get("/v1/state")
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func capture() async {
        busy = true
        defer { busy = false }
        do {
            var request = URLRequest(url: try endpoint("/v1/captures"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(CaptureRequest(requestId: UUID().uuidString.lowercased()))
            let (data, response) = try await session.data(for: request)
            try validate(response)
            _ = try decoder.decode(CaptureStatus.self, from: data)
            state = try await get("/v1/state")
            try await refreshMedia()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refresh() async {
        do {
            state = try await get("/v1/state")
            try await refreshMedia()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func download(_ item: CameraMedia) async {
        busy = true
        defer { busy = false }
        do {
            let (temporary, response) = try await session.download(from: endpoint("/v1/media/\(item.captureId)/raw"))
            try validate(response)
            let handle = try FileHandle(forReadingFrom: temporary)
            var hash = SHA256()
            while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty {
                hash.update(data: chunk)
            }
            try handle.close()
            let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
            guard digest == item.sha256 else { throw CameraError.hashMismatch }
            let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let destination = directory.appendingPathComponent(item.fileName)
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.moveItem(at: temporary, to: destination)
            lastSavedFile = destination.lastPathComponent
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func startPreview() {
        previewTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.loadPreview()
                try? await Task.sleep(for: .milliseconds(100))
            }
        }
    }

    private func loadPreview() async {
        do {
            var request = URLRequest(url: try endpoint("/v1/preview.jpg"))
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, response) = try await session.data(for: request)
            try validate(response)
            if let image = UIImage(data: data) {
                preview = image
            }
        } catch {
            preview = nil
        }
    }

    private func refreshMedia() async throws {
        let result: CameraMediaList = try await get("/v1/media")
        media = result.items
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let (data, response) = try await session.data(from: endpoint(path))
        try validate(response)
        return try decoder.decode(T.self, from: data)
    }

    private func endpoint(_ path: String) throws -> URL {
        guard let baseURL, let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw CameraError.invalidAddress
        }
        return url
    }

    private func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw CameraError.unexpectedResponse }
        guard (200...299).contains(http.statusCode) else { throw CameraError.httpStatus(http.statusCode) }
    }
}
