declare module "lucide-react" {
  import type * as React from "react";

  export type LucideIcon = React.ComponentType<
    React.SVGProps<SVGSVGElement> & { size?: string | number }
  >;

  export const Activity: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const BadgeCheck: LucideIcon;
  export const BadgeDollarSign: LucideIcon;
  export const Banknote: LucideIcon;
  export const BarChart3: LucideIcon;
  export const Check: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const CircleDollarSign: LucideIcon;
  export const ClipboardCheck: LucideIcon;
  export const Clock3: LucideIcon;
  export const Copy: LucideIcon;
  export const Download: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const FileCheck2: LucideIcon;
  export const FileSearch: LucideIcon;
  export const FileText: LucideIcon;
  export const Globe2: LucideIcon;
  export const Info: LucideIcon;
  export const Landmark: LucideIcon;
  export const LayoutDashboard: LucideIcon;
  export const LockKeyhole: LucideIcon;
  export const LogOut: LucideIcon;
  export const Menu: LucideIcon;
  export const Play: LucideIcon;
  export const Plus: LucideIcon;
  export const QrCode: LucideIcon;
  export const RadioTower: LucideIcon;
  export const Search: LucideIcon;
  export const Settings: LucideIcon;
  export const ShieldCheck: LucideIcon;
  export const Sparkles: LucideIcon;
  export const TrendingUp: LucideIcon;
  export const Users: LucideIcon;
  export const Wallet: LucideIcon;
  export const WalletCards: LucideIcon;
  export const X: LucideIcon;
  export const XCircle: LucideIcon;
  export const Zap: LucideIcon;
}

declare module "framer-motion" {
  import type * as React from "react";

  export const AnimatePresence: React.ComponentType<React.PropsWithChildren<Record<string, unknown>>>;
  export const motion: Record<string, React.ComponentType<any>>;
}

declare module "@solana/web3.js" {
  export type Commitment = "processed" | "confirmed" | "finalized";

  export class PublicKey {
    constructor(value: string | Uint8Array | PublicKey);
    toBase58(): string;
    toBuffer(): Buffer;
    toBytes(): Uint8Array;
    equals(publicKey: PublicKey): boolean;
    static findProgramAddressSync(seeds: Array<Buffer | Uint8Array>, programId: PublicKey): [PublicKey, number];
  }

  export class Keypair {
    publicKey: PublicKey;
    secretKey: Uint8Array;
    static fromSecretKey(secretKey: Uint8Array): Keypair;
  }

  export class Transaction {
    feePayer?: PublicKey;
    recentBlockhash?: string;
    instructions: unknown[];
    add(...items: unknown[]): Transaction;
    sign(...signers: Keypair[]): void;
    partialSign(...signers: Keypair[]): void;
    serialize(options?: unknown): Buffer;
  }

  export class SendTransactionError extends Error {
    logs?: string[];
    getLogs(connection: Connection): Promise<string[] | undefined>;
  }

  export class Connection {
    constructor(endpoint: string, config?: unknown);
    getAccountInfo(publicKey: PublicKey): Promise<{ owner: PublicKey; executable?: boolean } | null>;
    getParsedTokenAccountsByOwner(owner: PublicKey, filter: unknown): Promise<any>;
    getTokenAccountBalance(publicKey: PublicKey): Promise<{ value: { amount: string } }>;
    getLatestBlockhash(commitment?: Commitment): Promise<any>;
    confirmTransaction(strategy: unknown, commitment?: Commitment): Promise<any>;
    sendTransaction(transaction: Transaction, signers: Keypair[], options?: unknown): Promise<string>;
    sendRawTransaction(rawTransaction: Buffer | Uint8Array, options?: unknown): Promise<string>;
  }

  export const SystemProgram: {
    programId: PublicKey;
  };

  export const SYSVAR_RENT_PUBKEY: PublicKey;

  export function clusterApiUrl(network: string): string;
}
