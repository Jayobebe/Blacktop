export type TankCurrency = 'NIM' | 'USDT';

export type TankRequestStatus = 'open' | 'approved' | 'rejected' | 'expired' | 'settled';

export interface TankSummaryRow {
  currency: TankCurrency;
  pledged: number;
  paid_out: number;
  balance: number;
  member_count: number;
  my_pledged: number;
}

export interface TankPledgeRow {
  display_name: string;
  currency: TankCurrency;
  total: number;
  last_at: string;
}

export interface TankRequestRow {
  id: string;
  requester_id: string;
  requester_name: string;
  payout_address: string;
  currency: TankCurrency;
  amount: number;
  reason: string;
  status: TankRequestStatus;
  expires_at: string;
  created_at: string;
  yes_votes: number;
  no_votes: number;
  votes_needed: number;
  is_mine: boolean;
  my_vote: boolean | null;
  my_share: number;
  my_settled: boolean;
}

export interface TankPlace {
  lat: number;
  lng: number;
  label: string;
}
