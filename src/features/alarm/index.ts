export { AlarmOverlay } from './components/AlarmOverlay';
export { AlarmButton } from './components/AlarmButton';
export { armAlarm, disarmAlarm, startRescueSiren } from './lib/arm';
export { useAlarm, isAlarmOn } from './lib/alarmStore';
export { hasAlarmPattern, clearAlarmPattern } from './lib/pattern';
export type { AlarmSensitivity } from './lib/detector';
