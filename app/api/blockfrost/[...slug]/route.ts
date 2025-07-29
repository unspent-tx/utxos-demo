import { createAppRouterHandler } from "@/lib/universal-api-handler";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  return createAppRouterHandler(request, params);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  return createAppRouterHandler(request, params);
}
