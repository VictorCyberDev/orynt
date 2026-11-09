// 5. After settlement, download the signed receipt and keep it.
import { writeFileSync } from "node:fs";

const settled = await orynt.obligations.get(draft.id);
if (settled.payment) {
  const receipt = await orynt.payments.receipt(settled.payment.id);
  writeFileSync("receipt.json", JSON.stringify(receipt, null, 2));
}
