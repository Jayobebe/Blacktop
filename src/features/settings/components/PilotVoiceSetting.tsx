import { useEffect } from 'react';
import { Radio, Download, Trash2, X, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { tr } from '@/lib/i18n';
import { speak } from '@/features/map';
import {
  usePilotVoice,
  downloadPilotVoice,
  cancelPilotVoiceDownload,
  removePilotVoice,
  warmPilotVoice,
} from '@/lib/pilotVoice';
import { PixelLoader } from '@/components/PixelLoader';

function mb(bytes: number) {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/**
 * Settings control for the pilot voice (lib/pilotVoice): download it for the
 * app's language, watch the download, or remove it.
 */
export function PilotVoiceSetting() {
  const pv = usePilotVoice();
  // Start the engine as soon as the setting is on screen, so the first radio check is quick and in the pilot's voice.
  useEffect(() => {
    if (pv.status === 'installed') warmPilotVoice();
  }, [pv.status]);
  if (pv.status === 'unsupported') return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Radio className="w-4 h-4 text-accent" />
        <p className="text-[10px] text-accent uppercase tracking-widest font-semibold">{tr("Pilot Voice")}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {pv.status === 'unavailable'
          ? tr("There's no pilot voice for your language yet, so radio calls use your phone's voice.")
          : tr("A male pilot voice for radio calls (Cockpit and Rally directions, hazard and camera calls), made on your phone so it works offline. Without it, radio calls use your phone's voice.")}
      </p>

      {pv.status === 'none' && (
        <>
          <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void downloadPilotVoice()}>
            <Download className="w-4 h-4 mr-2" />
            {tr("Download ({0})", [mb(pv.bytes)])}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1">
            {pv.error ? tr("Download failed. Check your connection and try again.") : tr("Best on Wi-Fi.")}
          </p>
        </>
      )}

      {pv.status === 'downloading' && (
        <div className="mt-2 flex items-center gap-2">
          <PixelLoader className="w-4 h-4 text-accent shrink-0" />
          <Progress value={Math.round(pv.progress * 100)} className="h-2 flex-1" />
          <span className="text-xs font-mono text-muted-foreground w-10 text-right">{Math.round(pv.progress * 100)}%</span>
          <button type="button" onClick={cancelPilotVoiceDownload} className="p-1 text-muted-foreground" aria-label={tr("Cancel")}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {pv.status === 'installed' && (
        <>
          <p className="text-xs text-foreground mt-2">{tr("Downloaded ({0})", [mb(pv.bytes)])}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => speak(tr("Radio check. Blacktop, reading you loud and clear."), { interrupt: true, radio: true })}
            >
              <Play className="w-4 h-4 mr-2" />
              {tr("Radio check")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void removePilotVoice()}>
              <Trash2 className="w-4 h-4 mr-2" />
              {tr("Remove")}
            </Button>
          </div>
        </>
      )}
      <p className="text-[10px] text-muted-foreground/80 mt-2">{tr("Voices from the Piper project (CC0, public domain, M-AILABS and CC BY-SA voices), run with ONNX Runtime.")}</p>
    </div>
  );
}
