import { NextResponse } from 'next/server';
import type { RoiResponse } from '@/lib/types';
import { RoiRequestSchema } from '@/lib/validations';
import { methodNotAllowed, parseJsonBody } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const { data: rawBody, error: parseError } = await parseJsonBody(request);
  if (parseError) return parseError;

  const parsed = RoiRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.errors[0]?.message || 'Invalid input parameters',
        details: parsed.error.errors,
      },
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { monthlyTraffic, conversionRate, averageOrderValue } = parsed.data;
  const lift = 0.35; // 35% conversion lift benchmark

  const currentMonthlyRevenue = Math.round(monthlyTraffic * (conversionRate / 100) * averageOrderValue);
  const projectedConversionRate = Number((conversionRate * (1 + lift)).toFixed(2));
  const projectedMonthlyRevenue = Math.round(monthlyTraffic * (projectedConversionRate / 100) * averageOrderValue);
  const incrementalMonthlyRevenue = projectedMonthlyRevenue - currentMonthlyRevenue;
  const incrementalAnnualGain = incrementalMonthlyRevenue * 12;
  const projectedRoiMultiple = '4.2x';

  const monthlyTrajectory = Array.from({ length: 12 }, (_, i) => {
    const month = `M${i + 1}`;
    const progress = (i + 1) / 12;
    const revenue = Math.round(currentMonthlyRevenue + incrementalMonthlyRevenue * progress);
    return { month, revenue };
  });

  const responsePayload: RoiResponse = {
    currentMonthlyRevenue,
    projectedMonthlyRevenue,
    projectedConversionRate,
    incrementalMonthlyRevenue,
    incrementalAnnualGain,
    projectedRoiMultiple,
    monthlyTrajectory,
  };

  return NextResponse.json(responsePayload, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(): Promise<Response> {
  return methodNotAllowed(['POST']);
}

export async function PUT(): Promise<Response> {
  return methodNotAllowed(['POST']);
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed(['POST']);
}

export async function PATCH(): Promise<Response> {
  return methodNotAllowed(['POST']);
}
