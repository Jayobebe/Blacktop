import { useState, useEffect, useCallback } from 'react';

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

const AUDIO_INPUT_KEY = 'blacktop_audio_input';
const AUDIO_OUTPUT_KEY = 'blacktop_audio_output';

export function useAudioDevices() {
  const [audioInputs, setAudioInputs] = useState<AudioDevice[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<AudioDevice[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>(() => 
    localStorage.getItem(AUDIO_INPUT_KEY) || 'default'
  );
  const [selectedOutput, setSelectedOutput] = useState<string>(() => 
    localStorage.getItem(AUDIO_OUTPUT_KEY) || 'default'
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Check if audio output selection is supported (not on Safari/iOS)
  const supportsOutputSelection = 'setSinkId' in HTMLAudioElement.prototype;

  const refreshDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Need to request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          // Stop immediately - we just needed permission
          stream.getTracks().forEach(track => track.stop());
        })
        .catch(() => {
          // Permission denied or no mic - continue anyway to list available
        });

      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const inputs: AudioDevice[] = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 4)}`,
          kind: 'audioinput' as const,
        }));
      
      const outputs: AudioDevice[] = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${d.deviceId.slice(0, 4)}`,
          kind: 'audiooutput' as const,
        }));

      setAudioInputs(inputs);
      setAudioOutputs(outputs);

      // Validate saved selections still exist
      const savedInput = localStorage.getItem(AUDIO_INPUT_KEY);
      if (savedInput && !inputs.find(d => d.deviceId === savedInput)) {
        setSelectedInput('default');
        localStorage.setItem(AUDIO_INPUT_KEY, 'default');
      }

      const savedOutput = localStorage.getItem(AUDIO_OUTPUT_KEY);
      if (savedOutput && !outputs.find(d => d.deviceId === savedOutput)) {
        setSelectedOutput('default');
        localStorage.setItem(AUDIO_OUTPUT_KEY, 'default');
      }

      console.log('[AudioDevices] Found inputs:', inputs.length, 'outputs:', outputs.length);
    } catch (err) {
      console.error('[AudioDevices] Error enumerating devices:', err);
      setError('Could not access audio devices');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load and listen for device changes
  useEffect(() => {
    refreshDevices();

    // Listen for device changes (Bluetooth connect/disconnect)
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  const selectInput = useCallback((deviceId: string) => {
    setSelectedInput(deviceId);
    localStorage.setItem(AUDIO_INPUT_KEY, deviceId);
    console.log('[AudioDevices] Selected input:', deviceId);
  }, []);

  const selectOutput = useCallback((deviceId: string) => {
    setSelectedOutput(deviceId);
    localStorage.setItem(AUDIO_OUTPUT_KEY, deviceId);
    console.log('[AudioDevices] Selected output:', deviceId);
  }, []);

  return {
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
  };
}
