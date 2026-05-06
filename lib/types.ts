export type RiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskCell = {
  cellId: string;
  gu: string;
  center: { lat: number; lng: number };
  bbox: [number, number, number, number];
  score: number;
  level: RiskLevel;
  updatedAt: string;
  inputs: RiskInputs;
};

export type RiskInputs = {
  rain10m: number;
  rain30m: number;
  rain60m: number;
  riverRatio: number;
  drainSaturation: number;
  drainRise: number;
  floodOverlay: number;
  roadIncident: number;
};

export type Shelter = {
  id: string;
  name: string;
  gu: string;
  lat: number;
  lng: number;
  capacity?: number;
};

export type PumpStation = {
  id: string;
  name: string;
  gu: string;
  lat: number;
  lng: number;
};

export type RiverGauge = {
  id: string;
  name: string;
  gu: string;
  lat: number;
  lng: number;
  ratio: number;
};

export type CitizenReport = {
  id: string;
  gu: string;
  lat: number;
  lng: number;
  depthStep: 'ankle' | 'knee' | 'thigh' | 'above';
  mobilityBlock: string[];
  memo?: string;
  photoUrl?: string;
  createdAt: string;
};

export type FloodPolygon = {
  id: string;
  name: string;
  gu: string;
  coordinates: Array<{ lat: number; lng: number }>;
};

export type RoadIncident = {
  id: string;
  title: string;
  gu: string;
  lat: number;
  lng: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type ApiHealth = {
  provider: string;
  status: 'ok' | 'degraded' | 'error';
  lastSuccessAt?: string;
  failureCount1h: number;
  message: string;
};
