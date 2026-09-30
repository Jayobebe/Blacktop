import AVFoundation
import Capacitor

/**
 * iOS twin of android/.../AlarmSoundPlugin.java, registered in MainViewController.
 * The anti-theft alarm's siren and chirps, and the auto-rescue siren, played
 * natively on the phone's own loudspeaker: while one sounds the audio session
 * is switched to play-and-record without Bluetooth routes and overridden to
 * the speaker, so a helmet intercom doesn't swallow it. The previous session
 * is put back afterwards (voice chat re-applies its own when it next talks).
 * iOS has no app pinning (Guided Access is the rider's own setting), so
 * pinApp / unpinApp do nothing.
 */
@objc(AlarmSoundPlugin)
public class AlarmSoundPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AlarmSoundPlugin"
    public let jsName = "AlarmSound"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startSiren", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSiren", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "chirp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pinApp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unpinApp", returnType: CAPPluginReturnPromise),
    ]

    private let rate = 44100.0
    private var engine: AVAudioEngine?
    private var siren: AVAudioSourceNode?
    private var saved: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?
    private var users = 0

    // Siren oscillators (touched only on the render thread once running).
    private var a = 0.0, b = 0.0, lfo = 0.0, level = 0.0
    private var sirenOn = false

    @objc func startSiren(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.siren == nil, let engine = self.takeSpeaker() else { call.resolve(); return }
            self.sirenOn = true
            let node = AVAudioSourceNode { [weak self] _, _, frames, list -> OSStatus in
                guard let self = self else { return noErr }
                let buffers = UnsafeMutableAudioBufferListPointer(list)
                for f in 0..<Int(frames) {
                    self.lfo += 0.95 / self.rate
                    if self.lfo >= 1 { self.lfo -= 1 }
                    let tri = self.lfo < 0.5 ? 4 * self.lfo - 1 : 3 - 4 * self.lfo
                    self.a += (1050 + 450 * tri) / self.rate
                    if self.a >= 1 { self.a -= 1 }
                    self.b += (1060 + 450 * tri) / self.rate
                    if self.b >= 1 { self.b -= 1 }
                    self.level = self.sirenOn ? min(1, self.level + 1 / (self.rate * 0.08)) : max(0, self.level - 1 / (self.rate * 0.12))
                    let v = (0.55 * (2 * self.a - 1) + 0.35 * (self.b < 0.5 ? 1 : -1)) * 0.9 * self.level
                    for buffer in buffers {
                        buffer.mData?.assumingMemoryBound(to: Float.self)[f] = Float(v)
                    }
                }
                return noErr
            }
            let format = AVAudioFormat(standardFormatWithSampleRate: self.rate, channels: 1)
            engine.attach(node)
            engine.connect(node, to: engine.mainMixerNode, format: format)
            self.siren = node
            try? engine.start()
            call.resolve()
        }
    }

    @objc func stopSiren(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let node = self.siren else { call.resolve(); return }
            self.sirenOn = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                self.engine?.detach(node)
                self.siren = nil
                self.level = 0
                self.giveBackSpeaker()
            }
            call.resolve()
        }
    }

    @objc func chirp(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "nudge"
        DispatchQueue.main.async {
            guard let engine = self.takeSpeaker() else { call.resolve(); return }
            // {start s, Hz, length s, level}, as the Android and web chirps.
            let tones: [[Double]]
            switch kind {
            case "arm": tones = [[0, 880, 0.09, 0.4], [0.13, 1320, 0.12, 0.4]]
            case "disarm": tones = [[0, 1320, 0.09, 0.36], [0.13, 880, 0.14, 0.36]]
            case "entry": tones = [[0, 1800, 0.06, 0.45], [0.1, 1800, 0.06, 0.45]]
            default: tones = [[0, 1500, 0.07, 0.42]]
            }
            let length = tones.map { $0[0] + $0[2] }.max() ?? 0.1
            let format = AVAudioFormat(standardFormatWithSampleRate: self.rate, channels: 1)!
            let count = AVAudioFrameCount((length + 0.03) * self.rate)
            guard let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count) else { self.giveBackSpeaker(); call.resolve(); return }
            pcm.frameLength = count
            let out = pcm.floatChannelData![0]
            for i in 0..<Int(count) { out[i] = 0 }
            for tone in tones {
                let start = Int(tone[0] * self.rate), len = Int(tone[2] * self.rate)
                var phase = 0.0
                for i in 0..<len where start + i < Int(count) {
                    phase += tone[1] / self.rate
                    if phase >= 1 { phase -= 1 }
                    let s = Double(i) / self.rate
                    let env = min(1, s / 0.008) * min(1, max(0, (tone[2] - s) / 0.02))
                    out[start + i] += Float((phase < 0.5 ? 1 : -1) * tone[3] * env)
                }
            }
            let player = AVAudioPlayerNode()
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)
            try? engine.start()
            player.scheduleBuffer(pcm) {
                DispatchQueue.main.async {
                    engine.detach(player)
                    self.giveBackSpeaker()
                }
            }
            player.play()
            call.resolve()
        }
    }

    @objc func pinApp(_ call: CAPPluginCall) { call.resolve() }
    @objc func unpinApp(_ call: CAPPluginCall) { call.resolve() }

    /** The loudspeaker, whatever else is connected; counted so a chirp during the siren doesn't hand it back early. */
    private func takeSpeaker() -> AVAudioEngine? {
        let session = AVAudioSession.sharedInstance()
        if users == 0 {
            saved = (session.category, session.mode, session.categoryOptions)
            do {
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
                try session.setActive(true)
                try session.overrideOutputAudioPort(.speaker)
            } catch {
                return nil
            }
        }
        users += 1
        if engine == nil { engine = AVAudioEngine() }
        return engine
    }

    private func giveBackSpeaker() {
        users = max(0, users - 1)
        guard users == 0 else { return }
        engine?.stop()
        engine = nil
        let session = AVAudioSession.sharedInstance()
        try? session.overrideOutputAudioPort(.none)
        if let previous = saved {
            try? session.setCategory(previous.0, mode: previous.1, options: previous.2)
        }
        saved = nil
    }
}
