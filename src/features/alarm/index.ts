export { AlarmOverlay } from './components/AlarmOverlay';
export { AlarmButton } from './components/AlarmButton';
export { PatternGateDialog } from './components/PatternGateDialog';
export { requestPattern } from './lib/patternGate';
export { armAlarm, disarmAlarm, startRescueSiren, setRescuePosition } from './lib/arm';
export { useAlarm, isAlarmOn } from './lib/alarmStore';
export { hasAlarmPattern, clearAlarmPattern } from './lib/pattern';
export type { AlarmSensitivity } from './lib/detector';
