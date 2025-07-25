import { NextResponse } from "next/server";

// Helper to extract query parameters from the request URL.
function getQueryString(url: string): string {
  const qIndex = url.indexOf("?");
  return qIndex !== -1 ? url.substring(qIndex) : "";
}

// Shared logic for handling requests
async function handleRequest(
  request: Request,
  method: string,
  params: { slug: string[] }
) {
  try {
    const slug = params.slug;
    const network = slug[0];

    // Map network to API key and base URL
    let key: string | undefined;
    let baseUrl: string;

    switch (network) {
      case "testnet":
        key = process.env.BLOCKFROST_API_KEY_TESTNET;
        baseUrl = "https://cardano-testnet.blockfrost.io/api/v0";
        break;
      case "mainnet":
        key = process.env.BLOCKFROST_API_KEY_MAINNET;
        baseUrl = "https://cardano-mainnet.blockfrost.io/api/v0";
        break;
      case "preview":
        key = process.env.BLOCKFROST_API_KEY_PREVIEW;
        baseUrl = "https://cardano-preview.blockfrost.io/api/v0";
        break;
      case "preprod":
      default:
        key = process.env.BLOCKFROST_API_KEY_PREPROD;
        baseUrl = "https://cardano-preprod.blockfrost.io/api/v0";
        break;
    }

    // Check if API key is available
    if (!key) {
      console.error(`Missing Blockfrost API key for network: ${network}`);

      // For development, provide a helpful message
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json(
          {
            error: `Missing Blockfrost API key for network: ${network}`,
            message:
              "Please add BLOCKFROST_API_KEY_PREPROD to your .env.local file",
            instructions: [
              "1. Get a free API key from https://blockfrost.io/",
              "2. Add BLOCKFROST_API_KEY_PREPROD=your_api_key to .env.local",
              "3. Restart your development server",
            ],
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          error: `Missing Blockfrost API key for network: ${network}`,
          message: "Please check your environment variables",
        },
        { status: 500 }
      );
    }

    // Construct the endpoint
    const endpointPath = slug.slice(1).join("/") || "";
    const queryString = getQueryString(request.url);
    const endpoint = endpointPath + queryString;

    // Set headers
    const headers: Record<string, string> = {
      project_id: key,
    };

    let body: string | Uint8Array | undefined;

    if (method === "POST") {
      if (endpointPath === "tx/submit") {
        const requestBody = await request.text();
        headers["Content-Type"] = "application/cbor";
        body = requestBody;
      } else if (endpointPath === "utils/txs/evaluate") {
        const requestBody = await request.text();
        headers["Content-Type"] = "application/cbor";
        body = requestBody;
      } else {
        headers["Content-Type"] = "application/json";
        body = await request.text();
      }
    } else {
      headers["Content-Type"] = "application/json";
    }

    // Forward the request to Blockfrost
    const url = `${baseUrl}/${endpoint}`;
    // console.log(`Forwarding to Blockfrost URL: ${url}`);

    const blockfrostResponse = await fetch(url, {
      method,
      headers,
      body,
    });

    // Debug response status
    // console.log(
    //   `Blockfrost response status: ${blockfrostResponse.status} ${blockfrostResponse.statusText}`
    // );

    // Handle 404 errors gracefully for empty wallets (UTXOs)
    if (blockfrostResponse.status === 404 && endpointPath.includes("/utxos")) {
      console.log(`Address has no UTXOs (new wallet): ${url}`);
      return NextResponse.json([]);
    }

    // Handle response
    if (!blockfrostResponse.ok) {
      try {
        const errorBody = await blockfrostResponse.text();
        console.error(`Blockfrost API error response: ${errorBody}`);
        return NextResponse.json(
          {
            error: `Blockfrost API error: ${blockfrostResponse.status} ${blockfrostResponse.statusText}`,
            details: errorBody,
          },
          { status: blockfrostResponse.status }
        );
      } catch (errorParseError) {
        console.error(
          `Error parsing Blockfrost error response: ${errorParseError}`
        );
        return NextResponse.json(
          {
            error: `Blockfrost API error: ${blockfrostResponse.status} ${blockfrostResponse.statusText}`,
          },
          { status: blockfrostResponse.status }
        );
      }
    }

    if (endpointPath === "utils/txs/evaluate" || endpointPath === "tx/submit") {
      const responseData = await blockfrostResponse.text(); // CBOR endpoints return raw text
      return new NextResponse(responseData, {
        status: blockfrostResponse.status,
        headers: { "Content-Type": "application/json" }, // Adjust based on Blockfrost response
      });
    } else {
      const responseData = await blockfrostResponse.json();
      return NextResponse.json(responseData);
    }
  } catch (error: unknown) {
    console.error("Blockfrost API route error:", error);

    // Handle 404 errors for UTXOs as empty wallet (normal case)
    if (
      error instanceof Error &&
      error.message.includes("404") &&
      error.message.includes("/utxos")
    ) {
      console.log(`Address has no UTXOs (new wallet): ${error.message}`);
      return NextResponse.json([]);
    }

    // Provide details about the error
    const errorMessage =
      error instanceof Error
        ? `${error.message}\n${error.stack}`
        : String(error);

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// Handle GET requests
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  return handleRequest(request, "GET", await params);
}

// Handle POST requests (for tx evaluation and submission)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  return handleRequest(request, "POST", await params);
}
