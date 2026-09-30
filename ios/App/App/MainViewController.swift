import Capacitor

/// The app's bridge (set as the Bridge View Controller's class in Main.storyboard),
/// so the app's own plugins can be registered alongside the npm ones.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AlarmSoundPlugin())
    }
}
