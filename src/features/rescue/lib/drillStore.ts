// The drill runs from one host mounted in App.tsx, outside every sheet and
// dialog: started from inside Home's safety sheet, its screens sat outside the
// sheet, which blocks taps outside itself and closed (taking the drill with it)
// when they were tapped.
let drillOpen = false;
export const drillListeners = new Set<() => void>();
function setDrillOpen(v: boolean) {
  drillOpen = v;
  drillListeners.forEach((l) => l());
}
export const closeDrill = () => setDrillOpen(false);

/** Starts a drill (its intro screen) from anywhere. */
export function openRescueDrill() {
  setDrillOpen(true);
}


export const isDrillOpen = () => drillOpen;
