import { NextResponse } from 'next/server';
import { demoFloodPolygons, demoGauges, demoPumps, demoRoadIncidents, demoShelters } from '@/packages/risk/demo-data';

export async function GET() {
  return NextResponse.json({
    floodPolygons: demoFloodPolygons,
    shelters: demoShelters,
    pumpStations: demoPumps,
    riverGauges: demoGauges,
    roadIncidents: demoRoadIncidents,
  });
}
