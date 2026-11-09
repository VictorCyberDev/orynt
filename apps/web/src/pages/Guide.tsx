import { Link } from "react-router-dom";
import { Card, Note } from "../components/ui";
import { useSession } from "../api";

export function Guide() {
  const { me } = useSession();
  return (
    <div className="page narrow">
      <h1>First-use guide</h1>
      <p className="lede">Orynt sits between your decision to pay and your Lightning wallet. It never holds your money. Here is what that means.</p>
      <Card title="Three steps to a working demo" id="g1">
        <ol className="steps">
          <li><strong>Connect a wallet.</strong> Use the <em>practice wallet</em> to explore with no funds, or connect a Lightning node on regtest (a test network).{me ? <> <Link to="/connections">Open wallets</Link></> : null}</li>
          <li><strong>Create your approval key.</strong> Approvers sign each payment with a key stored in their browser. Orynt checks the signature; it cannot forge it.{me ? <> <Link to="/settings">Open settings</Link></> : null}</li>
          <li><strong>Make a payout.</strong> Paste an invoice, have someone else approve it, send it once, and download a receipt.{me ? <> <Link to="/payouts/new">New payout</Link></> : null}</li>
        </ol>
      </Card>
      <Card title="What permissions you give your wallet" id="g2">
        <p>Orynt asks your wallet to <strong>pay invoices</strong> and to <strong>look up payments</strong>. For LND we recommend a credential that can only do those two things (offchain read/write) — never your admin credential. Orynt checks what the credential can do and tells you if it is too weak. It cannot tell you if it is <em>too strong</em>.</p>
      </Card>
      <Card title="Who holds the keys" id="g3">
        <p>Your wallet holds your funds and keys. Orynt stores the wallet credential you give it, encrypted at rest on the server. Policy limits and approvals are enforced by Orynt, not by the wallet: anyone who has the wallet credential directly can still spend within what the wallet allows.</p>
      </Card>
      <Card title="Test network, kept separate" id="g4">
        <p>This version refuses mainnet by default. A payment on regtest is a real Lightning payment between real software, but of worthless test coins. The practice wallet is a simulator: receipts from it are labelled <em>Simulated</em> and can never be mistaken for a real settlement.</p>
      </Card>
      <Note tone="warn" title="What Orynt cannot guarantee.">That the work was done, that the recipient is who the invoice says, that nobody paid the same person elsewhere, or that a receipt is legal proof of a contract. A receipt proves a specific Lightning payment was settled with a specific preimage, nothing more.</Note>
    </div>
  );
}
