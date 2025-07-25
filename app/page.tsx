"use client";
import { useState } from "react";
import {
  BlockfrostProvider,
  OfflineFetcher,
  ForgeScript,
  MeshTxBuilder,
  resolveScriptHash,
  stringToHex,
  hexToString,
} from "@meshsdk/core";
import {
  Web3Wallet,
  EnableWeb3WalletOptions,
  Web3AuthProvider,
} from "@meshsdk/web3-sdk";
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
interface BlockfrostUtxo {
  output_index: number;
  tx_hash: string;
  address: string;
  amount: Array<{
    unit: string;
    quantity: string;
  }>;
}

const blockchainProvider = new BlockfrostProvider(`/api/blockfrost/preprod/`, {
  enableCaching: true,
  offlineFetcher: new OfflineFetcher(),
});

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [walletInfo, setWalletInfo] = useState<any>(null);
  const [network, setNetwork] = useState("preprod");
  const [projectId, setProjectId] = useState(
    "08555581-f3ad-401d-8ca2-d678687b4574"
  );
  const [chain, setChain] = useState("cardano");
  const [directTo, setDirectTo] = useState<Web3AuthProvider | null>(null);
  const [utxos, setUtxos] = useState<any[]>([]);

  const options = {
    networkId: network === "mainnet" ? 1 : 0,
    projectId: projectId || "testnet",
    chain: chain,
  };

  const connectWallet = async () => {
    try {
      setLoading(true);
      setStatus("Connecting wallet...");

      const walletOptions: EnableWeb3WalletOptions = {
        networkId: options.networkId as 0 | 1,
        projectId: options.projectId,
        fetcher: blockchainProvider,
        submitter: blockchainProvider,
        appUrl: "https://staging.utxos.dev",
        chain: chain as "cardano" | "bitcoin",
        directTo: directTo || undefined,
      };

      const enabledWallet = await Web3Wallet.enable(walletOptions);
      const address = await enabledWallet.getChangeAddress();

      setWalletInfo(enabledWallet);
      setStatus("Wallet connected successfully!");
    } catch (error) {
      console.error("Wallet connection error:", error);
      setStatus(
        `Error connecting wallet: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const testBlockchainProvider = async () => {
    try {
      setLoading(true);
      setStatus("Testing blockchain provider...");
      const networkInfo = await blockchainProvider.fetchLatestBlock();
      setStatus(
        `Blockchain provider working! Latest block hash: ${networkInfo.hash.substring(
          0,
          20
        )}...${networkInfo.hash.substring(networkInfo.hash.length - 8)}`
      );
    } catch (error) {
      console.error("Blockchain provider error:", error);
      setStatus(
        `Error testing blockchain provider: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchUtxos = async (address: string) => {
    try {
      const response = await fetch(
        `/api/blockfrost/${network}/addresses/${address}/utxos`
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch UTXOs: ${response.status} ${response.statusText}`
        );
      }
      const blockfrostUtxos: BlockfrostUtxo[] = await response.json();
      setUtxos(blockfrostUtxos);
      return blockfrostUtxos;
    } catch (error) {
      console.error("Error fetching UTXOs:", error);
      throw error;
    }
  };

  const parseAssetName = (unit: string) => {
    try {
      const policyId = unit.substring(0, 56);
      const assetNameHex = unit.substring(56);

      if (assetNameHex.length === 0) {
        return `${policyId} (No Asset Name)`;
      }

      try {
        const assetName = hexToString(assetNameHex);
        return `${policyId} (${assetName})`;
      } catch (hexError) {
        return `${policyId} (${assetNameHex})`;
      }
    } catch (error) {
      return unit;
    }
  };

  const getWalletBalance = async () => {
    try {
      setLoading(true);
      setStatus("Fetching wallet balance...");

      if (!walletInfo) throw new Error("Wallet not connected");

      const changeAddress = await walletInfo.getChangeAddress();
      await fetchUtxos(changeAddress);
      setStatus("Balance fetched successfully!");
    } catch (error) {
      console.error("Balance fetching error:", error);
      setStatus(
        `Error fetching balance: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const testTransactionBuilding = async () => {
    try {
      setLoading(true);
      setStatus("Testing transaction building...");

      if (!walletInfo) {
        throw new Error("Wallet not connected");
      }
      const changeAddress = await walletInfo.getChangeAddress();
      const blockfrostUtxos = await fetchUtxos(changeAddress);

      // Transform Blockfrost UTXOs to Mesh SDK expected format
      const meshUtxos = blockfrostUtxos.map((utxo) => ({
        input: {
          outputIndex: utxo.output_index,
          txHash: utxo.tx_hash,
        },
        output: {
          address: utxo.address,
          amount: utxo.amount,
        },
      }));

      const forgingScript = ForgeScript.withOneSignature(changeAddress);

      const demoAssetMetadata = {
        name: "Book#165",
        image: "ipfs://QmRzicpReutwCkM6aotuKjErFCUD213DpwPq6ByuzMJaua",
        mediaType: "image/jpg",
        description: "This is a demo book.",
      };

      const policyId = resolveScriptHash(forgingScript);
      const tokenName = "UTXOS token";
      const tokenNameHex = stringToHex(tokenName);
      const metadata = {
        [policyId]: { [tokenName]: { ...demoAssetMetadata } },
      };

      const txBuilder = new MeshTxBuilder({
        fetcher: blockchainProvider,
        verbose: true,
      });

      txBuilder
        .mint("1", policyId, tokenNameHex)
        .mintingScript(forgingScript)
        .metadataValue(721, metadata)
        .txOut(changeAddress, [
          { unit: policyId + tokenNameHex, quantity: "1" },
        ])
        .changeAddress(changeAddress)
        .selectUtxosFrom(meshUtxos);

      const unsignedTx = await txBuilder.complete();
      const signedTx = await walletInfo.signTx(unsignedTx);
      const submittedTx = await blockchainProvider.submitTx(signedTx);

      setStatus(
        `Transaction built successfully! Policy ID: ${policyId}, Token: ${tokenName}`
      );
    } catch (error) {
      console.error("Transaction building error:", error);
      setStatus(
        `Error building transaction: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  // Calculate ADA balance
  const adaBalance =
    utxos.reduce((total, utxo) => {
      const adaAmount = utxo.amount.find((a: any) => a.unit === "lovelace");
      return total + (adaAmount ? parseInt(adaAmount.quantity) : 0);
    }, 0) / 1000000;

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <header className="text-center py-8">
          <img
            src="/utxos-logo.png"
            alt="UTXOS"
            className="max-w-48 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-black mb-2">
            SDK Test Interface
          </h1>
          <p className="text-neutral-600">
            Test blockchain interactions and wallet connections
          </p>
        </header>

        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col items-center justify-between">
                <span className="text-xs font-cartographer uppercase text-neutral-600">
                  Wallet Status
                </span>
                <Badge
                  variant={walletInfo ? "default" : "destructive"}
                  className="text-sm mt-1"
                >
                  {walletInfo ? "Connected" : "Disconnected"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col items-center justify-between">
                <span className="text-xs font-cartographer uppercase text-neutral-600">
                  ADA Balance
                </span>
                <span className="font-mono text-2xl">
                  {adaBalance.toFixed(0)} ADA
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col items-center justify-between">
                <span className="text-xs font-cartographer uppercase text-neutral-600">
                  UTXO Count
                </span>
                <span className="font-mono text-2xl">{utxos.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col items-center justify-between">
                <span className="text-xs font-cartographer uppercase text-neutral-600">
                  Network
                </span>
                <span className="font-mono text-xl capitalize">{network}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Wallet Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Wallet Controls</CardTitle>
              <CardDescription>
                Connect and interact with your wallet
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={connectWallet}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Connecting..." : "Connect Wallet"}
              </Button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  onClick={getWalletBalance}
                  disabled={loading || !walletInfo}
                  variant="outline"
                >
                  Get Balance
                </Button>
                <Button
                  onClick={testBlockchainProvider}
                  disabled={loading}
                  variant="outline"
                >
                  Test Blockfrost
                </Button>
                <Button
                  onClick={testTransactionBuilding}
                  disabled={loading || !walletInfo}
                  variant="outline"
                >
                  Test Transaction
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Configure network and connection settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Network</label>
                  <Select value={network} onValueChange={setNetwork}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select network" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preprod">Preprod (Testnet)</SelectItem>
                      <SelectItem value="preview">Preview</SelectItem>
                      <SelectItem value="testnet">Testnet</SelectItem>
                      <SelectItem value="mainnet">Mainnet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Chain</label>
                  <Select value={chain} onValueChange={setChain}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select chain" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cardano">Cardano</SelectItem>
                      <SelectItem value="bitcoin">Bitcoin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Project ID</label>
                  <Input
                    type="text"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    placeholder="Enter your project ID"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Direct To</label>
                  <Select
                    value={directTo || "none"}
                    onValueChange={(value) =>
                      setDirectTo(
                        value === "none" ? null : (value as Web3AuthProvider)
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="discord">Discord</SelectItem>
                      <SelectItem value="twitter">Twitter</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                      <SelectItem value="apple">Apple</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Information */}
          <Card>
            <CardHeader>
              <CardTitle>Status Information</CardTitle>
              <CardDescription>
                Current system status and connection state
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        loading ? "bg-yellow-500 animate-pulse" : "bg-green-500"
                      }`}
                    />
                    <span className="font-medium">System Status</span>
                  </div>
                  <Badge variant={loading ? "secondary" : "outline"}>
                    {loading ? "Processing..." : "Idle"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        walletInfo ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <span className="font-medium">Wallet Connection</span>
                  </div>
                  <Badge variant={walletInfo ? "default" : "destructive"}>
                    {walletInfo ? "Connected" : "Disconnected"}
                  </Badge>
                </div>

                <div className="p-3 bg-neutral-50 rounded-lg">
                  <p className="text-sm text-neutral-600 mb-1">
                    Latest Message:
                  </p>
                  <p className="text-sm break-words">
                    {status || "Ready to test blockchain interactions..."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* UTXOs Table */}
          {utxos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>UTXOs</CardTitle>
                <CardDescription>
                  Detailed view of all unspent transaction outputs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>UTXO</TableHead>
                        <TableHead>Transaction Hash</TableHead>
                        <TableHead>Output Index</TableHead>
                        <TableHead>Amounts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {utxos.map((utxo, index) => (
                        <TableRow key={`${utxo.tx_hash}-${utxo.output_index}`}>
                          <TableCell className="font-medium">
                            UTXO #{index + 1}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <code className="bg-neutral-100 px-2 py-1 rounded text-xs">
                              {utxo.tx_hash.substring(0, 20)}...
                              {utxo.tx_hash.substring(utxo.tx_hash.length - 8)}
                            </code>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{utxo.output_index}</Badge>
                          </TableCell>
                          <TableCell className="space-y-1">
                            {utxo.amount.map(
                              (amount: any, amountIndex: number) => (
                                <div key={amountIndex}>
                                  {amount.unit === "lovelace" ? (
                                    <Badge
                                      variant="default"
                                      className="text-xs"
                                    >
                                      {(
                                        parseInt(amount.quantity) / 1000000
                                      ).toFixed(2)}{" "}
                                      ADA
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {parseInt(
                                        amount.quantity
                                      ).toLocaleString()}{" "}
                                      {parseAssetName(amount.unit)}
                                    </Badge>
                                  )}
                                </div>
                              )
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
