export interface ConvoyDestination {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface ConvoyState {
  id: string | null;
  code: string | null;
  isLeader: boolean;
  members: ConvoyMemberInfo[];
  isActive: boolean;
  destination: ConvoyDestination | null;
}

export interface ConvoyMemberInfo {
  id: string;
  name: string;
  isLeader: boolean;
  isReady: boolean;
  joinedAt: string;
}
