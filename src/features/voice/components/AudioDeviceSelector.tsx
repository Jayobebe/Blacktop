import { RefreshCw, Mic, Volume2, Bluetooth } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAudioDevices, AudioDevice } from '../hooks/useAudioDevices';
import { cn } from '@/lib/utils';

interface AudioDeviceSelectorProps {
  className?: string;
}

function DeviceButton({ 
  device, 
  isSelected, 
  onClick 
}: { 
  device: AudioDevice; 
  isSelected: boolean; 
  onClick: () => void;
}) {
  // Check if it looks like a Bluetooth device
  const isBluetooth = device.label.toLowerCase().includes('bluetooth') ||
    device.label.toLowerCase().includes('cardo') ||
    device.label.toLowerCase().includes('sena') ||
    device.label.toLowerCase().includes('headset') ||
    device.label.toLowerCase().includes('hands-free') ||
    device.label.toLowerCase().includes('wireless');

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left",
        isSelected
          ? "border-accent/40 bg-accent/10"
          : "border-border/30 bg-card/30 hover:bg-card/50"
      )}
    >
      {isBluetooth ? (
        <Bluetooth className={cn("w-4 h-4 flex-shrink-0", isSelected ? "text-accent" : "text-muted-foreground")} />
      ) : device.kind === 'audioinput' ? (
        <Mic className={cn("w-4 h-4 flex-shrink-0", isSelected ? "text-accent" : "text-muted-foreground")} />
      ) : (
        <Volume2 className={cn("w-4 h-4 flex-shrink-0", isSelected ? "text-accent" : "text-muted-foreground")} />
      )}
      <span className={cn(
        "text-sm font-medium truncate",
        isSelected ? "text-accent" : "text-foreground"
      )}>
        {device.label}
      </span>
    </button>
  );
}

export function AudioDeviceSelector({ className }: AudioDeviceSelectorProps) {
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
  } = useAudioDevices();

  if (error) {
    return (
      <div className={cn("space-y-3", className)}>
        <p className="text-sm text-destructive">{error}</p>
        <Button
          onClick={refreshDevices}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Microphone Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Microphone</p>
          <Button
            onClick={refreshDevices}
            variant="ghost"
            size="sm"
            disabled={isLoading}
            className="h-7 px-2"
          >
            <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
          </Button>
        </div>
        <div className="space-y-2">
          {audioInputs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No microphones found</p>
          ) : (
            audioInputs.map(device => (
              <DeviceButton
                key={device.deviceId}
                device={device}
                isSelected={selectedInput === device.deviceId}
                onClick={() => selectInput(device.deviceId)}
              />
            ))
          )}
        </div>
      </div>

      {/* Speaker Selection */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Speaker</p>
        <div className="space-y-2">
          {audioOutputs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No speakers found</p>
          ) : (
            audioOutputs.map(device => (
              <DeviceButton
                key={device.deviceId}
                device={device}
                isSelected={selectedOutput === device.deviceId}
                onClick={() => selectOutput(device.deviceId)}
              />
            ))
          )}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Connect your Bluetooth intercom first, then refresh to see it here.
      </p>
    </div>
  );
}
