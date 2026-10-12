import SwiftUI

struct ContentView: View {
    @StateObject private var camera = CameraClient()
    @State private var address = ""
    @State private var exposure = 10000.0
    @State private var gain = 0.0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        TextField("Camera URL, for example http://192.168.1.10:8765", text: $address)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                        Button("Connect") {
                            Task { await camera.connect(address) }
                        }
                    }
                    if let identity = camera.identity {
                        Text("\(identity.deviceId) · \(identity.mock ? "MOCK" : "CAMERA")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if let image = camera.preview {
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else {
                        ContentUnavailableView("No live view", systemImage: "camera.viewfinder")
                    }
                    if let state = camera.state {
                        Text("Sensor \(state.sensorReady ? "ready" : "offline") · Storage \(state.storageReady ? "ready" : "offline") · \(state.captureCount) captures")
                            .font(.caption)
                        if let settings = camera.capabilities?.settings {
                            VStack(alignment: .leading) {
                                Text("Exposure \(Int(exposure)) µs")
                                Slider(value: $exposure, in: Double(settings.exposureTimeUs.min)...Double(settings.exposureTimeUs.max))
                                Text("Gain \(gain, specifier: "%.1f") dB")
                                Slider(value: $gain, in: settings.gainDb.min...settings.gainDb.max)
                                Button("Apply settings") {
                                    Task { await camera.applySettings(exposureTimeUs: Int(exposure), gainDb: gain) }
                                }
                            }
                            .onChange(of: state.settings.exposureTimeUs, initial: true) { _, value in exposure = Double(value) }
                            .onChange(of: state.settings.gainDb, initial: true) { _, value in gain = value }
                        }
                        Button {
                            Task { await camera.capture() }
                        } label: {
                            Label("Shutter", systemImage: "camera")
                                .frame(maxWidth: .infinity)
                                .padding()
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(camera.busy || !state.sensorReady || !state.storageReady)
                    }
                    HStack {
                        Text("On-camera files").font(.headline)
                        Spacer()
                        Button("Refresh") { Task { await camera.refresh() } }
                    }
                    ForEach(camera.media) { item in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(item.fileName).font(.caption)
                                Text("\(item.width) × \(item.height) · \(item.sizeBytes) bytes · \(item.source)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button("Download") { Task { await camera.download(item) } }
                                .disabled(camera.busy)
                        }
                    }
                    if let saved = camera.lastSavedFile {
                        Text("Verified in app Documents: \(saved)").font(.caption)
                    }
                    if let error = camera.errorMessage {
                        Text(error).foregroundStyle(.red).font(.caption)
                    }
                }
                .padding()
            }
            .navigationTitle("FormNerd")
        }
    }
}
