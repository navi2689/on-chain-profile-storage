import "./globals.css";

export const metadata = {
  title: "On-Chain Profile Storage | Stellar Soroban dApp",
  description:
    "A decentralized Web3 application for storing, retrieving, and searching personal profiles on the Stellar Soroban blockchain.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
