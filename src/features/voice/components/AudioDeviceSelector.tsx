import { RefreshCw, Mic, Volume2, Bluetooth } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAudioDevices, AudioDevice } from '../hooks/useAudioDevices';
import { cn } from '@/lib/utils';

interface AudioDeviceSelectorProps {
  className?: string;
  compact?: boolean;
}

function DeviceButton({ 
  device, 
  isSelected, 
  onClick,
  compact = false,
}: { 
  device: AudioDevice; 
  isSelected: boolean; 
  onClick: () => void;
  compact?: boolean;
}) {
  // Check if it looks like a Bluetooth device
  const isBluetooth = device.label.toLowerCase().includes('bluetooth') ||
    device.label.toLowerCase().includes('headset') ||
    device.label.toLowerCase().includes('hands-free') ||
    device.label.toLowerCase().includes('wireless') ||
    device.label.toLowerCase().includes('airpods') ||
    device.label.toLowerCase().includes('buds') ||
    // Common intercom brands
    device.label.toLowerCase().includes('cardo') ||
    device.label.toLowerCase().includes('sena') ||
    device.label.toLowerCase().includes('uclear') ||
    device.label.toLowerCase().includes('lexin');

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 rounded-xl border transition-colors text-left",
        compact ? "p-2" : "p-3",
        isSelected
          ? "border-accent/40 bg-accent/10"
          : "border-border/30 bg-card/30 hover:bg-card/50"
      )}
    >
      {isBluetooth ? (
        <Bluetooth className={cn("flex-shrink-0", compact ? "w-3 h-3" : "w-4 h-4", isSelected ? "text-accent" : "text-muted-foreground")} />
      ) : device.kind === 'audioinput' ? (
        <Mic className={cn("flex-shrink-0", compact ? "w-3 h-3" : "w-4 h-4", isSelected ? "text-accent" : "text-muted-foreground")} />
      ) : (
        <Volume2 className={cn("flex-shrink-0", compact ? "w-3 h-3" : "w-4 h-4", isSelected ? "text-accent" : "text-muted-foreground")} />
      )}
      <span className={cn(
        "font-medium truncate",
        compact ? "text-xs" : "text-sm",
        isSelected ? "text-accent" : "text-foreground"
      )}>
        {device.label}
      </span>
    </button>
  );
}

export function AudioDeviceSelector({ className, compact = false }: AudioDeviceSelectorProps) {
  const {
    audioInputs,
    audioOutputs,
    selectedInput,
    selectedOutput,
    selectInput,
    selectOutput,
    refreshDevices,
    isLoading,
    error,
    supportsOutputSelection,
  } = useAudioDevices();

  if (error) {
    return (
      <div className={cn("space-y-2", className)}>
        <p className="text-xs text-destructive">{error}</p>
        <Button
          onClick={refreshDevices}
          variant="outline"
          size="sm"
          className="w-full h-8"
        >
          <RefreshCw className="w-3 h-3 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Microphone Selection */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Microphone</p>
          <Button
            onClick={refreshDevices}
            variant="ghost"
            size="sm"
            disabled={isLoading}
            className="h-6 px-2"
          >
            <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
          </Button>
        </div>
        <div className="space-y-1.5">
          {audioInputs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No microphones found</p>
          ) : (
            audioInputs.map(device => (
              <DeviceButton
                key={device.deviceId}
                device={device}
                isSelected={selectedInput === device.deviceId}
                onClick={() => selectInput(device.deviceId)}
                compact={compact}
              />
            ))
          )}
        </div>
      </div>

      {/* Speaker Selection - only show if browser supports it */}
      {supportsOutputSelection ? (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Speaker</p>
          <div className="space-y-1.5">
            {audioOutputs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No speakers found</p>
            ) : (
              audioOutputs.map(device => (
                <DeviceButton
                  key={device.deviceId}
                  device={device}
                  isSelected={selectedOutput === device.deviceId}
                  onClick={() => selectOutput(device.deviceId)}
                  compact={compact}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="bg-muted/50 rounded-xl p-3 border border-border/30">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Speaker</p>
          <p className="text-xs text-muted-foreground">
            Your browser doesn't support speaker selection. Audio will play through your phone's current output device.
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            Tip: Set your Bluetooth as system audio in phone settings.
          </p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Connect Bluetooth first, then tap refresh.
      </p>
    </div>
  );
}
