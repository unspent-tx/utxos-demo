// Universal API Handler - Works in Next.js App Router, Pages Router, and standalone Node.js

export interface BlockfrostRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface UniversalResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
}

export interface UniversalContext {
  params: Record<string, any>;
}

// Core business logic - environment agnostic
export async function handleBlockfrostRequest(
  request: BlockfrostRequest,
  context: UniversalContext
): Promise<UniversalResponse> {
  try {
    const { params } = context;
    const slug = params.slug || [];
    const network = slug[0];

    // Network configuration
    const networkConfig = getNetworkConfig(network);
    if (!networkConfig.key) {
      return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: { error: `Missing Blockfrost API key for network: ${network}` },
      };
    }

    // Construct endpoint
    const endpointPath = slug.slice(1).join("/") || "";
    const queryString = getQueryString(request.url);
    const endpoint = endpointPath + queryString;

    // Set headers
    const headers: Record<string, string> = {
      project_id: networkConfig.key,
    };

    if (endpointPath === "tx/submit" || endpointPath === "utils/txs/evaluate") {
      headers["Content-Type"] = "application/cbor";
    } else {
      headers["Content-Type"] = "application/json";
    }

    // Forward request to Blockfrost
    const url = `${networkConfig.baseUrl}/${endpoint}`;
    const blockfrostResponse = await fetch(url, {
      method: request.method,
      headers,
      body: request.method !== "GET" ? request.body : undefined,
    });

    // Handle 404 for UTXOs as empty wallet
    if (blockfrostResponse.status === 404 && endpointPath.includes("/utxos")) {
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: [],
      };
    }

    // Handle errors
    if (!blockfrostResponse.ok) {
      const errorBody = await blockfrostResponse.text();
      return {
        status: blockfrostResponse.status,
        headers: { "Content-Type": "application/json" },
        body: {
          error: `Blockfrost API error: ${blockfrostResponse.status} ${blockfrostResponse.statusText}`,
          details: errorBody,
        },
      };
    }

    // Handle CBOR endpoints
    if (endpointPath === "utils/txs/evaluate" || endpointPath === "tx/submit") {
      const responseData = await blockfrostResponse.text();
      return {
        status: blockfrostResponse.status,
        headers: { "Content-Type": "application/json" },
        body: responseData,
      };
    }

    // Handle JSON responses
    const responseData = await blockfrostResponse.json();
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: responseData,
    };
  } catch (error: unknown) {
    console.error("Blockfrost API route error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: errorMessage },
    };
  }
}

// Helper functions
function getQueryString(url: string): string {
  const qIndex = url.indexOf("?");
  return qIndex !== -1 ? url.substring(qIndex) : "";
}

function getNetworkConfig(network: string): {
  key: string | undefined;
  baseUrl: string;
} {
  switch (network) {
    case "mainnet":
      return {
        key: process.env.BLOCKFROST_API_KEY_MAINNET,
        baseUrl: "https://cardano-mainnet.blockfrost.io/api/v0",
      };
    default: // preprod
      return {
        key: process.env.BLOCKFROST_API_KEY_PREPROD,
        baseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
      };
  }
}

// ============================================================================
// ENVIRONMENT ADAPTERS EXAMPLES
// ============================================================================

// Next.js App Router
// app/api/blockfrost/[...slug]/route.ts

// export async function GET(
//   request: Request,
//   { params }: { params: Promise<{ slug: string[] }> }
// ) {
//   return createAppRouterHandler(request, params);
// }

// export async function POST(
//   request: Request,
//   { params }: { params: Promise<{ slug: string[] }> }
// ) {
//   return createAppRouterHandler(request, params);
// }
export async function createAppRouterHandler(
  request: Request,
  params: Promise<{ slug: string[] }>
) {
  const resolvedParams = await params;

  const blockfrostRequest: BlockfrostRequest = {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    body: request.method !== "GET" ? await request.text() : undefined,
  };

  const context: UniversalContext = {
    params: resolvedParams,
  };

  const response = await handleBlockfrostRequest(blockfrostRequest, context);

  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: response.headers,
  });
}
