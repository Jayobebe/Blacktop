export interface ConvoyState {
  id: string | null;
  code: string | null;
  isLeader: boolean;
  members: ConvoyMemberInfo[];
  isActive: boolean;
}

export interface ConvoyMemberInfo {
  id: string;
  name: string;
  isLeader: boolean;
  isReady: boolean;
  joinedAt: string;
}
