"use client";
import { CardanoWallet, useWallet } from "@meshsdk/react";
import { BlockfrostProvider } from "@meshsdk/core";
import { useState, useEffect } from "react";

// const provider = new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY); // Quick start method (insecure)
const provider = new BlockfrostProvider(`/api/blockfrost/preprod/`);

interface Utxo {
  output: {
    amount: Array<{
      unit: string;
      quantity: string;
    }>;
  };
}

export default function WalletConnection() {
  const { wallet, connected, connecting } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch wallet balance when connected
  useEffect(() => {
    async function fetchBalance(): Promise<void> {
      if (connected && wallet) {
        try {
          const utxos: Utxo[] = await wallet.getUtxos();
          const totalLovelace: number = utxos.reduce(
            (sum: number, utxo: Utxo) => {
              const lovelace = utxo.output.amount.find(
                (asset) => asset.unit === "lovelace"
              );
              return sum + parseInt(lovelace?.quantity || "0");
            },
            0
          );
          setBalance(totalLovelace / 1_000_000);
        } catch (err) {
          setError("Failed to fetch balance");
          console.error(err);
        }
      }
    }

    fetchBalance();
  }, [connected, wallet]);

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <h2 className="mb-4 text-xl font-bold">Wallet Connection</h2>

      {!connected ? (
        <div>
          <p className="mb-4 text-gray-600">
            Connect your wallet to start using the application
          </p>
          <CardanoWallet
            web3Services={{
              networkId: 0,
              fetcher: provider,
              submitter: provider,
              projectId: process.env.NEXT_PUBLIC_UTXOS_PROJECT_ID,
              appUrl: "https://staging.utxos.dev",
            }}
          />
          {connecting && (
            <p className="mt-2 text-blue-600">Connecting wallet...</p>
          )}
        </div>
      ) : (
        <div>
          <p className="font-medium text-green-600">✅ Wallet Connected</p>
          {balance !== null && (
            <p className="mt-2">Balance: {balance.toFixed(2)} ADA</p>
          )}
          {error && <p className="mt-2 text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
