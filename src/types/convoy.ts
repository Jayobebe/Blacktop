export interface ConvoyMember {
  id: string;
  name: string;
  avatar?: string;
  isLeader: boolean;
  isSpeaking: boolean;
  isOnline: boolean;
  currentSpeed: number;
  topSpeed: number;
  distanceDriven: number;
  joinedAt: Date;
}

export interface Convoy {
  id: string;
  name: string;
  code: string;
  members: ConvoyMember[];
  destination?: Destination;
  createdAt: Date;
  totalDistance: number;
  groupTopSpeed: number;
}

export interface Destination {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  setBy: string;
  setAt: Date;
}

export interface ConvoyStats {
  groupDistance: number;
  groupTopSpeed: number;
  personalDistance: number;
  personalTopSpeed: number;
  averageSpeed: number;
  tripDuration: number;
}
